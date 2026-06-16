import fs from "fs";
import path from "path";
import zlib from "zlib";
import { createClient } from "@libsql/client";
import type { ModpackIndexMod, ModrinthProject, ModrinthSearchHit, SideSupport } from "./types";

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

// Mapper for ModpackIndexMod
function mapMpiMod(row: any): ModpackIndexMod {
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
    categories: row.categories_json ? JSON.parse(row.categories_json as string) : [],
    minecraft_versions: row.versions_json ? JSON.parse(row.versions_json as string) : [],
    latest_release_date: (row.latest_release_date as string) || null,
    last_updated: (row.last_updated as string) || null
  };
}

export async function localGetMpiMod(id: number): Promise<ModpackIndexMod | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: "SELECT * FROM mods WHERE id = ?",
      args: [id]
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
        sql: "SELECT * FROM mods ORDER BY download_count DESC LIMIT ?",
        args: [limit]
      });
    } else {
      res = await db.execute({
        sql: `
          SELECT * FROM mods 
          WHERE name LIKE ? OR slug LIKE ? OR summary LIKE ?
          ORDER BY download_count DESC 
          LIMIT ?
        `,
        args: [`%${queryTerm}%`, `%${queryTerm}%`, `%${queryTerm}%`, limit]
      });
    }
    
    return res.rows.map(mapMpiMod);
  } catch (err) {
    console.error(`[SQLite Error] Failed to search MPI mods for "${query}":`, err);
    return [];
  }
}

// Mapper for ModrinthProject
function mapModrinthProject(row: any): ModrinthProject & { game_versions?: string[] } {
  const body = row.body_compressed
    ? zlib.inflateSync(Buffer.from(row.body_compressed as Uint8Array)).toString("utf-8")
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
    updated: (row.updated as string) || undefined
  };
}

export async function localGetModrinthProject(idOrSlug: string): Promise<ModrinthProject | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: "SELECT * FROM modrinth_projects WHERE id = ? OR slug = ?",
      args: [idOrSlug, idOrSlug]
    });
    const row = res.rows[0];
    if (!row) return null;
    return mapModrinthProject(row);
  } catch (err) {
    console.error(`[SQLite Error] Failed to get Modrinth project ${idOrSlug}:`, err);
    return null;
  }
}

export async function localSearchModrinthProjects(query: string, limit = 100): Promise<(ModrinthSearchHit & { game_versions?: string[] })[]> {
  try {
    const db = getDb();
    const queryTerm = query.trim().toLowerCase();
    
    let res;
    if (!queryTerm) {
      res = await db.execute({
        sql: "SELECT * FROM modrinth_projects ORDER BY downloads DESC LIMIT ?",
        args: [limit]
      });
    } else {
      res = await db.execute({
        sql: `
          SELECT * FROM modrinth_projects 
          WHERE title LIKE ? OR slug LIKE ? OR description LIKE ?
          ORDER BY downloads DESC 
          LIMIT ?
        `,
        args: [`%${queryTerm}%`, `%${queryTerm}%`, `%${queryTerm}%`, limit]
      });
    }
    
    const projects = res.rows.map(mapModrinthProject);
    return projects.map((p: any) => ({
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
  } catch (err) {
    console.error(`[SQLite Error] Failed to search Modrinth projects for "${query}":`, err);
    return [];
  }
}

// Reconstruct CurseForge widget response structure from database tables
export async function localGetCurseforgeMod(id: number): Promise<any | null> {
  try {
    const db = getDb();
    const modRes = await db.execute({
      sql: "SELECT * FROM curseforge_mods WHERE id = ?",
      args: [id]
    });
    const modRow = modRes.rows[0];
    if (!modRow) return null;

    // Decompress description HTML
    const description = modRow.description
      ? zlib.inflateSync(Buffer.from(modRow.description as unknown as ArrayBuffer)).toString("utf-8")
      : (modRow.summary as string) || "";

    // Parse categories (comma separated)
    const categories = modRow.categories
      ? (modRow.categories as string).split(",").map((c: string) => c.trim()).filter(Boolean)
      : [];

    // Parse members (comma separated)
    const members = modRow.members
      ? (modRow.members as string).split(",").map((m: string) => ({ username: m.trim(), title: "Author" }))
      : [];

    // Query files
    const fileRes = await db.execute({
      sql: "SELECT * FROM curseforge_mod_files WHERE mod_id = ? ORDER BY uploaded_at DESC",
      args: [id]
    });
    const files = fileRes.rows.map((f: any) => {
      const versions = f.game_versions
        ? f.game_versions.split(",").map((v: string) => v.trim()).filter(Boolean)
        : [];

      return {
        id: Number(f.id),
        name: f.name as string,
        display: (f.display as string) || (f.name as string),
        type: f.type === 1 ? "release" : f.type === 2 ? "beta" : f.type === 3 ? "alpha" : "release",
        filesize: Number(f.filesize),
        uploaded_at: new Date(Number(f.uploaded_at) * 1000).toISOString(),
        downloads: Number(f.downloads),
        versions,
        url: f.name ? `https://www.curseforge.com/minecraft/mc-mods/${modRow.slug}/download/${f.id}` : ""
      };
    });

    return {
      id: Number(modRow.id),
      name: modRow.name as string,
      slug: modRow.slug as string,
      summary: modRow.summary as string,
      description,
      thumbnail: modRow.logo_url as string,
      downloads: {
        total: Number(modRow.downloads || 0)
      },
      donate: modRow.donate_url as string,
      created_at: modRow.created_at as string,
      urls: {
        project: modRow.project_url as string,
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
    
    // Check if we have files in database
    const fileRes = await db.execute({
      sql: "SELECT * FROM curseforge_mod_files WHERE mod_id = ? ORDER BY uploaded_at DESC",
      args: [curseId]
    });
    if (fileRes.rows.length === 0) return null;

    const cfModRes = await db.execute({
      sql: "SELECT slug FROM curseforge_mods WHERE id = ?",
      args: [curseId]
    });
    const cfModRow = cfModRes.rows[0];

    const modRes = await db.execute({
      sql: "SELECT slug FROM mods WHERE curse_id = ?",
      args: [curseId]
    });
    const modRow = modRes.rows[0];
    
    const slug = cfModRow?.slug || modRow?.slug || "mod";

    return fileRes.rows.map((f: any) => {
      const versions = f.game_versions
        ? f.game_versions.split(",").map((v: string) => v.trim()).filter(Boolean)
        : [];

      return {
        id: Number(f.id),
        name: f.name as string,
        display: (f.display as string) || (f.name as string),
        type: f.type === 1 ? "release" : f.type === 2 ? "beta" : f.type === 3 ? "alpha" : "release",
        filesize: Number(f.filesize),
        uploaded_at: new Date(Number(f.uploaded_at) * 1000).toISOString(),
        downloads: Number(f.downloads),
        versions,
        url: f.name ? `https://www.curseforge.com/minecraft/mc-mods/${slug}/download/${f.id}` : ""
      };
    });
  } catch (err) {
    console.error(`[SQLite Error] Failed to get CurseForge mod files ${curseId}:`, err);
    return null;
  }
}
