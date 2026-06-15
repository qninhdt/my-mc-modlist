import { resolveLatest } from "./version-resolver";
import type {
  DependencyConflict,
  DependencyResolutionResult,
  DependencyWarning,
  ResolvedVersion,
} from "./types";

// BFS dependency walker. Starting from a root resolved version, walks `required`
// dependencies recursively, resolving each to the best matching version. Uses a
// visited set (keyed on projectId) to avoid cycles and re-processing.
//
// Design constraints:
// - PURE: produces the full resolution result in memory. No Firestore writes —
//   the caller decides what to commit.
// - CYCLE-SAFE: the visited set prevents infinite loops even if the dep graph
//   has cycles (rare but possible via transitive deps).
// - `optional` and `embedded` deps are SKIPPED (not added to the pack).
// - `incompatible` deps are captured as conflicts (surfaced to the user).
// - A dep with no matching version for the target MC+loader is a warning, not
//   a fatal error (the rest of the tree still resolves).

export async function resolveDependencies(
  rootResolved: ResolvedVersion,
  mcVersion: string,
  loader: string,
  existingProjectIds: Set<string>
): Promise<DependencyResolutionResult> {
  const added: ResolvedVersion[] = [];
  const warnings: DependencyWarning[] = [];
  const conflicts: DependencyConflict[] = [];

  // Visited = already in the pack OR already processed in this walk.
  const visited = new Set<string>(existingProjectIds);
  visited.add(rootResolved.projectId);

  // BFS queue: each entry is [sourceProjectId, deps to process].
  type QueueEntry = { sourceProjectId: string; deps: ResolvedVersion["dependencies"] };
  const queue: QueueEntry[] = [
    { sourceProjectId: rootResolved.projectId, deps: rootResolved.dependencies },
  ];

  while (queue.length > 0) {
    const entry = queue.shift()!;

    for (const dep of entry.deps) {
      // Skip if already processed or already in the pack.
      if (visited.has(dep.projectId)) continue;
      visited.add(dep.projectId);

      // Incompatible deps → conflict, never add.
      if (dep.dependencyType === "incompatible") {
        conflicts.push({
          sourceProjectId: entry.sourceProjectId,
          targetProjectId: dep.projectId,
          dependencyType: "incompatible",
          reason: `${dep.projectId} is marked incompatible by ${entry.sourceProjectId}`,
        });
        continue;
      }

      // Only auto-add `required` deps. Skip optional/embedded.
      if (dep.dependencyType !== "required") continue;

      // Resolve the dep to the best matching version.
      const resolved = await resolveLatest(dep.projectId, mcVersion, loader);
      if (!resolved) {
        warnings.push({
          projectId: dep.projectId,
          reason: `No version of ${dep.projectId} matches ${loader} ${mcVersion}`,
        });
        continue;
      }

      added.push(resolved);

      // Enqueue this dep's own dependencies for recursive walk.
      if (resolved.dependencies.length > 0) {
        queue.push({
          sourceProjectId: resolved.projectId,
          deps: resolved.dependencies,
        });
      }
    }
  }

  return { added, warnings, conflicts };
}
