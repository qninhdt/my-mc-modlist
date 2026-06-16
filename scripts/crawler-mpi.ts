import {
  db,
  getOrCreateCategory,
  getOrCreateAuthor,
  getOrCreateMinecraftVersion,
  runSerializedDb,
  getDbQueueLength,
} from "./crawler-db";
import { fetchWithProxy, getProxyCount, getActiveProxies, loadProxies } from "./crawler-proxy";
import { crawlSingleCurseForge } from "./crawler-cf";

const MPI_BASE_URL = "https://www.modpackindex.com/api/v1";

const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONNS_PER_PROXY = parseInt(process.env.CONNS_PER_PROXY || "10", 10);
const MAX_CONCURRENT_WORKERS = 1000;

async function fetchWithRetry(url: string, retries = 10): Promise<any> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  return fetchWithProxy(url, headers, retries);
}

async function getMetadataVal(key: string): Promise<string | undefined> {
  const res = await db.execute({
    sql: "SELECT value FROM metadata WHERE key = ?",
    args: [key],
  });
  return res.rows[0]?.value as string | undefined;
}

export async function crawlModpackIndex(startPageArg?: string) {
  loadProxies();
  const metaVal = await getMetadataVal("last_fetched_page_mpi");

  let startPage = 1;
  if (startPageArg) {
    startPage = parseInt(startPageArg, 10);
  } else if (metaVal) {
    startPage = Math.max(1, parseInt(metaVal, 10) - 1);
  }

  const limit = 100;

  // 1. Fetch first page to determine totalPages
  let firstRes;
  try {
    firstRes = await fetchWithRetry(
      `${MPI_BASE_URL}/mods?page=${startPage}&limit=${limit}`,
    );
  } catch (e: any) {
    console.error(
      `[ModpackIndex Error] Failed to fetch starting page ${startPage}: ${e.message}`,
    );
    return;
  }

  if (!firstRes || !firstRes.data || firstRes.data.length === 0) {
    return;
  }

  const totalMods = firstRes.meta?.total || 0;
  const totalPages = firstRes.meta?.last_page || Math.ceil(totalMods / limit);

  let totalSaved = 0;
  const startTime = Date.now();

  function formatTime(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s}s`;
  }

  // Set of pages remaining to fetch
  const pageQueue: number[] = [];
  for (let p = startPage; p <= totalPages; p++) {
    pageQueue.push(p);
  }

  let pagesProcessed = 0;
  const totalPagesToProcess = pageQueue.length;

  let cfSuccessCount = 0;
  let cfFailCount = 0;
  let cfTotalToCrawl = 0;
  const cfStartTime = Date.now();

  let isMpiDone = false;
  const cfQueue: number[] = [];
  const cfQueuedIds = new Set<number>();

  function drawProgressBar() {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = pagesProcessed / (elapsed || 0.1);
    const remaining = totalPagesToProcess - pagesProcessed;
    const eta = speed > 0 ? remaining / speed : 0;
    const percentage = (pagesProcessed / totalPagesToProcess) * 100;

    if ((global as any).isParallelCrawl) {
      if (pagesProcessed % 5 === 0 || pagesProcessed === totalPagesToProcess) {
        const cfProcessed = cfSuccessCount + cfFailCount;
        console.log(
          `[ModpackIndex Progress] ${percentage.toFixed(1)}% | Page: ${startPage + pagesProcessed - 1}/${totalPages} | Saved: ${totalSaved} | Speed: ${speed.toFixed(2)} p/s | ETA: ${formatTime(eta)} | CF Queue: ${cfQueue.length} pending (${cfProcessed}/${cfTotalToCrawl} done)`,
        );
      }
      return;
    }

    const barWidth = 20;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = Math.max(0, barWidth - filledWidth);
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const progressLine =
      `\r\x1b[K[MPI Crawl ${barStr}] ${percentage.toFixed(1)}% | ` +
      `Page: ${startPage + pagesProcessed - 1}/${totalPages} | ` +
      `Total Saved: ${totalSaved} | ` +
      `Speed: ${speed.toFixed(2)} p/s | ` +
      `ETA: ${formatTime(eta)}`;

    const cfPercentage =
      cfTotalToCrawl > 0 ? (cfSuccessCount / cfTotalToCrawl) * 100 : 0;
    const cfFilledWidth = Math.round((cfPercentage / 100) * barWidth);
    const cfEmptyWidth = Math.max(0, barWidth - cfFilledWidth);
    const cfBarStr = "█".repeat(cfFilledWidth) + "░".repeat(cfEmptyWidth);

    const cfElapsed = (Date.now() - cfStartTime) / 1000;
    const cfSpeed = cfSuccessCount / (cfElapsed || 0.1);
    const cfRemaining = cfTotalToCrawl - cfSuccessCount;
    const cfEta = cfSpeed > 0 ? cfRemaining / cfSpeed : 0;

    const cfLine =
      `\n\x1b[K[CF Crawl  ${cfBarStr}] ${cfPercentage.toFixed(1)}% | ` +
      `Active: ${cfSuccessCount}/${cfTotalToCrawl} | ` +
      `Pending: ${cfQueue.length} | ` +
      `Proxies: ${getActiveProxies().length} | ` +
      `DBQ: ${getDbQueueLength()} | ` +
      `Speed: ${cfSpeed.toFixed(1)}/s | ` +
      `ETA: ${formatTime(cfEta)}`;

    process.stdout.write(progressLine + cfLine + "\x1b[1A");
  }

  // Pre-load already crawled CurseForge mods to prevent duplicate/virtual counts
  const crawledCfRes = await db.execute(
    "SELECT curse_id FROM mods WHERE curse_id IS NOT NULL AND description_compressed IS NOT NULL",
  );
  for (const row of crawledCfRes.rows) {
    if (row.curse_id) {
      cfQueuedIds.add(Number(row.curse_id));
    }
  }

  // Pre-load pending CurseForge-only mods from database into the worker queue
  const pendingCfRes = await db.execute(
    "SELECT curse_id FROM mods WHERE curse_id IS NOT NULL AND modrinth_id IS NULL AND description_compressed IS NULL",
  );
  let preloadedCount = 0;
  for (const row of pendingCfRes.rows) {
    if (row.curse_id) {
      const cid = Number(row.curse_id);
      if (!cfQueuedIds.has(cid)) {
        cfQueue.push(cid);
        cfQueuedIds.add(cid);
        preloadedCount++;
      }
    }
  }
  cfTotalToCrawl += preloadedCount;

  drawProgressBar();

  async function processPage(pNum: number, data: any[]) {
    const statements: any[] = [];

    // We execute DB lookup and metadata creation inside serialized DB executor
    await runSerializedDb(async () => {
      for (const mod of data) {
        const mpiId = mod.id;
        const curseId = mod.curse_info?.curse_id ?? null;
        const modrinthList = mod.modrinth_info || [];
        const modrinthIds = modrinthList
          .map((m: any) => m.project_id)
          .filter(Boolean);

        // Find any existing rows in the DB matching any of this mod's identifiers
        let sql = `
          SELECT id, modrinth_id, curse_id, mpi_id 
          FROM mods 
          WHERE (curse_id IS NOT NULL AND curse_id = ?) 
             OR (mpi_id IS NOT NULL AND mpi_id = ?)
        `;
        const args: any[] = [curseId !== null ? curseId : -999999, mpiId];

        if (modrinthIds.length > 0) {
          const placeholders = modrinthIds.map(() => "?").join(",");
          sql += ` OR id IN (${placeholders}) OR modrinth_id IN (${placeholders})`;
          args.push(...modrinthIds, ...modrinthIds);
        }

        const existRes = await db.execute({ sql, args });
        const matchedRows = existRes.rows;

        // Determine canonicalModrinthId
        const modrinthIdFromPage = modrinthIds[0] || null;
        const modrinthIdFromDb =
          matchedRows.find((r) => r.modrinth_id)?.modrinth_id || null;
        const canonicalModrinthId = modrinthIdFromPage || modrinthIdFromDb;

        if (canonicalModrinthId) {
          const canonicalId = canonicalModrinthId;

          // Delete duplicate rows (different primary key id) to prevent UNIQUE conflicts on curse_id/mpi_id
          for (const row of matchedRows) {
            const rowId = row.id as string;
            if (rowId !== canonicalId) {
              statements.push({
                sql: "DELETE FROM mods WHERE id = ?",
                args: [rowId],
              });
            }
          }

          const existsInDb = matchedRows.some((r) => r.id === canonicalId);

          if (existsInDb) {
            statements.push({
              sql: "UPDATE mods SET mpi_id = ?, curse_id = ? WHERE id = ?",
              args: [mpiId, curseId, canonicalId],
            });
          } else {
            statements.push({
              sql: `
                INSERT INTO mods (
                  id, modrinth_id, mpi_id, curse_id, name, slug, fetched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  mpi_id = excluded.mpi_id,
                  curse_id = excluded.curse_id,
                  name = COALESCE(mods.name, excluded.name),
                  slug = COALESCE(mods.slug, excluded.slug),
                  fetched_at = excluded.fetched_at
              `,
              args: [
                canonicalId,
                canonicalId,
                mpiId,
                curseId,
                mod.name,
                mod.slug,
                new Date().toISOString(),
              ],
            });
          }
        } else {
          // CurseForge-only or MPI-only mod
          const canonicalId =
            curseId !== null ? String(curseId) : String(mpiId);

          // Delete duplicate rows
          for (const row of matchedRows) {
            const rowId = row.id as string;
            if (rowId !== canonicalId) {
              statements.push({
                sql: "DELETE FROM mods WHERE id = ?",
                args: [rowId],
              });
            }
          }

          statements.push({
            sql: `
              INSERT INTO mods (
                id, mpi_id, curse_id, name, slug, summary, thumbnail_url,
                download_count, popularity_rank, latest_release_date,
                last_modified, last_updated, page_url, curseforge_url, fetched_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                mpi_id = excluded.mpi_id,
                curse_id = excluded.curse_id,
                name = COALESCE(excluded.name, mods.name),
                slug = COALESCE(excluded.slug, mods.slug),
                summary = COALESCE(excluded.summary, mods.summary),
                thumbnail_url = COALESCE(excluded.thumbnail_url, mods.thumbnail_url),
                download_count = COALESCE(excluded.download_count, mods.download_count),
                popularity_rank = COALESCE(excluded.popularity_rank, mods.popularity_rank),
                latest_release_date = COALESCE(excluded.latest_release_date, mods.latest_release_date),
                last_modified = COALESCE(excluded.last_modified, mods.last_modified),
                last_updated = COALESCE(excluded.last_updated, mods.last_updated),
                page_url = COALESCE(excluded.page_url, mods.page_url),
                curseforge_url = COALESCE(excluded.curseforge_url, mods.curseforge_url),
                fetched_at = excluded.fetched_at
            `,
            args: [
              canonicalId,
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
              new Date().toISOString(),
            ],
          });

          // Relate categories
          if (Array.isArray(mod.categories)) {
            statements.push({
              sql: "DELETE FROM mod_categories WHERE mod_id = ?",
              args: [canonicalId],
            });
            for (const cat of mod.categories) {
              const catId = await getOrCreateCategory(cat.name, cat.slug);
              statements.push({
                sql: "INSERT OR IGNORE INTO mod_categories (mod_id, category_id) VALUES (?, ?)",
                args: [canonicalId, catId],
              });
            }
          }

          // Relate authors
          if (Array.isArray(mod.authors)) {
            statements.push({
              sql: "DELETE FROM mod_authors WHERE mod_id = ?",
              args: [canonicalId],
            });
            for (const aut of mod.authors) {
              const autId = await getOrCreateAuthor(
                aut.name,
                undefined,
                aut.url || undefined,
              );
              statements.push({
                sql: "INSERT OR IGNORE INTO mod_authors (mod_id, author_id, role) VALUES (?, ?, ?)",
                args: [canonicalId, autId, null],
              });
            }
          }

          // Queue for CurseForge widget crawling
          if (curseId !== null && !cfQueuedIds.has(curseId)) {
            cfQueue.push(curseId);
            cfQueuedIds.add(curseId);
            cfTotalToCrawl++;
          }
        }
      }

      if (statements.length > 0) {
        try {
          await db.batch(statements, "write");
        } catch (dbErr: any) {
          console.error(
            `\n[MPI DB Error] Failed to write page ${pNum}:`,
            dbErr.message,
          );
        }
      }

      // Save progress metadata
      await db.execute({
        sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
        args: ["last_fetched_page_mpi", String(pNum)],
      });
    });

    totalSaved += data.length;
    pagesProcessed++;
    drawProgressBar();
  }

  async function mpiWorker() {
    while (pageQueue.length > 0) {
      const page = pageQueue.shift();
      if (page === undefined) break;

      try {
        const res = await fetchWithRetry(
          `${MPI_BASE_URL}/mods?page=${page}&limit=${limit}`,
        );
        if (res && res.data && res.data.length > 0) {
          await processPage(page, res.data);
        }
      } catch (e: any) {
        console.error(
          `\n[ModpackIndex Error] Failed to fetch page ${page}: ${e.message}`,
        );
      }
      await sleep(1000);
    }
  }

  async function cfWorker() {
    while (true) {
      if (cfQueue.length > 0) {
        const curseId = cfQueue.shift();
        if (curseId === undefined) continue;

        try {
          await crawlSingleCurseForge(curseId);
          cfSuccessCount++;
        } catch (err: any) {
          cfFailCount++;
          if (err.message === "HTTP_404") {
            cfSuccessCount++;
          } else {
            cfQueue.push(curseId); // Defer
            await sleep(1000); // Backoff
          }
        } finally {
          drawProgressBar();
        }
      } else if (isMpiDone) {
        break; // MPI is done producing, and queue is empty, so exit
      } else {
        await sleep(200); // Wait for MPI to produce more CF ids
      }
    }
  }

  // Spawn CF background workers
  const maxWorkers = getActiveProxies().length > 0 ? getActiveProxies().length * CONNS_PER_PROXY : 4;
  const cfWorkerCount = Math.min(MAX_CONCURRENT_WORKERS, Math.max(4, maxWorkers));
  const cfWorkersPromise = Promise.all(Array.from({ length: cfWorkerCount }, () => cfWorker()));

  // Spawn 2 concurrent MPI page-crawling workers!
  const mpiWorkerCount = Math.min(2, totalPagesToProcess);
  await Promise.all(Array.from({ length: mpiWorkerCount }, () => mpiWorker()));

  // MPI is done
  isMpiDone = true;

  // Wait for background CurseForge workers to complete
  await cfWorkersPromise;

  // Move cursor down past the 2-line progress bar
  if (!(global as any).isParallelCrawl) {
    process.stdout.write("\n\n");
  }
}

function mappedToNonModrinth(mapped: boolean): boolean {
  return mapped;
}
