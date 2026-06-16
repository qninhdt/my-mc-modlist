"use client";

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useModDetail } from "@/lib/api/search-queries";
import { ModDetail } from "@/components/mods/mod-detail";

// Full mod-detail view. Pulls the merged Modrinth + ModpackIndex (CF badge) ModView
// from the cache-mirrored /api/mod/[id] route.
export default function ModDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const packId = searchParams.get("packId");
  const { data, isLoading, isError, error } = useModDetail(id, packId);

  const handleBack = () => {
    if (packId) {
      router.push(`/packs/${packId}`);
    } else {
      router.back();
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none p-0 text-left font-medium"
      >
        <ArrowLeft className="size-4" />
        {packId ? "Back to modpack" : "Back"}
      </button>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading mod…</p>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          Failed to load mod: {(error as Error)?.message}
        </p>
      )}

      {data?.mod && <ModDetail mod={data.mod} />}
    </div>
  );
}
