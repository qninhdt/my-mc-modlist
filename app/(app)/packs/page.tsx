"use client";

import Link from "next/link";
import { Plus, Mail, Check, X, Loader2 } from "lucide-react";
import { useModpacks, usePendingInvites } from "@/lib/modpacks/queries";
import { PackCard } from "@/components/modpacks/pack-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { revokeInvite as declineInvite } from "@/lib/sharing/invites";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import { useState } from "react";

export default function PacksPage() {
  const { user } = useAuth();
  const { data: packs, isLoading: packsLoading, error: packsError } = useModpacks();
  const { data: invites, isLoading: invitesLoading } = usePendingInvites();
  const queryClient = useQueryClient();
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);

  const handleAccept = async (inviteId: string) => {
    try {
      setProcessingInviteId(inviteId);
      await authedFetchJson("/api/invites/accept", {
        method: "POST",
        body: JSON.stringify({ inviteId }),
      });
      // Invalidate queries so packs list and invites list update
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["packs", user?.uid] }),
        queryClient.invalidateQueries({ queryKey: ["pending-invites", user?.email] }),
      ]);
    } catch (err) {
      console.error("Failed to accept invitation:", err);
      alert(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    if (!confirm("Are you sure you want to decline this invitation?")) return;
    try {
      setProcessingInviteId(inviteId);
      await declineInvite(inviteId);
      await queryClient.invalidateQueries({ queryKey: ["pending-invites", user?.email] });
    } catch (err) {
      console.error("Failed to decline invitation:", err);
      alert(err instanceof Error ? err.message : "Failed to decline invitation");
    } finally {
      setProcessingInviteId(null);
    }
  };

  const ownedPacks = packs ? packs.filter((p) => p.ownerUid === user?.uid) : [];
  const sharedPacks = packs ? packs.filter((p) => p.ownerUid !== user?.uid) : [];

  const isLoading = packsLoading || invitesLoading;

  return (
    <div className="space-y-8">
      {/* Invitations Section */}
      {invites && invites.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="size-5 text-amber-500 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm md:text-base text-amber-600 dark:text-amber-400">
                Pending Modpack Invitations
              </h2>
              <p className="text-xs text-muted-foreground">
                You have been invited to collaborate on the following modpacks.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col justify-between p-4 rounded-lg border bg-card/50 backdrop-blur-sm space-y-3"
              >
                <div>
                  <h3 className="font-medium text-sm truncate">{invite.packName || "Unnamed Modpack"}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    Role: {invite.role}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="w-full text-xs h-8 cursor-pointer"
                    disabled={processingInviteId !== null}
                    onClick={() => handleAccept(invite.id)}
                  >
                    {processingInviteId === invite.id ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : (
                      <Check className="size-3 mr-1" />
                    )}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive h-8 border-destructive/20 cursor-pointer"
                    disabled={processingInviteId !== null}
                    onClick={() => handleDecline(invite.id)}
                  >
                    {processingInviteId === invite.id ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : (
                      <X className="size-3 mr-1" />
                    )}
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end">
        <Button asChild className="cursor-pointer">
          <Link href="/packs/new">
            <Plus className="size-4 mr-1.5" />
            New pack
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Loading your packs…
        </div>
      )}

      {packsError && (
        <p className="text-sm text-destructive">
          Failed to load packs: {packsError.message}
        </p>
      )}

      {!isLoading && packs && packs.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center bg-muted/10">
          <p className="text-muted-foreground text-sm">
            No packs yet. Create your first modpack to get started.
          </p>
          <Button asChild className="mt-4 cursor-pointer" variant="outline">
            <Link href="/packs/new">
              <Plus className="size-4 mr-1.5" />
              Create Modpack
            </Link>
          </Button>
        </div>
      )}

      {packs && packs.length > 0 && (
        <div className="space-y-8">
          {/* My Modpacks Section */}
          {ownedPacks.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight border-b pb-1.5 flex items-center justify-between">
                <span>My Modpacks</span>
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {ownedPacks.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ownedPacks.map((pack) => (
                  <PackCard key={pack.id} pack={pack} />
                ))}
              </div>
            </div>
          )}

          {/* Shared Modpacks Section */}
          {sharedPacks.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight border-b pb-1.5 flex items-center justify-between">
                <span>Shared Modpacks</span>
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {sharedPacks.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sharedPacks.map((pack) => (
                  <PackCard key={pack.id} pack={pack} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
