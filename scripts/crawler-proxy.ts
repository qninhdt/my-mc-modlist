import fs from "fs";
import path from "path";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROXY_FILE = path.join(process.cwd(), "proxy", "fetched_proxies.txt");
let proxies: string[] = [];
let proxyIndex = 0;

export function loadProxies() {
  try {
    if (fs.existsSync(PROXY_FILE)) {
      proxies = fs.readFileSync(PROXY_FILE, "utf-8")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith("#"));
    } else {
      proxies = [];
    }
  } catch (err) {
    proxies = [];
  }
}

// Initial load
loadProxies();

export function getActiveProxies(): string[] {
  return [...proxies];
}

export function getProxyCount(): number {
  return proxies.length;
}

function getNextProxy(): string | null {
  if (proxies.length === 0) return null;
  const proxy = proxies[proxyIndex];
  proxyIndex = (proxyIndex + 1) % proxies.length;
  return proxy;
}

function fetchHttps(
  urlStr: string,
  options: { headers?: Record<string, string>; agent?: any; signal?: AbortSignal } = {}
): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "GET",
      headers: options.headers,
      agent: options.agent,
    };

    const req = https.get(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          ok: res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false,
          status: res.statusCode || 500,
          statusText: res.statusMessage || "",
          json: async () => {
            try {
              return JSON.parse(data);
            } catch (err) {
              throw new Error(`Failed to parse JSON response: ${data.slice(0, 100)}`);
            }
          }
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
    }
  });
}

/**
 * Direct HTTP GET fetcher with auto-retry on fail and rate-limit backoff,
 * supporting proxy rotation for CurseForge requests.
 */
export async function fetchWithProxy(
  url: string,
  headers: Record<string, string> = {},
  retries = 5,
  forcedProxyUrl?: string | null
): Promise<any> {
  const finalHeaders = {
    "User-Agent": "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)",
    Accept: "application/json",
    ...headers
  };

  const isForced = forcedProxyUrl !== undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const proxyUrl = isForced ? forcedProxyUrl : getNextProxy();
    let agent: any = undefined;

    if (proxyUrl) {
      try {
        if (proxyUrl.startsWith("socks")) {
          agent = new SocksProxyAgent(proxyUrl);
        } else {
          agent = new HttpsProxyAgent(proxyUrl);
        }
      } catch (err) {
        // Fallback to direct
      }
    }

    try {
      const res = await fetchHttps(url, {
        headers: finalHeaders,
        agent,
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      if (res.status === 429) {
        const delaySeconds = 10;
        await sleep(delaySeconds * 1000);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err: any) {
      // If a proxy request failed, prune the proxy so we don't try it again
      if (proxyUrl) {
        const idx = proxies.indexOf(proxyUrl);
        if (idx > -1) {
          proxies.splice(idx, 1);
          if (proxyIndex >= proxies.length) {
            proxyIndex = 0;
          }
        }
      }

      // If this was a forced proxy and it is now pruned, don't keep retrying on it
      if (attempt === retries || (isForced && proxyUrl && !proxies.includes(proxyUrl))) {
        throw err;
      }
      const backoff = attempt * 1000;
      await sleep(backoff);
    }
  }
}
