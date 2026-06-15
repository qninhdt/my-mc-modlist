import { z } from "zod";

// A mod added to a pack: modpacks/{packId}/mods/{modId}. Stores the normalized
// project reference + display metadata snapshot so the pack mod list renders
// without re-hitting upstream. The pinned download version is resolved in P4;
// addedByUid drives activity attribution in P8.
export const packModSchema = z.object({
  id: z.string().min(1),
  // Modrinth project id, or "cf:<curseId>" for a CurseForge-only mod (P6 manual).
  projectId: z.string().min(1),
  slug: z.string().default(""),
  name: z.string().min(1),
  summary: z.string().default(""),
  iconUrl: z.string().nullable().default(null),
  categories: z.array(z.string()).default([]),
  clientSide: z.string().default("unknown"),
  serverSide: z.string().default("unknown"),
  // True when the mod has no Modrinth project → resolved via the P6 manual flow.
  curseforgeManual: z.boolean().default(false),
  addedByUid: z.string().min(1),
  addedAt: z.unknown().optional(),
  viaDependency: z.boolean().default(false),
  // P4 version pin: resolved by the version resolver. These are null until
  // resolution runs (or for CF-manual mods that skip Modrinth resolution).
  versionId: z.string().nullable().default(null),
  fileName: z.string().nullable().default(null),
  downloadUrl: z.string().nullable().default(null),
  sha1: z.string().nullable().default(null),
  sha512: z.string().nullable().default(null),
  // P4 dependency edges: project IDs of required deps auto-added for this mod.
  // Stored for display/traceability; the actual dep mods are separate docs.
  deps: z.array(z.string()).default([]),
  // P6 manual upload fields
  storagePath: z.string().nullable().default(null),
  fileSize: z.number().nullable().default(null),
  uploadedByUid: z.string().nullable().default(null),
  uploadedAt: z.unknown().optional(),
  createdAt: z.unknown().optional(),
});

export type PackMod = z.infer<typeof packModSchema>;

// Input the add-to-pack action accepts (built from a ModView on the client).
export const addPackModInputSchema = z.object({
  projectId: z.string().min(1),
  slug: z.string().default(""),
  name: z.string().min(1),
  summary: z.string().default(""),
  iconUrl: z.string().nullable().default(null),
  categories: z.array(z.string()).default([]),
  clientSide: z.string().default("unknown"),
  serverSide: z.string().default("unknown"),
  curseforgeManual: z.boolean().default(false),
});

export type AddPackModInput = z.infer<typeof addPackModInputSchema>;
