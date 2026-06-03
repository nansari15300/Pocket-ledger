"use client";

import { Button } from "@/components/ui/button";
import { DropboxBrandIcon, GoogleDriveBrandIcon } from "@/components/company/CloudProviderBrandIcons";
import { cn } from "@/lib/utils";

type Provider = "google_drive" | "dropbox";

type Props = {
  provider: Provider;
  onClick: () => void;
  className?: string;
};

export function CloudProviderConnectButton({ provider, onClick, className }: Props) {
  const label = provider === "google_drive" ? "Connect Google Drive" : "Connect Dropbox";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-9 gap-2 rounded-full px-3.5", className)}
      aria-label={label}
      title="Connect"
      onClick={onClick}
    >
      {provider === "google_drive" ? (
        <GoogleDriveBrandIcon className="h-6 w-6" />
      ) : (
        <DropboxBrandIcon className="h-4 w-4" />
      )}
      <span className="text-sm font-medium">Connect</span>
    </Button>
  );
}
