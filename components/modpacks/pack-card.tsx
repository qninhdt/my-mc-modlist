import Link from "next/link";
import type { Modpack } from "@/lib/modpacks/types";
import { LOADER_LABELS } from "@/lib/minecraft/loaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/use-auth";
import { Shield, ShieldCheck } from "lucide-react";

export function PackCard({ pack }: { pack: Modpack }) {
  const { user } = useAuth();
  const isOwner = user ? pack.ownerUid === user.uid : false;
  const role = user ? pack.members[user.uid] : null;

  return (
    <Link href={`/packs/${pack.id}`} className="block">
      <Card className="h-full transition-colors hover:border-primary flex flex-col justify-between">
        <div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="truncate text-base font-semibold max-w-[70%]">
              {pack.name}
            </CardTitle>
            {user && (
              <div className="shrink-0">
                {isOwner ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <ShieldCheck className="size-3" /> Owner
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                    <Shield className="size-3" /> {role === "editor" ? "Editor" : "Viewer"}
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {pack.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {pack.description}
              </p>
            )}
          </CardContent>
        </div>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              MC {pack.mcVersion}
            </span>
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {LOADER_LABELS[pack.loader]}
            </span>
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {pack.modCount} {pack.modCount === 1 ? "mod" : "mods"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
