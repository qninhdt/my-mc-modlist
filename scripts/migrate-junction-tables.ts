import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import {
  initDb,
  loadCaches,
  getOrCreateCategory,
  getOrCreateLoader,
  getOrCreateMinecraftVersion,
  isMinecraftVersionAllowed
} from "./crawler-db";

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

  // 2. Fetch all mods with JSON data
  console.log("Fetching mods from database...");
  const modsRes = await db.execute("SELECT id, loaders_json, versions_json, categories_json FROM mods");
  const mods = modsRes.rows;
  console.log(`Found ${mods.length} mods to process.`);

  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < mods.length; i += batchSize) {
    const batch = mods.slice(i, i + batchSize);
    const statements: any[] = [];

    for (const mod of batch) {
      const modId = mod.id as string;
      if (!modId) continue;

      // Parse and migrate Loaders
      if (mod.loaders_json) {
        try {
          const loaders = JSON.parse(mod.loaders_json as string);
          if (Array.isArray(loaders)) {
            statements.push({
              sql: "DELETE FROM mod_loaders WHERE mod_id = ?",
              args: [modId]
            });
            for (const loader of loaders) {
              const loaderId = await getOrCreateLoader(loader);
              statements.push({
                sql: "INSERT OR IGNORE INTO mod_loaders (mod_id, loader_id) VALUES (?, ?)",
                args: [modId, loaderId]
              });
            }
          }
        } catch (e) {
          console.warn(`Failed to parse loaders_json for mod ${modId}`);
        }
      }

      // Parse and migrate Versions
      if (mod.versions_json) {
        try {
          const versions = JSON.parse(mod.versions_json as string);
          if (Array.isArray(versions)) {
            statements.push({
              sql: "DELETE FROM mod_minecraft_versions WHERE mod_id = ?",
              args: [modId]
            });
            for (const version of versions) {
              if (isMinecraftVersionAllowed(version)) {
                const verId = await getOrCreateMinecraftVersion(version);
                statements.push({
                  sql: "INSERT OR IGNORE INTO mod_minecraft_versions (mod_id, minecraft_version_id) VALUES (?, ?)",
                  args: [modId, verId]
                });
              }
            }
          }
        } catch (e) {
          console.warn(`Failed to parse versions_json for mod ${modId}`);
        }
      }

      // Parse and migrate Categories (sync mod_categories just in case)
      if (mod.categories_json) {
        try {
          const categories = JSON.parse(mod.categories_json as string);
          if (Array.isArray(categories)) {
            statements.push({
              sql: "DELETE FROM mod_categories WHERE mod_id = ?",
              args: [modId]
            });
            for (const cat of categories) {
              let catName = "";
              let catSlug = "";
              if (typeof cat === "string") {
                catSlug = cat.toLowerCase().replace(/\s+/g, "-");
                catName = cat;
              } else if (cat && typeof cat === "object") {
                catSlug = cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-");
                catName = cat.name || catSlug;
              }
              if (catSlug) {
                const catId = await getOrCreateCategory(catName, catSlug);
                statements.push({
                  sql: "INSERT OR IGNORE INTO mod_categories (mod_id, category_id) VALUES (?, ?)",
                  args: [modId, catId]
                });
              }
            }
          }
        } catch (e) {
          console.warn(`Failed to parse categories_json for mod ${modId}`);
        }
      }
    }

    if (statements.length > 0) {
      try {
        await db.batch(statements, "write");
      } catch (err: any) {
        console.error(`Failed to execute batch migration for index ${i}:`, err.message);
      }
    }

    processed += batch.length;
    process.stdout.write(`\rProgress: ${processed}/${mods.length} mods migrated...`);
  }

  console.log(`\n🎉 Migration successfully completed!`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
