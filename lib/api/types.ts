// Shared types for the upstream API layer (Modrinth + ModpackIndex) and the
// normalized ModView the UI consumes.

export type SideSupport = "required" | "optional" | "unsupported" | "unknown";

// One Modrinth project a mod resolves to. A ModpackIndex mod may map to several
// (modrinth_info is an array); the bridge picks the loader-matching one.
export type ModrinthProjectRef = {
  projectId: string;
  slug: string;
  loaders: string[];
};

export type ModrinthUser = {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string;
  created: string;
};

export type ModrinthTeamMember = {
  team_id: string;
  user: ModrinthUser;
  role: string;
  permissions: number | null;
  accepted: boolean;
};

// Normalized mod shape the search UI + pack mod list render. Merges Modrinth
// (search engine, side flags, downloads) with ModpackIndex (CF cross-platform badge).
export type ModView = {
  id: string; // Modrinth project id (or "cf:<curseId>" for CF-only)
  name: string;
  summary: string;
  iconUrl: string | null;
  tags: string[];
  clientSide: SideSupport;
  serverSide: SideSupport;
  downloads: number;
  sources: {
    modrinth?: { projectId: string; slug: string; url: string };
    curseforge?: { url: string };
  };
  modrinthProjects: ModrinthProjectRef[];
  // True when the mod exists only on CurseForge (no Modrinth project) → P6 manual flow.
  curseforgeManual: boolean;
  body?: string;
  published?: string;
  updated?: string;
  gallery?: { url: string; title?: string; description?: string }[];
  members?: ModrinthTeamMember[];
  discordUrl?: string;
  issuesUrl?: string;
  sourceUrl?: string;
  wikiUrl?: string;
  author?: string;
  follows?: number;
  featuredGalleryUrl?: string | null;
};

// --- Modrinth raw shapes (subset we use; verified against api.modrinth.com/v2) ---
export type ModrinthSearchHit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: SideSupport;
  server_side: SideSupport;
  downloads: number;
  icon_url: string | null;
  author?: string;
  organization?: string;
  follows?: number;
  date_modified?: string;
  gallery?: string[];
  featured_gallery?: string | null;
};

export type ModrinthSearchResponse = {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
};

export type ModrinthProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: SideSupport;
  server_side: SideSupport;
  downloads: number;
  icon_url: string | null;
  loaders: string[];
  body?: string;
  published?: string;
  updated?: string;
  gallery?: {
    url: string;
    featured: boolean;
    title?: string;
    description?: string;
    created: string;
  }[];
  discord_url?: string;
  issues_url?: string;
  source_url?: string;
  wiki_url?: string;
  followers?: number;
};

// --- ModpackIndex raw shapes (subset; modrinth_info is an ARRAY on mods) ---
export type ModpackIndexModrinthInfo = {
  project_id: string;
  slug: string;
  loaders: string[];
};

export type ModpackIndexMod = {
  id: number;
  name: string;
  slug: string;
  summary: string;
  thumbnail_url?: string | null;
  download_count?: number | null;
  links?: { curseforge?: string; modrinth?: string };
  curse_info?: { curse_id: number } | null;
  modrinth_info?: ModpackIndexModrinthInfo[] | null;
  authors?: { name: string; url?: string }[] | null;
  categories?: { id: number; name: string; slug: string }[] | null;
  minecraft_versions?: { id: number; name: string; slug: string }[] | null;
  latest_release_date?: string | null;
  last_updated?: string | null;
};

// --- Modrinth version shapes (verified live against api.modrinth.com/v2, 2026-06-15) ---

export type ModrinthFileHashes = {
  sha1: string;
  sha512: string;
};

export type ModrinthFile = {
  hashes: ModrinthFileHashes;
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type: string | null;
};

export type ModrinthDependencyType =
  | "required"
  | "optional"
  | "incompatible"
  | "embedded";

export type ModrinthDependency = {
  project_id: string | null;
  version_id: string | null;
  file_name: string | null;
  dependency_type: ModrinthDependencyType;
};

export type ModrinthVersionType = "release" | "beta" | "alpha";

export type ModrinthVersion = {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog: string;
  dependencies: ModrinthDependency[];
  game_versions: string[];
  version_type: ModrinthVersionType;
  loaders: string[];
  featured: boolean;
  status: string;
  date_published: string;
  downloads: number;
  files: ModrinthFile[];
};
