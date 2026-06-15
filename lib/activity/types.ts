export type ActivityType =
  | "mod_added"
  | "mod_removed"
  | "version_updated"
  | "snapshot_restored"
  | "member_joined"
  | "role_changed"
  | "member_left"
  | "comment";

export interface ActivityActor {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export interface ActivityPayload {
  modId?: string;
  modName?: string;
  fromVersion?: string | null;
  toVersion?: string | null;
  text?: string;
  snapshotId?: string;
  snapshotName?: string;
  memberEmail?: string;
  role?: string;
  viaDependency?: boolean;
}

export interface ActivityEntry {
  id: string;
  packId: string;
  type: ActivityType;
  actor: ActivityActor;
  payload: ActivityPayload;
  createdAt: any; // Firestore serverTimestamp on write, Date/Timestamp on read
}
