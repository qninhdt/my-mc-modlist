import { z } from "zod";

export const LOADERS = ["fabric", "forge", "neoforge"] as const;
export type Loader = (typeof LOADERS)[number];

// Firestore modpack document shape. ownerUid/members/memberUids/memberEmails are
// ACL fields: mutated only through the dedicated sharing path (P7), never via
// updatePack.
//
// memberUids exists so the pack-list query (array-contains current uid) can align
// with the security rule's read authorization field. Firestore evaluates list
// queries against rules without filtering: a query is allowed only when its filter
// field matches the field the read rule authorizes on. memberEmails (used for
// invite-by-email matching) cannot serve that role because the authenticated
// identity is the uid, not the email; memberUids carries the uid so query and rule
// agree. members (uid -> role) drives role checks; memberEmails drives invite
// matching; memberUids drives list-query authorization. All three stay in sync
// through the single ACL write path.
export const modpackSchema = z.object({
  id: z.string().min(1),
  ownerUid: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  mcVersion: z.string().min(1),
  loader: z.enum(LOADERS),
  members: z.record(z.string(), z.enum(["editor", "viewer"])),
  memberUids: z.array(z.string()),
  memberEmails: z.array(z.string()),
  modCount: z.number().int().nonnegative().default(0),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export type Modpack = z.infer<typeof modpackSchema>;

// Input accepted from the create form.
export const createPackInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(2000).default(""),
  mcVersion: z.string().min(1, "Pick a Minecraft version"),
  loader: z.enum(LOADERS),
});
export type CreatePackInput = z.infer<typeof createPackInputSchema>;

// Editable pack meta — ACL fields are intentionally absent so they can never be
// touched through the generic update path.
export const updatePackInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  mcVersion: z.string().min(1).optional(),
  loader: z.enum(LOADERS).optional(),
});
export type UpdatePackInput = z.infer<typeof updatePackInputSchema>;
