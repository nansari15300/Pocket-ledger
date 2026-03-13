/**
 * Local API file upload/serve – use when data source is Local (server).
 * Server routes: POST /api/files/upload, GET /api/files/:path, DELETE /api/files/:path.
 */

/**
 * Upload a file to local API. Path = storage path (same as Firebase, e.g. company-logos/uid/123_logo.png).
 * Returns the download URL to store in app (e.g. company.logoUrl).
 */
export async function uploadLocalFile(
  baseUrl: string,
  path: string,
  file: File | Blob,
  fileName?: string
): Promise<{ url: string; path: string }> {
  const url = baseUrl.replace(/\/$/, "") + "/api/files/upload";
  const form = new FormData();
  form.append("path", path);
  const name = fileName ?? (file instanceof File ? file.name : "file");
  form.append("file", file, name);
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Upload failed");
  return { url: (data as { url: string }).url, path: (data as { path: string }).path };
}

/** Build download URL for a path (e.g. for display; GET /api/files/:path serves the file). */
export function getLocalFileUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const encoded = path.split("/").map((p) => encodeURIComponent(p)).join("/");
  return base + "/api/files/" + encoded;
}

/** Delete file at path via local API. */
export async function deleteLocalFile(baseUrl: string, path: string): Promise<void> {
  const encoded = path.split("/").map((p) => encodeURIComponent(p)).join("/");
  const res = await fetch(baseUrl.replace(/\/$/, "") + "/api/files/" + encoded, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Delete failed");
  }
}
