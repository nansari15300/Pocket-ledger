/**
 * Add Statement Check mode (hook + footer + tableProps) to ledger detail pages.
 * CRLF-safe patches for Windows-checked-out files.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function write(rel, s) {
  fs.writeFileSync(path.join(root, rel), s, "utf8");
}

function ensureImports(s, afterNeedle, importLines) {
  if (s.includes("useStatementLedgerCheckModePaging")) return s;
  const lines =
    importLines ??
    [
      `import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";`,
      `import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";`,
    ];
  const block = lines.map((l) => l + "\r\n").join("");
  const idx = s.indexOf(afterNeedle);
  if (idx === -1) throw new Error(`import anchor not found: ${afterNeedle}`);
  return s.slice(0, idx + afterNeedle.length) + "\r\n" + block + s.slice(idx + afterNeedle.length);
}

function insertFooterAfterNote(s, noteId, idPrefix, viewModeExpr) {
  const marker = `id="${noteId}"`;
  if (s.includes(`idPrefix="${idPrefix}"`) && s.includes("StatementCheckModeFooterControls")) {
    return s;
  }
  const idx = s.indexOf(marker);
  if (idx === -1) throw new Error(`note id not found: ${noteId}`);
  const labelIdx = s.indexOf('label="Note"', idx);
  const closePill = s.indexOf("/>", labelIdx);
  const afterPill = closePill + 2;
  const insert = `\r\n              <StatementCheckModeFooterControls\r\n                idPrefix="${idPrefix}"\r\n                enabled={statementCheck.checkModeEnabled}\r\n                onEnabledChange={statementCheck.setCheckModeEnabled}\r\n                viewMode={${viewModeExpr}}\r\n                hiddenCount={statementCheck.hiddenCount}\r\n              />`;
  return s.slice(0, afterPill) + insert + s.slice(afterPill);
}

function addTableProps(s, contextNeedle) {
  if (s.includes("{...statementCheck.tableProps}")) return s;
  const needle = `statusFilterIdPrefix="${contextNeedle}"`;
  let out = s;
  let from = 0;
  let n = 0;
  while (true) {
    const i = out.indexOf(needle, from);
    if (i === -1) break;
    const close = out.indexOf("/>", i);
    if (close === -1) throw new Error(`table close not found after ${needle}`);
    out = out.slice(0, close) + "\r\n              {...statementCheck.tableProps}" + out.slice(close);
    from = close + 40;
    n++;
  }
  if (n === 0) {
    // fallback: before first context="X" on TransactionsTable blocks without status prefix
    const alt = `context="${contextNeedle}"`;
    const i = out.indexOf(alt);
    if (i === -1) throw new Error(`no table anchor for ${contextNeedle}`);
    const close = out.indexOf("/>", i);
    out = out.slice(0, close) + "\r\n              {...statementCheck.tableProps}" + out.slice(close);
  }
  return out;
}

const hookBlock = (cfg) => `  // Statement check mode + desktop tail paging (PC footer Check mode pill)
  const {
    statementCheck,
    desktopPaginationMeta,
    paginatedTransactions,
    totalPages,
  } = useStatementLedgerCheckModePaging({
    companyId,
    context: "${cfg.context}",
    contextId: ${cfg.contextId},
    viewMode: ${cfg.viewMode},
    searchFilteredTransactions: ${cfg.listVar},
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning: openingBalanceForPeriod,
  });
`;

/** Standard pages: replace old pagination block with hook */
function patchStandardPagination(file, cfg) {
  let s = read(file);
  s = ensureImports(s, cfg.importAfter, cfg.importLines);
  if (cfg.addCompanyId) {
    s = s.replace(
      /const \{ company \} = useCompany\(\);/,
      "const { company, companyId } = useCompany();"
    );
  }
  if (!s.includes("useStatementLedgerCheckModePaging({")) {
    const start = s.indexOf(cfg.replaceStart);
    const end = s.indexOf(cfg.replaceEnd, start);
    if (start === -1 || end === -1) {
      throw new Error(`replace range not found in ${file}`);
    }
    const endLine = s.indexOf("\r\n", end);
    const cutEnd = endLine === -1 ? end + cfg.replaceEnd.length : endLine;
    s = s.slice(0, start) + hookBlock(cfg) + s.slice(cutEnd);
  }
  if (cfg.statsFrom) {
    s = s.replaceAll(cfg.statsFrom, "desktopPaginationMeta");
  }
  s = insertFooterAfterNote(s, cfg.noteId, cfg.idPrefix, cfg.viewMode);
  if (cfg.tableContext) s = addTableProps(s, cfg.tableContext);
  write(file, s);
  console.log("OK", file);
}

// --- TaxDetails: replace desktopPaginationMeta useMemo ---
function patchTaxDetails() {
  const file = "src/components/tax/TaxDetails.tsx";
  let s = read(file);
  s = ensureImports(
    s,
    'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";',
    [
      `import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";`,
      `import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";`,
    ]
  );
  const start = s.indexOf("  // Desktop pagination:");
  const end = s.indexOf("  const paginatedTransactions = desktopPaginationMeta.pageTransactions;");
  if (!s.includes("useStatementLedgerCheckModePaging({")) {
    if (start === -1 || end === -1) throw new Error("TaxDetails pagination block");
    const endLine = s.indexOf("\r\n", end);
    s =
      s.slice(0, start) +
      hookBlock({
        context: "tax",
        contextId: "tax?.id",
        viewMode: 'balanceMode === "bill_wise" ? "bill_wise" : "statement"',
        listVar: "searchFilteredTransactions",
      }) +
      s.slice(endLine);
  }
  s = insertFooterAfterNote(
    s,
    "show-notes-tax",
    "tax",
    'balanceMode === "bill_wise" ? "bill_wise" : "statement"'
  );
  s = addTableProps(s, "tax");
  write(file, s);
  console.log("OK", file);
}

// --- ExpenseAccount: remove early pagination, hook after searchFiltered ---
function patchExpenseAccountDetails() {
  const file = "src/components/expenses/ExpenseAccountDetails.tsx";
  let s = read(file);
  s = ensureImports(
    s,
    'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";',
    [
      `import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";`,
      `import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";`,
    ]
  );
  const earlyStart = s.indexOf("  const totalPages =\r\n    rowsPerPage > 0");
  const earlyEnd = s.indexOf("  }, [paginatedTransactions, sortedTransactions, openingBalanceForPeriod]);");
  if (earlyStart !== -1 && earlyEnd !== -1 && !s.includes("useStatementLedgerCheckModePaging({")) {
    const earlyEndLine = s.indexOf("\r\n", earlyEnd);
    s = s.slice(0, earlyStart) + s.slice(earlyEndLine);
  }
  const anchor = "  }, [searchFilteredTransactions, rowsPerPage, currentPage, openingBalanceForPeriod]);\r\n\r\n  useEffect(() => {";
  if (!s.includes("useStatementLedgerCheckModePaging({")) {
    const i = s.indexOf(anchor);
    if (i === -1) throw new Error("ExpenseAccount anchor");
    const insertAt = i + "  }, [searchFilteredTransactions, rowsPerPage, currentPage, openingBalanceForPeriod]);".length;
    s =
      s.slice(0, insertAt) +
      "\r\n\r\n" +
      hookBlock({
        context: "expense",
        contextId: "account.id",
        viewMode: 'balanceMode === "bill_wise" ? "bill_wise" : "statement"',
        listVar: "searchFilteredTransactions",
      }) +
      s.slice(insertAt);
  }
  s = s.replaceAll("desktopPageLedgerStats", "desktopPaginationMeta");
  s = insertFooterAfterNote(
    s,
    "show-notes-expense-account",
    "expense-account",
    'balanceMode === "bill_wise" ? "bill_wise" : "statement"'
  );
  s = addTableProps(s, "expense");
  write(file, s);
  console.log("OK", file);
}

// --- bank AccountDetails: check mode filter before block paging ---
function patchBankAccountDetails() {
  const file = "src/components/bank-cash/AccountDetails.tsx";
  let s = read(file);
  if (!s.includes("useStatementCheckMode")) {
    s = ensureImports(
      s,
      'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";',
      [
        `import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";`,
        `import { useStatementCheckMode } from "@/hooks/useStatementCheckMode";`,
      ]
    );
    const anchor =
      "  }, [displayTransactions, spendWiseView, sortBy, sortOrder, openingBalanceForPeriod, company]);\r\n\r\n  const displayTransactionCount";
    const hook = `  }, [displayTransactions, spendWiseView, sortBy, sortOrder, openingBalanceForPeriod, company]);\r\n\r\n  // Check mode: filter/hide rows + running balance (statement view only; spend-wise alag pager)\r\n  const statementCheck = useStatementCheckMode({\r\n    companyId: companyId ?? undefined,\r\n    context: "account",\r\n    contextId: account?.id,\r\n    viewMode: spendWiseView ? "bill_wise" : "statement",\r\n    orderedTransactions: sortedTransactions,\r\n    keyboardNavTransactions: paginatedTransactions,\r\n  });\r\n\r\n  const sortedTransactionsForLedger = useMemo(() => {\r\n    const filtered = statementCheck.filterTransactions([...sortedTransactions]);\r\n    if (!statementCheck.checkModeActive || spendWiseView) return filtered;\r\n    return recomputeRunningBalanceTopToBottom(filtered, openingBalanceForPeriod);\r\n  }, [\r\n    sortedTransactions,\r\n    statementCheck.filterTransactions,\r\n    statementCheck.checkModeActive,\r\n    spendWiseView,\r\n    openingBalanceForPeriod,\r\n  ]);\r\n\r\n  const displayTransactionCount`;
    if (!s.includes(anchor)) throw new Error("AccountDetails anchor");
    s = s.replace(anchor, hook);
    // circular ref: keyboardNav uses paginatedTransactions before it's defined - FIX order
  }
  write(file, s);
  console.log("SKIP bank AccountDetails (manual)", file);
}

patchTaxDetails();

patchStandardPagination("src/components/tax/TaxGroupDetails.tsx", {
  importAfter: 'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";',
  addCompanyId: true,
  replaceStart: "  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / rowsPerPage));",
  replaceEnd: "  }, [sortedTransactions, openingBalanceForPeriod, currentPage, totalPages, rowsPerPage]);",
  statsFrom: "desktopPageLedgerStats",
  noteId: "show-notes-tax-group",
  idPrefix: "tax-group",
  viewMode: 'balanceMode === "bill_wise" ? "bill_wise" : "statement"',
  context: "group",
  contextId: "group?.id",
  listVar: "sortedTransactions",
  tableContext: "group",
});

patchStandardPagination("src/components/expenses/ExpenseGroupDetails.tsx", {
  importAfter: 'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";',
  addCompanyId: true,
  replaceStart: "  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / rowsPerPage));",
  replaceEnd: "  }, [paginatedTransactions, sortedTransactions, openingBalanceForPeriod]);",
  statsFrom: "desktopPageLedgerStats",
  noteId: "show-notes-expense-group",
  idPrefix: "expense-group",
  viewMode: 'balanceMode === "bill_wise" ? "bill_wise" : "statement"',
  context: "group",
  contextId: "group?.id",
  listVar: "sortedTransactions",
  tableContext: "group",
});

patchStandardPagination("src/components/items/ItemGroupDetails.tsx", {
  importAfter: 'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";',
  addCompanyId: true,
  replaceStart: "  const totalPages = Math.max(",
  replaceEnd: "  }, [paginatedTransactions, sortedTransactions, openingBalanceForPeriod]);",
  statsFrom: "desktopPageLedgerStats",
  noteId: "show-notes-item-group",
  idPrefix: "item-group",
  viewMode: '"statement"',
  context: "group",
  contextId: "group?.id",
  listVar: "sortedTransactions",
  tableContext: "group",
});

patchExpenseAccountDetails();

console.log("done (payee/account oldest-first: patch manually)");
