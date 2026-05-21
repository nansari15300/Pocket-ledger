/**
 * Inter Company revert request — target company owner ko Messages → Alerts me notify.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { InterCompanyReverseRequest } from "@/lib/interCompany/interCompanyReverseRequests";
import { readInterCompanyReverseInbox } from "@/lib/interCompany/interCompanyReverseRequests";

async function resolveOwnerUid(ownerId?: string, ownerEmail?: string): Promise<string | null> {
  if (ownerId) {
    const snap = await getDoc(doc(firestore, "users", ownerId));
    if (snap.exists()) {
      const data = snap.data() as { uid?: string };
      return data?.uid || snap.id || null;
    }
  }
  if (ownerEmail) {
    const q = query(collection(firestore, "users"), where("email", "==", ownerEmail));
    const s = await getDocs(q);
    if (!s.empty) {
      const d = s.docs[0].data() as { uid?: string };
      return d?.uid || s.docs[0].id || null;
    }
  }
  return ownerId || null;
}

const LOCAL_READ_KEY = (companyId: string) => `pl-ic-reverse-alert-read::${companyId}`;

function readLocalReadSet(companyId: string): Set<string> {
  if (typeof window === "undefined" || !companyId) return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_READ_KEY(companyId));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeLocalReadSet(companyId: string, set: Set<string>) {
  if (typeof window === "undefined" || !companyId) return;
  localStorage.setItem(LOCAL_READ_KEY(companyId), JSON.stringify(Array.from(set).slice(0, 500)));
}

/** Local-only alert (Firestore sync se pehle) — read state */
export function markInterCompanyReverseAlertReadLocal(companyId: string, requestId: string) {
  const set = readLocalReadSet(companyId);
  set.add(requestId);
  writeLocalReadSet(companyId, set);
}

export function isInterCompanyReverseAlertReadLocal(companyId: string, requestId: string): boolean {
  return readLocalReadSet(companyId).has(requestId);
}

export function countUnreadInterCompanyReverseAlertsLocal(companyId: string): number {
  if (typeof window === "undefined" || !companyId) return 0;
  const read = readLocalReadSet(companyId);
  return readInterCompanyReverseInbox(companyId).filter(
    (r) => r.status === "pending" && !read.has(r.id)
  ).length;
}

/** Target owner ke liye admin_notifications row — Messages → Alerts */
export async function sendInterCompanyReverseRequestAlert(
  req: InterCompanyReverseRequest
): Promise<string | null> {
  if (!req.targetCompanyId?.trim()) return null;

  try {
    const companySnap = await getDoc(doc(firestore, "companies", req.targetCompanyId));
    if (!companySnap.exists()) return null;
    const company = companySnap.data() as {
      ownerId?: string;
      ownerEmail?: string;
      currencySymbol?: string;
    };
    const ownerUid = await resolveOwnerUid(company.ownerId, company.ownerEmail);
    if (!ownerUid) return null;

    const sym = company.currencySymbol ?? "Rs.";
    const amountStr =
      req.amount != null && Number.isFinite(req.amount)
        ? `${sym} ${Number(req.amount).toLocaleString("en-IN")}`
        : null;
    const by = req.requestedByName || "Source company";
    const message = `${req.sourceCompanyName || "Source company"} requested to reverse Inter Company voucher ${req.sourceVoucherNumber || "—"} → ${req.targetVoucherNumber || "—"}. Reason: ${req.reason}`;

    const docRef = await addDoc(collection(firestore, "admin_notifications"), {
      recipientUserId: ownerUid,
      message,
      timestamp: serverTimestamp(),
      isRead: false,
      type: "inter_company_reverse_request",
      kind: "ic_reverse_pending",
      companyId: req.targetCompanyId,
      voucherId: req.targetVoucherId || null,
      voucherNumber: req.targetVoucherNumber || req.sourceVoucherNumber || null,
      voucherType: "inter_company",
      interCompanyRequestId: req.id,
      sourceCompanyId: req.sourceCompanyId,
      sourceCompanyName: req.sourceCompanyName,
      amount: req.amount,
      ...(amountStr ? { amountFormatted: amountStr } : {}),
      attemptedBy: {
        uid: req.requestedByUid || "",
        email: "",
        ...(req.requestedByName ? { name: req.requestedByName } : {}),
      },
      icReverseReason: req.reason,
    });
    return docRef.id;
  } catch (err) {
    console.warn("sendInterCompanyReverseRequestAlert failed:", err);
    return null;
  }
}

/** AlertsTab merge — local pending jinka Firestore alert abhi nahi */
export function interCompanyReverseToLocalAlertNotification(
  req: InterCompanyReverseRequest,
  targetCompanyId: string
): Record<string, unknown> {
  const by = req.requestedByName || req.sourceCompanyName || "Source company";
  return {
    id: `local-ic-rev-${req.id}`,
    message: `${req.sourceCompanyName} requested Inter Company reverse (${req.sourceVoucherNumber} → ${req.targetVoucherNumber}). Reason: ${req.reason}`,
    timestamp: { toDate: () => new Date(req.createdAt) },
    isRead:
      req.status !== "pending" || isInterCompanyReverseAlertReadLocal(targetCompanyId, req.id),
    type: "inter_company_reverse_request",
    kind: "ic_reverse_pending",
    companyId: req.targetCompanyId,
    voucherId: req.targetVoucherId,
    voucherNumber: req.targetVoucherNumber || req.sourceVoucherNumber,
    voucherType: "inter_company",
    interCompanyRequestId: req.id,
    sourceCompanyName: req.sourceCompanyName,
    amount: req.amount,
    attemptedBy: { uid: req.requestedByUid, name: by },
    icReverseReason: req.reason,
    _isLocalIcReverseAlert: true,
  };
}
