import { cached } from "./cache";
import type { ModpackIndexMod } from "./types";
import { mapCurseforgeCategory } from "./normalize";
import { isSqliteDbAvailable, localGetMpiMod, localSearchMpiMods, localSearchMpiModsPaged } from "./sqlite-helper";

// ModpackIndex v1 client. Used ONLY for cross-platform badge enrichment (does this
// mod also exist on CurseForge?) — NOT as a search engine (it can't combine
// name + loader/version filters; see plan P3). Server-side, descriptive UA,
// cached. 3,600 req/hr TOTAL across all users → enrichment is best-effort and must
// degrade gracefully when the cap is hit.

const BASE = "https://www.modpackindex.com/api/v1";
const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "qninhdt/my-mc-modlist/0.1.0 (mc-modlist on vercel)";

async function mpiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      redirect: "follow", // 301 = merged record, follow to survivor
    });
    if (!res.ok) return null; // best-effort: 429/410/404 → no badge, don't throw
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Searches ModpackIndex by name (typo-tolerant) to find a matching mod and its
// cross-platform links. Best-effort: returns null on any failure so search still
// renders Modrinth data when MPI is rate-limited.
export async function searchMods(
  name?: string,
  page: number = 1,
  limit: number = 20
): Promise<{ data: ModpackIndexMod[]; total: number } | null> {
  const queryTerm = name?.toLowerCase().trim() ?? "";
  const key = `mpi:search:${queryTerm}:${page}:${limit}`;
  return cached("search", key, async () => {
    if (isSqliteDbAvailable()) {
      const offset = (page - 1) * limit;
      const { hits, total } = await localSearchMpiModsPaged(name || "", { offset, limit });
      return { data: hits, total };
    }

    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (queryTerm) {
      qs.set("name", queryTerm);
    }
    const body = await mpiFetch<{ data: ModpackIndexMod[]; meta?: { total: number } }>(
      `/mods?${qs.toString()}`
    );
    const data = body?.data ?? [];
    const total = body?.meta?.total ?? data.length;
    return { data, total };
  });
}

export async function getMod(modId: number): Promise<ModpackIndexMod | null> {
  return cached("detail", `mpi:mod:${modId}`, async () => {
    if (isSqliteDbAvailable()) {
      const local = await localGetMpiMod(modId);
      if (local) return local;
    }

    const body = await mpiFetch<{ data: ModpackIndexMod }>(`/mod/${modId}`);
    return body?.data ?? null;
  });
}

export async function searchAndFilterMpiMods(
  query: string,
  loaders: string[],
  versions: string[],
  categories: string[]
): Promise<ModpackIndexMod[]> {
  const cacheKey = `mpi:filtered-search:${query}:${(loaders ?? []).join(",")}:${(versions ?? []).join(",")}:${(categories ?? []).join(",")}`;
  return cached("search", cacheKey, async () => {
    const allMods: ModpackIndexMod[] = [];
    
    if (isSqliteDbAvailable()) {
      const { hits } = await localSearchMpiModsPaged(query, {
        loaders,
        versions,
        categories,
        limit: 250
      });
      return hits;
    } else {
      const limit = 100;
      // Fetch up to 3 pages of 100 results to cover the max 250 matches
      for (let page = 1; page <= 3; page++) {
        const res = await searchMods(query, page, limit);
        if (!res || !res.data || res.data.length === 0) {
          break;
        }
        allMods.push(...res.data);
        if (res.data.length < limit || allMods.length >= 250) {
          break;
        }
      }
    }

    // Now filter the entire list locally!
    let filtered = allMods;

    // 1. Filter by version
    if (versions && versions.length > 0) {
      filtered = filtered.filter((mpiMod) => {
        const modVersions = mpiMod.minecraft_versions?.map((v) => v.name) ?? [];
        const hasVersionOverlap = modVersions.some((v) => versions.includes(v));
        return hasVersionOverlap || modVersions.length === 0;
      });
    }

    // 2. Filter by loader
    if (loaders && loaders.length > 0) {
      filtered = filtered.filter((mpiMod) => {
        const mpiModrinthInfos = mpiMod.modrinth_info ?? [];
        if (mpiModrinthInfos.length > 0) {
          return mpiModrinthInfos.some((info) =>
            info.loaders?.some((l) => loaders.includes(l))
          );
        }
        return true;
      });
    }

    // 3. Filter by category
    const realCategories = categories.filter((c) => c !== "client" && c !== "server");
    if (realCategories.length > 0) {
      filtered = filtered.filter((mpiMod) => {
        const tags = mpiMod.categories?.map((c) => mapCurseforgeCategory(c.name)) ?? [];
        return tags.some((t) => realCategories.includes(t.toLowerCase()));
      });
    }

    return filtered;
  });
}

export async function getMinecraftVersionId(versionName: string): Promise<number | null> {
  const versionsList = await cached("detail", "mpi:minecraft-versions", async () => {
    const res = await mpiFetch<{ data: { id: number; name: string }[] }>("/minecraft/versions");
    return res?.data ?? [];
  });
  const match = versionsList.find((v) => v.name === versionName);
  return match ? match.id : null;
}

export async function searchModsByVersion(
  versionId: number,
  page: number = 1,
  limit: number = 20
): Promise<{ data: ModpackIndexMod[]; total: number } | null> {
  const key = `mpi:version-mods:${versionId}:${page}:${limit}`;
  return cached("search", key, async () => {
    const body = await mpiFetch<{ data: ModpackIndexMod[]; meta?: { total: number } }>(
      `/minecraft/version/${versionId}/mods?page=${page}&limit=${limit}`
    );
    const data = body?.data ?? [];
    const total = body?.meta?.total ?? data.length;
    return { data, total };
  });
}

export async function getMpiModsSearch(
  query: string,
  page: number,
  limit: number,
  loaders: string[],
  versions: string[],
  categories: string[]
): Promise<{ data: ModpackIndexMod[]; total: number }> {
  const cacheKey = `mpi:search-paged:${query.trim().toLowerCase()}:${page}:${limit}:${[...loaders].sort().join(",")}:${[...versions].sort().join(",")}:${[...categories].sort().join(",")}`;
  return cached("search", cacheKey, async () => {
    if (isSqliteDbAvailable()) {
      const offset = (page - 1) * limit;
      const { hits, total } = await localSearchMpiModsPaged(query, {
        loaders,
        versions,
        categories,
        offset,
        limit
      });
      return { data: hits, total };
    }

    const queryTerm = query.trim();

    if (queryTerm) {
      // Search with query: name-search is capped at 250 matches upstream by ModpackIndex.
      // Fetch all matching results, filter them locally, and return the correct page slice.
      const allFiltered = await searchAndFilterMpiMods(queryTerm, loaders, versions, categories);
      const offset = (page - 1) * limit;
      const sliced = allFiltered.slice(offset, offset + limit);
      return { data: sliced, total: allFiltered.length };
    } else {
      // Browse (empty query): cannot fetch all 144,000+ mods locally.
      // Use API pagination. If a version filter is present, query the version's mods endpoint.
      let res: { data: ModpackIndexMod[]; total: number } | null = null;
      if (versions.length > 0) {
        const versionId = await getMinecraftVersionId(versions[0]);
        if (versionId) {
          res = await searchModsByVersion(versionId, page, limit);
        }
      }
      if (!res) {
        res = await searchMods("", page, limit);
      }

      const data = res?.data ?? [];
      const total = res?.total ?? 0;

      // Apply local post-filtering for categories/loaders on the page slice
      let filtered = data;

      // 1. Loader filter (for Modrinth-linked mods only, CF-only are allowed through)
      if (loaders.length > 0) {
        filtered = filtered.filter((mpiMod) => {
          const mpiModrinthInfos = mpiMod.modrinth_info ?? [];
          if (mpiModrinthInfos.length > 0) {
            return mpiModrinthInfos.some((info) =>
              info.loaders?.some((l) => loaders.includes(l))
            );
          }
          return true;
        });
      }

      // 2. Category filter (ignoring client/server environment strings)
      const realCategories = categories.filter((c) => c !== "client" && c !== "server");
      if (realCategories.length > 0) {
        filtered = filtered.filter((mpiMod) => {
          const tags = mpiMod.categories?.map((c) => mapCurseforgeCategory(c.name)) ?? [];
          return tags.some((t) => realCategories.includes(t.toLowerCase()));
        });
      }

      return { data: filtered, total };
    }
  });
}
