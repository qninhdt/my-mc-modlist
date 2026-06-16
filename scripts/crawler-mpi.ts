import {
  db,
  getOrCreateCategory,
  getOrCreateAuthor,
  getOrCreateMinecraftVersion
} from "./crawler-db";

const MPI_BASE_URL = "https://www.modpackindex.com/api/v1";

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
        console.warn(`[MPI Rate Limited] Waiting 10 seconds...`);
        await sleep(10000);
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
      console.warn(`[MPI Fetch Error] Attempt ${attempt} failed: ${err.message}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }
}

async function getMetadataVal(key: string): Promise<string | undefined> {
  const res = await db.execute({
    sql: "SELECT value FROM metadata WHERE key = ?",
    args: [key]
  });
  return res.rows[0]?.value as string | undefined;
}

export async function crawlModpackIndex(startPageArg?: string) {
  console.log("\n--- Starting ModpackIndex Relational Crawler ---");
  const metaVal = await getMetadataVal("last_fetched_page_mpi");
  
  let startPage = 1;
  if (startPageArg) {
    startPage = parseInt(startPageArg, 10);
    console.log(`Starting page overridden by flag to: ${startPage}`);
  } else if (metaVal) {
    startPage = Math.max(1, parseInt(metaVal, 10) - 1);
    console.log(`Resuming ModpackIndex crawl from page: ${startPage}`);
  }

  const limit = 100;
  let page = startPage;
  let totalPages = page;

  while (true) {
    console.log(`[ModpackIndex] Fetching page ${page}...`);
    let res;
    try {
      res = await fetchWithRetry(`${MPI_BASE_URL}/mods?page=${page}&limit=${limit}`);
    } catch (e: any) {
      console.error(`[ModpackIndex Error] Failed to fetch page ${page}: ${e.message}. Saving progress.`);
      break;
    }

    if (!res || !res.data || res.data.length === 0) {
      console.log("[ModpackIndex] No more data or empty response. Crawl complete!");
      break;
    }

    const totalMods = res.meta?.total || 0;
    totalPages = res.meta?.last_page || Math.ceil(totalMods / limit);

    // Process mods batch
    for (const mod of res.data) {
      const mpiId = mod.id;
      const curseId = mod.curse_info?.curse_id ?? null;
      const modrinthList = mod.modrinth_info || [];

      // Check if any mapped Modrinth project ID exists
      let mappedToModrinth = false;
      const statements: any[] = [];

      for (const mrInfo of modrinthList) {
        if (mrInfo.project_id) {
          // Check if this project already exists in our DB
          const existRes = await db.execute({
            sql: "SELECT id FROM mods WHERE id = ? OR modrinth_id = ?",
            args: [mrInfo.project_id, mrInfo.project_id]
          });

          if (existRes.rows.length > 0) {
            mappedToModrinth = true;
            // Update the existing Modrinth mod with mpi_id and curse_id
            statements.push({
              sql: "UPDATE mods SET mpi_id = ?, curse_id = ? WHERE id = ? OR modrinth_id = ?",
              args: [mpiId, curseId, mrInfo.project_id, mrInfo.project_id]
            });
          }
        }
      }

      // If not mapped/updated to an existing Modrinth project, and has CurseForge ID, treat as CF-only or new
      if (!mappedToModrinth && curseId) {
        const curseIdStr = String(curseId);
        
        // Insert/replace mod using CurseForge ID as mod ID
        statements.push({
          sql: `
            INSERT OR REPLACE INTO mods (
              id, mpi_id, curse_id, name, slug, summary, thumbnail_url,
              download_count, popularity_rank, latest_release_date,
              last_modified, last_updated, page_url, curseforge_url, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            curseIdStr,
            mpiId,
            curseId,
            mod.name,
            mod.slug,
            mod.summary || "",
            mod.thumbnail_url || null,
            mod.download_count || 0,
            mod.popularity_rank || 0,
            mod.latest_release_date || null,
            mod.last_modified || null,
            mod.last_updated || null,
            mod.page_url || "",
            mod.links?.curseforge || null,
            new Date().toISOString()
          ]
        });

        // Relate categories
        if (Array.isArray(mod.categories)) {
          statements.push({
            sql: "DELETE FROM mod_categories WHERE mod_id = ?",
            args: [curseIdStr]
          });
          for (const cat of mod.categories) {
            const catId = await getOrCreateCategory(cat.name, cat.slug);
            statements.push({
              sql: "INSERT OR IGNORE INTO mod_categories (mod_id, category_id) VALUES (?, ?)",
              args: [curseIdStr, catId]
            });
          }
        }

        // Relate authors
        if (Array.isArray(mod.authors)) {
          statements.push({
            sql: "DELETE FROM mod_authors WHERE mod_id = ?",
            args: [curseIdStr]
          });
          for (const aut of mod.authors) {
            const autId = await getOrCreateAuthor(aut.name, undefined, aut.url || undefined);
            statements.push({
              sql: "INSERT OR IGNORE INTO mod_authors (mod_id, author_id, role) VALUES (?, ?, ?)",
              args: [curseIdStr, autId, null]
            });
          }
        }
      }

      if (statements.length > 0) {
        try {
          await db.batch(statements, "write");
        } catch (dbErr: any) {
          console.error(`[MPI DB Error] Failed to write mod ${mod.slug}:`, dbErr.message);
        }
      }
    }

    // Save progress
    await db.execute({
      sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      args: ["last_fetched_page_mpi", String(page)]
    });
    console.log(`[ModpackIndex] Page ${page}/${totalPages} complete. Saved ${res.data.length} mods.`);

    if (page >= totalPages) {
      console.log("[ModpackIndex] Reached final page!");
      break;
    }

    page++;
    await sleep(1000); // Respect MPI 3,600 requests/hour limit
  }
}
