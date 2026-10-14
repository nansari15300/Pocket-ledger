"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  startTransition,
} from "react";
import {
  normalizeDashboardVisibleCard,
  readDashboardVisibleCardFromStorage,
  syncDashboardTabToSession,
} from "@/lib/dashboardTabPanels";

type DashboardContextType = {
  visibleCard: string;
  setVisibleCard: (cardId: string) => void;
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const [visibleCard, setVisibleCardState] = useState(readDashboardVisibleCardFromStorage);

  useEffect(() => {
    syncDashboardTabToSession(readDashboardVisibleCardFromStorage());
  }, []);

  const setVisibleCard = (cardId: string) => {
    const id = syncDashboardTabToSession(normalizeDashboardVisibleCard(cardId));
    // Tab highlight pehle; heavy Daybook/Summary paint transition me — All↔Daybook freeze kam.
    startTransition(() => {
      setVisibleCardState(id);
    });
  };

  return (
    <DashboardContext.Provider value={{ visibleCard, setVisibleCard }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
