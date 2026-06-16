import fs from "fs";
import path from "path";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROXY_FILE = path.join(process.cwd(), "proxy", "fetched_proxies.txt");
const CONNS_PER_PROXY = parseInt(process.env.CONNS_PER_PROXY || "10", 10);
const MAX_FAILURES = 3;

interface ProxyStatus {
  url: string;
  activeConns: number;
  fails: number;
}

let proxyPool: ProxyStatus[] = [];
let lastSaveTime = 0;

export function loadProxies() {
  try {
    if (fs.existsSync(PROXY_FILE)) {
      const lines = fs.readFileSync(PROXY_FILE, "utf-8")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith("#"));
      
      proxyPool = lines.map(url => ({
        url,
        activeConns: 0,
        fails: 0
      }));
    } else {
      proxyPool = [];
    }
  } catch (err) {
    proxyPool = [];
  }
}

// Initial load
loadProxies();

export function saveActiveProxies(force = false) {
  const now = Date.now();
  if (!force && now - lastSaveTime < 15000) return; // throttle to 15s
  lastSaveTime = now;
  try {
    const activeUrls = proxyPool.map(p => p.url);
    fs.writeFileSync(PROXY_FILE, activeUrls.join("\n"), "utf-8");
  } catch (err) {
    // Ignore
  }
}

export function getActiveProxies(): string[] {
  return proxyPool.map(p => p.url);
}

export function getProxyCount(): number {
  return proxyPool.length;
}

// Selects the proxy with the fewest active connections
function acquireProxy(): ProxyStatus | null {
  if (proxyPool.length === 0) return null;
  
  let bestProxy: ProxyStatus | null = null;
  let minConns = Infinity;
  
  // Randomize start index to prevent herd behavior
  const startIdx = Math.floor(Math.random() * proxyPool.length);
  
  for (let i = 0; i < proxyPool.length; i++) {
    const idx = (startIdx + i) % proxyPool.length;
    const p = proxyPool[idx];
    
    if (p.activeConns < CONNS_PER_PROXY) {
      if (p.activeConns < minConns) {
        minConns = p.activeConns;
        bestProxy = p;
        if (minConns === 0) break; // Found an idle one, break early
      }
    }
  }
  
  if (bestProxy) {
    bestProxy.activeConns++;
  }
  
  return bestProxy;
}

function releaseProxy(proxy: ProxyStatus, success: boolean) {
  proxy.activeConns = Math.max(0, proxy.activeConns - 1);
  
  if (success) {
    proxy.fails = 0;
  } else {
    proxy.fails++;
    if (proxy.fails >= MAX_FAILURES) {
      // Remove dead proxy from pool
      proxyPool = proxyPool.filter(p => p !== proxy);
      saveActiveProxies();
    }
  }
}

function fetchHttps(
  urlStr: string,
  options: { headers?: Record<string, string>; agent?: any } = {}
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

    req.on("socket", (socket) => {
      socket.setTimeout(5000); // Strict 5s socket timeout
      socket.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      socket.on("error", (err) => {
        req.destroy();
        reject(err);
      });
    });
    
    // Request timeout fallback
    req.setTimeout(6000, () => {
        req.destroy();
        reject(new Error("Timeout"));
    });
  });
}

/**
 * Direct HTTP GET fetcher supporting proxy rotation.
 * The retry logic and backoff is now handled entirely here!
 */
export async function fetchWithProxy(
  url: string,
  headers: Record<string, string> = {},
  retries = 5,
  forcedProxyUrl?: string | null // Keep this signature for compatibility
): Promise<any> {
  const finalHeaders = {
    "User-Agent": "qninhdt/my-mc-modlist/1.0 (contact: qndt123@gmail.com)",
    Accept: "application/json",
    ...headers
  };

  const isForced = forcedProxyUrl !== undefined && forcedProxyUrl !== null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    // If forced proxy, construct a dummy proxy status to reuse logic
    const proxy = isForced ? { url: forcedProxyUrl as string, activeConns: 0, fails: 0 } : acquireProxy();
    let agent: any = undefined;

    if (proxy) {
      try {
        if (proxy.url.startsWith("socks")) {
          agent = new SocksProxyAgent(proxy.url, { timeout: 4000 });
        } else {
          agent = new HttpsProxyAgent(proxy.url, { timeout: 4000 });
        }
      } catch (err) {
        // Fallback to direct
      }
    } else if (!isForced && proxyPool.length > 0) {
      // Proxies exist but all are busy. Wait a bit and try again without counting as attempt.
      await sleep(100);
      attempt--;
      continue;
    }

    let res;
    try {
      res = await fetchHttps(url, {
        headers: finalHeaders,
        agent
      });
    } catch (err: any) {
      if (!isForced && proxy) releaseProxy(proxy, false);
      
      if (isForced || attempt === retries) throw err;
      await sleep(1000 + Math.random() * 1000); // Backoff 1-2s
      continue;
    }

    // Proxy works!
    if (!isForced && proxy) releaseProxy(proxy, true);

    if (res.status === 429 || res.status === 403) {
      // Cloudflare block or rate limit
      if (!isForced && proxy) {
        // Immediately kill the proxy so others don't use it
        proxy.fails = MAX_FAILURES; 
        releaseProxy(proxy, false);
      }
      throw new Error(`HTTP_${res.status}`);
    }

    if (!res.ok) {
      // Throw standard HTTP errors (like 404), proxy is fine
      throw new Error(`HTTP_${res.status}`);
    }

    return await res.json();
  }
}
