
"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const DesktopAppHeaderNoSSR = dynamic(
  () => import("./DesktopAppHeader").then((m) => m.DesktopAppHeader),
  {
    ssr: false,
    // Keep header space stable on first paint while client-only header mounts.
    loading: () => (
      <header className="relative sticky top-0 z-30 border-b border-sidebar-border bg-appChrome px-2 py-2">
        <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-blue h-11 w-full max-w-md animate-pulse opacity-90" />
      </header>
    ),
  }
);

export function AppHeader() {
  // Avoid SSR hydration mismatch from Radix-generated ids inside complex header actions.
  return <DesktopAppHeaderNoSSR />;
}
