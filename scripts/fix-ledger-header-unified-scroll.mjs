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

function findRibbonOpen(s, pageIdx) {
  const patterns = [
    "<div className={LEDGER_HEADER_RIBBON_WRAP_CN}>",
    '<div className={cn("flex-shrink-0", LEDGER_HEADER_RIBBON_WRAP_CN)}>',
  ];
  let open = -1;
  for (const p of patterns) {
    const i = s.indexOf(p, pageIdx);
    if (i >= 0 && (open < 0 || i < open)) open = i;
  }
  return open;
}

function extractRibbonBlock(s, pageIdx) {
  const open = findRibbonOpen(s, pageIdx);
  if (open < 0) return null;
  let depth = 0;
  let i = open;
  while (i < s.length) {
    if (s.startsWith("<div", i)) depth += 1;
    if (s.startsWith("</div>", i)) {
      depth -= 1;
      if (depth === 0) {
        const end = i + "</div>".length;
        return { open, end, block: s.slice(open, end) };
      }
    }
    i += 1;
  }
  return null;
}

for (const rel of files) {
  const file = path.join(root, rel);
  let s = fs.readFileSync(file, "utf8");
  const pageIdx = s.indexOf('data-pl-ledger-txn-page=""');
  if (pageIdx < 0) continue;
  const ribbon = extractRibbonBlock(s, pageIdx);
  if (!ribbon) {
    console.log("skip ribbon:", rel);
    continue;
  }
  const scrollIdx = s.indexOf("<LedgerTxnScrollColumn", ribbon.end);
  if (scrollIdx < 0) {
    console.log("skip scroll:", rel);
    continue;
  }
  const beforePageContent = s.slice(0, ribbon.open);
  const afterScroll = s.slice(scrollIdx);
  if (!afterScroll.includes("table={")) {
    console.log("skip no table:", rel);
    continue;
  }

  let fixedScroll = afterScroll.replace(
    /<LedgerTxnScrollColumn\s*\n\s*header=\{\s*\}\s*\n\s*table=\{/,
    "<LedgerTxnScrollColumn\n          header={\n" + ribbon.block + "\n          }\n          table={",
  );
  if (fixedScroll === afterScroll) {
    fixedScroll = afterScroll.replace(
      /<LedgerTxnScrollColumn\s*\n\s*table=\{/,
      "<LedgerTxnScrollColumn\n          header={\n" + ribbon.block + "\n          }\n          table={",
    );
  }
  if (fixedScroll === afterScroll) {
    console.log("skip pattern:", rel);
    continue;
  }

  const mid = s.slice(ribbon.end, scrollIdx);
  const next = beforePageContent + mid.replace(ribbon.block, "").trimStart() + fixedScroll;
  // Remove orphaned ribbon if still before scroll
  const next2 = next.replace(
    /(\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?)<div className=\{LEDGER_HEADER_RIBBON_WRAP_CN\}>[\s\S]*?<\/div>\s*(?=\s*<LedgerTxnScrollColumn)/,
    "$1",
  );
  fs.writeFileSync(file, next2.includes("<LedgerTxnScrollColumn") ? next2 : next);
  console.log("fixed:", rel);
}
