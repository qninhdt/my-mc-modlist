import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Use the environment variable if available, otherwise fallback to the local SQLite database file
const url = process.env.TURSO_DATABASE_URL || "file:data/mods.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken
});

// Caches for O(1) lookups to minimize DB roundtrips
export const categoryCache = new Map<string, number>();
export const authorCache = new Map<string, number>();
export const loaderCache = new Map<string, number>();
export const mcVersionCache = new Map<string, number>();

export async function loadCaches() {
  console.log("Loading metadata caches from database...");
  const cats = await db.execute("SELECT id, slug FROM categories");
  for (const row of cats.rows) {
    categoryCache.set(row.slug as string, Number(row.id));
  }
  const auths = await db.execute("SELECT id, name FROM authors");
  for (const row of auths.rows) {
    authorCache.set(row.name as string, Number(row.id));
  }
  const lods = await db.execute("SELECT id, name FROM loaders");
  for (const row of lods.rows) {
    loaderCache.set(row.name as string, Number(row.id));
  }
  const vers = await db.execute("SELECT id, version FROM minecraft_versions");
  for (const row of vers.rows) {
    mcVersionCache.set(row.version as string, Number(row.id));
  }
  console.log(
    `Caches loaded: ${categoryCache.size} categories, ${authorCache.size} authors, ${loaderCache.size} loaders, ${mcVersionCache.size} versions.`
  );
}

export async function initDb(forceReset: boolean) {
  // Configure SQLite for concurrent reads and writes, and handle locks gracefully
  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA busy_timeout = 30000;");
  await db.execute("PRAGMA foreign_keys = ON;");

  if (forceReset) {
    console.log("Flag --reset passed. Dropping existing tables...");
    await db.execute("DROP TABLE IF EXISTS version_loaders");
    await db.execute("DROP TABLE IF EXISTS version_minecraft_versions");
    await db.execute("DROP TABLE IF EXISTS mod_versions");
    await db.execute("DROP TABLE IF EXISTS mod_authors");
    await db.execute("DROP TABLE IF EXISTS mod_categories");
    await db.execute("DROP TABLE IF EXISTS loaders");
    await db.execute("DROP TABLE IF EXISTS minecraft_versions");
    await db.execute("DROP TABLE IF EXISTS authors");
    await db.execute("DROP TABLE IF EXISTS categories");
    await db.execute("DROP TABLE IF EXISTS mod_descriptions");
    await db.execute("DROP TABLE IF EXISTS mods");
    await db.execute("DROP TABLE IF EXISTS metadata");

    // Drop legacy tables
    await db.execute("DROP TABLE IF EXISTS modrinth_info");
    await db.execute("DROP TABLE IF EXISTS modrinth_projects");
    await db.execute("DROP TABLE IF EXISTS curseforge_mods");
    await db.execute("DROP TABLE IF EXISTS curseforge_mod_files");
    
    // Clear caches
    categoryCache.clear();
    authorCache.clear();
    loaderCache.clear();
    mcVersionCache.clear();
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mods (
      id TEXT PRIMARY KEY,
      mpi_id INTEGER UNIQUE,
      curse_id INTEGER UNIQUE,
      modrinth_id TEXT UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT,
      thumbnail_url TEXT,
      download_count INTEGER DEFAULT 0,
      popularity_rank INTEGER DEFAULT 0,
      latest_release_date TEXT,
      last_modified TEXT,
      last_updated TEXT,
      page_url TEXT,
      curseforge_url TEXT,
      modrinth_url TEXT,
      discord_url TEXT,
      source_url TEXT,
      issues_url TEXT,
      wiki_url TEXT,
      donate_url TEXT,
      client_side TEXT,
      server_side TEXT,
      published TEXT,
      updated TEXT,
      fetched_at TEXT,
      categories_json TEXT,
      loaders_json TEXT,
      versions_json TEXT,
      gallery_json TEXT
    )
  `);

  try {
    await db.execute("ALTER TABLE mods ADD COLUMN gallery_json TEXT;");
  } catch (e) {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mod_descriptions (
      mod_id TEXT PRIMARY KEY,
      description_compressed BLOB,
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mod_categories (
      mod_id TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (mod_id, category_id),
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      username TEXT,
      url TEXT,
      avatar_url TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mod_authors (
      mod_id TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      role TEXT,
      PRIMARY KEY (mod_id, author_id),
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS minecraft_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS loaders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mod_versions (
      id TEXT PRIMARY KEY,
      mod_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version_number TEXT,
      type TEXT,
      filesize INTEGER,
      uploaded_at TEXT,
      downloads INTEGER DEFAULT 0,
      changelog_compressed BLOB,
      FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS version_minecraft_versions (
      version_id TEXT NOT NULL,
      minecraft_version_id INTEGER NOT NULL,
      PRIMARY KEY (version_id, minecraft_version_id),
      FOREIGN KEY (version_id) REFERENCES mod_versions(id) ON DELETE CASCADE,
      FOREIGN KEY (minecraft_version_id) REFERENCES minecraft_versions(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS version_loaders (
      version_id TEXT NOT NULL,
      loader_id INTEGER NOT NULL,
      PRIMARY KEY (version_id, loader_id),
      FOREIGN KEY (version_id) REFERENCES mod_versions(id) ON DELETE CASCADE,
      FOREIGN KEY (loader_id) REFERENCES loaders(id) ON DELETE CASCADE
    )
  `);

  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_name ON mods(name)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_slug ON mods(slug)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_mpi_id ON mods(mpi_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_curse_id ON mods(curse_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mods_modrinth_id ON mods(modrinth_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_mod_versions_mod_id ON mod_versions(mod_id)");
}

export async function getOrCreateCategory(name: string, slug: string): Promise<number> {
  let id = categoryCache.get(slug);
  if (id !== undefined) return id;

  await db.execute({
    sql: "INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)",
    args: [name, slug]
  });
  const res = await db.execute({
    sql: "SELECT id FROM categories WHERE slug = ?",
    args: [slug]
  });
  if (res.rows.length > 0) {
    id = Number(res.rows[0].id);
    categoryCache.set(slug, id);
    return id;
  }
  throw new Error(`Failed to get or create category: ${name} (${slug})`);
}

export async function getOrCreateAuthor(
  name: string,
  username?: string,
  url?: string,
  avatarUrl?: string
): Promise<number> {
  let id = authorCache.get(name);
  if (id !== undefined) return id;

  await db.execute({
    sql: "INSERT OR IGNORE INTO authors (name, username, url, avatar_url) VALUES (?, ?, ?, ?)",
    args: [name, username || null, url || null, avatarUrl || null]
  });
  const res = await db.execute({
    sql: "SELECT id FROM authors WHERE name = ?",
    args: [name]
  });
  if (res.rows.length > 0) {
    id = Number(res.rows[0].id);
    authorCache.set(name, id);
    return id;
  }
  throw new Error(`Failed to get or create author: ${name}`);
}

export async function getOrCreateLoader(name: string): Promise<number> {
  const normalized = name.toLowerCase().trim();
  let id = loaderCache.get(normalized);
  if (id !== undefined) return id;

  await db.execute({
    sql: "INSERT OR IGNORE INTO loaders (name) VALUES (?)",
    args: [normalized]
  });
  const res = await db.execute({
    sql: "SELECT id FROM loaders WHERE name = ?",
    args: [normalized]
  });
  if (res.rows.length > 0) {
    id = Number(res.rows[0].id);
    loaderCache.set(normalized, id);
    return id;
  }
  throw new Error(`Failed to get or create loader: ${name}`);
}

export async function getOrCreateMinecraftVersion(version: string): Promise<number> {
  const normalized = version.trim();
  let id = mcVersionCache.get(normalized);
  if (id !== undefined) return id;

  await db.execute({
    sql: "INSERT OR IGNORE INTO minecraft_versions (version) VALUES (?)",
    args: [normalized]
  });
  const res = await db.execute({
    sql: "SELECT id FROM minecraft_versions WHERE version = ?",
    args: [normalized]
  });
  if (res.rows.length > 0) {
    id = Number(res.rows[0].id);
    mcVersionCache.set(normalized, id);
    return id;
  }
  throw new Error(`Failed to get or create Minecraft version: ${version}`);
}

export function isMinecraftVersionAllowed(version: string): boolean {
  const match = version.trim().match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (!match) return false;
  const x = parseInt(match[1], 10);
  const y = match[2] ? parseInt(match[2], 10) : 0;
  if (x < 16) return false;
  if (x === 16 && y < 5) return false;
  return true;
}

let dbWritePromise: Promise<any> = Promise.resolve();
let dbWriteQueueLength = 0;

export async function runSerializedDb<T>(fn: () => Promise<T>): Promise<T> {
  dbWriteQueueLength++;
  const next = dbWritePromise.then(async () => {
    try {
      return await fn();
    } finally {
      dbWriteQueueLength--;
    }
  });
  dbWritePromise = next.catch(() => {});
  return next;
}

export function getDbQueueLength(): number {
  return dbWriteQueueLength;
}
