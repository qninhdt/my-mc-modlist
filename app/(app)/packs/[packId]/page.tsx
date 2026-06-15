"use client";

import { use, useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, Loader2, ListFilter, MessageSquare, History, Plus, Search, X, Monitor, Server, Globe, Layers, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/use-auth";
import { useModpack, useDeletePack } from "@/lib/modpacks/queries";
import type { Modpack } from "@/lib/modpacks/types";
import { usePackMods, useRemovePackMod, useUpdatePackMod } from "@/lib/modpacks/mod-queries";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import { PackHeader } from "@/components/modpacks/pack-header";
import { PackModList } from "@/components/mods/pack-mod-list";
import { ModFilters } from "@/components/mods/mod-filters";
import { SnapshotPanel } from "@/components/modpacks/snapshot-panel";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/modpacks/export-menu";
import type { UpdateCheckResult } from "@/lib/resolve/types";
import { fetchUserProfiles, type UserProfile } from "@/lib/sharing/membership";

export default function PackDetailPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: pack, isLoading, error } = useModpack(packId);
  const { mutate: removePack, isPending: deleting } = useDeletePack();
  const { data: mods } = usePackMods(packId);

  const [activeTab, setActiveTab] = useState<"mods" | "activity" | "snapshots">("mods");
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (pack && pack.memberUids.length > 0) {
      fetchUserProfiles(pack.memberUids)
        .then(setProfiles)
        .catch((err) => console.error("Failed to load user profiles:", err));
    }
  }, [pack?.memberUids]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading pack…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load pack: {error.message}
      </p>
    );
  }

  if (!pack) {
    return (
      <p className="text-sm text-muted-foreground">
        Pack not found, or you don&apos;t have access.
      </p>
    );
  }

  const role = user ? pack.members[user.uid] : undefined;
  const canEdit = role === "editor";

  function handleDelete() {
    if (!confirm("Delete this pack? This cannot be undone.")) return;
    removePack(packId, { onSuccess: () => router.push("/packs") });
  }

  return (
    <div className="space-y-6">
      <PackHeader
        pack={pack}
        canEdit={canEdit}
        onDeleteAction={handleDelete}
        deleting={deleting}
      />

      {/* Tabs Switcher */}
      <div className="border-b flex gap-6 text-sm font-medium overflow-x-auto whitespace-nowrap scrollbar-none w-full">
        <button
          onClick={() => setActiveTab("mods")}
          className={`pb-3 border-b-2 px-1 cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === "mods"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListFilter className="size-4" />
          Mods ({mods?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("activity")}
          className={`pb-3 border-b-2 px-1 cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === "activity"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="size-4" />
          Activity & Comments
        </button>
        {canEdit && (
          <button
            onClick={() => setActiveTab("snapshots")}
            className={`pb-3 border-b-2 px-1 cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "snapshots"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="size-4" />
            Snapshots
          </button>
        )}
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === "mods" && (
          <PackModsSection
            packId={packId}
            pack={pack}
            canEdit={canEdit}
            profiles={profiles}
          />
        )}

        {activeTab === "activity" && (
          <ActivityFeed
            packId={packId}
            isPackOwner={user?.uid === pack.ownerUid}
            role={role}
          />
        )}

        {activeTab === "snapshots" && canEdit && (
          <SnapshotPanel packId={packId} />
        )}
      </div>
    </div>
  );
}

function PackModsSection({
  packId,
  pack,
  canEdit,
  profiles,
}: {
  packId: string;
  pack: Modpack;
  canEdit: boolean;
  profiles: Record<string, UserProfile>;
}) {
  const { user } = useAuth();
  const { data: mods, isLoading } = usePackMods(packId);
  const { mutate: removeMod, variables: removingId } = useRemovePackMod(packId);
  const isOwner = !!(user && pack && user.uid === pack.ownerUid);

  const { mutate: updateMod } = useUpdatePackMod(packId);
  const checkedProjectsRef = useRef<Set<string>>(new Set());

  // Auto-backfill categories for mods missing them
  useEffect(() => {
    if (!mods) return;
    const modsToFix = mods.filter(
      (m) =>
        !m.curseforgeManual &&
        (!m.categories || m.categories.length === 0) &&
        !checkedProjectsRef.current.has(m.projectId)
    );
    if (modsToFix.length === 0) return;

    const runBackfill = async () => {
      for (const m of modsToFix) {
        checkedProjectsRef.current.add(m.projectId);
        try {
          const res = await authedFetchJson<{ mod: { tags: string[] } }>(
            `/api/mod/${encodeURIComponent(m.projectId)}`
          );
          if (res?.mod?.tags && res.mod.tags.length > 0) {
            updateMod({
              modId: m.id,
              data: { categories: res.mod.tags },
            });
          }
        } catch (err) {
          console.error(`Failed to backfill categories for ${m.name}:`, err);
        }
      }
    };
    runBackfill();
  }, [mods, updateMod]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Helper to parse comma-separated URL params into lists
  const csvToArray = (param: string | null) =>
    param ? param.split(",").filter(Boolean) : [];

  // Parse initial state from URL
  const initialQuery = searchParams.get("q") ?? "";
  const initialPage = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);
  const initialEnvironments = csvToArray(searchParams.get("environments"));
  const initialSources = csvToArray(searchParams.get("sources"));
  const initialCategories = csvToArray(searchParams.get("categories"));

  // Search, filter, and pagination states
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(initialEnvironments);
  const [selectedSources, setSelectedSources] = useState<string[]>(initialSources);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialCategories);
  const [page, setPage] = useState(initialPage);
  const pageSize = 15;
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const filterObject = useMemo(() => ({
    loaders: [],
    versions: [],
    categories: selectedCategories,
    environments: selectedEnvironments,
    sources: selectedSources,
    index: "relevance" as const,
  }), [selectedCategories, selectedEnvironments, selectedSources]);

  const handleFilterChange = (next: any) => {
    setSelectedCategories(next.categories);
    setSelectedEnvironments(next.environments);
    setSelectedSources(next.sources || []);
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, selectedEnvironments, selectedSources, selectedCategories]);

  // Synchronize state back to URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    else params.delete("q");

    if (page > 0) params.set("page", String(page + 1));
    else params.delete("page");

    const syncArray = (key: string, list: string[]) => {
      if (list.length > 0) params.set(key, list.join(","));
      else params.delete(key);
    };

    syncArray("environments", selectedEnvironments);
    syncArray("sources", selectedSources);
    syncArray("categories", selectedCategories);

    router.replace(`${pathname}?${params.toString()}`);
  }, [searchQuery, page, selectedEnvironments, selectedSources, selectedCategories, pathname, router]);

  // Update check state.
  const [updateResults, setUpdateResults] = useState<Map<string, UpdateCheckResult>>(
    new Map()
  );

  const { mutate: checkUpdates, isPending: checking } = useMutation({
    mutationFn: async () => {
      const modsToCheck = (mods ?? [])
        .filter((m) => m.versionId && !m.curseforgeManual)
        .map((m) => ({
          projectId: m.projectId,
          currentVersionId: m.versionId!,
        }));

      if (modsToCheck.length === 0) return [];

      const res = await authedFetchJson<{ results: UpdateCheckResult[] }>(
        "/api/updates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mods: modsToCheck,
            mcVersion: pack.mcVersion,
            loader: pack.loader,
          }),
        }
      );
      return res.results;
    },
    onSuccess: (results) => {
      const map = new Map<string, UpdateCheckResult>();
      for (const r of results) {
        map.set(r.projectId, r);
      }
      setUpdateResults(map);
    },
  });

  const existingProjectIds = useMemo(
    () => new Set((mods ?? []).map((m) => m.projectId)),
    [mods]
  );

  const updatesAvailable = useMemo(
    () => Array.from(updateResults.values()).filter((r) => r.hasUpdate).length,
    [updateResults]
  );


  // Local filtering logic
  const filteredMods = useMemo(() => {
    let list = mods ?? [];

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q)
      );
    }

    // 2. Side / Environment support
    if (selectedEnvironments.length > 0) {
      list = list.filter((m) => {
        const client = (m.clientSide || "unknown").toLowerCase();
        const server = (m.serverSide || "unknown").toLowerCase();
        return selectedEnvironments.every((env) => {
          if (env === "client") return client !== "unsupported";
          if (env === "server") return server !== "unsupported";
          return true;
        });
      });
    }

    // 3. Source
    if (selectedSources.length > 0) {
      list = list.filter((m) => {
        const isCF = !!m.curseforgeManual;
        const isMR = !m.curseforgeManual;
        return selectedSources.some((src) => {
          if (src === "modrinth") return isMR;
          if (src === "curseforge") return isCF;
          return false;
        });
      });
    }

    // 4. Categories
    if (selectedCategories.length > 0) {
      list = list.filter((m) => {
        if (!m.categories || !Array.isArray(m.categories)) return false;
        return selectedCategories.some((cat) => m.categories.includes(cat));
      });
    }

    return list;
  }, [mods, searchQuery, selectedEnvironments, selectedSources, selectedCategories]);

  const totalHits = filteredMods.length;
  const totalPages = Math.ceil(totalHits / pageSize);

  const paginatedMods = useMemo(() => {
    const start = page * pageSize;
    return filteredMods.slice(start, start + pageSize);
  }, [filteredMods, page, pageSize]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="font-display text-lg font-medium">Mods</h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Add Mod button */}
          {canEdit && (
            <Button
              asChild
              size="sm"
              className="cursor-pointer font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              <Link href={`/search?packId=${packId}`}>
                <Plus className="mr-1.5 size-4" />
                Add Mod
              </Link>
            </Button>
          )}

          {/* Check updates button */}
          {(mods ?? []).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkUpdates()}
              disabled={checking}
              className="cursor-pointer font-medium shadow-sm"
            >
              {checking ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              Check updates
              {updatesAvailable > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  {updatesAvailable}
                </span>
              )}
            </Button>
          )}

          {/* Export Menu */}
          {(mods ?? []).length > 0 && (
            <ExportMenu pack={pack} mods={mods || []} />
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {(!mods || mods.length === 0) ? (
        <PackModList
          mods={[]}
          canEdit={canEdit}
          packId={packId}
          isOwner={isOwner}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[260px_1fr] items-start pt-2">
          {/* Desktop Left Sidebar */}
          <aside className="hidden md:block md:sticky md:top-20">
            <ModFilters
              filters={filterObject}
              onChangeAction={handleFilterChange}
              hideVersionsAndLoaders={true}
              showSources={true}
            />
          </aside>

          {/* Right Search Input & Mod List */}
          <div className="space-y-4 min-w-0">
            {/* Search Input and mobile filters toggle button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search mods by name or summary..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border bg-background pl-9 pr-8 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary shadow-sm transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted cursor-pointer transition-colors"
                    title="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="md:hidden flex items-center justify-center gap-1.5 px-3.5 py-2 border rounded-xl bg-card hover:bg-accent text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                title="Toggle filters"
              >
                <Filter className="size-4 text-muted-foreground" />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading mods…</p>
            ) : (
              <div className="space-y-4">
                <PackModList
                  mods={paginatedMods}
                  canEdit={canEdit}
                  onRemoveAction={canEdit ? (id) => removeMod(id) : undefined}
                  removingId={typeof removingId === "string" ? removingId : null}
                  updateResults={updateResults.size > 0 ? updateResults : undefined}
                  packId={packId}
                  isOwner={isOwner}
                  profiles={profiles}
                />

                {/* Local Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <p className="text-xs text-muted-foreground">
                      Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalHits)} of {totalHits} mods
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                        className="cursor-pointer"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="cursor-pointer"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Filters sheet (overlay drawer) */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowMobileFilters(false)}
          />
          {/* Sheet content */}
          <div className="relative ml-auto flex h-full w-full max-w-xs flex-col overflow-y-auto bg-card p-6 shadow-xl border-l transition-all">
            <div className="flex items-center justify-between pb-4 border-b">
              <span className="font-semibold text-foreground">Filters</span>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="rounded-lg p-1 hover:bg-muted cursor-pointer transition-colors text-muted-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="py-4">
              <ModFilters
                filters={filterObject}
                onChangeAction={handleFilterChange}
                hideVersionsAndLoaders={true}
                showSources={true}
              />
            </div>
            <div className="mt-auto border-t pt-4">
              <Button
                onClick={() => setShowMobileFilters(false)}
                className="w-full cursor-pointer font-medium"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}


    </section>
  );
}
