"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CloudSyncProviderId } from "@/lib/localCloudSync/types";
import {
  planAllowsDropboxSync,
  planAllowsGoogleDriveSync,
} from "@/lib/planSyncEntitlements";
import type { PlanId } from "@/config/plans";
import type { Plan } from "@/config/plans";

export type CloudSyncProviderChoice = CloudSyncProviderId | "none";

export function cloudSyncProviderChoiceLabel(p: CloudSyncProviderChoice): string {
  if (p === "google_drive") return "Google Drive";
  if (p === "dropbox") return "Dropbox";
  return "None";
}

/** Short line for settings card — split vs single provider. */
export function formatCloudSyncTargetsSummary(
  dataProvider: CloudSyncProviderChoice,
  filesProvider: CloudSyncProviderChoice
): string {
  const d = cloudSyncProviderChoiceLabel(dataProvider);
  const f = cloudSyncProviderChoiceLabel(filesProvider);
  if (dataProvider === "none" && filesProvider === "none") return "No cloud backup";
  if (dataProvider === filesProvider) return `Data & files: ${d}`;
  return `Data: ${d} · Files: ${f}`;
}

type Props = {
  planId: PlanId | string | null | undefined;
  livePlan?: Plan | null;
  dataProvider: CloudSyncProviderChoice;
  filesProvider: CloudSyncProviderChoice;
  onDataProviderChange: (v: CloudSyncProviderChoice) => void;
  onFilesProviderChange: (v: CloudSyncProviderChoice) => void;
  disabled?: boolean;
  /** Settings page: outer title box hide (card already labeled). */
  showHeader?: boolean;
  /** Nested inside another tinted card — skip duplicate border. */
  embedded?: boolean;
};

export function CloudSyncProviderPickers({
  planId,
  livePlan,
  dataProvider,
  filesProvider,
  onDataProviderChange,
  onFilesProviderChange,
  disabled,
  showHeader = true,
  embedded = false,
}: Props) {
  const allowDrive = planAllowsGoogleDriveSync(planId, livePlan);
  const allowDropbox = planAllowsDropboxSync(planId, livePlan);
  const showSection = allowDrive || allowDropbox;

  if (!showSection) return null;

  const providerOptions = (current: CloudSyncProviderChoice) => {
    const items: { value: CloudSyncProviderChoice; label: string }[] = [
      { value: "none", label: "None (this device only)" },
    ];
    if (allowDrive) items.push({ value: "google_drive", label: "Google Drive" });
    if (allowDropbox) items.push({ value: "dropbox", label: "Dropbox" });
    return items;
  };

  const split =
    dataProvider !== "none" && filesProvider !== "none" && dataProvider !== filesProvider;

  return (
    <div
      className={
        embedded ? "space-y-2" : "space-y-3 rounded-md border border-black/10 bg-muted/25 p-3"
      }
    >
      {showHeader ? (
        <div>
          <p className="text-xs font-medium text-foreground">Optional cloud backup (local company)</p>
          <p className="text-xs text-muted-foreground">
            Voucher data (JSON) and attachment files can use different providers — e.g. data on Drive, files on
            Dropbox.
          </p>
        </div>
      ) : null}
      {split ? (
        <p className="text-xs font-medium text-foreground rounded-md border border-black/15 bg-background/60 px-2 py-1.5">
          Split sync — {formatCloudSyncTargetsSummary(dataProvider, filesProvider)}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Voucher data sync</Label>
          <Select
            value={dataProvider}
            disabled={disabled}
            onValueChange={(v) => onDataProviderChange(v as CloudSyncProviderChoice)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {providerOptions(dataProvider).map((o) => (
                <SelectItem key={`data-${o.value}`} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Attachment files sync</Label>
          <Select
            value={filesProvider}
            disabled={disabled}
            onValueChange={(v) => onFilesProviderChange(v as CloudSyncProviderChoice)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {providerOptions(filesProvider).map((o) => (
                <SelectItem key={`files-${o.value}`} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function cloudSyncFieldsFromChoices(
  data: CloudSyncProviderChoice,
  files: CloudSyncProviderChoice
): {
  cloudSyncEnabled: boolean;
  cloudSyncDataProvider: CloudSyncProviderId | null;
  cloudSyncFilesProvider: CloudSyncProviderId | null;
  cloudSyncProvider: CloudSyncProviderId | null;
} {
  const dataP = data === "none" ? null : data;
  const filesP = files === "none" ? null : files;
  const enabled = !!(dataP || filesP);
  const legacy = dataP && filesP && dataP === filesP ? dataP : dataP ?? filesP;
  return {
    cloudSyncEnabled: enabled,
    cloudSyncDataProvider: dataP,
    cloudSyncFilesProvider: filesP,
    cloudSyncProvider: legacy,
  };
}
