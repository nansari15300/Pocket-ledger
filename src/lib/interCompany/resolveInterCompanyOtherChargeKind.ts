import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";

export type InterCompanyOtherChargePayeeKind = "party" | "staff" | "expense";

const PAYEE_KINDS: InterCompanyOtherChargePayeeKind[] = ["party", "staff", "expense"];

function isPayeeKind(raw: unknown): raw is InterCompanyOtherChargePayeeKind {
  return PAYEE_KINDS.includes(raw as InterCompanyOtherChargePayeeKind);
}

/** Combobox label (`Expense: …`) ya master list se other-charge account kind. */
export function resolveInterCompanyOtherChargeKind(args: {
  accountId: string;
  entities?: { id: string; kind: string }[];
  accountLabel?: string | null;
  storedKind?: string | null;
}): InterCompanyOtherChargePayeeKind | null {
  const stored = String(args.storedKind || "").trim();
  if (isPayeeKind(stored)) return stored;

  const id = String(args.accountId || "").trim();
  if (!id) return null;

  const ent = (args.entities || []).find((e) => String(e.id) === id);
  if (ent?.kind === "party" || ent?.kind === "staff" || ent?.kind === "expense") {
    return ent.kind;
  }

  const lbl = String(args.accountLabel || "").trim();
  if (/^Expense:/i.test(lbl)) return "expense";
  if (/^Staff:/i.test(lbl)) return "staff";
  if (/^Party:/i.test(lbl)) return "party";

  return null;
}

/** Saved voucher — `otherChargeKind`, legs, ya stored fields se kind. */
export function resolveInterCompanyOtherChargeKindFromVoucher(
  voucher: Record<string, unknown>
): InterCompanyOtherChargePayeeKind | null {
  const stored = String(voucher.otherChargeKind || "").trim();
  if (isPayeeKind(stored)) return stored;

  const ocId = String(voucher.otherChargeAccountId || "").trim();
  if (!ocId) return null;

  const storedLegs = voucher.interCompanyLegs;
  if (Array.isArray(storedLegs)) {
    for (const row of storedLegs) {
      const r = row as { kind?: string; accountId?: string; debit?: number };
      const k = String(r.kind || "").trim();
      if (
        String(r.accountId || "").trim() === ocId &&
        Number(r.debit) > 0 &&
        isPayeeKind(k)
      ) {
        return k;
      }
    }
  }

  return null;
}

export function interCompanyOtherChargeKindToEntityKind(
  kind: InterCompanyOtherChargePayeeKind | null | undefined
): InterCompanyEntityKind | null {
  if (kind === "party" || kind === "staff" || kind === "expense") return kind;
  return null;
}
