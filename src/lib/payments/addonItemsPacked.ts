import { normalizeAddonKind, type AddonKind } from "@/lib/planAddOns";

export type AddonPurchaseLine = { kind: AddonKind | string; quantity: number };

/** Firestore + admin mirror: `device-online:2,user-local:1` */
export function packAddonItemsForStorage(items: readonly AddonPurchaseLine[]): string {
  return items
    .map((row) => {
      const kind = normalizeAddonKind(row.kind);
      const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
      return `${kind}:${quantity}`;
    })
    .filter(Boolean)
    .join(",");
}

/** Read packed addon lines from payment doc (string, legacy array, or addonItemsPacked). */
export function resolveAddonItemsPackedFromPaymentData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;
  const explicit = String(data.addonItemsPacked ?? "").trim();
  if (explicit) return explicit;

  const raw = data.addonItems;
  if (typeof raw === "string") {
    const s = raw.trim();
    return s.length > 0 ? s : null;
  }
  if (Array.isArray(raw)) {
    const packed = packAddonItemsForStorage(
      raw.map((row) => {
        const r = row as { kind?: unknown; quantity?: unknown };
        return { kind: String(r.kind ?? ""), quantity: Number(r.quantity) || 1 };
      })
    );
    return packed || null;
  }
  return null;
}
