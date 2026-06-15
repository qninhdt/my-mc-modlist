import { ref, uploadBytes, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { sanitizeFilename } from "./safe-filename";
import { computeHashes } from "./hashing";
import { updatePackMod } from "@/lib/modpacks/mod-repository";
import type { ActivityActor } from "@/lib/activity/types";

export interface UploadJarResult {
  fileName: string;
  storagePath: string;
  sha1: string;
  sha512: string;
  fileSize: number;
}

/**
 * Validates, hashes, uploads a jar file to Firebase Storage,
 * and updates the mod document in Firestore.
 */
export async function uploadJarAndUpdateMod(
  packId: string,
  modId: string,
  file: File,
  actor: ActivityActor,
  clientSide: string,
  serverSide: string
): Promise<UploadJarResult> {
  // Validate extension
  if (!file.name.endsWith(".jar")) {
    throw new Error("Only .jar files are allowed.");
  }

  // Validate size (max 100MB)
  const MAX_SIZE = 100 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error("File is too large (max 100MB).");
  }

  // 1. Sanitize filename to prevent directory traversal
  const safeName = sanitizeFilename(file.name);
  const storagePath = `packs/${packId}/mods/${modId}/${safeName}`;

  // 2. Compute hashes client-side
  const hashes = await computeHashes(file);

  // 3. Upload to Firebase Storage
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file);

  // 4. Update mod document in Firestore
  await updatePackMod(packId, modId, {
    fileName: safeName,
    downloadUrl: null, // manual downloads go through our auth API endpoint
    sha1: hashes.sha1,
    sha512: hashes.sha512,
    storagePath,
    fileSize: file.size,
    uploadedByUid: actor.uid,
    uploadedAt: new Date().toISOString() as any, // ISO fallback for typescript compatibility
    clientSide,
    serverSide,
  }, actor);

  return {
    fileName: safeName,
    storagePath,
    sha1: hashes.sha1,
    sha512: hashes.sha512,
    fileSize: file.size,
  };
}

/**
 * Deletes the uploaded jar file from Firebase Storage
 * and resets the upload fields in the Firestore mod document.
 */
export async function deleteJarAndResetMod(
  packId: string,
  modId: string,
  storagePath: string,
  actor: ActivityActor
): Promise<void> {
  // 1. Delete from Firebase Storage
  const fileRef = ref(storage, storagePath);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    console.warn("Storage deletion failed or file did not exist:", err);
  }

  // 2. Reset mod document in Firestore
  await updatePackMod(
    packId,
    modId,
    {
      fileName: null,
      sha1: null,
      sha512: null,
      storagePath: null,
      fileSize: null,
      uploadedByUid: null,
      uploadedAt: null,
    },
    actor
  );
}
