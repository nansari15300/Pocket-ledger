import type { InterCompanyDeleteRequest } from "@/lib/interCompany/interCompanyDeleteRequests";
import { deleteInterCompanyVoucherPair } from "@/lib/interCompany/saveInterCompanyVoucherPair";

/** Other company ne delete confirm kiya — linked pair recycle bin (edit lock bypass). */
export async function applyInterCompanyDeleteAccept(args: {
  request: InterCompanyDeleteRequest;
  acceptedByUid: string;
}): Promise<void> {
  const req = args.request;
  await deleteInterCompanyVoucherPair({
    sourceCompanyId: req.sourceCompanyId,
    sourceVoucherId: req.sourceVoucherId,
    peerCompanyId: req.targetCompanyId,
    peerVoucherId: req.targetVoucherId,
    deletedByUid: args.acceptedByUid,
    mutualConfirmDelete: true,
  });
}
