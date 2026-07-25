"use client";

/** Safe folder segment for auto-backup: `{company}/{timestamp}/file.plbp` */
export function sanitizeBackupFolderSegment(raw: string): string {
  const s = String(raw || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return s || "company";
}

export function buildAutoBackupRelativeDir(
  companyName: string,
  companyId: string,
  at = new Date()
): string {
  const companyFolder = sanitizeBackupFolderSegment(companyName || companyId);
  const stamp = at.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${companyFolder}/${stamp}`;
}

async function ensureWebSubdirectory(
  root: FileSystemDirectoryHandle,
  relativeDir: string
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of relativeDir.split(/[/\\]+/).filter(Boolean)) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

export async function resolveWebBackupDirectoryForRelativePath(
  root: FileSystemDirectoryHandle,
  relativeDir?: string | null
): Promise<FileSystemDirectoryHandle> {
  const rel = String(relativeDir || "").trim();
  if (!rel) return root;
  return ensureWebSubdirectory(root, rel);
}
