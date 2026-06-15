import { resolveLatest } from "./version-resolver";
import type { UpdateCheckResult } from "./types";

// Concurrency cap: how many update checks run in parallel. Keeps Modrinth cache
// hot without hammering upstream (a 100-mod check is mostly cache hits, but we
// still cap concurrency for the cache-miss burst).
const CONCURRENCY = 5;

type ModToCheck = {
  projectId: string;
  currentVersionId: string;
};

// Checks each mod for a newer version than the one pinned. Returns results keyed
// by projectId. Concurrency-capped: runs up to CONCURRENCY checks in parallel.
// Most calls are cache hits (version lists cached at detail tier = 6h TTL).
export async function checkUpdates(
  mods: ModToCheck[],
  mcVersion: string,
  loader: string
): Promise<UpdateCheckResult[]> {
  const results: UpdateCheckResult[] = [];
  const queue = [...mods];

  async function worker() {
    while (queue.length > 0) {
      const mod = queue.shift()!;
      try {
        const latest = await resolveLatest(mod.projectId, mcVersion, loader);
        results.push({
          projectId: mod.projectId,
          currentVersionId: mod.currentVersionId,
          latestVersionId: latest?.versionId ?? null,
          hasUpdate: latest !== null && latest.versionId !== mod.currentVersionId,
          latestFile: latest?.file ?? null,
        });
      } catch {
        // Don't let a single check failure break the batch.
        results.push({
          projectId: mod.projectId,
          currentVersionId: mod.currentVersionId,
          latestVersionId: null,
          hasUpdate: false,
          latestFile: null,
        });
      }
    }
  }

  // Spawn CONCURRENCY workers, each draining from the shared queue.
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, mods.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
