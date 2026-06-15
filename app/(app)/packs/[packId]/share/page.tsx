"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { useModpack } from "@/lib/modpacks/queries";
import { SharePanel } from "@/components/sharing/share-panel";

export default function PackSharePage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = use(params);
  const { data: pack, isLoading, error } = useModpack(packId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-6">Loading pack details…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive p-6">
        Failed to load pack: {error.message}
      </p>
    );
  }

  if (!pack) {
    return (
      <p className="text-sm text-muted-foreground p-6">
        Pack not found, or you don&apos;t have access.
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-2">
      <Link
        href={`/packs/${packId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="size-4" />
        Back to pack details
      </Link>

      <div className="border-b pb-4">
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <Users className="size-6 text-primary" />
          Share Modpack
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage access for <span className="font-semibold text-foreground">{pack.name}</span>
        </p>
      </div>

      <SharePanel pack={pack} />
    </div>
  );
}
