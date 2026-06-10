"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import {
  createDriveLocalReconciliationLink,
  isLocalCompanyDriveDataSyncEnabled,
  listDriveReconciliationPeerCompanies,
} from "@/lib/reconciliation/driveLocalReconciliation";
import { loadReconciliationAccountsForCompany } from "@/lib/reconciliation/reconciliationStore";
import { reconciliationPagePath } from "@/lib/reconciliation/reconciliationChat";
import type { ReconciliationAccountOption } from "@/lib/reconciliation/types";
import { Cloud, Loader2, Link2 } from "lucide-react";

const actionBtnCn = cn(
  chromeProPillCn,
  "h-8 rounded-full border px-3 text-xs font-medium shadow-none",
);

type Props = {
  className?: string;
  onLinked?: () => void;
  dialogComboboxProps?: {
    popoverModal: false;
    autoFocusSearchOnOpen: boolean;
    contentWidthMode: "auto";
    searchPlaceholder: string;
  };
};

/** Local companies + Google Drive — do company jod kar recon (doosri side par ek IC party auto). */
export function DriveLocalReconciliationLinkPanel({
  className,
  onLinked,
  dialogComboboxProps,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { company, companyId, allCompanies } = useCompany();
  const { toast } = useToast();

  const [driveReady, setDriveReady] = React.useState<boolean | null>(null);
  const [peerCompanies, setPeerCompanies] = React.useState<typeof allCompanies>([]);
  const [accounts, setAccounts] = React.useState<ReconciliationAccountOption[]>([]);
  const [loadingPeers, setLoadingPeers] = React.useState(false);
  const [loadingAccounts, setLoadingAccounts] = React.useState(false);
  const [peerCompanyId, setPeerCompanyId] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [shareScope, setShareScope] = React.useState<"all" | "date_range">("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!companyId) {
      setDriveReady(false);
      setPeerCompanies([]);
      return;
    }
    let cancelled = false;
    setLoadingPeers(true);
    void (async () => {
      const ready = await isLocalCompanyDriveDataSyncEnabled(companyId);
      if (cancelled) return;
      setDriveReady(ready);
      if (!ready) {
        setPeerCompanies([]);
        setLoadingPeers(false);
        return;
      }
      const peers = await listDriveReconciliationPeerCompanies(companyId, allCompanies);
      if (cancelled) return;
      setPeerCompanies(peers);
      setLoadingPeers(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, allCompanies]);

  React.useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoadingAccounts(true);
    void loadReconciliationAccountsForCompany(companyId).then((list) => {
      if (cancelled) return;
      setAccounts(list);
      setLoadingAccounts(false);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const peerOptions = React.useMemo(
    () =>
      peerCompanies.map((c) => ({
        value: c.id,
        label: c.name || c.id,
      })),
    [peerCompanies]
  );

  const accountOptions = React.useMemo(
    () => accounts.map((a) => ({ value: a.id, label: a.name })),
    [accounts]
  );

  const scopeOptions = React.useMemo(
    () => [
      { value: "all", label: "All transactions" },
      { value: "date_range", label: "By date range" },
    ],
    []
  );

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedPeer = peerCompanies.find((c) => c.id === peerCompanyId);

  const handleLink = async () => {
    if (!user?.uid || !companyId || !company) return;
    if (!peerCompanyId) {
      toast({ variant: "destructive", title: "Select other company" });
      return;
    }
    if (!accountId) {
      toast({ variant: "destructive", title: "Select your party account" });
      return;
    }
    setSaving(true);
    try {
      const shareId = await createDriveLocalReconciliationLink({
        ownerUserId: user.uid,
        ownerUserEmail: user.email || undefined,
        senderCompanyId: companyId,
        senderCompanyName: company.name || companyId,
        senderAccountId: accountId,
        senderAccountName: selectedAccount?.name || accountId,
        peerCompanyId,
        peerCompanyName: selectedPeer?.name || peerCompanyId,
        shareScope,
        dateFrom: shareScope === "date_range" ? dateFrom || null : null,
        dateTo: shareScope === "date_range" ? dateTo || null : null,
      });
      toast({
        title: "Drive reconciliation linked",
        description:
          "Other company got one counterparty account automatically. Ledgers sync via Google Drive.",
      });
      onLinked?.();
      router.push(reconciliationPagePath(shareId));
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Link failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (driveReady === false) return null;

  if (driveReady === null || loadingPeers) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking Google Drive sync…
      </div>
    );
  }

  if (peerCompanies.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-sky-400/60 bg-sky-50/40 px-3 py-2.5 text-xs text-muted-foreground dark:bg-sky-950/20",
          className
        )}
      >
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-600" />
          Google Drive reconciliation
        </p>
        <p className="mt-1">
          Add another local company with Google Drive sync on this device (or join via Drive), then link here.
        </p>
      </div>
    );
  }

  const combo = dialogComboboxProps ?? {
    popoverModal: false as const,
    autoFocusSearchOnOpen: true,
    contentWidthMode: "auto" as const,
    searchPlaceholder: "Search...",
  };

  return (
    <div
      className={cn(
        "space-y-2.5 rounded-md border border-sky-400/50 bg-sky-50/50 px-3 py-3 dark:bg-sky-950/20",
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-600" />
        Link local company (Google Drive)
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Both companies must sync to Drive. The other company gets one counterparty party automatically — only that
        account is shared for reconciliation. Ledgers stay in sync through Drive.
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">Your party account</Label>
        <Combobox
          {...combo}
          options={accountOptions}
          value={accountId}
          onChange={setAccountId}
          disabled={loadingAccounts}
          placeholder={loadingAccounts ? "Loading…" : "Select account"}
          searchPlaceholder="Search account..."
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Other company (Drive sync)</Label>
        <Combobox
          {...combo}
          options={peerOptions}
          value={peerCompanyId}
          onChange={setPeerCompanyId}
          placeholder="Select company"
          searchPlaceholder="Search company..."
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Transactions</Label>
        <Combobox
          {...combo}
          options={scopeOptions}
          value={shareScope}
          onChange={(v) => setShareScope(v as "all" | "date_range")}
          placeholder="Select scope"
          searchPlaceholder="Search..."
        />
      </div>
      {shareScope === "date_range" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      ) : null}
      <Button type="button" variant="outline" className={actionBtnCn} onClick={() => void handleLink()} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
        Link & reconcile
      </Button>
    </div>
  );
}
