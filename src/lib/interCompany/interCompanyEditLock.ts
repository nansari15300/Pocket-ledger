/**
 * Inter Company — save/delete se pehle source voucher par edit lock verify (UI bypass guard).
 */
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  interCompanyVoucherViewerSide,
  isInterCompanyVoucherEditDeleteBlocked,
} from "@/lib/interCompany/interCompanyVoucherHydrate";
import { isPureLocalInterCompanyCompany } from "@/lib/interCompany/localInterCompanyPolicy";

const IC_EDIT_DELETE_BLOCKED_MSG =
  "Inter Company voucher cannot be edited or deleted after source approval.";

const IC_DELETE_SOURCE_ONLY_MSG = "Delete this Inter Company voucher from the source company only.";

async function readInterCompanyVoucherForLock(
  companyId: string,
  voucherId: string
): Promise<Record<string, unknown> | null> {
  const cid = String(companyId || "").trim();
  const vid = String(voucherId || "").trim();
  if (!cid || !vid) return null;
  const local = await getCompanyDocFromBrowserDb(cid, "vouchers", vid);
  if (local) return local as Record<string, unknown>;
  if (await isPureLocalInterCompanyCompany(cid)) return null;
  try {
    const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
    return snap.exists()
      ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Update/delete: source copy approved ho to pair mutate na ho. */
export async function assertInterCompanyPairEditDeleteAllowed(
  sourceCompanyId: string,
  sourceVoucherId: string | null | undefined
): Promise<void> {
  const vid = String(sourceVoucherId || "").trim();
  const cid = String(sourceCompanyId || "").trim();
  if (!vid || !cid) return;

  const row = await readInterCompanyVoucherForLock(cid, vid);
  if (!row) return;
  if (isInterCompanyVoucherEditDeleteBlocked(row)) {
    throw new Error(IC_EDIT_DELETE_BLOCKED_MSG);
  }
}

/** Recycle bin: delete sirf source company + unapproved source copy se. */
export async function assertInterCompanyDeleteAllowed(
  sourceCompanyId: string,
  sourceVoucherId: string
): Promise<void> {
  const cid = String(sourceCompanyId || "").trim();
  const vid = String(sourceVoucherId || "").trim();
  if (!cid || !vid) {
    throw new Error(IC_DELETE_SOURCE_ONLY_MSG);
  }

  const row = await readInterCompanyVoucherForLock(cid, vid);
  if (!row) return;
  if (interCompanyVoucherViewerSide(row) !== "source") {
    throw new Error(IC_DELETE_SOURCE_ONLY_MSG);
  }
  if (isInterCompanyVoucherEditDeleteBlocked(row)) {
    throw new Error(IC_EDIT_DELETE_BLOCKED_MSG);
  }
}
