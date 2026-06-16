import { type NextRequest, NextResponse } from "next/server";
import { getProject, getProjectMembers } from "@/lib/api/modrinth";
import { searchMods, getMod } from "@/lib/api/modpackindex";
import { normalizeProject, normalizeCurseforgeOnly, mapCurseforgeCategory } from "@/lib/api/normalize";
import type { ModpackIndexMod } from "@/lib/api/types";
import { isSqliteDbAvailable, localGetCurseforgeMod, localGetModBySlug } from "@/lib/api/sqlite-helper";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

// Mod detail: full Modrinth project + best-effort ModpackIndex CF-badge enrichment.
// ID-token gated (proxy checks Bearer presence; verifyRequest does the crypto check).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing mod id" }, { status: 400 });
  }

  const decodedId = decodeURIComponent(id);

  if (decodedId.startsWith("custom-")) {
    const packId = request.nextUrl.searchParams.get("packId");
    if (!packId) {
      return NextResponse.json({ error: "Missing packId query parameter for custom mod lookup" }, { status: 400 });
    }
    try {
      const db = await adminDb();
      const docRef = db.collection("modpacks").doc(packId).collection("mods").doc(decodedId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Custom mod not found in this pack" }, { status: 404 });
      }
      const data = snap.data();
      const mod = {
        id: data?.projectId,
        name: data?.name,
        summary: data?.summary || "",
        iconUrl: data?.iconUrl || null,
        tags: data?.categories || [],
        clientSide: data?.clientSide || "unknown",
        serverSide: data?.serverSide || "unknown",
        downloads: 0,
        sources: {},
        modrinthProjects: [],
        curseforgeManual: true,
        body: data?.summary || "Manual custom mod",
        published: data?.uploadedAt || data?.createdAt || null,
        updated: data?.uploadedAt || data?.createdAt || null,
        gallery: [],
        members: [],
        discordUrl: null,
        issuesUrl: null,
        sourceUrl: null,
        wikiUrl: null,
      };
      return NextResponse.json({ mod });
    } catch (err: any) {
      console.error("Failed to load custom mod details:", err);
      return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
    }
  }

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
              headers: { "User-Agent": "qninhdt/my-mc-modlist/0.1.0" },
              next: { revalidate: 3600 },
            });
            if (res.ok) {
              const cfData = await res.json();
              if (cfData && cfData.id) {
                mpiId = cfData.id;
              }
            }
          } catch (err) {
            console.warn("Failed to fetch CFWidget data by slug in mod detail:", err);
          }
        }
      }

      if (isNaN(mpiId)) {
        return NextResponse.json({ error: "Invalid CurseForge mod ID or slug" }, { status: 400 });
      }

      const mpiMod = await getMod(mpiId);
      if (!mpiMod) {
        return NextResponse.json({ error: "Mod not found on CurseForge index" }, { status: 404 });
      }

      // Best-effort: fetch full CurseForge description, loaders, and links from local DB or cfwidget
      let cfWidgetData: any = null;
      const curseId = mpiMod.curse_info?.curse_id;
      if (curseId) {
        if (isSqliteDbAvailable()) {
          cfWidgetData = await localGetCurseforgeMod(curseId);
        }

        if (!cfWidgetData) {
          try {
            const res = await fetch(`https://api.cfwidget.com/${curseId}`, {
              headers: { "User-Agent": "qninhdt/my-mc-modlist/0.1.0" },
              next: { revalidate: 3600 },
            });
            if (res.ok) {
              cfWidgetData = await res.json();
            }
          } catch (err) {
            console.warn("Failed to fetch CFWidget data:", err);
          }
        }
      }

      const normalized = normalizeCurseforgeOnly(mpiMod);

      // Extract loaders from CFWidget files versions list
      const loadersSet = new Set<string>();
      if (cfWidgetData?.files) {
        const possibleLoaders = ["forge", "fabric", "neoforge", "quilt"];
        for (const file of cfWidgetData.files) {
          if (file.versions) {
            for (const v of file.versions) {
              const low = v.toLowerCase();
              if (possibleLoaders.includes(low)) {
                if (low === "forge") loadersSet.add("Forge");
                else if (low === "fabric") loadersSet.add("Fabric");
                else if (low === "neoforge") loadersSet.add("NeoForge");
                else if (low === "quilt") loadersSet.add("Quilt");
                else loadersSet.add(v);
              }
            }
          }
        }
      }
      const loaders = Array.from(loadersSet);

      const categories = Array.from(
        new Set([
          ...(normalized.tags ?? []),
          ...(cfWidgetData?.categories?.map((c: string) => mapCurseforgeCategory(c)) ?? []),
        ])
      );

      const sources = {
        ...normalized.sources,
        ...(cfWidgetData?.urls?.project ? { curseforge: { url: cfWidgetData.urls.project } } : {}),
      };

      const members = cfWidgetData?.members
        ? cfWidgetData.members.map((m: any) => ({
            user: {
              id: `cf_member_${m.id || m.username}`,
              username: m.username,
              name: m.username,
              avatar_url: undefined,
            },
            role: m.title || "Author",
          }))
        : mpiMod.authors?.map((a: any, idx: number) => ({
            user: {
              id: `mpi_author_${a.id ?? idx}`,
              username: a.slug || a.name?.toLowerCase().replace(/\s+/g, "_") || "author",
              name: a.name,
              avatar_url: undefined,
            },
            role: "Author",
          })) ?? [];

      // Extract images from description HTML to populate gallery
      const gallery: { url: string; title: string; description: string }[] = [];
      if (cfWidgetData?.description) {
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
        let match;
        let count = 0;
        while ((match = imgRegex.exec(cfWidgetData.description)) !== null && count < 10) {
          const imgUrl = match[1];
          if (!gallery.some(g => g.url === imgUrl)) {
            gallery.push({
              url: imgUrl,
              title: `Screenshot ${count + 1}`,
              description: "",
            });
            count++;
          }
        }
      }

      return NextResponse.json({
        mod: {
          ...normalized,
          tags: categories,
          sources,
          modrinthProjects: [
            { projectId: `cf:${mpiMod.id}`, slug: mpiMod.slug, loaders },
          ],
          body: cfWidgetData?.description || mpiMod.summary || "No description available.",
          published: mpiMod.latest_release_date ?? null,
          updated: mpiMod.last_updated ?? null,
          gallery,
          members,
          discordUrl: null,
          issuesUrl: cfWidgetData?.urls?.issues || null,
          sourceUrl: cfWidgetData?.urls?.source || null,
          wikiUrl: cfWidgetData?.urls?.wiki || null,
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load CurseForge mod";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  try {
    const project = await getProject(decodedId);
    const members = await getProjectMembers(decodedId).catch(() => []);

    // Best-effort CF badge: find a ModpackIndex mod whose modrinth_info references
    // this project. Never let an MPI failure break the detail view.
    let mpiMatch: ModpackIndexMod | null = null;
    try {
      const candidates = await searchMods(project.title);
      mpiMatch =
        candidates?.data?.find((m) =>
          m.modrinth_info?.some((info) => info.project_id === project.id)
        ) ?? null;
    } catch {
      mpiMatch = null;
    }

    const normalized = normalizeProject(project, mpiMatch);

    return NextResponse.json({
      mod: {
        ...normalized,
        body: project.body,
        published: project.published,
        updated: project.updated,
        gallery: project.gallery?.map((g) => ({
          url: g.url,
          title: g.title,
          description: g.description,
        })) ?? [],
        members,
        discordUrl: project.discord_url,
        issuesUrl: project.issues_url,
        sourceUrl: project.source_url,
        wikiUrl: project.wiki_url,
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mod";
    const status = message.includes("404") ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
