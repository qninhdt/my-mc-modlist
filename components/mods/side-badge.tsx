import { cn } from "@/lib/utils";
import type { SideSupport } from "@/lib/api/types";

const LABELS: Record<SideSupport, string> = {
  required: "Required",
  optional: "Optional",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

const STYLES: Record<SideSupport, string> = {
  required: "bg-primary/15 text-primary",
  optional: "bg-secondary text-secondary-foreground",
  unsupported: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
};

// Shows how a mod runs on one side (client or server): required / optional /
// unsupported / unknown. CF-only mods are "unknown" until resolved in P6.
export function SideBadge({
  side,
  value,
}: {
  side: "Client" | "Server";
  value: SideSupport;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
        STYLES[value]
      )}
    >
      {side}: {LABELS[value]}
    </span>
  );
}

// Renders both side badges together — the common case (mod card + detail header).
export function SideBadges({
  clientSide,
  serverSide,
}: {
  clientSide: SideSupport;
  serverSide: SideSupport;
}) {
  return (
    <>
      <SideBadge side="Client" value={clientSide} />
      <SideBadge side="Server" value={serverSide} />
    </>
  );
}
