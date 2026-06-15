import type { PackMod } from "@/lib/modpacks/mod-types";
import type { ExportTarget } from "./types";

/**
 * Filter the list of mods based on the target export environment.
 *
 * Requirements:
 * - A mod can be required on BOTH sides.
 * - Server set = mods where `serverSide !== "unsupported"`
 * - Client set = mods where `clientSide !== "unsupported"`
 * - Singleplayer = full set (all mods)
 * - Mods with unknown side (e.g. "unknown" or empty) should be included.
 */
export function filterModsByTarget(mods: PackMod[], target: ExportTarget): PackMod[] {
  if (target === "singleplayer") {
    return mods;
  }

  return mods.filter((mod) => {
    const serverSide = (mod.serverSide || "unknown").toLowerCase();
    const clientSide = (mod.clientSide || "unknown").toLowerCase();

    if (target === "server") {
      return serverSide !== "unsupported";
    }

    if (target === "client") {
      return clientSide !== "unsupported";
    }

    return true;
  });
}
