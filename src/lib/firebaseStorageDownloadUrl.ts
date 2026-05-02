/**
 * Firebase getDownloadURL() links encode the object path; ref(storage, path) + getBlob
 * avoids flaky CORS fetch() for thumbnails (gallery vouchers often pass URL-only fileUrls).
 */

/**
 * Parses standard Firebase Storage download URL and returns Storage object path
 * (e.g. `voucher-files/companyId/journal/174..._file.pdf`).
 * Host: `firebasestorage.googleapis.com` **or** `*.firebasestorage.app` (bucket DNS) — path `/v0/b/.../o/...` same.
 */
export function tryGetStoragePathFromFirebaseDownloadUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const withoutHash = url.trim().split("#")[0];
  try {
    const u = new URL(withoutHash);
    const host = u.hostname.toLowerCase();
    const isFirebaseHost =
      host.includes("firebasestorage.googleapis.com") ||
      host.endsWith("firebasestorage.app") ||
      host.includes("storage.googleapis.com");
    if (!isFirebaseHost) return null;
    const m = u.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (!m?.[1]) return null;
    // + in query-less path segment can mean space in legacy encodings
    return decodeURIComponent(m[1].replace(/\+/g, " "));
  } catch {
    return null;
  }
}
