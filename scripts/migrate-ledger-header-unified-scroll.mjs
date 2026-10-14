import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "src/components/party/PartyDetails.tsx",
  "src/components/party/GroupDetails.tsx",
  "src/components/payee/PayeeDetails.tsx",
  "src/components/staff/StaffDetails.tsx",
  "src/components/staff/StaffGroupDetails.tsx",
  "src/components/bank-cash/AccountDetails.tsx",
  "src/components/bank-cash/AccountGroupDetails.tsx",
  "src/components/tax/TaxDetails.tsx",
  "src/components/tax/TaxGroupDetails.tsx",
  "src/components/expenses/ExpenseAccountDetails.tsx",
  "src/components/expenses/ExpenseGroupDetails.tsx",
  "src/components/items/ItemDetails.tsx",
  "src/components/items/ItemGroupDetails.tsx",
];

for (const rel of files) {
  const file = path.join(root, rel);
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("LedgerTxnScrollColumn")) {
    console.log("skip (no column):", rel);
    continue;
  }
  if (s.includes("header={")) {
    console.log("skip (has header):", rel);
    continue;
  }
  const pageIdx = s.indexOf("data-pl-ledger-txn-page");
  if (pageIdx < 0) {
    console.log("skip (no txn page):", rel);
    continue;
  }
  const ribbonIdx = s.indexOf("LEDGER_HEADER_RIBBON_WRAP_CN", pageIdx);
  if (ribbonIdx < 0) {
    console.log("skip (no ribbon):", rel);
    continue;
  }
  const ribbonOpen = s.lastIndexOf("<div", ribbonIdx);
  const scrollIdx = s.indexOf("<LedgerTxnScrollColumn", ribbonIdx);
  if (scrollIdx < 0 || ribbonOpen < 0 || ribbonOpen > scrollIdx) {
    console.log("skip (layout):", rel);
    continue;
  }

  const beforeRibbon = s.slice(0, ribbonOpen);
  const ribbonBlock = s.slice(ribbonOpen, scrollIdx);
  let afterScroll = s.slice(scrollIdx);
  afterScroll = afterScroll.replace(/^(\s*)<LedgerTxnScrollColumn\s*\n/, `$1<LedgerTxnScrollColumn\n$1  header={\n`);
  afterScroll = afterScroll.replace(
    /^(\s*)table=\{/m,
    `$1}\n$1table={`,
  );

  const next = beforeRibbon + ribbonBlock + afterScroll;
  if (next === s) {
    console.log("skip (no change):", rel);
    continue;
  }
  fs.writeFileSync(file, next);
  console.log("updated:", rel);
}
