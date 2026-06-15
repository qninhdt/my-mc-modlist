"use client";

import { useQuery } from "@tanstack/react-query";
import { authedFetchJson } from "@/lib/api/authed-fetch";

const CACHE_KEY = "mc-game-versions-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — release list changes rarely

type VersionsCache = {
  fetchedAt: number;
  versions: string[];
};

// Release MC versions, newest first. Sourced from the server route (which proxies
// Modrinth with the required User-Agent) and cached in localStorage for a day.
export async function getGameVersions(): Promise<string[]> {
  const cached = readCache();
  if (cached) return cached;

  const data = await authedFetchJson<{ versions: string[] }>(
    "/api/minecraft/versions"
  );
  writeCache(data.versions);
  return data.versions;
}

function readCache(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VersionsCache;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.versions;
  } catch {
    return null;
  }
}

function writeCache(versions: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: VersionsCache = { fetchedAt: Date.now(), versions };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // storage full / disabled — non-fatal, just skip caching
  }
}

// react-query wrapper over getGameVersions for use in components.
export function useMinecraftVersions() {
  const query = useQuery({
    queryKey: ["mc-game-versions"],
    queryFn: getGameVersions,
    staleTime: CACHE_TTL_MS,
  });
  return {
    versions: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
  };
}
