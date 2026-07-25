"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company } from "@/hooks/useCompany";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SettingsLabelWithInfo } from "@/components/settings/SettingsInfoTip";
import { listShareableLocalCompaniesForHost } from "@/lib/listShareableLocalCompaniesForHost";
import { getElectronLocalServerApi } from "@/lib/electronLocalServer";
import { normalizeSharedLocalCompanyIds } from "@/lib/plServerHostSharedCompanyIds";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const serverCardSoftSkyBorderCn = "pl-backup-soft-box pl-backup-soft-box-sky rounded-lg";
const serverCardSoftGreenBorderCn = "pl-backup-soft-box pl-backup-soft-box-emerald rounded-lg";
const serverCardToneGreenCn = "pl-dashboard-tone-card pl-dashboard-ribbon-emerald shadow-none";
const serverCardToneSkyCn = "pl-dashboard-tone-card pl-dashboard-ribbon-sky shadow-none";

type Props = {
  allCompaniesRegistry: Company[];
  configuredIds: string[] | null | undefined;
  onConfiguredIdsChange: (ids: string[] | null) => void;
  selectedCompanyId?: string | null;
  onSelectedCompanyIdChange?: (companyId: string) => void;
  disabled?: boolean;
};

export function LocalPlServerSharedCompaniesPicker({
  allCompaniesRegistry,
  configuredIds,
  onConfiguredIdsChange,
  selectedCompanyId,
  onSelectedCompanyIdChange,
  disabled,
}: Props) {
  const { localCompanyRegistryEpoch } = useCompany();
  const [loading, setLoading] = useState(true);
  const [shareable, setShareable] = useState<Company[]>([]);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listShareableLocalCompaniesForHost(allCompaniesRegistry).then((rows) => {
      if (cancelled) return;
      setShareable(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [allCompaniesRegistry, localCompanyRegistryEpoch]);

  useEffect(() => {
    const normalized = normalizeSharedLocalCompanyIds(configuredIds);
    if (normalized === null) {
      setDraftIds(new Set(shareable.map((c) => c.id)));
      return;
    }
    setDraftIds(new Set(normalized));
  }, [configuredIds, shareable]);

  useEffect(() => {
    if (!onSelectedCompanyIdChange || !shareable.length) return;
    if (selectedCompanyId && shareable.some((c) => c.id === selectedCompanyId)) return;
    const preferred = shareable.find((c) => draftIds.has(c.id)) ?? shareable[0];
    if (preferred) onSelectedCompanyIdChange(preferred.id);
  }, [shareable, draftIds, selectedCompanyId, onSelectedCompanyIdChange]);

  const sharedList = useMemo(
    () => shareable.filter((c) => draftIds.has(c.id)),
    [shareable, draftIds]
  );

  const toggleCompany = useCallback(
    (id: string, checked: boolean) => {
      setDraftIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        onConfiguredIdsChange([...next]);
        return next;
      });
    },
    [onConfiguredIdsChange]
  );

  const saveSharedCompanies = async () => {
    const ids = [...draftIds];
    setSaving(true);
    try {
      const api = getElectronLocalServerApi();
      if (api?.setConfig) {
        await api.setConfig({ sharedLocalCompanyIds: ids });
      }
      onConfiguredIdsChange(ids);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading local companies…
      </div>
    );
  }

  if (!shareable.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No pure local company on this device yet. Create or restore a local company first, then tick which ones to
        share on the server gate.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8 md:grid-cols-2 md:items-stretch md:gap-6">
      <Card className={cn("flex h-full min-w-0 flex-col overflow-hidden", serverCardToneGreenCn)}>
        <CardHeader className="pb-3">
          <SettingsLabelWithInfo
            label="Share this local company via P2P server"
            infoLabel="Share via P2P server"
            infoDescription={
              <>
                <p>
                  Tick companies to expose on the server gate. Remote users who add this server will see only ticked
                  companies.
                </p>
                <p className="mt-2">
                  User manually Gate me server IP:port add karega, phir username/password se open karega.
                </p>
              </>
            }
            labelClassName="text-base font-semibold leading-none tracking-tight"
          />
          <CardDescription>Tick which local companies appear on the server gate.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className={cn(serverCardSoftGreenBorderCn, "flex min-h-0 flex-1 flex-col gap-2 p-3")}>
            <ul className="divide-y divide-emerald-200/70 rounded-md border border-emerald-200/70 bg-emerald-50/30 md:min-h-0 md:flex-1">
              {shareable.map((company) => {
                const checked = draftIds.has(company.id);
                const selected = selectedCompanyId === company.id;
                return (
                  <li key={company.id}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm",
                        selected ? "bg-emerald-100/60 ring-1 ring-inset ring-emerald-300/50" : "hover:bg-emerald-50/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled || saving}
                        className="pl-backup-checkbox-emerald"
                        onCheckedChange={(v) => toggleCompany(company.id, v === true)}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                        disabled={disabled || saving}
                        onClick={() => onSelectedCompanyIdChange?.(company.id)}
                      >
                        {company.name || company.id}
                      </button>
                      {checked ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              size="sm"
              className="mt-auto w-fit shrink-0"
              disabled={disabled || saving}
              onClick={() => void saveSharedCompanies()}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save shared companies
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("flex h-full min-w-0 flex-col overflow-hidden", serverCardToneSkyCn)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shared local company</CardTitle>
          <CardDescription>Companies currently selected for the server gate.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <div className={cn(serverCardSoftSkyBorderCn, "min-h-[8rem] flex-1 p-3 md:min-h-0")}>
            {sharedList.length === 0 ? (
              <p className="text-xs text-muted-foreground md:flex-1">
                No company selected yet. Tick at least one company above and Save.
              </p>
            ) : (
              <ul className="space-y-1.5 md:min-h-0 md:flex-1">
                {sharedList.map((company) => (
                  <li
                    key={company.id}
                    className="flex items-center gap-2 rounded-md border border-sky-200/70 bg-sky-50/40 px-3 py-2 text-sm"
                  >
                    <Check className="h-4 w-4 shrink-0 text-sky-700" />
                    <span className="truncate font-medium">{company.name || company.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
