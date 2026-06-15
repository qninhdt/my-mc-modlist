"use client";

import { X, Loader2, CheckCircle2, AlertOctagon, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExportProgress } from "@/lib/zip/types";

interface ExportProgressDialogProps {
  progress: ExportProgress;
  onCloseAction: () => void;
  targetName: string;
}

export function ExportProgressDialog({
  progress,
  onCloseAction,
  targetName,
}: ExportProgressDialogProps) {
  const { status, current, total, currentName, failedMods, error } = progress;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isLargePack = total > 100;

  const showClose = status === "success" || status === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border bg-card p-6 shadow-xl">
        {showClose && (
          <button
            onClick={onCloseAction}
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        )}

        {/* Title */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {status === "fetching" && <Loader2 className="size-5 animate-spin text-primary" />}
            {status === "zipping" && <Loader2 className="size-5 animate-spin text-primary" />}
            {status === "success" && <CheckCircle2 className="size-5 text-emerald-500" />}
            {status === "error" && <AlertOctagon className="size-5 text-destructive" />}
            {status === "idle" && <Download className="size-5 text-muted-foreground" />}
            Exporting {targetName}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Target format: {targetName}
          </p>
        </div>

        {/* Large Pack Warning */}
        {isLargePack && status !== "success" && status !== "error" && (
          <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            <div>
              <span className="font-semibold">Large pack warning:</span> This modpack contains {total} mods. Building the zip in-browser may take some time and use significant memory.
            </div>
          </div>
        )}

        {/* Progress Display */}
        <div className="space-y-4">
          {(status === "fetching" || status === "zipping") && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="truncate max-w-[80%]">
                  {status === "fetching" ? `Downloading: ${currentName || "Waiting..."}` : "Compiling zip file..."}
                </span>
                <span>
                  {current} / {total} ({percentage}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Success details */}
          {status === "success" && (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 space-y-2 border border-emerald-100 dark:border-emerald-900/30">
              <p className="font-medium">Export Complete!</p>
              <p className="text-xs">
                Your download should start automatically. {failedMods.length > 0 && `Loaded ${total - failedMods.length} of ${total} mods successfully.`}
              </p>
            </div>
          )}

          {/* Error details */}
          {status === "error" && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-300 space-y-1 border border-red-100 dark:border-red-900/30">
              <p className="font-semibold">Export Failed</p>
              <p className="text-xs">{error || "An unexpected error occurred during zip generation."}</p>
            </div>
          )}

          {/* Failed Mods Section (Partial Failure) */}
          {failedMods.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <AlertTriangle className="size-3.5" />
                Failed Mods ({failedMods.length})
              </h4>
              <p className="text-[10px] text-muted-foreground">
                These mods were skipped. The rest of the pack was compiled.
              </p>
              <div className="max-h-[120px] overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-1.5">
                {failedMods.map((fm) => (
                  <div key={fm.projectId} className="flex flex-col text-[11px] leading-tight">
                    <span className="font-medium truncate">{fm.name}</span>
                    <span className="text-[10px] text-muted-foreground">{fm.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            {showClose ? (
              <Button onClick={onCloseAction}>Done</Button>
            ) : (
              <Button variant="outline" onClick={onCloseAction}>
                Cancel Export
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
