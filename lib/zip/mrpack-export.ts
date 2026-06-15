import JSZip from "jszip";
import { sanitizeFilename } from "./sanitize-filename";
import type { PackMod } from "@/lib/modpacks/mod-types";
import type { Modpack } from "@/lib/modpacks/types";
import type { ExportProgress, FailedMod } from "./types";

export interface MrpackExportOptions {
  onProgress?: (progress: ExportProgress) => void;
  getManualDownloadUrl?: (mod: PackMod) => Promise<string>;
}

/**
 * Exports a modpack in the Modrinth `.mrpack` format.
 * - Public Modrinth mods are added to the `files` list in `modrinth.index.json`
 * - CurseForge manual/local upload mods are downloaded and placed in the zip under `overrides/mods/`
 */
export async function exportToMrpack(
  pack: Modpack,
  mods: PackMod[],
  options: MrpackExportOptions = {}
): Promise<Blob> {
  const { onProgress, getManualDownloadUrl } = options;
  const zip = new JSZip();
  const failedMods: FailedMod[] = [];

  // Determine loader dependency key for mrpack index.json
  let loaderDepKey = "fabric-loader";
  if (pack.loader === "forge") {
    loaderDepKey = "forge";
  } else if (pack.loader === "neoforge") {
    loaderDepKey = "neoforge";
  }

  // Separate mods into public Modrinth files (which go in index.json)
  // and local/CurseForge manual mods (which are embedded in overrides/)
  const publicMods: PackMod[] = [];
  const manualMods: PackMod[] = [];

  for (const mod of mods) {
    if (mod.curseforgeManual) {
      manualMods.push(mod);
    } else if (mod.versionId && mod.downloadUrl && mod.sha1 && mod.sha512) {
      publicMods.push(mod);
    } else {
      // Missing required Modrinth resolution fields
      failedMods.push({
        name: mod.name,
        projectId: mod.projectId,
        error: "Mod has not been resolved (missing versionId, downloadUrl, or hashes)",
      });
    }
  }

  // We need to fetch and embed manual mods in overrides/
  const total = manualMods.length;
  let current = 0;

  const updateProgress = (status: ExportProgress["status"], currentName: string) => {
    if (onProgress) {
      onProgress({
        status,
        total,
        current,
        currentName,
        failedMods,
      });
    }
  };

  // Initial progress
  updateProgress("idle", "");

  if (manualMods.length > 0) {
    updateProgress("fetching", "Downloading CurseForge manual mods to embed...");
    const CONCURRENCY_LIMIT = 4;
    let nextIndex = 0;

    const downloadWorker = async () => {
      while (nextIndex < manualMods.length) {
        const index = nextIndex++;
        const mod = manualMods[index];
        const safeName = sanitizeFilename(mod.fileName || `${mod.name}.jar`);

        try {
          if (!mod.storagePath) {
            throw new Error("No jar file has been uploaded for this mod. Please download and upload the file first.");
          }
          let url = mod.downloadUrl;
          if (getManualDownloadUrl) {
            url = await getManualDownloadUrl(mod);
          }

          if (!url) {
            throw new Error("No download URL resolved for manual mod");
          }

          updateProgress("fetching", `Downloading ${mod.name}`);

          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to download: HTTP ${response.status} ${response.statusText}`);
          }

          const blob = await response.blob();
          zip.file(`overrides/mods/${safeName}`, blob);
        } catch (err: any) {
          console.error(`Error embedding manual mod ${mod.name}:`, err);
          failedMods.push({
            name: mod.name,
            projectId: mod.projectId,
            error: err?.message || String(err),
          });
        } finally {
          current++;
          updateProgress("fetching", `Completed ${mod.name}`);
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, manualMods.length); i++) {
      workers.push(downloadWorker());
    }
    await Promise.all(workers);
  }

  // Construct files section of index.json for Modrinth mods
  const indexFiles = publicMods.map((mod) => {
    const safeName = sanitizeFilename(mod.fileName || `${mod.name}.jar`);

    // Standardize client/server env definitions
    const clientEnv = (mod.clientSide || "unknown").toLowerCase();
    const serverEnv = (mod.serverSide || "unknown").toLowerCase();

    const env = {
      client: ["required", "optional", "unsupported"].includes(clientEnv)
        ? (clientEnv as "required" | "optional" | "unsupported")
        : "required",
      server: ["required", "optional", "unsupported"].includes(serverEnv)
        ? (serverEnv as "required" | "optional" | "unsupported")
        : "required",
    };

    return {
      path: `mods/${safeName}`,
      hashes: {
        sha1: mod.sha1!,
        sha512: mod.sha512!,
      },
      downloads: [mod.downloadUrl!],
      fileSize: 0, // optional, or we can omit it if not strictly required, or set if known
      env,
    };
  });

  // Construct modrinth.index.json
  const indexJson = {
    formatVersion: 1,
    game: "minecraft",
    versionId: "1.0.0",
    name: pack.name,
    summary: pack.description || "",
    files: indexFiles,
    dependencies: {
      minecraft: pack.mcVersion,
      [loaderDepKey]: "*",
    },
  };

  updateProgress("zipping", "Generating modrinth.index.json and compiling mrpack...");
  zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 2));

  const mrpackBlob = await zip.generateAsync({ type: "blob" });

  if (failedMods.length === mods.length && mods.length > 0) {
    updateProgress("error", "All mods failed to export");
    throw new Error("All mods failed to export. Check individual errors.");
  }

  updateProgress("success", "");
  return mrpackBlob;
}
