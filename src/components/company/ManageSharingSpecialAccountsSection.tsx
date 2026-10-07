"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpecialAccountAccessControl } from "@/components/bank-cash/SpecialAccountAccessControl";
import { SpecialAccountFeatureSwitchPanel } from "@/components/bank-cash/SpecialAccountFeatureSwitchPanel";
import { companyProfileNestedBluePanel } from "@/lib/companyProfileChrome";
import { cn } from "@/lib/utils";
import type { Account } from "@/components/bank-cash/types";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { normalizeBankAccountRow } from "@/lib/bankAccountDisplayName";
import {
  BROWSER_DB_COLLECTION_BUMP,
  getCompanyDocFromBrowserDb,
  listCompanyDocsFromBrowserDb,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import {
  coerceBankAccountIsSpecial,
  normalizeBankAccountSpecialFields,
} from "@/lib/bankAccountSpecialFlags";
import { persistBankAccountMasterPatch } from "@/lib/persistBankAccountMasterPatch";
import {
  listSpecialAccountAccessUsers,
  canonicalizeSpecialAccountUseForForCompany,
  mergeSpecialAccountUsageIntoPermissionConfig,
  resolveSpecialAccountUseForForDisplay,
  type SpecialAccountUseFor,
} from "@/lib/specialAccountUsage";
import type { PermissionConfig } from "@/hooks/usePermissions";
import { toast as sonnerToast } from "sonner";

function bankAccountLabel(a: Account): string {
  const name = String(a.accountName || "").trim() || "Unnamed";
  const type = a.accountType === "Cash" ? "Cash" : "Bank";
  return `${name} (${type})`;
}

function mergeBankAccountLists(processed: Account[], mirrored: Account[]): Account[] {
  const byId = new Map<string, Account>();
  for (const a of processed) {
    if (a?.id && a.id !== "all" && !a.isDeleted) {
      byId.set(a.id, normalizeBankAccountSpecialFields(a));
    }
  }
  for (const a of mirrored) {
    if (!a?.id || a.id === "all" || a.isDeleted) continue;
    const norm = normalizeBankAccountSpecialFields(a);
    const prev = byId.get(a.id);
    byId.set(
      a.id,
      prev
        ? {
            ...prev,
            ...norm,
            isSpecial: norm.isSpecial,
            useFor: norm.useFor ?? prev.useFor,
          }
        : norm
    );
  }
  return [...byId.values()].sort((x, y) => bankAccountLabel(x).localeCompare(bankAccountLabel(y)));
}

export function ManageSharingSpecialAccountsSection({
  showUsagePanel,
  editablePermissionConfig,
  permissionFormResetNonce,
  onPermissionConfigChange,
  onPendingBankAccountUsage,
}: {
  showUsagePanel: boolean;
  editablePermissionConfig: PermissionConfig;
  permissionFormResetNonce: number;
  onPermissionConfigChange: (next: PermissionConfig) => void;
  onPendingBankAccountUsage: (
    accountId: string,
    useFor: SpecialAccountUseFor,
    isSpecial: boolean
  ) => void;
}) {
  const { company, companyId } = useCompany();
  const { processedAccounts, patchMasterEntity } = useVouchers();
  const users = useMemo(() => listSpecialAccountAccessUsers(company), [company]);
  const [mirroredBankAccounts, setMirroredBankAccounts] = useState<Account[]>([]);

  const reloadMirroredBankAccounts = useCallback(async () => {
    const cid = String(companyId || "").trim();
    if (!cid) {
      setMirroredBankAccounts([]);
      return;
    }
    try {
      const rows = await listCompanyDocsFromBrowserDb(cid, "bank_accounts", { forBackupMerge: true });
      const list = rows
        .map((row) =>
          normalizeBankAccountSpecialFields(
            normalizeBankAccountRow(row as Record<string, unknown>) as Account
          )
        )
        .filter((a) => a.id && a.id !== "all" && a.isDeleted !== true);
      setMirroredBankAccounts(list);
    } catch (e) {
      console.warn("[ManageSharingSpecialAccountsSection] bank_accounts mirror load failed", e);
      setMirroredBankAccounts([]);
    }
  }, [companyId]);

  useEffect(() => {
    void reloadMirroredBankAccounts();
  }, [reloadMirroredBankAccounts, processedAccounts.length]);

  useEffect(() => {
    const cid = String(companyId || "").trim();
    if (!cid || typeof window === "undefined") return;
    const onBump = (ev: Event) => {
      const d = (ev as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!d || d.companyId !== cid || d.collectionName !== "bank_accounts") return;
      void reloadMirroredBankAccounts();
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
  }, [companyId, reloadMirroredBankAccounts]);

  const bankAccounts = useMemo(
    () => mergeBankAccountLists((processedAccounts || []) as Account[], mirroredBankAccounts),
    [mirroredBankAccounts, processedAccounts]
  );

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isSpecialSaving, setIsSpecialSaving] = useState(false);
  const [usageOverride, setUsageOverride] = useState<SpecialAccountUseFor | null>(null);

  useEffect(() => {
    if (bankAccounts.length === 0) {
      if (selectedAccountId) setSelectedAccountId("");
      return;
    }
    const stillExists = bankAccounts.some((a) => a.id === selectedAccountId);
    if (!selectedAccountId || !stillExists) {
      setSelectedAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () => bankAccounts.find((a) => a.id === selectedAccountId) ?? null,
    [bankAccounts, selectedAccountId]
  );

  const selectedIsSpecial = coerceBankAccountIsSpecial(selectedAccount?.isSpecial);

  useEffect(() => {
    const cid = String(companyId || "").trim();
    const aid = String(selectedAccountId || "").trim();
    setUsageOverride(null);
    if (!cid || !aid) return;
    let cancelled = false;
    void (async () => {
      const row = await getCompanyDocFromBrowserDb(cid, "bank_accounts", aid);
      if (cancelled) return;
      const resolved = resolveSpecialAccountUseForForDisplay(
        row as { useFor?: unknown } | null,
        editablePermissionConfig,
        company
      );
      setUsageOverride(resolved);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload ticks only when account changes
  }, [companyId, selectedAccountId]);

  useEffect(() => {
    setUsageOverride(null);
  }, [permissionFormResetNonce]);

  const usageForTable = useMemo((): SpecialAccountUseFor => {
    if (usageOverride) return usageOverride;
    return resolveSpecialAccountUseForForDisplay(
      selectedAccount,
      editablePermissionConfig,
      company
    );
  }, [usageOverride, selectedAccount, editablePermissionConfig, company]);

  const showUsageTable = !!selectedAccount && (selectedIsSpecial || showUsagePanel);

  const handleSpecialToggle = (checked: boolean) => {
    if (!companyId || !selectedAccount) return;
    const nextSpecial = checked === true;
    setIsSpecialSaving(true);
    void (async () => {
      try {
        await persistBankAccountMasterPatch(companyId, company, selectedAccount.id, {
          isSpecial: nextSpecial,
          useFor: usageForTable,
        });
        patchMasterEntity("bank_accounts", selectedAccount.id, {
          isSpecial: nextSpecial,
        });
        const fresh = await getCompanyDocFromBrowserDb(companyId, "bank_accounts", selectedAccount.id);
        if (fresh) {
          const norm = normalizeBankAccountSpecialFields(
            normalizeBankAccountRow(fresh as Record<string, unknown>) as Account
          );
          setMirroredBankAccounts((prev) => {
            const rest = prev.filter((a) => a.id !== selectedAccount.id);
            return [...rest, norm];
          });
        } else {
          setMirroredBankAccounts((prev) =>
            prev.map((a) => (a.id === selectedAccount.id ? { ...a, isSpecial: nextSpecial } : a))
          );
        }
        sonnerToast.success(nextSpecial ? "Marked as special account" : "Special account off");
      } catch (e) {
        console.warn("[ManageSharingSpecialAccountsSection] isSpecial save failed", e);
        sonnerToast.error("Could not update special account flag");
      } finally {
        setIsSpecialSaving(false);
      }
    })();
  };

  const handleUsageChange = (useFor: SpecialAccountUseFor) => {
    const normalized = canonicalizeSpecialAccountUseForForCompany(useFor, company);
    if (!selectedAccount) return;
    setUsageOverride(normalized);
    onPermissionConfigChange(
      mergeSpecialAccountUsageIntoPermissionConfig(editablePermissionConfig, normalized, users)
    );
    onPendingBankAccountUsage(selectedAccount.id, normalized, selectedIsSpecial);
    setMirroredBankAccounts((prev) =>
      prev.map((a) =>
        a.id === selectedAccount.id ? { ...a, useFor: normalized, isSpecial: selectedIsSpecial } : a
      )
    );
  };

  return (
    <div className="space-y-4">
      <SpecialAccountFeatureSwitchPanel
        checked={selectedIsSpecial}
        switchDisabled={!selectedAccount || isSpecialSaving}
        onCheckedChange={handleSpecialToggle}
        leading={
          <div className="pl-manage-sharing-special-select min-w-[140px] max-w-[min(100%,280px)] shrink-0">
            <Select
              value={selectedAccountId || undefined}
              onValueChange={setSelectedAccountId}
              disabled={bankAccounts.length === 0 || isSpecialSaving}
            >
              <SelectTrigger
                {...{ "data-pl-manage-share-bank-select": "", "data-pl-manage-share-field": "" }}
                className="h-9 w-full border-0 bg-background text-sm shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                <SelectValue placeholder="Select bank/cash account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => {
                  const special = coerceBankAccountIsSpecial(a.isSpecial);
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {bankAccountLabel(a)}
                      {special ? " · Special" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        }
        description={null}
      />

      {showUsageTable ? (
        <Card className={cn(companyProfileNestedBluePanel, "p-4")}>
          <CardContent className="space-y-3 p-0">
            <p className="text-sm font-semibold">Special Account Usage Control</p>
            {selectedAccount && !selectedIsSpecial ? (
              <p className="text-xs text-muted-foreground">
                Turn on Special Account for &quot;{selectedAccount.accountName}&quot; to set per-user
                access, or edit defaults below (applies when account has no saved usage).
              </p>
            ) : null}
            <SpecialAccountAccessControl
              users={users}
              useFor={usageForTable}
              onUseForChange={handleUsageChange}
            />
          </CardContent>
        </Card>
      ) : null}

      {isSpecialSaving ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving account…
        </p>
      ) : null}
    </div>
  );
}
