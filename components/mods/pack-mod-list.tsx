"use client";

import Link from "next/link";
import { Trash2, FileDown } from "lucide-react";
import type { PackMod } from "@/lib/modpacks/mod-types";
import { Button } from "@/components/ui/button";
import { SideBadges } from "./side-badge";
import { UpdateBadge } from "./update-badge";
import type { SideSupport } from "@/lib/api/types";
import type { UpdateCheckResult } from "@/lib/resolve/types";
import { useState } from "react";
import { ManualBadge } from "./manual-badge";
import { ManualModWizard } from "./manual-mod-wizard";
import { cn } from "@/lib/utils";

import { useDeleteManualJar } from "@/lib/modpacks/mod-queries";

// The mods currently in a pack. Shows version pin (P4), update badge, side badges.
// Editors get a remove button; the row links to the mod detail page.
export function PackModList({
  mods,
  canEdit,
  onRemoveAction,
  removingId,
  updateResults,
  packId,
  isOwner,
  profiles,
}: {
  mods: PackMod[];
  canEdit: boolean;
  onRemoveAction?: (modId: string) => void;
  removingId?: string | null;
  updateResults?: Map<string, UpdateCheckResult>;
  packId: string;
  isOwner: boolean;
  profiles?: Record<string, { displayName: string | null; email: string | null }>;
}) {
  const [activeWizardMod, setActiveWizardMod] = useState<PackMod | null>(null);
  const [openDropdownModId, setOpenDropdownModId] = useState<string | null>(null);
  const { mutate: deleteJar } = useDeleteManualJar(packId);

  if (mods.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground bg-muted/5">
        No mods in this pack yet. Click &quot;Add Mod&quot; above to find and add mods!
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {mods.map((mod) => {
        const updateResult = updateResults?.get(mod.projectId);
        const isDropdownOpen = openDropdownModId === mod.id;
        return (
          <li
            key={mod.id}
            className={cn(
              "relative flex items-center gap-3 p-3",
              isDropdownOpen ? "z-20" : "z-0"
            )}
          >
            <Link
              href={`/mods/${encodeURIComponent(mod.projectId)}`}
              className="absolute inset-0 z-0"
              aria-label={`View details for ${mod.name}`}
            />

            <div className="relative z-10 pointer-events-none flex items-center gap-3 w-full min-w-0">
              {mod.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mod.iconUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-md object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="size-10 shrink-0 rounded-md bg-secondary" />
              )}
              
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{mod.name}</p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <SideBadges
                    clientSide={mod.clientSide as SideSupport}
                    serverSide={mod.serverSide as SideSupport}
                  />
                  {mod.categories && mod.categories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary capitalize whitespace-nowrap"
                    >
                      {cat}
                    </span>
                  ))}
                  {mod.fileName && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground max-w-[180px] sm:max-w-xs md:max-w-md"
                      title={mod.fileName}
                    >
                      <FileDown className="size-3 shrink-0" />
                      <span className="truncate">{mod.fileName}</span>
                    </span>
                  )}
                  {mod.curseforgeManual && (
                    <div className="pointer-events-auto">
                      <ManualBadge
                        uploaded={!!mod.storagePath}
                        fileName={mod.fileName}
                        sha1={mod.sha1}
                        uploadedByUid={mod.uploadedByUid}
                        canEdit={canEdit}
                        onUploadClick={() => setActiveWizardMod(mod)}
                        onRemoveClick={() => {
                          if (confirm(`Remove the uploaded jar file for ${mod.name}?`)) {
                            if (mod.storagePath) {
                              deleteJar({ modId: mod.id, storagePath: mod.storagePath });
                            }
                          }
                        }}
                        downloadUrl={mod.downloadUrl}
                        modName={mod.name}
                        isOpen={isDropdownOpen}
                        setIsOpen={(open) => setOpenDropdownModId(open ? mod.id : null)}
                      />
                    </div>
                  )}
                  {updateResult?.hasUpdate && <UpdateBadge />}
                  {(() => {
                    const profile = profiles?.[mod.addedByUid];
                    const name = profile?.displayName || profile?.email || "Creator";
                    return (
                      <span
                        className="inline-flex items-center text-[10px] text-muted-foreground/80 bg-muted/30 px-1.5 py-0.5 rounded border border-muted/20 max-w-[150px]"
                        title={`Added by ${name}${mod.viaDependency ? " (dependency)" : ""}`}
                      >
                        <span className="truncate">Added by {name}</span>
                        {mod.viaDependency && <span className="shrink-0 ml-1">(dep)</span>}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {canEdit && onRemoveAction && (
                <div className="pointer-events-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={removingId === mod.id}
                    onClick={() => onRemoveAction(mod.id)}
                    aria-label={`Remove ${mod.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
      {activeWizardMod && (
        <ManualModWizard
          packId={packId}
          mod={activeWizardMod}
          onCloseAction={() => setActiveWizardMod(null)}
        />
      )}
    </ul>
  );
}
