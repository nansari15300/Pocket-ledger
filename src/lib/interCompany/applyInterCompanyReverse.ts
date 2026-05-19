/**
 * Target company accept — linked inter_company vouchers par reversal mark + narration + attachments.
 */
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { patchVoucherFields } from "@/lib/voucherActionsClient";
import type { InterCompanyReverseRequest } from "@/lib/interCompany/interCompanyReverseRequests";
import { readInterCompanyLink } from "@/lib/interCompany/interCompanyVoucherHydrate";

function mergeNarration(base: string, suffix: string): string {
  const b = String(base || "").trim();
  if (!b) return suffix;
  if (b.includes(suffix)) return b;
  return `${b}\n${suffix}`;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function readVoucher(companyId: string, voucherId: string) {
  const snap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, voucherId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Record<string, unknown>) : null;
}

/** Accept: original txn rahe; Dr/Cr reversal note + reverted narration; request attachments voucher par merge */
export async function applyInterCompanyReverseAccept(args: {
  request: InterCompanyReverseRequest;
  acceptedByUid: string;
  acceptedByName?: string;
}): Promise<void> {
  const { request } = args;
  const amount = Number(request.amount) || 0;
  const revLine = `[Inter-company REVERTED this voucher · Req ${request.id.slice(0, 8)} · Dr ${amount} / Cr ${amount} on both sides · ${request.reason}]`;

  const [sourceRow, targetRow] = await Promise.all([
    readVoucher(request.sourceCompanyId, request.sourceVoucherId),
    readVoucher(request.targetCompanyId, request.targetVoucherId),
  ]);

  if (!sourceRow || !targetRow) {
    throw new Error("Linked vouchers not found");
  }

  const attach = uniqueUrls([
    ...(Array.isArray(sourceRow.fileUrls) ? (sourceRow.fileUrls as string[]) : []),
    ...(Array.isArray(targetRow.fileUrls) ? (targetRow.fileUrls as string[]) : []),
    ...request.attachmentUrls,
  ]);

  const reversalMeta = {
    requestId: request.id,
    reversedAt: Date.now(),
    reversedByUid: args.acceptedByUid,
    reversedByName: args.acceptedByName || args.acceptedByUid,
    reason: request.reason,
    drAmount: amount,
    crAmount: amount,
    attachmentUrls: request.attachmentUrls,
  };

  const sourceLink = readInterCompanyLink(sourceRow);
  const targetLink = readInterCompanyLink(targetRow);

  await patchVoucherFields(request.sourceCompanyId, request.sourceVoucherId, {
    interCompanyReversed: true,
    interCompanyReversal: reversalMeta,
    narration: mergeNarration(String(sourceRow.narration || ""), revLine),
    fileUrls: attach,
    interCompanyLink: sourceLink,
  });

  await patchVoucherFields(request.targetCompanyId, request.targetVoucherId, {
    interCompanyReversed: true,
    interCompanyReversal: reversalMeta,
    narration: mergeNarration(String(targetRow.narration || ""), revLine),
    fileUrls: attach,
    interCompanyLink: targetLink,
  });
}
