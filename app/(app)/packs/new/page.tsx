"use client";

import { useRouter } from "next/navigation";
import { useCreatePack } from "@/lib/modpacks/queries";
import { PackForm } from "@/components/modpacks/pack-form";
import type { CreatePackInput } from "@/lib/modpacks/types";

export default function NewPackPage() {
  const router = useRouter();
  const { mutate, isPending, error } = useCreatePack();

  function handleCreate(input: CreatePackInput) {
    mutate(input, {
      onSuccess: (packId) => router.push(`/packs/${packId}`),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">New Modpack</h1>
      <PackForm
        submitLabel="Create pack"
        pending={isPending}
        error={error?.message ?? null}
        onSubmitAction={handleCreate}
      />
    </div>
  );
}
