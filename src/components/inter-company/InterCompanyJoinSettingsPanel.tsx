"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  readInterCompanyLocalSettings,
  writeInterCompanyLocalSettings,
  type InterCompanyLocalSettings,
} from "@/lib/interCompany/interCompanyLocalStore";
import {
  formatInterCompanyPartnerLabel,
  type InterCompanyPartnerRow,
} from "@/lib/interCompany/useInterCompanyPartnerDirectory";
import {
  interCompanyInfoStripClass,
  interCompanySettingsCardClass,
  interCompanySettingsListClass,
  interCompanyVoucherTabShellClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string;
  partners: InterCompanyPartnerRow[];
  onSettingsChange?: () => void;
};

/** Join tab — notifications, target name search, joined companies. */
export function InterCompanyJoinSettingsPanel({
  companyId,
  partners,
  onSettingsChange,
}: Props) {
  const [settings, setSettings] = useState<InterCompanyLocalSettings>(() =>
    readInterCompanyLocalSettings(companyId)
  );

  useEffect(() => {
    setSettings(readInterCompanyLocalSettings(companyId));
  }, [companyId]);

  const persist = (next: InterCompanyLocalSettings) => {
    setSettings(next);
    writeInterCompanyLocalSettings(companyId, next);
    onSettingsChange?.();
  };

  const toggleJoined = (partnerId: string, checked: boolean) => {
    const set = new Set(settings.joinedCompanyIds);
    if (checked) set.add(partnerId);
    else set.delete(partnerId);
    persist({ ...settings, joinedCompanyIds: Array.from(set) });
  };

  return (
    <div className={cn("pl-inter-company-voucher space-y-5 p-1", interCompanyVoucherTabShellClass)}>
      <div className={cn("flex items-center justify-between gap-3", interCompanySettingsCardClass)}>
        <div>
          <Label htmlFor="ic-notify" className="text-sm font-medium">
            Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Inter-company invites and voucher alerts
          </p>
        </div>
        <Switch
          id="ic-notify"
          checked={settings.notificationsEnabled}
          onCheckedChange={(on) => persist({ ...settings, notificationsEnabled: on })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Partner display</Label>
        <p className={interCompanyInfoStripClass}>Company account name + A/c No</p>
      </div>

      <div className={cn("flex items-start justify-between gap-3", interCompanySettingsCardClass)}>
        <div className="min-w-0">
          <Label htmlFor="ic-search-by-name" className="text-sm font-medium">
            Let partners search accounts by name
          </Label>
          <p className="text-xs text-muted-foreground">
            Applies when other companies target you. On: they see your account name list. Off:
            privacy — they must enter your Inter Co. A/c No or mobile (no name list).
          </p>
        </div>
        <Switch
          id="ic-search-by-name"
          checked={settings.searchTargetAccountByNameFromSource}
          onCheckedChange={(on) =>
            persist({ ...settings, searchTargetAccountByNameFromSource: on })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Joined companies</Label>
        <p className="text-xs text-muted-foreground">
          Checked = inter-company link with that company (preview list)
        </p>
        {partners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No partner companies found.</p>
        ) : (
          <ul className={cn("max-h-52 space-y-2", interCompanySettingsListClass)}>
            {partners.map((p) => {
              const checked = settings.joinedCompanyIds.includes(p.id);
              return (
                <li key={p.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    id={`ic-join-${p.id}`}
                    checked={checked}
                    onCheckedChange={(v) => toggleJoined(p.id, v === true)}
                  />
                  <Label htmlFor={`ic-join-${p.id}`} className="cursor-pointer font-normal leading-snug">
                    {formatInterCompanyPartnerLabel(p, settings.partnerDisplayMode)}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
