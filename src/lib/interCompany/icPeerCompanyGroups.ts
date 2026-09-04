import type { Party } from "@/components/party/types";
import { getInterCompanyPartyListTitleLines } from "@/lib/interCompany/interCompanyCounterpartyPartyName";

export const IC_PEER_COMPANY_GROUP_ID_PREFIX = "__ic_co__";
export const IC_GROUP_ACCOUNT_FILTER_ALL = "__all__";
/** Party page Groups tab — auto synthetic group for all inter-company clearing accounts. */
export const IC_COMPANY_PARTY_GROUP_ID = "ic_company";

export function isIcPeerCompanyGroupId(id: unknown): boolean {
  return String(id || "").startsWith(IC_PEER_COMPANY_GROUP_ID_PREFIX);
}

export function isIcCompanyPartyGroupId(id: unknown): boolean {
  return String(id || "") === IC_COMPANY_PARTY_GROUP_ID;
}

export function icPeerCompanyGroupId(peerCompanyId: string, peerCompanyName: string): string {
  const peerId = String(peerCompanyId || "").trim();
  if (peerId) return `${IC_PEER_COMPANY_GROUP_ID_PREFIX}${peerId}`;
  const slug = String(peerCompanyName || "company")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 48);
  return `${IC_PEER_COMPANY_GROUP_ID_PREFIX}name_${slug}`;
}

export function readIcPeerCompanyIdFromGroupId(groupId: string): string {
  const id = String(groupId || "").trim();
  if (!isIcPeerCompanyGroupId(id)) return "";
  return id.slice(IC_PEER_COMPANY_GROUP_ID_PREFIX.length);
}

/** IC Account row se display account name (dropdown / list). */
export function interCompanyClearingAccountDisplayName(party: Party): string {
  const label = String(party.interCompanyPeerEntityLabel || "").trim();
  if (label) return label;
  const primary = getInterCompanyPartyListTitleLines(party).primary;
  const m = /^IC Account "(.*)"$/.exec(primary);
  if (m?.[1]) return m[1];
  return primary;
}

export type IcPeerCompanyGroupRow = Party & {
  isIcPeerCompanyGroup: true;
  icPeerCompanyId: string;
  icMemberParties: Party[];
};

/** Parties tab flat IC card — second row: `IC Com ------> Peer Name`. */
export function icPartyListFlatSecondaryLabel(peerCompanyName: string): string {
  const peer = String(peerCompanyName || "").trim() || "—";
  return `IC Com ------> ${peer}`;
}

/** IC company group subtitle — e.g. `IC Company 2 Accounts`. */
export function icPeerCompanyGroupSecondaryLabel(accountCount: number): string {
  const count = Math.max(0, Number(accountCount) || 0);
  return `IC Company ${count} Account${count === 1 ? "" : "s"}`;
}

/** Party / IC list — company naam + niche IC Company account count. */
export function icPeerCompanyGroupListTitleLines(party: {
  name?: string;
  icMemberParties?: Party[];
}): { primary: string; secondary: string } {
  const primary = String(party?.name || "").trim() || "—";
  const count = party.icMemberParties?.length ?? 0;
  return { primary, secondary: icPeerCompanyGroupSecondaryLabel(count) };
}

/** Peer company ke hisaab se IC clearing rows merge — list me sirf company naam. */
export function buildIcPeerCompanyGroupRows(parties: Party[]): IcPeerCompanyGroupRow[] {
  const buckets = new Map<
    string,
    { peerCompanyId: string; peerCompanyName: string; members: Party[] }
  >();

  for (const p of parties) {
    const peerCompanyId = String(p.interCompanyPeerCompanyId || "").trim();
    const peerCompanyName =
      String(p.interCompanyPeerCompanyName || "").trim() || "Company";
    const bucketKey = peerCompanyId || peerCompanyName.toLowerCase();
    const prev = buckets.get(bucketKey);
    if (prev) {
      prev.members.push(p);
      if (!prev.peerCompanyName && peerCompanyName) prev.peerCompanyName = peerCompanyName;
      if (!prev.peerCompanyId && peerCompanyId) prev.peerCompanyId = peerCompanyId;
    } else {
      buckets.set(bucketKey, {
        peerCompanyId,
        peerCompanyName,
        members: [p],
      });
    }
  }

  const out: IcPeerCompanyGroupRow[] = [];
  for (const bucket of buckets.values()) {
    let debit = 0;
    let credit = 0;
    let balance = 0;
    let openingBalance = 0;
    for (const m of bucket.members) {
      debit += Number(m.debit) || 0;
      credit += Number(m.credit) || 0;
      balance += Number(m.balance) || 0;
      openingBalance += Number(m.openingBalance) || 0;
    }
    const companyId = String(bucket.members[0]?.companyId || "").trim();
    const id = icPeerCompanyGroupId(bucket.peerCompanyId, bucket.peerCompanyName);
    out.push({
      id,
      name: bucket.peerCompanyName,
      companyId,
      debit,
      credit,
      balance,
      openingBalance,
      isIcPeerCompanyGroup: true,
      icPeerCompanyId: bucket.peerCompanyId,
      icMemberParties: bucket.members,
    });
  }

  return out.sort((a, b) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0));
}

export function resolveIcMemberPartiesForGroupSelection(
  selected: Party | null | undefined,
  allIcParties: Party[]
): Party[] | null {
  if (!selected) return null;
  if (isIcPeerCompanyGroupId(selected.id)) {
    const row = selected as IcPeerCompanyGroupRow;
    if (Array.isArray(row.icMemberParties) && row.icMemberParties.length > 0) {
      return row.icMemberParties;
    }
    const peerKey = readIcPeerCompanyIdFromGroupId(selected.id);
    if (!peerKey) return null;
    if (peerKey.startsWith("name_")) {
      const slug = peerKey.slice("name_".length);
      return allIcParties.filter((p) => {
        const name = String(p.interCompanyPeerCompanyName || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .slice(0, 48);
        return name === slug;
      });
    }
    return allIcParties.filter(
      (p) => String(p.interCompanyPeerCompanyId || "").trim() === peerKey
    );
  }
  return null;
}
