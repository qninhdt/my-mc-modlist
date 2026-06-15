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
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { listPackMods } from "./mod-repository";
import { recomputeModCount } from "./repository";
import type { PackMod } from "./mod-types";
import type { ActivityActor } from "@/lib/activity/types";
import { logActivity } from "@/lib/activity/log";

// Snapshots: immutable copies of a pack's current mod set, stored as a subcollection
// (not an inline array — a 100+ mod pack would blow the 1 MiB doc limit).
//
// Structure: modpacks/{packId}/snapshots/{snapId}
//   metadata: { label, createdAt, modCount, createdByUid }
//   mods: modpacks/{packId}/snapshots/{snapId}/mods/{modId}
//
// Restore is NON-DESTRUCTIVE: auto-snapshots current state first ("restore point"),
// then applies as idempotent upserts keyed by mod doc ID + a tombstone pass for
// removals — chunked at 500 ops. A mid-restore failure never leaves an empty pack.

export type SnapshotMeta = {
  id: string;
  label: string;
  modCount: number;
  createdByUid: string;
  createdAt: unknown;
};

function snapshotsCol(packId: string) {
  return collection(db, "modpacks", packId, "snapshots");
}

function snapModsCol(packId: string, snapId: string) {
  return collection(db, "modpacks", packId, "snapshots", snapId, "mods");
}

function packModsCol(packId: string) {
  return collection(db, "modpacks", packId, "mods");
}

// Creates an immutable snapshot of the current mod set.
export async function createSnapshot(
  packId: string,
  label: string,
  createdByUid: string
): Promise<string> {
  const mods = await listPackMods(packId);

  // Create snapshot metadata doc.
  const snapRef = doc(snapshotsCol(packId));
  await setDoc(snapRef, {
    label,
    modCount: mods.length,
    createdByUid,
    createdAt: serverTimestamp(),
  });

  // Write mods as subcollection, chunked at 500.
  const BATCH_SIZE = 500;
  for (let i = 0; i < mods.length; i += BATCH_SIZE) {
    const chunk = mods.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const mod of chunk) {
      const modRef = doc(snapModsCol(packId, snapRef.id), mod.id);
      // Strip the `id` field (it's the doc ID) and write the rest.
      const { id: _id, ...data } = mod;
      batch.set(modRef, data);
    }
    await batch.commit();
  }

  return snapRef.id;
}

// Lists all snapshots for a pack, newest first.
export async function listSnapshots(packId: string): Promise<SnapshotMeta[]> {
  const q = query(snapshotsCol(packId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as SnapshotMeta[];
}

// Reads the mod set from a snapshot.
async function readSnapshotMods(packId: string, snapId: string): Promise<PackMod[]> {
  const snap = await getDocs(snapModsCol(packId, snapId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PackMod[];
}

// Restores a snapshot: auto-snapshot first (restore point), then upsert + tombstone.
// - Upsert: write all snapshot mods with deterministic doc IDs (idempotent).
// - Tombstone: delete any current mods NOT in the snapshot.
// - Chunked at 500 ops. Mid-failure is safe: auto-snapshot preserves the pre-restore
//   state, and idempotent upserts make partial restores resumable.
export async function restoreSnapshot(
  packId: string,
  snapId: string,
  actor: ActivityActor
): Promise<{ restorePointId: string }> {
  // Fetch snapshot metadata to get label
  const snapRef = doc(snapshotsCol(packId), snapId);
  const snapDoc = await getDoc(snapRef);
  const snapshotName = snapDoc.exists() ? snapDoc.data().label : snapId;

  // 1. Auto-snapshot current state (restore point).
  const now = new Date();
  const restorePointId = await createSnapshot(
    packId,
    `Restore point (before restoring snapshot) — ${now.toISOString()}`,
    actor.uid
  );

  // 2. Read the target snapshot's mod set.
  const snapMods = await readSnapshotMods(packId, snapId);
  const snapModIds = new Set(snapMods.map((m) => m.id));

  // 3. Read current pack mods.
  const currentMods = await listPackMods(packId);

  // 4. Upsert snapshot mods + delete removed mods, chunked at 500.
  const BATCH_SIZE = 500;

  // Collect all ops: upserts + tombstones.
  type Op =
    | { type: "set"; id: string; data: Record<string, unknown> }
    | { type: "delete"; id: string };

  const ops: Op[] = [];

  // Upsert all mods from the snapshot.
  for (const mod of snapMods) {
    const { id: modId, ...data } = mod;
    ops.push({ type: "set", id: modId, data: data as Record<string, unknown> });
  }

  // Tombstone: delete current mods that aren't in the snapshot.
  for (const mod of currentMods) {
    if (!snapModIds.has(mod.id)) {
      ops.push({ type: "delete", id: mod.id });
    }
  }

  // Execute ops in batches.
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(packModsCol(packId), op.id);
      if (op.type === "set") {
        batch.set(ref, op.data);
      } else {
        batch.delete(ref);
      }
    }
    await batch.commit();
  }

  // 5. Recompute modCount from count query.
  await recomputeModCount(packId);

  // Log activity
  await logActivity(packId, "snapshot_restored", actor, {
    snapshotId: snapId,
    snapshotName,
  });

  return { restorePointId };
}

// Deletes a snapshot and its mods subcollection.
export async function deleteSnapshot(packId: string, snapId: string): Promise<void> {
  // Delete mods subcollection first.
  const mods = await getDocs(snapModsCol(packId, snapId));
  const BATCH_SIZE = 500;
  for (let i = 0; i < mods.docs.length; i += BATCH_SIZE) {
    const chunk = mods.docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }

  // Delete the snapshot metadata doc.
  await deleteDoc(doc(snapshotsCol(packId), snapId));
}
