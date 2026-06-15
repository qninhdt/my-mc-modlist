"use client";

import { X, AlertTriangle, Check, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResolvedVersion, DependencyResolutionResult } from "@/lib/resolve/types";

// Shows the result of version + dependency resolution before committing a mod add.
// Lists auto-added required deps, any warnings (unresolved deps), and conflicts
// (incompatible mods). The user confirms before the batch write happens.
export function DependencyDialog({
  modName,
  resolved,
  deps,
  depProjectInfos,
  onConfirmAction,
  onCancelAction,
  confirming,
}: {
  modName: string;
  resolved: ResolvedVersion;
  deps: DependencyResolutionResult;
  depProjectInfos: Record<string, { name: string; slug: string; iconUrl: string | null }>;
  onConfirmAction: () => void;
  onCancelAction: () => void;
  confirming: boolean;
}) {
  const hasContent =
    deps.added.length > 0 || deps.warnings.length > 0 || deps.conflicts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onCancelAction}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-4 space-y-1">
          <h3 className="text-lg font-semibold">Add {modName}</h3>
          <p className="text-sm text-muted-foreground">
            Resolved version:{" "}
            <span className="font-mono text-xs">{resolved.file.filename}</span>
          </p>
        </div>

        {/* Auto-added dependencies */}
        {deps.added.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Package className="size-4 text-emerald-500" />
              Required dependencies ({deps.added.length})
            </h4>
            <p className="mb-2 text-xs text-muted-foreground">
              These mods will be auto-added to your pack:
            </p>
            <ul className="space-y-1.5">
              {deps.added.map((dep) => {
                const info = depProjectInfos[dep.projectId];
                return (
                  <li
                    key={dep.projectId}
                    className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm"
                  >
                    {info?.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={info.iconUrl}
                        alt=""
                        className="size-6 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="size-6 rounded bg-secondary" />
                    )}
                    <span className="flex-1 truncate font-medium">
                      {info?.name ?? dep.projectId}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {dep.file.filename}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {deps.warnings.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-500">
              <AlertTriangle className="size-4" />
              Warnings ({deps.warnings.length})
            </h4>
            <ul className="space-y-1">
              {deps.warnings.map((w) => (
                <li
                  key={w.projectId}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  {w.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Conflicts */}
        {deps.conflicts.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" />
              Incompatible ({deps.conflicts.length})
            </h4>
            <ul className="space-y-1">
              {deps.conflicts.map((c) => (
                <li
                  key={`${c.sourceProjectId}-${c.targetProjectId}`}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                >
                  {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No extra deps */}
        {!hasContent && (
          <p className="mb-4 text-sm text-muted-foreground">
            No additional dependencies needed.
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancelAction} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={onConfirmAction} disabled={confirming}>
            {confirming ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Check className="mr-1.5 size-4" />
                {deps.added.length > 0
                  ? `Add ${1 + deps.added.length} mods`
                  : "Add mod"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
