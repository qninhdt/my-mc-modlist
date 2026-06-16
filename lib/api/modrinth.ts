import { cached } from "./cache";
import type {
  ModrinthProject,
  ModrinthSearchResponse,
  ModrinthVersion,
  ModrinthTeamMember,
} from "./types";
import { isSqliteDbAvailable, localGetModrinthProject, localSearchModrinthProjects } from "./sqlite-helper";

// Modrinth v2 client. SERVER-SIDE ONLY: Modrinth strictly enforces a descriptive
// User-Agent, which browsers cannot set (forbidden header). Every read flows
// through the Firestore cache so 1000 users share one copy under the 300 req/min
// per-IP cap (all traffic egresses one Vercel IP).

const BASE = "https://api.modrinth.com/v2";
const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "qninhdt/my-mc-modlist/0.1.0 (mc-modlist on vercel)";

export type SearchParams = {
  query: string;
  loaders?: string[];
  versions?: string[];
  categories?: string[];
  index?: "relevance" | "downloads" | "follows" | "newest" | "updated";
  offset?: number;
  limit?: number;
};

async function modrinthFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    // Next caches fetch by default; we run our own Firestore cache, so opt out.
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new Error("Modrinth rate limited (429)");
  }
  if (!res.ok) {
    throw new Error(`Modrinth ${path} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

// Builds the facets array Modrinth expects: AND between groups, OR within a group.
function buildFacets(params: SearchParams): string | null {
  const groups: string[][] = [["project_type:mod"]];
  if (params.loaders?.length) {
    groups.push(params.loaders.map((l) => `categories:${l}`));
  }
  if (params.versions?.length) {
    groups.push(params.versions.map((v) => `versions:${v}`));
  }
  if (params.categories?.length) {
    groups.push(params.categories.map((c) => `categories:${c}`));
  }
  return JSON.stringify(groups);
}

// Normalized search-cache key: stable across param ordering so near-identical
// searches collapse to one cache entry (search tier is capped + short-TTL).
function searchKey(params: SearchParams): string {
  return JSON.stringify({
    q: params.query.toLowerCase().trim(),
    l: [...(params.loaders ?? [])].sort(),
    v: [...(params.versions ?? [])].sort(),
    c: [...(params.categories ?? [])].sort(),
    i: params.index ?? "relevance",
    o: params.offset ?? 0,
    n: params.limit ?? 30,
  });
}

export async function searchProjects(
  params: SearchParams
): Promise<ModrinthSearchResponse> {
  if (isSqliteDbAvailable()) {
    const queryVal = params.query || "";
    const allHits = await localSearchModrinthProjects(queryVal, 500);
    
    let filtered = allHits;
    if (params.loaders?.length) {
      filtered = filtered.filter(hit => 
        hit.categories?.some(cat => params.loaders!.includes(cat))
      );
    }
    if (params.categories?.length) {
      filtered = filtered.filter(hit =>
        hit.categories?.some(cat => params.categories!.includes(cat))
      );
    }
    if (params.versions?.length) {
      filtered = filtered.filter(hit =>
        hit.game_versions?.some(ver => params.versions!.includes(ver))
      );
    }

    // Handle sorting
    const sortIndex = params.index ?? "relevance";
    if (sortIndex === "downloads") {
      filtered.sort((a, b) => b.downloads - a.downloads);
    } else if (sortIndex === "follows") {
      filtered.sort((a, b) => (b.follows ?? 0) - (a.follows ?? 0));
    }
    
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 30;
    const hits = filtered.slice(offset, offset + limit);

    return {
      hits,
      offset,
      limit,
      total_hits: filtered.length,
    };
  }

  return cached("search", `modrinth:search:${searchKey(params)}`, async () => {
    const qs = new URLSearchParams();
    if (params.query) qs.set("query", params.query);
    const facets = buildFacets(params);
    if (facets) qs.set("facets", facets);
    qs.set("index", params.index ?? "relevance");
    qs.set("offset", String(params.offset ?? 0));
    qs.set("limit", String(Math.min(params.limit ?? 30, 100)));
    return modrinthFetch<ModrinthSearchResponse>(`/search?${qs.toString()}`);
  });
}

export async function getProject(idOrSlug: string): Promise<ModrinthProject> {
  if (isSqliteDbAvailable()) {
    const local = await localGetModrinthProject(idOrSlug);
    if (local) return local;
  }

  return cached("detail", `modrinth:project:${idOrSlug}`, () =>
    modrinthFetch<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`)
  );
}

// Fetches all versions of a project, optionally filtered by loader + MC version.
// Modrinth's endpoint supports server-side filtering via query params, which reduces
// payload size substantially (some mods have 500+ versions). Cached at detail tier
// (6h TTL) — a project's version list for a specific loader+MC version is very stable.
export async function getProjectVersions(
  projectId: string,
  opts?: { loaders?: string[]; gameVersions?: string[] }
): Promise<ModrinthVersion[]> {
  const qs = new URLSearchParams();
  if (opts?.loaders?.length) qs.set("loaders", JSON.stringify(opts.loaders));
  if (opts?.gameVersions?.length)
    qs.set("game_versions", JSON.stringify(opts.gameVersions));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const cacheKey = `modrinth:versions:${projectId}:${suffix}`;

  return cached("detail", cacheKey, () =>
    modrinthFetch<ModrinthVersion[]>(
      `/project/${encodeURIComponent(projectId)}/version${suffix}`
    )
  );
}

// Fetches the team members of a project from Modrinth, cached under the detail tier.
export async function getProjectMembers(
  projectId: string
): Promise<ModrinthTeamMember[]> {
  return cached("detail", `modrinth:members:${projectId}`, () =>
    modrinthFetch<ModrinthTeamMember[]>(
      `/project/${encodeURIComponent(projectId)}/members`
    )
  );
}

export async function getVersion(versionId: string): Promise<ModrinthVersion> {
  return cached("detail", `modrinth:version:${versionId}`, () =>
    modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`)
  );
}

