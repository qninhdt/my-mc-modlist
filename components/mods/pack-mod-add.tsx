"use client";

import { useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useModSearch, type SearchFilters } from "@/lib/api/search-queries";
import { useResolveMod, useAddPackModResolved, type ResolveResult } from "@/lib/modpacks/mod-queries";
import { ModCard } from "@/components/mods/mod-card";
import { DependencyDialog } from "@/components/mods/dependency-dialog";
import type { ModView } from "@/lib/api/types";
import type { Loader } from "@/lib/modpacks/types";
import type { ResolvedModEntry } from "@/lib/modpacks/mod-repository";

// Inline mod search scoped to a pack: the query is debounced and results are
// pre-filtered to the pack's loader + MC version (Modrinth facets) so an "Add"
// only surfaces mods compatible with this pack. On add, version resolution runs
// server-side, then a DependencyDialog shows the result before committing.
export function PackModAdd({
  packId,
  loader,
  mcVersion,
  existingProjectIds,
}: {
  packId: string;
  loader: Loader;
  mcVersion: string;
  existingProjectIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const { mutate: resolve, isPending: resolving } = useResolveMod();
  const { mutate: addResolved, isPending: committing } = useAddPackModResolved(packId);

  // The mod currently being resolved (for spinner on the right card).
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Resolution result for the DependencyDialog.
  const [pendingAdd, setPendingAdd] = useState<{
    mod: ModView;
    result: ResolveResult;
  } | null>(null);

  const filters: SearchFilters = useMemo(
    () => ({
      query: debouncedQuery,
      loaders: [loader],
      versions: [mcVersion],
      categories: [],
      sort: "relevance",
    }),
    [debouncedQuery, loader, mcVersion]
  );

  const { data, isLoading } = useModSearch(filters);
  const results = data?.results ?? [];

  function handleAdd(mod: ModView) {
    setResolvingId(mod.id);
    resolve(
      {
        projectId: mod.id,
        mcVersion,
        loader,
        existingProjectIds: Array.from(existingProjectIds),
      },
      {
        onSuccess: (result) => {
          setResolvingId(null);
          if (result.resolved) {
            setPendingAdd({ mod, result });
          }
        },
        onError: () => {
          setResolvingId(null);
        },
      }
    );
  }

  function handleConfirm() {
    if (!pendingAdd?.result.resolved) return;
    const { mod, result } = pendingAdd;

    // Build entries for the root mod + all auto-added deps.
    const entries: ResolvedModEntry[] = [];

    // Root mod entry.
    entries.push({
      input: {
        projectId: mod.id,
        slug: mod.sources.modrinth?.slug ?? "",
        name: mod.name,
        summary: mod.summary,
        iconUrl: mod.iconUrl,
        categories: mod.tags || [],
        clientSide: mod.clientSide,
        serverSide: mod.serverSide,
        curseforgeManual: mod.curseforgeManual,
      },
      versionPin: {
        versionId: result.resolved!.versionId,
        fileName: result.resolved!.file.filename,
        downloadUrl: result.resolved!.file.url,
        sha1: result.resolved!.file.sha1,
        sha512: result.resolved!.file.sha512,
        deps: result.deps.added.map((d) => d.projectId),
      },
    });

    // Dependency entries.
    for (const dep of result.deps.added) {
      const info = result.depProjectInfos[dep.projectId];
      entries.push({
        input: {
          projectId: dep.projectId,
          slug: info?.slug ?? "",
          name: info?.name ?? dep.projectId,
          summary: "",
          iconUrl: info?.iconUrl ?? null,
          categories: [],
          clientSide: info?.clientSide ?? "unknown",
          serverSide: info?.serverSide ?? "unknown",
          curseforgeManual: false,
        },
        versionPin: {
          versionId: dep.versionId,
          fileName: dep.file.filename,
          downloadUrl: dep.file.url,
          sha1: dep.file.sha1,
          sha512: dep.file.sha512,
          deps: [],
        },
        viaDependency: true,
      });
    }

    addResolved(entries, {
      onSuccess: () => setPendingAdd(null),
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search mods for ${loader} ${mcVersion}…`}
          className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Searching…</p>
      )}

      {!isLoading && debouncedQuery && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No mods match for this loader and version.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid gap-3">
          {results.map((mod) => (
            <ModCard
              key={mod.id}
              mod={mod}
              onAddAction={handleAdd}
              adding={(resolving && resolvingId === mod.id) || false}
              added={existingProjectIds.has(mod.id)}
            />
          ))}
        </div>
      )}

      {/* Resolving spinner overlay */}
      {resolving && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Resolving version and dependencies…
        </div>
      )}

      {/* Dependency dialog */}
      {pendingAdd?.result.resolved && (
        <DependencyDialog
          modName={pendingAdd.mod.name}
          resolved={pendingAdd.result.resolved}
          deps={pendingAdd.result.deps}
          depProjectInfos={pendingAdd.result.depProjectInfos}
          onConfirmAction={handleConfirm}
          onCancelAction={() => setPendingAdd(null)}
          confirming={committing}
        />
      )}
    </div>
  );
}
