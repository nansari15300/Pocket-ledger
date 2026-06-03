"use client";

import { Button } from "@/components/ui/button";
import { GoogleDriveBrandIcon } from "@/components/company/CloudProviderBrandIcons";
import { cn } from "@/lib/utils";

type Props = {
  connected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function CloudProviderConnectButton({
  connected = false,
  onClick,
  disabled,
  className,
}: Props) {
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
      aria-label={connected ? "Google Drive connected" : "Connect Google Drive"}
      title={actionLabel}
      disabled={disabled || connected}
      onClick={onClick}
    >
      <GoogleDriveBrandIcon className="h-6 w-6" />
      <span className="text-sm font-medium">{actionLabel}</span>
    </Button>
  );
}
