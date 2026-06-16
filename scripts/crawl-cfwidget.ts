import { initDb, loadCaches } from "./crawler-db";
import { crawlCurseForge } from "./crawler-cf";

async function main() {
  try {
    await initDb(false);
    await loadCaches();
    await crawlCurseForge();
    process.exit(0);
  } catch (error) {
    console.error("Fatal error in crawl-cfwidget:", error);
    process.exit(1);
  }
}

main();
