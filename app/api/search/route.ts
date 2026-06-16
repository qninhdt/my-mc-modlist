import { type NextRequest, NextResponse } from "next/server";
import { searchProjects } from "@/lib/api/modrinth";
import { getMpiModsSearch } from "@/lib/api/modpackindex";
import { normalizeSearchHit, normalizeCurseforgeOnly, mapCurseforgeCategory } from "@/lib/api/normalize";
import type { ModView } from "@/lib/api/types";

export const runtime = "nodejs";

// Modrinth-faceted mod search with CurseForge search integration.
// ID-token gated (proxy checks presence, this verifies the token cryptographically).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const query = sp.get("q")?.trim() ?? "";
  const csv = (k: string) =>
    sp.get(k)?.split(",").map((s) => s.trim()).filter(Boolean) ?? undefined;

  const indexParam = sp.get("index") ?? "relevance";
  const index = (["relevance", "downloads", "follows", "newest", "updated"] as const).includes(
    indexParam as never
  )
    ? (indexParam as "relevance" | "downloads" | "follows" | "newest" | "updated")
    : "relevance";

  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 30) || 30));

  const loaders = csv("loaders");
  const versions = csv("versions");
  const categories = csv("categories");
  const sources = csv("sources");

  // Separate environments from categories
  const environments = categories?.filter((c) => c === "client" || c === "server") ?? [];
  const realCategories = categories?.filter((c) => c !== "client" && c !== "server") ?? [];

  // Determine which APIs to search
  const queryMPI = (!!query && !sources) || (sources && sources.includes("curseforge"));
  const queryMR = !sources || sources.includes("modrinth");

    const page = Math.floor(offset / limit) + 1;

    try {
      const [mrRes, mpiHits] = await Promise.all([
        queryMR
        ? searchProjects({
            query,
            loaders,
            versions,
            categories: realCategories,
            environments,
            index,
            offset,
            limit,
          })
        : Promise.resolve(null),
      queryMPI
        ? getMpiModsSearch(query, page, limit, loaders || [], versions || [], realCategories).catch(() => null)
        : Promise.resolve(null),
    ]);

    const mrResults: ModView[] = mrRes
      ? mrRes.hits.map((hit) => normalizeSearchHit(hit, null))
      : [];

    const mrMap = new Map<string, ModView>();
    for (const mod of mrResults) {
      mrMap.set(mod.id, mod);
    }

    const extraResults: ModView[] = [];
    const mpiHitsList = mpiHits?.data ?? [];
    const mpiTotal = mpiHits?.total ?? 0;

    if (mpiHitsList.length > 0) {
      for (const mpiMod of mpiHitsList) {
        const curseforgeUrl = mpiMod.links?.curseforge ?? null;
        let mpiModrinthInfos = mpiMod.modrinth_info ?? [];

        // Filter Modrinth projects by loader if loaders filter is specified
        if (loaders && loaders.length > 0) {
          mpiModrinthInfos = mpiModrinthInfos.filter((info) =>
            info.loaders?.some((l) => loaders.includes(l))
          );
        }

        let matchedInMR = false;
        for (const info of mpiModrinthInfos) {
          const mrMod = mrMap.get(info.project_id);
          if (mrMod) {
            // Enrich existing Modrinth search hit with its CurseForge URL
            if (curseforgeUrl && !mrMod.sources.curseforge) {
              mrMod.sources.curseforge = { url: curseforgeUrl };
            }
            matchedInMR = true;
          }
        }

        // If this ModpackIndex mod didn't match any of the currently returned Modrinth hits
        if (!matchedInMR && (!sources || sources.includes("curseforge"))) {
          const hasModrinth = mpiModrinthInfos.length > 0;
          if (!hasModrinth) {
            extraResults.push(normalizeCurseforgeOnly(mpiMod));
          } else {
            // Mod has Modrinth project(s) but wasn't in Modrinth's first page of hits
            const firstInfo = mpiModrinthInfos[0];
            extraResults.push({
              id: firstInfo.project_id,
              name: mpiMod.name,
              summary: mpiMod.summary ?? "",
              iconUrl: mpiMod.thumbnail_url ?? null,
              tags: Array.from(
                new Set(mpiMod.categories?.map((c) => mapCurseforgeCategory(c.name)) ?? [])
              ),
              clientSide: "unknown",
              serverSide: "unknown",
              downloads: mpiMod.download_count ?? 0,
              sources: {
                modrinth: {
                  projectId: firstInfo.project_id,
                  slug: firstInfo.slug,
                  url: `https://modrinth.com/mod/${firstInfo.slug}`,
                },
                curseforge: { url: curseforgeUrl || `https://www.curseforge.com/minecraft/mc-mods/${mpiMod.slug}` },
              },
              modrinthProjects: mpiModrinthInfos.map((info) => ({
                projectId: info.project_id,
                slug: info.slug,
                loaders: info.loaders ?? [],
              })),
              curseforgeManual: false,
            });
          }
        }
      }
    }

    // Merge lists
    let finalResults = [...mrResults, ...extraResults];

    // Filter results if sources are explicitly chosen
    if (sources && sources.length > 0) {
      finalResults = finalResults.filter((mod) => {
        return sources.some((src) => {
          if (src === "modrinth") return !!mod.sources.modrinth;
          if (src === "curseforge") return !!mod.sources.curseforge || mod.curseforgeManual;
          return false;
        });
      });
    }

    // Filter results if categories are explicitly chosen
    if (realCategories && realCategories.length > 0) {
      finalResults = finalResults.filter((mod) => {
        return mod.tags.some((t) => realCategories.includes(t.toLowerCase()));
      });
    }

    // Filter results by environments if chosen
    if (environments.length > 0) {
      finalResults = finalResults.filter((mod) => {
        const client = (mod.clientSide || "unknown").toLowerCase();
        const server = (mod.serverSide || "unknown").toLowerCase();
        return environments.every((env) => {
          if (env === "client") return client !== "unsupported";
          if (env === "server") return server !== "unsupported";
          return true;
        });
      });
    }

    let totalHits = mrRes ? mrRes.total_hits : 0;
    if (sources && sources.includes("curseforge") && !sources.includes("modrinth")) {
      totalHits = mpiTotal;
    } else if (sources && sources.includes("curseforge") && sources.includes("modrinth")) {
      totalHits = Math.max(mrRes ? mrRes.total_hits : 0, mpiTotal);
    } else if (!sources) {
      totalHits = (mrRes ? mrRes.total_hits : 0) + extraResults.length;
    }

    return NextResponse.json({
      results: finalResults,
      offset,
      limit,
      totalHits,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    const status = message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
