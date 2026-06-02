/**
 * Visible-row attachment URLs ko full-company `prefetchHttpsAttachmentUrls` ke head par merge karne ke liye
 * lightweight buffer — `TransactionsTable` idle prewarm alag chalta hai, yahan sirf ordering hint.
 */
import { isOfflineCacheableAttachmentRef } from "@/lib/attachmentRefBlobFetch";

/** Zyada lambi list par memory / merge CPU tame — mirror prefetch apna maxUrls alag rakhta hai */
const VISIBLE_PRIORITY_BUFFER_CAP = 450;

function isEligibleForPrefetchQueue(raw: string): boolean {
  return isOfflineCacheableAttachmentRef(raw);
}

let latestVisibleAttachmentUrls: string[] = [];

/**
 * Ledger / shared tables: abhi render rows ke file URLs — background mirror prefetch inhe pehle attempt karega.
 */
export function updateAttachmentPrefetchPriorityFromVisibleRows(urls: readonly string[]): void {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (!isEligibleForPrefetchQueue(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    next.push(u);
    if (next.length >= VISIBLE_PRIORITY_BUFFER_CAP) break;
  }
  latestVisibleAttachmentUrls = next;
}

/** `prefetchHttpsAttachmentUrls` call se turant pehle — copy return, buffer mutate nahi */
export function peekAttachmentPrefetchPrioritySnapshot(): string[] {
  return latestVisibleAttachmentUrls.slice();
}
