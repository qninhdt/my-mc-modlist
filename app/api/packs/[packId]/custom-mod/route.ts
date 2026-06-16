import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { getProject } from "@/lib/api/modrinth";
import { getMod } from "@/lib/api/modpackindex";
import { isSqliteDbAvailable, localGetModBySlug, localGetVersion } from "@/lib/api/sqlite-helper";
import { mapCurseforgeCategory } from "@/lib/api/normalize";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ packId: string }> }
) {
  const { packId } = await props.params;

  // 1. Authenticate user
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { uid, token } = auth;

  try {
    const db = await adminDb();
    const packRef = db.collection("modpacks").doc(packId);
    const packSnap = await packRef.get();
    
    if (!packSnap.exists) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }

    const packData = packSnap.data();
    const memberUids: string[] = packData?.memberUids || [];
    if (!memberUids.includes(uid)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const role = packData?.members?.[uid];
    if (role !== "editor") {
      return NextResponse.json({ error: "Only editors can add custom mods" }, { status: 403 });
    }

    const body = await request.json();
    const { name, summary, iconUrl, clientSide, serverSide, categories, modUrl, versionId } = body;

    let resolvedMod: any = null;

    if (modUrl && modUrl.trim()) {
      const trimmedUrl = modUrl.trim();
      if (trimmedUrl.includes("modrinth.com")) {
        // Modrinth URL resolution
        const parts = trimmedUrl.replace(/\/$/, "").split("/");
        const slug = parts.pop() || "";
        try {
          const project = await getProject(slug);
          resolvedMod = {
            projectId: project.id,
            slug: project.slug,
            name: project.title,
            summary: project.description || "",
            iconUrl: project.icon_url || null,
            categories: project.categories || [],
            clientSide: project.client_side || "unknown",
            serverSide: project.server_side || "unknown",
            curseforgeManual: false,
          };
        } catch (err) {
          console.warn(`Failed to resolve Modrinth project from URL ${trimmedUrl}:`, err);
          return NextResponse.json(
            { error: `Could not resolve Modrinth mod from URL: ${trimmedUrl}` },
            { status: 400 }
          );
        }
      } else if (trimmedUrl.includes("curseforge.com")) {
        // CurseForge URL resolution
        const parts = trimmedUrl.replace(/\/$/, "").split("/");
        const slug = parts.pop() || "";
        
        let mpiMod: any = null;
        if (isSqliteDbAvailable()) {
          mpiMod = await localGetModBySlug(slug);
        }

        if (!mpiMod) {
          try {
            const res = await fetch(`https://api.cfwidget.com/${slug}`, {
              headers: { "User-Agent": "qninhdt/my-mc-modlist/0.1.0" },
            });
            if (res.ok) {
              const cfData = await res.json();
              mpiMod = {
                curse_id: cfData.id,
                slug: slug,
                name: cfData.title,
                summary: cfData.summary || "",
                thumbnail_url: cfData.thumbnail || null,
                categories_json: JSON.stringify(cfData.categories || []),
                client_side: "unknown",
                server_side: "unknown"
              };
            }
          } catch (err) {
            console.warn("Failed to fetch CFWidget details for custom mod:", err);
          }
        }

        if (mpiMod) {
          resolvedMod = {
            projectId: `cf:${mpiMod.curse_id || mpiMod.id || slug}`,
            slug: mpiMod.slug,
            name: mpiMod.name,
            summary: mpiMod.summary || "",
            iconUrl: mpiMod.thumbnail_url || null,
            categories: mpiMod.categories_json 
              ? (typeof mpiMod.categories_json === "string" ? JSON.parse(mpiMod.categories_json) : mpiMod.categories_json).map((c: any) => typeof c === "string" ? mapCurseforgeCategory(c) : mapCurseforgeCategory(c.name))
              : [],
            clientSide: mpiMod.client_side || "unknown",
            serverSide: mpiMod.server_side || "unknown",
            curseforgeManual: true, // CF mods require manual uploads
          };
        } else {
          // Fallback manual CF mod if resolve fails but it's a CF URL
          resolvedMod = {
            projectId: `cf:${slug}`,
            slug: slug,
            name: name || `CurseForge Mod (${slug})`,
            summary: summary || "CurseForge mod resolved manually",
            iconUrl: iconUrl || null,
            categories: categories || [],
            clientSide: clientSide || "unknown",
            serverSide: serverSide || "unknown",
            curseforgeManual: true,
          };
        }
      } else {
        return NextResponse.json({ error: "Unsupported mod URL. Only Modrinth and CurseForge URLs are supported." }, { status: 400 });
      }
    } else {
      // Pure manual entry
      if (!name || !name.trim()) {
        return NextResponse.json({ error: "Mod Name is required for custom mods" }, { status: 400 });
      }
      const customId = `custom-${crypto.randomUUID()}`;
      const customSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      resolvedMod = {
        projectId: customId,
        slug: customSlug,
        name: name.trim(),
        summary: summary || "",
        iconUrl: iconUrl || null,
        categories: categories || [],
        clientSide: clientSide || "both",
        serverSide: serverSide || "both",
        curseforgeManual: true, // Manual mods require manual JAR uploads
      };
    }

    let versionPin: any = null;
    if (versionId) {
      let mVersion: any = null;
      if (isSqliteDbAvailable()) {
        mVersion = await localGetVersion(versionId);
      }
      if (!mVersion) {
        try {
          const res = await fetch(`https://api.modrinth.com/v2/version/${versionId}`);
          if (res.ok) {
            mVersion = await res.json();
          }
        } catch (err) {
          console.warn("Failed to fetch version details from Modrinth API:", err);
        }
      }

      if (mVersion) {
        const primaryFile = mVersion.files?.[0] || null;
        versionPin = {
          versionId: mVersion.id,
          fileName: primaryFile?.filename || primaryFile?.name || null,
          downloadUrl: primaryFile?.url || null,
          sha1: primaryFile?.hashes?.sha1 || null,
          sha512: primaryFile?.hashes?.sha512 || null,
          fileSize: primaryFile?.size || null,
        };
      }
    }

    // Write to Firestore pack mods subcollection
    const id = resolvedMod.projectId.replace(/\//g, "_");
    const docRef = packRef.collection("mods").doc(id);

    const packModData = {
      projectId: resolvedMod.projectId,
      slug: resolvedMod.slug ?? "",
      name: resolvedMod.name,
      summary: resolvedMod.summary ?? "",
      iconUrl: resolvedMod.iconUrl ?? null,
      categories: resolvedMod.categories ?? [],
      clientSide: clientSide ?? resolvedMod.clientSide ?? "unknown",
      serverSide: serverSide ?? resolvedMod.serverSide ?? "unknown",
      curseforgeManual: resolvedMod.curseforgeManual ?? false,
      addedByUid: uid,
      addedAt: new Date(),
      viaDependency: false,
      versionId: versionPin?.versionId ?? null,
      fileName: versionPin?.fileName ?? null,
      downloadUrl: versionPin?.downloadUrl ?? null,
      sha1: versionPin?.sha1 ?? null,
      sha512: versionPin?.sha512 ?? null,
      deps: [],
      storagePath: null,
      fileSize: versionPin?.fileSize ?? null,
      uploadedByUid: null,
      uploadedAt: null,
      createdAt: new Date(),
    };

    await docRef.set(packModData);

    // Recompute mod count
    const modsCol = packRef.collection("mods");
    const countSnap = await modsCol.count().get();
    const modCount = countSnap.data().count;
    await packRef.update({
      modCount,
      updatedAt: new Date(),
    });

    // Log Activity
    const actor = {
      uid: uid,
      displayName: token.name || token.email || "Creator",
      photoURL: token.picture || null,
    };

    await packRef.collection("activity").add({
      type: "mod_added",
      actor,
      payload: {
        modId: resolvedMod.projectId,
        modName: resolvedMod.name,
        viaDependency: false,
      },
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      mod: packModData,
    });
  } catch (err: any) {
    console.error("Error in custom mod route:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
