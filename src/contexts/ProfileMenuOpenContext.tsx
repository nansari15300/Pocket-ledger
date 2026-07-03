"use client";

import * as React from "react";

const STORAGE_KEY = "pocket-ledger-profile-menu-open-v1";

/** Avatar plan menu: band / hover / click */
export type ProfileMenuOpenMode = "off" | "hover" | "click";

type ProfileMenuOpenContextValue = {
  mode: ProfileMenuOpenMode;
  setMode: (next: ProfileMenuOpenMode) => void;
};

const ProfileMenuOpenContext = React.createContext<ProfileMenuOpenContextValue | null>(null);

function parseStoredMode(raw: string | null): ProfileMenuOpenMode {
  if (raw === "hover") return "hover";
  if (raw === "click") return "click";
  if (raw === "off") return "off";
  return "click";
}

function persistMode(next: ProfileMenuOpenMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function ProfileMenuOpenProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ProfileMenuOpenMode>("click");

  React.useEffect(() => {
    try {
      setModeState(parseStoredMode(localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* ignore */
    }
  }, []);

  const setMode = React.useCallback((next: ProfileMenuOpenMode) => {
    setModeState(next);
    persistMode(next);
  }, []);

  const value = React.useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <ProfileMenuOpenContext.Provider value={value}>{children}</ProfileMenuOpenContext.Provider>;
}

export function useProfileMenuOpen(): ProfileMenuOpenContextValue {
  const ctx = React.useContext(ProfileMenuOpenContext);
  if (!ctx) {
    return { mode: "click", setMode: () => {} };
  }
  return ctx;
}
