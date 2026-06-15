/**
 * Computes SHA-1 and SHA-512 hashes of a file or blob in the browser using the Web Crypto API.
 */
export async function computeHashes(
  file: Blob | File
): Promise<{ sha1: string; sha512: string }> {
  const buffer = await file.arrayBuffer();

  const sha1Buffer = await crypto.subtle.digest("SHA-1", buffer);
  const sha512Buffer = await crypto.subtle.digest("SHA-512", buffer);

  const bufferToHex = (buf: ArrayBuffer) => {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  return {
    sha1: bufferToHex(sha1Buffer),
    sha512: bufferToHex(sha512Buffer),
  };
}
