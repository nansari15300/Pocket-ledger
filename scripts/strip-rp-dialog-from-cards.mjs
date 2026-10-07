import fs from "fs";

const p = "src/components/reports/FinancialSummaryCards.tsx";
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf("<Dialog open={receivablesPayablesOpen}");
const end = s.indexOf("{rpLedgerPopup.popup}", start);
if (start < 0 || end < 0) {
  console.error("not found", start, end);
  process.exit(1);
}
const before = s.slice(0, start);
const after = s.slice(end + "{rpLedgerPopup.popup}".length);
const mid =
  '<Button variant="link" size="sm" className="h-auto p-0" type="button" onClick={() => openOutstandingDialog("both")}>View Details</Button>';
fs.writeFileSync(p, before + mid + after);
console.log("done");
