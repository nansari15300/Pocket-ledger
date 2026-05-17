import fs from "fs";

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = `${d}/${f}`;
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/Details\.tsx$/.test(f)) acc.push(p);
  }
  return acc;
}

function ensureImports(c) {
  const needsCheckbox =
    c.includes("Show Narration") && !c.includes("LedgerFooterCheckboxPill");
  const needsText =
    (c.includes("Page {currentPage}") || c.includes("Total Trxn")) &&
    !c.includes("LedgerFooterTextPill");
  const needsChrome =
    c.includes("border-t overflow-auto") &&
    /<Select[\s\S]{0,400}<SelectTrigger className="h-8/.test(c) &&
    !c.includes("LedgerFooterChromePill");
  const needsColumns =
    c.includes("Columns3") && !c.includes("LedgerFooterColumnsMenu");

  if (!needsCheckbox && !needsText && !needsChrome && !needsColumns) return c;

  const parts = [];
  if (needsCheckbox) parts.push("LedgerFooterCheckboxPill");
  if (needsText) parts.push("LedgerFooterTextPill");
  if (needsChrome) parts.push("LedgerFooterChromePill");
  const chromeImport = parts.length
    ? `import { ${parts.join(", ")} } from "@/components/vouchers/ledgerFooterChrome";\n`
    : "";
  const columnsImport = needsColumns
    ? `import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";\n`
    : "";

  const anchor = c.match(
    /import \{[^}]+\} from "@\/components\/vouchers\/TransactionTableSortDropdown";/
  )?.[0];
  if (!anchor) return c;
  return c.replace(anchor, `${anchor}\n${chromeImport}${columnsImport}`);
}

const showNarrationRe =
  /\s*<motion\.motion\.div[^>]*>|<div className="flex items-center(?: space-x-2)? flex-shrink-0">\s*<Checkbox id="(show-narration-[^"]+)" checked=\{showNarration\} onCheckedChange=\{([^}]+)\} \/>\s*<label[^>]*>Show Narration<\/label>\s*<\/motion\.div>|<motion\.motion\.motion\.div[^>]*>|<div className="flex items-center(?: space-x-2)? flex-shrink-0">\s*<Checkbox id="(show-narration-[^"]+)" checked=\{showNarration\} onCheckedChange=\{([^}]+)\} \/>\s*<label[^>]*>Show Narration<\/label>\s*<\/div>/;

// fixed show narration - copy from working script
const showNarrationRe2 =
  /\s*<div className="flex items-center(?: space-x-2)? flex-shrink-0">\s*<Checkbox id="(show-narration-[^"]+)" checked=\{showNarration\} onCheckedChange=\{([^}]+)\} \/>\s*<label[^>]*>Show Narration<\/label>\s*<\/motion\.div>/;

const showNarrationRe3 =
  /\s*<div className="flex items-center(?: space-x-2)? flex-shrink-0">\s*<Checkbox id="(show-narration-[^"]+)" checked=\{showNarration\} onCheckedChange=\{([^}]+)\} \/>\s*<label[^>]*>Show Narration<\/label>\s*<\/motion\.motion\.div>/;

const showNarrationRe4 =
  /\s*<div className="flex items-center(?: space-x-2)? flex-shrink-0">\s*<Checkbox id="(show-narration-[^"]+)" checked=\{showNarration\} onCheckedChange=\{([^}]+)\} \/>\s*<label[^>]*>Show Narration<\/label>\s*<\/div>/;

const noteRe =
  /\s*<div className="flex items-center gap-2 flex-shrink-0">\s*<Checkbox id="(show-notes-[^"]+)" checked=\{includeNotesInTable\} disabled=\{notesPreferenceLockedOnMobile\} onCheckedChange=\{(c) => setShowNotes\(Boolean\(c\)\)\} \/>\s*<label[^>]*>Note<\/label>\s*<\/div>/;

const columnsTriggerRe =
  /<DropdownMenu>\s*<DropdownMenuTrigger asChild>\s*<Button variant="(?:outline|chromePill)" size="sm" className="[^"]*">\s*<Columns3 className="h-4 w-4" \/>\s*Columns\s*<ChevronDown className="h-4 w-4 opacity-50" \/>\s*<\/Button>\s*<\/DropdownMenuTrigger>\s*/g;

function transformColumnsMenu(c) {
  if (!columnsTriggerRe.test(c)) return c;
  let out = c.replace(columnsTriggerRe, "<LedgerFooterColumnsMenu>\n                ");
  // Close columns menu: first footer columns block only (has col- ids)
  out = out.replace(
    /(<LedgerFooterColumnsMenu>\s*<DropdownMenuContent align="start" className="w-52 p-2">[\s\S]*?<\/DropdownMenuContent>)\s*<\/DropdownMenu>/,
    "$1\n              </LedgerFooterColumnsMenu>"
  );
  return out;
}

function transformFile(file) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes("border-t") || before.length < 500) return false;

  let c = ensureImports(before);

  c = c.replace(
    /className="flex items-center gap-2 sm:gap-4 flex-nowrap/g,
    'className="flex min-w-0 flex-nowrap items-center gap-1.5'
  );
  c = c.replace(
    /className="flex items-center gap-2 justify-end flex-nowrap/g,
    'className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5'
  );

  if (!c.includes("LedgerFooterCheckboxPill")) {
    // already has pill from partial migration
  }
  c = c.replace(
    showNarrationRe4,
    `\n              <LedgerFooterCheckboxPill\n                id="$1"\n                checked={showNarration}\n                onCheckedChange={(checked) => $2}\n                label="Show Narration"\n              />`
  );
  c = c.replace(
    noteRe,
    `\n              <LedgerFooterCheckboxPill\n                id="$1"\n                checked={includeNotesInTable}\n                disabled={notesPreferenceLockedOnMobile}\n                onCheckedChange={(c) => setShowNotes(Boolean(c))}\n                label="Note"\n              />`
  );

  c = transformColumnsMenu(c);

  c = c.replace(
    /<p className="text-sm font-medium flex-shrink-0(?: tabular-nums)?">\s*Page \{currentPage\} of \{totalPages\}\s*<\/p>/g,
    "<LedgerFooterTextPill>Page {currentPage} of {totalPages}</LedgerFooterTextPill>"
  );
  c = c.replace(
    /<p className="text-sm font-medium flex-shrink-0 tabular-nums">\(\{desktopPaginationMeta\.beforeCount\}\)<\/p>/g,
    "<LedgerFooterTextPill>({desktopPaginationMeta.beforeCount})</LedgerFooterTextPill>"
  );
  c = c.replace(
    /<p className="text-sm font-medium flex-shrink-0 tabular-nums">\(\{desktopPaginationMeta\.afterCount\}\)<\/p>/g,
    "<LedgerFooterTextPill>({desktopPaginationMeta.afterCount})</LedgerFooterTextPill>"
  );
  c = c.replace(
    /<p className="text-sm font-medium flex-shrink-0 tabular-nums">Total Trxn \{([^}]+)\}<\/p>/g,
    "<LedgerFooterTextPill>Total Trxn {$1}</LedgerFooterTextPill>"
  );

  c = c.replace(
    /<Button\s+variant="outline"\s+className="h-8 w-8 p-0"/g,
    '<Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"'
  );

  if (!c.includes("</LedgerFooterChromePill>")) {
    c = c.replace(
      /(<Select\s+value=\{[^}]+\}\s+onValueChange=\{[\s\S]*?\}>)\s*<SelectTrigger className="h-8 w-\[70px\]">/g,
      '<LedgerFooterChromePill className="px-1">\n                $1\n                  <SelectTrigger className="h-7 w-[64px] border-0 bg-transparent shadow-none focus:ring-0">'
    );
    c = c.replace(
      /(<\/SelectContent>)\s*<\/Select>\s*(?=<Button)/g,
      "$1\n              </Select>\n              </LedgerFooterChromePill>\n              "
    );
  }

  c = c.replace(
    /<Button variant="outline" size="sm" className="h-8 gap-1 flex-shrink-0 min-w-0">/g,
    '<Button variant="chromePill" size="sm" className="h-8 min-w-0 shrink-0 gap-1">'
  );

  if (c === before) return false;
  if (c.length < before.length * 0.5) {
    console.error("SKIP unsafe", file, before.length, "->", c.length);
    return false;
  }
  fs.writeFileSync(file, c);
  return true;
}

for (const file of walk("src/components")) {
  if (transformFile(file)) console.log("updated", file);
}
