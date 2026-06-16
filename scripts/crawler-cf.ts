import zlib from "zlib";
import {
  db,
  getOrCreateCategory,
  getOrCreateAuthor,
  getOrCreateLoader,
  getOrCreateMinecraftVersion,
  isMinecraftVersionAllowed
} from "./crawler-db";
import { fetchWithProxy, getProxyCount, getActiveProxies, loadProxies } from "./crawler-proxy";

const USER_AGENT = "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)";
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "2", 10);

function parseGameVersionsAndLoaders(versions: string[]) {
  const gameVersions: string[] = [];
  const loaders: string[] = [];
  const allowedLoaders = ["forge", "fabric", "neoforge", "quilt"];
  
  for (const v of versions) {
    const low = v.toLowerCase().trim();
    if (/^1\.\d+(\.\d+)?$/.test(v)) {
      gameVersions.push(v);
    } else if (allowedLoaders.includes(low)) {
      loaders.push(low);
    }
  }
  return { gameVersions, loaders };
}

async function fetchModDetails(curseId: number, proxyUrl?: string | null, retriesLeft = 10): Promise<any> {
  const url = `https://api.cfwidget.com/${curseId}`;
  return fetchWithProxy(url, {}, retriesLeft, proxyUrl);
}

export async function crawlSingleCurseForge(curseId: number, proxyUrl?: string | null): Promise<void> {
  const data = await fetchModDetails(curseId, proxyUrl);

  // Retrieve the canonical ID from the database (could be a Modrinth ID if mapped)
  const existRes = await db.execute({
    sql: "SELECT id FROM mods WHERE curse_id = ?",
    args: [curseId]
  });
  const canonicalId = (existRes.rows[0]?.id as string) || String(curseId);

  const name = data.name || data.title || null;
  const slug = data.urls?.project?.split("/").pop() || null;
  const summary = data.summary || null;
  const descriptionRaw = data.description || null;
  const descriptionCompressed = descriptionRaw
    ? zlib.deflateSync(Buffer.from(descriptionRaw, "utf-8"))
    : null;

  const projectUrl = data.urls?.project || null;
  const issuesUrl = data.urls?.issues || null;
  const sourceUrl = data.urls?.source || null;
  const wikiUrl = data.urls?.wiki || null;
  const logoUrl = data.thumbnail || null;
  const downloads = data.downloads?.total || 0;
  const donateUrl = data.donate || null;

  const statements: any[] = [];

  // Update mods record with full CurseForge details
  statements.push({
    sql: `
      UPDATE mods SET
        name = COALESCE(?, name),
        slug = COALESCE(?, slug),
        summary = COALESCE(?, summary),
        description = ?,
        description_compressed = ?,
        thumbnail_url = COALESCE(?, thumbnail_url),
        download_count = COALESCE(?, download_count),
        page_url = COALESCE(?, page_url),
        curseforge_url = COALESCE(?, curseforge_url),
        issues_url = COALESCE(?, issues_url),
        source_url = COALESCE(?, source_url),
        wiki_url = COALESCE(?, wiki_url),
        donate_url = COALESCE(?, donate_url),
        fetched_at = ?
      WHERE id = ?
    `,
    args: [
      name, slug, summary, descriptionRaw, descriptionCompressed, logoUrl,
      downloads, projectUrl, projectUrl, issuesUrl, sourceUrl, wikiUrl, donateUrl,
      new Date().toISOString(), canonicalId
    ]
  });

  // Relate categories
  if (Array.isArray(data.categories)) {
    statements.push({
      sql: "DELETE FROM mod_categories WHERE mod_id = ?",
      args: [canonicalId]
    });
    for (const cat of data.categories) {
      const catName = typeof cat === "string" ? cat : cat.name || cat;
      const catSlug = typeof cat === "string" ? cat.toLowerCase().replace(/\s+/g, "-") : cat.slug || catName.toLowerCase().replace(/\s+/g, "-");
      const catId = await getOrCreateCategory(catName, catSlug);
      statements.push({
        sql: "INSERT OR IGNORE INTO mod_categories (mod_id, category_id) VALUES (?, ?)",
        args: [canonicalId, catId]
      });
    }
  }

  // Relate authors/members
  if (Array.isArray(data.members)) {
    statements.push({
      sql: "DELETE FROM mod_authors WHERE mod_id = ?",
      args: [canonicalId]
    });
    for (const member of data.members) {
      const authorName = member.name || member.username;
      if (authorName) {
        const authorId = await getOrCreateAuthor(
          authorName,
          member.username || undefined,
          member.url || undefined
        );
        statements.push({
          sql: "INSERT OR IGNORE INTO mod_authors (mod_id, author_id, role) VALUES (?, ?, ?)",
          args: [canonicalId, authorId, member.title || null]
        });
      }
    }
  }

  // Relate files/versions
  if (Array.isArray(data.files)) {
    const files = data.files;

    // Clear old versions
    const versionIds = files.map((f: any) => String(f.id));
    for (const vId of versionIds) {
      statements.push({ sql: "DELETE FROM version_loaders WHERE version_id = ?", args: [vId] });
      statements.push({ sql: "DELETE FROM version_minecraft_versions WHERE version_id = ?", args: [vId] });
      statements.push({ sql: "DELETE FROM mod_versions WHERE id = ?", args: [vId] });
    }

    for (const f of files) {
      const { gameVersions, loaders } = parseGameVersionsAndLoaders(f.versions);
      const allowedGameVersions = gameVersions.filter(isMinecraftVersionAllowed);

      if (allowedGameVersions.length === 0 && gameVersions.length > 0) {
        continue;
      }

      const versionIdStr = String(f.id);
      const uploadedAtStr = f.uploaded_at ? new Date(f.uploaded_at).toISOString() : null;

      statements.push({
        sql: `
          INSERT OR REPLACE INTO mod_versions (
            id, mod_id, name, version_number, type, filesize, uploaded_at, downloads, changelog
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          versionIdStr,
          canonicalId,
          f.name || `File ${f.id}`,
          f.display || f.name || null,
          f.type || "release",
          f.filesize || 0,
          uploadedAtStr,
          f.downloads || 0,
          null // changelog not available on cfwidget root response usually
        ]
      });

      for (const loader of loaders) {
        const loaderId = await getOrCreateLoader(loader);
        statements.push({
          sql: "INSERT OR IGNORE INTO version_loaders (version_id, loader_id) VALUES (?, ?)",
          args: [versionIdStr, loaderId]
        });
      }

      for (const gv of allowedGameVersions) {
        const gvId = await getOrCreateMinecraftVersion(gv);
        statements.push({
          sql: "INSERT OR IGNORE INTO version_minecraft_versions (version_id, minecraft_version_id) VALUES (?, ?)",
          args: [versionIdStr, gvId]
        });
      }
    }
  }

  // Execute batch transaction
  await db.batch(statements, "write");
}

export async function crawlCurseForge(forceAll = false) {
  // Fetch CurseForge-only mods
  let queryStr = "SELECT id, curse_id FROM mods WHERE curse_id IS NOT NULL AND modrinth_id IS NULL";
  if (!forceAll) {
    queryStr += " AND description_compressed IS NULL";
  }

  const res = await db.execute(queryStr);
  const pendingIds = res.rows.map((r) => Number(r.curse_id)).filter(Boolean);

  if (pendingIds.length === 0) {
    return;
  }

  const totalPending = pendingIds.length;
  let successCount = 0;
  let failCount = 0;

  const startTime = Date.now();

  function drawProgressBar() {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = successCount / (elapsed || 0.1);
    const remaining = totalPending - successCount;
    const eta = speed > 0 ? remaining / speed : 0;
    const percentage = (successCount / totalPending) * 100;

    const barWidth = 20;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const progressLine =
      `\r[CF Crawl ${barStr}] ${percentage.toFixed(1)}% | ` +
      `${successCount}/${totalPending} | ` +
      `Speed: ${speed.toFixed(1)}/s | ` +
      `OK: ${successCount} | ` +
      `Err: ${failCount} | ` +
      `Proxies: ${getActiveProxies().length}`;

    process.stdout.write("\r\x1b[K" + progressLine);
  }

  drawProgressBar();

  async function worker(proxyUrl: string | null) {
    while (pendingIds.length > 0) {
      if (proxyUrl && !getActiveProxies().includes(proxyUrl)) {
        break; // Proxy was pruned, exit worker
      }

      const curseId = pendingIds.shift();
      if (curseId === undefined) break;

      try {
        await crawlSingleCurseForge(curseId, proxyUrl);
        successCount++;
      } catch (err: any) {
        failCount++;
        pendingIds.push(curseId); // Defer indefinitely
      } finally {
        drawProgressBar();
      }

      const delay = proxyUrl ? 0 : 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Load proxies
  loadProxies();
  const activeProxies = getActiveProxies();
  const workers: Promise<void>[] = [];

  if (activeProxies.length > 0) {
    // Spawn 2 workers per proxy concurrently
    for (const proxy of activeProxies) {
      workers.push(worker(proxy));
      workers.push(worker(proxy));
    }
  } else {
    // Fallback to direct connections (e.g. 4 workers)
    for (let i = 0; i < 4; i++) {
      workers.push(worker(null));
    }
  }

  await Promise.all(workers);

  // If we still have pending IDs and all proxies died, run direct fallback
  if (pendingIds.length > 0 && getActiveProxies().length === 0) {
    const fallbackWorkers = Array.from({ length: 4 }, () => worker(null));
    await Promise.all(fallbackWorkers);
  }

  process.stdout.write("\n");
}
