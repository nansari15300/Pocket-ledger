import fs from "fs";
const files = [
  "src/components/tax/TaxList.tsx",
  "src/components/party/PartyList.tsx",
  "src/components/party/PartyGroupList.tsx",
  "src/components/bank-cash/AccountList.tsx",
  "src/components/staff/StaffList.tsx",
  "src/components/expenses/ExpenseAccountList.tsx",
  "src/components/expenses/ExpenseGroupList.tsx",
  "src/components/items/ItemList.tsx",
  "src/components/items/ItemGroupList.tsx",
];
for (const p of files) {
  let s = fs.readFileSync(p, "utf8");
  const next = s.replace(
    'from "@/lib/masterListChrome";;',
    'from "@/lib/masterListChrome";'
  );
  if (next !== s) {
    fs.writeFileSync(p, next);
    console.log("fixed", p);
  }
}
