"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import type { Modpack } from "@/lib/modpacks/types";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import {
  inviteUser,
  revokeInvite,
  listPendingInvites,
  type Invite,
} from "@/lib/sharing/invites";
import {
  changeMemberRole,
  removeMember,
  fetchUserProfiles,
  type UserProfile,
} from "@/lib/sharing/membership";
import { Loader2, MailWarning, UserCheck, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { makeActor } from "@/lib/activity/log";

interface SharePanelProps {
  pack: Modpack;
}

export function SharePanel({ pack }: SharePanelProps) {
  const { user } = useAuth();
  const router = useRouter();
  const packId = pack.id;

  const [invites, setInvites] = useState<Invite[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);

  const isOwner = user ? pack.ownerUid === user.uid : false;
  const currentUserId = user?.uid || "";

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [pendingList, userProfiles] = await Promise.all([
        isOwner ? listPendingInvites(packId, user.uid) : Promise.resolve([]),
        fetchUserProfiles(pack.memberUids),
      ]);
      setInvites(pendingList);
      setProfiles(userProfiles);
    } catch (err) {
      console.error("Failed to load share panel data:", err);
    } finally {
      setLoading(false);
    }
  }, [packId, pack.memberUids, isOwner, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async (email: string, role: "editor" | "viewer") => {
    if (!user) return;
    await inviteUser(packId, pack.name, email, role, user.uid);
    await loadData();
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Revoke this invitation?")) return;
    await revokeInvite(inviteId);
    await loadData();
  };

  const handleChangeRole = async (memberUid: string, newRole: "editor" | "viewer") => {
    if (!user) return;
    const profile = profiles[memberUid];
    const memberName = profile?.displayName || profile?.email || memberUid;
    await changeMemberRole(packId, memberUid, newRole, memberName, makeActor(user));
    await loadData();
  };

  const handleRemoveMember = async (memberUid: string, memberEmail: string) => {
    if (!user) return;
    const profile = profiles[memberUid];
    const memberName = profile?.displayName || profile?.email || memberEmail;
    await removeMember(packId, memberUid, memberEmail, memberName, makeActor(user));
    if (memberUid === currentUserId) {
      // If leaving, go back to packs page
      router.push("/packs");
    } else {
      await loadData();
    }
  };

  if (loading && Object.keys(profiles).length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Invite Form (Owner Only) */}
      {isOwner && (
        <div className="space-y-3 rounded-xl border p-4 bg-muted/20">
          <div>
            <h3 className="text-sm font-semibold">Invite Collaborator</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter their email address to invite them to view or edit this modpack.
            </p>
          </div>
          <InviteForm onInviteAction={handleInvite} disabled={loading} />
        </div>
      )}

      {/* Warning if not owner */}
      {!isOwner && (
        <div className="flex gap-2.5 rounded-xl border border-muted-foreground/20 bg-muted/10 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            Only the owner can invite new members or manage roles.
          </span>
        </div>
      )}

      {/* 2. Active Members List */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <UserCheck className="size-4 text-emerald-500" />
          Active Members ({pack.memberUids.length})
        </h4>
        <ul className="space-y-2">
          {pack.memberUids.map((uid) => {
            const role = pack.members[uid] || "viewer";
            const profile = profiles[uid] || {
              uid,
              email: pack.memberEmails.find((e) => e.includes(uid)) || "No email",
              displayName: uid === pack.ownerUid ? "Pack Owner" : "Active Member",
              photoURL: null,
            };

            return (
              <MemberRow
                key={uid}
                memberUid={uid}
                role={role}
                profile={profile}
                isOwner={isOwner}
                currentUserId={currentUserId}
                ownerUid={pack.ownerUid}
                onChangeRoleAction={handleChangeRole}
                onRemoveAction={handleRemoveMember}
              />
            );
          })}
        </ul>
      </div>

      {/* 3. Pending Invites List (Owner Only) */}
      {isOwner && invites.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <MailWarning className="size-4 text-amber-500" />
            Pending Invitations ({invites.length})
          </h4>
          <ul className="divide-y rounded-xl border">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between p-3 text-sm bg-card first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="min-w-0">
                  <p className="font-mono font-medium truncate text-xs">{invite.email}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    Role: {invite.role}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeInvite(invite.id)}
                  disabled={loading}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2 cursor-pointer text-xs"
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
