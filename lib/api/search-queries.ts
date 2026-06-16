"use client";

import { useQuery } from "@tanstack/react-query";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import type { ModView, ModrinthVersion } from "@/lib/api/types";

export type SearchSort = "relevance" | "downloads" | "updated" | "newest";

export type SearchFilters = {
  query: string;
  loaders: string[];
  versions: string[];
  categories: string[];
  sources?: string[];
  sort: SearchSort;
  offset?: number;
  limit?: number;
};

export type SearchResponse = {
  results: ModView[];
  offset: number;
  limit: number;
  totalHits: number;
};

function buildSearchUrl(filters: SearchFilters): string {
  const qs = new URLSearchParams();
  if (filters.query) qs.set("q", filters.query);
  if (filters.loaders.length) qs.set("loaders", filters.loaders.join(","));
  if (filters.versions.length) qs.set("versions", filters.versions.join(","));
  if (filters.categories.length) qs.set("categories", filters.categories.join(","));
  if (filters.sources?.length) qs.set("sources", filters.sources.join(","));
  qs.set("index", filters.sort);
  if (filters.offset !== undefined) qs.set("offset", String(filters.offset));
  if (filters.limit !== undefined) qs.set("limit", String(filters.limit));
  return `/api/search?${qs.toString()}`;
}

// Searches mods via the server route (Modrinth-backed, cache-mirrored). Run
// unconditionally so we load default results even when search criteria is empty.
export function useModSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: ["mod-search", filters],
    queryFn: () => authedFetchJson<SearchResponse>(buildSearchUrl(filters)),
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useModDetail(modId: string, packId?: string | null) {
  return useQuery({
    queryKey: ["mod-detail", modId, packId],
    queryFn: () => {
      const url = packId
        ? `/api/mod/${encodeURIComponent(modId)}?packId=${encodeURIComponent(packId)}`
        : `/api/mod/${encodeURIComponent(modId)}`;
      return authedFetchJson<{ mod: ModView }>(url);
    },
    enabled: !!modId,
  });
}

export function useModVersions(modId: string) {
  return useQuery({
    queryKey: ["mod-versions", modId],
    queryFn: () =>
      authedFetchJson<{ versions: ModrinthVersion[] }>(`/api/mod/${encodeURIComponent(modId)}/versions`),
    enabled: !!modId,
  });
}
