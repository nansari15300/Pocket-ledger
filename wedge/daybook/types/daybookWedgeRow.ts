import type { WedgeSnapshotMeta } from "@wedge/shared/types/wedgeSnapshot";

export type DaybookWedgeCompanyOption = {
  id: string;
  name: string;
};

export type DaybookWedgeAccountSummaryRow = {
  id: string;
  name: string;
  yesterday: number;
  in: number;
  out: number;
  today: number;
};

export type DaybookWedgeSummary = {
  bankYesterday: number;
  bankIn: number;
  bankOut: number;
  bankToday: number;
  cashYesterday: number;
  cashIn: number;
  cashOut: number;
  cashToday: number;
  totalYesterday: number;
  totalIn: number;
  totalOut: number;
  totalToday: number;
  bankAccounts: DaybookWedgeAccountSummaryRow[];
  cashAccounts: DaybookWedgeAccountSummaryRow[];
};

export type DaybookWedgeRow = {
  id: string;
  voucherNumber: string;
  typeLabel: string;
  partyLine: string;
  amountLine: string;
  sortKey: number;
  titleLine: string;
  narrationLine: string;
  metaLine: string;
  /** AD-only footer — widget date-system toggle. */
  metaLineAd?: string;
  metaLineBs?: string;
  balanceLine: string;
  amountColor: "in" | "out" | "neutral";
  showMenu: boolean;
  showFile: boolean;
  isPendingApproval: boolean;
  /** Entry time only — date re-formatted when date system changes. */
  timePart?: string;
};

export type DaybookWedgeDayBucket = {
  dayIso: string;
  dayLabel: string;
  dayLabelAd?: string;
  dayLabelBs?: string;
  summary: DaybookWedgeSummary;
  rows: DaybookWedgeRow[];
  voucherCount: number;
};

export type DaybookWedgeSnapshot = WedgeSnapshotMeta & {
  wedgeId: "daybook";
  defaultDayIso: string;
  selectedDayIso: string;
  selectedDayLabel: string;
  summary: DaybookWedgeSummary;
  rows: DaybookWedgeRow[];
  days?: DaybookWedgeDayBucket[];
  dateSystem: "AD" | "BS" | "Both";
  /** false → widget sirf AD; true → AD/BS/Both dropdown. */
  isNepalCalendar: boolean;
  companies: DaybookWedgeCompanyOption[];
  voucherCount: number;
};
