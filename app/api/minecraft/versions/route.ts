import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";

export const runtime = "nodejs";
export const revalidate = 3600;

const MODRINTH_GAME_VERSION_URL = "https://api.modrinth.com/v2/tag/game_version";
const USER_AGENT =
  "my-mc-modlist/0.1 (github.com/qninhdt/my-mc-modlist; community modpack manager)";

type ModrinthGameVersion = {
  version: string;
  version_type: "release" | "snapshot" | "alpha" | "beta";
  date: string;
  major: boolean;
};

// Returns the list of Minecraft release versions, newest first. Modrinth requires a
// descriptive User-Agent the browser cannot set, so this runs server-side. P3 routes
// this through the shared Firestore cache mirror; here a short edge cache suffices.
export async function GET(request: NextRequest) {
  try {
    const res = await fetch(MODRINTH_GAME_VERSION_URL, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Modrinth responded ${res.status}` },
        { status: 502 }
      );
    }
    const all = (await res.json()) as ModrinthGameVersion[];
    const releases = all
      .filter((v) => v.version_type === "release")
      .map((v) => v.version);
    return NextResponse.json({ versions: releases });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch Minecraft versions" },
      { status: 502 }
    );
  }
}
