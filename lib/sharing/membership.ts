import {
  doc,
  updateDoc,
  arrayRemove,
  deleteField,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { logActivity } from "@/lib/activity/log";
import type { ActivityActor } from "@/lib/activity/types";

/**
 * Changes a member's role (editor vs viewer) in the pack.
 * Only the pack owner is permitted to perform this.
 */
export async function changeMemberRole(
  packId: string,
  memberUid: string,
  newRole: "editor" | "viewer",
  memberName: string,
  actor: ActivityActor
): Promise<void> {
  const ref = doc(db, "modpacks", packId);
  await updateDoc(ref, {
    [`members.${memberUid}`]: newRole,
  });

  await logActivity(packId, "role_changed", actor, {
    role: newRole,
    text: memberName,
  });
}

/**
 * Removes a member from the pack's ACL collections (members, memberUids, memberEmails).
 * Can be called by the owner to evict someone, or by the member themselves to leave the pack.
 */
export async function removeMember(
  packId: string,
  memberUid: string,
  memberEmail: string,
  memberName: string,
  actor: ActivityActor
): Promise<void> {
  const ref = doc(db, "modpacks", packId);
  const emailLower = memberEmail.toLowerCase().trim();
  await updateDoc(ref, {
    [`members.${memberUid}`]: deleteField(),
    memberUids: arrayRemove(memberUid),
    memberEmails: arrayRemove(emailLower),
  });

  await logActivity(packId, "member_left", actor, {
    memberEmail: emailLower,
    text: memberName,
  });
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * Fetches user profile documents for a list of UIDs.
 */
export async function fetchUserProfiles(
  uids: string[]
): Promise<Record<string, UserProfile>> {
  if (uids.length === 0) return {};
  
  const q = query(collection(db, "users"), where("uid", "in", uids));
  const snap = await getDocs(q);
  
  const profiles: Record<string, UserProfile> = {};
  snap.docs.forEach((doc) => {
    profiles[doc.id] = doc.data() as UserProfile;
  });
  
  return profiles;
}
