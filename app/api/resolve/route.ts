import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { getProject } from "@/lib/api/modrinth";
import { resolveLatest, resolveSpecificVersion } from "@/lib/resolve/version-resolver";
import { resolveDependencies } from "@/lib/resolve/dependency-resolver";

export const runtime = "nodejs";

// Resolves the latest compatible version for a mod + its required dependencies.
// Called by the client before committing a mod add — the client shows a
// DependencyDialog with the resolution result, then writes the batch.
//
// Body: { projectId, mcVersion, loader, existingProjectIds }
// Returns: { resolved, deps: { added, warnings, conflicts }, projectInfo }
export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    projectId: string;
    mcVersion: string;
    loader: string;
    existingProjectIds: string[];
    versionId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, mcVersion, loader, existingProjectIds, versionId } = body;
  if (!projectId || !mcVersion || !loader) {
    return NextResponse.json(
      { error: "projectId, mcVersion, and loader are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Resolve the root mod's best version.
    const resolved = versionId
      ? await resolveSpecificVersion(projectId, versionId)
      : await resolveLatest(projectId, mcVersion, loader);
    if (!resolved) {
      return NextResponse.json({
        resolved: null,
        deps: { added: [], warnings: [], conflicts: [] },
        error: `No version of ${projectId} matches ${loader} ${mcVersion}`,
      });
    }

    // 2. Walk required dependencies recursively.
    const existingSet = new Set(existingProjectIds ?? []);
    const deps = await resolveDependencies(
      resolved,
      mcVersion,
      loader,
      existingSet
    );

    // 3. Fetch project info for all auto-added deps AND conflict mods (for display in the dialog).
    const depProjectInfos: Record<
      string,
      {
        name: string;
        slug: string;
        iconUrl: string | null;
        clientSide: string;
        serverSide: string;
      }
    > = {};

    // Collect all project IDs that need name resolution
    const projectIdsToFetch = new Set<string>();
    for (const dep of deps.added) projectIdsToFetch.add(dep.projectId);
    for (const conflict of deps.conflicts) {
      projectIdsToFetch.add(conflict.targetProjectId);
      projectIdsToFetch.add(conflict.sourceProjectId);
    }

    for (const pid of projectIdsToFetch) {
      try {
        const proj = await getProject(pid);
        depProjectInfos[pid] = {
          name: proj.title,
          slug: proj.slug,
          iconUrl: proj.icon_url ?? null,
          clientSide: proj.client_side || "unknown",
          serverSide: proj.server_side || "unknown",
        };
      } catch {
        depProjectInfos[pid] = {
          name: pid,
          slug: "",
          iconUrl: null,
          clientSide: "unknown",
          serverSide: "unknown",
        };
      }
    }

    // Re-write conflict reasons using real mod names
    deps.conflicts = deps.conflicts.map((c) => ({
      ...c,
      reason: `"${depProjectInfos[c.targetProjectId]?.name ?? c.targetProjectId}" is marked incompatible by "${depProjectInfos[c.sourceProjectId]?.name ?? c.sourceProjectId}"`,
    }));

    return NextResponse.json({
      resolved,
      deps,
      depProjectInfos,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resolution failed";
    const status = message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
