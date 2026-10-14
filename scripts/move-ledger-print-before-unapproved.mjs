import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function extractButtonWithPrinter(s, fromIdx, toIdx) {
  const slice = s.slice(fromIdx, toIdx);
  const printerIdx = slice.indexOf("<Printer");
  if (printerIdx < 0) return null;
  const btnStart = slice.lastIndexOf("<Button", printerIdx);
  if (btnStart < 0) return null;
  const btnEnd = slice.indexOf("</Button>", printerIdx);
  if (btnEnd < 0) return null;
  const end = btnEnd + "</Button>".length;
  const block = slice.slice(btnStart, end);
  if (!block.includes("LEDGER_HEADER_PILL_ICON")) return null;
  return {
    block,
    absStart: fromIdx + btnStart,
    absEnd: fromIdx + end,
  };
}

function pillRowBounds(s, unapprovedIdx) {
  const open = s.lastIndexOf("<div className={LEDGER_HEADER_PILL_ROW_CN}>", unapprovedIdx);
  if (open < 0) return null;
  let depth = 0;
  let i = open;
  while (i < s.length) {
    if (s.startsWith("<div", i)) depth += 1;
    if (s.startsWith("</div>", i)) {
      depth -= 1;
      if (depth === 0) {
        return { open, close: i + "</div>".length };
      }
    }
    i += 1;
  }
  return null;
}

const importLine =
  'import { LedgerHeaderPrintButton } from "@/components/vouchers/LedgerHeaderPrintButton";\n';

for (const file of walk(path.join(root, "src"))) {
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("LedgerUnapprovedFilterButton")) continue;
  if (!s.includes("LEDGER_HEADER_PILL_ROW_CN")) continue;
  if (!s.includes("<Printer")) continue;

  const unapprovedIdx = s.indexOf("<LedgerUnapprovedFilterButton");
  if (unapprovedIdx < 0) continue;
  const bounds = pillRowBounds(s, unapprovedIdx);
  if (!bounds) continue;

  const beforeUnapproved = s.slice(bounds.open, unapprovedIdx);
  if (beforeUnapproved.includes("LedgerHeaderPrintButton")) {
    continue;
  }

  const extracted = extractButtonWithPrinter(s, bounds.open, bounds.close);
  if (!extracted) continue;

  let printBlock = extracted.block.trim();
  // Normalize to shared component
  const onClickMatch = printBlock.match(/onClick=\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
  const onClick = onClickMatch ? onClickMatch[1] : "undefined";
  let variant = "outline";
  if (/variant="chromePill"/.test(printBlock)) variant = "chromePill";
  else if (/variant=\{"chromePill"\}/.test(printBlock)) variant = "chromePill";
  else if (/variant=\{[^}]*chromePill/.test(printBlock)) variant = "chromePill";

  const replacement = `<LedgerHeaderPrintButton variant="${variant}" onClick={${onClick}} />`;

  s = s.slice(0, extracted.absStart) + s.slice(extracted.absEnd);
  // Re-find unapproved after removal
  const unapprovedIdx2 = s.indexOf("<LedgerUnapprovedFilterButton", bounds.open);
  if (unapprovedIdx2 < 0) continue;
  s = s.slice(0, unapprovedIdx2) + replacement + "\n              " + s.slice(unapprovedIdx2);

  if (!s.includes("LedgerHeaderPrintButton")) continue;
  if (!s.includes('from "@/components/vouchers/LedgerHeaderPrintButton"')) {
    const importAnchor = s.indexOf("LedgerUnapprovedFilterButton");
    const lineStart = s.lastIndexOf("\n", importAnchor) + 1;
    s = s.slice(0, lineStart) + importLine + s.slice(lineStart);
  }

  fs.writeFileSync(file, s);
  console.log("updated:", path.relative(root, file));
}
