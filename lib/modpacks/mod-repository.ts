import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { recomputeModCount } from "./repository";
import {
  packModSchema,
  type AddPackModInput,
  type PackMod,
} from "./mod-types";
import type { ActivityActor } from "@/lib/activity/types";
import { logActivity, logActivityBatch } from "@/lib/activity/log";

// Mods live under modpacks/{packId}/mods/{modId}. The doc id is the projectId so
// adding the same mod twice is idempotent (overwrites, never duplicates). projectId
// may be "cf:<curseId>" for CF-only mods — ":" is a legal Firestore doc-id char.
function modsCol(packId: string) {
  return collection(db, "modpacks", packId, "mods");
}

function safeModId(projectId: string): string {
  // Firestore doc ids cannot contain "/"; nothing else in our ids needs escaping.
  return projectId.replace(/\//g, "_");
}

export async function listPackMods(packId: string): Promise<PackMod[]> {
  const q = query(modsCol(packId), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => packModSchema.parse({ id: d.id, ...d.data() }));
}

// Adds a mod to a pack, then recomputes modCount from the aggregation query (the
// source of truth — see recomputeModCount). addedByUid attributes the action for
// the P8 activity feed.
export async function addPackMod(
  packId: string,
  input: AddPackModInput,
  actor: ActivityActor
): Promise<string> {
  const id = safeModId(input.projectId);
  await setDoc(doc(modsCol(packId), id), {
    projectId: input.projectId,
    slug: input.slug ?? "",
    name: input.name,
    summary: input.summary ?? "",
    iconUrl: input.iconUrl ?? null,
    categories: input.categories ?? [],
    clientSide: input.clientSide ?? "unknown",
    serverSide: input.serverSide ?? "unknown",
    curseforgeManual: input.curseforgeManual ?? false,
    addedByUid: actor.uid,
    addedAt: serverTimestamp(),
    viaDependency: false,
    versionId: null,
    fileName: null,
    downloadUrl: null,
    sha1: null,
    sha512: null,
    deps: [],
    storagePath: null,
    fileSize: null,
    uploadedByUid: null,
    uploadedAt: null,
    createdAt: serverTimestamp(),
  });
  await recomputeModCount(packId);

  // Log activity
  await logActivity(packId, "mod_added", actor, {
    modId: input.projectId,
    modName: input.name,
    viaDependency: false,
  });

  return id;
}

// Version pin data for a resolved mod (from the version resolver).
export type VersionPinData = {
  versionId: string;
  fileName: string;
  downloadUrl: string;
  sha1: string;
  sha512: string;
  deps: string[]; // projectIds of auto-added required deps
};

// A batch entry for addPackModsResolved: the mod metadata + its resolved version pin.
export type ResolvedModEntry = {
  input: AddPackModInput;
  versionPin: VersionPinData | null; // null = no compatible version (CF-manual, or incompatible)
  viaDependency?: boolean;
};

// Batch-adds mods with resolved version data. Uses idempotent setDoc with
// deterministic doc IDs (projectId), chunked at ≤500 ops per Firestore batch.
// After all batches commit, recomputes modCount from a count query (never
// blind-increment — partial batch failures are safely resumable).
export async function addPackModsResolved(
  packId: string,
  entries: ResolvedModEntry[],
  actor: ActivityActor
): Promise<string[]> {
  const ids: string[] = [];

  // Chunk entries into batches of 500 (Firestore batch limit).
  const BATCH_SIZE = 500;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const entry of chunk) {
      const id = safeModId(entry.input.projectId);
      ids.push(id);
      const ref = doc(modsCol(packId), id);
      const viaDep = entry.viaDependency ?? false;
      batch.set(ref, {
        projectId: entry.input.projectId,
        slug: entry.input.slug ?? "",
        name: entry.input.name,
        summary: entry.input.summary ?? "",
        iconUrl: entry.input.iconUrl ?? null,
        categories: entry.input.categories ?? [],
        clientSide: entry.input.clientSide ?? "unknown",
        serverSide: entry.input.serverSide ?? "unknown",
        curseforgeManual: entry.input.curseforgeManual ?? false,
        addedByUid: actor.uid,
        addedAt: serverTimestamp(),
        viaDependency: viaDep,
        versionId: entry.versionPin?.versionId ?? null,
        fileName: entry.versionPin?.fileName ?? null,
        downloadUrl: entry.versionPin?.downloadUrl ?? null,
        sha1: entry.versionPin?.sha1 ?? null,
        sha512: entry.versionPin?.sha512 ?? null,
        deps: entry.versionPin?.deps ?? [],
        storagePath: null,
        fileSize: null,
        uploadedByUid: null,
        uploadedAt: null,
        createdAt: serverTimestamp(),
      });

      // Log activity in the same batch
      logActivityBatch(batch, packId, "mod_added", actor, {
        modId: entry.input.projectId,
        modName: entry.input.name,
        viaDependency: viaDep,
      });
    }

    await batch.commit();
  }

  // Always recompute from count query — never blind-increment.
  await recomputeModCount(packId);
  return ids;
}

export async function removePackMod(
  packId: string,
  modId: string,
  actor: ActivityActor
): Promise<void> {
  const docRef = doc(modsCol(packId), modId);
  const snap = await getDoc(docRef);
  let modName = modId;
  if (snap.exists()) {
    modName = snap.data().name || modId;
  }
  await deleteDoc(docRef);
  await recomputeModCount(packId);

  // Log activity
  await logActivity(packId, "mod_removed", actor, {
    modId,
    modName,
  });
}

export async function updatePackMod(
  packId: string,
  modId: string,
  data: Partial<PackMod>,
  actor: ActivityActor
): Promise<void> {
  const ref = doc(modsCol(packId), modId);

  // Detect and fetch version update info
  let fromVersion: string | null = null;
  let toVersion: string | null = null;
  let modName = modId;
  const isVersionUpdate = data.versionId !== undefined;

  if (isVersionUpdate) {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      fromVersion = snap.data().fileName || snap.data().versionId || "unpinned";
      modName = snap.data().name || modId;
    }
    toVersion = data.fileName || data.versionId || "pinned";
  }

  await updateDoc(ref, data);

  if (isVersionUpdate) {
    await logActivity(packId, "version_updated", actor, {
      modId,
      modName,
      fromVersion,
      toVersion,
    });
  }
}
