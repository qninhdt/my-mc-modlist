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

    // 3. Fetch project info for all auto-added deps (for display in the dialog).
    const depProjectInfos: Record<string, { name: string; slug: string; iconUrl: string | null }> = {};
    for (const dep of deps.added) {
      try {
        const proj = await getProject(dep.projectId);
        depProjectInfos[dep.projectId] = {
          name: proj.title,
          slug: proj.slug,
          iconUrl: proj.icon_url,
        };
      } catch {
        depProjectInfos[dep.projectId] = {
          name: dep.projectId,
          slug: "",
          iconUrl: null,
        };
      }
    }

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
