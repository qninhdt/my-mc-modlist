import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  modpackSchema,
  type CreatePackInput,
  type Modpack,
  type UpdatePackInput,
} from "./types";

const PACKS = "modpacks";

function packRef(packId: string) {
  return doc(db, PACKS, packId);
}

// Creates a pack owned by the caller. ownerUid + members + memberEmails are set
// here atomically and are the ONLY write that seeds the ACL — updatePack never
// touches them, keeping the members map and memberEmails array in sync.
export async function createPack(
  input: CreatePackInput,
  owner: { uid: string; email: string }
): Promise<string> {
  const ref = doc(collection(db, PACKS));
  const emailLower = owner.email.toLowerCase();
  await setDoc(ref, {
    ownerUid: owner.uid,
    name: input.name,
    description: input.description ?? "",
    mcVersion: input.mcVersion,
    loader: input.loader,
    members: { [owner.uid]: "editor" },
    memberUids: [owner.uid],
    memberEmails: [emailLower],
    modCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPack(packId: string): Promise<Modpack | null> {
  const snap = await getDoc(packRef(packId));
  if (!snap.exists()) return null;
  return modpackSchema.parse({ id: snap.id, ...snap.data() });
}

// Lists every pack the user can see (owned or shared) in one query. The read is
// authorized by a membership rule keyed on memberUids, so the query MUST filter
// the same field (array-contains uid) — Firestore rejects a list query whose
// filter field differs from the field the read rule authorizes on.
export async function listPacks(uid: string): Promise<Modpack[]> {
  const q = query(
    collection(db, PACKS),
    where("memberUids", "array-contains", uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => modpackSchema.parse({ id: d.id, ...d.data() }));
}

// Updates pack metadata only. Deliberately cannot touch ownerUid/members/
// memberEmails/modCount — ACL changes go through the sharing path (P7), modCount
// is recomputed from a count query after batched mod writes (P4).
export async function updatePack(
  packId: string,
  input: UpdatePackInput
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.mcVersion !== undefined) patch.mcVersion = input.mcVersion;
  if (input.loader !== undefined) patch.loader = input.loader;
  await updateDoc(packRef(packId), patch);
}

export async function deletePack(packId: string): Promise<void> {
  await deleteDoc(packRef(packId));
}

// Recomputes modCount from an aggregation query (source of truth) rather than
// incrementing — multi-batch dep writes (P4) can partially fail and drift a
// counter. Cheap server-side count, called after any mod add/remove.
export async function recomputeModCount(packId: string): Promise<number> {
  const modsCol = collection(db, PACKS, packId, "mods");
  const agg = await getCountFromServer(modsCol);
  const count = agg.data().count;
  await updateDoc(packRef(packId), { modCount: count, updatedAt: serverTimestamp() });
  return count;
}
