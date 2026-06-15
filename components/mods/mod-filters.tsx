"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Search, SlidersHorizontal } from "lucide-react";
import { useMinecraftVersions } from "@/lib/minecraft/versions";
import { cn } from "@/lib/utils";

export type SortIndex = "relevance" | "downloads" | "newest" | "updated";

export type ModSearchFilters = {
  loaders: string[];
  versions: string[];
  categories: string[];
  environments: string[];
  sources?: string[];
  index: SortIndex;
};

// Curated list of major/most common Minecraft versions
const MAJOR_VERSIONS = ["1.21.1", "1.21", "1.20.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"];

const LOADER_OPTIONS = [
  { value: "fabric", label: "Fabric" },
  { value: "forge", label: "Forge" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
];

const ENVIRONMENT_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "server", label: "Server" },
];

const CATEGORY_OPTIONS = [
  { value: "adventure", label: "Adventure" },
  { value: "cursed", label: "Cursed" },
  { value: "decoration", label: "Decoration" },
  { value: "economy", label: "Economy" },
  { value: "equipment", label: "Equipment" },
  { value: "food", label: "Food" },
  { value: "game-mechanics", label: "Game Mechanics" },
  { value: "library", label: "Library" },
  { value: "magic", label: "Magic" },
  { value: "management", label: "Management" },
  { value: "minigame", label: "Minigame" },
  { value: "mobs", label: "Mobs" },
  { value: "optimization", label: "Optimization" },
  { value: "social", label: "Social" },
  { value: "storage", label: "Storage" },
  { value: "technology", label: "Technology" },
  { value: "transportation", label: "Transportation" },
  { value: "utility", label: "Utility" },
  { value: "worldgen", label: "World Generation" },
];

export function ModFilters({
  filters,
  onChangeAction,
  hideVersionsAndLoaders = false,
  showSources = false,
}: {
  filters: ModSearchFilters;
  onChangeAction: (next: ModSearchFilters) => void;
  hideVersionsAndLoaders?: boolean;
  showSources?: boolean;
}) {
  const { versions: allVersions, loading: loadingVersions } = useMinecraftVersions();

  // Collapsible section states
  const [expandVersions, setExpandVersions] = useState(true);
  const [expandLoaders, setExpandLoaders] = useState(true);
  const [expandCategories, setExpandCategories] = useState(true);
  const [expandEnvironments, setExpandEnvironments] = useState(true);
  const [expandSources, setExpandSources] = useState(true);

  // Version search and show all toggle states
  const [versionSearch, setVersionSearch] = useState("");
  const [showAllVersions, setShowAllVersions] = useState(false);

  // Computed version list based on search and "show all" toggle
  const filteredVersions = useMemo(() => {
    const sourceList = showAllVersions ? allVersions : MAJOR_VERSIONS;
    if (!versionSearch.trim()) return sourceList;
    const term = versionSearch.toLowerCase();
    return allVersions.filter((v) => v.toLowerCase().includes(term));
  }, [allVersions, showAllVersions, versionSearch]);

  const toggleFilter = (
    key: "loaders" | "versions" | "categories" | "environments" | "sources",
    value: string
  ) => {
    const list = filters[key] || [];
    const has = list.includes(value);
    const updated = has ? list.filter((v) => v !== value) : [...list, value];
    onChangeAction({
      ...filters,
      [key]: updated,
    });
  };

  const clearFilters = () => {
    onChangeAction({
      loaders: [],
      versions: [],
      categories: [],
      environments: [],
      sources: [],
      index: filters.index,
    });
  };

  const activeCount =
    (hideVersionsAndLoaders ? 0 : (filters.loaders?.length ?? 0) + (filters.versions?.length ?? 0)) +
    (filters.categories?.length ?? 0) +
    (filters.environments?.length ?? 0) +
    (showSources ? (filters.sources?.length ?? 0) : 0);

  return (
    <div className="w-full space-y-4">
      {/* Title & Clear Filters Button */}
      <div className="flex items-center justify-between border-b pb-3">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-1.5 text-foreground/90">
          <SlidersHorizontal className="size-4 text-primary" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
              {activeCount}
            </span>
          )}
        </h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      {/* 1. Game Version Section */}
      {!hideVersionsAndLoaders && (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandVersions(!expandVersions)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors border-b font-medium text-xs text-foreground/90 cursor-pointer"
          >
            Game version
            {expandVersions ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {expandVersions && (
            <div className="p-3.5 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={versionSearch}
                  onChange={(e) => setVersionSearch(e.target.value)}
                  className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-muted">
                {loadingVersions && filteredVersions.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">Loading versions...</p>
                ) : filteredVersions.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">No matching versions</p>
                ) : (
                  filteredVersions.map((v) => {
                    const checked = filters.versions.includes(v);
                    return (
                      <label key={v} className="flex items-center gap-2 text-xs font-medium cursor-pointer text-foreground/80 hover:text-foreground select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFilter("versions", v)}
                          className="rounded border-gray-300 text-primary focus:ring-primary size-3.5 cursor-pointer"
                        />
                        {v}
                      </label>
                    );
                  })
                )}
              </div>

              {!versionSearch && (
                <label className="flex items-center gap-2 text-xs font-semibold border-t pt-2 mt-1 cursor-pointer text-foreground/90 select-none">
                  <input
                    type="checkbox"
                    checked={showAllVersions}
                    onChange={(e) => setShowAllVersions(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary size-3.5 cursor-pointer"
                  />
                  Show all versions
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Loader Section */}
      {!hideVersionsAndLoaders && (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandLoaders(!expandLoaders)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors border-b font-medium text-xs text-foreground/90 cursor-pointer"
          >
            Loader
            {expandLoaders ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {expandLoaders && (
            <div className="p-3.5 space-y-2">
              {LOADER_OPTIONS.map((opt) => {
                const checked = filters.loaders.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2 text-xs font-medium cursor-pointer text-foreground/80 hover:text-foreground select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFilter("loaders", opt.value)}
                      className="rounded border-gray-300 text-primary focus:ring-primary size-3.5 cursor-pointer"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Source Section */}
      {showSources && (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandSources(!expandSources)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors border-b font-medium text-xs text-foreground/90 cursor-pointer"
          >
            Source
            {expandSources ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {expandSources && (
            <div className="p-3.5 space-y-2">
              {[
                { value: "modrinth", label: "Modrinth" },
                { value: "curseforge", label: "CurseForge" },
              ].map((opt) => {
                const checked = (filters.sources || []).includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2 text-xs font-medium cursor-pointer text-foreground/80 hover:text-foreground select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFilter("sources", opt.value)}
                      className="rounded border-gray-300 text-primary focus:ring-primary size-3.5 cursor-pointer"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Category Section */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandCategories(!expandCategories)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors border-b font-medium text-xs text-foreground/90 cursor-pointer"
        >
          Category
          {expandCategories ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {expandCategories && (
          <div className="p-3.5 max-h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-muted">
            {CATEGORY_OPTIONS.map((opt) => {
              const checked = filters.categories.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 text-xs font-medium cursor-pointer text-foreground/80 hover:text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFilter("categories", opt.value)}
                    className="rounded border-gray-300 text-primary focus:ring-primary size-3.5 cursor-pointer"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Environment Section */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandEnvironments(!expandEnvironments)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors border-b font-medium text-xs text-foreground/90 cursor-pointer"
        >
          Environment
          {expandEnvironments ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {expandEnvironments && (
          <div className="p-3.5 space-y-2">
            {ENVIRONMENT_OPTIONS.map((opt) => {
              const checked = filters.environments.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 text-xs font-medium cursor-pointer text-foreground/80 hover:text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFilter("environments", opt.value)}
                    className="rounded border-gray-300 text-primary focus:ring-primary size-3.5 cursor-pointer"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
