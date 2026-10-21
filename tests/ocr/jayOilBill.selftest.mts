/**
 * OCR regression fixture: real Purchase bill (Jay Syarsekalika Oil Center).
 * Same pipeline as the app: 2x upscale + grayscale + contrast stretch -> tesseract (eng, PSM 3 + sparse PSM 11
 * confirm pass) -> linesFromTesseractData -> parseBill. Run: npm run test:ocr
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { linesFromTesseractData } from "../../src/modules/ocr/layout";
import { parseBill } from "../../src/modules/ocr/parser";
import { billVatPercent, cleanItemName, partyNamePrefill, isOwnCompany, otherPans, pickLedgerAccount, planOcrExtras } from "../../src/modules/ocr/extras";
import { sameVoucherBucket } from "../../src/modules/ocr/handoff";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const img = path.join(here, "../ocr-fixtures/jay-oil-bill.png");
const langPath = process.env.OCR_TESSDATA || path.join(root, "public/ocr/tessdata");

// Same pipeline as the browser engine (engine.ts + preprocess.ts): upscale 2x only when long side < 1500,
// grayscale + 1-99 percentile stretch, eng PSM 6 (blocks) + sparse PSM 11 confirm pass.
const w = await createWorker("eng", 1, { langPath, cachePath: path.join(root, "node_modules/.cache/ocr-test"), gzip: true } as never);
async function ocrBrowserLike(src: Buffer) {
  const m = await sharp(src).metadata();
  const sc = Math.max(m.width!, m.height!) < 1500 ? 2 : 1;
  const buf = await sharp(src).resize(Math.round(m.width! * sc)).grayscale().normalise({ lower: 1, upper: 99 }).png().toBuffer();
  await w.setParameters({ tessedit_pageseg_mode: "6" } as never);
  const a = await w.recognize(buf, {}, { blocks: true, text: true } as never);
  await w.setParameters({ tessedit_pageseg_mode: "11" } as never);
  const b = await w.recognize(buf, {}, { text: true } as never);
  return {
    text: a.data.text, lines: linesFromTesseractData(a.data), meanConfidence: a.data.confidence,
    pageHeight: Math.round(m.height! * sc), pageWidth: Math.round(m.width! * sc), altText: b.data.text,
  };
}
const raw = await ocrBrowserLike(await sharp(img).png().toBuffer());
// compressed attachment (what OCR sees if the original-file capture misses)
const rawJpeg = await ocrBrowserLike(await sharp(img).resize({ height: 1024 }).jpeg({ quality: 70 }).toBuffer());
// photo-like inputs that reproduced the live failure (decimal point lost: "175.20000" -> "17520000", VAT "149554")
const degraded: Record<string, Awaited<ReturnType<typeof ocrBrowserLike>>> = {
  "jpeg 1024 q60": await ocrBrowserLike(await sharp(img).resize({ height: 1024 }).jpeg({ quality: 60 }).toBuffer()),
  "small 800": await ocrBrowserLike(await sharp(img).resize({ height: 800 }).jpeg({ quality: 70 }).toBuffer()),
  "blurred": await ocrBrowserLike(await sharp(img).blur(1.2).jpeg({ quality: 70 }).toBuffer()),
  "rotated -2deg": await ocrBrowserLike(await sharp(img).rotate(-2, { background: "#eee" }).resize({ height: 1100 }).jpeg({ quality: 60 }).toBuffer()),
};
await w.terminate();
const bill = parseBill(raw, {
  kind: "purchase",
  parties: [{ id: "p-other", name: "Some Other Traders", pan: "111111111" }],
  items: [{ id: "i-petrol", name: "Petrol" }],
  ownPan: "303687786",
  ownName: "New Parsa Engineering WorkShop",
});

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}${ok ? "" : `  want ${JSON.stringify(want)}`}`);
};
const ymd = (d?: Date) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);
const li = bill.lineItems?.value?.[0];
eq("confidence>=70", raw.meanConfidence >= 70, true);
eq("supplier PAN", bill.identifiers?.pan, "302566868");
eq("seller name", bill.partyName?.value, "Jay Syarsekalika Oil Center");
eq("phone (mobile)", bill.identifiers?.phones.includes("9802081396"), true);
eq("phone (landline)", bill.identifiers?.phones.includes("025-581396"), true);
eq("no PAN-derived phone", (bill.identifiers?.phones ?? []).some((p) => /02566868/.test(p)), false);
eq("address", bill.identifiers?.address, "Itahari-16, Sunsari");
eq("bill no", bill.billNo?.value, "JSKOC/83-84/5396");
eq("date (BS 2083-07-01 -> AD)", [bill.date?.status, ymd(bill.date?.value)], ["fill", "2026-10-18"]);
eq("doc type", bill.docType?.type, "purchase");
eq("payment mode", bill.paymentMode, "Cash");
eq("line status", bill.lineItems?.status, "fill");
eq("line", li && [li.description, li.quantity, li.unit, li.rate, li.amount, li.itemId ?? null], ["Diesel <HSD>", 65.663, "Ltr", 175.2, 11504.16, null]);
eq("VAT", [bill.vat?.status, bill.vat?.value], ["fill", 1495.54]);
eq("grand total", [bill.total?.status, bill.total?.value], ["fill", 12999.7]);
eq("party not auto-filled (no PAN match)", bill.partyId ?? null, null);

// --- hook decisions (pure helpers used by useVoucherOcr) ---
const noVat = planOcrExtras(bill, { taxes: [{ id: "t5", rate: 5, name: "Other 5%" }], partySide: "seller" });
eq("Create Party account type (purchase bill)", noVat.partyAccountType, "creditors");
eq("VAT: no 13% account -> suggest create", noVat.vat, { kind: "create", prefillName: "VAT 13%" });
const withVat = planOcrExtras(bill, { taxes: [{ id: "t13", rate: 13, name: "VAT 13%" }], partySide: "seller" });
eq("VAT: 13% account exists -> apply", withVat.vat, { kind: "apply", taxId: "t13" });
eq("Create item suggestion (unmatched Diesel)", noVat.createItems, [{ index: 0, name: "Diesel", unit: "Ltr", rate: 175.2 }]);
eq("discount 0 -> no Discount suggestion", noVat.showDiscount, false);
const cfg = { systemDefault: "purchase_account", nameRx: /\bpurchases?\b/i };
eq("Purchase A/c by name", pickLedgerAccount([{ value: "x1", label: "Fuel Exp" }, { value: "pa", label: "Purchase A/c" }], cfg), { value: "pa", source: "name" });
eq("Purchase A/c system default (never create)", pickLedgerAccount([{ value: "x1", label: "Fuel Exp" }], cfg), { value: "purchase_account", source: "system" });
eq("Purchase A/c learned per supplier", pickLedgerAccount([{ value: "x1", label: "Fuel Exp" }, { value: "pa", label: "Purchase A/c" }], cfg, "x1"), { value: "x1", source: "learned" });
const billMatched = parseBill(raw, { kind: "purchase", parties: [], items: [{ id: "i-diesel", name: "Diesel" }], ownPan: "303687786", ownName: "New Parsa Engineering WorkShop" });
eq("existing item 'Diesel' matched on line", billMatched.lineItems?.value?.[0]?.itemId ?? null, "i-diesel");
eq("matched item -> no create-item suggestion", planOcrExtras(billMatched, { taxes: [], partySide: "seller" }).createItems.length, 0);

// --- same bill opened in the SALE voucher (own company is the buyer) ---
const own = { name: "New Parsa Engineering WorkShop", pan: "303687786" };
const sb = parseBill(raw, { kind: "sale", parties: [{ id: "self", name: own.name, pan: own.pan }], items: [], ownPan: own.pan, ownName: own.name });
eq("[sale form] party is the supplier, not us", [sb.partyName?.value, sb.identifiers?.pan], ["Jay Syarsekalika Oil Center", "302566868"]);
eq("[sale form] own company never the party", isOwnCompany(sb.partyName?.value, sb.identifiers?.pan, own) || sb.partyId?.value === "self", false);
eq("[sale form] own company detected by name/PAN", [isOwnCompany("NEW PARSA ENGINEERING WORKSHOP", null, own), isOwnCompany(null, "303687786", own)], [true, true]);
eq("[sale form] Switch to Purchase suggested", [sb.docType?.type, sameVoucherBucket("sale", sb.docType!.type)], ["purchase", false]);
eq("[sale form] lines + totals reconcile", [sb.lineItems?.status, sb.vat?.status, sb.total?.status], ["fill", "fill", "fill"]);
eq("[sale form] no Discount suggestion", planOcrExtras(sb, { taxes: [], partySide: "buyer" }).showDiscount, false);

// --- live-app regressions (6:04 PM) ---
eq("item name cleaned", [cleanItemName("(Diesel <HSD>"), cleanItemName("Diesel <HSD>")], ["Diesel", "Diesel"]);
eq("fallback PAN when own company was picked", otherPans(raw.text + "\n" + raw.altText, "303687786"), ["302566868"]);
eq("own company guard (case/spacing)", isOwnCompany("New Parsa Engineering Workshop", "303 687 786", own), true);
eq("VAT % for Create Tax prefill", [billVatPercent(1495.54, 11504.16), billVatPercent(undefined, undefined)], [13, 13]);
const bj = parseBill(rawJpeg as never, { kind: "purchase", parties: [], items: [], ownPan: own.pan, ownName: own.name });
eq("[compressed jpeg] supplier not us", [bj.partyName?.value, bj.identifiers?.pan], ["Jay Syarsekalika Oil Center", "302566868"]);
eq("[compressed jpeg] VAT read", bj.vat?.value, 1495.54);

// --- Alias Name master field ---
const ba = parseBill(raw, { kind: "purchase", parties: [{ id: "p-jsk", name: "JSK Oil Pump", aliasName: "Jay Syarsekalika Oil Center" }], items: [{ id: "i-hsd", name: "High Speed Fuel", aliasName: "Diesel" }], ownPan: own.pan, ownName: own.name });
eq("party matched by alias name", ba.partyId?.value ?? null, "p-jsk");
eq("item matched by alias name", ba.lineItems?.value?.[0]?.itemId ?? null, "i-hsd");

eq("Create Party: clean name, alias = raw bill name", [partyNamePrefill("M/s JAY SYARSEKALIKA OIL CENTER."), partyNamePrefill("Jay Syarsekalika Oil Center")], [{ name: "Jay Syarsekalika Oil Center", aliasName: "M/s JAY SYARSEKALIKA OIL CENTER." }, { name: "Jay Syarsekalika Oil Center", aliasName: "" }]);

for (const [k, r] of Object.entries(degraded)) {
  const b = parseBill(r as never, { kind: "purchase", parties: [], items: [], ownPan: own.pan, ownName: own.name });
  const l = b.lineItems?.value?.[0];
  eq(`[${k}] line found (qty x rate = amount) + VAT + total`, [b.lineItems?.status, l?.amount, l?.quantity, l ? Math.abs(l.quantity * l.rate - l.amount) <= 0.05 : false, b.vat?.value, b.total?.value], ["fill", 11504.16, 65.663, true, 1495.54, 12999.7]);
  if (process.env.OCR_DEBUG && b.lineItems?.status !== "fill") console.log(`--- ${k} ---\n` + (b.debug ?? []).join("\n") + "\n" + r.lines.map((x) => "L " + (x.words ?? []).map((w) => w.text).join(" ")).join("\n"));
  eq(`[${k}] Create item suggested`, planOcrExtras(b, { taxes: [], partySide: "seller" }).createItems.length, 1);
}

if (process.env.OCR_DEBUG || fail) console.log("\n--- rule log ---\n" + (bill.debug ?? []).join("\n"));
console.log(`\n${fail ? "FAILED" : "ALL PASSED"} (${fail} failure(s))`);
process.exit(fail ? 1 : 0);
