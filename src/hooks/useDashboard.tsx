
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";

type DashboardContextType = {
  visibleCard: string;
  setVisibleCard: (cardId: string) => void;
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const [visibleCard, setVisibleCardState] = useState("financial-summaries");

  useEffect(() => {
    const savedCard = localStorage.getItem("dashboardVisibleCard");
    if (!savedCard) return;
    // Recurring footer tab removed — migrate old localStorage value to a valid tab
    const normalized = savedCard === "auto-recurring" ? "all" : savedCard;
    setVisibleCardState(normalized);
    if (normalized !== savedCard) {
      localStorage.setItem("dashboardVisibleCard", normalized);
    }
  }, []);

  const setVisibleCard = (cardId: string) => {
    // Recurring tab removed — normalize stale id from old clients or bookmarks
    const id = cardId === "auto-recurring" ? "all" : cardId;
    localStorage.setItem("dashboardVisibleCard", id);
    setVisibleCardState(id);
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
