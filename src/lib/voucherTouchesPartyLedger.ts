/**
 * Party list / party header badges: `pendingApprovalByPartyId` aur `pendingApprovalCount` ko
 * same voucher set pe laana jo `useTransactions(..., "party")` table me dikhata hai.
 * Pehle sirf `v.partyId` count hota tha — Journal / contra / multi-field vouchers miss ho rahe the.
 */
/** Firestore kabhi string, kabhi DocumentReference-like `{ id }` — Compare / copy ke baad filter match na tootey. */
function ledgerIdEq(a: unknown, b: string): boolean {
  const nb = String(b ?? "").trim();
  if (!nb) return false;
  const norm = (x: unknown): string => {
    if (x == null || x === "") return "";
    if (typeof x === "string") return x.trim();
    if (typeof x === "object" && x !== null && "id" in (x as Record<string, unknown>)) {
      const id = (x as { id?: unknown }).id;
      return typeof id === "string" ? id.trim() : String(id ?? "");
    }
    return String(x).trim();
  };
  return norm(a) === nb;
}

/** Party ledger screen / Copy ledger preview — kitne vouchers is party ko touch karte hain (sirf `partyId` field nahi) */
export function countVouchersTouchingPartyLedger(vouchers: any[] | undefined, partyId: string): number {
  if (!partyId || !Array.isArray(vouchers)) return 0;
  return vouchers.filter((v) => voucherTouchesPartyLedger(v, partyId)).length;
}

export function voucherTouchesPartyLedger(v: any, partyId: string): boolean {
  if (!v || !partyId) return false;
  if (partyId === "all" || partyId === "sales_account" || partyId === "purchase_account") return false;
  if (ledgerIdEq(v.partyId, partyId)) return true;
  if (ledgerIdEq(v.accountId, partyId)) return true;
  if (ledgerIdEq(v.staffId, partyId)) return true;
  if (ledgerIdEq(v.taxAccountId, partyId)) return true;
  if (ledgerIdEq(v.expenseAccountId, partyId)) return true;
  if (ledgerIdEq(v.incomeAccountId, partyId)) return true;
  if (ledgerIdEq(v.salesAccountId, partyId)) return true;
  if (ledgerIdEq(v.purchaseAccountId, partyId)) return true;
  if (v.lineItems?.some((li: any) => ledgerIdEq(li?.itemId, partyId) || ledgerIdEq(li?.taxAccountId, partyId))) return true;
  if (v.items?.some((li: any) => ledgerIdEq(li?.itemId, partyId))) return true;
  // Journal multi-leg — `accountId` string ya ref dono (cross-company copy ke baad Compare Side B rows).
  if (v.entries?.some((e: any) => ledgerIdEq(e?.accountId, partyId))) return true;
  if (v.type === "note" && ledgerIdEq(v.entityId, partyId)) return true;
  if (v.type === "contra" && (ledgerIdEq(v.fromAccountId, partyId) || ledgerIdEq(v.toAccountId, partyId))) return true;
  return false;
}

/** Unapproved voucher jo is party ke ledger me aata ho */
export function isUnapprovedVoucherForParty(v: any, partyId: string): boolean {
  if (v?.isApproved === true) return false;
  return voucherTouchesPartyLedger(v, partyId);
}

/**
 * Party list badge ke liye: ek voucher jitni parties ko touch kare utni bar count (journal = do parties ho sakte hain).
 * Sirf `partyIdSet` me jo ids hain unhi ko increment karo — O(vouchers * fields), parties loop nahi.
 */
export function collectPartyIdsTouchedByUnapprovedVoucher(v: any, partyIdSet: Set<string>): Set<string> {
  const out = new Set<string>();
  if (!v || v.isApproved === true) return out;
  const add = (id: unknown) => {
    const s = id != null && id !== "" ? String(id) : "";
    if (s && partyIdSet.has(s)) out.add(s);
  };
  add(v.partyId);
  add(v.accountId);
  add(v.staffId);
  add(v.taxAccountId);
  add(v.expenseAccountId);
  add(v.incomeAccountId);
  add(v.salesAccountId);
  add(v.purchaseAccountId);
  if (Array.isArray(v.entries)) v.entries.forEach((e: any) => add(e?.accountId));
  if (v.type === "note") add(v.entityId);
  if (v.type === "contra") {
    add(v.fromAccountId);
    add(v.toAccountId);
  }
  if (Array.isArray(v.lineItems)) v.lineItems.forEach((li: any) => {
    add(li?.itemId);
    add(li?.taxAccountId);
  });
  if (Array.isArray(v.items)) v.items.forEach((li: any) => add(li?.itemId));
  return out;
}
