"use client";

import React, { createContext, useContext, useState } from "react";

/** Mobile settings detail: daen panel (Sheet) ma settings list dikhane — ReportListContext jaisa */
type SettingsListContextValue = {
  settingsListOpen: boolean;
  setSettingsListOpen: (open: boolean) => void;
};

const SettingsListContext = createContext<SettingsListContextValue>({
  settingsListOpen: false,
  setSettingsListOpen: () => {},
});

export function SettingsListProvider({ children }: { children: React.ReactNode }) {
  const [settingsListOpen, setSettingsListOpen] = useState(false);
  return (
    <SettingsListContext.Provider value={{ settingsListOpen, setSettingsListOpen }}>
      {children}
    </SettingsListContext.Provider>
  );
}

export const useSettingsList = () => useContext(SettingsListContext);
