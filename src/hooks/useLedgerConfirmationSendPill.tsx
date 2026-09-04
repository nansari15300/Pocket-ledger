"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import {
  getAnusuchi13FyKey,
  isAnusuchi13ConfirmationSent,
  isAnusuchi13StatementSent,
  type Anusuchi13ConfirmationFyRecord,
} from "@/lib/reports/anusuchi13Confirmation";
import {
  ANUSUCHI13_STATE_EVENT,
  readAnusuchi13ReportMemory,
} from "@/lib/reports/anusuchi13ReportMemory";
import {
  patchMasterAnusuchi13Confirmation,
  type Anusuchi13MasterCollection,
} from "@/lib/reports/patchPartyAnusuchi13Confirmation";
import {
  getMasterAccountContactTier,
  MASTER_ACCOUNT_CONTACT_TIER_PILL_CN,
  masterAccountContactTierTitle,
  type MasterAccountContactChannel,
} from "@/lib/reports/masterAccountContactTier";
import {
  buildLedgerConfirmationPdfFileName,
  shareLedgerConfirmationPdfChannels,
} from "@/lib/reports/ledgerConfirmationShare";
import { LedgerConfirmationSendDialog } from "@/components/reports/LedgerConfirmationSendDialog";

type ConfirmableEntity = {
  id: string;
  companyId: string;
  name?: string;
  phone?: string | null;
  whatsapp?: boolean;
  email?: string | null;
  openingBalance?: number;
  balance?: number;
  debit?: number;
  credit?: number;
  anusuchi13ConfirmationByFy?: Record<string, Anusuchi13ConfirmationFyRecord>;
};

export function useAnusuchi13ConfirmationSession(country?: string) {
  const runningFyKey = useMemo(
    () => getAnusuchi13FyKey(country, new Date()),
    [country]
  );
  const [session, setSession] = useState(readAnusuchi13ReportMemory);

  useEffect(() => {
    const refresh = () => setSession(readAnusuchi13ReportMemory());
    window.addEventListener(ANUSUCHI13_STATE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ANUSUCHI13_STATE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return {
    confirmationRunning: Boolean(session.confirmationRunning),
    selectedFyKey: session.selectedFyKey ?? runningFyKey,
  };
}

export function useLedgerConfirmationSendPill<T extends ConfirmableEntity>({
  entity,
  collection,
  eligible,
  onEntityUpdated,
  buildStatementPdfBlob,
}: {
  entity: T;
  collection: Anusuchi13MasterCollection;
  eligible: boolean;
  onEntityUpdated: (updated: T) => void;
  buildStatementPdfBlob?: () => Promise<Blob | null>;
}) {
  const { company } = useCompany();
  const { confirmationRunning, selectedFyKey } = useAnusuchi13ConfirmationSession(
    company?.country
  );
  const [pending, setPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const contactTier = useMemo(
    () => getMasterAccountContactTier(entity),
    [entity.phone, entity.email]
  );
  const contactBlocked = contactTier === "none";

  const alreadySent = confirmationRunning
    ? isAnusuchi13ConfirmationSent(entity, selectedFyKey)
    : isAnusuchi13StatementSent(entity, selectedFyKey);

  const label = confirmationRunning
    ? alreadySent
      ? "Confirmation sent"
      : "Send Confirmation"
    : alreadySent
      ? "Statement sent"
      : "Send Statement";

  const handleSend = useCallback(
    async (channels: MasterAccountContactChannel[]) => {
      if (!eligible || alreadySent || pending || contactBlocked || channels.length === 0) return;
      if (!buildStatementPdfBlob) {
        toast.error("Statement PDF is not available on this screen.");
        return;
      }

      setPending(true);
      try {
        const pdfBlob = await buildStatementPdfBlob();
        if (!pdfBlob) {
          toast.error("Could not generate statement PDF.");
          return;
        }

        const fileName = buildLedgerConfirmationPdfFileName(
          entity.name,
          confirmationRunning,
          selectedFyKey
        );

        let sharedPhone = false;
        let sharedEmail = false;
        let usedDesktopFallback = false;
        try {
          ({ sharedPhone, sharedEmail, usedDesktopFallback } =
            await shareLedgerConfirmationPdfChannels({
              channels,
              pdfBlob,
              fileName,
              confirmationRunning,
              phone: entity.phone,
              email: entity.email,
              country: company?.country,
              entityName: entity.name,
              companyName: company?.name,
              fyKey: selectedFyKey,
            }));
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") return;
          toast.error(e instanceof Error ? e.message : "Could not share PDF.");
          return;
        }

        const viaEmail = channels.includes("email");
        const viaPhone = channels.includes("phone");
        const expectedPhone = viaPhone && Boolean(String(entity.phone ?? "").trim());
        const expectedEmail = viaEmail && Boolean(String(entity.email ?? "").trim());
        const phoneOk = !expectedPhone || sharedPhone;
        const emailOk = !expectedEmail || sharedEmail;

        if (!phoneOk && !emailOk) {
          toast.error("Could not share PDF. Try again.");
          return;
        }

        const patch = confirmationRunning
          ? { sent: true, sentViaEmail: viaEmail, sentViaPhone: viaPhone }
          : {
              statementSent: true,
              statementSentViaEmail: viaEmail,
              statementSentViaPhone: viaPhone,
            };
        const next = await patchMasterAnusuchi13Confirmation(
          company,
          collection,
          entity,
          selectedFyKey,
          patch
        );
        onEntityUpdated(next);
        setDialogOpen(false);
        if (usedDesktopFallback) {
          toast.success(
            confirmationRunning
              ? "PDF downloaded. WhatsApp opened — attach the file with 📎, then send."
              : "PDF downloaded. WhatsApp opened — attach the file with 📎, then send."
          );
        } else {
          toast.success(
            confirmationRunning ? "Confirmation marked as sent." : "Statement marked as sent."
          );
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to save.");
      } finally {
        setPending(false);
      }
    },
    [
      eligible,
      alreadySent,
      pending,
      contactBlocked,
      confirmationRunning,
      company,
      collection,
      entity,
      selectedFyKey,
      onEntityUpdated,
      buildStatementPdfBlob,
    ]
  );

  const handleUnsend = useCallback(async () => {
    if (!eligible || !alreadySent || pending) return;
    setPending(true);
    try {
      const patch = confirmationRunning
        ? { sent: false, sentViaEmail: false, sentViaPhone: false }
        : { statementSent: false, statementSentViaEmail: false, statementSentViaPhone: false };
      const next = await patchMasterAnusuchi13Confirmation(
        company,
        collection,
        entity,
        selectedFyKey,
        patch
      );
      onEntityUpdated(next);
      toast.success(confirmationRunning ? "Confirmation unmarked." : "Statement unmarked.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setPending(false);
    }
  }, [
    eligible,
    alreadySent,
    pending,
    confirmationRunning,
    company,
    collection,
    entity,
    selectedFyKey,
    onEntityUpdated,
  ]);

  const pill = eligible ? (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || (contactBlocked && !alreadySent)}
        className={cn(
          LEDGER_HEADER_PILL_CN,
          "!h-[27px] min-h-[27px] text-xs",
          MASTER_ACCOUNT_CONTACT_TIER_PILL_CN[contactTier],
          (alreadySent || contactBlocked) && "opacity-80"
        )}
        title={masterAccountContactTierTitle(contactTier, label)}
        onClick={() => {
          if (alreadySent) {
            void handleUnsend();
            return;
          }
          setDialogOpen(true);
        }}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mr-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
            alreadySent
              ? "border-green-600 bg-green-600 text-white"
              : "border-current bg-transparent"
          )}
        >
          {alreadySent ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
        {label}
      </Button>
      <LedgerConfirmationSendDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entityName={entity.name}
        entity={entity}
        actionLabel={label}
        pending={pending}
        onConfirm={handleSend}
      />
    </>
  ) : null;

  return pill;
}
