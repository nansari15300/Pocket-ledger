"use client";

import { Button } from "@/components/ui/button";
import { DropboxBrandIcon, GoogleDriveBrandIcon } from "@/components/company/CloudProviderBrandIcons";
import { cn } from "@/lib/utils";

type Provider = "google_drive" | "dropbox";

type Props = {
  provider: Provider;
  connected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function CloudProviderConnectButton({
  provider,
  connected = false,
  onClick,
  disabled,
  className,
}: Props) {
  const serviceLabel = provider === "google_drive" ? "Google Drive" : "Dropbox";
  const actionLabel = connected ? "Connected" : "Connect";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-9 gap-2 rounded-full px-3.5",
        connected && "cursor-default border-emerald-600/40 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-50/80",
        className
      )}
      aria-label={connected ? `${serviceLabel} connected` : `Connect ${serviceLabel}`}
      title={actionLabel}
      disabled={disabled || connected}
      onClick={onClick}
    >
      {provider === "google_drive" ? (
        <GoogleDriveBrandIcon className="h-6 w-6" />
      ) : (
        <DropboxBrandIcon className="h-4 w-4" />
      )}
      <span className="text-sm font-medium">{actionLabel}</span>
    </Button>
  );
}
