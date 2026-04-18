/**
 * Items master: lineItems + legacy `items` array — har item id kitni vouchers me pending hai (Set = ek voucher per item max once).
 */
export function collectItemIdsTouchedByUnapprovedVoucher(v: any, itemIdSet: Set<string>): Set<string> {
  const out = new Set<string>();
  if (!v || v.isApproved === true) return out;
  const add = (id: unknown) => {
    const s = id != null && id !== "" ? String(id) : "";
    if (s && itemIdSet.has(s)) out.add(s);
  };
  if (Array.isArray(v.lineItems)) v.lineItems.forEach((li: any) => add(li?.itemId));
  if (Array.isArray(v.items)) v.items.forEach((li: any) => add(li?.itemId));
  return out;
}
