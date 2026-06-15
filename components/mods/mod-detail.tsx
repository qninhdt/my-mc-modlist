"use client";

import { useState } from "react";
import { Download, Calendar, Users, ExternalLink, Globe, Info, MessageCircle, FileText, CheckCircle2 } from "lucide-react";
import type { ModView, ModrinthVersion } from "@/lib/api/types";
import { SideBadges } from "./side-badge";
import { SourceBadges } from "./source-badge";
import { useModVersions } from "@/lib/api/search-queries";
import { renderMarkdown } from "@/lib/utils/markdown";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Unknown";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "Unknown size";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function ModDetail({ mod }: { mod: ModView }) {
  const loaders = mod.modrinthProjects[0]?.loaders ?? [];
  const { data: versionsData, isLoading: loadingVersions } = useModVersions(mod.id);
  const versions = versionsData?.versions ?? [];

  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [activeImage, setActiveImage] = useState<string | null>(null);

  // Auto-select the first version once loaded
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || versions[0];
  if (versions.length > 0 && !selectedVersionId) {
    setSelectedVersionId(versions[0].id);
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header Info Section */}
      <div className="flex flex-col md:flex-row gap-6 items-start justify-between border-b pb-6">
        <div className="flex gap-4">
          {mod.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mod.iconUrl}
              alt=""
              className="size-24 shrink-0 rounded-xl object-cover border shadow-sm"
            />
          ) : (
            <div className="size-24 shrink-0 rounded-xl bg-secondary border flex items-center justify-center text-muted-foreground font-bold text-xl">
              {mod.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{mod.name}</h1>
            <p className="text-muted-foreground text-sm max-w-2xl">{mod.summary}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SourceBadges sources={mod.sources} />
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-muted/50">
                <Download className="size-3" />
                {formatDownloads(mod.downloads)} downloads
              </span>
              <SideBadges clientSide={mod.clientSide} serverSide={mod.serverSide} />
            </div>
          </div>
        </div>

        {/* External Links Grid */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto md:max-w-xs justify-start md:justify-end">
          {mod.sources.modrinth?.url && (
            <a
              href={mod.sources.modrinth.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Globe className="size-3.5 text-green-500" />
              Modrinth
              <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
            </a>
          )}
          {mod.sources.curseforge?.url && (
            <a
              href={mod.sources.curseforge.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Globe className="size-3.5 text-orange-500" />
              CurseForge
              <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
            </a>
          )}
          {mod.sourceUrl && (
            <a
              href={mod.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <GithubIcon className="size-3.5" />
              Source Code
              <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
            </a>
          )}
          {mod.issuesUrl && (
            <a
              href={mod.issuesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Info className="size-3.5 text-red-500" />
              Issues
              <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
            </a>
          )}
          {mod.wikiUrl && (
            <a
              href={mod.wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <FileText className="size-3.5 text-blue-500" />
              Wiki
              <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
            </a>
          )}
          {mod.discordUrl && (
            <a
              href={mod.discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <MessageCircle className="size-3.5 text-indigo-500" />
              Discord
              <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
            </a>
          )}
        </div>
      </div>

      {/* 2. Main Content Grid (Description + Sidebar Metadata) */}
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Left Column: Description & Gallery */}
        <div className="space-y-8 min-w-0">
          {/* Gallery Section */}
          {mod.gallery && mod.gallery.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Gallery</h2>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted">
                {mod.gallery.map((img, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={img.url}
                    alt={img.title || ""}
                    onClick={() => setActiveImage(img.url)}
                    className="h-32 w-auto shrink-0 rounded-lg object-cover border cursor-zoom-in hover:brightness-95 transition-all shadow-sm"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Markdown Body Description */}
          {mod.body ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight border-b pb-2">About this Mod</h2>
              <article
                className="prose prose-sm dark:prose-invert max-w-none break-words text-foreground/90 leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: mod.body.trim().startsWith("<") ? mod.body : renderMarkdown(mod.body)
                }}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No detailed description provided.
            </div>
          )}
        </div>

        {/* Right Column: Metadata & Creator Info */}
        <div className="space-y-6">
          {/* Dates & Stats Card */}
          <div className="rounded-xl border bg-card p-4 text-sm shadow-sm space-y-4">
            <h3 className="font-semibold tracking-tight border-b pb-2">Information</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Published</span>
                <span className="font-medium flex items-center gap-1">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  {formatDate(mod.published)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="font-medium flex items-center gap-1">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  {formatDate(mod.updated)}
                </span>
              </div>
            </div>
          </div>

          {/* Creator / Team Members Section */}
          {mod.members && mod.members.length > 0 && (
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
              <h3 className="font-semibold tracking-tight border-b pb-2 flex items-center gap-1.5">
                <Users className="size-4 text-muted-foreground" />
                Creators
              </h3>
              <ul className="space-y-3">
                {mod.members.map((member) => (
                  <li key={member.user.id} className="flex items-center gap-3">
                    {member.user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={member.user.avatar_url}
                        alt=""
                        className="size-8 shrink-0 rounded-full object-cover border"
                      />
                    ) : (
                      <div className="size-8 shrink-0 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground border">
                        {member.user.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground leading-none">
                        {member.user.name || member.user.username}
                      </p>
                      {member.user.name && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          @{member.user.username}
                        </p>
                      )}
                    </div>
                    <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary capitalize shrink-0">
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Loaders & Tags */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
            <h3 className="font-semibold tracking-tight border-b pb-2">Tags & Platforms</h3>
            {loaders.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs text-muted-foreground font-medium">Loaders</h4>
                <div className="flex flex-wrap gap-1.5">
                  {loaders.map((l) => (
                    <span
                      key={l}
                      className="rounded bg-secondary/80 border border-border px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {mod.tags.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <h4 className="text-xs text-muted-foreground font-medium">Categories</h4>
                <div className="flex flex-wrap gap-1.5">
                  {mod.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-muted/60 border border-border/40 px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Versions Selector & Changelog UI */}
      {(loadingVersions || versions.length > 0) && (
        <div className="border-t pt-8 space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Versions & Changelogs</h2>

          {loadingVersions ? (
            <p className="text-sm text-muted-foreground">Loading versions…</p>
          ) : versions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No versions available for this mod.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[260px_1fr] items-start">
              {/* Left Column: Version selection list */}
              <div className="rounded-xl border bg-card p-3 shadow-sm max-h-[500px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-muted">
                <p className="text-xs font-semibold text-muted-foreground px-2 pb-1 border-b">
                  Select Version ({versions.length})
                </p>
                {versions.map((v) => {
                  const isSelected = selectedVersion?.id === v.id;
                  const typeColors = {
                    release: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                    beta: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    alpha: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
                  };
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVersionId(v.id)}
                      className={`w-full flex flex-col items-start gap-1 p-2 rounded-lg text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent border border-accent-foreground/10"
                          : "hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      <div className="w-full flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs truncate max-w-[130px]">{v.name}</span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase shrink-0 ${
                            typeColors[v.version_type] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {v.version_type}
                        </span>
                      </div>
                      <div className="flex items-center justify-between w-full text-[10px] text-muted-foreground">
                        <span className="truncate max-w-[120px] font-mono">{v.version_number}</span>
                        <span>{formatDate(v.date_published).split(",")[0]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Selected Version Details & Changelog */}
              {selectedVersion && (
                <div className="rounded-xl border bg-card p-5 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                    <div>
                      <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                        {selectedVersion.name}
                        <span className="font-mono text-xs font-medium text-muted-foreground bg-muted border rounded px-1.5 py-0.5">
                          {selectedVersion.version_number}
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground pt-1">
                        Released on {formatDate(selectedVersion.date_published)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {selectedVersion.files?.[0]?.url && (
                        <a
                          href={selectedVersion.files[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/95 transition-colors"
                        >
                          <Download className="size-4" />
                          Download File
                          <span className="text-[10px] text-primary-foreground/85 font-mono ml-0.5">
                            ({formatBytes(selectedVersion.files[0].size)})
                          </span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Compatibility Grid */}
                  <div className="grid gap-4 sm:grid-cols-2 text-xs border-b pb-4">
                    <div>
                      <h4 className="font-semibold text-muted-foreground pb-1.5">Game Versions</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedVersion.game_versions.map((gv) => (
                          <span
                            key={gv}
                            className="bg-secondary px-2 py-0.5 rounded text-[10px] font-medium border text-secondary-foreground"
                          >
                            {gv}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-muted-foreground pb-1.5">Compatible Loaders</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedVersion.loaders.map((l) => (
                          <span
                            key={l}
                            className="bg-secondary px-2 py-0.5 rounded text-[10px] font-medium border text-secondary-foreground"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Changelog Render */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm tracking-tight">Changelog</h4>
                    {selectedVersion.changelog ? (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 leading-relaxed text-sm bg-muted/20 border rounded-lg p-4 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedVersion.changelog) }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground italic bg-muted/10 border border-dashed rounded-lg p-4 text-center">
                        No changelog provided for this version.
                      </p>
                    )}
                  </div>

                  {/* File Download Details */}
                  {selectedVersion.files && selectedVersion.files.length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Files ({selectedVersion.files.length})</h4>
                      <div className="space-y-1.5">
                        {selectedVersion.files.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30 text-xs font-medium"
                          >
                            <div className="min-w-0 flex-1 pr-4">
                              <p className="truncate text-foreground font-mono">{file.filename}</p>
                              {file.primary && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.2 rounded border border-emerald-200/50 mt-1">
                                  <CheckCircle2 className="size-2.5" />
                                  Primary File
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-muted-foreground font-mono">{formatBytes(file.size)}</span>
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-background border px-2 py-1 text-[10px] font-semibold hover:bg-accent hover:text-accent-foreground text-foreground transition-colors"
                              >
                                <Download className="size-3" />
                                Download
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Fullscreen image viewer modal */}
      {activeImage && (
        <div
          onClick={() => setActiveImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 cursor-zoom-out animate-in fade-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain border bg-card shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
