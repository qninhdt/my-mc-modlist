import type {
  ModpackIndexMod,
  ModpackIndexModrinthInfo,
  ModrinthProject,
  ModrinthProjectRef,
  ModrinthSearchHit,
  ModView,
  SideSupport,
} from "./types";

// Array-aware Modrinth-project selection (the C1 critical fix). A ModpackIndex mod
// carries modrinth_info as an ARRAY — a mod may map to >1 Modrinth project (e.g.
// separate Forge and Fabric projects). Pick the entry whose loaders include the
// pack loader; tie-break by slug match against links.modrinth. Returns the chosen
// ref plus whether the choice was ambiguous (multi-match, no loader disambiguation)
// so the UI can prompt instead of silently guessing.
export function selectModrinthProject(
  infos: ModpackIndexModrinthInfo[],
  packLoader: string | null,
  modrinthLink?: string
): { selected: ModrinthProjectRef | null; ambiguous: boolean; all: ModrinthProjectRef[] } {
  const all: ModrinthProjectRef[] = infos.map((i) => ({
    projectId: i.project_id,
    slug: i.slug,
    loaders: i.loaders ?? [],
  }));

  if (all.length === 0) return { selected: null, ambiguous: false, all };
  if (all.length === 1) return { selected: all[0], ambiguous: false, all };

  // Multiple projects: filter by loader if we know the pack's loader.
  const loaderMatches = packLoader
    ? all.filter((p) => p.loaders.includes(packLoader))
    : all;

  if (loaderMatches.length === 1) {
    return { selected: loaderMatches[0], ambiguous: false, all };
  }

  // Still ambiguous → slug tie-break against the links.modrinth URL.
  if (modrinthLink) {
    const slugFromLink = modrinthLink.replace(/\/+$/, "").split("/").pop();
    const bySlug = (loaderMatches.length ? loaderMatches : all).find(
      (p) => p.slug === slugFromLink
    );
    if (bySlug) return { selected: bySlug, ambiguous: false, all };
  }

  // No clean disambiguation: surface as ambiguous, default to first loader match.
  const fallback = loaderMatches[0] ?? all[0];
  return { selected: fallback, ambiguous: true, all };
}

// Builds a ModView from a Modrinth search hit, enriched (best-effort) with a
// ModpackIndex match for the CF cross-platform badge.
export function normalizeSearchHit(
  hit: ModrinthSearchHit,
  mpiMatch: ModpackIndexMod | null
): ModView {
  const curseforgeUrl = mpiMatch?.links?.curseforge ?? null;

  return {
    id: hit.project_id,
    name: hit.title,
    summary: hit.description,
    iconUrl: hit.icon_url,
    tags: hit.categories,
    clientSide: hit.client_side,
    serverSide: hit.server_side,
    downloads: hit.downloads,
    sources: {
      modrinth: {
        projectId: hit.project_id,
        slug: hit.slug,
        url: `https://modrinth.com/mod/${hit.slug}`,
      },
      ...(curseforgeUrl ? { curseforge: { url: curseforgeUrl } } : {}),
    },
    modrinthProjects: [
      { projectId: hit.project_id, slug: hit.slug, loaders: [] },
    ],
    curseforgeManual: false,
    author: hit.organization || hit.author,
    follows: hit.follows,
    updated: hit.date_modified,
    featuredGalleryUrl: hit.featured_gallery || hit.gallery?.[0] || null,
  };
}

// Builds a ModView from a full Modrinth project (detail view), enriched best-effort
// with a ModpackIndex match for the CF cross-platform badge. Carries the project's
// loaders so the detail page can show which loaders the mod supports.
export function normalizeProject(
  project: ModrinthProject,
  mpiMatch: ModpackIndexMod | null
): ModView {
  const curseforgeUrl = mpiMatch?.links?.curseforge ?? null;

  return {
    id: project.id,
    name: project.title,
    summary: project.description,
    iconUrl: project.icon_url,
    tags: project.categories,
    clientSide: project.client_side,
    serverSide: project.server_side,
    downloads: project.downloads,
    sources: {
      modrinth: {
        projectId: project.id,
        slug: project.slug,
        url: `https://modrinth.com/mod/${project.slug}`,
      },
      ...(curseforgeUrl ? { curseforge: { url: curseforgeUrl } } : {}),
    },
    modrinthProjects: [
      { projectId: project.id, slug: project.slug, loaders: project.loaders },
    ],
    curseforgeManual: false,
    follows: project.followers,
    featuredGalleryUrl: project.gallery?.find((g) => g.featured)?.url || project.gallery?.[0]?.url || null,
  };
}

const CURSEFORGE_CATEGORY_MAP: Record<string, string> = {
  // 1. Core Mod Categories
  "api and library": "library",
  "library": "library",
  "addons": "gameplay",
  "adventure and rpg": "adventure",
  "adventure": "adventure",
  "rpg": "adventure",
  "armor, tools, and weapons": "equipment",
  "automation": "technology",
  "biomes": "worldgen",
  "blood magic": "magic",
  "bug fixes": "utility",
  "buildcraft": "technology",
  "combat / pvp": "gameplay",
  "cosmetic": "cosmetic",
  "creativemode": "gameplay",
  "dimensions": "worldgen",
  "education": "utility",
  "energy": "technology",
  "energy, fluid, and item transport": "transportation",
  "exploration": "adventure",
  "fabric": "mc-compat",
  "farmer's delight": "food",
  "farming": "food",
  "food": "food",
  "forestry": "technology",
  "galacticraft": "technology",
  "genetics": "technology",
  "horror": "adventure",
  "industrial craft": "technology",
  "lucky blocks": "gameplay",
  "magic": "magic",
  "map based": "minimap",
  "map and information": "minimap",
  "miscellaneous": "utility",
  "mobs": "gameplay",
  "mod support": "mc-compat",
  "ores and resources": "worldgen",
  "performance": "optimization",
  "player transport": "transportation",
  "processing": "technology",
  "qol": "utility",
  "redstone": "technology",
  "server utility": "utility",
  "storage": "storage",
  "structures": "worldgen",
  "tech": "technology",
  "technology": "technology",
  "thaumcraft": "magic",
  "thermal expansion": "technology",
  "tinker's construct": "equipment",
  "twitch integration": "social",
  "utility & qol": "utility",
  "vanilla+": "gameplay",
  "world gen": "worldgen",

  // 2. Modpack Types / Subgenres
  "expert": "gameplay",
  "extra large": "gameplay",
  "hardcore": "gameplay",
  "medieval": "gameplay",
  "mini game": "gameplay",
  "modern": "gameplay",
  "multiplayer": "social",
  "quests": "gameplay",
  "rlcraft": "gameplay",
  "sci-fi": "gameplay",
  "skyblock": "gameplay",
  "steampunk": "gameplay",
  "small / light": "optimization",
  "ftb official pack": "gameplay",

  // 3. Technical config managers
  "crafttweaker": "mc-compat",
  "kubejs": "mc-compat",
  "mcreator": "mc-compat",
  "applied energistics 2": "storage",
  "refined storage": "storage",
  "create": "technology",
  "fancymenu": "cosmetic",
  "integrated dynamics": "technology",
  "twilight forest": "adventure",

  // 4. Resource / Font Packs
  "128x": "cosmetic",
  "16x": "cosmetic",
  "256x": "cosmetic",
  "32x": "cosmetic",
  "512x and higher": "cosmetic",
  "64x": "cosmetic",
  "animated": "cosmetic",
  "font packs": "cosmetic",
  "photo realistic": "cosmetic",
  "traditional": "cosmetic",
  "data packs": "gameplay",
};

export function mapCurseforgeCategory(cfCat: string): string {
  const low = cfCat.toLowerCase().trim();
  return CURSEFORGE_CATEGORY_MAP[low] || low;
}

// A ModpackIndex mod that has NO modrinth_info → CurseForge-only → P6 manual flow.
export function normalizeCurseforgeOnly(mod: ModpackIndexMod): ModView {
  const unknown: SideSupport = "unknown";
  const tags = Array.from(
    new Set(mod.categories?.map((c) => mapCurseforgeCategory(c.name)) ?? [])
  );

  return {
    id: `cf:${mod.id}`,
    name: mod.name,
    summary: mod.summary ?? "",
    iconUrl: mod.thumbnail_url ?? null,
    tags,
    clientSide: unknown,
    serverSide: unknown,
    downloads: mod.download_count ?? 0,
    sources: {
      ...(mod.links?.curseforge ? { curseforge: { url: mod.links.curseforge } } : {}),
    },
    modrinthProjects: [],
    curseforgeManual: true,
  };
}
