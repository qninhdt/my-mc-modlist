"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOADERS, type CreatePackInput, type Loader } from "@/lib/modpacks/types";
import { LOADER_LABELS } from "@/lib/minecraft/loaders";
import { useMinecraftVersions } from "@/lib/minecraft/versions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  initial?: Partial<CreatePackInput>;
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmitAction: (input: CreatePackInput) => void;
};

export function PackForm({ initial, submitLabel, pending, error, onSubmitAction }: Props) {
  const router = useRouter();
  const { versions, loading: versionsLoading } = useMinecraftVersions();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mcVersion, setMcVersion] = useState(initial?.mcVersion ?? "");
  const [loader, setLoader] = useState<Loader>(initial?.loader ?? "fabric");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setLocalError(null);
    if (!name.trim()) return setLocalError("Name is required");
    if (!mcVersion) return setLocalError("Pick a Minecraft version");
    onSubmitAction({ name: name.trim(), description: description.trim(), mcVersion, loader });
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{submitLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Pack name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="My Awesome Pack"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="What's this pack for?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="mcVersion" className="text-sm font-medium">
                Minecraft version
              </label>
              <select
                id="mcVersion"
                value={mcVersion}
                onChange={(e) => setMcVersion(e.target.value)}
                disabled={versionsLoading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{versionsLoading ? "Loading…" : "Select"}</option>
                {versions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="loader" className="text-sm font-medium">
                Mod loader
              </label>
              <select
                id="loader"
                value={loader}
                onChange={(e) => setLoader(e.target.value as Loader)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {LOADERS.map((l) => (
                  <option key={l} value={l}>
                    {LOADER_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(localError || error) && (
            <p className="text-sm text-destructive">{localError || error}</p>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
