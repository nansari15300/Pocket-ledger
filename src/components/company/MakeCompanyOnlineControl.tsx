"use client";

import { useCallback, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { canUploadOneMoreOnline } from "@/lib/companyOnlineSlots";
import { isDeviceLocalCompany, isServerGateCompany } from "@/lib/companyStorageKind";
import { makeLocalCompanyOnline } from "@/lib/makeLocalCompanyOnline";
import {
  completeVoucherBackgroundProgress,
  showVoucherBackgroundProgress,
} from "@/lib/voucherSaveUi";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** When form is read-only, hide the control. */
  disabled?: boolean;
};

/**
 * Company Name row — double-click only (single click does nothing).
 * Converts selected local company to Firebase online (data first, then attachments).
 */
export function MakeCompanyOnlineControl({ className, disabled = false }: Props) {
  const { company, companyId, allCompanies, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const livePlans = useLivePlans();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const isOwner =
    !!company &&
    !!user &&
    (company.ownerId === user.uid ||
      (!!company.ownerEmail &&
        !!user.email &&
        company.ownerEmail.toLowerCase() === user.email.toLowerCase()));

  const isLocal =
    !!company &&
    isDeviceLocalCompany(company) &&
    !isServerGateCompany(company) &&
    (company as { plServerShared?: boolean }).plServerShared !== true;

  const accountPlanId = resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId);
  const accountPlanLive = getPlanFromPlans(livePlans, accountPlanId);
  const slots = canUploadOneMoreOnline(
    allCompanies,
    accountPlanId,
    companyId || "",
    user?.uid ?? null,
    accountPlanLive
  );

  const visible = Boolean(company && companyId && isOwner && isLocal && !disabled);

  const runMakeOnline = useCallback(async () => {
    if (!companyId || !user?.uid || running) return;
    setRunning(true);
    setConfirmOpen(false);
    const progressId = showVoucherBackgroundProgress("Making company online…");
    try {
      const result = await makeLocalCompanyOnline({
        companyId,
        ownerUid: user.uid,
        ownerEmail: user.email,
        allCompanies,
        planId: accountPlanId,
        livePlan: accountPlanLive,
        onProgress: (p) => {
          const bits = [p.label];
          if (p.detail) bits.push(p.detail);
          if (typeof p.done === "number" && typeof p.total === "number" && p.total > 0) {
            bits.push(`${p.done}/${p.total}`);
          }
          sonnerToast.loading(bits.filter(Boolean).join(" · "), {
            id: progressId,
            position: "bottom-center",
            duration: Infinity,
          });
        },
      });

      reloadLocalCompanyRegistry();
      triggerSync();

      completeVoucherBackgroundProgress(progressId, {
        ok: result.ok && result.filesFailed === 0 && result.errors.length === 0,
        title: result.ok
          ? result.filesFailed > 0 || result.errors.length
            ? "Online with warnings"
            : "Company is now online"
          : "Make online failed",
        description: result.message,
      });

      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Make online failed",
          description: result.message || "Try again when online.",
        });
      }
    } catch (e) {
      completeVoucherBackgroundProgress(progressId, {
        ok: false,
        title: "Make online failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }, [
    accountPlanId,
    accountPlanLive,
    allCompanies,
    companyId,
    reloadLocalCompanyRegistry,
    running,
    toast,
    triggerSync,
    user?.email,
    user?.uid,
  ]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        disabled={running}
        className={cn(
          "inline-flex items-center gap-1 shrink-0 text-xs font-medium text-primary underline-offset-2",
          "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
          "disabled:opacity-60 disabled:pointer-events-none select-none",
          className
        )}
        title="Double-click to upload this local company to Firebase (data first, then attachments)"
        aria-label="Make this company online — double-click to confirm"
        onClick={(e) => {
          // Single click must not start upload.
          e.preventDefault();
          e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (running) return;
          if (!slots.ok || slots.max === 0) {
            toast({
              variant: "destructive",
              title: slots.max === 0 ? "Online not on this plan" : "Online slots full",
              description:
                slots.max === 0
                  ? "Upgrade your plan to create Firebase online companies."
                  : `Your plan allows ${slots.max} online compan${slots.max === 1 ? "y" : "ies"} (using ${slots.current}).`,
            });
            return;
          }
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            toast({
              variant: "destructive",
              title: "Offline",
              description: "Connect to the internet, then double-click again.",
            });
            return;
          }
          setConfirmOpen(true);
        }}
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
        <span>make this company online</span>
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this company online?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                <strong>{company?.name || "This company"}</strong> will be uploaded to Firebase: company
                profile and ledger data first, then attachments.
              </span>
              <span className="block text-muted-foreground">
                Plan online slots: {slots.current}/{slots.max}. This cannot be undone from here (you can
                later demote or manage from cloud settings).
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={running}
              onClick={(e) => {
                e.preventDefault();
                void runMakeOnline();
              }}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Upload & make online
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
