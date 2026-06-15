import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface Invite {
  id: string;
  packId: string;
  packName: string;
  email: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted";
  invitedBy: string;
  createdAt?: any;
}

const INVITES = "invites";

function invitesCol() {
  return collection(db, INVITES);
}

/**
 * Creates a pending invite for a user by email.
 */
export async function inviteUser(
  packId: string,
  packName: string,
  email: string,
  role: "editor" | "viewer",
  invitedByUid: string
): Promise<string> {
  const ref = doc(invitesCol());
  const inviteData = {
    packId,
    packName,
    email: email.toLowerCase().trim(),
    role,
    status: "pending" as const,
    invitedBy: invitedByUid,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, inviteData);
  return ref.id;
}

/**
 * Revokes (deletes) a pending invite.
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  await deleteDoc(doc(db, INVITES, inviteId));
}

/**
 * Lists all pending invites for a specific pack invited by a specific user.
 */
export async function listPendingInvites(
  packId: string,
  invitedByUid: string
): Promise<Invite[]> {
  const q = query(
    invitesCol(),
    where("packId", "==", packId),
    where("status", "==", "pending"),
    where("invitedBy", "==", invitedByUid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Invite[];
}

/**
 * Lists all pending invites for a user's email address.
 */
export async function listInvitesForEmail(email: string): Promise<Invite[]> {
  const q = query(
    invitesCol(),
    where("email", "==", email.toLowerCase().trim()),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Invite[];
}
