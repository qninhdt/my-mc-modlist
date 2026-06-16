"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import { makeActor } from "@/lib/activity/log";
import {
  addPackMod,
  addPackModsResolved,
  listPackMods,
  removePackMod,
  updatePackMod,
  type ResolvedModEntry,
} from "./mod-repository";
import type { AddPackModInput, PackMod } from "./mod-types";
import { authedFetchJson } from "@/lib/api/authed-fetch";
import type { ResolvedVersion, DependencyResolutionResult } from "@/lib/resolve/types";

const packModsKey = (packId: string) => ["pack-mods", packId] as const;
const packKey = (packId: string) => ["pack", packId] as const;

export function usePackMods(packId: string) {
  return useQuery({
    queryKey: packModsKey(packId),
    queryFn: () => listPackMods(packId),
    enabled: !!packId,
  });
}

export function useAddPackMod(packId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPackModInput) => {
      if (!user) throw new Error("Not authenticated");
      return addPackMod(packId, input, makeActor(user));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packModsKey(packId) });
      qc.invalidateQueries({ queryKey: packKey(packId) });
    },
  });
}

// Resolves a mod's version + deps via the server-side resolve endpoint.
export type ResolveResult = {
  resolved: ResolvedVersion | null;
  deps: DependencyResolutionResult;
  depProjectInfos: Record<
    string,
    {
      name: string;
      slug: string;
      iconUrl: string | null;
      clientSide: string;
      serverSide: string;
    }
  >;
  error?: string;
};

export function useResolveMod() {
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      mcVersion: string;
      loader: string;
      existingProjectIds: string[];
      versionId?: string;
    }): Promise<ResolveResult> => {
      return authedFetchJson<ResolveResult>("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    },
  });
}

// Batch-adds the root mod + all its resolved deps in one operation.
export function useAddPackModResolved(packId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: ResolvedModEntry[]) => {
      if (!user) throw new Error("Not authenticated");
      return addPackModsResolved(packId, entries, makeActor(user));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packModsKey(packId) });
      qc.invalidateQueries({ queryKey: packKey(packId) });
    },
  });
}

export function useRemovePackMod(packId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modId: string) => {
      if (!user) throw new Error("Not authenticated");
      return removePackMod(packId, modId, makeActor(user));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packModsKey(packId) });
      qc.invalidateQueries({ queryKey: packKey(packId) });
    },
  });
}

export function useUpdatePackMod(packId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modId, data }: { modId: string; data: Partial<PackMod> }) => {
      if (!user) throw new Error("Not authenticated");
      return updatePackMod(packId, modId, data, makeActor(user));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packModsKey(packId) });
      qc.invalidateQueries({ queryKey: packKey(packId) });
    },
  });
}

import { deleteJarAndResetMod } from "@/lib/storage/jar-upload";

export function useDeleteManualJar(packId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modId, storagePath }: { modId: string; storagePath: string }) => {
      if (!user) throw new Error("Not authenticated");
      return deleteJarAndResetMod(packId, modId, storagePath, makeActor(user));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packModsKey(packId) });
      qc.invalidateQueries({ queryKey: packKey(packId) });
    },
  });
}
