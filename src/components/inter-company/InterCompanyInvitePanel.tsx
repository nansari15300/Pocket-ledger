"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  appendInterCompanyPendingInvite,
  readInterCompanyPendingInvites,
  type InterCompanyPendingInvite,
} from "@/lib/interCompany/interCompanyLocalStore";
import {
  interCompanyInputClass,
  interCompanySettingsCardClass,
  interCompanyTextareaClass,
  interCompanyVoucherTabShellClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string;
  sourceCompanyName: string;
};

/** Invite tab — email / login id se inter-company invite message (preview: local list). */
export function InterCompanyInvitePanel({ companyId, sourceCompanyName }: Props) {
  const [loginOrEmail, setLoginOrEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<InterCompanyPendingInvite[]>(() =>
    readInterCompanyPendingInvites(companyId)
  );

  const handleSend = () => {
    const target = loginOrEmail.trim();
    if (!target) {
      toast.error("Enter email or login id");
      return;
    }
    const invite: InterCompanyPendingInvite = {
      id: `ic-inv-${Date.now()}`,
      targetLoginOrEmail: target,
      createdAt: Date.now(),
      status: "sent",
      message:
        message.trim() ||
        `${sourceCompanyName} ne aapko Inter Company connect ke liye invite bheja hai.`,
    };
    appendInterCompanyPendingInvite(companyId, invite);
    setSent(readInterCompanyPendingInvites(companyId));
    setLoginOrEmail("");
    setMessage("");
    toast.success("Invite queued", {
      description: "Delivery will connect when messaging backend is ready.",
    });
  };

  return (
    <div className={cn("pl-inter-company-voucher space-y-4 p-1", interCompanyVoucherTabShellClass)}>
      <div className="space-y-2">
        <Label htmlFor="ic-invite-target">Email or login id</Label>
        <Input
          id="ic-invite-target"
          value={loginOrEmail}
          onChange={(e) => setLoginOrEmail(e.target.value)}
          placeholder="user@company.com or login id"
          className={interCompanyInputClass}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ic-invite-msg">Message (optional)</Label>
        <Textarea
          id="ic-invite-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Inter company voucher invite…"
          className={cn(interCompanyTextareaClass, "min-h-[5rem] max-h-48")}
        />
      </div>
      <Button
        type="button"
        className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={handleSend}
      >
        Send invite
      </Button>

      {sent.length > 0 ? (
        <div className={cn(interCompanySettingsCardClass, "p-3")}>
          <p className="mb-2 text-sm font-medium">Recent invites (this device)</p>
          <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
            {sent.slice(0, 8).map((row) => (
              <li key={row.id} className="border-b border-dashed pb-2 last:border-0">
                <span className="font-medium">{row.targetLoginOrEmail}</span>
                <span className="ml-2 text-xs text-muted-foreground">{row.status}</span>
                {row.message ? (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
