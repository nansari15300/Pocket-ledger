"use client";

import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";

export function RemoteServerClientBanner() {
  if (!isPlRemoteServerClientMode()) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      Remote client mode — view and sign-in only. Save vouchers and sync on the <strong>server PC</strong>.
    </div>
  );
}
