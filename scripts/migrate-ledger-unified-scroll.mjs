import fs from "fs";

const files = [
  "src/components/bank-cash/AccountDetails.tsx",
  "src/components/bank-cash/AccountGroupDetails.tsx",
  "src/components/tax/TaxDetails.tsx",
  "src/components/tax/TaxGroupDetails.tsx",
  "src/components/staff/StaffGroupDetails.tsx",
  "src/components/items/ItemDetails.tsx",
  "src/components/items/ItemGroupDetails.tsx",
  "src/components/payee/PayeeDetails.tsx",
  "src/components/expenses/ExpenseAccountDetails.tsx",
  "src/components/expenses/ExpenseGroupDetails.tsx",
];

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (s.includes("LedgerTxnScrollColumn")) {
    console.log("skip", f);
    continue;
  }
  if (!s.includes("LEDGER_TXN_SCROLL_HOST_CN")) {
    console.log("no host", f);
    continue;
  }

  s = s.replace(/\n  LEDGER_TXN_SCROLL_HOST_CN,\n  LEDGER_TXN_TABLE_HOST_CN,/g, "");
  s = s.replace(/\n  LEDGER_TXN_SCROLL_HOST_CN,\n/g, "");
  s = s.replace(/\n  LEDGER_TXN_TABLE_HOST_CN,\n/g, "");

  if (!s.includes("LedgerTxnScrollColumn")) {
    s = s.replace(
      /} from "@\/lib\/ledgerHeaderChrome";/,
      '} from "@/lib/ledgerHeaderChrome";\nimport { LedgerTxnScrollColumn } from "@/components/vouchers/LedgerTxnScrollColumn";'
    );
  }

  s = s.replace(
    /<div className=\{LEDGER_TXN_SCROLL_HOST_CN\}>\s*<div className=\{cn\(LEDGER_TXN_TABLE_HOST_CN[^}]*\}\)>/g,
    '<LedgerTxnScrollColumn\n        table={\n          <>\n          <div className={cn(LEDGER_TXN_TABLE_HOST_CN, spendWiseView && "p-[2px]")}>'
  );
  s = s.replace(
    /<div className=\{LEDGER_TXN_SCROLL_HOST_CN\}>\s*<div className=\{LEDGER_TXN_TABLE_HOST_CN\}>/g,
    "<LedgerTxnScrollColumn\n        table={\n          <>\n          "
  );

  // Close table host + scroll host before footer comment
  s = s.replace(
    /(\s*)<\/div>\s*<\/div>\s*\n(\s*)\{\/\* Footer[^*]*\*\/\}\s*\n(\s*)<LedgerDesktopFooter/g,
    "$1</>\n$1        }\n$1        footer={\n$3<LedgerDesktopFooter"
  );

  // ItemDetails variant - footer comment different
  s = s.replace(
    /(\s*)<\/div>\s*<\/div>\s*\n(\s*)\{\/\* --- TRANSACTIONS TABLE --- \*\/\}\s*\n/g,
    ""
  );

  fs.writeFileSync(f, s);
  console.log("updated", f);
}
