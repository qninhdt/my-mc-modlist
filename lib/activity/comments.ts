import { doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { logActivity } from "./log";
import type { ActivityActor } from "./types";

/**
 * Posts a free-form comment in the pack's activity feed.
 */
export async function postComment(
  packId: string,
  text: string,
  actor: ActivityActor
): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("Comment cannot be empty");
  }
  if (cleanText.length > 2000) {
    throw new Error("Comment cannot exceed 2000 characters");
  }

  return logActivity(packId, "comment", actor, { text: cleanText });
}

/**
 * Deletes (moderates/removes) a comment.
 * Authorized by Firestore rules: either the comment author or the pack owner.
 */
export async function deleteComment(
  packId: string,
  entryId: string
): Promise<void> {
  const ref = doc(db, "modpacks", packId, "activity", entryId);
  await deleteDoc(ref);
}
