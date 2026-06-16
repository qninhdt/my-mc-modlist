import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import zlib from "zlib";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const MPI_BASE_URL = "https://www.modpackindex.com/api/v1";
const MODRINTH_BASE_URL = "https://api.modrinth.com/v2";

const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)";

console.log(`Using User-Agent: ${USER_AGENT}`);

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("Missing TURSO_DATABASE_URL environment variable!");
  process.exit(1);
}

// Initialize Turso Database Client
const db = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Check flags
const args = process.argv.slice(2);
const forceReset = args.includes("--reset");
const onlyModrinth = args.includes("--only-modrinth");
const onlyMpi = args.includes("--only-mpi");
const forceModrinth = args.includes("--force-modrinth");
const startPageArg = args.find(a => a.startsWith("--page="))?.split("=")[1];

// Setup Tables
async function initDb() {
  if (forceReset) {
    console.log("Flag --reset passed. Dropping existing tables on Turso...");
    await db.execute("DROP TABLE IF EXISTS metadata");
    await db.execute("DROP TABLE IF EXISTS modrinth_info");
    await db.execute("DROP TABLE IF EXISTS modrinth_projects");
    await db.execute("DROP TABLE IF EXISTS mods");
    await db.execute("DROP TABLE IF EXISTS curseforge_mod_files");
    await db.execute("DROP TABLE IF EXISTS curseforge_mods");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mods (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT,
      url TEXT,
      thumbnail_url TEXT,
      download_count INTEGER,
      popularity_rank INTEGER,
      latest_release_date TEXT,
      last_modified TEXT,
      last_updated TEXT,
      page_url TEXT,
      curse_id INTEGER,
      links_json TEXT,
      modrinth_info_json TEXT,
      authors_json TEXT,
      categories_json TEXT,
      versions_json TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS modrinth_info (
      mod_id INTEGER,
      project_id TEXT,
      slug TEXT,
      PRIMARY KEY (mod_id, project_id),
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS modrinth_projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      categories TEXT,
      loaders TEXT,
      game_versions TEXT,
      downloads INTEGER,
      followers INTEGER,
      icon_url TEXT,
      client_side TEXT,
      server_side TEXT,
      discord_url TEXT,
      source_url TEXT,
      issues_url TEXT,
      wiki_url TEXT,
      body_compressed BLOB,
      gallery_json TEXT,
      published TEXT,
      updated TEXT,
      updated_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS curseforge_mods (
      id INTEGER PRIMARY KEY,
      name TEXT,
      slug TEXT,
      summary TEXT,
      description BLOB,        -- BLOB to store compressed HTML description
      project_url TEXT,
      issues_url TEXT,
      source_url TEXT,
      wiki_url TEXT,
      categories TEXT,
      members TEXT,
      fetched_at TEXT,
      logo_url TEXT,
      downloads INTEGER,
      donate_url TEXT,
      created_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS curseforge_mod_files (
      id INTEGER PRIMARY KEY,
      mod_id INTEGER,
      name TEXT,
      display TEXT,            -- Stores NULL if identical to name to save space
      type INTEGER,             -- 1 = release, 2 = beta, 3 = alpha, 0 = other
      filesize INTEGER,
      uploaded_at INTEGER,      -- Unix Timestamp (seconds)
      downloads INTEGER,
      game_versions TEXT,       -- Contains only: game versions, loaders, client/server tags
      FOREIGN KEY (mod_id) REFERENCES curseforge_mods(id) ON DELETE CASCADE
    )
  `);

  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_name ON mods(name)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_slug ON mods(slug)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_modrinth_info_project_id ON modrinth_info(project_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_modrinth_projects_slug ON modrinth_projects(slug)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_curseforge_mod_files_mod_id ON curseforge_mod_files(mod_id)");
}

async function getMetadataVal(key: string): Promise<string | undefined> {
  const res = await db.execute({
    sql: "SELECT value FROM metadata WHERE key = ?",
    args: [key]
  });
  return res.rows[0]?.value as string | undefined;
}

// Helper delay function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with rate limit and retry handling
async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") || res.headers.get("X-Ratelimit-Reset");
        const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
        console.warn(`[Rate Limited] 429. Waiting ${delaySeconds} seconds...`);
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
      console.warn(`[Fetch Error] Attempt ${attempt} failed: ${err.message}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }
}

// 1. ModpackIndex Crawling
async function crawlModpackIndex() {
  console.log("\n--- Starting ModpackIndex Metadata Crawl ---");
  const metaVal = await getMetadataVal("last_fetched_page_mpi");
  let startPage = 1;
  if (startPageArg) {
    startPage = parseInt(startPageArg, 10);
    console.log(`Starting page overridden by flag to: ${startPage}`);
  } else if (metaVal) {
    // Go back 1 page to catch any new mods that filled up the previously incomplete last page
    startPage = Math.max(1, parseInt(metaVal, 10) - 1);
    console.log(`Resuming ModpackIndex crawl from page: ${startPage}`);
  }

  const limit = 100;
  let page = startPage;
  let totalPages = page;

  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
  };

  while (true) {
    console.log(`[ModpackIndex] Fetching page ${page}...`);
    let res;
    try {
      res = await fetchWithRetry(`${MPI_BASE_URL}/mods?page=${page}&limit=${limit}`, headers);
    } catch (e: any) {
      console.error(`[Error] Failed to fetch page ${page}: ${e.message}. Saving state and stopping.`);
      break;
    }

    if (!res || !res.data || res.data.length === 0) {
      console.log("[ModpackIndex] No more data returned or empty response. Crawl complete!");
      break;
    }

    const totalMods = res.meta?.total || 0;
    totalPages = res.meta?.last_page || Math.ceil(totalMods / limit);

    // Build batch statements
    const statements: any[] = [];
    for (const mod of res.data) {
      const modId = mod.id;
      const curseId = mod.curse_info?.curse_id ?? 0;

      // Trim arrays to save space
      const linksJson = JSON.stringify({
        curseforge: mod.links?.curseforge || null,
        modrinth: mod.links?.modrinth || null
      });

      const modrinthInfoJson = JSON.stringify(
        (mod.modrinth_info || []).map((info: any) => ({
          project_id: info.project_id,
          slug: info.slug || "",
          loaders: info.loaders || []
        }))
      );

      const authorsJson = JSON.stringify(
        (mod.authors || []).map((author: any) => ({
          name: author.name,
          url: author.url || null
        }))
      );

      const categoriesJson = JSON.stringify(
        (mod.categories || []).map((cat: any) => ({
          name: cat.name,
          slug: cat.slug
        }))
      );

      const versionsJson = JSON.stringify(
        (mod.minecraft_versions || []).map((ver: any) => ({
          name: ver.name,
          slug: ver.slug
        }))
      );

      statements.push({
        sql: `
          INSERT OR REPLACE INTO mods (
            id, name, slug, summary, url, thumbnail_url, download_count, 
            popularity_rank, latest_release_date, last_modified, last_updated, 
            page_url, curse_id, links_json, modrinth_info_json, authors_json,
            categories_json, versions_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          modId, mod.name, mod.slug, mod.summary || "", mod.url || "", mod.thumbnail_url || "",
          mod.download_count || 0, mod.popularity_rank || 0, mod.latest_release_date || "",
          mod.last_modified || "", mod.last_updated || "", mod.page_url || "", curseId,
          linksJson, modrinthInfoJson, authorsJson, categoriesJson, versionsJson
        ]
      });

      statements.push({
        sql: "DELETE FROM modrinth_info WHERE mod_id = ?",
        args: [modId]
      });

      if (mod.modrinth_info && Array.isArray(mod.modrinth_info)) {
        for (const mrInfo of mod.modrinth_info) {
          if (mrInfo.project_id) {
            statements.push({
              sql: "INSERT OR IGNORE INTO modrinth_info (mod_id, project_id, slug) VALUES (?, ?, ?)",
              args: [modId, mrInfo.project_id, mrInfo.slug || ""]
            });
          }
        }
      }
    }

    try {
      await db.batch(statements, "write");
    } catch (err: any) {
      console.error(`[Error] Failed to execute ModpackIndex write batch:`, err.message);
      break;
    }
    
    // Save progress
    await db.execute({
      sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      args: ["last_fetched_page_mpi", String(page)]
    });
    console.log(`[ModpackIndex] Page ${page}/${totalPages} complete. Saved ${res.data.length} mods.`);

    if (page >= totalPages) {
      console.log("[ModpackIndex] Reached the last page! Crawl complete.");
      break;
    }

    page++;
    // Polite delay to satisfy 3,600 req/hr rate limit (1 request per second)
    await sleep(1000);
  }
}

// Helper to process a single Modrinth batch.
// Isolating the block in a separate function ensures that temporary buffers,
// large JSON parsed projects, and database statements go out of scope immediately,
// allowing the V8 garbage collector to free memory promptly.
async function processModrinthBatch(
  batch: string[],
  headers: Record<string, string>
): Promise<number> {
  const idsParam = JSON.stringify(batch);
  const url = `${MODRINTH_BASE_URL}/projects?ids=${encodeURIComponent(idsParam)}`;

  let projects: any[] | null = null;
  try {
    projects = await fetchWithRetry(url, headers);
  } catch (e: any) {
    console.error(`[Error] Failed to fetch Modrinth batch: ${e.message}. Skipping batch.`);
    await sleep(2000);
    return 0;
  }

  if (projects && Array.isArray(projects)) {
    const statements: any[] = [];
    for (const p of projects) {
      // Compress markdown description body to save space
      const bodyCompressed = p.body
        ? zlib.deflateSync(Buffer.from(p.body, "utf-8"))
        : null;

      const galleryJson = JSON.stringify(
        (p.gallery || []).map((g: any) => ({
          url: g.url,
          featured: !!g.featured,
          title: g.title || "",
          description: g.description || "",
          created: g.created || ""
        }))
      );

      statements.push({
        sql: `
          INSERT OR REPLACE INTO modrinth_projects (
            id, slug, title, description, categories, loaders, game_versions, 
            downloads, followers, icon_url, client_side, server_side, 
            discord_url, source_url, issues_url, wiki_url, body_compressed,
            gallery_json, published, updated, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          p.id, p.slug, p.title, p.description || "",
          JSON.stringify(p.categories || []), JSON.stringify(p.loaders || []),
          JSON.stringify(p.game_versions || []), p.downloads || 0, p.followers || 0,
          p.icon_url || "", p.client_side || "unknown", p.server_side || "unknown",
          p.discord_url || "", p.source_url || "", p.issues_url || "", p.wiki_url || "",
          bodyCompressed, galleryJson, p.published || "", p.updated || "",
          new Date().toISOString()
        ]
      });
    }

    try {
      await db.batch(statements, "write");
      const count = projects.length;
      
      // Explicitly nullify large objects and clear arrays to free memory references
      projects = null;
      statements.length = 0;
      
      return count;
    } catch (err: any) {
      console.error(`[Error] Failed to execute Modrinth write batch:`, err.message);
    }
  }

  return 0;
}

// 2. Modrinth Crawling
async function crawlModrinth() {
  console.log("\n--- Starting Modrinth Detailed Project Crawl ---");
  
  // Find Modrinth project IDs from the modrinth_info table.
  let rows;
  if (forceModrinth) {
    console.log("Flag --force-modrinth passed. Recrawling all projects...");
    const res = await db.execute("SELECT DISTINCT project_id FROM modrinth_info");
    rows = res.rows;
  } else {
    const res = await db.execute(`
      SELECT DISTINCT project_id FROM modrinth_info 
      WHERE project_id NOT IN (SELECT id FROM modrinth_projects)
    `);
    rows = res.rows;
  }
  
  const allProjectIds = rows.map(r => r.project_id as string).filter(Boolean);
  rows = null; // Free database rows memory immediately
  
  console.log(`Found ${allProjectIds.length} Modrinth project IDs to crawl (missing/uncrawled).`);

  if (allProjectIds.length === 0) {
    console.log("No Modrinth projects to query.");
    return;
  }

  // Slice into batches of 100
  const batchSize = 100;
  const totalBatches = Math.ceil(allProjectIds.length / batchSize);
  
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
  };

  let totalSaved = 0;
  for (let i = 0; i < totalBatches; i++) {
    const batch = allProjectIds.slice(i * batchSize, (i + 1) * batchSize);
    console.log(`[Modrinth] Querying batch ${i + 1}/${totalBatches} (${batch.length} projects)...`);
    
    const count = await processModrinthBatch(batch, headers);
    totalSaved += count;

    // Suggest a GC check if run with node --expose-gc
    if (global && typeof (global as any).gc === "function" && i % 10 === 0) {
      (global as any).gc();
    }

    // Rate-limiting pause: Modrinth limit is 300 req/min, so 350ms delay is extremely safe.
    await sleep(350);
  }
  
  console.log(`Modrinth detailed crawl complete! Saved ${totalSaved} project details.`);
}

async function main() {
  const start = Date.now();
  try {
    await initDb();
    
    if (onlyModrinth) {
      await crawlModrinth();
    } else if (onlyMpi) {
      await crawlModpackIndex();
    } else {
      await crawlModpackIndex();
      await crawlModrinth();
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`\n🎉 Success! Sync completed in ${elapsed} seconds.`);
  } catch (error) {
    console.error("Fatal error in crawler main:", error);
  }
}

main();
