import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import { loadCaches } from "./crawler-db";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL || "file:data/mods.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function migrate() {
  console.log(`\n--- Starting Database Migration: Junction Tables ---`);
  console.log(`Connecting to database: ${url}`);

  // 1. Ensure tables and indexes are created
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mod_loaders (
      mod_id TEXT NOT NULL,
      loader_id INTEGER NOT NULL,
      PRIMARY KEY (mod_id, loader_id),
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
      FOREIGN KEY (loader_id) REFERENCES loaders(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mod_minecraft_versions (
      mod_id TEXT NOT NULL,
      minecraft_version_id INTEGER NOT NULL,
      PRIMARY KEY (mod_id, minecraft_version_id),
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
      FOREIGN KEY (minecraft_version_id) REFERENCES minecraft_versions(id) ON DELETE CASCADE
    )
  `);

  await db.execute("CREATE INDEX IF NOT EXISTS idx_mod_loaders_loader_id ON mod_loaders(loader_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mod_minecraft_versions_version_id ON mod_minecraft_versions(minecraft_version_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mod_categories_category_id ON mod_categories(category_id)");

  // Load category, loader, version caches
  await loadCaches();

  // 2. Populate mod_loaders from version_loaders
  console.log("Populating mod_loaders from version_loaders...");
  await db.execute(`
    INSERT OR IGNORE INTO mod_loaders (mod_id, loader_id)
    SELECT DISTINCT mv.mod_id, vl.loader_id
    FROM mod_versions mv
    JOIN version_loaders vl ON mv.id = vl.version_id
  `);

  // 3. Populate mod_minecraft_versions from version_minecraft_versions
  console.log("Populating mod_minecraft_versions from version_minecraft_versions...");
  await db.execute(`
    INSERT OR IGNORE INTO mod_minecraft_versions (mod_id, minecraft_version_id)
    SELECT DISTINCT mv.mod_id, vmv.minecraft_version_id
    FROM mod_versions mv
    JOIN version_minecraft_versions vmv ON mv.id = vmv.version_id
  `);

  console.log(`\n🎉 Migration successfully completed!`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
