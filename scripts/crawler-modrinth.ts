import zlib from "zlib";
import fs from "fs";
import path from "path";
import {
  db,
  getOrCreateCategory,
  getOrCreateAuthor,
  getOrCreateLoader,
  getOrCreateMinecraftVersion,
  isMinecraftVersionAllowed
} from "./crawler-db";


const MODRINTH_BASE_URL = "https://api.modrinth.com/v2";

const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = 10): Promise<any> {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json"
  };
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP_${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000 * attempt);
    }
  }
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

const CACHE_FILE = path.join(process.cwd(), "data", "modrinth_project_ids_cache.json");

// 2. Discover Project IDs
async function discoverModrinthProjectIds(
  categories: { name: string; slug: string }[],
  refreshCache = false
): Promise<string[]> {
  if (!refreshCache && fs.existsSync(CACHE_FILE)) {
    try {
      const cachedData = fs.readFileSync(CACHE_FILE, "utf-8");
      const ids = JSON.parse(cachedData);
      if (Array.isArray(ids) && ids.length > 0) {
        console.log(`[Modrinth] Loaded ${ids.length} cached project IDs from ${CACHE_FILE}`);
        return ids;
      }
    } catch (err: any) {
      console.warn(`[Modrinth] Failed to read project IDs cache: ${err.message}. Re-running discovery.`);
    }
  }

  const discoveredIds = new Set<string>();
  const totalCats = categories.length;
  let finishedCatsCount = 0;

  console.log("[Modrinth] Starting project discovery across categories (concurrent)...");

  function drawDiscoveryProgress() {
    const percentage = (finishedCatsCount / totalCats) * 100;
    const barWidth = 20;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = Math.max(0, barWidth - filledWidth);
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const progressLine =
      `\r[MR Search ${barStr}] ${percentage.toFixed(1)}% | ` +
      `Cats: ${finishedCatsCount}/${totalCats} | ` +
      `Found: ${discoveredIds.size} unique mods`;
    process.stdout.write("\r\x1b[K" + progressLine);
  }

  drawDiscoveryProgress();

  const catQueue = [...categories];

  async function worker() {
    while (catQueue.length > 0) {
      const cat = catQueue.shift();
      if (!cat) break;

      let offset = 0;
      const limit = 100;

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

          // Limit category pagination to top 10000 projects to keep discovery fast and avoid low-quality mods
          if (offset >= totalHits || offset >= 10000 || offset + limit > 10000) {
            break; // Reach limit or Modrinth search boundary
          }
          await sleep(50);
        } catch (err: any) {
          process.stdout.write("\n");
          console.error(`[Modrinth Search Error] Category ${cat.slug}: ${err.message}`);
          break;
        }
      }

      finishedCatsCount++;
      drawDiscoveryProgress();
    }
  }

  // Run 2 workers in parallel for category discovery
  await Promise.all(Array.from({ length: 2 }, () => worker()));

  // Also do a general popular discovery run to catch uncategorized mods
  let offset = 0;
  const limit = 100;
  console.log("\n[Modrinth] Performing general discovery run for top projects...");
  while (offset < 10000) {
    const percentage = (offset / 10000) * 100;
    const barWidth = 20;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = Math.max(0, barWidth - filledWidth);
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const progressLine =
      `\r[MR General ${barStr}] ${percentage.toFixed(1)}% | ` +
      `Offset: ${offset}/10000 | ` +
      `Found: ${discoveredIds.size} unique mods`;
    process.stdout.write("\r\x1b[K" + progressLine);

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
      await sleep(50);
    } catch (err: any) {
      process.stdout.write("\n");
      console.error(`[Modrinth Search Error] General search: ${err.message}`);
      break;
    }
  }
  process.stdout.write("\n");

  const idsArray = Array.from(discoveredIds);
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(idsArray, null, 2), "utf-8");
    console.log(`[Modrinth] Saved ${idsArray.length} discovered project IDs to cache: ${CACHE_FILE}`);
  } catch (err: any) {
    console.error(`[Modrinth] Failed to save project IDs cache: ${err.message}`);
  }

  return idsArray;
}

// 3. Mod Details & Relational Writes in Batches of 100
export async function crawlModrinth(forceAll = false, refreshCache = false, onlyMissing = false, onlyMissingVersions = false) {
  console.log("\n--- Starting Modrinth Relational Crawler ---");
  
  // Load existing mods in DB to check for last updated times and existing version counts
  const existingModsRes = await db.execute(`
    SELECT m.id, m.updated, COUNT(v.id) as version_count 
    FROM mods m 
    LEFT JOIN mod_versions v ON m.id = v.mod_id 
    WHERE m.modrinth_id IS NOT NULL 
    GROUP BY m.id
  `);
  const existingModsInfo = new Map<string, { updated: string; versionCount: number }>();
  for (const r of existingModsRes.rows) {
    existingModsInfo.set(r.id as string, {
      updated: (r.updated as string) || "",
      versionCount: Number(r.version_count || 0),
    });
  }

  const categories = await getModrinthCategories();
  console.log(`[Modrinth] Found ${categories.length} category tags.`);

  let allProjectIds: string[] = [];

  if (onlyMissingVersions) {
    console.log("[Modrinth] Querying database for Modrinth projects with missing versions...");
    const missingRes = await db.execute(`
      SELECT m.modrinth_id 
      FROM mods m
      WHERE m.modrinth_id IS NOT NULL 
      AND NOT EXISTS (
        SELECT 1 FROM mod_versions v WHERE v.mod_id = m.id
      )
    `);
    allProjectIds = missingRes.rows.map((r) => r.modrinth_id as string).filter(Boolean);
    console.log(`[Modrinth] Found ${allProjectIds.length} Modrinth projects with 0 versions in database.`);
  } else if (onlyMissing) {
    console.log("[Modrinth] Querying database for missing Modrinth projects...");
    const missingRes = await db.execute(
      "SELECT modrinth_id FROM mods WHERE modrinth_id IS NOT NULL AND modrinth_url IS NULL"
    );
    allProjectIds = missingRes.rows.map((r) => r.modrinth_id as string).filter(Boolean);
    console.log(`[Modrinth] Found ${allProjectIds.length} missing Modrinth projects in database.`);
  } else {
    allProjectIds = await discoverModrinthProjectIds(categories, refreshCache);
    console.log(`[Modrinth] Discovered ${allProjectIds.length} unique project IDs.`);
  }

  if (allProjectIds.length === 0) {
    console.log("[Modrinth] No project IDs to crawl. Skipping details fetch.");
    return;
  }

  const batchSize = 100;
  const totalBatches = Math.ceil(allProjectIds.length / batchSize);
  const totalMods = allProjectIds.length;
  let processedCount = 0;
  const startTime = Date.now();

  function formatTime(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s}s`;
  }

  function drawProgressBar() {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = processedCount / (elapsed || 0.1);
    const remaining = totalMods - processedCount;
    const eta = speed > 0 ? remaining / speed : 0;
    const percentage = (processedCount / totalMods) * 100;

    if ((global as any).isParallelCrawl) {
      if (processedCount % 200 === 0 || processedCount === totalMods) {
        console.log(`[Modrinth Progress] ${percentage.toFixed(1)}% | Mods: ${processedCount}/${totalMods} | Speed: ${speed.toFixed(1)} m/s | ETA: ${formatTime(eta)}`);
      }
      return;
    }

    const barWidth = 20;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = Math.max(0, barWidth - filledWidth);
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const progressLine =
      `\r[MR Crawl ${barStr}] ${percentage.toFixed(1)}% | ` +
      `Mods: ${processedCount}/${totalMods} | ` +
      `Speed: ${speed.toFixed(1)} m/s | ` +
      `ETA: ${formatTime(eta)}`;

    process.stdout.write("\r\x1b[K" + progressLine);
  }

  function logInfo(msg: string) {
    process.stdout.write("\r\x1b[K"); // Clear line
    console.log(msg);
    drawProgressBar();
  }

  function logWarn(msg: string) {
    process.stdout.write("\r\x1b[K"); // Clear line
    console.warn(msg);
    drawProgressBar();
  }

  drawProgressBar();

  // Create queue of batch indices
  const batchQueue = Array.from({ length: totalBatches }, (_, i) => i);

  async function crawlWorker() {
    while (batchQueue.length > 0) {
      const i = batchQueue.shift();
      if (i === undefined) break;

      const batchIds = allProjectIds.slice(i * batchSize, (i + 1) * batchSize);

      try {
        const idsParam = JSON.stringify(batchIds);
        const projectsUrl = `${MODRINTH_BASE_URL}/projects?ids=${encodeURIComponent(idsParam)}`;
        const projects = await fetchWithRetry(projectsUrl);

        if (!Array.isArray(projects)) {
          logWarn(`[Modrinth] Batch ${i + 1} did not return projects array. Skipping.`);
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
            logWarn(`[Modrinth] Failed to batch fetch teams: ${e.message}`);
          }
        }

        // Batch fetch versions for the entire projects batch
        const allVersionIdsToFetch: string[] = [];
        const projectsNeedingVersions = new Set<string>();

        for (const p of projects) {
          const modId = p.id;
          const info = existingModsInfo.get(modId);
          const storedUpdated = info?.updated;
          const versionCount = info?.versionCount || 0;
          const needsVersions = forceAll || !storedUpdated || storedUpdated !== p.updated || versionCount === 0;

          if (needsVersions && Array.isArray(p.versions) && p.versions.length > 0) {
            allVersionIdsToFetch.push(...p.versions);
            projectsNeedingVersions.add(modId);
          }
        }

        const versionsMap = new Map<string, any[]>(); // project_id -> versions[]
        if (allVersionIdsToFetch.length > 0) {
          logInfo(`[Modrinth] Batch fetching ${allVersionIdsToFetch.length} versions for ${projectsNeedingVersions.size} mods...`);
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
              logWarn(`[Modrinth] Failed to fetch version batch ${j + 1}/${totalVBatches}: ${vErr.message}`);
            }
          }
        }

        // For each project, save it relationally
        for (const p of projects) {
          const modId = p.id;
          const needsVersions = projectsNeedingVersions.has(modId);
          const versions = versionsMap.get(modId) || [];

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

          // Insert/Replace into mods using ON CONFLICT to preserve parallel mpi_id/curse_id mappings
          statements.push({
            sql: `
              INSERT INTO mods (
                id, modrinth_id, name, slug, summary,
                thumbnail_url, download_count, popularity_rank, latest_release_date,
                last_modified, last_updated, page_url, modrinth_url, discord_url,
                source_url, issues_url, wiki_url, donate_url, client_side, server_side,
                published, updated, fetched_at, categories_json, loaders_json, versions_json, gallery_json
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                modrinth_id = excluded.modrinth_id,
                name = excluded.name,
                slug = excluded.slug,
                summary = excluded.summary,
                thumbnail_url = excluded.thumbnail_url,
                download_count = excluded.download_count,
                popularity_rank = excluded.popularity_rank,
                latest_release_date = COALESCE(excluded.latest_release_date, mods.latest_release_date),
                last_modified = excluded.last_modified,
                last_updated = excluded.last_updated,
                page_url = excluded.page_url,
                modrinth_url = excluded.modrinth_url,
                discord_url = excluded.discord_url,
                source_url = excluded.source_url,
                issues_url = excluded.issues_url,
                wiki_url = excluded.wiki_url,
                donate_url = excluded.donate_url,
                client_side = excluded.client_side,
                server_side = excluded.server_side,
                published = excluded.published,
                updated = excluded.updated,
                fetched_at = excluded.fetched_at,
                categories_json = excluded.categories_json,
                loaders_json = excluded.loaders_json,
                versions_json = excluded.versions_json,
                gallery_json = excluded.gallery_json
            `,
            args: [
              modId,
              modId,
              p.title,
              p.slug,
              p.description || "",
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
              new Date().toISOString(),
              JSON.stringify(p.categories || []),
              JSON.stringify(p.loaders || []),
              JSON.stringify(p.game_versions || []),
              JSON.stringify(p.gallery || [])
            ]
          });

          // Insert description compressed into mod_descriptions
          statements.push({
            sql: `
              INSERT INTO mod_descriptions (
                mod_id, description_compressed
              ) VALUES (?, ?)
              ON CONFLICT(mod_id) DO UPDATE SET
                description_compressed = excluded.description_compressed
            `,
            args: [
              modId,
              bodyCompressed
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
              const allowedGameVersions = Array.isArray(v.game_versions)
                ? v.game_versions.filter(isMinecraftVersionAllowed)
                : [];

              if (allowedGameVersions.length === 0 && Array.isArray(v.game_versions) && v.game_versions.length > 0) {
                continue;
              }

              const changelogText = v.changelog || "";
              const changelogCompressed = changelogText
                ? zlib.deflateSync(Buffer.from(changelogText, "utf-8"))
                : null;
              const primaryFile = v.files?.find((f: any) => f.primary) || v.files?.[0];
              const filesize = primaryFile ? primaryFile.size : 0;

              statements.push({
                sql: `
                  INSERT OR REPLACE INTO mod_versions (
                    id, mod_id, name, version_number, type, filesize, uploaded_at, downloads, changelog_compressed
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
                  changelogCompressed
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

              for (const gameVer of allowedGameVersions) {
                const verId = await getOrCreateMinecraftVersion(gameVer);
                statements.push({
                  sql: "INSERT OR IGNORE INTO version_minecraft_versions (version_id, minecraft_version_id) VALUES (?, ?)",
                  args: [v.id, verId]
                });
              }
            }
          }

          try {
            await db.batch(statements, "write");
          } catch (e: any) {
            logWarn(`[Modrinth DB Error] Failed to write mod ${p.slug}: ${e.message}`);
          }
        }

        projects.length = 0;
        teamMap.clear();
        versionsMap.clear();
        
        if (global && typeof (global as any).gc === "function") {
          (global as any).gc();
        }

      } catch (batchErr: any) {
        logWarn(`[Modrinth Batch Error] Batch ${i + 1} failed: ${batchErr.message}`);
      } finally {
        processedCount += batchIds.length;
        drawProgressBar();
      }

      await sleep(50); // Throttling delay per worker (proxies handle rate limiting)
    }
  }

  // Spawn 2 concurrent workers to fetch and write projects
  await Promise.all(Array.from({ length: 2 }, () => crawlWorker()));

  process.stdout.write("\n");
  console.log("Modrinth detailed crawl and relational mapping complete!");
}
