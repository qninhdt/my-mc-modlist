"use client";

import { useMemo, useState, useEffect } from "react";
import { X, Loader2, Check, AlertTriangle, Package, ChevronRight, FolderPlus, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import { useModpacks } from "@/lib/modpacks/queries";
import { usePackMods, useResolveMod, useAddPackModResolved, type ResolveResult } from "@/lib/modpacks/mod-queries";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import { Button } from "@/components/ui/button";
import type { ModView, ModrinthVersion } from "@/lib/api/types";
import { LOADER_LABELS } from "@/lib/minecraft/loaders";
import type { ResolvedModEntry } from "@/lib/modpacks/mod-repository";
import { cn } from "@/lib/utils";

// Beautiful custom select dropdown that aligns with premium design guidelines.
// Avoids raw native browser select dropdown styling limitations.
function CustomSelect({
  value,
  onChange,
  options,
  label,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; sublabel?: string }[];
  label: string;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative space-y-1.5 w-full">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-left cursor-pointer transition-all"
        >
          <div className="flex flex-col truncate">
            <span className="font-medium truncate text-foreground">
              {selectedOption ? selectedOption.label : placeholder || "Select..."}
            </span>
            {selectedOption?.sublabel && (
              <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                {selectedOption.sublabel}
              </span>
            )}
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground ml-2 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-30 cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />
            <ul className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover text-popover-foreground py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none animate-in fade-in slide-in-from-top-1 duration-100">
              {options.map((opt) => (
                <li
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "group relative cursor-pointer select-none px-3 py-2.5 transition-colors",
                    opt.value === value
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{opt.label}</span>
                    {opt.sublabel && (
                      <span
                        className={cn(
                          "text-[10px] mt-0.5 transition-colors",
                          opt.value === value
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground group-hover:text-accent-foreground/80"
                        )}
                      >
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function AddToPackDialog({
  mod,
  initialPackId,
  onCloseAction,
  onSuccessAction,
}: {
  mod: ModView;
  initialPackId?: string;
  onCloseAction: () => void;
  onSuccessAction?: () => void;
}) {
  const { user } = useAuth();
  const { data: packs, isLoading: isLoadingPacks } = useModpacks();
  
  // 1. Filter packs where the user has edit permissions (owner or editor)
  const editablePacks = useMemo(() => {
    if (!packs || !user) return [];
    return packs.filter(
      (p) => p.ownerUid === user.uid || p.members?.[user.uid] === "editor"
    );
  }, [packs, user]);

  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [step, setStep] = useState<"select" | "deps">("select");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set initial selected pack if provided or fallback to the first editable pack
  useEffect(() => {
    if (initialPackId && editablePacks.some((p) => p.id === initialPackId)) {
      setSelectedPackId(initialPackId);
    } else if (editablePacks.length > 0) {
      setSelectedPackId(editablePacks[0].id);
    }
  }, [initialPackId, editablePacks]);

  // Get selected pack details
  const selectedPack = useMemo(() => {
    return editablePacks.find((p) => p.id === selectedPackId);
  }, [editablePacks, selectedPackId]);

  // Load existing mods in the selected pack to avoid duplicate dependency resolution
  const { data: existingMods } = usePackMods(selectedPackId);
  const existingProjectIds = useMemo(() => {
    return new Set((existingMods ?? []).map((m) => m.projectId));
  }, [existingMods]);

  const isAlreadyAdded = useMemo(() => {
    return existingProjectIds.has(mod.id);
  }, [existingProjectIds, mod.id]);

  // 2. Fetch compatible versions based on selected pack's loader and mcVersion
  const { data: rawVersions, isLoading: isLoadingVersions } = useQuery({
    queryKey: ["mod-versions", mod.id, selectedPack?.loader, selectedPack?.mcVersion],
    queryFn: async () => {
      if (!selectedPack) return [];
      const res = await authedFetchJson<{ versions: ModrinthVersion[] }>(
        `/api/mod/${mod.id}/versions?loaders=${selectedPack.loader}&game_versions=${selectedPack.mcVersion}`
      );
      return res.versions;
    },
    enabled: !!mod.id && !!selectedPack,
  });

  // Sort versions by release status and publication date
  const versions = useMemo(() => {
    if (!rawVersions) return [];
    const VERSION_TYPE_PRIORITY: Record<string, number> = {
      release: 0,
      beta: 1,
      alpha: 2,
    };
    return [...rawVersions].sort((a, b) => {
      const typeDiff =
        (VERSION_TYPE_PRIORITY[a.version_type] ?? 3) -
        (VERSION_TYPE_PRIORITY[b.version_type] ?? 3);
      if (typeDiff !== 0) return typeDiff;
      return (
        new Date(b.date_published).getTime() -
        new Date(a.date_published).getTime()
      );
    });
  }, [rawVersions]);

  // Auto-select the first (best sorted) version
  useEffect(() => {
    if (versions.length > 0) {
      setSelectedVersionId(versions[0].id);
    } else {
      setSelectedVersionId("");
    }
  }, [versions]);

  // Map packs and versions to options list compatible with CustomSelect
  const packOptions = useMemo(() => {
    return editablePacks.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: `MC ${p.mcVersion} · ${LOADER_LABELS[p.loader]}`,
    }));
  }, [editablePacks]);

  const versionOptions = useMemo(() => {
    return versions.map((v) => {
      const date = new Date(v.date_published).toLocaleDateString();
      return {
        value: v.id,
        label: v.version_number,
        sublabel: `Type: ${v.version_type} · Released: ${date}`,
      };
    });
  }, [versions]);

  // 3. Dependency resolution state
  const { mutate: resolve, isPending: resolving } = useResolveMod();
  const { mutate: addResolved, isPending: committing } = useAddPackModResolved(selectedPackId);
  const [pendingAdd, setPendingAdd] = useState<{
    mod: ModView;
    result: ResolveResult;
  } | null>(null);

  // Trigger resolution
  function handleNext() {
    if (!selectedPack || !selectedVersionId) return;
    setErrorMsg(null);

    resolve(
      {
        projectId: mod.id,
        mcVersion: selectedPack.mcVersion,
        loader: selectedPack.loader,
        existingProjectIds: Array.from(existingProjectIds),
        versionId: selectedVersionId,
      },
      {
        onSuccess: (result) => {
          if (result.error) {
            setErrorMsg(result.error);
          } else if (result.resolved) {
            setPendingAdd({ mod, result });
            setStep("deps");
          } else {
            setErrorMsg("Failed to resolve dependencies.");
          }
        },
        onError: (err) => {
          setErrorMsg(err instanceof Error ? err.message : "Dependency resolution failed");
        },
      }
    );
  }

  // Batch commit to Firestore
  function handleConfirm() {
    if (!pendingAdd?.result.resolved || !selectedPack) return;
    const { mod, result } = pendingAdd;

    const entries: ResolvedModEntry[] = [];

    // Root mod entry
    entries.push({
      input: {
        projectId: mod.id,
        slug: mod.sources.modrinth?.slug ?? "",
        name: mod.name,
        summary: mod.summary,
        iconUrl: mod.iconUrl,
        categories: mod.tags,
        clientSide: mod.clientSide,
        serverSide: mod.serverSide,
        curseforgeManual: mod.curseforgeManual,
      },
      versionPin: {
        versionId: result.resolved!.versionId,
        fileName: result.resolved!.file.filename,
        downloadUrl: result.resolved!.file.url,
        sha1: result.resolved!.file.sha1,
        sha512: result.resolved!.file.sha512,
        deps: result.deps.added.map((d) => d.projectId),
      },
    });

    // Dependency entries
    for (const dep of result.deps.added) {
      const info = result.depProjectInfos[dep.projectId];
      entries.push({
        input: {
          projectId: dep.projectId,
          slug: info?.slug ?? "",
          name: info?.name ?? dep.projectId,
          summary: "",
          iconUrl: info?.iconUrl ?? null,
          categories: [],
          clientSide: "unknown",
          serverSide: "unknown",
          curseforgeManual: false,
        },
        versionPin: {
          versionId: dep.versionId,
          fileName: dep.file.filename,
          downloadUrl: dep.file.url,
          sha1: dep.file.sha1,
          sha512: dep.file.sha512,
          deps: [],
        },
        viaDependency: true,
      });
    }

    addResolved(entries, {
      onSuccess: () => {
        onSuccessAction?.();
        onCloseAction();
      },
      onError: (err) => {
        setErrorMsg(err instanceof Error ? err.message : "Failed to add mods to pack");
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-visible rounded-xl border bg-card p-6 shadow-xl space-y-4">
        {/* Close button */}
        <button
          onClick={onCloseAction}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="size-4" />
        </button>

        {/* Dialog header */}
        <div className="flex items-center gap-3 border-b pb-4">
          {mod.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mod.iconUrl}
              alt=""
              className="size-10 rounded-md object-cover"
            />
          ) : (
            <div className="size-10 rounded-md bg-secondary flex items-center justify-center">
              <Package className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-lg truncate">Add {mod.name}</h3>
            <p className="text-xs text-muted-foreground line-clamp-1">{mod.summary}</p>
          </div>
        </div>

        {/* Errors */}
        {errorMsg && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex gap-2 items-start">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1: Select Pack & Choose Version */}
        {step === "select" && (
          <div className="space-y-4">
            {isLoadingPacks ? (
              <div className="flex justify-center items-center py-6 text-sm text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading your modpacks...
              </div>
            ) : editablePacks.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <FolderPlus className="size-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground font-medium">
                  You don&apos;t have any modpacks you can edit yet.
                </p>
                <Button onClick={onCloseAction} size="sm">
                  Close
                </Button>
              </div>
            ) : (
              <>
                {/* Choose Pack */}
                <CustomSelect
                  label="Choose Modpack"
                  value={selectedPackId}
                  onChange={(val) => {
                    setSelectedPackId(val);
                    setErrorMsg(null);
                  }}
                  options={packOptions}
                />

                {/* Already Added Warn */}
                {isAlreadyAdded && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200 flex gap-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>This mod is already in the selected modpack. You can re-add to change versions.</span>
                  </div>
                )}

                {/* Choose Version */}
                {selectedPack && (
                  <div className="space-y-2">
                    {isLoadingVersions ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="size-3.5 animate-spin" />
                        Fetching compatible versions...
                      </div>
                    ) : versions.length === 0 ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                        No compatible versions of this mod found for {LOADER_LABELS[selectedPack.loader]} {selectedPack.mcVersion}.
                      </div>
                    ) : (
                      <CustomSelect
                        label="Select Version"
                        value={selectedVersionId}
                        onChange={(val) => setSelectedVersionId(val)}
                        options={versionOptions}
                      />
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={onCloseAction}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={!selectedVersionId || resolving || isLoadingVersions}
                    className="cursor-pointer font-medium"
                  >
                    {resolving ? (
                      <>
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                        Resolving...
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="ml-1 size-4" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Show Resolved Dependencies */}
        {step === "deps" && pendingAdd && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Confirm Version Addition</h4>
              <p className="text-xs text-muted-foreground font-mono truncate">
                Selected: {pendingAdd.result.resolved?.file.filename}
              </p>
            </div>

            {/* Dependencies */}
            {pendingAdd.result.deps.added.length > 0 && (
              <div className="space-y-2">
                <h5 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Package className="size-4" />
                  Required Dependencies ({pendingAdd.result.deps.added.length})
                </h5>
                <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {pendingAdd.result.deps.added.map((dep) => {
                    const info = pendingAdd.result.depProjectInfos[dep.projectId];
                    return (
                      <li
                        key={dep.projectId}
                        className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                      >
                        {info?.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={info.iconUrl}
                            alt=""
                            className="size-5 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="size-5 rounded bg-secondary flex items-center justify-center text-[10px]" />
                        )}
                        <span className="flex-1 truncate font-medium">
                          {info?.name ?? dep.projectId}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {dep.file.filename}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {pendingAdd.result.deps.warnings.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-4" />
                  Warnings ({pendingAdd.result.deps.warnings.length})
                </h5>
                <ul className="space-y-1">
                  {pendingAdd.result.deps.warnings.map((w) => (
                    <li
                      key={w.projectId}
                      className="rounded border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
                    >
                      {w.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Conflicts */}
            {pendingAdd.result.deps.conflicts.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertTriangle className="size-4" />
                  Incompatible Mods ({pendingAdd.result.deps.conflicts.length})
                </h5>
                <ul className="space-y-1">
                  {pendingAdd.result.deps.conflicts.map((c) => (
                    <li
                      key={`${c.sourceProjectId}-${c.targetProjectId}`}
                      className="rounded border border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-800 dark:text-red-200"
                    >
                      {c.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pendingAdd.result.deps.added.length === 0 &&
              pendingAdd.result.deps.warnings.length === 0 &&
              pendingAdd.result.deps.conflicts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No additional dependencies required.
                </p>
              )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                disabled={committing}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={committing || pendingAdd.result.deps.conflicts.length > 0}
                className="cursor-pointer font-medium bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
              >
                {committing ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 size-4" />
                    {pendingAdd.result.deps.added.length > 0
                      ? `Add ${1 + pendingAdd.result.deps.added.length} mods`
                      : "Add mod"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
