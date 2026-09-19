import type { DateRange } from "@/components/ui/ad-calendar";
import { openPrintDirect, type PrintPayload } from "@/lib/printDirect";

export type GstrPrintCompany = {
  name: string;
  pan?: string;
  phone?: string;
  address?: string;
  decimalPlaces?: number;
  showDrCr?: boolean;
  showCurrencySymbol?: boolean;
  logoUrl?: string | null;
  country?: string;
  fiscalYearStart?: unknown;
};

export type GstrLinePrintRow = {
  date: string;
  voucherNumber: string;
  partyName: string;
  partyGSTIN: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export type Gstr3bPrintData = {
  sales: { count: number; taxableAmount: number; taxAmount: number; totalAmount: number };
  purchases: { count: number; taxableAmount: number; taxAmount: number; totalAmount: number };
  taxPaid: { count: number; amount: number };
  taxReceived: { count: number; amount: number };
  netTax: number;
};

function cell(
  text: string,
  opts?: { bold?: boolean; align?: "left" | "right" | "center"; fontSize?: number; wrap?: boolean; color?: string }
) {
  return {
    text,
    bold: opts?.bold === true,
    alignment: opts?.align ?? "left",
    fontSize: opts?.fontSize ?? 8,
    noWrap: opts?.wrap !== true,
    color: opts?.color,
  };
}

function formatGstrPeriodCore(
  from: Date,
  to: Date,
  dateSystem: "AD" | "BS" | "Both",
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string
): string {
  const fromBS = formatDateBS(from);
  const toBS = formatDateBS(to);
  const fromAD = formatDate(from);
  const toAD = formatDate(to);
  if (dateSystem === "AD") return `AD: ${fromAD}${to !== from ? ` - ${toAD}` : ""}`;
  if (dateSystem === "BS") return `BS: ${fromBS}${to !== from ? ` - ${toBS}` : ""}`;
  return `AD: ${fromAD} - ${toAD} (BS: ${fromBS} - ${toBS})`;
}

function formatGstrDateRangeText(
  dateRange: DateRange | undefined,
  dateSystem: "AD" | "BS" | "Both",
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string,
  allTimeRange?: DateRange
): string {
  if (dateRange?.from) {
    return formatGstrPeriodCore(dateRange.from, dateRange.to || dateRange.from, dateSystem, formatDate, formatDateBS);
  }
  if (allTimeRange?.from) {
    return `All · ${formatGstrPeriodCore(allTimeRange.from, allTimeRange.to || allTimeRange.from, dateSystem, formatDate, formatDateBS)}`;
  }
  return "All Time";
}

function gstrLeftDateRangeLine(dateRangeText: string) {
  return {
    text: dateRangeText,
    fontSize: 9,
    alignment: "left" as const,
    margin: [0, 0, 0, 8],
  };
}

function printCompany(company: GstrPrintCompany): PrintPayload["company"] {
  return {
    name: company.name,
    pan: company.pan,
    phone: company.phone,
    address: company.address,
    decimalPlaces: company.decimalPlaces,
    showDrCr: company.showDrCr,
    showCurrencySymbol: company.showCurrencySymbol,
    logoUrl: company.logoUrl,
    country: company.country,
    fiscalYearStart: company.fiscalYearStart,
  };
}

export async function openGstrLineItemsPrint(args: {
  company: GstrPrintCompany;
  title: string;
  dateSystem: "AD" | "BS" | "Both";
  dateRange: DateRange | undefined;
  allTimeRange?: DateRange;
  formatDate: (d: Date) => string;
  formatDateBS: (d: Date) => string;
  rows: GstrLinePrintRow[];
  formatAmount: (amount: number) => string;
  emptyMessage: string;
  /** Dr = green (GSTR-1 sales), Cr = red (GSTR-2 purchases). */
  amountSide: "dr" | "cr";
}): Promise<void> {
  const amountColor = args.amountSide === "dr" ? "green" : "red";
  const totals = args.rows.reduce(
    (acc, row) => ({
      taxableAmount: acc.taxableAmount + row.taxableAmount,
      taxAmount: acc.taxAmount + row.taxAmount,
      totalAmount: acc.totalAmount + row.totalAmount,
    }),
    { taxableAmount: 0, taxAmount: 0, totalAmount: 0 }
  );

  const header = [
    cell("Date", { bold: true, fontSize: 9 }),
    cell("Voucher No.", { bold: true, fontSize: 9 }),
    cell("Party Name", { bold: true, fontSize: 9 }),
    cell("GSTIN", { bold: true, fontSize: 9 }),
    cell("Taxable Amount", { bold: true, align: "right", fontSize: 9 }),
    cell("Tax Amount", { bold: true, align: "right", fontSize: 9 }),
    cell("Total Amount", { bold: true, align: "right", fontSize: 9 }),
  ];

  const body: any[] = [header];
  if (args.rows.length === 0) {
    body.push([
      { text: args.emptyMessage, colSpan: 7, alignment: "center", fontSize: 8, italics: true, margin: [0, 8, 0, 8] },
      {},
      {},
      {},
      {},
      {},
      {},
    ]);
  } else {
    for (const row of args.rows) {
      body.push([
        cell(row.date),
        cell(row.voucherNumber),
        cell(row.partyName, { wrap: true }),
        cell(row.partyGSTIN),
        cell(args.formatAmount(row.taxableAmount), { align: "right", color: amountColor }),
        cell(args.formatAmount(row.taxAmount), { align: "right", color: amountColor }),
        cell(args.formatAmount(row.totalAmount), { align: "right", color: amountColor }),
      ]);
    }
    body.push([
      { text: "TOTAL", bold: true, fontSize: 9, colSpan: 4, noWrap: true },
      {},
      {},
      {},
      cell(args.formatAmount(totals.taxableAmount), { bold: true, align: "right", fontSize: 9, color: amountColor }),
      cell(args.formatAmount(totals.taxAmount), { bold: true, align: "right", fontSize: 9, color: amountColor }),
      cell(args.formatAmount(totals.totalAmount), { bold: true, align: "right", fontSize: 9, color: amountColor }),
    ]);
  }

  const dateRangeText = formatGstrDateRangeText(
    args.dateRange,
    args.dateSystem,
    args.formatDate,
    args.formatDateBS,
    args.allTimeRange
  );

  await openPrintDirect(
    {
      company: printCompany(args.company),
      title: args.title,
      context: "daybook",
      dateSystem: args.dateSystem,
      dateRangeText: "",
      vouchersCount: args.rows.length,
      openingBalance: 0,
      transactions: [],
      customContent: [
        gstrLeftDateRangeLine(dateRangeText),
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: ["auto", "auto", "*", "auto", "auto", "auto", "auto"],
            body,
          },
          layout: "lightHorizontalLines",
        },
      ],
    },
    true
  );
}

export async function openGstr3bPrint(args: {
  company: GstrPrintCompany;
  dateSystem: "AD" | "BS" | "Both";
  dateRange: DateRange | undefined;
  allTimeRange?: DateRange;
  formatDate: (d: Date) => string;
  formatDateBS: (d: Date) => string;
  data: Gstr3bPrintData;
  formatAmount: (amount: number, side: "dr" | "cr") => string;
}): Promise<void> {
  const { sales, purchases, taxPaid, taxReceived, netTax } = args.data;
  const header = [
    cell("Description", { bold: true, fontSize: 9 }),
    cell("Count", { bold: true, align: "right", fontSize: 9 }),
    cell("Taxable Amount", { bold: true, align: "right", fontSize: 9 }),
    cell("Tax Amount", { bold: true, align: "right", fontSize: 9 }),
    cell("Total Amount", { bold: true, align: "right", fontSize: 9 }),
  ];

  const dr = "green";
  const cr = "red";
  const netSide: "dr" | "cr" = netTax >= 0 ? "dr" : "cr";
  const netColor = netSide === "dr" ? dr : cr;
  const body: any[] = [
    header,
    [
      cell("Outward Supplies (Sales)", { bold: true }),
      cell(String(sales.count), { align: "right" }),
      cell(args.formatAmount(sales.taxableAmount, "dr"), { align: "right", color: dr }),
      cell(args.formatAmount(sales.taxAmount, "dr"), { align: "right", color: dr }),
      cell(args.formatAmount(sales.totalAmount, "dr"), { align: "right", color: dr }),
    ],
    [
      cell("Inward Supplies (Purchases)", { bold: true }),
      cell(String(purchases.count), { align: "right" }),
      cell(args.formatAmount(purchases.taxableAmount, "cr"), { align: "right", color: cr }),
      cell(args.formatAmount(purchases.taxAmount, "cr"), { align: "right", color: cr }),
      cell(args.formatAmount(purchases.totalAmount, "cr"), { align: "right", color: cr }),
    ],
    [
      cell("Net Tax Paid", { bold: true }),
      cell(String(taxPaid.count), { align: "right" }),
      {},
      cell(args.formatAmount(taxPaid.amount, "cr"), { align: "right", color: cr }),
      {},
    ],
    [
      cell("Net Tax Received", { bold: true }),
      cell(String(taxReceived.count), { align: "right" }),
      {},
      cell(args.formatAmount(taxReceived.amount, "dr"), { align: "right", color: dr }),
      {},
    ],
    [
      {},
      {},
      {},
      {
        columns: [
          { text: "Net Tax Payable", bold: true, fontSize: 8, alignment: "right", noWrap: true, width: "*" },
          {
            text: args.formatAmount(netTax, netSide),
            bold: true,
            fontSize: 9,
            alignment: "right",
            color: netColor,
            noWrap: true,
            width: "auto",
            margin: [6, 0, 0, 0],
          },
        ],
      },
      {},
    ],
  ];

  const dateRangeText = formatGstrDateRangeText(
    args.dateRange,
    args.dateSystem,
    args.formatDate,
    args.formatDateBS,
    args.allTimeRange
  );

  await openPrintDirect(
    {
      company: printCompany(args.company),
      title: "GSTR-3B",
      context: "daybook",
      dateSystem: args.dateSystem,
      dateRangeText: "",
      vouchersCount: 0,
      openingBalance: 0,
      transactions: [],
      customContent: [
        gstrLeftDateRangeLine(dateRangeText),
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto", "auto"],
            body,
          },
          layout: "lightHorizontalLines",
        },
      ],
    },
    true
  );
}
