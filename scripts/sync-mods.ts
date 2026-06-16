process.env.UV_THREADPOOL_SIZE = "64";

// Catch and ignore transient socket/network errors from unstable proxies to prevent process crash
process.on("uncaughtException", (err: any) => {
  const isNetworkError =
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "EPIPE" ||
    err.code === "ECONNREFUSED" ||
    err.code === "EHOSTUNREACH" ||
    err.code === "ENETUNREACH" ||
    err.message?.includes("secure TLS connection") ||
    err.message?.includes("socket hang up");

  if (isNetworkError) {
    return;
  }
  console.error("Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", () => {
  // Silently ignore
});

import { initDb, loadCaches } from "./crawler-db";
import { crawlModrinth } from "./crawler-modrinth";
import { crawlModpackIndex } from "./crawler-mpi";
import { saveActiveProxies } from "./crawler-proxy";
import { crawlCurseForge } from "./crawler-cf";

// Save active proxies when user kills with Ctrl+C
process.on("SIGINT", () => {
  console.log("\n[Crawl] Interrupt received. Saving active proxies list...");
  saveActiveProxies(true);
  process.exit(0);
});

// Parse CLI flags
const args = process.argv.slice(2);
const forceReset = args.includes("--reset");
const onlyModrinth = args.includes("--only-modrinth");
const onlyMpi = args.includes("--only-mpi");
const onlyCurseForge = args.includes("--only-curseforge") || args.includes("--only-cf") || args.includes("--curseforge");
const onlyMissingModrinth = args.includes("--missing-modrinth") || args.includes("--only-missing-modrinth");
const onlyMissingVersions = args.includes("--missing-versions") || args.includes("--only-missing-versions");
const skipCurseForge = args.includes("--skip-curseforge");
const forceModrinth = args.includes("--force-modrinth");
const forceCurseForge = args.includes("--force-curseforge");
const refreshCache = args.includes("--refresh-cache") || args.includes("--refresh-modrinth-cache");
const startPageArg = args.find(a => a.startsWith("--page="))?.split("=")[1];

async function main() {
  const start = Date.now();
  console.log("Starting Unified Relational Minecraft Modlist Crawler...");
  
  try {
    // 1. Database and cache initialization
    await initDb(forceReset);
    await loadCaches();
 
    // 2. Determine execution flow based on flags
    if (onlyCurseForge) {
      await crawlCurseForge(forceCurseForge);
    } else if (onlyMissingVersions) {
      await crawlModrinth(forceModrinth, refreshCache, false, true);
    } else if (onlyMissingModrinth) {
      await crawlModrinth(forceModrinth, refreshCache, true, false);
    } else if (onlyModrinth) {
      await crawlModrinth(forceModrinth, refreshCache, false, false);
    } else if (onlyMpi) {
      await crawlModpackIndex(startPageArg);
    } else {
      // Default unified flow: Modrinth & ModpackIndex in parallel
      console.log("\n--- Executing Parallel Crawl Flow (Modrinth & ModpackIndex) ---");
      (global as any).isParallelCrawl = true;

      await Promise.all([
        crawlModrinth(forceModrinth, refreshCache, false),
        crawlModpackIndex(startPageArg)
      ]);
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`\n🎉 Success! Unified crawl sync completed in ${elapsed} seconds.`);
    saveActiveProxies(true);
    process.exit(0);
  } catch (error) {
    console.error("\nFatal error in crawler main:", error);
    process.exit(1);
  }
}

main();
