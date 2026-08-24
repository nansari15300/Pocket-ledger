/** Auto IC clearing parties — Company→Company vs Account→Account. */

export type InterCompanyClearingMode = "company" | "account";

/** Company→Company — `IC Company "{peer name}"` (ek peer = ek row). */
export function formatInterCompanyCounterpartyPartyName(peerCompanyName: string): string {
  const peerName = String(peerCompanyName || "Company").trim() || "Company";
  return `IC Company "${peerName}"`;
}

/** Account→Account — `IC Account "{peer account name}"` (same peer+account = ek row). */
export function formatInterCompanyAccountClearingPartyName(peerAccountName: string): string {
  const accountName = String(peerAccountName || "Account").trim() || "Account";
  return `IC Account "${accountName}"`;
}

export function isInterCompanyCompanyClearingPartyName(name: unknown): boolean {
  const n = String(name || "").trim();
  return n.startsWith('IC Company "') || n.startsWith("IC Com ") || n.startsWith("IC · Due ");
}

export function isInterCompanyAccountClearingPartyName(name: unknown): boolean {
  const n = String(name || "").trim();
  return n.startsWith('IC Account "');
}

export function isInterCompanyCounterpartyPartyName(name: unknown): boolean {
  return isInterCompanyCompanyClearingPartyName(name) || isInterCompanyAccountClearingPartyName(name);
}

export function readInterCompanyClearingMode(
  party: {
    id?: string;
    name?: string;
    interCompanyClearingMode?: string;
  } | null | undefined
): InterCompanyClearingMode {
  const mode = String(party?.interCompanyClearingMode || "").trim().toLowerCase();
  if (mode === "account") return "account";
  if (mode === "company") return "company";
  const id = String(party?.id || "").trim();
  if (id.startsWith("ic_acct_")) return "account";
  if (isInterCompanyAccountClearingPartyName(party?.name)) return "account";
  return "company";
}

/** Mirrored peer entity — `IC {code} {full name}`. */
export function isInterCompanyMirroredPartyName(name: unknown): boolean {
  const n = String(name || "").trim();
  // Clearing rows alag helpers se
  if (isInterCompanyCounterpartyPartyName(n)) return false;
  return /^IC\s+\S/.test(n);
}

/** Company↔company / account clearing (not per-person mirror). */
export function isInterCompanyCompanyClearingParty(
  party: {
    id?: string;
    name?: string;
    isInterCompanyCounterparty?: boolean;
    isInterCompanyMirroredEntity?: boolean;
    interCompanyClearingMode?: string;
  } | null | undefined
): boolean {
  if (!party) return false;
  if (party.isInterCompanyMirroredEntity === true) return false;
  if (String(party.id || "").startsWith("ic_mirror_")) return false;
  if (party.isInterCompanyCounterparty === true) return true;
  if (String(party.id || "").startsWith("ic_peer_")) return true;
  if (String(party.id || "").startsWith("ic_acct_")) return true;
  return isInterCompanyCounterpartyPartyName(party.name);
}

/**
 * Party list "IC / Ac" tab — IC Company + IC Account clearing rows.
 */
export function isInterCompanyPartyListAccount(
  party: {
    id?: string;
    name?: string;
    isInterCompanyCounterparty?: boolean;
    isInterCompanyMirroredEntity?: boolean;
    interCompanyClearingMode?: string;
  } | null | undefined
): boolean {
  return isInterCompanyCompanyClearingParty(party);
}

/** List card: IC Account line + niche peer company name (A→A aur C→C dono). */
export function getInterCompanyPartyListTitleLines(party: {
  name?: string;
  interCompanyPeerCompanyName?: string;
  interCompanyClearingMode?: string;
  id?: string;
}): { primary: string; secondary?: string } {
  const primary = String(party?.name || "").trim() || "—";
  const companyName = String(party?.interCompanyPeerCompanyName || "").trim();
  if (!companyName) return { primary };
  return { primary, secondary: companyName };
}

export function normalizeInterCompanyClearingDedupeKey(name: unknown): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function peerEntityDedupeKey(party: {
  interCompanyPeerEntityKind?: string;
  interCompanyPeerEntityId?: string;
}): string {
  const kind = String(party.interCompanyPeerEntityKind || "").trim().toLowerCase();
  const id = String(party.interCompanyPeerEntityId || "").trim();
  if (!kind || !id) return "";
  return `${kind}:${id}`;
}

/** C→C + A→A — same peer+entity / same IC Account naam → ek hi clearing row. */
export function interCompanyClearingPartyDedupeKeys(party: {
  id?: string;
  name?: string;
  interCompanyPeerCompanyId?: string;
  interCompanyPeerEntityKind?: string;
  interCompanyPeerEntityId?: string;
}): string[] {
  const keys: string[] = [];
  const peer = String(party.interCompanyPeerCompanyId || "").trim();
  const ent = peerEntityDedupeKey(party);
  if (peer && ent) keys.push(`peer:${peer}|ent:${ent}`);
  const nameKey = normalizeInterCompanyClearingDedupeKey(party.name);
  if (peer && nameKey && isInterCompanyAccountClearingPartyName(party.name)) {
    keys.push(`peer:${peer}|name:${nameKey}`);
  }
  if (keys.length === 0) keys.push(`id:${String(party.id || "").trim()}`);
  return keys;
}

/**
 * Same peer + same account (C→C / A→A mode alag ho to bhi) — ek hi row.
 */
export function dedupeInterCompanyClearingParties<
  T extends {
    id: string;
    name?: string;
    balance?: number;
    debit?: number;
    credit?: number;
    interCompanyPeerCompanyId?: string;
    interCompanyPeerEntityKind?: string;
    interCompanyPeerEntityId?: string;
    interCompanyClearingMode?: string;
    isInterCompanyCounterparty?: boolean;
    isInterCompanyMirroredEntity?: boolean;
  },
>(parties: T[]): T[] {
  const clearing = parties.filter((p) => isInterCompanyCompanyClearingParty(p));
  if (clearing.length <= 1) return clearing;

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) || id;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const p of clearing) parent.set(p.id, p.id);

  const byKey = new Map<string, string>();
  for (const p of clearing) {
    const keys = interCompanyClearingPartyDedupeKeys(p);
    for (const key of keys) {
      const prev = byKey.get(key);
      if (prev) union(prev, p.id);
      byKey.set(key, p.id);
    }
  }

  const groups = new Map<string, T[]>();
  for (const p of clearing) {
    const root = find(p.id);
    const list = groups.get(root) || [];
    list.push(p);
    groups.set(root, list);
  }

  const out: T[] = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      out.push(members[0]!);
      continue;
    }
    const sorted = [...members].sort((a, b) => {
      const rank = (id: string) => {
        if (id.startsWith("ic_acct_")) return 2;
        if (id.startsWith("ic_peer_")) return 1;
        return 0;
      };
      const aCanon = rank(a.id);
      const bCanon = rank(b.id);
      if (aCanon !== bCanon) return bCanon - aCanon;
      const aAbs = Math.abs(Number(a.balance) || 0);
      const bAbs = Math.abs(Number(b.balance) || 0);
      if (aAbs !== bAbs) return bAbs - aAbs;
      return a.id.localeCompare(b.id);
    });
    const winner = sorted[0]!;
    let debit = 0;
    let credit = 0;
    let balance = 0;
    for (const m of members) {
      debit += Number(m.debit) || 0;
      credit += Number(m.credit) || 0;
      balance += Number(m.balance) || 0;
    }
    out.push({ ...winner, debit, credit, balance });
  }
  return out;
}
