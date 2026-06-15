import { LOADERS, type Loader } from "@/lib/modpacks/types";

export type LoaderOption = { value: Loader; label: string };

export const LOADER_OPTIONS: LoaderOption[] = [
  { value: "fabric", label: "Fabric" },
  { value: "forge", label: "Forge" },
  { value: "neoforge", label: "NeoForge" },
];

export const LOADER_LABELS: Record<Loader, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

export function isLoader(value: string): value is Loader {
  return (LOADERS as readonly string[]).includes(value);
}
