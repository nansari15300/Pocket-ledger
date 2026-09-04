import type { BalanceSheetRow } from "@/lib/reports/balanceSheetAccounting";
import { isInterCompanyPartyListAccount } from "@/lib/interCompany/interCompanyCounterpartyPartyName";
import {
  buildIcPeerCompanyGroupRows,
  icPeerCompanyGroupId,
  interCompanyClearingAccountDisplayName,
} from "@/lib/interCompany/icPeerCompanyGroups";
import {
  normalizePartyGroupIdForStorage,
  PARTY_SYSTEM_CREDITORS_ID,
  PARTY_SYSTEM_DEBTORS_ID,
} from "@/lib/partySystemGroups";

export const BS_IC_COMPANY_GROUP_NAME = "IC Company";

export const BS_IC_COMPANY_GROUP_ROW_ID_DEBTORS = "group_party_ic_company_sd";
export const BS_IC_COMPANY_GROUP_ROW_ID_CREDITORS = "group_party_ic_company_sc";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function icPartyBranchId(party: { groupId?: string | null }): string {
  const gid = normalizePartyGroupIdForStorage(party.groupId);
  return gid === PARTY_SYSTEM_CREDITORS_ID ? PARTY_SYSTEM_CREDITORS_ID : PARTY_SYSTEM_DEBTORS_ID;
}

function icCompanyGroupRowIdForBranch(branchId: string): string {
  return branchId === PARTY_SYSTEM_CREDITORS_ID
    ? BS_IC_COMPANY_GROUP_ROW_ID_CREDITORS
    : BS_IC_COMPANY_GROUP_ROW_ID_DEBTORS;
}

function aggregateGroupRow(
  accountId: string,
  accountName: string,
  members: BalanceSheetRow[],
  branchId: string,
  flags: Pick<
    BalanceSheetRow,
    "isBalanceSheetIcCompanyGroup" | "isBalanceSheetIcPeerGroup" | "balanceSheetIcPeerGroupKey"
  >
): BalanceSheetRow | null {
  if (members.length === 0) return null;
  const signedBalance = round2(members.reduce((sum, row) => sum + row.signedBalance, 0));
  if (Math.abs(signedBalance) < 0.005) return null;

  const first = members[0]!;
  let assets = 0;
  let liabEq = 0;
  for (const row of members) {
    if (row.category === "Assets") assets += row.amount || 0;
    else if (row.category === "Liabilities" || row.category === "Equity") liabEq += row.amount || 0;
  }

  return {
    accountId,
    accountName,
    group: BS_IC_COMPANY_GROUP_NAME,
    category: first.category,
    ledgerClass: first.ledgerClass,
    amount: first.category === "Assets" ? assets : liabEq,
    signedBalance,
    openingBalance: 0,
    isGroup: true,
    entityType: "party",
    balanceSheetBranchHint: branchId,
    balanceSheetIcParentGroup: BS_IC_COMPANY_GROUP_NAME,
    ...flags,
  };
}

/** Map IC clearing parties → System branch / IC Company / peer company / account (party page parity). */
export function applyBalanceSheetInterCompanyHierarchy(
  rows: BalanceSheetRow[],
  parties: Array<Record<string, unknown>>
): BalanceSheetRow[] {
  const icParties = parties.filter((p) => isInterCompanyPartyListAccount(p as never));
  if (icParties.length === 0) return rows;

  const icIds = new Set(icParties.map((p) => String(p.id || "")));

  const updatedIndividuals = rows
    .filter((r) => !r.isGroup)
    .map((row) => {
      if (!icIds.has(row.accountId)) return row;
      const party = icParties.find((p) => String(p.id) === row.accountId);
      if (!party) return row;
      const peerCompanyName =
        String(party.interCompanyPeerCompanyName || "").trim() || "Company";
      const peerKey = icPeerCompanyGroupId(
        String(party.interCompanyPeerCompanyId || ""),
        peerCompanyName
      );
      return {
        ...row,
        group: peerCompanyName,
        accountName: interCompanyClearingAccountDisplayName(party as never),
        balanceSheetBranchHint: icPartyBranchId(party as { groupId?: string | null }),
        balanceSheetIcPeerGroupKey: peerKey,
        balanceSheetIcParentGroup: BS_IC_COMPANY_GROUP_NAME,
      };
    });

  const icIndividuals = updatedIndividuals.filter((r) => icIds.has(r.accountId));
  const otherIndividuals = updatedIndividuals.filter((r) => !icIds.has(r.accountId));

  const syntheticPeerGroups: BalanceSheetRow[] = [];
  const syntheticIcCompanyGroups: BalanceSheetRow[] = [];

  for (const branchId of [PARTY_SYSTEM_DEBTORS_ID, PARTY_SYSTEM_CREDITORS_ID] as const) {
    const branchParties = icParties.filter((p) => icPartyBranchId(p as { groupId?: string | null }) === branchId);
    if (branchParties.length === 0) continue;

    const branchIndividuals = icIndividuals.filter((r) => r.balanceSheetBranchHint === branchId);
    const peerBuckets = buildIcPeerCompanyGroupRows(branchParties as never[]);

    for (const peer of peerBuckets) {
      const members = branchIndividuals.filter((r) => r.balanceSheetIcPeerGroupKey === peer.id);
      const peerRow = aggregateGroupRow(
        `group_party_${peer.id}`,
        String(peer.name || "Company"),
        members,
        branchId,
        { isBalanceSheetIcPeerGroup: true, balanceSheetIcPeerGroupKey: peer.id }
      );
      if (peerRow) syntheticPeerGroups.push(peerRow);
    }

    const icCompanyRow = aggregateGroupRow(
      icCompanyGroupRowIdForBranch(branchId),
      BS_IC_COMPANY_GROUP_NAME,
      branchIndividuals,
      branchId,
      { isBalanceSheetIcCompanyGroup: true }
    );
    if (icCompanyRow) syntheticIcCompanyGroups.push(icCompanyRow);
  }

  const otherGroupRows = rows.filter((r) => {
    if (!r.isGroup || r.entityType !== "party") return r.isGroup;
    if (r.isBalanceSheetIcCompanyGroup || r.isBalanceSheetIcPeerGroup) return false;
    const members = rows.filter(
      (m) => !m.isGroup && m.entityType === "party" && m.group === r.group && !icIds.has(m.accountId)
    );
    const icOnlyMembers = rows.filter(
      (m) => !m.isGroup && m.entityType === "party" && m.group === r.group && icIds.has(m.accountId)
    );
    if (icOnlyMembers.length > 0 && members.length === 0) return false;
    return true;
  });

  return [
    ...otherIndividuals,
    ...icIndividuals,
    ...otherGroupRows,
    ...syntheticIcCompanyGroups,
    ...syntheticPeerGroups,
  ];
}

export function isBalanceSheetIcCompanyGroupRow(row: BalanceSheetRow): boolean {
  return row.isBalanceSheetIcCompanyGroup === true;
}

export function isBalanceSheetIcPeerGroupRow(row: BalanceSheetRow): boolean {
  return row.isBalanceSheetIcPeerGroup === true;
}

export function balanceSheetIcSearchText(row: BalanceSheetRow): string {
  return [
    row.accountName,
    row.group,
    row.balanceSheetIcParentGroup,
    BS_IC_COMPANY_GROUP_NAME,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
