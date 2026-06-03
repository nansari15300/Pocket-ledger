/** Production app hostnames (with or without hyphen). OAuth + CORS treat both as first-party. */
const POCKET_LEDGER_ROOT_HOSTS = ["pocket-ledger.com", "pocketledger.com"] as const;

export function isPocketLedgerAppHostname(hostname: string): boolean {
  const h = String(hostname || "").trim().toLowerCase();
  if (!h) return false;
  return POCKET_LEDGER_ROOT_HOSTS.some((root) => h === root || h.endsWith(`.${root}`));
}

export function isPocketLedgerAppOrigin(origin: string): boolean {
  try {
    return isPocketLedgerAppHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}
