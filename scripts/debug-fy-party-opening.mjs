import admin from "firebase-admin";
import { readFileSync } from "fs";
import { startOfDay } from "date-fns";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* noop */
  }
}

loadEnv();
const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
let pk = process.env.FIREBASE_PRIVATE_KEY || "";
if (pk.includes("\\n")) pk = pk.replace(/\\n/g, "\n");

if (!projectId || !process.env.FIREBASE_CLIENT_EMAIL || !pk) {
  console.log("MISSING_ENV");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pk,
    }),
  });
}

const db = admin.firestore();
const partyId = process.argv[2] || "party_mtqw3p9i_9934008c-7e5";
const beforeMs = Number(process.argv[3] || 1784225700000);

const companyIdArg = process.argv[4] || "";
let companyRef = null;
let partyData = null;

if (companyIdArg) {
  const partyDoc = await db.collection("companies").doc(companyIdArg).collection("parties").doc(partyId).get();
  if (!partyDoc.exists) {
    console.log("party not found in company", companyIdArg);
    process.exit(0);
  }
  companyRef = partyDoc.ref.parent.parent;
  partyData = partyDoc.data();
} else {
  const companies = await db.collection("companies").limit(50).get();
  for (const c of companies.docs) {
    const partyDoc = await c.ref.collection("parties").doc(partyId).get();
    if (partyDoc.exists) {
      companyRef = c.ref;
      partyData = partyDoc.data();
      break;
    }
  }
}

if (!companyRef || !partyData) {
  console.log("party not found in first 50 companies — pass companyId as 4th arg");
  process.exit(0);
}
console.log("companyId", companyRef.id);
console.log("beforeMs", beforeMs, new Date(beforeMs).toISOString());
console.log(
  "party OB",
  partyData.openingBalance,
  "OB date raw",
  partyData.openingBalanceDate
);

const hits = [];
let last = null;
for (;;) {
  let q = companyRef
    .collection("vouchers")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(400);
  if (last) q = q.startAfter(last);
  const snap = await q.get();
  if (snap.empty) break;
  for (const d of snap.docs) {
    const v = d.data();
    if (v.isDeleted) continue;
    const rawDate = v.date;
    let dt = null;
    if (rawDate && typeof rawDate.toDate === "function") dt = rawDate.toDate();
    else if (rawDate instanceof Date) dt = rawDate;
    else if (typeof rawDate === "string") dt = new Date(rawDate);
    if (!dt || isNaN(dt.getTime())) continue;
    if (startOfDay(dt).getTime() >= beforeMs) continue;
    const pid = v.partyId;
    const pidStr =
      typeof pid === "string" ? pid : pid && pid.id ? String(pid.id) : String(pid ?? "");
    const touches =
      pidStr === partyId ||
      (Array.isArray(v.entries) &&
        v.entries.some((e) => String(e?.accountId || "") === partyId));
    if (!touches) continue;
    hits.push({
      id: d.id,
      type: v.type,
      date: dt.toISOString(),
      total: Number(v.total ?? v.amount ?? 0),
      partyId: pidStr,
      voucherNumber: v.voucherNumber,
    });
  }
  last = snap.docs[snap.docs.length - 1];
  if (snap.size < 400) break;
}

hits.sort((a, b) => a.date.localeCompare(b.date));
console.log("preFy hits", hits.length);
for (const h of hits) console.log(JSON.stringify(h));

let debit = 0;
let credit = 0;
for (const h of hits) {
  if (["sale", "sale_service", "direct_income"].includes(h.type)) debit += h.total;
  if (["purchase", "purchase_service", "payment_in", "direct_expense"].includes(h.type))
    credit += h.total;
}
const ob = Number(partyData.openingBalance) || 0;
console.log("calc", { ob, debit, credit, closing: ob + debit - credit });
