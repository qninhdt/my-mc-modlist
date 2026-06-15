/**
 * Sanitizes a filename to prevent Zip Slip path traversal and other issues.
 *
 * Requirements:
 * - Derive zip entry name from a sanitized basename only.
 * - Strip path separators (/ and \), "..", and control characters.
 * - Enforce the pattern: ^[\w.\-]+\.jar$
 */
export function sanitizeFilename(fileName: string): string {
  if (!fileName) {
    return "unnamed_mod.jar";
  }

  // 1. Get the last segment to strip path separators
  const baseName = fileName.split(/[/\\]/).pop() || "unnamed_mod";

  // 2. Remove control characters
  const cleanBase = baseName.replace(/[\x00-\x1F\x7F]/g, "");

  // 3. Keep only alphanumeric, dot, hyphen, and underscore
  let sanitized = cleanBase.replace(/[^a-zA-Z0-9.\-_]/g, "_");

  // 4. Clean up leading dots/hyphens/underscores which can cause hidden files or issues
  while (sanitized.startsWith(".") || sanitized.startsWith("-") || sanitized.startsWith("_")) {
    sanitized = sanitized.substring(1);
  }

  if (!sanitized) {
    sanitized = "unnamed_mod";
  }

  // 5. Enforce ending with .jar case-insensitively
  if (!sanitized.toLowerCase().endsWith(".jar")) {
    sanitized = sanitized + ".jar";
  } else {
    // Replace extension to be exactly ".jar"
    const baseWithoutJar = sanitized.slice(0, -4);
    sanitized = baseWithoutJar + ".jar";
  }

  // 6. Ensure it strictly matches ^[\w.\-]+\.jar$ (where \w is [a-zA-Z0-9_])
  const pattern = /^[\w.\-]+\.jar$/;
  if (!pattern.test(sanitized)) {
    // If it still doesn't match for some reason, replace all non-matching characters
    sanitized = sanitized.replace(/[^\w.\-]/g, "_");
    if (!pattern.test(sanitized)) {
      return `mod_${Date.now()}.jar`;
    }
  }

  return sanitized;
}
