"use client";

import { ArrowUp } from "lucide-react";

// Simple badge indicating a newer version is available for a mod.
// Displayed inline in the pack mod list row.
export function UpdateBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      <ArrowUp className="size-3" />
      Update
    </span>
  );
}
