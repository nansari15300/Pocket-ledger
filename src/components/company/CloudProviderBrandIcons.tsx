"use client";

import { cn } from "@/lib/utils";

type IconProps = { className?: string };

/** Google Drive product icon (2020+). Asset: `/public/icons/google-drive.png`. */
export function GoogleDriveBrandIcon({ className }: IconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand raster; exact colors from official asset
    <img
      src="/icons/google-drive.png"
      alt=""
      width={24}
      height={24}
      className={cn("h-6 w-6 shrink-0 object-contain", className)}
      aria-hidden
      draggable={false}
    />
  );
}

/** Dropbox logo (brand blue). */
export function DropboxBrandIcon({ className }: IconProps) {
  return (
    <svg className={cn("shrink-0 text-[#0061FF]", className)} viewBox="0 0 24 24" aria-hidden role="img">
      <path
        fill="currentColor"
        d="M6 2.5 0 6.3l6 3.8 6-3.8L6 2.5zm12 0-6 3.8 6 3.8 6-3.8-6-3.8zM0 14.2l6 3.8 6-3.8-6-3.8L0 14.2zm12 0 6 3.8 6-3.8-6-3.8-6 3.8zM6 21.7l6 3.8 6-3.8-6-3.8-6 3.8z"
      />
    </svg>
  );
}
