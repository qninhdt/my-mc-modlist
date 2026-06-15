// Resolution types for P4: version resolver, dependency resolver, update checker.
// All types are pure data — no Firestore, no React, no side effects.

import type { ModrinthDependencyType } from "@/lib/api/types";

// A resolved file for a specific mod version: everything needed to pin a mod
// to a pack and later export it as .mrpack (P5 needs sha1 + sha512).
export type ResolvedFile = {
  url: string;
  filename: string;
  size: number;
  sha1: string;
  sha512: string;
};

// The result of resolving the best version for a project on a given MC version + loader.
export type ResolvedVersion = {
  versionId: string;
  projectId: string;
  file: ResolvedFile;
  dependencies: ResolvedDependencyRef[];
};

// A dependency reference extracted from a resolved version. Not yet itself resolved —
// the dependency resolver resolves these recursively.
export type ResolvedDependencyRef = {
  projectId: string;
  versionId: string | null; // null = project-level dep (resolve latest)
  dependencyType: ModrinthDependencyType;
};

// Full result of the dependency walk: which mods were auto-added, any warnings,
// and any conflicts (incompatible deps). Pure data — the caller decides what to write.
export type DependencyResolutionResult = {
  added: ResolvedVersion[];
  warnings: DependencyWarning[];
  conflicts: DependencyConflict[];
};

export type DependencyWarning = {
  projectId: string;
  reason: string;
};

export type DependencyConflict = {
  sourceProjectId: string;
  targetProjectId: string;
  dependencyType: "incompatible";
  reason: string;
};

// Update check result for a single mod in the pack.
export type UpdateCheckResult = {
  projectId: string;
  currentVersionId: string;
  latestVersionId: string | null;
  hasUpdate: boolean;
  latestFile: ResolvedFile | null;
};
