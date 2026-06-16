"use client";

import { useMemo, useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, Grid, List, Filter, X } from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useModSearch, type SearchFilters } from "@/lib/api/search-queries";
import { ModFilters, type ModSearchFilters, type SortIndex } from "@/components/mods/mod-filters";
import { ModCard } from "@/components/mods/mod-card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/use-auth";
import { usePackMods } from "@/lib/modpacks/mod-queries";
import { AddToPackDialog } from "@/components/mods/add-to-pack-dialog";
import type { ModView } from "@/lib/api/types";

const SORT_OPTIONS: { value: SortIndex; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "updated", label: "Updated" },
  { value: "newest", label: "Newest" },
];

const LIMIT_OPTIONS = [10, 20, 50, 100];

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const { user, signInWithGoogle } = useAuth();
  const packId = searchParams.get("packId") ?? undefined;
  const { data: existingMods } = usePackMods(packId ?? "");

  const existingProjectIds = useMemo(() => {
    return new Set((existingMods ?? []).map((m) => m.projectId));
  }, [existingMods]);

  const [activeAddMod, setActiveAddMod] = useState<ModView | null>(null);

  const handleAddClick = async (mod: ModView) => {
    if (!user) {
      try {
        await signInWithGoogle();
        setActiveAddMod(mod);
      } catch (err: any) {
        if (err?.code !== "auth/popup-closed-by-user") {
          console.error("Failed to sign in during mod add:", err);
        }
      }
    } else {
      setActiveAddMod(mod);
    }
  };
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [isHydrated, setIsHydrated] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Load view mode from localStorage on mount
  useEffect(() => {
    const savedViewMode = localStorage.getItem("search_view_mode") as "list" | "grid" | null;
    if (savedViewMode === "list" || savedViewMode === "grid") {
      setViewMode(savedViewMode);
    }
    setIsHydrated(true);
  }, []);

  // Save view mode when it changes (after mount)
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("search_view_mode", viewMode);
    }
  }, [viewMode, isHydrated]);

  // Helper to parse comma-separated URL params into lists
  const csvToArray = (param: string | null) =>
    param ? param.split(",").filter(Boolean) : [];

  // Parse initial state from URL
  const initialQuery = searchParams.get("q") ?? "";
  const initialPage = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);
  const initialSort = (searchParams.get("sort") ?? "relevance") as SortIndex;
  const initialLimit = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? "20")));
  const initialLoaders = csvToArray(searchParams.get("loaders"));
  const initialVersions = csvToArray(searchParams.get("versions"));
  const initialCategories = csvToArray(searchParams.get("categories"));
  const initialEnvironments = csvToArray(searchParams.get("environments"));
  const initialSources = csvToArray(searchParams.get("sources"));

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ModSearchFilters>({
    loaders: initialLoaders,
    versions: initialVersions,
    categories: initialCategories,
    environments: initialEnvironments,
    sources: initialSources,
    index: initialSort,
  });
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const debouncedQuery = useDebouncedValue(query, 350);
  const isMountedRef = useRef(false);

  // Reset page when search criteria changes (but not on mount)
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    setPage(0);
  }, [
    debouncedQuery,
    filters.loaders,
    filters.versions,
    filters.categories,
    filters.environments,
    filters.sources,
    filters.index,
    limit,
  ]);

  // Helper to check if two string arrays are equal
  const isArrayEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  // Synchronize URL search params to component state on mount / change
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const p = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);
    const s = (searchParams.get("sort") ?? "relevance") as SortIndex;
    const l = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? "20")));
    const loadersList = csvToArray(searchParams.get("loaders"));
    const versionsList = csvToArray(searchParams.get("versions"));
    const categoriesList = csvToArray(searchParams.get("categories"));
    const environmentsList = csvToArray(searchParams.get("environments"));
    const sourcesList = csvToArray(searchParams.get("sources"));

    setQuery((prev) => (prev === q ? prev : q));
    setPage((prev) => (prev === p ? prev : p));
    setLimit((prev) => (prev === l ? prev : l));
    setFilters((prev) => {
      const isSame =
        prev.index === s &&
        isArrayEqual(prev.loaders, loadersList) &&
        isArrayEqual(prev.versions, versionsList) &&
        isArrayEqual(prev.categories, categoriesList) &&
        isArrayEqual(prev.environments, environmentsList) &&
        isArrayEqual(prev.sources || [], sourcesList);

      if (isSame) return prev;
      return {
        loaders: loadersList,
        versions: versionsList,
        categories: categoriesList,
        environments: environmentsList,
        sources: sourcesList,
        index: s,
      };
    });
  }, [searchParams]);

  // Synchronize state back to URL query parameters
  useEffect(() => {
    if (!isHydrated) return;

    const params = new URLSearchParams(window.location.search);

    if (debouncedQuery) params.set("q", debouncedQuery);
    else params.delete("q");

    if (page > 0) params.set("page", String(page + 1));
    else params.delete("page");

    if (limit !== 20) params.set("limit", String(limit));
    else params.delete("limit");

    if (filters.index !== "relevance") params.set("sort", filters.index);
    else params.delete("sort");

    const syncArray = (key: string, list: string[]) => {
      if (list.length > 0) params.set(key, list.join(","));
      else params.delete(key);
    };

    syncArray("loaders", filters.loaders);
    syncArray("versions", filters.versions);
    syncArray("categories", filters.categories);
    syncArray("environments", filters.environments);
    syncArray("sources", filters.sources || []);

    router.replace(`${pathname}?${params.toString()}`);
  }, [debouncedQuery, page, limit, filters, pathname, router, isHydrated]);


  // Merge categories & environments to pass to the Modrinth backend query
  const searchFilters: SearchFilters = useMemo(
    () => ({
      query: debouncedQuery,
      loaders: filters.loaders,
      versions: filters.versions,
      categories: [...filters.categories, ...filters.environments],
      sources: filters.sources || [],
      sort: filters.index,
      offset: page * limit,
      limit: limit,
    }),
    [debouncedQuery, filters, page, limit]
  );

  const { data, isLoading, isError, error } = useModSearch(searchFilters);
  const results = data?.results ?? [];
  const totalHits = data?.totalHits ?? 0;
  const totalPages = Math.ceil(totalHits / limit);

  // Custom Modrinth-style pagination renderer
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: (number | string)[] = [];

    if (totalPages <= 5) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0);
      if (page > 2) {
        pages.push("...");
      }

      const start = Math.max(1, page - 1);
      const end = Math.min(totalPages - 2, page + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 3) {
        pages.push("...");
      }
      pages.push(totalPages - 1);
    }

    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="size-7 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground border bg-background border-border text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Previous page"
        >
          &lt;
        </button>
        {pages.map((p, idx) => {
          if (p === "...") {
            return (
              <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground select-none">
                ...
              </span>
            );
          }
          const pageNum = p as number;
          const active = pageNum === page;
          return (
            <button
              key={pageNum}
              onClick={() => setPage(pageNum)}
              className={cn(
                "size-7 rounded-full flex items-center justify-center text-xs font-semibold cursor-pointer transition-colors border",
                active
                  ? "bg-primary text-primary-foreground font-bold border-primary"
                  : "hover:bg-accent hover:text-accent-foreground bg-background border-border"
              )}
            >
              {pageNum + 1}
            </button>
          );
        })}
        <button
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="size-7 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground border bg-background border-border text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Next page"
        >
          &gt;
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Redesigned Search Layout */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr] items-start">
        {/* Desktop Left Filters Sidebar */}
        <aside className="hidden md:block md:sticky md:top-20">
          <ModFilters filters={filters} onChangeAction={setFilters} showSources={true} />
        </aside>

        {/* Right Search Results Column */}
        <div className="space-y-4 min-w-0">
          {/* Top Search & Filter Bar */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for mods..."
                  className="w-full rounded-xl border bg-card py-2.5 pl-10 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="md:hidden flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:px-4 border rounded-xl bg-card hover:bg-accent text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                title="Toggle filters"
              >
                <Filter className="size-4 text-muted-foreground" />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>

            {/* Sort & Pagination Control Strip */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-2 border sm:p-2.5 rounded-xl shadow-sm text-xs font-semibold text-foreground/80">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto">
                {/* Sort selector */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground font-medium hidden sm:inline">Sort by:</span>
                  <select
                    value={filters.index}
                    onChange={(e) => setFilters({ ...filters, index: e.target.value as SortIndex })}
                    className="rounded-md border bg-background px-2 py-1 text-xs focus-visible:outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Limit page size selector */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground font-medium hidden sm:inline">View:</span>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="rounded-md border bg-background px-2 py-1 text-xs focus-visible:outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {LIMIT_OPTIONS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                {/* View layout icons (Aesthetic) */}
                <div className="flex items-center gap-1 sm:border-l sm:pl-3 border-border">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors cursor-pointer",
                      viewMode === "list" ? "text-primary" : "text-muted-foreground"
                    )}
                    aria-label="List view"
                  >
                    <List className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors cursor-pointer",
                      viewMode === "grid" ? "text-primary" : "text-muted-foreground"
                    )}
                    aria-label="Grid view"
                  >
                    <Grid className="size-4" />
                  </button>
                </div>
              </div>

              {/* Top Pagination */}
              <div className="w-full sm:w-auto flex justify-center sm:justify-end">
                {renderPagination()}
              </div>
            </div>
          </div>

          {/* Results List */}
          <section className="space-y-4 pt-1">
            {isLoading && (
              <div className="flex items-center justify-center p-12">
                <p className="text-sm text-muted-foreground animate-pulse">Searching the catalog...</p>
              </div>
            )}

            {isError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-4 rounded-xl">
                Search failed: {(error as Error)?.message}
              </p>
            )}

            {!isLoading && !isError && results.length === 0 && (
              <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                No mods match your search criteria. Try removing some filters.
              </div>
            )}

            {!isLoading && !isError && results.length > 0 && (
              <div className="space-y-5">
                <div
                  className={cn(
                    "grid gap-3",
                    viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
                  )}
                >
                  {results.map((mod) => (
                    <ModCard
                      key={mod.id}
                      mod={mod}
                      onAddAction={handleAddClick}
                      added={packId ? existingProjectIds.has(mod.id) : false}
                      viewMode={viewMode}
                    />
                  ))}
                </div>

                {/* Bottom Pagination Control */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t pt-5">
                    <p className="text-xs text-muted-foreground font-medium text-center sm:text-left">
                      Showing {page * limit + 1}–{Math.min((page + 1) * limit, totalHits)} of {totalHits} results
                    </p>
                    <div className="flex justify-center">
                      {renderPagination()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      {activeAddMod && (
        <AddToPackDialog
          mod={activeAddMod}
          initialPackId={packId}
          onCloseAction={() => setActiveAddMod(null)}
        />
      )}

      {/* Mobile Filters Overlay Dialog */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm md:hidden">
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-lg flex flex-col min-h-0 pointer-events-auto">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="font-semibold text-lg text-foreground">Filters</h3>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="rounded-md p-1.5 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                aria-label="Close filters"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <ModFilters filters={filters} onChangeAction={setFilters} showSources={true} />
            </div>
            <div className="mt-6 shrink-0 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-colors cursor-pointer text-sm"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground animate-pulse">Loading search...</p>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
