"use client";

import Link from "next/link";
import { Pencil, Trash2, Users, Layers, Cpu } from "lucide-react";
import type { Modpack } from "@/lib/modpacks/types";
import { LOADER_LABELS } from "@/lib/minecraft/loaders";
import { Button } from "@/components/ui/button";

type Props = {
  pack: Modpack;
  canEdit: boolean;
  onDeleteAction?: () => void;
  deleting?: boolean;
};

export function PackHeader({ pack, canEdit, onDeleteAction, deleting }: Props) {
  return (
    <div className="bg-gradient-to-br from-card/80 to-card/40 border border-border/50 p-4 sm:p-6 rounded-2xl shadow-sm flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{pack.name}</h1>
        {pack.description ? (
          <p className="max-w-prose text-sm text-muted-foreground leading-relaxed">
            {pack.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">No description provided for this pack.</p>
        )}
        <div className="flex flex-wrap gap-2.5 pt-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/10">
            <Layers className="size-3" />
            MC {pack.mcVersion}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 px-3 py-1 text-xs font-semibold border border-purple-200/30 dark:border-purple-800/30">
            <Cpu className="size-3" />
            {LOADER_LABELS[pack.loader]}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border border-border/40">
            {pack.modCount} {pack.modCount === 1 ? "mod" : "mods"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 shrink-0 sm:self-center">
        <Button asChild variant="outline" size="sm" className="cursor-pointer font-medium shadow-sm">
          <Link href={`/packs/${pack.id}/share`}>
            <Users className="size-4 mr-1.5" />
            Share
          </Link>
        </Button>

        {canEdit && (
          <>
            <Button asChild variant="outline" size="sm" className="cursor-pointer font-medium shadow-sm">
              <Link href={`/packs/${pack.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Edit Settings
              </Link>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDeleteAction}
              disabled={deleting}
              className="cursor-pointer font-medium shadow-sm"
            >
              <Trash2 className="size-4 mr-1.5" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
