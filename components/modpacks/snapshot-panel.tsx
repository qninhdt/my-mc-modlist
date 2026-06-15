"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  RotateCcw,
  Trash2,
  Loader2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  type SnapshotMeta,
} from "@/lib/modpacks/snapshots";
import { makeActor } from "@/lib/activity/log";

const snapshotsKey = (packId: string) => ["snapshots", packId] as const;
const packModsKey = (packId: string) => ["pack-mods", packId] as const;
const packKey = (packId: string) => ["pack", packId] as const;

export function SnapshotPanel({ packId }: { packId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");

  const { data: snapshots, isLoading } = useQuery({
    queryKey: snapshotsKey(packId),
    queryFn: () => listSnapshots(packId),
    enabled: !!packId,
  });

  const { mutate: doCreate, isPending: creating } = useMutation({
    mutationFn: () => {
      if (!user?.uid) throw new Error("Not authenticated");
      const name = label.trim() || `Snapshot ${new Date().toLocaleString()}`;
      return createSnapshot(packId, name, user.uid);
    },
    onSuccess: () => {
      setLabel("");
      qc.invalidateQueries({ queryKey: snapshotsKey(packId) });
    },
  });

  const { mutate: doRestore, isPending: restoring, variables: restoringId } = useMutation({
    mutationFn: (snapId: string) => {
      if (!user) throw new Error("Not authenticated");
      return restoreSnapshot(packId, snapId, makeActor(user));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: snapshotsKey(packId) });
      qc.invalidateQueries({ queryKey: packModsKey(packId) });
      qc.invalidateQueries({ queryKey: packKey(packId) });
    },
  });

  const { mutate: doDelete, isPending: deleting, variables: deletingId } = useMutation({
    mutationFn: (snapId: string) => deleteSnapshot(packId, snapId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: snapshotsKey(packId) });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header section inside the panel */}
      <div className="flex flex-col gap-1.5 border-b pb-4">
        <h3 className="text-lg font-display font-medium flex items-center gap-2">
          <History className="size-5 text-muted-foreground" />
          Snapshot History
        </h3>
        <p className="text-sm text-muted-foreground">
          Take snapshots of your modpack to save checkpoints. You can restore back to any checkpoint at any time.
        </p>
      </div>

      {/* Save snapshot input and list */}
      <div className="space-y-4 pt-1">
        {/* Create snapshot */}
        <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name your snapshot (e.g. Before updating)..."
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            onClick={() => doCreate()}
            disabled={creating}
            className="cursor-pointer shrink-0 w-full sm:w-auto"
          >
            {creating ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Camera className="mr-1.5 size-4" />
            )}
            Save Snapshot
          </Button>
        </div>

        {/* Snapshot list */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="size-4 animate-spin" />
            Loading snapshots…
          </div>
        )}

        {!isLoading && snapshots && snapshots.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground max-w-xl">
            No snapshots taken yet. Save a snapshot above to preserve your current mod set.
          </div>
        )}

        {!isLoading && snapshots && snapshots.length > 0 && (
          <div className="max-w-xl space-y-2">
            <ul className="space-y-2">
              {snapshots.map((snap) => (
                <SnapshotRow
                  key={snap.id}
                  snap={snap}
                  onRestore={() => {
                    if (
                      confirm(
                        `Restore "${snap.label}"? Your current mod set will be auto-saved as a restore point first.`
                      )
                    ) {
                      doRestore(snap.id);
                    }
                  }}
                  onDelete={() => {
                    if (confirm(`Delete snapshot "${snap.label}"?`)) {
                      doDelete(snap.id);
                    }
                  }}
                  restoring={restoring && restoringId === snap.id}
                  deleting={deleting && deletingId === snap.id}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotRow({
  snap,
  onRestore,
  onDelete,
  restoring,
  deleting,
}: {
  snap: SnapshotMeta;
  onRestore: () => void;
  onDelete: () => void;
  restoring: boolean;
  deleting: boolean;
}) {
  // Format the Firestore timestamp for display.
  let dateStr = "";
  if (snap.createdAt && typeof snap.createdAt === "object" && "toDate" in snap.createdAt) {
    dateStr = (snap.createdAt as { toDate: () => Date }).toDate().toLocaleString();
  }

  return (
    <li className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{snap.label}</p>
        <p className="text-xs text-muted-foreground">
          {snap.modCount} mod{snap.modCount !== 1 ? "s" : ""}
          {dateStr ? ` · ${dateStr}` : ""}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onRestore}
        disabled={restoring || deleting}
        aria-label={`Restore ${snap.label}`}
        className="cursor-pointer"
      >
        {restoring ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RotateCcw className="size-4 text-primary" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onDelete}
        disabled={restoring || deleting}
        aria-label={`Delete ${snap.label}`}
        className="cursor-pointer hover:text-destructive"
      >
        {deleting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </Button>
    </li>
  );
}
