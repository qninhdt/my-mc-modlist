import JSZip from "jszip";
import { sanitizeFilename } from "./sanitize-filename";
import type { PackMod } from "@/lib/modpacks/mod-types";
import type { ExportProgress, FailedMod } from "./types";

export interface ZipBuilderOptions {
  onProgress?: (progress: ExportProgress) => void;
  getManualDownloadUrl?: (mod: PackMod) => Promise<string>;
}

/**
 * Builds a zip containing the given mods' jar files.
 * Downloads the files concurrently (up to 4 at a time) and compiles them into a ZIP.
 */
export async function buildModpackZip(
  mods: PackMod[],
  options: ZipBuilderOptions = {}
): Promise<Blob> {
  const { onProgress, getManualDownloadUrl } = options;
  const zip = new JSZip();
  const total = mods.length;
  let current = 0;
  const failedMods: FailedMod[] = [];

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

  // Initial progress state
  updateProgress("idle", "");

  // If there are no mods, return an empty zip
  if (total === 0) {
    updateProgress("zipping", "Generating empty zip");
    const blob = await zip.generateAsync({ type: "blob" });
    updateProgress("success", "");
    return blob;
  }

  // Concurrency-limited downloads (cap at 4)
  const CONCURRENCY_LIMIT = 4;
  let nextIndex = 0;

  updateProgress("fetching", "Starting downloads");

  const downloadWorker = async () => {
    while (nextIndex < mods.length) {
      const index = nextIndex++;
      const mod = mods[index];
      const safeName = sanitizeFilename(mod.fileName || `${mod.name}.jar`);

      try {
        let url = mod.downloadUrl;

        // If it's a CurseForge manual mod, check if we need to get a signed URL (P6 integration)
        if (mod.curseforgeManual) {
          if (!mod.storagePath) {
            throw new Error("No jar file has been uploaded for this mod. Please download and upload the file first.");
          }
          if (getManualDownloadUrl) {
            url = await getManualDownloadUrl(mod);
          } else if (!url) {
            throw new Error("Missing manual download URL (not uploaded yet)");
          }
        }

        if (!url) {
          throw new Error("No download URL resolved for this mod");
        }

        const isCacheable = url.startsWith("https://cdn.modrinth.com/");
        let response: Response | undefined;
        let cache: Cache | undefined;

        if (isCacheable && typeof window !== "undefined" && "caches" in window) {
          try {
            cache = await window.caches.open("mmcm-mod-jars");
            const cachedRes = await cache.match(url);
            if (cachedRes) {
              response = cachedRes;
            }
          } catch (e) {
            console.warn("Failed to read from Cache Storage:", e);
          }
        }

        if (response) {
          updateProgress("fetching", `Using cached ${mod.name}`);
        } else {
          updateProgress("fetching", `Downloading ${mod.name}`);
          response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to download: HTTP ${response.status} ${response.statusText}`);
          }
          if (cache) {
            try {
              await cache.put(url, response.clone());
            } catch (e) {
              console.warn("Failed to write to Cache Storage:", e);
            }
          }
        }

        const blob = await response.blob();
        zip.file(`mods/${safeName}`, blob);
        current++;
        updateProgress("fetching", `Completed ${mod.name}`);
      } catch (err: any) {
        if (err?.message === "Export cancelled by user") {
          return;
        }
        console.error(`Error downloading mod ${mod.name}:`, err);
        failedMods.push({
          name: mod.name,
          projectId: mod.projectId,
          error: err?.message || String(err),
        });
        current++;
        try {
          updateProgress("fetching", `Completed ${mod.name}`);
        } catch (progressErr: any) {
          if (progressErr?.message === "Export cancelled by user") {
            return;
          }
          throw progressErr;
        }
      }
    }
  };

  // Start workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, total); i++) {
    workers.push(downloadWorker());
  }
  await Promise.all(workers);

  // Zip compilation phase
  updateProgress("zipping", "Compiling zip file...");
  const zipBlob = await zip.generateAsync({ type: "blob" });

  if (failedMods.length === total) {
    updateProgress("error", "All downloads failed");
    throw new Error("All mod downloads failed. Check individual errors.");
  }

  updateProgress("success", "");
  return zipBlob;
}
