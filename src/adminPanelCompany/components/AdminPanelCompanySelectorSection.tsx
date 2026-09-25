"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Company } from "@/hooks/useCompany";
import {
  ADMIN_PANEL_COMPANY_LOCAL_ID,
  ADMIN_PANEL_COMPANY_NAME,
} from "@/lib/adminPanelCompany/constants";
import {
  adminPanelCompanyCloudPathLabel,
  buildAdminPanelCompanySelectorRow,
  ensureAdminPanelCompanyReady,
} from "@/lib/adminPanelCompany/ensureAdminPanelCompany";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function AdminPanelCompanySelectorSection({
  selectedCompanyId,
  onSelect,
  compact = false,
}: {
  selectedCompanyId: string | null;
  onSelect: (company: Company) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [ensuring, setEnsuring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);

  const runEnsure = useCallback(async () => {
    if (!user?.uid) {
      setEnsuring(false);
      setError("Sign in required");
      return;
    }
    setEnsuring(true);
    setError(null);
    try {
      await ensureAdminPanelCompanyReady(user.uid, user.email);
      setCloudReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare Admin Panel Company");
    } finally {
      setEnsuring(false);
    }
  }, [user?.email, user?.uid]);

  useEffect(() => {
    void runEnsure();
  }, [runEnsure]);

  const row = buildAdminPanelCompanySelectorRow(user?.uid, user?.email);
  const selected = selectedCompanyId === ADMIN_PANEL_COMPANY_LOCAL_ID;

  const pickCompany = () => {
    if (ensuring && !cloudReady) return;
    onSelect(row);
  };

  const rowInner = (
    <>
      {ensuring && !cloudReady ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Building2 className="mr-2 h-4 w-4 shrink-0 text-primary" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{ADMIN_PANEL_COMPANY_NAME}</span>
      {selected ? <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" /> : null}
    </>
  );

  return (
    <div
      className={cn(
        "rounded-md border border-primary/35 bg-primary/5",
        compact ? "mb-2 p-1.5" : "mb-3 p-2"
      )}
    >
      <p className="px-1.5 pb-1 text-[11px] font-semibold text-foreground">
        Pocket Ledger management company
      </p>
      <p className="px-1.5 pb-2 text-[10px] leading-snug text-muted-foreground">
        Online: <span className="font-mono">{adminPanelCompanyCloudPathLabel()}</span>
        {cloudReady ? " · ready" : ensuring ? " · preparing…" : ""}
      </p>
      {error ? (
        <p className="px-1.5 pb-2 text-[10px] text-destructive">{error}</p>
      ) : null}
      {compact ? (
        <DropdownMenuItem
          className="cursor-pointer"
          disabled={ensuring && !cloudReady}
          onSelect={(e) => {
            e.preventDefault();
            pickCompany();
          }}
        >
          {rowInner}
        </DropdownMenuItem>
      ) : (
        <button
          type="button"
          disabled={ensuring && !cloudReady}
          onClick={() => pickCompany()}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
            "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected && "bg-muted/60"
          )}
        >
          {rowInner}
        </button>
      )}
    </div>
  );
}
