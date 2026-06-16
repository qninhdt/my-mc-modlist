import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";
import dotenv from "dotenv";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

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
  console.log(
    `Loaded ${proxies.length} unique proxies from "proxy" directory (shuffled).`,
  );
} else {
  console.log(
    'No "proxy" directory found. Will run requests directly (without proxy).',
  );
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

// Helper to check if string is Minecraft Version
function isMinecraftVersion(v: string): boolean {
  return /^1\.\d+(\.\d+)?$/.test(v);
}

// Helper to convert date string to Unix timestamp (seconds)
function getUnixTimestamp(dateStr: string): number {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  return Math.floor(date.getTime() / 1000) || 0;
}

// Helper to convert release type string to integer ID
function getTypeInteger(typeStr: string): number {
  const low = (typeStr || "").toLowerCase();
  if (low === "release") return 1;
  if (low === "beta") return 2;
  if (low === "alpha") return 3;
  return 0;
}

// Fetch details function with Proxy Agent Support & Retry
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
        // Prevent unhandled socket errors from crashing the Node.js process
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(5000, () => {
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
    // Permanent failure: mod does not exist. Do not delete proxy and do not retry!
    if (err.message === "HTTP_404") {
      throw err;
    }

    // Self-healing: Remove dead proxy from list
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

// Helper to format remaining time
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

// Helper to log errors cleanly without breaking the progress bar line
let drawProgressBarFn: (() => void) | null = null;
function logError(message: string) {
  process.stdout.write("\r\x1b[K"); // Clear progress bar line
  console.error(message);
  if (drawProgressBarFn) {
    drawProgressBarFn(); // Redraw progress bar
  }
}

// Helper to generate an ASCII sparkline of speed history
function getSparkline(history: number[]): string {
  if (history.length === 0) return "";
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min;
  const chars = [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  return history
    .map((val) => {
      if (range === 0) return chars[4]; // Default to middle
      const index = Math.floor(((val - min) / range) * (chars.length - 1));
      return chars[index];
    })
    .join("");
}

// Concurrent Crawling Loop
async function main() {
  // Ensure tables and indexes are initialized on Turso
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

  await db.execute("CREATE INDEX IF NOT EXISTS idx_curseforge_mod_files_mod_id ON curseforge_mod_files(mod_id)");

  // Find CurseForge IDs that DO NOT have a Modrinth project mapping
  const rowsRes = await db.execute(`
    SELECT DISTINCT m.curse_id 
    FROM mods m
    LEFT JOIN modrinth_info mi ON m.id = mi.mod_id
    WHERE m.curse_id > 0 AND mi.project_id IS NULL
  `);
  const allCurseIds = rowsRes.rows.map((r) => Number(r.curse_id));

  console.log(`Found ${allCurseIds.length} CurseForge-only IDs in mods.db`);

  // Filter out already crawled IDs
  const crawledRes = await db.execute("SELECT id FROM curseforge_mods");
  const crawledIds = new Set(crawledRes.rows.map((r) => Number(r.id)));
  const pendingIds = allCurseIds.filter((id) => !crawledIds.has(id));

  console.log(`Already crawled: ${crawledIds.size}`);
  console.log(`Pending crawl: ${pendingIds.length}`);

  if (pendingIds.length === 0) {
    console.log("All CurseForge-only mods are already crawled!");
    process.exit(0);
  }

  const totalPending = pendingIds.length;
  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  const deferLimits = new Map<number, number>();
  const speedHistory: number[] = [];
  const maxHistoryLength = 20; // Number of characters in the sparkline
  let lastProcessedCount = 0;

  const speedInterval = setInterval(() => {
    const currentProcessed = processedCount;
    const instantSpeed = currentProcessed - lastProcessedCount;
    lastProcessedCount = currentProcessed;
    speedHistory.push(instantSpeed);
    if (speedHistory.length > maxHistoryLength) {
      speedHistory.shift();
    }
  }, 1000);

  console.log(`Starting crawl with Concurrency Limit: ${CONCURRENCY}`);

  const startTime = Date.now();

  // Progress Bar Drawing Function
  function drawProgressBar() {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = processedCount / (elapsed || 0.1);
    const remaining = totalPending - processedCount;
    const eta = speed > 0 ? remaining / speed : 0;

    const percentage = (processedCount / totalPending) * 100;

    // Bar design
    const barWidth = 25;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const barStr = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    const sparkline = getSparkline(speedHistory);
    const sparklineStr = sparkline ? ` [${sparkline}]` : "";

    // Build progress line
    const progressLine =
      `\r[${barStr}] ${percentage.toFixed(1)}% | ` +
      `${processedCount}/${totalPending} | ` +
      `Speed: ${speed.toFixed(1)}/s${sparklineStr} | ` +
      `ETA: ${formatTime(eta)} | ` +
      `OK: \x1b[32m${successCount}\x1b[0m | ` +
      `Err: \x1b[31m${failCount}\x1b[0m`;

    // Clear line and write to stdout
    process.stdout.write("\r\x1b[K" + progressLine);
  }

  drawProgressBarFn = drawProgressBar;

  // Draw initial progress bar
  drawProgressBar();

  // Create worker function
  async function worker(workerId: number) {
    while (pendingIds.length > 0) {
      const curseId = pendingIds.shift();
      if (curseId === undefined) break;

      try {
        const data = await fetchModDetails(curseId);

        // Parse metadata
        const name = data.name || data.title || null;
        const slug = data.urls?.project?.split("/").pop() || null;
        const summary = data.summary || null;

        // Compress HTML description
        const descriptionRaw = data.description || null;
        const description = descriptionRaw
          ? zlib.deflateSync(Buffer.from(descriptionRaw, "utf-8"))
          : null;

        const project_url = data.urls?.project || null;
        const issues_url = data.urls?.issues || null;
        const source_url = data.urls?.source || null;
        const wiki_url = data.urls?.wiki || null;

        const categories = Array.isArray(data.categories)
          ? data.categories
              .map((c: any) => (typeof c === "string" ? c : c.name || c))
              .join(",")
          : "";

        const members = Array.isArray(data.members)
          ? data.members
              .map((m: any) => m.username || m.name)
              .filter(Boolean)
              .join(",")
          : "";

        const fetched_at = new Date().toISOString();
        const logo_url = data.thumbnail || null;
        const downloads = data.downloads?.total || 0;
        const donate_url = data.donate || null;
        const created_at = data.created_at || null;

        // Environment and loader filter tags to keep
        const allowedTags = [
          "forge",
          "fabric",
          "neoforge",
          "quilt",
          "client",
          "server",
          "both",
        ];

        // Parse files list
        const files = Array.isArray(data.files)
          ? data.files.map((f: any) => {
              // Optimize display column (save space by storing NULL if identical to name)
              const display =
                f.display && f.display !== f.name ? f.display : null;

              // Optimize game versions: Keep only Minecraft versions, loaders, and client/server side tags
              const game_versions = Array.isArray(f.versions)
                ? f.versions
                    .filter(
                      (v: string) =>
                        isMinecraftVersion(v) ||
                        allowedTags.includes(v.toLowerCase()),
                    )
                    .map((v: string) => v.toLowerCase())
                    .join(",")
                : "";

              return {
                id: f.id,
                name: f.name || null,
                display,
                type: getTypeInteger(f.type),
                filesize: f.filesize || 0,
                uploaded_at: getUnixTimestamp(f.uploaded_at),
                downloads: f.downloads || 0,
                game_versions,
              };
            })
          : [];

        // Save mod and all its files in a single batch
        const statements: any[] = [];
        statements.push({
          sql: `
            INSERT OR REPLACE INTO curseforge_mods (
              id, name, slug, summary, description, project_url, issues_url, source_url, wiki_url, categories, members, fetched_at, logo_url, downloads, donate_url, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            curseId, name, slug, summary, description, project_url, issues_url, source_url, wiki_url, categories, members, fetched_at, logo_url, downloads, donate_url, created_at
          ]
        });

        for (const f of files) {
          statements.push({
            sql: `
              INSERT OR REPLACE INTO curseforge_mod_files (
                id, mod_id, name, display, type, filesize, uploaded_at, downloads, game_versions
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: [
              f.id, curseId, f.name, f.display, f.type, f.filesize, f.uploaded_at, f.downloads, f.game_versions
            ]
          });
        }

        await db.batch(statements, "write");

        successCount++;
        processedCount++;
      } catch (err: any) {
        const currentDefers = deferLimits.get(curseId) || 0;
        // Max 3 deferrals
        if (err.message === "HTTP_404" || proxies.length === 0 || currentDefers >= 3) {
          failCount++;
          processedCount++;
        } else {
          deferLimits.set(curseId, currentDefers + 1);
          pendingIds.push(curseId); // Defer to the end of the queue
        }
      } finally {
        drawProgressBar();
      }

      const delay = proxies.length === 0 ? 1000 : 50;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Spawn parallel workers
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);

  // Print final line with newline
  process.stdout.write("\n");

  clearInterval(speedInterval);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Crawl complete!`);
  console.log(`Time taken: ${duration}s`);
  console.log(`Successfully saved: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

main();
