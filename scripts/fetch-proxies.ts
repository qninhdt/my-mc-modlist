import fs from "fs";
import path from "path";
import https from "https";
import net from "net";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const PROXY_DIR = path.join(process.cwd(), "proxy");
const OUTPUT_FILE = path.join(PROXY_DIR, "fetched_proxies.txt");

const CONCURRENCY = parseInt(process.env.CHECK_CONCURRENCY || "1000", 10);
const TIMEOUT_MS = 2500; // 2.5 seconds timeout for pre-flight check
const SKIP_TCP_PING =
  process.argv.includes("--skip-tcp-ping") ||
  process.env.SKIP_TCP_PING === "true";
const SKIP_CHECK =
  process.argv.includes("--skip-check") || process.env.SKIP_CHECK === "true";

const IPROYAL_TOKEN =
  "Bearer c07d9ce184008ff4be5ab6afa6a67a7513e5ece56e43b60ad1ddb0b86f952318e1ebebf54825bccb6191da8ad135cc29c963ce3f1c46dc4ad8364440333d6bee44ae20e3f0e63c29d3c5139c35f84b70d88b4e5de1e2f25cf07dca5d40fa5c0fa093490a5919e3269f2fa853776c59642c50b0cfc761c7f3943edd1908605661";

// Ensure proxy directory exists
if (!fs.existsSync(PROXY_DIR)) {
  fs.mkdirSync(PROXY_DIR, { recursive: true });
}

// Helper to fetch text URL
function fetchText(
  url: string,
  headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" },
): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// Helper to fetch JSON
function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

// Helper to parse HTML tables from free-proxy-list.net
function parseFreeProxyListHtml(html: string, isSocksPage = false): string[] {
  const trs = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const proxies: string[] = [];

  for (const tr of trs) {
    const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const cols = tdMatches.map((td) => td.replace(/<[^>]*>/g, "").trim());

    if (cols.length >= 7) {
      const ip = cols[0];
      const port = cols[1];

      // Simple IP:Port validation
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip) && /^\d+$/.test(port)) {
        if (isSocksPage) {
          const version = (cols[4] || "").toLowerCase();
          const protocol = version.includes("socks5") ? "socks5" : "socks4";
          proxies.push(`${protocol}://${ip}:${port}`);
        } else {
          const isHttps = (cols[6] || "").toLowerCase() === "yes";
          const protocol = isHttps ? "https" : "http";
          proxies.push(`${protocol}://${ip}:${port}`);
        }
      }
    }
  }
  return proxies;
}

// Helper to perform a fast TCP port connection test
function tcpPing(
  ip: string,
  port: number,
  timeout: number = 1500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeout);

    socket.connect(port, ip, () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(true);
      }
    });

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        socket.unref();
        resolve(false);
      }
    };

    socket.on("error", cleanup);
    socket.on("timeout", cleanup);
  });
}

// Test a single proxy using a fast HTTP request
async function testProxy(proxyUrl: string): Promise<boolean> {
  let ip = "";
  let port = 80;
  try {
    const parsed = new URL(proxyUrl);
    ip = parsed.hostname;
    port = parseInt(parsed.port, 10) || 80;
  } catch {
    return false;
  }

  // Step 1: Fast TCP Ping to check if the port is open (if not skipped)
  if (!SKIP_TCP_PING) {
    const tcpAlive = await tcpPing(ip, port, 1500);
    if (!tcpAlive) {
      return false;
    }
  }

  // Step 2: Full HTTP(S) check
  return new Promise((resolve) => {
    let agent: any = undefined;
    try {
      if (proxyUrl.startsWith("socks")) {
        agent = new SocksProxyAgent(proxyUrl);
      } else if (proxyUrl.startsWith("http")) {
        agent = new HttpsProxyAgent(proxyUrl);
      }
    } catch {
      return resolve(false);
    }

    const options: https.RequestOptions = {
      agent,
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    };

    const req = https.get("https://httpbin.org/ip", options, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on("socket", (socket) => {
      socket.on("error", () => {
        // Prevent unhandled socket errors from crashing the Node.js process
      });
    });

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Fetch IPRoyal Proxies with Pagination
async function fetchIPRoyalProxies(): Promise<string[]> {
  const ipRoyalProxies: string[] = [];
  const baseHeaders = {
    accept: "*/*",
    origin: "https://iproyal.com",
    referer: "https://iproyal.com/",
    authorization: IPROYAL_TOKEN,
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  };

  const getPageUrl = (page: number) =>
    `https://cms.iproyal.com/api/free-proxy-records?fields[0]=ip&fields[1]=port&fields[2]=protocol&fields[3]=country&fields[4]=city&pagination[page]=${page}&pagination[pageSize]=500`;

  try {
    console.log("[Source 4] Fetching IPRoyal page 1...");
    const firstPage = await fetchJson(getPageUrl(1), baseHeaders);

    if (firstPage && Array.isArray(firstPage.data)) {
      for (const item of firstPage.data) {
        const protocol = (item.protocol || "http").toLowerCase();
        ipRoyalProxies.push(`${protocol}://${item.ip}:${item.port}`);
      }

      const pageCount = firstPage.meta?.pagination?.pageCount || 1;
      const totalCount = firstPage.meta?.pagination?.total || 0;
      console.log(
        `[Source 4] IPRoyal total proxies: ${totalCount}, pages to fetch: ${pageCount}`,
      );

      if (pageCount > 1) {
        const remainingPages = Array.from(
          { length: pageCount - 1 },
          (_, i) => i + 2,
        );

        // Fetch remaining pages in parallel batches of 5 to avoid overloading the API
        const batchSize = 5;
        for (let i = 0; i < remainingPages.length; i += batchSize) {
          const batch = remainingPages.slice(i, i + batchSize);
          console.log(
            `[Source 4] Fetching IPRoyal pages batch: ${batch.join(", ")}...`,
          );

          const promises = batch.map((page) =>
            fetchJson(getPageUrl(page), baseHeaders)
              .then((res) => {
                if (res && Array.isArray(res.data)) {
                  for (const item of res.data) {
                    const protocol = (item.protocol || "http").toLowerCase();
                    ipRoyalProxies.push(
                      `${protocol}://${item.ip}:${item.port}`,
                    );
                  }
                }
              })
              .catch((err) =>
                console.error(
                  `[Source 4 Error] Failed to fetch IPRoyal page ${page}:`,
                  err.message,
                ),
              ),
          );

          await Promise.all(promises);
          await new Promise((r) => setTimeout(r, 100)); // Minor delay between batches
        }
      }
    }
  } catch (err: any) {
    if (err.message.includes("403")) {
      console.error(
        "[Source 4 Error] IPRoyal returned 403 Forbidden. The Bearer token has likely expired.",
      );
      console.error(
        "Please extract a new Bearer token from https://iproyal.com/free-proxy-list/ and update it in scripts/fetch-proxies.ts.",
      );
    } else {
      console.error(
        "[Source 4 Error] Failed to fetch IPRoyal proxies:",
        err.message,
      );
    }
  }

  return ipRoyalProxies;
}

// Fetch Geonode Proxies with Pagination
async function fetchGeonodeProxies(): Promise<string[]> {
  const geonodeProxies: string[] = [];
  const baseHeaders = { "User-Agent": "Mozilla/5.0" };
  const getPageUrl = (page: number) =>
    `https://proxylist.geonode.com/api/proxy-list?limit=500&page=${page}&sort_by=lastChecked&sort_type=desc`;

  try {
    console.log("[Source 6] Fetching Geonode page 1...");
    const res1 = await fetchJson(getPageUrl(1), baseHeaders);
    if (res1 && Array.isArray(res1.data)) {
      for (const item of res1.data) {
        const proto = (
          (item.protocols && item.protocols[0]) ||
          "http"
        ).toLowerCase();
        geonodeProxies.push(`${proto}://${item.ip}:${item.port}`);
      }

      const total = res1.total || 0;
      const pageCount = Math.ceil(total / 500);
      console.log(
        `[Source 6] Geonode total proxies: ${total}, pages to fetch: ${pageCount}`,
      );

      if (pageCount > 1) {
        const remainingPages = Array.from(
          { length: pageCount - 1 },
          (_, i) => i + 2,
        );

        // Fetch remaining pages in parallel batches of 5 to avoid overloading the API
        const batchSize = 5;
        for (let i = 0; i < remainingPages.length; i += batchSize) {
          const batch = remainingPages.slice(i, i + batchSize);
          console.log(
            `[Source 6] Fetching Geonode pages batch: ${batch.join(", ")}...`,
          );

          const promises = batch.map((page) =>
            fetchJson(getPageUrl(page), baseHeaders)
              .then((res) => {
                if (res && Array.isArray(res.data)) {
                  for (const item of res.data) {
                    const proto = (
                      (item.protocols && item.protocols[0]) ||
                      "http"
                    ).toLowerCase();
                    geonodeProxies.push(`${proto}://${item.ip}:${item.port}`);
                  }
                }
              })
              .catch((err) =>
                console.error(
                  `[Source 6 Error] Failed to fetch Geonode page ${page}:`,
                  err.message,
                ),
              ),
          );

          await Promise.all(promises);
          await new Promise((r) => setTimeout(r, 100)); // Minor delay between batches
        }
      }
    }
  } catch (err: any) {
    console.error(
      "[Source 6 Error] Failed to fetch Geonode proxies:",
      err.message,
    );
  }

  return geonodeProxies;
}

async function main() {
  const allRawProxies: string[] = [];

  console.log("=== Fetching Proxy Lists ===");

  // --- SOURCE 1: Proxifly ---
  try {
    console.log("[Source 1] Fetching Proxifly list...");
    const content = await fetchText(
      "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt",
    );
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    allRawProxies.push(...lines);
    console.log(`[Source 1] Fetched ${lines.length} proxies.`);
  } catch (err: any) {
    console.error("[Source 1 Error] Failed to fetch Proxifly:", err.message);
  }

  // --- SOURCE 2: TheSpeedX ---
  const speedXUrls = [
    {
      url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
      protocol: "http",
    },
    {
      url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
      protocol: "socks4",
    },
    {
      url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
      protocol: "socks5",
    },
  ];

  for (const source of speedXUrls) {
    try {
      console.log(`[Source 2] Fetching TheSpeedX (${source.protocol})...`);
      const content = await fetchText(source.url);
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      const formatted = lines.map((line) => `${source.protocol}://${line}`);
      allRawProxies.push(...formatted);
      console.log(`[Source 2] Fetched ${lines.length} proxies.`);
    } catch (err: any) {
      console.error(
        `[Source 2 Error] Failed to fetch TheSpeedX ${source.protocol}:`,
        err.message,
      );
    }
  }

  // --- SOURCE 3: Free-Proxy-List.net (HTML Scrape) ---
  const htmlPages = [
    { url: "https://free-proxy-list.net/", isSocks: false },
    { url: "https://free-proxy-list.net/en/socks-proxy.html", isSocks: true },
    { url: "https://free-proxy-list.net/en/us-proxy.html", isSocks: false },
    { url: "https://free-proxy-list.net/en/uk-proxy.html", isSocks: false },
    { url: "https://free-proxy-list.net/en/ssl-proxy.html", isSocks: false },
  ];

  for (const page of htmlPages) {
    try {
      console.log(`[Source 3] Scraping HTML from ${page.url}...`);
      const html = await fetchText(page.url);
      const parsed = parseFreeProxyListHtml(html, page.isSocks);
      allRawProxies.push(...parsed);
      console.log(`[Source 3] Scraped ${parsed.length} proxies.`);
    } catch (err: any) {
      console.error(
        `[Source 3 Error] Failed to scrape ${page.url}:`,
        err.message,
      );
    }
  }

  // --- SOURCE 4: IPRoyal API ---
  const ipRoyal = await fetchIPRoyalProxies();
  allRawProxies.push(...ipRoyal);
  console.log(`[Source 4] Loaded ${ipRoyal.length} proxies from IPRoyal.`);

  // --- SOURCE 5: iplocate ---
  try {
    console.log("[Source 5] Fetching iplocate list...");
    const content = await fetchText(
      "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/all-proxies.txt",
    );
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    allRawProxies.push(...lines);
    console.log(`[Source 5] Fetched ${lines.length} proxies.`);
  } catch (err: any) {
    console.error("[Source 5 Error] Failed to fetch iplocate:", err.message);
  }

  // --- SOURCE 6: Geonode API ---
  const geonode = await fetchGeonodeProxies();
  allRawProxies.push(...geonode);
  console.log(`[Source 6] Loaded ${geonode.length} proxies from Geonode.`);

  // --- SOURCE 7: proxyfreeonly ---
  try {
    console.log("[Source 7] Fetching proxyfreeonly list...");
    const content = await fetchJson(
      "https://proxyfreeonly.com/api/free-proxy-list?limit=500&page=1&sortBy=lastChecked&sortType=desc",
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    );
    if (Array.isArray(content)) {
      for (const item of content) {
        const proto = (
          (item.protocols && item.protocols[0]) ||
          "http"
        ).toLowerCase();
        allRawProxies.push(`${proto}://${item.ip}:${item.port}`);
      }
      console.log(
        `[Source 7] Fetched ${content.length} proxies from proxyfreeonly.`,
      );
    } else {
      console.error("[Source 7 Error] proxyfreeonly response was not an array");
    }
  } catch (err: any) {
    console.error(
      "[Source 7 Error] Failed to fetch proxyfreeonly:",
      err.message,
    );
  }

  // --- SOURCE 8: databay-labs ---
  const databayUrls = [
    {
      url: "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/http.txt",
      protocol: "http",
    },
    {
      url: "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks4.txt",
      protocol: "socks4",
    },
    {
      url: "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks5.txt",
      protocol: "socks5",
    },
  ];

  for (const source of databayUrls) {
    try {
      console.log(`[Source 8] Fetching databay-labs (${source.protocol})...`);
      const content = await fetchText(source.url);
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      const formatted = lines.map((line) => `${source.protocol}://${line}`);
      allRawProxies.push(...formatted);
      console.log(`[Source 8] Fetched ${lines.length} proxies.`);
    } catch (err: any) {
      console.error(
        `[Source 8 Error] Failed to fetch databay-labs ${source.protocol}:`,
        err.message,
      );
    }
  }

  // --- SOURCE 9: monosans ---
  const monosansUrls = [
    {
      url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
      protocol: "http",
    },
    {
      url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
      protocol: "socks4",
    },
    {
      url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
      protocol: "socks5",
    },
  ];

  for (const source of monosansUrls) {
    try {
      console.log(`[Source 9] Fetching monosans (${source.protocol})...`);
      const content = await fetchText(source.url);
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      const formatted = lines.map((line) => `${source.protocol}://${line}`);
      allRawProxies.push(...formatted);
      console.log(`[Source 9] Fetched ${lines.length} proxies.`);
    } catch (err: any) {
      console.error(
        `[Source 9 Error] Failed to fetch monosans ${source.protocol}:`,
        err.message,
      );
    }
  }

  // Deduplicate
  const uniqueProxies = Array.from(new Set(allRawProxies));
  console.log(`\nTotal unique proxies fetched: ${uniqueProxies.length}`);

  if (uniqueProxies.length === 0) {
    console.log("No proxies found to verify. Exiting.");
    process.exit(0);
  }

  if (SKIP_CHECK) {
    console.log("Skipping verification check. Writing all fetched proxies...");
    fs.writeFileSync(OUTPUT_FILE, uniqueProxies.join("\n"), "utf-8");
    console.log(
      `Saved all ${uniqueProxies.length} raw proxies to: ${OUTPUT_FILE}`,
    );
    return;
  }

  // --- PRE-FLIGHT CHECK (Parallel Verification) ---
  console.log(
    `\n=== Running Pre-flight Checks (Concurrency: ${CONCURRENCY}) ===`,
  );
  const verifiedProxies: string[] = [];
  let checkedCount = 0;

  // Reset output file before checking
  fs.writeFileSync(OUTPUT_FILE, "", "utf-8");

  const startTime = Date.now();

  async function worker() {
    while (uniqueProxies.length > 0) {
      const proxy = uniqueProxies.shift();
      if (!proxy) break;

      const working = await testProxy(proxy);
      checkedCount++;

      if (working) {
        verifiedProxies.push(proxy);
        fs.appendFileSync(OUTPUT_FILE, proxy + "\n", "utf-8");
      }

      if (
        checkedCount % 100 === 0 ||
        checkedCount === uniqueProxies.length + checkedCount
      ) {
        const percentage = (
          (checkedCount / (uniqueProxies.length + checkedCount)) *
          100
        ).toFixed(1);
        console.log(
          `[Progress] Verified: ${checkedCount} proxies (${percentage}%) | Working: ${verifiedProxies.length}`,
        );
      }
    }
  }

  // Spawn parallel workers
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nVerification complete in ${duration}s!`);
  console.log(`Working proxies: ${verifiedProxies.length} / ${checkedCount}`);
  console.log(`Saved working proxies progressively to: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
});
