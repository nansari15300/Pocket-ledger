/** Unified attachment pipeline trace — enable with `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1`. */
export function attachmentPipelineDebugEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

export function logAttachmentPipeline(
  phase: "select" | "stage" | "save" | "sync" | "retrieve" | "preview",
  detail: Record<string, unknown>
): void {
  if (!attachmentPipelineDebugEnabled()) return;
  console.warn("[ATTACHMENT_PIPELINE]", { phase, ...detail });
}

/** Classify stored ref for prod vs dev comparison in console. */
export function classifyAttachmentRef(ref: unknown): string {
  const s = String(ref ?? "").trim();
  if (!s) return "empty";
  if (s.startsWith("local:")) return "local_pending";
  if (s.startsWith("blob:")) return "blob_url";
  if (s.startsWith("https://firebasestorage.googleapis.com")) return "firebase_https";
  if (s.startsWith("https://")) return "https_other";
  if (s.startsWith("drive:")) return "drive_ref";
  return "other";
}
