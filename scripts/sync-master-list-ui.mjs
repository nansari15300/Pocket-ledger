import fs from "fs";
import path from "path";

const root = process.cwd();

const files = [
  "src/components/tax/TaxList.tsx",
  "src/components/party/PartyList.tsx",
  "src/components/party/PartyGroupList.tsx",
  "src/components/bank-cash/AccountList.tsx",
  "src/components/bank-cash/AccountGroupList.tsx",
  "src/components/staff/StaffList.tsx",
  "src/components/staff/StaffGroupList.tsx",
  "src/components/expenses/ExpenseAccountList.tsx",
  "src/components/expenses/ExpenseGroupList.tsx",
  "src/components/items/ItemList.tsx",
  "src/components/items/ItemGroupList.tsx",
];

const shellPatterns = [
  /className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background"/g,
  /className="flex h-full min-h-0 min-w-0 w-full flex-col rounded-b-lg border-t-0 bg-background"/g,
  /className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-x border-b bg-background"/g,
  /className=\{cn\(\s*"flex h-full min-h-0 min-w-0 w-full flex-col rounded-b-lg border-t-0 bg-background"/g,
  /className=\{cn\(\s*"flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background"/g,
];

const unselectedPatterns = [
  [
    /const cardClassName = cn\(\s*!isSelected && "border-gray-300 dark:border-gray-600 border-\[1\.5px\] hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    "const cardClassName = masterListRowUnselectedCn(isSelected);",
  ],
  [
    /const cardClassName = cn\(\s*!isSelected && "border-gray-300 dark:border-gray-600 hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    "const cardClassName = masterListRowUnselectedCn(isSelected);",
  ],
  [
    /const cardClassName = cn\(\s*[\s\S]*?"min-w-0 max-w-full overflow-hidden p-1 cursor-pointer border rounded-lg[\s\S]*?!isSelected && "hover:border-orange-300\/80 hover:bg-orange-50\/30 bg-card hover:bg-accent\/50"\s*\);/g,
    null, // staff group - handle separately
  ],
  [
    /const cardClassName = cn\(\s*[\s\S]*?"min-w-0 max-w-full overflow-hidden p-1 cursor-pointer border"[\s\S]*?!isSelected && "hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    null,
  ],
  [
    /const cardClassName = cn\(\s*[\s\S]*?!isSelected && "border-gray-300 dark:border-gray-600 hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    "const cardClassName = masterListRowUnselectedCn(isSelected);",
  ],
  [
    /const cardClassName = cn\(\s*disabled && "cursor-not-allowed",\s*!isSelected && "border-gray-300 dark:border-gray-600 hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    'const cardClassName = cn(disabled && "cursor-not-allowed", masterListRowUnselectedCn(isSelected));',
  ],
  [
    /const cardClassName = cn\(\s*disabled && "cursor-not-allowed",\s*!isSelected && "border-gray-300 dark:border-gray-600 border-\[1\.5px\] hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    'const cardClassName = cn(disabled && "cursor-not-allowed", masterListRowUnselectedCn(isSelected));',
  ],
];

for (const rel of files) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.log("skip missing", rel);
    continue;
  }
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("masterListRowUnselectedCn") && s.includes("masterListShellCn")) {
    console.log("skip already", rel);
    continue;
  }
  if (!s.includes("masterListChrome")) {
    const importAnchor = s.includes('from "@/lib/listSelectionChrome"')
      ? 'from "@/lib/listSelectionChrome"'
      : s.includes('from "@/lib/system-groups"')
        ? 'from "@/lib/system-groups"'
        : s.includes('from "@/lib/filterMasterEntityListRows"')
          ? 'from "@/lib/filterMasterEntityListRows"'
          : null;
    if (importAnchor) {
      s = s.replace(
        importAnchor,
        `${importAnchor}\nimport { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";`
      );
    } else if (s.includes('from "@/lib/utils"')) {
      s = s.replace(
        'from "@/lib/utils"',
        'from "@/lib/utils"\nimport { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";'
      );
    }
  }

  for (const re of shellPatterns) {
    s = s.replace(re, 'className={masterListShellCn}');
  }
  s = s.replace(
    /className=\{cn\(\s*masterListShellCn,\s*/g,
    "className={cn(masterListShellCn, "
  );
  s = s.replace(
    /className=\{cn\(\s*"flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background"/g,
    "className={cn(masterListShellCn"
  );

  for (const [re, rep] of unselectedPatterns) {
    if (rep) s = s.replace(re, rep);
  }

  // Party group inline class
  s = s.replace(
    /const cardClassName = cn\(\s*"min-w-0 max-w-full overflow-hidden cursor-pointer border",\s*!isSelected && "border-gray-300 dark:border-gray-600 hover:border-orange-300\/80 hover:bg-orange-50\/30"\s*\);/g,
    "const cardClassName = masterListRowUnselectedCn(isSelected);"
  );

  fs.writeFileSync(p, s);
  console.log("patched", rel);
}

console.log("done");
