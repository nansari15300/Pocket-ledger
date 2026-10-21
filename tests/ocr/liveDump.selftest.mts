/** Text-level fixture from the user's live "Show OCR text" (no word boxes, no table header, no qty/unit on the row). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBill } from "../../src/modules/ocr/parser";
import type { OcrRawResult } from "../../src/modules/ocr/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const text = fs.readFileSync(path.join(here, "fixtures", "jay-oil-live-dump.txt"), "utf8");
const raw: OcrRawResult = {
  text,
  lines: text.split(/\r?\n/).filter((t) => t.trim()).map((t, i) => ({ text: t, confidence: 80, y: 40 + i * 30 })),
  meanConfidence: 80,
  pageHeight: 40 + 30 * 20,
};
let fails = 0;
const eq = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}: got ${JSON.stringify(got)}${ok ? "" : `  want ${JSON.stringify(want)}`}`);
};
const b = parseBill(raw, { kind: "purchase", parties: [], items: [], ownPan: "303687786", ownName: "New Parsa Engineering Workshop" });
const l = b.lineItems?.value?.[0];
eq("line", l && [l.description.replace(/\s*=\s*$/, ""), l.quantity, l.rate, l.amount], ["Diesel <HSD>", 65.663, 175.2, 11504.16]);
eq("lines status (reconciled)", b.lineItems?.status, "fill");
eq("VAT", [b.vat?.value, b.vat?.status], [1495.54, "fill"]);
eq("grand total", [b.total?.value, b.total?.status], [12999.7, "fill"]);
eq("supplier PAN", b.pan?.value ?? (b as { identifiers?: { pan?: string } }).identifiers?.pan, "302566868");
eq("party is not own company", /new parsa/i.test(b.partyName?.value ?? ""), false);
const d = b.date?.value;
eq("date (Nepali 2083/07/01 = 2026-10-18, local)", d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null, [2026, 10, 18]);
eq("address (no trailing ' :')", (b as { identifiers?: { address?: string } }).identifiers?.address, "Itahari-16, Sunsari");
eq("no TDS on this bill (OCR must not set TDS)", b.tds ?? null, null);
if (fails) for (const d of b.debug ?? []) console.log("  dbg:", d);
console.log(fails ? `FAILED (${fails} failure(s))` : "ALL PASSED (0 failure(s))");
process.exit(fails ? 1 : 0);
