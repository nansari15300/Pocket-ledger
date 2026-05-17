import fs from "fs";

function fixBrokenShellCn(s) {
  // Broken: className={masterListShellCn},\n            disabled && "..."
  return s.replace(
    /className=\{masterListShellCn\},\s*\n\s*disabled && "pointer-events-none opacity-60"\s*\n\s*\)\}/g,
    'className={cn(masterListShellCn, disabled && "pointer-events-none opacity-60")}'
  );
}

function fixDoubleSemicolon(s) {
  return s.replace(
    'from "@/lib/masterListChrome";;',
    'from "@/lib/masterListChrome";'
  );
}

function fixItemGroupCard(s) {
  return s.replace(
    /const cardClassName = cn\(\s*"min-w-0 max-w-full overflow-hidden p-1 cursor-pointer border",\s*!isSelected && "hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/,
    "const cardClassName = masterListRowUnselectedCn(isSelected);"
  );
}

function fixItemListCard(s) {
  return s.replace(
    /const cardClassName = cn\(!isSelected && "hover:border-orange-300\/80 hover:bg-orange-50\/30"\);/,
    "const cardClassName = masterListRowUnselectedCn(isSelected);"
  );
}

const files = [
  "src/components/expenses/ExpenseGroupList.tsx",
  "src/components/expenses/ExpenseAccountList.tsx",
  "src/components/items/ItemGroupList.tsx",
  "src/components/items/ItemList.tsx",
  "src/components/tax/TaxList.tsx",
  "src/components/party/PartyList.tsx",
  "src/components/party/PartyGroupList.tsx",
  "src/components/bank-cash/AccountList.tsx",
  "src/components/staff/StaffList.tsx",
];

for (const p of files) {
  let s = fs.readFileSync(p, "utf8");
  const orig = s;
  s = fixBrokenShellCn(s);
  s = fixDoubleSemicolon(s);
  s = fixItemGroupCard(s);
  s = fixItemListCard(s);
  // ExpenseAccountList: motion.div open but </motion.div> missing — fix stray </motion.div> close for main return
  if (p.includes("ExpenseAccountList")) {
    s = s.replace(
      /(<EntityListQuickFilterBar active=\{quickFilter\} onChange=\{setQuickFilter\} \/>\s*)<\/div>(\s*<\/TooltipProvider>\s*\);\s*\})/,
      "$1</motion.div>$2"
    );
  }
  if (s !== orig) {
    fs.writeFileSync(p, s);
    console.log("patched", p);
  }
}
