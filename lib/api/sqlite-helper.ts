import fs from "fs";
import path from "path";
import zlib from "zlib";
import { createClient } from "@libsql/client";
import type { ModpackIndexMod, ModrinthProject, ModrinthSearchHit, SideSupport, ModrinthVersion, ModrinthTeamMember } from "./types";
import { cached } from "./cache";


// Returns true if Turso database is available via environment variables
export function isSqliteDbAvailable(): boolean {
  if (typeof window !== "undefined") {
    return false; // Don't run in browser
  }
  return !!process.env.TURSO_DATABASE_URL;
}

// Lazy load libSQL client to avoid ESM loading issues in edge runtimes
let clientInstance: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (!clientInstance) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error("Missing TURSO_DATABASE_URL environment variable");
    }
    const authToken = process.env.TURSO_AUTH_TOKEN;
    clientInstance = createClient({ url, authToken });
  }
  return clientInstance;
}

// Caches count query results in Redis for 6 hours to completely bypass expensive Full-Table Scans on pagination clicks
async function getCachedCount(sql: string, args: any[]): Promise<number> {
  const cacheKey = `sql:count:${sql.trim().toLowerCase()}:${JSON.stringify(args)}`;
  return cached("detail", cacheKey, async () => {
    const db = getDb();
    const res = await db.execute({ sql, args });
    return Number(res.rows[0]?.count ?? 0);
  });
}

// Mapper for ModpackIndexMod
function mapMpiMod(row: any): ModpackIndexMod {
  const parseJsonArray = (val: any) => {
    if (!val) return [];
    try {
      const parsed = typeof val === "string" ? JSON.parse(val) : val;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return {
    id: Number(row.id),
    name: row.name as string,
    slug: row.slug as string,
    summary: (row.summary as string) || "",
    thumbnail_url: (row.thumbnail_url as string) || null,
    download_count: Number(row.download_count || 0),
    links: row.links_json ? JSON.parse(row.links_json as string) : {},
    curse_info: row.curse_id ? { curse_id: Number(row.curse_id) } : null,
    modrinth_info: row.modrinth_info_json ? JSON.parse(row.modrinth_info_json as string) : [],
    authors: row.authors_json ? JSON.parse(row.authors_json as string) : [],
    categories: parseJsonArray(row.categories_json).map((c: any) => 
      typeof c === "object" && c !== null ? c : { id: 0, name: String(c), slug: String(c) }
    ),
    minecraft_versions: parseJsonArray(row.versions_json).map((v: any) => 
      typeof v === "object" && v !== null ? v : { id: 0, name: String(v), slug: String(v) }
    ),
    latest_release_date: (row.latest_release_date as string) || null,
    last_updated: (row.last_updated as string) || null
  };
}

export async function localGetMpiMod(id: number): Promise<ModpackIndexMod | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: `
        SELECT 
          m.*,
          json_object('curseforge', m.curseforge_url, 'modrinth', m.modrinth_url) as links_json,
          CASE WHEN m.modrinth_id IS NOT NULL THEN json_array(json_object('project_id', m.modrinth_id, 'slug', m.slug, 'loaders', (SELECT json_group_array(DISTINCT l.name) FROM loaders l JOIN mod_loaders ml ON l.id = ml.loader_id WHERE ml.mod_id = m.id))) ELSE '[]' END as modrinth_info_json,
          (SELECT json_group_array(json_object('name', a.name, 'url', a.url)) FROM authors a JOIN mod_authors ma ON a.id = ma.author_id WHERE ma.mod_id = m.id) as authors_json,
          (SELECT json_group_array(c.slug) FROM categories c JOIN mod_categories mc ON c.id = mc.category_id WHERE mc.mod_id = m.id) as categories_json,
          (SELECT json_group_array(DISTINCT v.version) FROM minecraft_versions v JOIN mod_minecraft_versions mmv ON v.id = mmv.minecraft_version_id WHERE mmv.mod_id = m.id) as versions_json
        FROM mods m
        WHERE m.mpi_id = ? OR m.curse_id = ? OR m.id = ?
      `,
      args: [id, id, String(id)]
    });
    const row = res.rows[0];
    if (!row) return null;
    return mapMpiMod(row);
  } catch (err) {
    console.error(`[SQLite Error] Failed to get MPI mod ${id}:`, err);
    return null;
  }
}

export async function localSearchMpiMods(query: string, limit = 250): Promise<ModpackIndexMod[]> {
  try {
    const db = getDb();
    const queryTerm = query.trim().toLowerCase();
    
    let res;
    if (!queryTerm) {
      res = await db.execute({
        sql: `
          SELECT 
            m.*,
            json_object('curseforge', m.curseforge_url, 'modrinth', m.modrinth_url) as links_json,
            CASE WHEN m.modrinth_id IS NOT NULL THEN json_array(json_object('project_id', m.modrinth_id, 'slug', m.slug, 'loaders', (SELECT json_group_array(DISTINCT l.name) FROM loaders l JOIN mod_loaders ml ON l.id = ml.loader_id WHERE ml.mod_id = m.id))) ELSE '[]' END as modrinth_info_json,
            (SELECT json_group_array(json_object('name', a.name, 'url', a.url)) FROM authors a JOIN mod_authors ma ON a.id = ma.author_id WHERE ma.mod_id = m.id) as authors_json,
            (SELECT json_group_array(c.slug) FROM categories c JOIN mod_categories mc ON c.id = mc.category_id WHERE mc.mod_id = m.id) as categories_json,
            (SELECT json_group_array(DISTINCT v.version) FROM minecraft_versions v JOIN mod_minecraft_versions mmv ON v.id = mmv.minecraft_version_id WHERE mmv.mod_id = m.id) as versions_json
          FROM mods m 
          ORDER BY m.download_count DESC 
          LIMIT ?
        `,
        args: [limit]
      });
    } else {
      const cleanedWords = queryTerm.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
      if (cleanedWords.length === 0) {
        return [];
      }
      const ftsQuery = cleanedWords.map(w => `${w}*`).join(" AND ");

      res = await db.execute({
        sql: `
          SELECT 
            m.*,
            json_object('curseforge', m.curseforge_url, 'modrinth', m.modrinth_url) as links_json,
            CASE WHEN m.modrinth_id IS NOT NULL THEN json_array(json_object('project_id', m.modrinth_id, 'slug', m.slug, 'loaders', (SELECT json_group_array(DISTINCT l.name) FROM loaders l JOIN mod_loaders ml ON l.id = ml.loader_id WHERE ml.mod_id = m.id))) ELSE '[]' END as modrinth_info_json,
            (SELECT json_group_array(json_object('name', a.name, 'url', a.url)) FROM authors a JOIN mod_authors ma ON a.id = ma.author_id WHERE ma.mod_id = m.id) as authors_json,
            (SELECT json_group_array(c.slug) FROM categories c JOIN mod_categories mc ON c.id = mc.category_id WHERE mc.mod_id = m.id) as categories_json,
            (SELECT json_group_array(DISTINCT v.version) FROM minecraft_versions v JOIN mod_minecraft_versions mmv ON v.id = mmv.minecraft_version_id WHERE mmv.mod_id = m.id) as versions_json
          FROM mods_fts f
          JOIN mods m ON f.rowid = m.rowid
          WHERE mods_fts MATCH ?
          ORDER BY m.download_count DESC 
          LIMIT ?
        `,
        args: [ftsQuery, limit]
      });
    }
    
    return res.rows.map(mapMpiMod);
  } catch (err) {
    console.error(`[SQLite Error] Failed to search MPI mods for "${query}":`, err);
    return [];
  }
}

export async function localSearchMpiModsPaged(
  query: string,
  opts: {
    loaders?: string[];
    versions?: string[];
    categories?: string[];
    sort?: "relevance" | "downloads" | "follows" | "newest" | "updated";
    offset?: number;
    limit?: number;
  } = {}
): Promise<{ hits: ModpackIndexMod[]; total: number }> {
  try {
    const db = getDb();
    const queryTerm = query.trim().toLowerCase();
    const limitVal = opts.limit ?? 20;
    const offsetVal = opts.offset ?? 0;

    const whereParts: string[] = ["m.curse_id IS NOT NULL"];
    const args: any[] = [];

    // FTS search term
    if (queryTerm) {
      const cleanedWords = queryTerm.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
      if (cleanedWords.length === 0) {
        return { hits: [], total: 0 };
      }
      const ftsQuery = cleanedWords.map(w => `%${w}%`);
      whereParts.push("(" + ftsQuery.map(() => "m.name LIKE ? OR m.slug LIKE ?").join(" AND ") + ")");
      ftsQuery.forEach(q => { args.push(q); args.push(q); });
    }

    // Loaders filter
    if (opts.loaders?.length) {
      const placeholders = opts.loaders.map(() => "?").join(", ");
      whereParts.push(`m.id IN (SELECT ml.mod_id FROM mod_loaders ml JOIN loaders l ON ml.loader_id = l.id WHERE l.name IN (${placeholders}))`);
      opts.loaders.forEach(l => args.push(l.toLowerCase().trim()));
    }

    // Versions filter
    if (opts.versions?.length) {
      const placeholders = opts.versions.map(() => "?").join(", ");
      whereParts.push(`m.id IN (SELECT mmv.mod_id FROM mod_minecraft_versions mmv JOIN minecraft_versions v ON mmv.minecraft_version_id = v.id WHERE v.version IN (${placeholders}))`);
      opts.versions.forEach(v => args.push(v.trim()));
    }

    // Categories filter (matches categories or loaders)
    if (opts.categories?.length) {
      const placeholders = opts.categories.map(() => "?").join(", ");
      whereParts.push(`(
        EXISTS (
          SELECT 1 FROM mod_categories mc
          JOIN categories c ON mc.category_id = c.id
          WHERE mc.mod_id = m.id AND c.slug IN (${placeholders})
        ) OR m.id IN (SELECT ml.mod_id FROM mod_loaders ml JOIN loaders l ON ml.loader_id = l.id WHERE l.name IN (${placeholders}))
      )`);
      opts.categories.forEach(c => args.push(c.toLowerCase().trim()));
      opts.categories.forEach(c => args.push(c.toLowerCase().trim()));
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Determine sorting and index
    let orderBy = "m.download_count DESC";
    let indexHint = "INDEXED BY idx_mods_download_count";
    const sort = opts.sort ?? "relevance";
    if (sort === "downloads" || sort === "relevance") {
      orderBy = "m.download_count DESC";
      indexHint = "INDEXED BY idx_mods_download_count";
    } else if (sort === "follows") {
      orderBy = "m.popularity_rank DESC";
      indexHint = "INDEXED BY idx_mods_popularity_rank";
    } else if (sort === "newest") {
      orderBy = "m.published DESC";
      indexHint = "INDEXED BY idx_mods_published";
    } else if (sort === "updated") {
      orderBy = "m.updated DESC";
      indexHint = "INDEXED BY idx_mods_updated";
    }

    // Do not force index if we are using FTS, as SQLite might prefer the FTS virtual table approach
    if (queryTerm) {
      indexHint = "";
    }

    // 1. Get total count (cached in Redis to bypass Full-Table Scans on pagination)
    let countSql = "";
    if (queryTerm) {
      countSql = `SELECT COUNT(*) as count FROM mods m ${whereClause}`;
    } else {
      countSql = `SELECT COUNT(*) as count FROM mods m ${whereClause}`;
    }

    const total = await getCachedCount(countSql, args);

    if (total === 0) {
      return { hits: [], total: 0 };
    }

    // 2. Fetch page results
    const selectSql = `
        SELECT 
          m.*,
          json_object('curseforge', m.curseforge_url, 'modrinth', m.modrinth_url) as links_json,
          CASE WHEN m.modrinth_id IS NOT NULL THEN json_array(json_object('project_id', m.modrinth_id, 'slug', m.slug, 'loaders', (SELECT json_group_array(DISTINCT l.name) FROM loaders l JOIN mod_loaders ml ON l.id = ml.loader_id WHERE ml.mod_id = m.id))) ELSE '[]' END as modrinth_info_json,
          (SELECT json_group_array(json_object('name', a.name, 'url', a.url)) FROM authors a JOIN mod_authors ma ON a.id = ma.author_id WHERE ma.mod_id = m.id) as authors_json,
          (SELECT json_group_array(c.slug) FROM categories c JOIN mod_categories mc ON c.id = mc.category_id WHERE mc.mod_id = m.id) as categories_json,
          (SELECT json_group_array(DISTINCT v.version) FROM minecraft_versions v JOIN mod_minecraft_versions mmv ON v.id = mmv.minecraft_version_id WHERE mmv.mod_id = m.id) as versions_json
        FROM mods m ${indexHint}
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;

    const selectArgs = [...args, limitVal, offsetVal];
    const res = await db.execute({
      sql: selectSql,
      args: selectArgs
    });

    const hits = res.rows.map(mapMpiMod);
    return { hits, total };
  } catch (err) {
    console.error(`[SQLite Error] Failed to search MPI mods:`, err);
    return { hits: [], total: 0 };
  }
}


// Mapper for ModrinthProject
function mapModrinthProject(row: any): ModrinthProject & { game_versions?: string[] } {
  let bodyBuffer: Buffer | null = null;
  if (row.body_compressed) {
    if (typeof row.body_compressed === "object" && row.body_compressed.type === "Buffer") {
      bodyBuffer = Buffer.from(row.body_compressed.data);
    } else {
      bodyBuffer = Buffer.from(row.body_compressed as ArrayBuffer);
    }
  }

  const body = bodyBuffer
    ? zlib.inflateSync(bodyBuffer).toString("utf-8")
    : (row.description as string) || "";

  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string) || "",
    categories: row.categories ? JSON.parse(row.categories as string) : [],
    loaders: row.loaders ? JSON.parse(row.loaders as string) : [],
    game_versions: row.game_versions ? JSON.parse(row.game_versions as string) : [],
    downloads: Number(row.downloads || 0),
    followers: Number(row.followers || 0),
    icon_url: (row.icon_url as string) || null,
    client_side: ((row.client_side as string) || "unknown") as SideSupport,
    server_side: ((row.server_side as string) || "unknown") as SideSupport,
    discord_url: (row.discord_url as string) || undefined,
    source_url: (row.source_url as string) || undefined,
    issues_url: (row.issues_url as string) || undefined,
    wiki_url: (row.wiki_url as string) || undefined,
    body: body,
    published: (row.published as string) || undefined,
    updated: (row.updated as string) || undefined,
    gallery: row.gallery ? JSON.parse(row.gallery as string) : []
  };
}

export async function localGetModrinthProject(idOrSlug: string): Promise<ModrinthProject | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: `
        SELECT
          m.id,
          m.slug,
          m.name as title,
          m.summary as description,
          d.description_compressed as body_compressed,
          m.download_count as downloads,
          m.popularity_rank as followers,
          m.thumbnail_url as icon_url,
          m.client_side,
          m.server_side,
          m.discord_url,
          m.source_url,
          m.issues_url,
          m.wiki_url,
          m.published,
          m.updated,
          (SELECT json_group_array(c.slug) FROM categories c JOIN mod_categories mc ON c.id = mc.category_id WHERE mc.mod_id = m.id) as categories,
          (SELECT json_group_array(DISTINCT l.name) FROM loaders l JOIN mod_loaders ml ON l.id = ml.loader_id WHERE ml.mod_id = m.id) as loaders,
          (SELECT json_group_array(DISTINCT v.version) FROM minecraft_versions v JOIN mod_minecraft_versions mmv ON v.id = mmv.minecraft_version_id WHERE mmv.mod_id = m.id) as game_versions
        FROM mods m
        LEFT JOIN mod_descriptions d ON m.id = d.mod_id
        WHERE m.id = ? OR m.slug = ? OR m.modrinth_id = ?
      `,
      args: [idOrSlug, idOrSlug, idOrSlug]
    });
    const row = res.rows[0];
    if (!row) return null;
    return mapModrinthProject(row);
  } catch (err) {
    console.error(`[SQLite Error] Failed to get Modrinth project ${idOrSlug}:`, err);
    return null;
  }
}

export async function localSearchModrinthProjects(
  query: string,
  opts: {
    loaders?: string[];
    versions?: string[];
    categories?: string[];
    environments?: string[];
    sort?: "relevance" | "downloads" | "follows" | "newest" | "updated";
    offset?: number;
    limit?: number;
  } = {}
): Promise<{ hits: (ModrinthSearchHit & { game_versions?: string[] })[]; total: number }> {
  try {
    const db = getDb();
    const queryTerm = query.trim().toLowerCase();
    const limitVal = opts.limit ?? 30;
    const offsetVal = opts.offset ?? 0;

    const whereParts: string[] = [];
    const args: any[] = [];
    let ftsJoin = "";

    // FTS search term
    if (queryTerm) {
      const cleanedWords = queryTerm.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
      if (cleanedWords.length === 0) {
        return { hits: [], total: 0 };
      }
      const ftsMatchQuery = cleanedWords.map(w => `${w}*`).join(" AND ");
      ftsJoin = "JOIN mods_fts f ON m.rowid = f.rowid";
      whereParts.push("mods_fts MATCH ?");
      args.push(ftsMatchQuery);
    }

    // Loaders filter
    if (opts.loaders?.length) {
      const placeholders = opts.loaders.map(() => "?").join(", ");
      whereParts.push(`m.id IN (SELECT ml.mod_id FROM mod_loaders ml JOIN loaders l ON ml.loader_id = l.id WHERE l.name IN (${placeholders}))`);
      opts.loaders.forEach(l => args.push(l.toLowerCase().trim()));
    }

    // Versions filter
    if (opts.versions?.length) {
      const placeholders = opts.versions.map(() => "?").join(", ");
      whereParts.push(`m.id IN (SELECT mmv.mod_id FROM mod_minecraft_versions mmv JOIN minecraft_versions v ON mmv.minecraft_version_id = v.id WHERE v.version IN (${placeholders}))`);
      opts.versions.forEach(v => args.push(v.trim()));
    }

    // Categories filter (matches categories or loaders)
    if (opts.categories?.length) {
      const placeholders = opts.categories.map(() => "?").join(", ");
      whereParts.push(`(
        EXISTS (
          SELECT 1 FROM mod_categories mc
          JOIN categories c ON mc.category_id = c.id
          WHERE mc.mod_id = m.id AND c.slug IN (${placeholders})
        ) OR m.id IN (SELECT ml.mod_id FROM mod_loaders ml JOIN loaders l ON ml.loader_id = l.id WHERE l.name IN (${placeholders}))
      )`);
      opts.categories.forEach(c => args.push(c.toLowerCase().trim()));
      opts.categories.forEach(c => args.push(c.toLowerCase().trim()));
    }

    // Environments filter
    if (opts.environments?.length) {
      for (const env of opts.environments) {
        if (env === "client") {
          whereParts.push("m.client_side != 'unsupported'");
        } else if (env === "server") {
          whereParts.push("m.server_side != 'unsupported'");
        }
      }
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Determine sorting and index
    let orderBy = "m.download_count DESC";
    let indexHint = "INDEXED BY idx_mods_download_count";
    const sort = opts.sort ?? "relevance";
    if (sort === "downloads" || sort === "relevance") {
      orderBy = "m.download_count DESC";
      indexHint = "INDEXED BY idx_mods_download_count";
    } else if (sort === "follows") {
      orderBy = "m.popularity_rank DESC";
      indexHint = "INDEXED BY idx_mods_popularity_rank";
    } else if (sort === "newest") {
      orderBy = "m.published DESC";
      indexHint = "INDEXED BY idx_mods_published";
    } else if (sort === "updated") {
      orderBy = "m.updated DESC";
      indexHint = "INDEXED BY idx_mods_updated";
    }

    // Do not force index if we are using FTS, as SQLite might prefer the FTS virtual table approach
    if (queryTerm) {
      indexHint = "";
    }

    // 1. Get total count
    let countSql = "";
    if (queryTerm) {
      countSql = `SELECT COUNT(*) as count FROM mods m ${ftsJoin} ${whereClause}`;
    } else {
      countSql = `SELECT COUNT(*) as count FROM mods m ${whereClause}`;
    }

    const total = await getCachedCount(countSql, args);

    if (total === 0) {
      return { hits: [], total: 0 };
    }

    // 2. Fetch page results
    const selectSql = `
        SELECT 
          m.id, m.slug, m.name as title, m.summary as description,
          m.download_count as downloads, m.popularity_rank as followers,
          m.thumbnail_url as icon_url, m.client_side, m.server_side, m.updated,
          (SELECT json_group_array(c.slug) FROM categories c JOIN mod_categories mc ON c.id = mc.category_id WHERE mc.mod_id = m.id) as categories,
          (SELECT json_group_array(DISTINCT l.name) FROM loaders l JOIN mod_loaders ml ON l.id = ml.loader_id WHERE ml.mod_id = m.id) as loaders,
          (SELECT json_group_array(DISTINCT v.version) FROM minecraft_versions v JOIN mod_minecraft_versions mmv ON v.id = mmv.minecraft_version_id WHERE mmv.mod_id = m.id) as game_versions
        FROM mods m ${indexHint}
        ${ftsJoin}
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;

    const selectArgs = [...args, limitVal, offsetVal];
    const res = await db.execute({
      sql: selectSql,
      args: selectArgs
    });

    const projects = res.rows.map(mapModrinthProject);
    const hits = projects.map((p: any) => ({
      project_id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description || "",
      categories: [...(p.categories || []), ...(p.loaders || [])],
      client_side: p.client_side || "unknown",
      server_side: p.server_side || "unknown",
      downloads: p.downloads || 0,
      icon_url: p.icon_url || null,
      follows: p.followers || 0,
      date_modified: p.updated || new Date().toISOString(),
      gallery: p.gallery?.map((g: any) => g.url) || [],
      featured_gallery: p.gallery?.find((g: any) => g.featured)?.url || null,
      game_versions: p.game_versions || [],
    }));

    return { hits, total };
  } catch (err) {
    console.error(`[SQLite Error] Failed to search Modrinth projects for "${query}":`, err);
    return { hits: [], total: 0 };
  }
}

// Reconstruct CurseForge widget response structure from database tables
export async function localGetCurseforgeMod(id: number): Promise<any | null> {
  try {
    const db = getDb();
    
    // Query the mod detail from mods and mod_descriptions
    const modRes = await db.execute({
      sql: `
        SELECT 
          m.*,
          d.description_compressed
        FROM mods m
        LEFT JOIN mod_descriptions d ON m.id = d.mod_id
        WHERE m.curse_id = ?
      `,
      args: [id]
    });
    const modRow = modRes.rows[0];
    if (!modRow) return null;

    const canonicalId = modRow.id as string;
    const slug = modRow.slug as string;

    // Decompress description HTML
    let bodyBuffer: Buffer | null = null;
    const descComp = modRow.description_compressed as any;
    if (descComp) {
      if (typeof descComp === "object" && descComp.type === "Buffer") {
        bodyBuffer = Buffer.from(descComp.data);
      } else {
        bodyBuffer = Buffer.from(descComp as ArrayBuffer);
      }
    }
    const description = bodyBuffer
      ? zlib.inflateSync(bodyBuffer).toString("utf-8")
      : (modRow.summary as string) || "";

    // Parse categories from categories_json (precomputed JSON array)
    const categories = modRow.categories_json
      ? JSON.parse(modRow.categories_json as string)
      : [];

    // Query members/authors from mod_authors and authors
    const memberRes = await db.execute({
      sql: `
        SELECT 
          a.name,
          a.username,
          ma.role
        FROM mod_authors ma
        JOIN authors a ON ma.author_id = a.id
        WHERE ma.mod_id = ?
      `,
      args: [canonicalId]
    });
    const members = memberRes.rows.map((row: any) => ({
      username: (row.username as string) || (row.name as string),
      title: (row.role as string) || "Author"
    }));

    // Query files using our localGetCurseforgeModFiles
    const files = (await localGetCurseforgeModFiles(id)) || [];

    return {
      id: Number(modRow.curse_id),
      name: modRow.name as string,
      slug: slug,
      summary: modRow.summary as string,
      description,
      thumbnail: modRow.thumbnail_url as string,
      downloads: {
        total: Number(modRow.download_count || 0)
      },
      donate: modRow.donate_url as string,
      created_at: modRow.published as string,
      urls: {
        project: (modRow.curseforge_url as string) || (modRow.page_url as string) || `https://www.curseforge.com/minecraft/mc-mods/${slug}`,
        issues: modRow.issues_url as string,
        source: modRow.source_url as string,
        wiki: modRow.wiki_url as string
      },
      categories,
      members,
      files
    };
  } catch (err) {
    console.error(`[SQLite Error] Failed to get CurseForge mod ${id}:`, err);
    return null;
  }
}

// Reconstruct CurseForge files list from database tables
export async function localGetCurseforgeModFiles(curseId: number): Promise<any[] | null> {
  try {
    const db = getDb();
    
    // Find the canonical mod id and slug
    const modRes = await db.execute({
      sql: "SELECT id, slug FROM mods WHERE curse_id = ?",
      args: [curseId]
    });
    const modRow = modRes.rows[0];
    if (!modRow) return null;

    const canonicalId = modRow.id as string;
    const slug = modRow.slug as string;

    // Check if we have files in database
    const fileRes = await db.execute({
      sql: `
        SELECT 
          v.id,
          v.name,
          v.version_number as display,
          v.type,
          v.filesize,
          v.uploaded_at,
          v.downloads,
          (
            SELECT json_group_array(mv.version) 
            FROM version_minecraft_versions vmv
            JOIN minecraft_versions mv ON vmv.minecraft_version_id = mv.id
            WHERE vmv.version_id = v.id
          ) as game_versions_json,
          (
            SELECT json_group_array(l.name)
            FROM version_loaders vl
            JOIN loaders l ON vl.loader_id = l.id
            WHERE vl.version_id = v.id
          ) as loaders_json
        FROM mod_versions v
        WHERE v.mod_id = ?
        ORDER BY v.uploaded_at DESC
      `,
      args: [canonicalId]
    });
    
    if (fileRes.rows.length === 0) return null;

    return fileRes.rows.map((f: any) => {
      const gameVersions = f.game_versions_json
        ? JSON.parse(f.game_versions_json as string)
        : [];
      const loaders = f.loaders_json
        ? JSON.parse(f.loaders_json as string)
        : [];

      // Reconstruct versions array expected by the caller (which merges game versions and loaders)
      const versions = [...gameVersions, ...loaders.map((l: string) => l.toLowerCase())];

      // Reconstruct type
      const rawType = f.type;
      const type =
        rawType === "release" || rawType === "beta" || rawType === "alpha"
          ? rawType
          : rawType === 1
          ? "release"
          : rawType === 2
          ? "beta"
          : rawType === 3
          ? "alpha"
          : "release";

      return {
        id: Number(f.id),
        name: f.name as string,
        display: (f.display as string) || (f.name as string),
        type,
        filesize: Number(f.filesize || 0),
        uploaded_at: f.uploaded_at,
        downloads: Number(f.downloads || 0),
        versions,
        url: f.name ? `https://www.curseforge.com/minecraft/mc-mods/${slug}/download/${f.id}` : ""
      };
    });
  } catch (err) {
    console.error(`[SQLite Error] Failed to get CurseForge mod files ${curseId}:`, err);
    return null;
  }
}

function mapModrinthVersion(row: any, slug: string): ModrinthVersion {
  let changelogBuffer: Buffer | null = null;
  if (row.changelog_compressed) {
    if (typeof row.changelog_compressed === "object" && row.changelog_compressed.type === "Buffer") {
      changelogBuffer = Buffer.from(row.changelog_compressed.data);
    } else {
      changelogBuffer = Buffer.from(row.changelog_compressed as ArrayBuffer);
    }
  }
  const changelog = changelogBuffer
    ? zlib.inflateSync(changelogBuffer).toString("utf-8")
    : "";

  const gameVersions = row.game_versions_json ? JSON.parse(row.game_versions_json as string) : [];
  const loaders = row.loaders_json ? JSON.parse(row.loaders_json as string) : [];
  
  const filename = `${slug}-${row.version_number}.jar`;
  const url = `https://cdn.modrinth.com/data/${row.mod_id}/versions/${row.id}/${filename}`;

  return {
    id: row.id as string,
    project_id: row.mod_id as string,
    name: row.name as string,
    version_number: row.version_number as string,
    changelog: changelog,
    dependencies: [],
    game_versions: gameVersions,
    version_type: (row.version_type as any) || "release",
    loaders: loaders,
    featured: false,
    status: "listed",
    date_published: row.date_published as string,
    downloads: Number(row.downloads || 0),
    files: [
      {
        hashes: { sha1: "", sha512: "" },
        url: url,
        filename: filename,
        primary: true,
        size: Number(row.filesize || 0),
        file_type: null
      }
    ]
  };
}

export async function localGetProjectVersions(
  projectId: string,
  opts?: { loaders?: string[]; gameVersions?: string[] }
): Promise<ModrinthVersion[]> {
  try {
    const db = getDb();
    
    // First, find the real mod id/slug to ensure we query correct versions
    const projectRes = await db.execute({
      sql: "SELECT id, slug FROM mods WHERE id = ? OR slug = ? OR modrinth_id = ?",
      args: [projectId, projectId, projectId]
    });
    const projectRow = projectRes.rows[0];
    if (!projectRow) {
      return [];
    }
    const realModId = projectRow.id as string;
    const slug = projectRow.slug as string;

    const whereParts: string[] = ["v.mod_id = ?"];
    const args: any[] = [realModId];

    if (opts?.loaders?.length) {
      const loadersPlaceholder = opts.loaders.map(() => "?").join(", ");
      whereParts.push(`EXISTS (
        SELECT 1 FROM version_loaders vl
        JOIN loaders l ON vl.loader_id = l.id
        WHERE vl.version_id = v.id AND l.name IN (${loadersPlaceholder})
      )`);
      opts.loaders.forEach((l) => args.push(l.toLowerCase()));
    }

    if (opts?.gameVersions?.length) {
      const gvPlaceholder = opts.gameVersions.map(() => "?").join(", ");
      whereParts.push(`EXISTS (
        SELECT 1 FROM version_minecraft_versions vmv
        JOIN minecraft_versions mv ON vmv.minecraft_version_id = mv.id
        WHERE vmv.version_id = v.id AND mv.version IN (${gvPlaceholder})
      )`);
      opts.gameVersions.forEach((v) => args.push(v));
    }

    const whereClause = whereParts.join(" AND ");
    const sql = `
      SELECT 
        v.id,
        v.mod_id,
        v.name,
        v.version_number,
        v.type as version_type,
        v.filesize,
        v.uploaded_at as date_published,
        v.downloads,
        v.changelog_compressed,
        (
          SELECT json_group_array(mv.version) 
          FROM version_minecraft_versions vmv
          JOIN minecraft_versions mv ON vmv.minecraft_version_id = mv.id
          WHERE vmv.version_id = v.id
        ) as game_versions_json,
        (
          SELECT json_group_array(l.name)
          FROM version_loaders vl
          JOIN loaders l ON vl.loader_id = l.id
          WHERE vl.version_id = v.id
        ) as loaders_json
      FROM mod_versions v
      WHERE ${whereClause}
      ORDER BY v.uploaded_at DESC
    `;

    const res = await db.execute({ sql, args });
    return res.rows.map((row: any) => mapModrinthVersion(row, slug));
  } catch (err) {
    console.error(`[SQLite Error] Failed to get project versions for ${projectId}:`, err);
    return [];
  }
}

export async function localGetVersion(versionId: string): Promise<ModrinthVersion | null> {
  try {
    const db = getDb();
    const sql = `
      SELECT 
        v.id,
        v.mod_id,
        v.name,
        v.version_number,
        v.type as version_type,
        v.filesize,
        v.uploaded_at as date_published,
        v.downloads,
        v.changelog_compressed,
        m.slug,
        (
          SELECT json_group_array(mv.version) 
          FROM version_minecraft_versions vmv
          JOIN minecraft_versions mv ON vmv.minecraft_version_id = mv.id
          WHERE vmv.version_id = v.id
        ) as game_versions_json,
        (
          SELECT json_group_array(l.name)
          FROM version_loaders vl
          JOIN loaders l ON vl.loader_id = l.id
          WHERE vl.version_id = v.id
        ) as loaders_json
      FROM mod_versions v
      JOIN mods m ON v.mod_id = m.id
      WHERE v.id = ?
    `;

    const res = await db.execute({ sql, args: [versionId] });
    const row = res.rows[0];
    if (!row) return null;
    return mapModrinthVersion(row, row.slug as string);
  } catch (err) {
    console.error(`[SQLite Error] Failed to get version ${versionId}:`, err);
    return null;
  }
}

export async function localGetProjectMembers(
  projectId: string
): Promise<ModrinthTeamMember[]> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: `
        SELECT 
          a.id as author_id,
          a.name,
          a.username,
          a.url,
          a.avatar_url,
          ma.role
        FROM mod_authors ma
        JOIN authors a ON ma.author_id = a.id
        JOIN mods m ON ma.mod_id = m.id
        WHERE m.id = ? OR m.slug = ? OR m.modrinth_id = ?
      `,
      args: [projectId, projectId, projectId]
    });
    
    return res.rows.map((row: any) => ({
      team_id: "",
      user: {
        id: String(row.author_id),
        username: (row.username as string) || (row.name as string).toLowerCase().replace(/\s+/g, "_"),
        name: row.name as string,
        avatar_url: (row.avatar_url as string) || "",
        created: ""
      },
      role: (row.role as string) || "Author",
      permissions: null,
      accepted: true
    }));
  } catch (err) {
    console.error(`[SQLite Error] Failed to get project members for ${projectId}:`, err);
    return [];
  }
}

export async function localGetCurseforgeFile(fileId: number): Promise<any | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: `
        SELECT 
          v.id,
          v.name,
          v.version_number,
          v.type,
          v.filesize,
          v.uploaded_at,
          m.slug
        FROM mod_versions v
        JOIN mods m ON v.mod_id = m.id
        WHERE v.id = ?
      `,
      args: [String(fileId)]
    });
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      name: row.name as string,
      display: row.name as string,
      version_number: row.version_number as string,
      type: row.type as string,
      filesize: Number(row.filesize || 0),
      uploaded_at: row.uploaded_at as string,
      slug: row.slug as string
    };
  } catch (err) {
    console.error(`[SQLite Error] Failed to get CurseForge file ${fileId}:`, err);
    return null;
  }
}

export async function localGetModBySlug(slug: string): Promise<any | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: "SELECT * FROM mods WHERE slug = ? OR id = ? OR mpi_id = ? OR curse_id = ? OR modrinth_id = ?",
      args: [slug, slug, slug, slug, slug]
    });
    return res.rows[0] || null;
  } catch (err) {
    console.error(`[SQLite Error] Failed to get mod by slug ${slug}:`, err);
    return null;
  }
}



