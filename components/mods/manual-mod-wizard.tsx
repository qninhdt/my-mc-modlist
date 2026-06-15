"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, CheckCircle2, AlertOctagon, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PackMod } from "@/lib/modpacks/mod-types";
import { computeHashes } from "@/lib/storage/hashing";
import { uploadJarAndUpdateMod } from "@/lib/storage/jar-upload";
import { useAuth } from "@/lib/auth/use-auth";
import { makeActor } from "@/lib/activity/log";

interface ManualModWizardProps {
  packId: string;
  mod: PackMod;
  onCloseAction: () => void;
}

export function ManualModWizard({ packId, mod, onCloseAction }: ManualModWizardProps) {
  const { user } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [clientSide, setClientSide] = useState<string>(mod.clientSide || "required");
  const [serverSide, setServerSide] = useState<string>(mod.serverSide || "required");
  const [status, setStatus] = useState<"idle" | "hashing" | "uploading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [hashes, setHashes] = useState<{ sha1: string; sha512: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".jar")) {
      setErrorMessage("Only .jar files are allowed.");
      return;
    }

    const MAX_SIZE = 100 * 1024 * 1024; // 100MB limit
    if (selectedFile.size > MAX_SIZE) {
      setErrorMessage("File is too large (max 100MB).");
      return;
    }

    setErrorMessage("");
    setFile(selectedFile);
    setStatus("hashing");

    try {
      const computed = await computeHashes(selectedFile);
      setHashes(computed);
      setStatus("idle");
    } catch (err: any) {
      console.error("Hashing failed:", err);
      setErrorMessage("Failed to compute file hashes client-side.");
      setStatus("error");
      setFile(null);
      setHashes(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (status === "hashing" || status === "uploading" || status === "success") return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !hashes || !user?.uid) return;

    setStatus("uploading");

    try {
      await uploadJarAndUpdateMod(
        packId,
        mod.id,
        file,
        makeActor(user),
        clientSide,
        serverSide
      );
      setStatus("success");
    } catch (err: any) {
      console.error("Upload failed:", err);
      setErrorMessage(err?.message || "Failed to upload file to storage.");
      setStatus("error");
    }
  };

  const resetFileSelection = () => {
    setFile(null);
    setHashes(null);
    setErrorMessage("");
    setStatus("idle");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border bg-card p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onCloseAction}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
          disabled={status === "uploading"}
        >
          <X className="size-4" />
        </button>

        <div>
          <h3 className="text-lg font-semibold">CurseForge Manual Setup</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure manual download and upload for <span className="font-semibold text-foreground">{mod.name}</span>
          </p>
        </div>

        {errorMessage && (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            <AlertOctagon className="size-4 shrink-0 text-red-500" />
            <div>{errorMessage}</div>
          </div>
        )}

        {status !== "success" && (
          <div className="space-y-4">
            {!file || !hashes ? (
              /* DROPZONE FILE SELECT */
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => status !== "hashing" && fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 rounded-xl p-8 text-center cursor-pointer transition bg-muted/20"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  accept=".jar"
                  className="hidden"
                />
                {status === "hashing" ? (
                  <div className="space-y-2">
                    <Loader2 className="size-8 animate-spin text-primary mx-auto" />
                    <p className="text-sm font-medium">Hashing file client-side...</p>
                    <p className="text-xs text-muted-foreground">Calculating SHA-1 & SHA-512 hashes</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="size-8 text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">Drag & drop your downloaded mod JAR here</p>
                    <p className="text-xs text-muted-foreground">or click to browse your files (max 100MB)</p>
                  </div>
                )}
              </div>
            ) : (
              /* CONFIGURE & REVIEW FORM */
              <div className="space-y-4">
                {/* Hashing success confirmation with reset option */}
                <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <span className="truncate">
                      File loaded: <span className="font-semibold">{file.name}</span> ({hashes.sha1.slice(0, 8)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={resetFileSelection}
                    disabled={status === "uploading"}
                    className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    Change File
                  </button>
                </div>

                {/* Sides settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Client Side Support</label>
                    <select
                      value={clientSide}
                      onChange={(e) => setClientSide(e.target.value)}
                      className="w-full rounded-lg border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                      <option value="unsupported">Unsupported (Server Only)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Server Side Support</label>
                    <select
                      value={serverSide}
                      onChange={(e) => setServerSide(e.target.value)}
                      className="w-full rounded-lg border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                      <option value="unsupported">Unsupported (Client Only)</option>
                    </select>
                  </div>
                </div>

                {/* Dependency Warning Alert */}
                <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                  <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                  <div>
                    <span className="font-semibold">Dependency Warning:</span> CurseForge manual mods do not support automatic dependency resolution. You must manually find and add any dependency mods.
                  </div>
                </div>

                {/* File info review */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-[11px] text-muted-foreground">
                  <div className="font-semibold text-foreground mb-1 text-xs">Upload Review</div>
                  <div>Destination path: <span className="font-mono">packs/{packId}/mods/{mod.id}/...</span></div>
                  <div className="truncate">SHA-1: <span className="font-mono">{hashes.sha1}</span></div>
                  <div className="truncate">SHA-512: <span className="font-mono">{hashes.sha512}</span></div>
                </div>

                {/* Actions */}
                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={handleUpload} disabled={status === "uploading"}>
                    {status === "uploading" ? (
                      <>
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload & Complete"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* UPLOAD SUCCESS SCREEN */}
        {status === "success" && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="size-12 text-emerald-500 mx-auto" />
            <div className="space-y-1">
              <h4 className="font-semibold text-lg text-foreground">Upload Successful!</h4>
              <p className="text-sm text-muted-foreground">
                The jar file has been securely uploaded. It is now fully integrated into side-filtering, zip building, and mrpack exports.
              </p>
            </div>
            <div className="pt-2">
              <Button onClick={onCloseAction} className="w-full animate-bounce">
                Close Setup
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
