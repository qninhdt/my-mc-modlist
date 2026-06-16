"use client";

import { useState } from "react";
import { X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AddCustomModDialogProps {
  packId: string;
  mcVersion?: string;
  loader?: string;
  onCloseAction: () => void;
  onSuccessAction: () => void;
}

const SIDE_OPTIONS = [
  { value: "required", label: "Required" },
  { value: "optional", label: "Optional" },
  { value: "unsupported", label: "Unsupported" },
  { value: "unknown", label: "Unknown" },
];

const COMMON_CATEGORIES = [
  "library",
  "gameplay",
  "optimization",
  "utility",
  "cosmetic",
  "worldgen",
  "technology",
  "magic",
  "storage",
  "adventure",
];

export function AddCustomModDialog({
  packId,
  mcVersion,
  loader,
  onCloseAction,
  onSuccessAction,
}: AddCustomModDialogProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Form fields
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [clientSide, setClientSide] = useState("required");
  const [serverSide, setServerSide] = useState("required");
  const [categories, setCategories] = useState<string[]>([]);
  const [modUrl, setModUrl] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedSource, setResolvedSource] = useState<"none" | "modrinth" | "curseforge">("none");
  const [modVersions, setModVersions] = useState<any[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");

  const handleResolveUrl = async () => {
    const trimmed = modUrl.trim();
    if (!trimmed) return;
    setIsResolving(true);
    setErrorMsg("");
    try {
      let lookupId = "";
      if (trimmed.includes("modrinth.com")) {
        const parts = trimmed.replace(/\/$/, "").split("/");
        lookupId = parts.pop() || "";
      } else if (trimmed.includes("curseforge.com")) {
        const parts = trimmed.replace(/\/$/, "").split("/");
        const slug = parts.pop() || "";
        lookupId = `cf:${slug}`;
      } else {
        throw new Error("Invalid URL. Only Modrinth or CurseForge URLs are supported.");
      }

      const res = await authedFetchJson<{ mod: any }>(`/api/mod/${encodeURIComponent(lookupId)}?packId=${packId}`);
      if (res?.mod) {
        setName(res.mod.name || "");
        setSummary(res.mod.summary || "");
        setIconUrl(res.mod.iconUrl || "");
        
        // Map side support
        const clientVal = res.mod.clientSide || "unknown";
        const serverVal = res.mod.serverSide || "unknown";
        setClientSide(clientVal);
        setServerSide(serverVal);
        
        setCategories(res.mod.tags || []);

        const isModrinth = trimmed.includes("modrinth.com");
        setResolvedSource(isModrinth ? "modrinth" : "curseforge");

        if (isModrinth) {
          try {
            let versionsUrl = `/api/mod/${encodeURIComponent(lookupId)}/versions`;
            const qParams = new URLSearchParams();
            if (loader) qParams.set("loaders", loader);
            if (mcVersion) qParams.set("game_versions", mcVersion);
            const qStr = qParams.toString();
            if (qStr) {
              versionsUrl += `?${qStr}`;
            }

            const versionsRes = await authedFetchJson<{ versions: any[] }>(versionsUrl);
            if (versionsRes?.versions) {
              setModVersions(versionsRes.versions);
              if (versionsRes.versions.length > 0) {
                setSelectedVersionId(versionsRes.versions[0].id);
              } else {
                setSelectedVersionId("");
              }
            }
          } catch (vErr) {
            console.warn("Failed to fetch versions for resolved Modrinth mod:", vErr);
            setModVersions([]);
            setSelectedVersionId("");
          }
        } else {
          setModVersions([]);
          setSelectedVersionId("");
        }
      } else {
        throw new Error("Mod details could not be resolved from this URL.");
      }
    } catch (err: any) {
      console.error("Resolve error:", err);
      setErrorMsg(err?.message || "Failed to resolve mod URL. You can still enter details manually.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleToggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !modUrl.trim()) {
      setErrorMsg("Mod Name is required (or provide a URL to resolve).");
      return;
    }

    if (resolvedSource === "modrinth" && !selectedVersionId) {
      setErrorMsg("Please select a version for this Modrinth mod.");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    try {
      const payload = {
        name: name.trim(),
        summary: summary.trim(),
        iconUrl: iconUrl.trim() || null,
        clientSide,
        serverSide,
        categories,
        modUrl: modUrl.trim() || null,
        versionId: resolvedSource === "modrinth" ? selectedVersionId : null,
      };

      const res = await authedFetchJson<{ success: boolean }>(`/api/packs/${packId}/custom-mod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.success) {
        setStatus("success");
        onSuccessAction();
        setTimeout(onCloseAction, 1000);
      } else {
        throw new Error("Failed to save custom mod");
      }
    } catch (err: any) {
      console.error("Failed to add custom mod:", err);
      setErrorMsg(err?.message || "Failed to add custom mod");
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl flex flex-col max-h-[90vh] min-h-0">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b shrink-0">
          <h3 className="font-semibold text-lg text-foreground">Add Custom / Manual Mod</h3>
          <button
            type="button"
            onClick={onCloseAction}
            disabled={status === "saving"}
            className="rounded-md p-1.5 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 pr-1 space-y-4">
          
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="break-words flex-1">{errorMsg}</span>
            </div>
          )}

          {/* URL Resolution Block */}
          <div className="space-y-1.5 border rounded-xl p-3.5 bg-muted/20">
            <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1">
              <Sparkles className="size-3.5 text-primary" />
              Resolve from Modrinth / CurseForge URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://modrinth.com/mod/sodium..."
                value={modUrl}
                onChange={(e) => setModUrl(e.target.value)}
                disabled={status === "saving" || isResolving}
                className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
              />
              <Button
                type="button"
                onClick={handleResolveUrl}
                disabled={status === "saving" || isResolving || !modUrl.trim()}
                variant="outline"
                size="sm"
                className="text-xs shrink-0 cursor-pointer"
              >
                {isResolving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Resolve"
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Paste a URL to automatically fetch Name, Summary, Icon, and Tags.
            </p>
          </div>

          {resolvedSource !== "none" ? (
            <div className="space-y-4">
              {/* Resolved Mod Details Card (Read-only) */}
              <div className="border rounded-xl p-4 bg-muted/10 flex gap-4 items-start">
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={iconUrl}
                    alt={name}
                    className="size-14 rounded-lg object-cover border"
                  />
                ) : (
                  <div className="size-14 rounded-lg bg-secondary border flex items-center justify-center text-muted-foreground text-[10px] text-center p-1">
                    No Icon
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-foreground truncate">{name}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {summary || "No description provided."}
                  </p>
                  {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {categories.map((c) => (
                        <span
                          key={c}
                          className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-semibold text-primary capitalize"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modrinth Version Selector */}
              {resolvedSource === "modrinth" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground/80">Select Version *</label>
                  {modVersions.length > 0 ? (
                    <select
                      value={selectedVersionId}
                      onChange={(e) => setSelectedVersionId(e.target.value)}
                      disabled={status === "saving"}
                      className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus-visible:outline-none shadow-sm cursor-pointer"
                    >
                      {modVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.version_number})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-destructive">
                      No versions found for this mod. Cannot add without selecting a version.
                    </p>
                  )}
                </div>
              )}

              {/* CurseForge Side Selector (Editable) */}
              {resolvedSource === "curseforge" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Client Side</label>
                    <div className="flex gap-1.5">
                      {SIDE_OPTIONS.filter(opt => opt.value !== "unknown").map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setClientSide(opt.value)}
                          disabled={status === "saving"}
                          className={cn(
                            "flex-1 px-1.5 py-1.5 rounded-lg border text-[10px] font-semibold transition cursor-pointer select-none text-center whitespace-nowrap",
                            clientSide === opt.value
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Server Side</label>
                    <div className="flex gap-1.5">
                      {SIDE_OPTIONS.filter(opt => opt.value !== "unknown").map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setServerSide(opt.value)}
                          disabled={status === "saving"}
                          className={cn(
                            "flex-1 px-1.5 py-1.5 rounded-lg border text-[10px] font-semibold transition cursor-pointer select-none text-center whitespace-nowrap",
                            serverSide === opt.value
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Reset Resolve Action */}
              <div className="text-xs text-muted-foreground flex justify-between items-center bg-muted/20 p-2.5 rounded-lg border">
                <span>Resolved from {resolvedSource === "modrinth" ? "Modrinth" : "CurseForge"} URL.</span>
                <button
                  type="button"
                  onClick={() => {
                    setResolvedSource("none");
                    setModUrl("");
                    setName("");
                    setSummary("");
                    setIconUrl("");
                    setCategories([]);
                    setClientSide("both");
                    setServerSide("both");
                    setModVersions([]);
                    setSelectedVersionId("");
                  }}
                  className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                >
                  Reset Form
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mod Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80">Mod Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Custom Mod"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={status === "saving"}
                  className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                />
              </div>

              {/* Summary */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80">Summary</label>
                <textarea
                  placeholder="Brief description of what the mod does..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={status === "saving"}
                  rows={2}
                  className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm resize-none"
                />
              </div>

              {/* Icon URL */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80">Icon Image URL</label>
                <input
                  type="text"
                  placeholder="https://example.com/icon.png"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  disabled={status === "saving"}
                  className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                />
              </div>

              {/* Client & Server Side Support */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">Client Side</label>
                  <div className="flex gap-1.5">
                    {SIDE_OPTIONS.filter(opt => opt.value !== "unknown").map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setClientSide(opt.value)}
                        disabled={status === "saving"}
                        className={cn(
                          "flex-1 px-1.5 py-1.5 rounded-lg border text-[10px] font-semibold transition cursor-pointer select-none text-center whitespace-nowrap",
                          clientSide === opt.value
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">Server Side</label>
                  <div className="flex gap-1.5">
                    {SIDE_OPTIONS.filter(opt => opt.value !== "unknown").map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setServerSide(opt.value)}
                        disabled={status === "saving"}
                        className={cn(
                          "flex-1 px-1.5 py-1.5 rounded-lg border text-[10px] font-semibold transition cursor-pointer select-none text-center whitespace-nowrap",
                          serverSide === opt.value
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Categories / Tags */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Categories</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_CATEGORIES.map((cat) => {
                    const active = categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleToggleCategory(cat)}
                        disabled={status === "saving"}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition cursor-pointer select-none ${
                          active
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Footer Submit */}
          <div className="pt-4 border-t flex gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onCloseAction}
              disabled={status === "saving"}
              className="flex-1 font-semibold text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={status === "saving" || (!name.trim() && !modUrl.trim())}
              className="flex-1 font-semibold text-xs cursor-pointer"
            >
              {status === "saving" ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving...
                </>
              ) : status === "success" ? (
                "Added!"
              ) : (
                "Add Custom Mod"
              )}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
