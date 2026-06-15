import { collection, doc, serverTimestamp, setDoc, type WriteBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { ActivityType, ActivityActor, ActivityPayload } from "./types";

/**
 * Converts a Firebase user object (or simple fields) to a denormalized ActivityActor.
 */
export function makeActor(user: {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}): ActivityActor {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email || "Anonymous",
    photoURL: user.photoURL || null,
  };
}

/**
 * Writes an activity log entry atomically using a Firestore WriteBatch.
 */
export function logActivityBatch(
  batch: WriteBatch,
  packId: string,
  type: ActivityType,
  actor: ActivityActor,
  payload: ActivityPayload
) {
  const ref = doc(collection(db, "modpacks", packId, "activity"));
  batch.set(ref, {
    type,
    actor,
    payload,
    createdAt: serverTimestamp(),
  });
}

/**
 * Writes a standalone activity log entry.
 */
export async function logActivity(
  packId: string,
  type: ActivityType,
  actor: ActivityActor,
  payload: ActivityPayload
): Promise<string> {
  const ref = doc(collection(db, "modpacks", packId, "activity"));
  await setDoc(ref, {
    type,
    actor,
    payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
