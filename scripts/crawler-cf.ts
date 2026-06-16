import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  db,
  getOrCreateCategory,
  getOrCreateAuthor,
  getOrCreateLoader,
  getOrCreateMinecraftVersion
} from "./crawler-db";

// Prevent process crash from unhandled network/TLS socket errors thrown by proxy agents
process.on("uncaughtException", (err: any) => {
  const isNetworkError =
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ECONNREFUSED" ||
    err.code === "EHOSTUNREACH" ||
    err.code === "ENETUNREACH" ||
    err.message?.includes("socket") ||
    err.message?.includes("TLS") ||
    err.message?.includes("secure connection");

  if (!isNetworkError) {
    console.error("\nCritical Uncaught Exception:", err);
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason: any) => {
  const isNetworkError =
    reason?.code === "ECONNRESET" ||
    reason?.code === "ETIMEDOUT" ||
    reason?.code === "ECONNREFUSED" ||
    reason?.message?.includes("socket") ||
    reason?.message?.includes("TLS") ||
    reason?.message?.includes("secure connection");

  if (!isNetworkError) {
    console.error("\nCritical Unhandled Rejection:", reason);
  }
});

const PROXY_DIR = path.join(process.cwd(), "proxy");
const USER_AGENT = "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)";
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "15", 10);

// Load proxies from proxy/ directory if it exists
let proxies: string[] = [];
if (fs.existsSync(PROXY_DIR) && fs.statSync(PROXY_DIR).isDirectory()) {
  const files = fs.readdirSync(PROXY_DIR);
  for (const file of files) {
    const filePath = path.join(PROXY_DIR, file);
    if (fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      proxies.push(...lines);
    }
  }
  // Deduplicate and Shuffle
  proxies = Array.from(new Set(proxies));
  for (let i = proxies.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [proxies[i], proxies[j]] = [proxies[j], proxies[i]];
  }
  console.log(`[CurseForge] Loaded ${proxies.length} unique proxies from "proxy" directory.`);
} else {
  console.log('[CurseForge] No "proxy" directory found. Running DIRECT (no proxy).');
}

let proxyIndex = 0;

function getNextProxy(): string {
  if (proxies.length === 0) {
    return "DIRECT";
  }
  const proxyUrl = proxies[proxyIndex];
  proxyIndex = (proxyIndex + 1) % proxies.length;
  return proxyUrl;
}

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

function fetchWithAgent(url: string, proxyUrl: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let agent: any = undefined;

    if (proxyUrl !== "DIRECT") {
      try {
        if (proxyUrl.startsWith("socks")) {
          agent = new SocksProxyAgent(proxyUrl);
        } else if (proxyUrl.startsWith("http")) {
          agent = new HttpsProxyAgent(proxyUrl);
        }
      } catch (err: any) {
        return reject(new Error(`Agent initialization failed: ${err.message}`));
      }
    }

    const options: https.RequestOptions = {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    };

    if (agent) {
      options.agent = agent;
    }

    const req = https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 429) {
          reject(new Error("RATE_LIMIT"));
        } else if (res.statusCode === 404) {
          reject(new Error("HTTP_404"));
        } else if (
          res.statusCode &&
          (res.statusCode < 200 || res.statusCode >= 300)
        ) {
          reject(new Error(`HTTP_${res.statusCode}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("JSON_PARSE_ERROR"));
          }
        }
      });
    });

    req.on("socket", (socket) => {
      socket.on("error", () => {
        // Prevent socket error from crashing process
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("TIMEOUT"));
    });
  });
}

async function fetchModDetails(curseId: number, retriesLeft = 5): Promise<any> {
  const url = `https://api.cfwidget.com/${curseId}`;
  const proxyUrl = getNextProxy();

  try {
    return await fetchWithAgent(url, proxyUrl);
  } catch (err: any) {
    if (err.message === "HTTP_404") {
      throw err; // Mod doesn't exist
    }

    // Self-healing: remove dead proxy
    if (proxyUrl !== "DIRECT") {
      const idx = proxies.indexOf(proxyUrl);
      if (idx !== -1) {
        proxies.splice(idx, 1);
      }
    }

    if (retriesLeft > 0) {
      const isDirect = proxyUrl === "DIRECT";
      const waitTime = isDirect ? 3000 : 300;
      await new Promise((r) => setTimeout(r, waitTime));
      return fetchModDetails(curseId, retriesLeft - 1);
    }
    throw err;
  }
}

export async function crawlCurseForge(forceAll = false) {
  console.log("\n--- Starting CurseForge Widget Relational Crawler ---");

  // Fetch CurseForge-only mods
  let queryStr = "SELECT id, curse_id FROM mods WHERE curse_id IS NOT NULL AND modrinth_id IS NULL";
  if (!forceAll) {
    queryStr += " AND description_compressed IS NULL";
  }

  const res = await db.execute(queryStr);
  const pendingIds = res.rows.map((r) => Number(r.curse_id)).filter(Boolean);

  console.log(`[CurseForge] Pending crawl: ${pendingIds.length} CurseForge-only mods.`);

  if (pendingIds.length === 0) {
    console.log("[CurseForge] All CurseForge-only mods are already crawled!");
    return;
  }

  const totalPending = pendingIds.length;
  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  const startTime = Date.now();
  const deferLimits = new Map<number, number>();

  function drawProgressBar() {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = processedCount / (elapsed || 0.1);
    const remaining = totalPending - processedCount;
    const eta = speed > 0 ? remaining / speed : 0;
    const percentage = (processedCount / totalPending) * 100;

    const barWidth = 20;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const progressLine =
      `\r[CF Crawl ${barStr}] ${percentage.toFixed(1)}% | ` +
      `${processedCount}/${totalPending} | ` +
      `Speed: ${speed.toFixed(1)}/s | ` +
      `OK: ${successCount} | ` +
      `Err: ${failCount}`;

    process.stdout.write("\r\x1b[K" + progressLine);
  }

  drawProgressBar();

  async function worker() {
    while (pendingIds.length > 0) {
      const curseId = pendingIds.shift();
      if (curseId === undefined) break;

      const modIdStr = String(curseId);

      try {
        const data = await fetchModDetails(curseId);

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
            WHERE id = ? OR curse_id = ?
          `,
          args: [
            name, slug, summary, descriptionRaw, descriptionCompressed, logoUrl,
            downloads, projectUrl, projectUrl, issuesUrl, sourceUrl, wikiUrl, donateUrl,
            new Date().toISOString(), modIdStr, curseId
          ]
        });

        // Relate categories
        if (Array.isArray(data.categories)) {
          statements.push({
            sql: "DELETE FROM mod_categories WHERE mod_id = ?",
            args: [modIdStr]
          });
          for (const cat of data.categories) {
            const catName = typeof cat === "string" ? cat : cat.name || cat;
            const catSlug = typeof cat === "string" ? cat.toLowerCase().replace(/\s+/g, "-") : cat.slug || catName.toLowerCase().replace(/\s+/g, "-");
            const catId = await getOrCreateCategory(catName, catSlug);
            statements.push({
              sql: "INSERT OR IGNORE INTO mod_categories (mod_id, category_id) VALUES (?, ?)",
              args: [modIdStr, catId]
            });
          }
        }

        // Relate authors/members
        if (Array.isArray(data.members)) {
          statements.push({
            sql: "DELETE FROM mod_authors WHERE mod_id = ?",
            args: [modIdStr]
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
                args: [modIdStr, authorId, member.title || null]
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
                modIdStr,
                f.name || `File ${f.id}`,
                f.display || f.name || null,
                f.type || "release",
                f.filesize || 0,
                uploadedAtStr,
                f.downloads || 0,
                null // changelog not available on cfwidget root response usually
              ]
            });

            // Parse game versions and loaders from f.versions
            const { gameVersions, loaders } = parseGameVersionsAndLoaders(f.versions);

            for (const loader of loaders) {
              const loaderId = await getOrCreateLoader(loader);
              statements.push({
                sql: "INSERT OR IGNORE INTO version_loaders (version_id, loader_id) VALUES (?, ?)",
                args: [versionIdStr, loaderId]
              });
            }

            for (const gv of gameVersions) {
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

        successCount++;
        processedCount++;
      } catch (err: any) {
        const currentDefers = deferLimits.get(curseId) || 0;
        if (err.message === "HTTP_404" || proxies.length === 0 || currentDefers >= 3) {
          failCount++;
          processedCount++;
        } else {
          deferLimits.set(curseId, currentDefers + 1);
          pendingIds.push(curseId); // Defer
        }
      } finally {
        drawProgressBar();
      }

      const delay = proxies.length === 0 ? 1000 : 50;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Spawn parallel workers based on concurrency limit
  const workers = Array.from({ length: Math.min(CONCURRENCY, totalPending) }, () => worker());
  await Promise.all(workers);

  process.stdout.write("\n");
  console.log(`[CurseForge] Crawl complete. OK: ${successCount}, Err: ${failCount}`);
}
