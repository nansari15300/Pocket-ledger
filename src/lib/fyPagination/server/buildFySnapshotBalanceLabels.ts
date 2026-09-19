/** Firestore console readability — lookup still uses `balances` keys (stable ids). */
const KNOWN_SYSTEM_BALANCE_LABELS: Record<string, string> = {
  opening_balance_ledger: "Opening Balance",
  owners_capital: "Owner's Capital",
};

export function masterDisplayNameFromFirestore(
  kind: "party" | "account" | "staff" | "tax" | "expense" | "item",
  data: Record<string, unknown>,
  docId: string
): string {
  if (kind === "account") {
    const name = String(data.accountName || data.name || "").trim();
    return name || docId;
  }
  if (kind === "staff") {
    const name = String(data.name || data.staffName || "").trim();
    return name || docId;
  }
  if (kind === "tax") {
    const name = String(data.name || data.taxName || "").trim();
    return name || docId;
  }
  if (kind === "expense") {
    const name = String(data.name || data.accountName || "").trim();
    return name || docId;
  }
  if (kind === "item") {
    const name = String(data.name || data.itemName || "").trim();
    return name || docId;
  }
  const name = String(data.name || data.partyName || "").trim();
  return name || docId;
}

/** Optional id → display name map for `fySnapshots` docs (debug / Firestore console). */
export function buildFySnapshotBalanceLabels(
  labelById: Map<string, string>,
  balances: Record<string, number>
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const id of Object.keys(balances)) {
    const fromMaster = labelById.get(id);
    if (fromMaster) {
      labels[id] = fromMaster;
      continue;
    }
    const system = KNOWN_SYSTEM_BALANCE_LABELS[id];
    if (system) labels[id] = system;
  }
  return labels;
}
