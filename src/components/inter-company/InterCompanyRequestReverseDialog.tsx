"use client";

/**
 * Source company — Payment Out edit par reverse request bhejne ka chhota dialog (reason + files).
 */
import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InterCompanyVoucherAttachments } from "@/components/inter-company/InterCompanyVoucherAttachments";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import type { InterCompanyReverseRequest } from "@/lib/interCompany/interCompanyReverseRequests";
import {
  appendInterCompanyReverseRequest,
  newReverseRequestId,
} from "@/lib/interCompany/interCompanyReverseRequests";
import { interCompanyInputClass } from "@/lib/interCompany/interCompanyVoucherChrome";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  userName?: string;
  draft: Omit<
    InterCompanyReverseRequest,
    "id" | "createdAt" | "status" | "reason" | "attachmentUrls" | "requestedByUid" | "requestedByName"
  >;
  onSent?: () => void;
};

export function InterCompanyRequestReverseDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  userName,
  draft,
  onSent,
}: Props) {
  const { company } = useCompany();
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<(File | string)[]>([]);
  const [sending, setSending] = useState(false);

  const uploadFiles = useCallback(async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      if (typeof file === "string") {
        urls.push(file);
        continue;
      }
      const limit = await checkStorageLimit(
        companyId,
        company?.planId,
        { attachmentsBytes: file.size, storageBytes: file.size },
        company?.storageOption,
      );
      if (!limit.allowed) {
        toast.error(limit.message || "Storage limit reached");
        continue;
      }
      const sRef = storageRef(
        storage,
        `voucher-files/${companyId}/inter_company_reverse/${Date.now()}_${file.name}`
      );
      const snapshot = await uploadBytes(sRef, file);
      urls.push(await getDownloadURL(snapshot.ref));
      await incrementCompanyStorage(companyId, {
        attachmentsBytes: file.size,
        storageBytes: file.size,
      });
    }
    return urls;
  }, [companyId, company?.planId, company?.storageOption, files]);

  const handleSend = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      toast.error("Please enter a reason (at least 3 characters)");
      return;
    }
    setSending(true);
    try {
      const attachmentUrls = await uploadFiles();
      let targetVoucherNumber = String(draft.targetVoucherNumber || "").trim();
      if (!targetVoucherNumber && draft.targetVoucherId && draft.targetCompanyId) {
        const snap = await getDoc(
          doc(firestore, `companies/${draft.targetCompanyId}/vouchers`, draft.targetVoucherId)
        );
        if (snap.exists()) {
          targetVoucherNumber = String(snap.data()?.voucherNumber || "");
        }
      }
      const req: InterCompanyReverseRequest = {
        ...draft,
        targetVoucherNumber,
        id: newReverseRequestId(),
        createdAt: Date.now(),
        status: "pending",
        reason: trimmed,
        attachmentUrls,
        requestedByUid: userId,
        requestedByName: userName,
      };
      appendInterCompanyReverseRequest(req);
      toast.success(`Reverse request sent to ${draft.targetCompanyName || "target company"}`);
      setReason("");
      setFiles([]);
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send request");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request for reverse</DialogTitle>
          <DialogDescription>
            Target company ({draft.targetCompanyName}) will receive this request on their Inter Company
            voucher. They can accept to reverse Dr/Cr on both linked vouchers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why should this inter-company voucher be reversed?"
              className={interCompanyInputClass}
              rows={4}
              disabled={sending}
            />
          </div>
          <InterCompanyVoucherAttachments files={files} onFilesChange={setFiles} disabled={sending} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
