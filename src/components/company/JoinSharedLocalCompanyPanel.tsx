"use client";

import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { cloudSyncSharePanelCard } from "@/lib/companyProfileChrome";
import { CloudSyncHelpPopover } from "@/components/company/CloudSyncHelpPopover";
import { JoinSharedLocalCompanyDriveSection } from "@/components/company/JoinSharedLocalCompanyDriveSection";
import { JoinSharedLocalCompanyDropboxSection } from "@/components/company/JoinSharedLocalCompanyDropboxSection";

type Props = {
  active?: boolean;
  onJoined?: (companyId: string) => void;
  className?: string;
  returnPath?: string;
  embedded?: boolean;
};

/** Join shared local company — Google Drive + Dropbox alag sections. */
export function JoinSharedLocalCompanyPanel({
  active = true,
  onJoined,
  className,
  returnPath,
  embedded = false,
}: Props) {
  return (
    <div
      className={cn(
        !embedded && cloudSyncSharePanelCard,
        "w-full space-y-4",
        !embedded && "px-[2px] py-2",
        className
      )}
    >
      {!embedded ? (
        <div>
          <p className="flex items-center gap-2 text-base font-semibold">
            <Cloud className="h-4 w-4 shrink-0" />
            Join shared local company
            <CloudSyncHelpPopover
              label="Join shared local company"
              description={
                <p>
                  Restore or join a local company from cloud backup. Use Google Drive or Dropbox separately — connect
                  the provider you use, then Refresh list and Connect on each company row.
                </p>
              }
            />
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-stretch md:gap-4">
        <JoinSharedLocalCompanyDriveSection
          active={active}
          onJoined={onJoined}
          returnPath={returnPath}
          embedded
          className="min-w-0"
        />
        <JoinSharedLocalCompanyDropboxSection
          active={active}
          onJoined={onJoined}
          returnPath={returnPath}
          embedded
          className="min-w-0"
        />
      </div>
    </div>
  );
}
