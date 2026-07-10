import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";

/** Master rows (party, staff, tax, expense account, bank…) — list avatar ke liye `fileUrl` normalize. */
export function masterEntityAttachmentPreviewUrl(
  entity: { fileUrl?: unknown } | null | undefined
): string | null {
  if (!entity || typeof entity !== "object") return null;
  return typeof entity.fileUrl === "string"
    ? trimEntityFileUrlForPreview(entity.fileUrl)
    : null;
}
