import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { format as formatDateFns } from "date-fns";
import { AD_DATE_FORMATS, BS_DATE_FORMATS, type ADFormatKey, type BSFormatKey } from "@/lib/dateFormatOptions";
import { formatBsFromAD } from "@/lib/bs-date";
import type { PrintPayload } from "@/lib/printDirect";
import { getPrintColorPalette, type PrintColorMode } from "@/lib/printColorPalette";
import {
  MASTER_PRINT_KIND_LABELS,
  MASTER_PRINT_KIND_ORDER,
  type MasterPrintEntry,
  type MasterPrintKind,
} from "@/lib/printMastersTypes";
import { getMastersPrintSnapshot } from "@/lib/printMastersSnapshot";

const ZERO_BALANCE_EPS = 0.0001;
/** Name + tick only: 4 lists across the page. */
const MASTERS_PAGE_COLUMNS_NAME_ONLY = 4;
/** Name + balance + tick: 3 lists across the page (wider columns). */
const MASTERS_PAGE_COLUMNS_WITH_BALANCE = 3;
/** Max table rows per column before next page (A4, with header/footer). */
const MASTERS_ROWS_PER_COLUMN = 50;

export type MastersDateSystem = "AD" | "BS" | "Both";

export type MastersPrintBuildParams = {
  company: PrintPayload["company"];
  printIncludeLogo?: boolean;
  printIncludeCompanyDetails?: boolean;
  printColorMode?: PrintColorMode;
  masterTypes: MasterPrintKind[];
  includeZeroBalance: boolean;
  /** When true: Name, Balance, tick — 3 page columns. When false: Name, tick — 4 page columns. */
  printMasterIncludeBalance: boolean;
  /** App date setting (AD / BS / Both) — same as ledger print. */
  dateSystem: MastersDateSystem;
  printedAt?: Date;
};

const DEFAULT_AD_FORMAT: ADFormatKey = "yyyy-MM-dd";
const DEFAULT_BS_FORMAT: BSFormatKey = "YYYY-MM-DD";

function getStoredDateFormatAD(): ADFormatKey {
  if (typeof window === "undefined") return DEFAULT_AD_FORMAT;
  const stored = localStorage.getItem("dateFormatAD") as ADFormatKey | null;
  if (stored && AD_DATE_FORMATS.some((f) => f.value === stored)) return stored;
  return DEFAULT_AD_FORMAT;
}

function getStoredDateFormatBS(): BSFormatKey {
  if (typeof window === "undefined") return DEFAULT_BS_FORMAT;
  const stored = localStorage.getItem("dateFormatBS") as BSFormatKey | null;
  if (stored && BS_DATE_FORMATS.some((f) => f.value === stored)) return stored;
  return DEFAULT_BS_FORMAT;
}

export function getStoredDateSystemForMastersPrint(): MastersDateSystem {
  if (typeof window === "undefined") return "BS";
  const s = localStorage.getItem("dateSystem");
  if (s === "AD" || s === "BS" || s === "Both") return s;
  return "BS";
}

/** Printed timestamp line — respects AD/BS/Both + stored format keys (not hard-coded English AD). */
function formatMastersPrintedDateTime(date: Date, dateSystem: MastersDateSystem): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const time = formatDateFns(date, "h:mm a");
  const adFmt = getStoredDateFormatAD();
  const bsFmt = getStoredDateFormatBS();

  let ad = "";
  try {
    ad = formatDateFns(date, adFmt);
  } catch {
    ad = formatDateFns(date, "dd MMM yyyy");
  }

  const bs = formatBsFromAD(date, bsFmt) || ad;

  if (dateSystem === "BS") return `${bs}, ${time}`;
  if (dateSystem === "AD") return `${ad}, ${time}`;
  return `${bs} (${ad}), ${time}`;
}

function getPageColumnCount(includeBalance: boolean): number {
  return includeBalance ? MASTERS_PAGE_COLUMNS_WITH_BALANCE : MASTERS_PAGE_COLUMNS_NAME_ONLY;
}

function isEffectivelyZero(balance: number): boolean {
  return !Number.isFinite(balance) || Math.abs(balance) < ZERO_BALANCE_EPS;
}

function filterEntries(entries: MasterPrintEntry[] | undefined, includeZeroBalance: boolean): MasterPrintEntry[] {
  if (!entries?.length) return [];
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (includeZeroBalance) return sorted;
  return sorted.filter((e) => !isEffectivelyZero(e.balance));
}

function getMastersFormatters(company: PrintPayload["company"]) {
  const decimalPlaces = company.decimalPlaces;
  const showDrCr = company.showDrCr ?? true;
  const showCurrencySymbol = company.showCurrencySymbol ?? true;
  const isZeroDecimal = decimalPlaces === 0;
  const currencyOptions: Intl.NumberFormatOptions = {
    style: "decimal",
    minimumFractionDigits: isZeroDecimal ? 0 : (decimalPlaces ?? 2),
    maximumFractionDigits: isZeroDecimal ? 20 : (decimalPlaces ?? 2),
  };

  const formatBalance = (n: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "-";
    let v = Math.abs(n).toLocaleString("en-IN", currencyOptions);
    if (showCurrencySymbol) v = `Rs. ${v}`;
    if (!showDrCr) return n < 0 ? `-${v}` : v;
    return `${v} ${n >= 0 ? "Dr" : "Cr"}`;
  };

  return { formatBalance };
}

/** Column 1 top→bottom, then column 2, 3… (newspaper order). */
function distributeColumnMajor(entries: MasterPrintEntry[], numCols: number): MasterPrintEntry[][] {
  const n = entries.length;
  if (n === 0) return Array.from({ length: numCols }, () => []);
  const rowsPerCol = Math.ceil(n / numCols);
  const columns: MasterPrintEntry[][] = Array.from({ length: numCols }, () => []);
  for (let c = 0; c < numCols; c++) {
    for (let r = 0; r < rowsPerCol; r++) {
      const idx = c * rowsPerCol + r;
      if (idx < n) columns[c].push(entries[idx]);
    }
  }
  return columns;
}

function paginateEntries(entries: MasterPrintEntry[], rowsPerCol: number, numCols: number): MasterPrintEntry[][] {
  const pageSize = rowsPerCol * numCols;
  const pages: MasterPrintEntry[][] = [];
  for (let i = 0; i < entries.length; i += pageSize) {
    pages.push(entries.slice(i, i + pageSize));
  }
  return pages.length ? pages : [[]];
}

const mastersTableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === node.table.body.length ? 1 : 0.75,
  vLineWidth: () => 0.75,
  hLineColor: () => "black",
  vLineColor: () => "black",
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

const mastersHeaderCellStyle = {
  bold: true,
  fontSize: 7,
  color: "black",
  fillColor: "#ffffff",
} as const;

function tickBoxCell(): TableCell {
  return {
    text: "",
    alignment: "center",
    margin: [2, 3, 2, 3],
  };
}

function buildColumnTable(
  columnEntries: MasterPrintEntry[],
  rowCount: number,
  params: {
    includeBalance: boolean;
    formatBalance: (n: number) => string;
    palette: ReturnType<typeof getPrintColorPalette>;
  }
): Content {
  const { includeBalance, formatBalance, palette } = params;

  const header: TableCell[] = [{ text: "Name", ...mastersHeaderCellStyle, noWrap: true }];
  const widths: (string | number)[] = ["*"];
  if (includeBalance) {
    header.push({
      text: "Balance",
      ...mastersHeaderCellStyle,
      alignment: "right",
      noWrap: true,
    });
    widths.push("auto");
  }
  header.push({
    text: "Remark",
    ...mastersHeaderCellStyle,
    alignment: "center",
    noWrap: true,
  });
  widths.push("auto");

  const body: TableCell[][] = [header];

  for (let r = 0; r < rowCount; r++) {
    const entry = columnEntries[r];
    const row: TableCell[] = [
      entry ? { text: entry.name, fontSize: 7, color: "black" } : { text: "" },
    ];
    if (includeBalance) {
      row.push(
        entry
          ? {
              text: formatBalance(entry.balance),
              fontSize: 7,
              alignment: "right",
              color: palette.balanceSigned(entry.balance),
              noWrap: true,
            }
          : { text: "" }
      );
    }
    row.push(entry ? tickBoxCell() : { text: "" });
    body.push(row);
  }

  return {
    table: { widths, body, dontBreakRows: true },
    layout: mastersTableLayout,
  };
}

/** One page chunk: side-by-side tables (3 with balance, 4 name-only), column-major fill. */
function buildMastersTablePage(
  pageEntries: MasterPrintEntry[],
  params: MastersPrintBuildParams & {
    formatBalance: (n: number) => string;
    palette: ReturnType<typeof getPrintColorPalette>;
  }
): Content {
  const pageCols = getPageColumnCount(params.printMasterIncludeBalance);
  const columns = distributeColumnMajor(pageEntries, pageCols);
  const rowsPerCol = pageEntries.length ? Math.ceil(pageEntries.length / pageCols) : 0;

  const tableParams = {
    includeBalance: params.printMasterIncludeBalance,
    formatBalance: params.formatBalance,
    palette: params.palette,
  };

  return {
    columnGap: 6,
    columns: columns.map((colEntries) => ({
      width: "*",
      stack: [buildColumnTable(colEntries, rowsPerCol, tableParams)],
    })),
  };
}

function buildSectionPages(
  entries: MasterPrintEntry[],
  params: MastersPrintBuildParams,
  formatBalance: (n: number) => string,
  palette: ReturnType<typeof getPrintColorPalette>
): Content[] {
  const pageCols = getPageColumnCount(params.printMasterIncludeBalance);
  const pages = paginateEntries(entries, MASTERS_ROWS_PER_COLUMN, pageCols);
  const blocks: Content[] = [];

  pages.forEach((pageEntries, pageIdx) => {
    if (pageIdx > 0) {
      blocks.push({ text: "", pageBreak: "before" as const });
    }
    blocks.push(
      buildMastersTablePage(pageEntries, {
        ...params,
        formatBalance,
        palette,
      })
    );
  });

  return blocks;
}

export function buildMastersPrintContent(params: MastersPrintBuildParams): Content[] {
  const snapshot = getMastersPrintSnapshot();
  if (!snapshot) {
    return [
      {
        text: "Master data is not loaded yet. Open a company and try again.",
        color: "#b91c1c",
        margin: [0, 12, 0, 0],
      },
    ];
  }

  const palette = getPrintColorPalette(params.printColorMode);
  const { formatBalance } = getMastersFormatters(params.company);
  const printedAt = params.printedAt ?? new Date();
  const dateLine = formatMastersPrintedDateTime(printedAt, params.dateSystem);

  const body: Content[] = [
    {
      text: "Masters list",
      style: "subheader",
      fontSize: 11,
      bold: true,
      margin: [0, 0, 0, 2],
    },
    { text: `Printed: ${dateLine}`, fontSize: 8, color: "#555", margin: [0, 0, 0, 8] },
  ];

  let anySection = false;
  let sectionIndex = 0;
  for (const kind of MASTER_PRINT_KIND_ORDER) {
    if (!params.masterTypes.includes(kind)) continue;
    const entries = filterEntries(snapshot[kind], params.includeZeroBalance);
    if (!entries.length) continue;

    if (sectionIndex > 0) {
      body.push({ text: "", pageBreak: "before" as const });
    }
    sectionIndex += 1;
    anySection = true;

    body.push({
      text: MASTER_PRINT_KIND_LABELS[kind],
      bold: true,
      fontSize: 10,
      margin: [0, 4, 0, 6],
      decoration: "underline",
    });
    body.push(...buildSectionPages(entries, params, formatBalance, palette));
  }

  if (!anySection) {
    body.push({
      text: params.includeZeroBalance
        ? "No masters found for the selected types."
        : "No non-zero balance masters for the selected types. Tick “Include zero balance” to print zero-balance masters.",
      italics: true,
      fontSize: 9,
      margin: [0, 8, 0, 0],
    });
  }

  return body;
}

function buildPrintHeaderFooter(params: MastersPrintBuildParams): {
  header: Content;
  footer: (currentPage: number, pageCount: number) => Content;
  images?: Record<string, string>;
} {
  const palette = getPrintColorPalette(params.printColorMode);
  const includeLogo = params.printIncludeLogo !== false;
  const includeCompanyDetails = params.printIncludeCompanyDetails !== false;
  const printedAt = params.printedAt ?? new Date();
  const dateLine = formatMastersPrintedDateTime(printedAt, params.dateSystem);

  const LOGO_SIZE = 60;
  const LOGO_LEFT_INSET = 20;
  const LOGO_TOP_INSET = 20;
  const POCKET_LEDGER_SITE_URL = "https://pocket-ledger.com";

  const companyInfoStack: Content = {
    stack: includeCompanyDetails
      ? [
          { text: params.company.name, style: "header", alignment: "center" },
          { text: params.company.address || "", style: "sub", alignment: "center", margin: [0, 2, 0, 0] },
          {
            text: [params.company.phone ? `Phone: ${params.company.phone}` : "", params.company.pan ? `PAN: ${params.company.pan}` : ""]
              .filter(Boolean)
              .join(" | "),
            style: "sub",
            alignment: "center",
          },
          { text: `Masters list · ${dateLine}`, style: "body", alignment: "center", margin: [0, 5, 0, 0] },
        ]
      : [{ text: `Masters list · ${dateLine}`, style: "body", alignment: "center", margin: [0, 5, 0, 0] }],
    margin: [0, LOGO_TOP_INSET, 0, 0],
  };

  const noLogoPlaceholder = {
    qr: POCKET_LEDGER_SITE_URL,
    fit: LOGO_SIZE,
    margin: [LOGO_LEFT_INSET, LOGO_TOP_INSET, 0, 0],
  } as Content;

  const leftColumnContent: Content = includeLogo
    ? params.company.logoUrl
      ? { image: "companyLogo", width: LOGO_SIZE, height: LOGO_SIZE, margin: [LOGO_LEFT_INSET, LOGO_TOP_INSET, 0, 0] }
      : noLogoPlaceholder
    : { text: "", margin: [0, 0, 0, 0] };

  const leftRightColumnWidth = LOGO_SIZE + LOGO_LEFT_INSET;

  const header: Content = includeLogo
    ? {
        columns: [
          { ...leftColumnContent, width: leftRightColumnWidth },
          { stack: [companyInfoStack], width: "*" },
          { width: leftRightColumnWidth, text: "" },
        ],
        margin: [0, 0, 0, 10],
      }
    : {
        columns: [{ stack: [companyInfoStack], width: "*" }],
        margin: [0, 0, 0, 10],
      };

  const footer = (currentPage: number, pageCount: number): Content => ({
    columns: [
      {
        text: "pocket-ledger.com",
        link: "https://pocket-ledger.com",
        decoration: "underline",
        color: palette.link,
        alignment: "left",
        fontSize: 8,
        margin: [8, 0, 0, 0],
      },
      {
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: "right",
        fontSize: 8,
        margin: [0, 0, 8, 0],
      },
    ],
    margin: [0, 10, 0, 12],
  });

  const images =
    includeLogo && params.company.logoUrl ? { companyLogo: params.company.logoUrl } : undefined;

  return { header, footer, images };
}

/** Standalone PDF: selected masters only (no ledger/report from the current screen). */
export function buildMastersOnlyDocDefinition(params: MastersPrintBuildParams): TDocumentDefinitions {
  const { header, footer, images } = buildPrintHeaderFooter(params);
  const docDef: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [30, 100, 30, 40],
    header,
    footer,
    content: buildMastersPrintContent(params),
    styles: {
      header: { fontSize: 16, bold: true },
      sub: { fontSize: 9, color: "#555" },
      subheader: { fontSize: 12, bold: true, margin: [0, 0, 0, 0] },
      body: { fontSize: 9 },
    },
  };
  if (images) {
    (docDef as TDocumentDefinitions & { images?: Record<string, string> }).images = images;
  }
  return docDef;
}
