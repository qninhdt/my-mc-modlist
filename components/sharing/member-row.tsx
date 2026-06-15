"use client";

import { useState } from "react";
import { User, Trash2, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/lib/sharing/membership";

interface MemberRowProps {
  memberUid: string;
  role: "editor" | "viewer";
  profile?: UserProfile;
  isOwner: boolean; // Is the current user the pack owner?
  currentUserId: string;
  ownerUid: string; // The owner of this pack
  onChangeRoleAction: (uid: string, newRole: "editor" | "viewer") => Promise<void>;
  onRemoveAction: (uid: string, email: string) => Promise<void>;
}

export function MemberRow({
  memberUid,
  role,
  profile,
  isOwner,
  currentUserId,
  ownerUid,
  onChangeRoleAction,
  onRemoveAction,
}: MemberRowProps) {
  const [loading, setLoading] = useState(false);

  const isRowOwner = memberUid === ownerUid;
  const isSelf = memberUid === currentUserId;

  const displayName = profile?.displayName || "Active User";
  const email = profile?.email || "No email";

  const handleRoleChange = async (newRole: "editor" | "viewer") => {
    setLoading(true);
    try {
      await onChangeRoleAction(memberUid, newRole);
    } catch (err) {
      console.error("Failed to change member role:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    const verb = isSelf ? "Leave" : "Remove";
    const msg = isSelf
      ? "Are you sure you want to leave this pack?"
      : `Are you sure you want to remove ${displayName} (${email}) from this pack?`;

    if (!confirm(msg)) return;

    setLoading(true);
    try {
      await onRemoveAction(memberUid, email);
    } catch (err) {
      console.error(`Failed to ${verb.toLowerCase()} member:`, err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="flex items-center justify-between p-3 border rounded-xl bg-card">
      <div className="flex items-center gap-3 min-w-0">
        {profile?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoURL}
            alt=""
            className="size-8 rounded-full object-cover shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <User className="size-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-medium text-sm truncate flex items-center gap-1.5">
            {displayName} {isSelf && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">You</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground mr-1" />}

        {/* Role setting / display */}
        {isRowOwner ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Owner
          </span>
        ) : isOwner ? (
          // Owner can change roles of other members
          <select
            value={role}
            onChange={(e) => handleRoleChange(e.target.value as "editor" | "viewer")}
            disabled={loading}
            className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        ) : (
          // Viewers/editors see read-only badges
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground capitalize">
            {role}
          </span>
        )}

        {/* Remove/Leave buttons */}
        {!isRowOwner && (
          <>
            {isOwner && (
              // Owner can evict members
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                disabled={loading}
                aria-label={`Remove ${displayName}`}
                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              >
                <Trash2 className="size-4" />
              </Button>
            )}

            {!isOwner && isSelf && (
              // Non-owners can leave the pack themselves
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={loading}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              >
                <LogOut className="mr-1 size-3.5" />
                Leave
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
