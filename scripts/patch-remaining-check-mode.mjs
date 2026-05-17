import fs from "fs";

const root = process.cwd();
const r = (p) => fs.readFileSync(`${root}/${p}`, "utf8");
const w = (p, s) => fs.writeFileSync(`${root}/${p}`, s, "utf8");

function addImports(s, after) {
  if (s.includes("StatementCheckModeFooterControls")) return s;
  const block =
    `import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";\r\n` +
    `import { useStatementCheckMode } from "@/hooks/useStatementCheckMode";\r\n`;
  const i = s.indexOf(after);
  return s.slice(0, i + after.length) + "\r\n" + block + s.slice(i + after.length);
}

function insertAfterNote(s, noteId, idPrefix, viewMode) {
  if (s.includes(`idPrefix="${idPrefix}"`)) return s;
  const needle = `id="${noteId}"`;
  const idx = s.indexOf(needle);
  const labelIdx = s.indexOf('label="Note"', idx);
  const close = s.indexOf("/>", labelIdx) + 2;
  const ins = `\r\n              <StatementCheckModeFooterControls\r\n                idPrefix="${idPrefix}"\r\n                enabled={statementCheck.checkModeEnabled}\r\n                onEnabledChange={statementCheck.setCheckModeEnabled}\r\n                viewMode={${viewMode}}\r\n                hiddenCount={statementCheck.hiddenCount}\r\n              />`;
  return s.slice(0, close) + ins + s.slice(close);
}

// --- bank AccountDetails ---
{
  let s = r("src/components/bank-cash/AccountDetails.tsx");
  s = addImports(s, 'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";');
  if (!s.includes("statementKeyboardNav")) {
    const anchor =
      "  }, [displayTransactions, spendWiseView, sortBy, sortOrder, openingBalanceForPeriod, company]);\r\n\r\n  const displayTransactionCount";
    const block = `  }, [displayTransactions, spendWiseView, sortBy, sortOrder, openingBalanceForPeriod, company]);\r\n\r\n  // Check mode: hide/mark rows; statement view par running balance dubara (spend-wise par filter only)\r\n  const [statementKeyboardNav, setStatementKeyboardNav] = useState<\r\n    ReadonlyArray<{ id?: string; _rowKey?: string }>\r\n  >([]);\r\n  const statementCheck = useStatementCheckMode({\r\n    companyId: companyId ?? undefined,\r\n    context: "account",\r\n    contextId: account?.id,\r\n    viewMode: spendWiseView ? "bill_wise" : "statement",\r\n    orderedTransactions: sortedTransactions,\r\n    keyboardNavTransactions: statementKeyboardNav,\r\n  });\r\n  const ledgerSortedTransactions = useMemo(() => {\r\n    const filtered = statementCheck.filterTransactions([...sortedTransactions]);\r\n    if (!statementCheck.checkModeActive || spendWiseView) return filtered;\r\n    return recomputeRunningBalanceTopToBottom(filtered, openingBalanceForPeriod);\r\n  }, [\r\n    sortedTransactions,\r\n    statementCheck.filterTransactions,\r\n    statementCheck.checkModeActive,\r\n    spendWiseView,\r\n    openingBalanceForPeriod,\r\n  ]);\r\n\r\n  const displayTransactionCount`;
    if (!s.includes(anchor)) throw new Error("bank AccountDetails anchor");
    s = s.replace(anchor, block);
    // Pagination + blocks use filtered list
    s = s.replace(
      "() => sortedTransactions.filter((t: any) => !(t as any)._spendWiseSpacer).length,\r\n    [sortedTransactions]",
      "() => ledgerSortedTransactions.filter((t: any) => !(t as any)._spendWiseSpacer).length,\r\n    [ledgerSortedTransactions]"
    );
    s = s.replace(
      "() => buildSpendWiseDisplayBlocks(sortedTransactions, spendWiseView),\r\n    [sortedTransactions, spendWiseView]",
      "() => buildSpendWiseDisplayBlocks(ledgerSortedTransactions, spendWiseView),\r\n    [ledgerSortedTransactions, spendWiseView]"
    );
    s = s.replace(
      "paginatedTransactions: sortedTransactions,\r\n        desktopLedgerSliceFlatStart: 0,",
      "paginatedTransactions: ledgerSortedTransactions,\r\n        desktopLedgerSliceFlatStart: 0,"
    );
    s = s.replace("const full = sortedTransactions as any[];", "const full = ledgerSortedTransactions as any[];");
    s = s.replace(
      "const firstIdx = (sortedTransactions as any[]).findIndex",
      "const firstIdx = (ledgerSortedTransactions as any[]).findIndex"
    );
    s = s.replace(
      "const prev = (sortedTransactions as any[])[i] as any;",
      "const prev = (ledgerSortedTransactions as any[])[i] as any;"
    );
    s = s.replace(
      "}, [paginatedTransactions, sortedTransactions, openingBalanceForPeriod]);",
      "}, [paginatedTransactions, ledgerSortedTransactions, openingBalanceForPeriod, statementCheck.adjustPeriodTotals]);"
    );
    // Adjust totals in desktopPageLedgerStats
    const statsNeedle =
      "    return {\r\n      openingForPage,\r\n      periodDrForPage,\r\n      periodCrForPage,\r\n      closingForPage: openingForPage + periodDrForPage - periodCrForPage,\r\n    };\r\n  }, [paginatedTransactions, ledgerSortedTransactions";
    if (s.includes(statsNeedle) && !s.includes("statementCheck.adjustPeriodTotals(pageRows")) {
      s = s.replace(
        "    const periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);\r\n    const periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);\r\n    return {\r\n      openingForPage,\r\n      periodDrForPage,\r\n      periodCrForPage,\r\n      closingForPage: openingForPage + periodDrForPage - periodCrForPage,\r\n    };\r\n  }, [paginatedTransactions, ledgerSortedTransactions, openingBalanceForPeriod, statementCheck.adjustPeriodTotals]);",
        `    let periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);\r\n    let periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);\r\n    let closingForPage = openingForPage + periodDrForPage - periodCrForPage;\r\n    const adjusted = statementCheck.adjustPeriodTotals(pageRows, openingForPage);\r\n    if (adjusted) {\r\n      periodDrForPage = adjusted.periodDrForPage;\r\n      periodCrForPage = adjusted.periodCrForPage;\r\n      closingForPage = adjusted.closingForPage;\r\n    }\r\n    return { openingForPage, periodDrForPage, periodCrForPage, closingForPage };\r\n  }, [paginatedTransactions, ledgerSortedTransactions, openingBalanceForPeriod, statementCheck.adjustPeriodTotals]);`
      );
    }
    // keyboard nav sync
    const pagEnd = s.indexOf("  }, [paginatedTransactions, ledgerSortedTransactions, openingBalanceForPeriod");
    const insFx =
      "\r\n\r\n  useEffect(() => {\r\n    setStatementKeyboardNav((paginatedTransactions as any[]) ?? []);\r\n  }, [paginatedTransactions]);\r\n";
    if (!s.includes("setStatementKeyboardNav")) {
      const at = s.indexOf("  const isFilterActive =", pagEnd);
      s = s.slice(0, at) + insFx + s.slice(at);
    }
  }
  if (!s.includes("{...statementCheck.tableProps}")) {
    const t = s.indexOf('contextId={account.id}\r\n              forceBalanceMode');
    if (t !== -1) {
      s =
        s.slice(0, t) +
        'contextId={account.id}\r\n              {...statementCheck.tableProps}\r\n              forceBalanceMode' +
        s.slice(t + 'contextId={account.id}\r\n              forceBalanceMode'.length);
    }
  }
  s = insertAfterNote(s, "show-notes-account", "account", '"statement"');
  // wrap footer control in !spendWiseView — insert only when note block exists
  s = s.replace(
    `<StatementCheckModeFooterControls\r\n                idPrefix="account"`,
    `{!spendWiseView && (\r\n                <StatementCheckModeFooterControls\r\n                idPrefix="account"`
  );
  s = s.replace(
    /hiddenCount=\{statementCheck\.hiddenCount\}\r\n              \/>\r\n              \{spendWiseView/,
    "hiddenCount={statementCheck.hiddenCount}\r\n              />\r\n              )}\r\n              {spendWiseView"
  );
  w("src/components/bank-cash/AccountDetails.tsx", s);
  console.log("bank AccountDetails");
}

// --- income/expense AccountDetails (oldest-first) ---
function patchOldestFirstLedger(file, cfg) {
  let s = r(file);
  s = addImports(s, cfg.importAfter);
  if (!s.includes("statementKeyboardNav")) {
    const anchor = cfg.afterSortedAnchor;
    const block = `${anchor}\r\n\r\n  const [statementKeyboardNav, setStatementKeyboardNav] = useState<\r\n    ReadonlyArray<{ id?: string; _rowKey?: string }>\r\n  >([]);\r\n  const statementCheck = useStatementCheckMode({\r\n    companyId,\r\n    context: "${cfg.context}",\r\n    contextId: ${cfg.contextId},\r\n    viewMode: "statement",\r\n    orderedTransactions: ${cfg.listVar},\r\n    keyboardNavTransactions: statementKeyboardNav,\r\n  });\r\n  const ledgerListForDisplay = useMemo(() => {\r\n    const filtered = statementCheck.filterTransactions([...${cfg.listVar}]);\r\n    if (!statementCheck.checkModeActive) return filtered;\r\n    return recomputeRunningBalanceTopToBottom(filtered, openingBalanceForPeriod);\r\n  }, [\r\n    ${cfg.listVar},\r\n    statementCheck.filterTransactions,\r\n    statementCheck.checkModeActive,\r\n    openingBalanceForPeriod,\r\n  ]);`;
    if (!s.includes(anchor)) throw new Error(`anchor ${file}`);
    s = s.replace(anchor, block);
    s = s.replaceAll(cfg.listVar, "ledgerListForDisplay");
    // restore hook orderedTransactions source
    s = s.replace(
      "orderedTransactions: ledgerListForDisplay,",
      `orderedTransactions: ${cfg.listVar},`
    );
    s = s.replace(
      `const filtered = statementCheck.filterTransactions([...ledgerListForDisplay]);`,
      `const filtered = statementCheck.filterTransactions([...${cfg.listVar}]);`
    );
    s = s.replace(
      `  }, [\r\n    ledgerListForDisplay,\r\n    statementCheck.filterTransactions,`,
      `  }, [\r\n    ${cfg.listVar},\r\n    statementCheck.filterTransactions,`
    );
    const fx = `\r\n  useEffect(() => {\r\n    setStatementKeyboardNav(paginatedTransactions ?? []);\r\n  }, [paginatedTransactions]);\r\n`;
    if (!s.includes("setStatementKeyboardNav(paginatedTransactions")) {
      const at = s.indexOf(cfg.useEffectBefore);
      s = s.slice(0, at) + fx + s.slice(at);
    }
  }
  if (!s.includes("{...statementCheck.tableProps}")) {
    const needle = `contextId={${cfg.tableContextId}}\r\n`;
    let from = 0;
    while (true) {
      const i = s.indexOf(needle, from);
      if (i === -1) break;
      const close = s.indexOf("/>", i);
      s =
        s.slice(0, close) +
        "\r\n              {...statementCheck.tableProps}" +
        s.slice(close);
      from = close + 30;
    }
  }
  if (cfg.noteId) s = insertAfterNote(s, cfg.noteId, cfg.idPrefix, '"statement"');
  else {
    s = s.replace(
      `</LedgerFooterColumnsMenu>\r\n            </div>\r\n            <motion.div className="flex flex-shrink-0`,
      `</LedgerFooterColumnsMenu>\r\n              <StatementCheckModeFooterControls\r\n                idPrefix="${cfg.idPrefix}"\r\n                enabled={statementCheck.checkModeEnabled}\r\n                onEnabledChange={statementCheck.setCheckModeEnabled}\r\n                viewMode="statement"\r\n                hiddenCount={statementCheck.hiddenCount}\r\n              />\r\n            </div>\r\n            <div className="flex flex-shrink-0`
    );
    // account group uses div not motion
    if (!s.includes(`idPrefix="${cfg.idPrefix}"`)) {
      s = s.replace(
        `</LedgerFooterColumnsMenu>\r\n            </div>\r\n            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5`,
        `</LedgerFooterColumnsMenu>\r\n              <StatementCheckModeFooterControls\r\n                idPrefix="${cfg.idPrefix}"\r\n                enabled={statementCheck.checkModeEnabled}\r\n                onEnabledChange={statementCheck.setCheckModeEnabled}\r\n                viewMode="statement"\r\n                hiddenCount={statementCheck.hiddenCount}\r\n              />\r\n            </motion.div>\r\n            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5`
      );
    }
  }
  w(file, s);
  console.log(file);
}

// account AccountDetails - uses processedTransactions not sorted
{
  let s = r("src/components/account/AccountDetails.tsx");
  s = addImports(s, 'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";');
  if (!s.includes("statementKeyboardNav")) {
    const anchor = "  const totalPages =\r\n    rowsPerPage > 0 ? Math.ceil(processedTransactions.length / rowsPerPage) : 1;";
    const block = `  const [statementKeyboardNav, setStatementKeyboardNav] = useState<\r\n    ReadonlyArray<{ id?: string; _rowKey?: string }>\r\n  >([]);\r\n  const statementCheck = useStatementCheckMode({\r\n    companyId,\r\n    context: "account",\r\n    contextId: account?.id,\r\n    viewMode: "statement",\r\n    orderedTransactions: processedTransactions,\r\n    keyboardNavTransactions: statementKeyboardNav,\r\n  });\r\n  const ledgerListForDisplay = useMemo(() => {\r\n    const filtered = statementCheck.filterTransactions([...processedTransactions]);\r\n    if (!statementCheck.checkModeActive) return filtered;\r\n    return recomputeRunningBalanceTopToBottom(filtered, openingBalanceForPeriod);\r\n  }, [\r\n    processedTransactions,\r\n    statementCheck.filterTransactions,\r\n    statementCheck.checkModeActive,\r\n    openingBalanceForPeriod,\r\n  ]);\r\n\r\n  const totalPages =\r\n    rowsPerPage > 0 ? Math.ceil(ledgerListForDisplay.length / rowsPerPage) : 1;`;
    s = s.replace(anchor, block);
    s = s.replace(
      "const list = processedTransactions as any[];",
      "const list = ledgerListForDisplay as any[];"
    );
    s = s.replace(
      "}, [processedTransactions, rowsPerPage, currentPage, openingBalanceForPeriod]);",
      "}, [ledgerListForDisplay, rowsPerPage, currentPage, openingBalanceForPeriod, statementCheck.adjustPeriodTotals]);"
    );
    // adjust totals in ledgerPagination
    if (!s.includes("statementCheck.adjustPeriodTotals(pageRows")) {
      s = s.replace(
        "    const periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);\r\n    const periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);\r\n    return {\r\n      pageRows,\r\n      openingForPage,\r\n      periodDrForPage,\r\n      periodCrForPage,\r\n      closingForPage: openingForPage + periodDrForPage - periodCrForPage,\r\n    };",
        `    let periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);\r\n    let periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);\r\n    let closingForPage = openingForPage + periodDrForPage - periodCrForPage;\r\n    const adjusted = statementCheck.adjustPeriodTotals(pageRows, openingForPage);\r\n    if (adjusted) {\r\n      periodDrForPage = adjusted.periodDrForPage;\r\n      periodCrForPage = adjusted.periodCrForPage;\r\n      closingForPage = adjusted.closingForPage;\r\n    }\r\n    return { pageRows, openingForPage, periodDrForPage, periodCrForPage, closingForPage };`
      );
    }
    const at = s.indexOf("  /** Page2+ Dated date");
    s =
      s.slice(0, at) +
      "\r\n  useEffect(() => {\r\n    setStatementKeyboardNav(paginatedTransactions ?? []);\r\n  }, [paginatedTransactions]);\r\n" +
      s.slice(at);
  }
  if (!s.includes("companyId")) {
    s = s.replace("const { company } = useCompany();", "const { company, companyId } = useCompany();");
  }
  if (!s.includes("recomputeRunningBalanceTopToBottom")) {
    s = s.replace(
      'import { useTransactions } from "@/hooks/use-transactions";',
      'import { useTransactions } from "@/hooks/use-transactions";\r\nimport { recomputeRunningBalanceTopToBottom } from "@/lib/transactionSort";'
    );
  }
  s = s.replace(
    `</LedgerFooterColumnsMenu>\r\n            </div>\r\n            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">\r\n              <LedgerFooterTextPill>Page {currentPage} of {totalPages}</LedgerFooterTextPill>`,
    `</LedgerFooterColumnsMenu>\r\n              <StatementCheckModeFooterControls\r\n                idPrefix="income-expense-account"\r\n                enabled={statementCheck.checkModeEnabled}\r\n                onEnabledChange={statementCheck.setCheckModeEnabled}\r\n                viewMode="statement"\r\n                hiddenCount={statementCheck.hiddenCount}\r\n              />\r\n            </div>\r\n            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">\r\n              <LedgerFooterTextPill>Page {currentPage} of {totalPages}</LedgerFooterTextPill>`
  );
  const needle = "contextId={account.id}\r\n              dateRange";
  const i = s.indexOf(needle);
  if (i !== -1 && !s.includes("{...statementCheck.tableProps}")) {
    const close = s.indexOf("/>", i);
    s = s.slice(0, close) + "\r\n              {...statementCheck.tableProps}" + s.slice(close);
  }
  w("src/components/account/AccountDetails.tsx", s);
  console.log("account AccountDetails");
}

// account AccountGroupDetails
{
  let s = r("src/components/account/AccountGroupDetails.tsx");
  s = addImports(s, 'import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";');
  if (!s.includes("statementKeyboardNav")) {
    const anchor = "  const totalPages = Math.max(1, Math.ceil(processedTransactions.length / rowsPerPage));";
    const block = `  const [statementKeyboardNav, setStatementKeyboardNav] = useState<\r\n    ReadonlyArray<{ id?: string; _rowKey?: string }>\r\n  >([]);\r\n  const statementCheck = useStatementCheckMode({\r\n    companyId,\r\n    context: "group",\r\n    contextId: group?.id,\r\n    viewMode: "statement",\r\n    orderedTransactions: processedTransactions,\r\n    keyboardNavTransactions: statementKeyboardNav,\r\n  });\r\n  const ledgerListForDisplay = useMemo(() => {\r\n    const filtered = statementCheck.filterTransactions([...processedTransactions]);\r\n    if (!statementCheck.checkModeActive) return filtered;\r\n    return recomputeRunningBalanceTopToBottom(filtered, group.openingBalance || 0);\r\n  }, [\r\n    processedTransactions,\r\n    statementCheck.filterTransactions,\r\n    statementCheck.checkModeActive,\r\n    group.openingBalance,\r\n  ]);\r\n\r\n  const totalPages = Math.max(1, Math.ceil(ledgerListForDisplay.length / rowsPerPage));`;
    s = s.replace(anchor, block);
    s = s.replace(
      "const paginatedTransactions = processedTransactions.slice(",
      "const paginatedTransactions = ledgerListForDisplay.slice("
    );
    const at = s.indexOf("  const handleOpenNoteDialog");
    s =
      s.slice(0, at) +
      "\r\n  useEffect(() => {\r\n    setStatementKeyboardNav(paginatedTransactions ?? []);\r\n  }, [paginatedTransactions]);\r\n" +
      s.slice(at);
  }
  if (!s.includes("companyId")) {
    s = s.replace("const { company } = useCompany();", "const { company, companyId } = useCompany();");
  }
  if (!s.includes("recomputeRunningBalanceTopToBottom")) {
    s = s.replace(
      'import { useTransactions } from "@/hooks/use-transactions";',
      'import { useTransactions } from "@/hooks/use-transactions";\r\nimport { recomputeRunningBalanceTopToBottom } from "@/lib/transactionSort";'
    );
  }
  if (!s.includes("useState")) {
    s = s.replace(
      'import { useMemo } from "react";',
      'import { useMemo, useState, useEffect } from "react";'
    );
  }
  s = s.replace(
    `label="Show Narration"\r\n              />\r\n              <LedgerFooterColumnsMenu>`,
    `label="Show Narration"\r\n              />\r\n              <StatementCheckModeFooterControls\r\n                idPrefix="income-expense-group"\r\n                enabled={statementCheck.checkModeEnabled}\r\n                onEnabledChange={statementCheck.setCheckModeEnabled}\r\n                viewMode="statement"\r\n                hiddenCount={statementCheck.hiddenCount}\r\n              />\r\n              <LedgerFooterColumnsMenu>`
  );
  const t = s.indexOf('contextId={group.id} showNarration');
  if (t !== -1 && !s.includes("{...statementCheck.tableProps}")) {
    s =
      s.slice(0, t) +
      "contextId={group.id} {...statementCheck.tableProps} showNarration" +
      s.slice(t + "contextId={group.id} showNarration".length);
  }
  w("src/components/account/AccountGroupDetails.tsx", s);
  console.log("account AccountGroupDetails");
}

// PayeeDetails
{
  let s = r("src/components/payee/PayeeDetails.tsx");
  s = addImports(s, 'import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";');
  if (!s.includes("statementKeyboardNav")) {
    const anchor =
      "    [displayTransactions, sortBy, sortOrder, openingBalanceForPeriod, company]\r\n  );\r\n  \r\n  const totalPages = rowsPerPage > 0";
    const block = `    [displayTransactions, sortBy, sortOrder, openingBalanceForPeriod, company]\r\n  );\r\n\r\n  const [statementKeyboardNav, setStatementKeyboardNav] = useState<\r\n    ReadonlyArray<{ id?: string; _rowKey?: string }>\r\n  >([]);\r\n  const statementCheck = useStatementCheckMode({\r\n    companyId,\r\n    context: "payee",\r\n    contextId: payee?.id,\r\n    viewMode: "statement",\r\n    orderedTransactions: sortedTransactions,\r\n    keyboardNavTransactions: statementKeyboardNav,\r\n  });\r\n  const ledgerListForDisplay = useMemo(() => {\r\n    const filtered = statementCheck.filterTransactions([...sortedTransactions]);\r\n    if (!statementCheck.checkModeActive) return filtered;\r\n    return recomputeRunningBalanceTopToBottom(filtered, openingBalanceForPeriod);\r\n  }, [\r\n    sortedTransactions,\r\n    statementCheck.filterTransactions,\r\n    statementCheck.checkModeActive,\r\n    openingBalanceForPeriod,\r\n  ]);\r\n\r\n  const totalPages = rowsPerPage > 0`;
    s = s.replace(anchor, block);
    s = s.replace(
      "? Math.ceil(sortedTransactions.length / rowsPerPage) : 1;",
      "? Math.ceil(ledgerListForDisplay.length / rowsPerPage) : 1;"
    );
    s = s.replace(
      "const paginatedTransactions = rowsPerPage > 0 ? sortedTransactions.slice(",
      "const paginatedTransactions = rowsPerPage > 0 ? ledgerListForDisplay.slice("
    );
    s = s.replace(
      ") : sortedTransactions;",
      ") : ledgerListForDisplay;"
    );
    const at = s.indexOf("  const buildDateRangeText = () => {");
    s =
      s.slice(0, at) +
      "\r\n  useEffect(() => {\r\n    setStatementKeyboardNav(paginatedTransactions ?? []);\r\n  }, [paginatedTransactions]);\r\n" +
      s.slice(at);
  }
  s = insertAfterNote(
    s,
    "show-notes-payee",
    "payee",
    'balanceMode === "bill_wise" ? "bill_wise" : "statement"'
  );
  const needle = 'context="payee"\r\n              contextId={payee.id}';
  const i = s.indexOf(needle);
  if (i !== -1 && !s.includes("{...statementCheck.tableProps}")) {
    const close = s.indexOf("/>", i);
    s = s.slice(0, close) + "\r\n              {...statementCheck.tableProps}" + s.slice(close);
  }
  w("src/components/payee/PayeeDetails.tsx", s);
  console.log("PayeeDetails");
}

console.log("all remaining patched");
