import type { ModrinthVersion, ModrinthVersionType } from "@/lib/api/types";
import { getProjectVersions, getVersion } from "@/lib/api/modrinth";
import { getMod } from "@/lib/api/modpackindex";
import type { ResolvedVersion, ResolvedDependencyRef } from "./types";

const USER_AGENT = "qninhdt/my-mc-modlist/0.1.0 (mc-modlist on vercel)";

function isMinecraftVersion(v: string): boolean {
  return /^1\.\d+(\.\d+)?$/.test(v);
}

// Priority ranking for version types: prefer release > beta > alpha.
const VERSION_TYPE_PRIORITY: Record<ModrinthVersionType, number> = {
  release: 0,
  beta: 1,
  alpha: 2,
};

// Resolves the best (latest, most stable) Modrinth version for a project on a
// given MC version + loader. The algorithm:
// 1. Fetch all versions (server-side filtered by loader + MC version via Modrinth's
//    query params — reduces payload, especially for mods with 500+ versions).
// 2. Sort by version_type priority (release first), then date_published desc.
// 3. Pick the primary file from the best version; carry sha1 + sha512 hashes.
//
// Returns null if no version matches (incompatible mod → caller surfaces this).
// Runs SERVER-SIDE only (Modrinth requires User-Agent).
export async function resolveLatest(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ResolvedVersion | null> {
  if (projectId.startsWith("cf:")) {
    return resolveCurseforgeLatest(projectId, mcVersion, loader);
  }

  const versions = await getProjectVersions(projectId, {
    loaders: [loader],
    gameVersions: [mcVersion],
  });

  if (versions.length === 0) return null;

  // Sort: stable versions first, then newest first within each tier.
  const sorted = [...versions].sort((a, b) => {
    const typeDiff =
      (VERSION_TYPE_PRIORITY[a.version_type] ?? 3) -
      (VERSION_TYPE_PRIORITY[b.version_type] ?? 3);
    if (typeDiff !== 0) return typeDiff;
    return (
      new Date(b.date_published).getTime() -
      new Date(a.date_published).getTime()
    );
  });

  return pickFromVersion(sorted[0], projectId);
}

// Picks the primary file from a version and extracts the dependency refs.
function pickFromVersion(
  version: ModrinthVersion,
  projectId: string
): ResolvedVersion | null {
  const file =
    version.files.find((f) => f.primary) ?? version.files[0] ?? null;
  if (!file) return null;

  const dependencies: ResolvedDependencyRef[] = version.dependencies
    .filter((d) => d.project_id != null)
    .map((d) => ({
      projectId: d.project_id!,
      versionId: d.version_id ?? null,
      dependencyType: d.dependency_type,
    }));

  return {
    versionId: version.id,
    projectId,
    file: {
      url: file.url,
      filename: file.filename,
      size: file.size,
      sha1: file.hashes.sha1,
      sha512: file.hashes.sha512,
    },
    dependencies,
  };
}

async function resolveCurseforgeLatest(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ResolvedVersion | null> {
  const mpiId = parseInt(projectId.slice(3), 10);
  if (isNaN(mpiId)) return null;

  const mpiMod = await getMod(mpiId);
  if (!mpiMod || !mpiMod.curse_info?.curse_id) return null;

  const curseId = mpiMod.curse_info.curse_id;
  const res = await fetch(`https://api.cfwidget.com/${curseId}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;

  const cfWidgetData = await res.json();
  const files = cfWidgetData?.files || [];

  const versions: ModrinthVersion[] = files.map((f: any) => {
    const gameVersions = f.versions.filter((v: string) => isMinecraftVersion(v));
    if (gameVersions.length === 0) {
      const nameMatch = f.name.match(/\b1\.\d+(\.\d+)?\b/);
      if (nameMatch) {
        gameVersions.push(nameMatch[0]);
      } else {
        const displayMatch = f.display.match(/\b1\.\d+(\.\d+)?\b/);
        if (displayMatch) {
          gameVersions.push(displayMatch[0]);
        }
      }
    }

    const loadersSet = new Set<string>();
    f.versions
      .filter((v: string) => ["forge", "fabric", "neoforge", "quilt"].includes(v.toLowerCase()))
      .forEach((l: string) => loadersSet.add(l.toLowerCase()));

    if (loadersSet.size === 0) {
      const text = (f.name + " " + (f.display || "")).toLowerCase();
      if (text.includes("neoforge")) loadersSet.add("neoforge");
      else if (text.includes("fabric")) loadersSet.add("fabric");
      else if (text.includes("forge")) loadersSet.add("forge");
      else if (text.includes("quilt")) loadersSet.add("quilt");
    }
    const loaders = Array.from(loadersSet);

    return {
      id: String(f.id),
      project_id: projectId,
      name: f.display || f.name,
      version_number: f.name.replace(/\.jar$/, ""),
      changelog: "",
      dependencies: [],
      game_versions: gameVersions,
      version_type: f.type === "release" || f.type === "beta" || f.type === "alpha" ? f.type : "release",
      loaders: loaders.length > 0 ? loaders : ["forge"],
      featured: false,
      status: "listed",
      date_published: f.uploaded_at,
      downloads: f.downloads ?? 0,
      files: [
        {
          url: f.url ? f.url.replace("/files/", "/download/") : "",
          filename: f.name,
          primary: true,
          size: f.filesize ?? 0,
          hashes: { sha1: "", sha512: "" },
          file_type: null
        }
      ]
    };
  });

  const lowerLoader = loader.toLowerCase();
  const filtered = versions.filter((v) =>
    v.game_versions.includes(mcVersion) &&
    v.loaders.some((l) => l.toLowerCase() === lowerLoader)
  );

  if (filtered.length === 0) return null;

  const sorted = [...filtered].sort((a, b) => {
    const typeDiff =
      (VERSION_TYPE_PRIORITY[a.version_type] ?? 3) -
      (VERSION_TYPE_PRIORITY[b.version_type] ?? 3);
    if (typeDiff !== 0) return typeDiff;
    return (
      new Date(b.date_published).getTime() -
      new Date(a.date_published).getTime()
    );
  });

  return pickFromVersion(sorted[0], projectId);
}

async function resolveCurseforgeSpecificVersion(
  projectId: string,
  versionId: string
): Promise<ResolvedVersion | null> {
  const mpiId = parseInt(projectId.slice(3), 10);
  if (isNaN(mpiId)) return null;

  const mpiMod = await getMod(mpiId);
  if (!mpiMod || !mpiMod.curse_info?.curse_id) return null;

  const curseId = mpiMod.curse_info.curse_id;
  const res = await fetch(`https://api.cfwidget.com/${curseId}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;

  const cfWidgetData = await res.json();
  const files = cfWidgetData?.files || [];
  const f = files.find((file: any) => String(file.id) === versionId);
  if (!f) return null;

  const gameVersions = f.versions.filter((v: string) => isMinecraftVersion(v));
  if (gameVersions.length === 0) {
    const nameMatch = f.name.match(/\b1\.\d+(\.\d+)?\b/);
    if (nameMatch) {
      gameVersions.push(nameMatch[0]);
    } else {
      const displayMatch = f.display.match(/\b1\.\d+(\.\d+)?\b/);
      if (displayMatch) {
        gameVersions.push(displayMatch[0]);
      }
    }
  }

  const loadersSet = new Set<string>();
  f.versions
    .filter((v: string) => ["forge", "fabric", "neoforge", "quilt"].includes(v.toLowerCase()))
    .forEach((l: string) => loadersSet.add(l.toLowerCase()));

  if (loadersSet.size === 0) {
    const text = (f.name + " " + (f.display || "")).toLowerCase();
    if (text.includes("neoforge")) loadersSet.add("neoforge");
    else if (text.includes("fabric")) loadersSet.add("fabric");
    else if (text.includes("forge")) loadersSet.add("forge");
    else if (text.includes("quilt")) loadersSet.add("quilt");
  }
  const loaders = Array.from(loadersSet);

  const mappedVersion: ModrinthVersion = {
    id: String(f.id),
    project_id: projectId,
    name: f.display || f.name,
    version_number: f.name.replace(/\.jar$/, ""),
    changelog: "",
    dependencies: [],
    game_versions: gameVersions,
    version_type: f.type === "release" || f.type === "beta" || f.type === "alpha" ? f.type : "release",
    loaders: loaders.length > 0 ? loaders : ["forge"],
    featured: false,
    status: "listed",
    date_published: f.uploaded_at,
    downloads: f.downloads ?? 0,
    files: [
      {
        url: f.url ? f.url.replace("/files/", "/download/") : "",
        filename: f.name,
        primary: true,
        size: f.filesize ?? 0,
        hashes: { sha1: "", sha512: "" },
        file_type: null
      }
    ]
  };

  return pickFromVersion(mappedVersion, projectId);
}

export async function resolveSpecificVersion(
  projectId: string,
  versionId: string
): Promise<ResolvedVersion | null> {
  if (projectId.startsWith("cf:")) {
    return resolveCurseforgeSpecificVersion(projectId, versionId);
  }

  const version = await getVersion(versionId);
  if (!version) return null;
  return pickFromVersion(version, projectId);
}

