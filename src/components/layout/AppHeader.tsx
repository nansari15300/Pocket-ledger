
"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const DesktopAppHeaderNoSSR = dynamic(
  () => import("./DesktopAppHeader").then((m) => m.DesktopAppHeader),
  {
    ssr: false,
    // Keep header space stable on first paint while client-only header mounts.
    loading: () => (
      <header className="relative sticky top-0 z-30 border-b bg-background px-2 py-2">
        <div className="h-9" />
      </header>
    ),
  }
);

export function AppHeader() {
  // Avoid SSR hydration mismatch from Radix-generated ids inside complex header actions.
  return <DesktopAppHeaderNoSSR />;
}
