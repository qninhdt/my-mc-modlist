import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { getProject } from "@/lib/api/modrinth";
import { getMod } from "@/lib/api/modpackindex";
import { isSqliteDbAvailable, localGetCurseforgeFile } from "@/lib/api/sqlite-helper";
import { mapCurseforgeCategory } from "@/lib/api/normalize";

export const runtime = "nodejs";

async function fetchCfFile(curseId: number, fileId: number): Promise<any | null> {
  try {
    const res = await fetch(`https://api.cfwidget.com/${curseId}`, {
      headers: { "User-Agent": "qninhdt/my-mc-modlist/0.1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const file = data?.files?.find((f: any) => f.id === fileId);
    return file || null;
  } catch (err) {
    console.warn(`[cfwidget fetch failed for project ${curseId}]:`, err);
    return null;
  }
}

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
  const { uid } = auth;

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
      return NextResponse.json({ error: "Only editors can import mods" }, { status: 403 });
    }

    const body = await request.json();
    const { type, files } = body;

    if (!type || !Array.isArray(files)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const resolvedEntries: any[] = [];
    const failures: string[] = [];

    if (type === "modrinth") {
      for (const file of files) {
        try {
          const project = await getProject(file.projectId);
          resolvedEntries.push({
            input: {
              projectId: project.id,
              slug: project.slug,
              name: project.title,
              summary: project.description || "",
              iconUrl: project.icon_url || null,
              categories: project.categories || [],
              clientSide: project.client_side || "unknown",
              serverSide: project.server_side || "unknown",
              curseforgeManual: false,
            },
            versionPin: {
              versionId: file.versionId,
              fileName: file.fileName,
              downloadUrl: file.downloadUrl,
              sha1: file.sha1 || null,
              sha512: file.sha512 || null,
              fileSize: file.fileSize || null,
              deps: [],
            }
          });
        } catch (err: any) {
          console.warn(`Failed to resolve Modrinth project ${file.projectId}:`, err);
          resolvedEntries.push({
            input: {
              projectId: file.projectId,
              slug: file.projectId,
              name: file.fileName?.replace(/\.jar$/, "") || file.projectId,
              summary: "Imported via Modrinth pack",
              iconUrl: null,
              categories: [],
              clientSide: "both",
              serverSide: "both",
              curseforgeManual: false,
            },
            versionPin: {
              versionId: file.versionId,
              fileName: file.fileName,
              downloadUrl: file.downloadUrl,
              sha1: file.sha1 || null,
              sha512: file.sha512 || null,
              fileSize: file.fileSize || null,
              deps: [],
            }
          });
        }
      }
    } else if (type === "curseforge") {
      for (const file of files) {
        const { projectIdCf, fileIdCf } = file;
        try {
          const mpiMod = await getMod(projectIdCf);
          let cfFile: any = null;

          if (isSqliteDbAvailable()) {
            cfFile = await localGetCurseforgeFile(fileIdCf);
          }
          if (!cfFile) {
            cfFile = await fetchCfFile(projectIdCf, fileIdCf);
          }

          if (mpiMod) {
            resolvedEntries.push({
              input: {
                projectId: `cf:${mpiMod.id}`,
                slug: mpiMod.slug,
                name: mpiMod.name,
                summary: mpiMod.summary || "",
                iconUrl: mpiMod.thumbnail_url || null,
                categories: mpiMod.categories?.map((c: any) => mapCurseforgeCategory(c.name)) || [],
                clientSide: "unknown",
                serverSide: "unknown",
                curseforgeManual: true,
              },
              versionPin: cfFile ? {
                versionId: String(fileIdCf),
                fileName: cfFile.name || cfFile.display || `cf-${fileIdCf}.jar`,
                downloadUrl: cfFile.url || `https://www.curseforge.com/minecraft/mc-mods/${mpiMod.slug}/download/${fileIdCf}`,
                sha1: null,
                sha512: null,
                fileSize: cfFile.filesize || null,
                deps: [],
              } : null
            });
          } else {
            resolvedEntries.push({
              input: {
                projectId: `cf:${projectIdCf}`,
                slug: `cf-${projectIdCf}`,
                name: cfFile?.name?.replace(/\.jar$/, "") || `CurseForge Mod ${projectIdCf}`,
                summary: "Imported via CurseForge manifest",
                iconUrl: null,
                categories: [],
                clientSide: "unknown",
                serverSide: "unknown",
                curseforgeManual: true,
              },
              versionPin: cfFile ? {
                versionId: String(fileIdCf),
                fileName: cfFile.name || `cf-${fileIdCf}.jar`,
                downloadUrl: cfFile.url || `https://www.curseforge.com/minecraft/mc-mods/unknown/download/${fileIdCf}`,
                sha1: null,
                sha512: null,
                fileSize: cfFile.filesize || null,
                deps: [],
              } : null
            });
          }
        } catch (err: any) {
          console.warn(`Failed to resolve CurseForge mod/file ${projectIdCf}/${fileIdCf}:`, err);
          failures.push(`CurseForge Mod ID: ${projectIdCf}, File ID: ${fileIdCf}`);
        }
      }
    }

    if (resolvedEntries.length === 0) {
      return NextResponse.json({ error: "No mods could be resolved for import" }, { status: 400 });
    }

    const modsCol = packRef.collection("mods");
    const BATCH_SIZE = 500;
    let importedCount = 0;
    
    for (let i = 0; i < resolvedEntries.length; i += BATCH_SIZE) {
      const chunk = resolvedEntries.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      
      for (const entry of chunk) {
        const id = entry.input.projectId.replace(/\//g, "_");
        const docRef = modsCol.doc(id);
        
        batch.set(docRef, {
          projectId: entry.input.projectId,
          slug: entry.input.slug ?? "",
          name: entry.input.name,
          summary: entry.input.summary ?? "",
          iconUrl: entry.input.iconUrl ?? null,
          categories: entry.input.categories ?? [],
          clientSide: entry.input.clientSide ?? "unknown",
          serverSide: entry.input.serverSide ?? "unknown",
          curseforgeManual: entry.input.curseforgeManual ?? false,
          addedByUid: uid,
          addedAt: new Date(),
          viaDependency: false,
          versionId: entry.versionPin?.versionId ?? null,
          fileName: entry.versionPin?.fileName ?? null,
          downloadUrl: entry.versionPin?.downloadUrl ?? null,
          sha1: entry.versionPin?.sha1 ?? null,
          sha512: entry.versionPin?.sha512 ?? null,
          deps: [],
          storagePath: null,
          fileSize: entry.versionPin?.fileSize ?? null,
          uploadedByUid: null,
          uploadedAt: null,
          createdAt: new Date(),
        });
        importedCount++;
      }
      
      await batch.commit();
    }

    const countSnap = await modsCol.count().get();
    const modCount = countSnap.data().count;
    await packRef.update({
      modCount,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      importedCount,
      failures,
    });
  } catch (err: any) {
    console.error("Error in pack import route:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
