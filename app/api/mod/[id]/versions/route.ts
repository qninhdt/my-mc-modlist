import { type NextRequest, NextResponse } from "next/server";
import { getProjectVersions } from "@/lib/api/modrinth";
import { getMod } from "@/lib/api/modpackindex";
import { isSqliteDbAvailable, localGetCurseforgeModFiles, localGetModBySlug } from "@/lib/api/sqlite-helper";

export const runtime = "nodejs";

const USER_AGENT = "qninhdt/my-mc-modlist/0.1.0 (mc-modlist on vercel)";

function isMinecraftVersion(v: string): boolean {
  return /^1\.\d+(\.\d+)?$/.test(v);
}

// Proxies Modrinth's version list or converts CurseForge widget files to standard format.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  const decodedId = decodeURIComponent(id);
  const isCf = decodedId.startsWith("cf:") || /^\d+$/.test(decodedId);
  if (isCf) {
    try {
      const cfSlugOrId = decodedId.startsWith("cf:")
        ? decodedId.slice(3)
        : decodedId;
      
      let mpiId = parseInt(cfSlugOrId, 10);

      if (isNaN(mpiId)) {
        // Look up by slug in SQLite
        if (isSqliteDbAvailable()) {
          const localMod = await localGetModBySlug(cfSlugOrId);
          if (localMod) {
            mpiId = localMod.mpi_id || localMod.curse_id || parseInt(localMod.id, 10);
          }
        }

        // If not found in SQLite, fetch from cfwidget using the slug
        if (isNaN(mpiId)) {
          try {
            const res = await fetch(`https://api.cfwidget.com/${cfSlugOrId}`, {
              headers: { "User-Agent": USER_AGENT },
              next: { revalidate: 3600 },
            });
            if (res.ok) {
              const cfData = await res.json();
              if (cfData && cfData.id) {
                mpiId = cfData.id;
              }
            }
          } catch (err) {
            console.warn("Failed to fetch CFWidget data by slug in versions:", err);
          }
        }
      }

      if (isNaN(mpiId)) {
        return NextResponse.json({ versions: [] });
      }

      const mpiMod = await getMod(mpiId);
      if (!mpiMod || !mpiMod.curse_info?.curse_id) {
        return NextResponse.json({ versions: [] });
      }

      const curseId = mpiMod.curse_info.curse_id;
      let files: any[] = [];
      if (isSqliteDbAvailable()) {
        const localFiles = await localGetCurseforgeModFiles(curseId);
        if (localFiles) {
          files = localFiles;
        }
      }

      if (files.length === 0) {
        try {
          const res = await fetch(`https://api.cfwidget.com/${curseId}`, {
            headers: { "User-Agent": USER_AGENT },
            next: { revalidate: 3600 },
          });
          if (res.ok) {
            const cfWidgetData = await res.json();
            files = cfWidgetData?.files || [];
          }
        } catch (err) {
          console.warn("Failed to fetch CurseForge versions from widget API:", err);
        }
      }

      const versions = files.map((f: any) => {
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
          project_id: `cf:${mpiMod.id}`,
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
              hashes: { sha1: "", sha512: "" }
            }
          ]
        };
      });

      const sp = request.nextUrl.searchParams;
      const csv = (k: string) =>
        sp.get(k)?.split(",").map((s) => s.trim()).filter(Boolean) ?? undefined;

      const reqLoaders = csv("loaders");
      const reqGameVersions = csv("game_versions");

      let filteredVersions = versions;

      if (reqGameVersions && reqGameVersions.length > 0) {
        filteredVersions = filteredVersions.filter((v: any) =>
          v.game_versions.some((gv: string) => reqGameVersions.includes(gv))
        );
      }

      if (reqLoaders && reqLoaders.length > 0) {
        const lowerReqLoaders = reqLoaders.map((rl) => rl.toLowerCase());
        filteredVersions = filteredVersions.filter((v: any) =>
          v.loaders.some((l: string) => lowerReqLoaders.includes(l.toLowerCase()))
        );
      }

      return NextResponse.json({ versions: filteredVersions });
    } catch (err) {
      console.warn("Failed to parse CurseForge versions from widget:", err);
      return NextResponse.json({ versions: [] });
    }
  }

  const sp = request.nextUrl.searchParams;
  const csv = (k: string) =>
    sp.get(k)?.split(",").map((s) => s.trim()).filter(Boolean) ?? undefined;

  try {
    const versions = await getProjectVersions(decodedId, {
      loaders: csv("loaders"),
      gameVersions: csv("game_versions"),
    });
    return NextResponse.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load versions";
    const status = message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
