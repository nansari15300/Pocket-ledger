import fs from "fs";
import path from "path";

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/Details\.tsx$/.test(f)) acc.push(p);
  }
  return acc;
}

const showNarrationRe =
  /\s*<div className="flex items-center(?: space-x-2)? flex-shrink-0">\s*<Checkbox id="(show-narration-[^"]+)" checked=\{showNarration\} onCheckedChange=\{([^}]+)\} \/>\s*<label[^>]*>Show Narration<\/label>\s*<\/div>/;

const noteRe =
  /\s*<div className="flex items-center gap-2 flex-shrink-0">\s*<Checkbox id="(show-notes-[^"]+)" checked=\{includeNotesInTable\} disabled=\{notesPreferenceLockedOnMobile\} onCheckedChange=\{\(c\) => setShowNotes\(Boolean\(c\)\)\} \/>\s*<label[^>]*>Note<\/label>\s*<\/div>/;

for (const file of walk("src/components")) {
  let c = fs.readFileSync(file, "utf8");
  let changed = false;

  if (c.includes("Show Narration") && !c.includes("LedgerFooterCheckboxPill")) {
    if (!c.includes("ledgerFooterChrome")) {
      const anchor = c.includes("StatementCheckModeFooterControls")
        ? 'from "@/components/vouchers/StatementCheckModeFooterControls";'
        : c.includes("TransactionTableSortDropdown")
          ? 'from "@/components/vouchers/TransactionTableSortDropdown";'
          : null;
      if (anchor) {
        c = c.replace(
          anchor,
          `${anchor}\nimport { LedgerFooterCheckboxPill } from "@/components/vouchers/ledgerFooterChrome";`
        );
      }
    }
    const next = c.replace(
      showNarrationRe,
      `\n              <LedgerFooterCheckboxPill\n                id="$1"\n                checked={showNarration}\n                onCheckedChange={(checked) => $2}\n                label="Show Narration"\n              />`
    );
    if (next !== c) {
      c = next;
      changed = true;
    }
  }

  if (c.includes(">Note</label>") && noteRe.test(c)) {
    const next = c.replace(
      noteRe,
      `\n              <LedgerFooterCheckboxPill\n                id="$1"\n                checked={includeNotesInTable}\n                disabled={notesPreferenceLockedOnMobile}\n                onCheckedChange={(c) => setShowNotes(Boolean(c))}\n                label="Note"\n              />`
    );
    if (next !== c) {
      c = next;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, c);
    console.log("updated", file);
  }
}
