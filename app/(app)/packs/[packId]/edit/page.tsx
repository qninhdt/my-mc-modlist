"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useModpack, useUpdatePack } from "@/lib/modpacks/queries";
import { PackForm } from "@/components/modpacks/pack-form";
import type { CreatePackInput } from "@/lib/modpacks/types";

export default function EditPackPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = use(params);
  const router = useRouter();
  const { data: pack, isLoading } = useModpack(packId);
  const { mutate, isPending, error } = useUpdatePack(packId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading pack…</p>;
  }

  if (!pack) {
    return (
      <p className="text-sm text-muted-foreground">
        Pack not found, or you don&apos;t have access.
      </p>
    );
  }

  function handleSubmit(input: CreatePackInput) {
    mutate(input, { onSuccess: () => router.push(`/packs/${packId}`) });
  }

  return (
    <PackForm
      initial={pack}
      submitLabel="Save changes"
      pending={isPending}
      error={error?.message ?? null}
      onSubmitAction={handleSubmit}
    />
  );
}
