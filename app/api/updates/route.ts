import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { checkUpdates } from "@/lib/resolve/update-checker";

export const runtime = "nodejs";

// Batch update check: given a list of mods with their current pinned versionId,
// returns which ones have a newer compatible version available.
//
// Body: { mods: [{ projectId, currentVersionId }], mcVersion, loader }
// Returns: { results: UpdateCheckResult[] }
export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    mods: { projectId: string; currentVersionId: string }[];
    mcVersion: string;
    loader: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mods, mcVersion, loader } = body;
  if (!mods?.length || !mcVersion || !loader) {
    return NextResponse.json(
      { error: "mods, mcVersion, and loader are required" },
      { status: 400 }
    );
  }

  try {
    const results = await checkUpdates(mods, mcVersion, loader);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update check failed";
    const status = message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
