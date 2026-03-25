/**
 * Short file-type label for thumbnails and tooltips (PDF, JPG, JPEG, PNG, …).
 * Works with Firebase URLs, data URLs, and File (name + MIME).
 */

const MIME_TO_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/jpg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/gif": "GIF",
  "image/bmp": "BMP",
  "image/svg+xml": "SVG",
};

function extensionFromPath(path: string): string {
  const base = path.split("?")[0].split("/").pop() || "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

function normalizeExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  if (!e) return "FILE";
  const map: Record<string, string> = {
    jpeg: "JPEG",
    jpe: "JPEG",
    jpg: "JPG",
    pdf: "PDF",
    png: "PNG",
    gif: "GIF",
    webp: "WEBP",
    bmp: "BMP",
    svg: "SVG",
    heic: "HEIC",
    heif: "HEIF",
    doc: "DOC",
    docx: "DOCX",
    xls: "XLS",
    xlsx: "XLSX",
  };
  return map[e] ?? e.toUpperCase();
}

export function getAttachmentFormatLabel(source: string | File): string {
  if (typeof source !== "string") {
    if (source.type) {
      const label = MIME_TO_LABEL[source.type];
      if (label) return label;
      if (source.type.startsWith("image/")) {
        const sub = source.type.split("/")[1]?.toUpperCase();
        return sub && sub.length <= 8 ? sub : "IMAGE";
      }
    }
    const ext = extensionFromPath(source.name);
    if (ext) return normalizeExt(ext);
    return "FILE";
  }
  const s = source;
  if (s.startsWith("data:")) {
    const rest = s.slice(5);
    const semi = rest.indexOf(";");
    const comma = rest.indexOf(",");
    const end = semi > 0 && (comma < 0 || semi < comma) ? semi : comma > 0 ? comma : rest.length;
    const mime = rest.slice(0, end).trim().toLowerCase();
    if (MIME_TO_LABEL[mime]) return MIME_TO_LABEL[mime];
    if (mime.startsWith("image/")) return mime.split("/")[1]?.toUpperCase() || "IMAGE";
    if (mime === "application/pdf") return "PDF";
    return "FILE";
  }
  const ext = extensionFromPath(s);
  if (ext) return normalizeExt(ext);
  const lower = s.split("?")[0].toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  return "FILE";
}
