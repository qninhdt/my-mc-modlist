"use client";

import { useState, useRef } from "react";
import {
  Download,
  Server,
  User,
  FileArchive,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Modpack } from "@/lib/modpacks/types";
import type { PackMod } from "@/lib/modpacks/mod-types";
import type { ExportProgress, ExportTarget } from "@/lib/zip/types";
import { filterModsByTarget } from "@/lib/zip/side-filter";
import { buildModpackZip } from "@/lib/zip/zip-builder";
import { exportToMrpack } from "@/lib/zip/mrpack-export";
import { ExportProgressDialog } from "./export-progress-dialog";
import { authedFetchJson } from "@/lib/api/authed-fetch";

interface ExportMenuProps {
  pack: Modpack;
  mods: PackMod[];
}

export function ExportMenu({ pack, mods }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exportingTarget, setExportingTarget] = useState<
    ExportTarget | "mrpack" | null
  >(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const isCancelledRef = useRef(false);

  const handleCancel = () => {
    isCancelledRef.current = true;
    setExportingTarget(null);
    setProgress(null);
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Callback to fetch CurseForge manual download URL from the server (P6 integration)
  const getManualDownloadUrl = async (mod: PackMod): Promise<string> => {
    if (!mod.storagePath) {
      throw new Error("No jar file has been uploaded for this mod. Please download and upload the file first.");
    }
    // We fetch a short-TTL signed URL from the server for this manual mod
    const res = await authedFetchJson<{ url: string }>(
      `/api/packs/${pack.id}/mods/${mod.id}/download`
    );
    return res.url;
  };

  const handleExport = async (target: ExportTarget | "mrpack") => {
    isCancelledRef.current = false;
    setExportingTarget(target);
    setIsOpen(false);

    // Initialize progress state
    setProgress({
      status: "idle",
      total: mods.length,
      current: 0,
      currentName: "",
      failedMods: [],
    });

    const onProgress = (p: ExportProgress) => {
      if (isCancelledRef.current) {
        throw new Error("Export cancelled by user");
      }
      setProgress(p);
    };

    try {
      if (target === "mrpack") {
        const mrpackBlob = await exportToMrpack(pack, mods, {
          onProgress,
          getManualDownloadUrl,
        });
        const safePackName = pack.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        triggerDownload(mrpackBlob, `${safePackName}-${pack.mcVersion}.mrpack`);
      } else {
        const filteredMods = filterModsByTarget(mods, target);
        // Update total to reflect only filtered mods
        setProgress((prev) =>
          prev ? { ...prev, total: filteredMods.length } : null
        );

        const zipBlob = await buildModpackZip(filteredMods, {
          onProgress: (p) => onProgress({ ...p, total: filteredMods.length }),
          getManualDownloadUrl,
        });

        const safePackName = pack.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        triggerDownload(
          zipBlob,
          `${safePackName}-${target}-${pack.mcVersion}.zip`
        );
      }
    } catch (err: any) {
      if (isCancelledRef.current) return;
      console.error("Export failed:", err);
      setProgress((prev) => ({
        status: "error",
        total: prev?.total || 0,
        current: prev?.current || 0,
        currentName: "",
        failedMods: prev?.failedMods || [],
        error: err?.message || String(err),
      }));
    }
  };

  const getTargetName = () => {
    if (exportingTarget === "client") return "Client ZIP";
    if (exportingTarget === "server") return "Server ZIP";
    if (exportingTarget === "singleplayer") return "Singleplayer ZIP";
    if (exportingTarget === "mrpack") return "Modrinth Pack (.mrpack)";
    return "";
  };

  const resolvedCount = mods.filter((m) => m.versionId || m.curseforgeManual).length;
  const hasUnresolved = resolvedCount < mods.length;

  return (
    <div className="relative inline-block text-left">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {hasUnresolved && (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="size-4 text-amber-500 shrink-0" />
            <span>
              {mods.length - resolvedCount} mod(s) unresolved. Resolve versions before exporting.
            </span>
          </div>
        )}
        
        <div className="relative">
          <Button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 px-4 rounded-lg shadow-sm transition"
          >
            <Download className="size-4" />
            <span>Export Pack</span>
            <ChevronDown className="size-4" />
          </Button>

          {isOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute left-0 md:left-auto md:right-0 mt-2 w-[280px] sm:w-80 origin-top-left md:origin-top-right rounded-xl border bg-card p-2 shadow-xl z-40 focus:outline-none">
                <div className="space-y-1">
                  <button
                    onClick={() => handleExport("client")}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted transition"
                  >
                    <Download className="size-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Client ZIP</div>
                      <div className="text-xs text-muted-foreground">
                        Only client-compatible mods. Perfect for sharing with players.
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleExport("server")}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted transition"
                  >
                    <Server className="size-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Server ZIP</div>
                      <div className="text-xs text-muted-foreground">
                        Only server-compatible mods. Used for server hosting.
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleExport("singleplayer")}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted transition"
                  >
                    <User className="size-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Singleplayer ZIP</div>
                      <div className="text-xs text-muted-foreground">
                        All mods. Drops straight into local Minecraft directory.
                      </div>
                    </div>
                  </button>

                  <div className="border-t my-1" />

                  <button
                    onClick={() => handleExport("mrpack")}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted transition"
                  >
                    <FileArchive className="size-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        Modrinth Pack (.mrpack)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Standard format. Installs directly in Prism Launcher, Modrinth App, etc.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {progress && exportingTarget && (
        <ExportProgressDialog
          progress={progress}
          onCloseAction={handleCancel}
          targetName={getTargetName()}
        />
      )}
    </div>
  );
}
