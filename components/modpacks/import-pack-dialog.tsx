"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import JSZip from "jszip";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import { Button } from "@/components/ui/button";

interface ImportPackDialogProps {
  packId: string;
  onCloseAction: () => void;
  onImportCompleteAction: () => void;
}

type ImportStatus = "idle" | "reading" | "importing" | "success" | "error";

export function ImportPackDialog({
  packId,
  onCloseAction,
  onImportCompleteAction,
}: ImportPackDialogProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processZip = async (file: File) => {
    setStatus("reading");
    setErrorMsg("");
    try {
      const zip = await JSZip.loadAsync(file);
      
      const modrinthFile = zip.file("modrinth.index.json");
      const curseforgeFile = zip.file("manifest.json");

      if (modrinthFile) {
        const text = await modrinthFile.async("text");
        const index = JSON.parse(text);
        
        if (!index.files || !Array.isArray(index.files)) {
          throw new Error("Invalid Modrinth pack index: missing files list");
        }

        const filesPayload = index.files.map((f: any) => {
          const downloadUrl = f.downloads?.[0] || "";
          // Parse project ID and version ID from CDN download URL
          const match = downloadUrl.match(/data\/([^/]+)\/versions\/([^/]+)/);
          const projectId = match ? match[1] : undefined;
          const versionId = match ? match[2] : undefined;

          // Extract filename from path
          const fileName = f.path ? f.path.split("/").pop() : "";

          return {
            projectId: projectId || f.projectId || "",
            versionId: versionId || f.versionId || "",
            fileName: fileName || f.name || "",
            downloadUrl,
            sha1: f.hashes?.sha1 || null,
            sha512: f.hashes?.sha512 || null,
            fileSize: f.fileSize || null,
          };
        }).filter((f: any) => f.projectId && f.versionId);

        if (filesPayload.length === 0) {
          throw new Error("No valid Modrinth mods found in index");
        }

        await executeImport("modrinth", filesPayload);
      } else if (curseforgeFile) {
        const text = await curseforgeFile.async("text");
        const manifest = JSON.parse(text);

        if (!manifest.files || !Array.isArray(manifest.files)) {
          throw new Error("Invalid CurseForge manifest: missing files list");
        }

        const filesPayload = manifest.files.map((f: any) => ({
          projectIdCf: f.projectID,
          fileIdCf: f.fileID,
        })).filter((f: any) => f.projectIdCf && f.fileIdCf);

        if (filesPayload.length === 0) {
          throw new Error("No valid CurseForge mods found in manifest");
        }

        await executeImport("curseforge", filesPayload);
      } else {
        throw new Error("Unsupported zip archive: must contain 'modrinth.index.json' or 'manifest.json' in the root");
      }
    } catch (err: any) {
      console.error("Failed to parse zip pack:", err);
      setErrorMsg(err?.message || "Failed to process zip file");
      setStatus("error");
    }
  };

  const executeImport = async (type: "modrinth" | "curseforge", files: any[]) => {
    setStatus("importing");
    try {
      const res = await authedFetchJson<{
        success: boolean;
        importedCount: number;
        failures: string[];
      }>(`/api/packs/${packId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, files }),
      });

      if (res.success) {
        setImportedCount(res.importedCount);
        setFailures(res.failures || []);
        setStatus("success");
        onImportCompleteAction();
      } else {
        throw new Error("Import failed");
      }
    } catch (err: any) {
      console.error("Import request failed:", err);
      setErrorMsg(err?.message || "Server failed to import mods");
      setStatus("error");
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".zip") || file.name.endsWith(".mrpack")) {
        processZip(file);
      } else {
        setErrorMsg("Please upload a .zip or .mrpack file.");
        setStatus("error");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processZip(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl flex flex-col min-h-0">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b shrink-0">
          <h3 className="font-semibold text-lg text-foreground">Import Modpack</h3>
          <button
            type="button"
            onClick={onCloseAction}
            disabled={status === "reading" || status === "importing"}
            className="rounded-md p-1.5 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 py-6">
          {status === "idle" && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={onButtonClick}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-4 ${
                isDragActive
                  ? "border-primary bg-primary/5 scale-[0.99]"
                  : "border-muted hover:border-primary/50 hover:bg-muted/10"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".zip,.mrpack"
                className="hidden"
              />
              <div className="p-3 bg-muted rounded-full text-muted-foreground">
                <Upload className="size-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Drag and drop your export file here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports Modrinth (.mrpack) and CurseForge (.zip) manifests
                </p>
              </div>
              <Button type="button" variant="outline" size="sm">
                Select File
              </Button>
            </div>
          )}

          {status === "reading" && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="size-8 animate-spin text-primary mx-auto" />
              <div>
                <p className="text-sm font-semibold text-foreground">Reading Archive...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Extracting and parsing mod files manifest
                </p>
              </div>
            </div>
          )}

          {status === "importing" && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="size-8 animate-spin text-primary mx-auto" />
              <div>
                <p className="text-sm font-semibold text-foreground">Importing Mods...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Resolving metadata and adding mods to Firestore pack scoped
                </p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="py-2 space-y-6">
              <div className="text-center space-y-2">
                <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                <h4 className="font-semibold text-lg text-foreground">Import Completed!</h4>
                <p className="text-sm text-muted-foreground">
                  Successfully imported <span className="font-semibold text-foreground">{importedCount}</span> mods into the pack.
                </p>
              </div>

              {failures.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                    <span>Unresolved Mods ({failures.length})</span>
                  </div>
                  <ul className="text-[10px] text-amber-700/80 dark:text-amber-400/80 list-disc list-inside max-h-28 overflow-y-auto space-y-1">
                    {failures.map((f, idx) => (
                      <li key={idx} className="truncate">{f}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    These mods could not be resolved from API indexes. You can add them manually.
                  </p>
                </div>
              )}

              <Button onClick={onCloseAction} className="w-full font-semibold">
                Close
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-4 space-y-6">
              <AlertCircle className="size-10 text-destructive mx-auto" />
              <div>
                <h4 className="font-semibold text-lg text-foreground">Import Failed</h4>
                <p className="text-xs text-destructive mt-1 bg-destructive/10 border border-destructive/20 rounded-lg p-3 inline-block max-w-full break-words">
                  {errorMsg}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStatus("idle")} className="flex-1 font-semibold">
                  Try Again
                </Button>
                <Button onClick={onCloseAction} className="flex-1 font-semibold">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
