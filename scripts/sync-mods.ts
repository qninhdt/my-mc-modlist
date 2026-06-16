import { initDb, loadCaches } from "./crawler-db";
import { crawlModrinth } from "./crawler-modrinth";
import { crawlModpackIndex } from "./crawler-mpi";
import { crawlCurseForge } from "./crawler-cf";

// Parse CLI flags
const args = process.argv.slice(2);
const forceReset = args.includes("--reset");
const onlyModrinth = args.includes("--only-modrinth");
const onlyMpi = args.includes("--only-mpi");
const onlyCurseForge = args.includes("--only-curseforge");
const skipCurseForge = args.includes("--skip-curseforge");
const forceModrinth = args.includes("--force-modrinth");
const forceCurseForge = args.includes("--force-curseforge");
const startPageArg = args.find(a => a.startsWith("--page="))?.split("=")[1];

async function main() {
  const start = Date.now();
  console.log("Starting Unified Relational Minecraft Modlist Crawler...");
  
  try {
    // 1. Database and cache initialization
    await initDb(forceReset);
    await loadCaches();

    // 2. Determine execution flow based on flags
    if (onlyModrinth) {
      await crawlModrinth(forceModrinth);
    } else if (onlyMpi) {
      await crawlModpackIndex(startPageArg);
    } else if (onlyCurseForge) {
      await crawlCurseForge(forceCurseForge);
    } else {
      // Default unified flow: Modrinth -> MPI -> CurseForge
      console.log("\n--- Executing Full Unified Crawl Flow ---");
      
      console.log("\n[Step 1/3] Running Modrinth discovery & detail crawl...");
      await crawlModrinth(forceModrinth);
      
      console.log("\n[Step 2/3] Running ModpackIndex discovery crawl...");
      await crawlModpackIndex(startPageArg);

      if (skipCurseForge) {
        console.log("\n[Step 3/3] Skipping CurseForge crawling as requested.");
      } else {
        console.log("\n[Step 3/3] Running CurseForge widget crawl for CurseForge-only mods...");
        await crawlCurseForge(forceCurseForge);
      }
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`\n🎉 Success! Unified crawl sync completed in ${elapsed} seconds.`);
    process.exit(0);
  } catch (error) {
    console.error("\nFatal error in crawler main:", error);
    process.exit(1);
  }
}

main();
