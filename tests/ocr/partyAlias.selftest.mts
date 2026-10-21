/** Alias-based party matching (OCR) + combobox alias search. Run: npx tsx tests/ocr/partyAlias.selftest.mts */
import { parseBill } from "../../src/modules/ocr/parser";
import { nameSkeleton, skeletonQueryMatches } from "../../src/modules/ocr/translit";

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + ": got " + JSON.stringify(got) + (ok ? "" : " want " + JSON.stringify(want)));
};
const DEV = "\u091C\u092F \u0938\u094D\u092F\u093E\u0930\u094D\u0938\u0947\u0915\u093E\u0932\u093F\u0915\u093E \u0911\u092F\u0932 \u0938\u0947\u0928\u094D\u091F\u0930";
const bill = (name: string) => ({
  text: name + "\nAddress: Itahari-16, Sunsari\nInvoice No: 1234\nDate: 2026-10-18\nGrand Total 1000.00",
  meanConfidence: 90,
  lines: [name, "Address: Itahari-16, Sunsari", "Invoice No: 1234", "Date: 2026-10-18", "Grand Total 1000.00"].map((t, i) => ({ text: t, confidence: 90, y: i * 20 })),
});
const parties = (alias: string) => [
  { id: "dp1", name: "Demo Party 1", aliasName: alias },
  { id: "dp2", name: "Demo Party 2" },
];
const run = (billName: string, alias: string) =>
  parseBill(bill(billName) as never, { kind: "purchase", parties: parties(alias), items: [], ownPan: "303687786", ownName: "New Parsa Engineering WorkShop" } as never).partyId?.value ?? null;

eq("skeleton Roman == Devanagari", nameSkeleton("Jay Syarsekalika Oil Center"), nameSkeleton(DEV));
eq("OCR: Roman bill name, Roman alias -> Demo Party 1", run("Jay Syarsekalika Oil Center", "Jay Syarsekalika Oil Center"), "dp1");
eq("OCR: Roman bill name, Devanagari alias -> Demo Party 1", run("Jay Syarsekalika Oil Center", DEV), "dp1");
eq("OCR: case/spelling drift (JAY SYARSEKALIKA OIL CENTRE) -> Demo Party 1", run("JAY SYARSEKALIKA OIL CENTRE", "Jay Syarsekalika Oil Center"), "dp1");
eq("OCR: unrelated alias -> no auto-fill", run("Jay Syarsekalika Oil Center", "Himalayan Hardware Store"), null);
eq("search Roman query vs Devanagari alias", skeletonQueryMatches("jay oil", DEV), true);
eq("search Devanagari query vs Roman alias", skeletonQueryMatches("\u0938\u094D\u092F\u093E\u0930\u094D\u0938\u0947", "Jay Syarsekalika Oil Center"), true);
eq("search unrelated query", skeletonQueryMatches("hardware", "Jay Syarsekalika Oil Center"), false);
// PAN / phone priority over name (bill: Jay Syarsekalika Oil Center, PAN 302566868, phone 9802081396)
{
  const text = "PAN No : 302566868\nJay Syarsekalika Oil Center\nItahari-16, Sunsari\nPhone No : 025-581396 / 9802081396\nParty Name : New Parsa Engineering Workshop\nPAN No 303687786\nInvoice No: 5396\nGrand Total 1000.00";
  const raw = { text, meanConfidence: 90, lines: text.split("\n").map((t, i) => ({ text: t, confidence: 90, y: i * 20 })) };
  const ctx = (parties: unknown[]) => ({ kind: "purchase", parties, items: [], ownPan: "303687786", ownName: "New Parsa Engineering Workshop" });
  const pid = (parties: unknown[]) => parseBill(raw as never, ctx(parties) as never).partyId?.value ?? null;
  eq("PAN match selects Demo Party 1 (no alias)", pid([{ id: "dp1", name: "Demo Party 1", pan: "302566868" }, { id: "dp2", name: "Demo Party 2" }]), "dp1");
  eq("VAT No field (vatNo) also matches", pid([{ id: "dp1", name: "Demo Party 1", vatNo: "302-566-868" }, { id: "dp2", name: "Demo Party 2" }]), "dp1");
  eq("phone match selects Demo Party 2", pid([{ id: "dp1", name: "Demo Party 1" }, { id: "dp2", name: "Demo Party 2", phone: "+977 9802081396" }]), "dp2");
  eq("own company PAN never selects a party", pid([{ id: "me", name: "Demo Party 1", pan: "303687786" }]), null);
}
// item line unit = manual-pick rule
const { resolveOcrItemUnit } = await import("../../src/modules/ocr/extras");
const diesel = { purchasePriceUnit: "Liter", salePriceUnit: "Liter", unitConversions: [{ fromUnit: "Liter", toUnit: "", conversionFactor: 1 }] };
eq("unit: bill 'Ltr' -> item's 'Liter'", resolveOcrItemUnit(diesel, "Ltr", "purchase"), "Liter");
eq("unit: no bill unit -> item purchase unit", resolveOcrItemUnit(diesel, undefined, "purchase"), "Liter");
eq("unit: bill unit not an item unit -> item default", resolveOcrItemUnit({ salePriceUnit: "Pcs", unitConversions: [{ fromUnit: "Box", toUnit: "Pcs" }] }, "Kg", "sale"), "Pcs");
eq("unit: bill unit among conversions -> kept", resolveOcrItemUnit({ purchasePriceUnit: "Pcs", unitConversions: [{ fromUnit: "Box", toUnit: "Pcs" }] }, "box", "purchase"), "Box");
console.log(fail ? fail + " FAILURE(S)" : "ALL PASSED (0 failure(s))");
process.exit(fail ? 1 : 0);
