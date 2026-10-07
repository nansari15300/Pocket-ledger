"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { normalizeGooglePhotoUrl } from "@/lib/batchFetchUserDisplayNames";
import { cn } from "@/lib/utils";

const dicebearAvatarUrl = (email: string) =>
  `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(email)}&size=96`;

function getInitials(nameOrEmail: string) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "U";
  const parts = s.includes("@") ? s.split("@")[0].split(/[.\s_-]+/) : s.split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "U";
}

/** Manage Sharing / Drive share — Google photo, dicebear, initials */
export function ShareUserAvatar({
  email,
  name,
  photoURL,
  isOnline = false,
  className,
}: {
  email: string;
  name: string;
  photoURL?: string;
  isOnline?: boolean;
  className?: string;
}) {
  const primary = normalizeGooglePhotoUrl(photoURL);
  const fallback = dicebearAvatarUrl(email);
  const [src, setSrc] = useState(primary || fallback);

  useEffect(() => {
    setSrc(primary || fallback);
  }, [primary, fallback]);

  return (
    <Avatar
      data-pl-manage-share-avatar=""
      data-online={isOnline ? "true" : "false"}
      className={cn("size-[2.2rem] shrink-0 p-0", className)}
    >
      <AvatarImage
        src={src}
        className="h-full w-full object-cover"
        alt=""
        referrerPolicy="no-referrer"
        onLoadingStatusChange={(status) => {
          if (status === "error" && src !== fallback) setSrc(fallback);
        }}
      />
      <AvatarFallback className="text-[11px] bg-muted text-foreground">
        {getInitials(name || email)}
      </AvatarFallback>
    </Avatar>
  );
}
