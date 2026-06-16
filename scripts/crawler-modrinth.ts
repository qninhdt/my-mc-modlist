import zlib from "zlib";
import {
  db,
  getOrCreateCategory,
  getOrCreateAuthor,
  getOrCreateLoader,
  getOrCreateMinecraftVersion
} from "./crawler-db";

const MODRINTH_BASE_URL = "https://api.modrinth.com/v2";

const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json"
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") || res.headers.get("X-Ratelimit-Reset");
        const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
        console.warn(`[Modrinth Rate Limited] Waiting ${delaySeconds} seconds...`);
        await sleep(delaySeconds * 1000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err: any) {
      if (attempt === retries) {
        throw err;
      }
      const backoff = attempt * 2000;
      console.warn(`[Modrinth Fetch Error] Attempt ${attempt} failed: ${err.message}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }
}

function isGameVersionAtLeast116(version: string): boolean {
  const match = version.match(/^1\.(\d+)/);
  if (match) {
    return parseInt(match[1], 10) >= 16;
  }
  return false;
}

// 1. Modrinth category tags discovery
async function getModrinthCategories(): Promise<{ name: string; slug: string }[]> {
  try {
    const list = await fetchWithRetry(`${MODRINTH_BASE_URL}/tag/category`);
    if (Array.isArray(list)) {
      return list
        .filter((item: any) => item.project_type === "mod")
        .map((item: any) => ({
          name: item.name,
          slug: item.name // Category tag has name which acts as its slug/identifier
        }));
    }
  } catch (err: any) {
    console.error("[Modrinth] Failed to fetch category tags:", err.message);
  }
  return [];
}

// 2. Discover Project IDs
async function discoverModrinthProjectIds(categories: { name: string; slug: string }[]): Promise<string[]> {
  const discoveredIds = new Set<string>();

  // Chunked categories discovery
  for (const cat of categories) {
    let offset = 0;
    const limit = 100;
    console.log(`[Modrinth] Discovering projects in category: ${cat.name} (${cat.slug})...`);

    while (true) {
      const facets = encodeURIComponent(
        JSON.stringify([["project_type:mod"], [`categories:${cat.slug}`]])
      );
      const url = `${MODRINTH_BASE_URL}/search?facets=${facets}&limit=${limit}&offset=${offset}`;
      
      try {
        const res = await fetchWithRetry(url);
        if (!res || !res.hits || res.hits.length === 0) break;

        for (const hit of res.hits) {
          if (hit.project_id) {
            discoveredIds.add(hit.project_id);
          }
        }

        const totalHits = res.total_hits || 0;
        offset += limit;

        if (offset >= totalHits || offset + limit > 10000) {
          break; // Reach limit or Modrinth search boundary
        }
        await sleep(350);
      } catch (err: any) {
        console.error(`[Modrinth Search Error] Category ${cat.slug}: ${err.message}`);
        break;
      }
    }
  }

  // Also do a general popular discovery run to catch uncategorized mods
  let offset = 0;
  const limit = 100;
  console.log("[Modrinth] Performing general discovery run for top projects...");
  while (offset < 5000) { // Fetch top 5,000 mods
    const facets = encodeURIComponent(JSON.stringify([["project_type:mod"]]));
    const url = `${MODRINTH_BASE_URL}/search?facets=${facets}&limit=${limit}&offset=${offset}&index=downloads`;
    try {
      const res = await fetchWithRetry(url);
      if (!res || !res.hits || res.hits.length === 0) break;

      for (const hit of res.hits) {
        if (hit.project_id) {
          discoveredIds.add(hit.project_id);
        }
      }
      offset += limit;
      await sleep(350);
    } catch (err: any) {
      console.error(`[Modrinth Search Error] General search: ${err.message}`);
      break;
    }
  }

  return Array.from(discoveredIds);
}

// 3. Mod Details & Relational Writes in Batches of 100
export async function crawlModrinth(forceAll = false) {
  console.log("\n--- Starting Modrinth Relational Crawler ---");
  
  // Load existing mods in DB to check for last updated times
  const existingModsRes = await db.execute("SELECT id, updated FROM mods WHERE modrinth_id IS NOT NULL");
  const existingModsUpdated = new Map<string, string>();
  for (const r of existingModsRes.rows) {
    existingModsUpdated.set(r.id as string, r.updated as string || "");
  }

  const categories = await getModrinthCategories();
  console.log(`[Modrinth] Found ${categories.length} category tags.`);

  const allProjectIds = await discoverModrinthProjectIds(categories);
  console.log(`[Modrinth] Discovered ${allProjectIds.length} unique project IDs.`);

  if (allProjectIds.length === 0) {
    console.log("[Modrinth] No project IDs discovered. Skipping details fetch.");
    return;
  }

  const batchSize = 100;
  const totalBatches = Math.ceil(allProjectIds.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const batchIds = allProjectIds.slice(i * batchSize, (i + 1) * batchSize);
    console.log(`[Modrinth] Processing batch ${i + 1}/${totalBatches} (${batchIds.length} mods)...`);

    try {
      const idsParam = JSON.stringify(batchIds);
      const projectsUrl = `${MODRINTH_BASE_URL}/projects?ids=${encodeURIComponent(idsParam)}`;
      const projects = await fetchWithRetry(projectsUrl);

      if (!Array.isArray(projects)) {
        console.warn(`[Modrinth] Batch ${i + 1} did not return projects array. Skipping.`);
        continue;
      }

      // Collect team IDs from this batch to fetch authors
      const teamIds = Array.from(new Set(projects.map((p: any) => p.team).filter(Boolean)));
      const teamMap = new Map<string, any[]>();
      if (teamIds.length > 0) {
        try {
          const teamsParam = JSON.stringify(teamIds);
          const teamsUrl = `${MODRINTH_BASE_URL}/teams?ids=${encodeURIComponent(teamsParam)}`;
          const teams = await fetchWithRetry(teamsUrl);
          if (Array.isArray(teams)) {
            for (const t of teams) {
              if (t.id && t.members) {
                teamMap.set(t.id, t.members);
              }
            }
          }
        } catch (e: any) {
          console.error("[Modrinth] Failed to batch fetch teams:", e.message);
        }
      }

      // --- OPTIMIZATION (Solution 1): Batch fetch versions for the entire projects batch ---
      const allVersionIdsToFetch: string[] = [];
      const projectsNeedingVersions = new Set<string>();

      for (const p of projects) {
        const modId = p.id;
        const storedUpdated = existingModsUpdated.get(modId);
        const needsVersions = forceAll || !storedUpdated || storedUpdated !== p.updated;

        if (needsVersions && Array.isArray(p.versions) && p.versions.length > 0) {
          // Slice to newest 50 versions to keep crawl fast and avoid database ballooning
          const versionsToFetch = p.versions.slice(0, 50);
          allVersionIdsToFetch.push(...versionsToFetch);
          projectsNeedingVersions.add(modId);
        }
      }

      const versionsMap = new Map<string, any[]>(); // project_id -> versions[]
      if (allVersionIdsToFetch.length > 0) {
        console.log(`[Modrinth] Batch fetching ${allVersionIdsToFetch.length} versions for ${projectsNeedingVersions.size} mods...`);
        const vBatchSize = 100;
        const totalVBatches = Math.ceil(allVersionIdsToFetch.length / vBatchSize);
        
        for (let j = 0; j < totalVBatches; j++) {
          const vBatch = allVersionIdsToFetch.slice(j * vBatchSize, (j + 1) * vBatchSize);
          try {
            await sleep(200); // Polite rate-limiting delay
            const vUrl = `${MODRINTH_BASE_URL}/versions?ids=${encodeURIComponent(JSON.stringify(vBatch))}`;
            const versionsList = await fetchWithRetry(vUrl);
            if (Array.isArray(versionsList)) {
              for (const v of versionsList) {
                const projectId = v.project_id;
                if (projectId) {
                  if (!versionsMap.has(projectId)) {
                    versionsMap.set(projectId, []);
                  }
                  versionsMap.get(projectId)!.push(v);
                }
              }
            }
          } catch (vErr: any) {
            console.error(`[Modrinth] Failed to fetch version batch ${j + 1}/${totalVBatches}:`, vErr.message);
          }
        }
      }
      // --- END OPTIMIZATION ---

      // For each project, save it relationally
      for (const p of projects) {
        const modId = p.id;
        const needsVersions = projectsNeedingVersions.has(modId);

        let versions = versionsMap.get(modId) || [];
        if (needsVersions) {
          versions = versions.filter((v: any) =>
            isGameVersionAtLeast116(v.game_versions || [])
          );
        }

        // Prepare statements for this mod
        const statements: any[] = [];

        // Compress long markdown description
        const bodyCompressed = p.body
          ? zlib.deflateSync(Buffer.from(p.body, "utf-8"))
          : null;

        // Donate URL
        let donateUrl = null;
        if (Array.isArray(p.donation_urls) && p.donation_urls.length > 0) {
          donateUrl = p.donation_urls[0].url || null;
        }

        // Insert/Replace into mods
        statements.push({
          sql: `
            INSERT OR REPLACE INTO mods (
              id, modrinth_id, name, slug, summary, description, description_compressed,
              thumbnail_url, download_count, popularity_rank, latest_release_date,
              last_modified, last_updated, page_url, modrinth_url, discord_url,
              source_url, issues_url, wiki_url, donate_url, client_side, server_side,
              published, updated, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            modId,
            modId,
            p.title,
            p.slug,
            p.description || "",
            p.body || null,
            bodyCompressed,
            p.icon_url || null,
            p.downloads || 0,
            p.followers || 0,
            null,
            p.updated || null,
            p.updated || null,
            `https://modrinth.com/mod/${p.slug}`,
            `https://modrinth.com/mod/${p.slug}`,
            p.discord_url || null,
            p.source_url || null,
            p.issues_url || null,
            p.wiki_url || null,
            donateUrl,
            p.client_side || "unknown",
            p.server_side || "unknown",
            p.published || null,
            p.updated || null,
            new Date().toISOString()
          ]
        });

        // Categories mapping
        if (Array.isArray(p.categories)) {
          statements.push({
            sql: "DELETE FROM mod_categories WHERE mod_id = ?",
            args: [modId]
          });
          for (const catSlug of p.categories) {
            const catObj = categories.find(c => c.slug === catSlug);
            const catName = catObj ? catObj.name : catSlug;
            const categoryId = await getOrCreateCategory(catName, catSlug);
            statements.push({
              sql: "INSERT OR IGNORE INTO mod_categories (mod_id, category_id) VALUES (?, ?)",
              args: [modId, categoryId]
            });
          }
        }

        // Authors mapping
        const teamMembers = teamMap.get(p.team) || [];
        if (teamMembers.length > 0) {
          statements.push({
            sql: "DELETE FROM mod_authors WHERE mod_id = ?",
            args: [modId]
          });
          for (const m of teamMembers) {
            if (m.user && m.user.username) {
              const authorName = m.user.name || m.user.username;
              const authorId = await getOrCreateAuthor(
                authorName,
                m.user.username,
                `https://modrinth.com/user/${m.user.username}`,
                m.user.avatar_url
              );
              statements.push({
                sql: "INSERT OR IGNORE INTO mod_authors (mod_id, author_id, role) VALUES (?, ?, ?)",
                args: [modId, authorId, m.role || null]
              });
            }
          }
        }

        // Versions mapping
        if (needsVersions && versions.length > 0) {
          const versionIds = versions.map(v => v.id);
          for (const vId of versionIds) {
            statements.push({ sql: "DELETE FROM version_loaders WHERE version_id = ?", args: [vId] });
            statements.push({ sql: "DELETE FROM version_minecraft_versions WHERE version_id = ?", args: [vId] });
            statements.push({ sql: "DELETE FROM mod_versions WHERE id = ?", args: [vId] });
          }

          for (const v of versions) {
            const changelogText = v.changelog || "";
            const primaryFile = v.files?.find((f: any) => f.primary) || v.files?.[0];
            const filesize = primaryFile ? primaryFile.size : 0;

            statements.push({
              sql: `
                INSERT OR REPLACE INTO mod_versions (
                  id, mod_id, name, version_number, type, filesize, uploaded_at, downloads, changelog
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              args: [
                v.id,
                modId,
                v.name,
                v.version_number,
                v.version_type,
                filesize,
                v.date_published,
                v.downloads || 0,
                changelogText
              ]
            });

            if (Array.isArray(v.loaders)) {
              for (const loader of v.loaders) {
                const loaderId = await getOrCreateLoader(loader);
                statements.push({
                  sql: "INSERT OR IGNORE INTO version_loaders (version_id, loader_id) VALUES (?, ?)",
                  args: [v.id, loaderId]
                });
              }
            }

            if (Array.isArray(v.game_versions)) {
              for (const gameVer of v.game_versions) {
                const verId = await getOrCreateMinecraftVersion(gameVer);
                statements.push({
                  sql: "INSERT OR IGNORE INTO version_minecraft_versions (version_id, minecraft_version_id) VALUES (?, ?)",
                  args: [v.id, verId]
                });
              }
            }
          }
        }

        try {
          await db.batch(statements, "write");
        } catch (e: any) {
          console.error(`[Modrinth DB Error] Failed to write mod ${p.slug}:`, e.message);
        }
      }

      projects.length = 0;
      teamMap.clear();
      versionsMap.clear();
      
      if (global && typeof (global as any).gc === "function") {
        (global as any).gc();
      }

      await sleep(350);
    } catch (batchErr: any) {
      console.error(`[Modrinth Batch Error] Batch ${i + 1} failed:`, batchErr.message);
    }
  }

  console.log("Modrinth detailed crawl and relational mapping complete!");
}
