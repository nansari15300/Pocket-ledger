/**
 * Firebase getDownloadURL() links encode the object path; ref(storage, path) + getBlob
 * avoids flaky CORS fetch() for thumbnails (gallery vouchers often pass URL-only fileUrls).
 */

/**
 * Parses standard Firebase Storage download URL and returns Storage object path
 * (e.g. `voucher-files/companyId/journal/174..._file.pdf`).
 * Returns null if not this host/shape.
 */
export function tryGetStoragePathFromFirebaseDownloadUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const withoutHash = url.trim().split("#")[0];
  try {
    const u = new URL(withoutHash);
    if (!u.hostname.includes("firebasestorage.googleapis.com")) return null;
    const m = u.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (!m?.[1]) return null;
    // + in query-less path segment can mean space in legacy encodings
    return decodeURIComponent(m[1].replace(/\+/g, " "));
  } catch {
    return null;
  }
}
