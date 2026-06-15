"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import { listInvitesForEmail } from "@/lib/sharing/invites";
import {
  createPack,
  deletePack,
  getPack,
  listPacks,
  updatePack,
} from "./repository";
import type { CreatePackInput, Modpack, UpdatePackInput } from "./types";

const packsKey = (uid: string | null) => ["packs", uid] as const;
const packKey = (packId: string) => ["pack", packId] as const;

export function useModpacks() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  return useQuery({
    queryKey: packsKey(uid),
    queryFn: () => listPacks(uid as string),
    enabled: !!uid,
  });
}

export function usePendingInvites() {
  const { user } = useAuth();
  const email = user?.email ?? null;
  return useQuery({
    queryKey: ["pending-invites", email],
    queryFn: () => listInvitesForEmail(email as string),
    enabled: !!email,
  });
}

export function useModpack(packId: string) {
  return useQuery({
    queryKey: packKey(packId),
    queryFn: () => getPack(packId),
    enabled: !!packId,
  });
}

export function useCreatePack() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePackInput) => {
      if (!user?.email) throw new Error("Not authenticated");
      return createPack(input, { uid: user.uid, email: user.email });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packsKey(user?.uid ?? null) });
    },
  });
}

export function useUpdatePack(packId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePackInput) => updatePack(packId, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: packKey(packId) });
      const prev = qc.getQueryData<Modpack | null>(packKey(packId));
      if (prev) qc.setQueryData(packKey(packId), { ...prev, ...input });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(packKey(packId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: packKey(packId) });
      qc.invalidateQueries({ queryKey: packsKey(user?.uid ?? null) });
    },
  });
}

export function useDeletePack() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packId: string) => deletePack(packId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packsKey(user?.uid ?? null) });
    },
  });
}
