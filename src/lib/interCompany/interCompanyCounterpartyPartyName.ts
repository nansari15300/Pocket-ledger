/** Auto IC counterparty party — `IC Company "{peer name}"` (har linked company alag ledger). */
export function formatInterCompanyCounterpartyPartyName(peerCompanyName: string): string {
  const peerName = String(peerCompanyName || "Company").trim() || "Company";
  return `IC Company "${peerName}"`;
}

export function isInterCompanyCounterpartyPartyName(name: unknown): boolean {
  const n = String(name || "").trim();
  return (
    n.startsWith('IC Company "') ||
    n.startsWith("IC Com ") ||
    n.startsWith("IC · Due ")
  );
}
