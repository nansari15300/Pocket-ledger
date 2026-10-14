import fs from "fs";

const sharedPath = "src/components/vouchers/transactionTableShared.tsx";
let s = fs.readFileSync(sharedPath, "utf8");

const tdsBlock = `        {showCol("tdsTaxable") && (
          <TableCell
            className={cn(
              tdsLedgerRowLayout ? "text-center" : "text-right",
              "tabular-nums align-middle",
              ledgerTdsAmountToneCn,
              tdsRowTextPadCn ?? (ensureMinGaps && LEDGER_TDS_TAXABLE_CELL_PAD_CN)
            )}
            style={ensureMinGaps ? { minWidth: \`\${LEDGER_TDS_TAXABLE_COL_PX}px\` } : undefined}
          >
            {renderHlDrCr(formatAmountCell(Number(transaction._tdsTaxable) || 0), "debit")}
          </TableCell>
        )}
        {showCol("tdsAmount") && (
          <TableCell
            className={cn(
              tdsLedgerRowLayout ? "text-left" : "text-right",
              "tabular-nums align-middle",
              ledgerTdsAmountToneCn ?? "font-semibold",
              tdsRowTextPadCn ?? (ensureMinGaps && LEDGER_TDS_AMOUNT_CELL_PAD_CN)
            )}
            style={ensureMinGaps ? { minWidth: \`\${LEDGER_TDS_AMOUNT_COL_PX}px\` } : undefined}
          >
            {renderHlDrCr(formatAmountCell(Number(transaction._tdsAmount) || 0), "credit")}
          </TableCell>
        )}
`;

if (!s.includes("_tdsTaxable")) {
  const marker = "        {showCol(\"dr\") && (";
  if (!s.includes(marker)) throw new Error("dr marker missing");
  s = s.replace(marker, tdsBlock + marker);
  console.log("Added TDS cells after File in transactionTableShared");
}

const colsOld = `(showCol("voucherNo") ? 1 : 0) +
          (showCol("tdsTaxable") ? 1 : 0) +
          (showCol("tdsAmount") ? 1 : 0) +
          (context === "daybook" ? 1 : 0)`;
const colsMid = `(showCol("voucherNo") ? 1 : 0) +
          (context === "daybook" ? 1 : 0)`;
if (s.includes(colsOld)) {
  s = s.replace(colsOld, colsMid);
  s = s.replace(
    `(showFileColumn ? 1 : 0) +
          (showCol("dr") ? 1 : 0)`,
    `(showFileColumn ? 1 : 0) +
          (showCol("tdsTaxable") ? 1 : 0) +
          (showCol("tdsAmount") ? 1 : 0) +
          (showCol("dr") ? 1 : 0)`
  );
  console.log("Updated colsThroughCredit order");
}

fs.writeFileSync(sharedPath, s);

const ttPath = "src/components/vouchers/TransactionsTable.tsx";
let t = fs.readFileSync(ttPath, "utf8");
const tdsAfterFile = "{renderOpeningBalanceTdsCells()}";
const patterns = [
  /(\<OpeningBalanceFileCellContent fileUrls=\{openingBalanceAttachmentUrls\}[\s\S]*?<\/TableCell>\s*\)\}\s*)(\{showCol\("dr"\))/,
  /(\<OpeningBalanceFileCellContent[\s\S]*?showBookOpeningAboveDatedRow[\s\S]*?<\/TableCell>\s*\)\}\s*)(\{showCol\("dr"\))/g,
];
let n = 0;
for (const re of patterns) {
  t = t.replace(re, (m, a, b) => {
    if (a.includes(tdsAfterFile)) return m;
    n++;
    return `${a}${tdsAfterFile}\n        ${b}`;
  });
}
if (n > 0) {
  fs.writeFileSync(ttPath, t);
  console.log("Added opening balance TDS cells:", n);
} else {
  console.log("Opening balance TDS patches:", t.split(tdsAfterFile).length - 1, "occurrences");
}
