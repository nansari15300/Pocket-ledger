"use client";

import { useHeaderAttachmentPrefetchPercentForCompany } from "@/contexts/EmbeddedAttachmentPrefetchContext";

/** App header ke neeche 5px green attachment-cache progress — sirf yahi component re-render hota hai. */
export function HeaderAttachmentPrefetchStrip({
  companyId,
}: {
  companyId: string | null | undefined;
}) {
  const pct = useHeaderAttachmentPrefetchPercentForCompany(companyId);
  if (pct == null) return null;

  const width = Math.min(100, Math.max(0, pct));

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-[5px] overflow-hidden bg-green-500/20"
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Caching attachments for offline use"
    >
      <div
        className="h-full bg-green-500 transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
