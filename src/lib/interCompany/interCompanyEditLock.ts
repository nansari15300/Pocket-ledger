/**
 * Inter Company — save/delete se pehle source voucher par edit lock verify (UI bypass guard).
 */
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  interCompanyVoucherViewerSide,
  isInterCompanyVoucherEditDeleteBlocked,
} from "@/lib/interCompany/interCompanyVoucherHydrate";

const IC_EDIT_DELETE_BLOCKED_MSG =
  "Inter Company voucher cannot be edited or deleted after source approval.";

const IC_DELETE_SOURCE_ONLY_MSG = "Delete this Inter Company voucher from the source company only.";

/** Update/delete: source copy approved ho to pair mutate na ho. */
export async function assertInterCompanyPairEditDeleteAllowed(
  sourceCompanyId: string,
  sourceVoucherId: string | null | undefined
): Promise<void> {
  const vid = String(sourceVoucherId || "").trim();
  const cid = String(sourceCompanyId || "").trim();
  if (!vid || !cid) return;

  const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
  if (!snap.exists()) return;

  const row = { id: snap.id, ...snap.data() } as Record<string, unknown>;
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

  const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
  if (!snap.exists()) return;

  const row = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  if (interCompanyVoucherViewerSide(row) !== "source") {
    throw new Error(IC_DELETE_SOURCE_ONLY_MSG);
  }
  if (isInterCompanyVoucherEditDeleteBlocked(row)) {
    throw new Error(IC_EDIT_DELETE_BLOCKED_MSG);
  }
}
