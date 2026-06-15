import { sanitizeFilename as zipSanitize } from "@/lib/zip/sanitize-filename";

/**
 * Sanitizes a filename for storage.
 * Simply re-uses the ZIP filename sanitizer to keep filename semantics consistent
 * across downloads, storage paths, and ZIP file entries.
 */
export function sanitizeFilename(fileName: string): string {
  return zipSanitize(fileName);
}
