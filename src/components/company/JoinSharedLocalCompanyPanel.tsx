"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { cloudSyncSharePanelCard } from "@/lib/companyProfileChrome";
import { CloudSyncHelpPopover } from "@/components/company/CloudSyncHelpPopover";
import { JoinPanelMyCompaniesToggle } from "@/components/company/JoinPanelMyCompaniesToggle";
import { JoinSharedLocalCompanyDriveSection } from "@/components/company/JoinSharedLocalCompanyDriveSection";
import type { UseCloudProviderAccountStatusResult } from "@/hooks/useCloudProviderAccountStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

type Props = {
  active?: boolean;
  onJoined?: (companyId: string) => void;
  className?: string;
  returnPath?: string;
  embedded?: boolean;
  cloudAccounts?: UseCloudProviderAccountStatusResult;
};

/** Join shared local company — Google Drive. */
export function JoinSharedLocalCompanyPanel({
  active = true,
  onJoined,
  className,
  returnPath,
  embedded = false,
  cloudAccounts,
}: Props) {
  const isMobile = useIsMobile();
  const [nativeShell, setNativeShell] = useState(false);
  const compactProviderCards = isMobile || nativeShell;

  const [providerCardsOpen, setProviderCardsOpen] = useState(false);
  const [ownedDriveListOpen, setOwnedDriveListOpen] = useState(false);
  const [ownedDriveCount, setOwnedDriveCount] = useState(0);

  useEffect(() => {
    setNativeShell(isCapacitorNativeApp());
  }, []);

  useEffect(() => {
    if (!compactProviderCards) setProviderCardsOpen(true);
  }, [compactProviderCards]);

  const showProviderCards = !compactProviderCards || providerCardsOpen;

  return (
    <div
      className={cn(
        !embedded && cloudSyncSharePanelCard,
        "w-full",
        showProviderCards ? "space-y-4" : "space-y-0",
        !embedded && "px-[2px]",
        !embedded && (showProviderCards ? "py-2" : "py-1"),
        className
      )}
    >
      {!embedded ? (
        compactProviderCards ? (
          <div
            className={cn(
              "flex w-full flex-nowrap items-center gap-1 overflow-hidden rounded-lg border border-black/20 bg-white/50 px-1.5 py-1.5"
            )}
          >
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 rounded-md px-1 py-0.5 text-left",
                "active:bg-white/70"
              )}
              aria-expanded={providerCardsOpen}
              aria-controls="join-shared-provider-cards"
              onClick={() => setProviderCardsOpen((open) => !open)}
            >
              <Cloud className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold leading-tight">Join shared local company</span>
            </button>
            <CloudSyncHelpPopover
              label="Join shared local company"
              description={
                <p>
                  Restore or join a local company from Google Drive backup. Connect Drive, then Refresh list and
                  Connect on each company row.
                </p>
              }
            />
            {providerCardsOpen && ownedDriveCount > 0 ? (
              <JoinPanelMyCompaniesToggle
                label="My companies"
                open={ownedDriveListOpen}
                onToggle={() => setOwnedDriveListOpen((o) => !o)}
              />
            ) : null}
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md active:bg-white/70"
              aria-label={providerCardsOpen ? "Hide Google Drive" : "Show Google Drive"}
              onClick={() => setProviderCardsOpen((open) => !open)}
            >
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-200",
                  providerCardsOpen && "rotate-180"
                )}
              />
            </button>
          </div>
        ) : (
          <div>
            <p className="flex items-center gap-2 text-base font-semibold">
              <Cloud className="h-4 w-4 shrink-0" />
              Join shared local company
              <CloudSyncHelpPopover
                label="Join shared local company"
                description={
                  <p>
                    Restore or join a local company from Google Drive backup. Connect Drive, then Refresh list and
                    Connect on each company row.
                  </p>
                }
              />
            </p>
          </div>
        )
      ) : null}

      {showProviderCards ? (
        <div id="join-shared-provider-cards" className="min-w-0">
          <JoinSharedLocalCompanyDriveSection
            active={active && showProviderCards}
            onJoined={onJoined}
            returnPath={returnPath}
            embedded
            className="min-w-0"
            driveConnected={cloudAccounts?.googleDrive}
            accountStatusLoading={cloudAccounts?.loading}
            mobileMyCompaniesInPanelHeader={compactProviderCards}
            ownedListOpen={ownedDriveListOpen}
            onOwnedListOpenChange={setOwnedDriveListOpen}
            onOwnedInviteCountChange={setOwnedDriveCount}
          />
        </div>
      ) : compactProviderCards ? (
        <p className="px-1 text-xs text-muted-foreground">Google Drive connect — upar tap karo.</p>
      ) : null}
    </div>
  );
}
