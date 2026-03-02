
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
    const savedCard = localStorage.getItem('dashboardVisibleCard');
    if (savedCard) {
      setVisibleCardState(savedCard);
    }
  }, []);

  const setVisibleCard = (cardId: string) => {
    localStorage.setItem('dashboardVisibleCard', cardId);
    setVisibleCardState(cardId);
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
