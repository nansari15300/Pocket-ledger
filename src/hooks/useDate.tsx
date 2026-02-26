
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import NepaliDate from 'nepali-date-converter';
import { useAnimationSettings } from "./useAnimationSettings";
import { useCompany } from "./useCompany";
import { format } from 'date-fns';
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import type { ADFormatKey, BSFormatKey } from "@/lib/dateFormatOptions";
import { AD_DATE_FORMATS, BS_DATE_FORMATS } from "@/lib/dateFormatOptions";

export type DateSystem = "AD" | "BS" | "Both";

const DEFAULT_AD_FORMAT: ADFormatKey = "MM-dd-yyyy";
const DEFAULT_BS_FORMAT: BSFormatKey = "YYYY-MM-DD";

type CurrencyFormattingOptions = {
  noSuffix?: boolean;
  showDrCr?: boolean;
  noAnimation?: boolean;
  duration?: number;
  context?: 'dashboard' | 'list' | 'details' | 'transaction';
}

type DateContextType = {
  dateSystem: DateSystem;
  setDateSystem: (system: DateSystem) => void;
  dateFormatAD: ADFormatKey;
  dateFormatBS: BSFormatKey;
  setDateFormatAD: (fmt: ADFormatKey) => void;
  setDateFormatBS: (fmt: BSFormatKey) => void;
  formatDate: (date: Date) => string;
  formatDateBS: (date: Date) => string;
  formatCurrency: (amount: number, options?: CurrencyFormattingOptions) => React.ReactNode;
  formatCurrencyForPrint: (amount: number, options?: CurrencyFormattingOptions) => string;
  formatRunning: (amount: number) => string;
};

const DateContext = createContext<DateContextType | undefined>(undefined);

export const DateProvider = ({ children }: { children: ReactNode }) => {
  const [dateSystem, setDateSystemState] = useState<DateSystem>("BS");
  const [dateFormatAD, setDateFormatADState] = useState<ADFormatKey>(DEFAULT_AD_FORMAT);
  const [dateFormatBS, setDateFormatBSState] = useState<BSFormatKey>(DEFAULT_BS_FORMAT);
  const { company } = useCompany();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // If company country is not Nepal, default to AD
    if (company?.country && company.country !== "Nepal") {
      setDateSystemState("AD");
      localStorage.setItem("dateSystem", "AD");
      return;
    }
    const storedDateSystem = localStorage.getItem("dateSystem") as DateSystem | null;
    if (storedDateSystem && ["AD", "BS", "Both"].includes(storedDateSystem)) {
      setDateSystemState(storedDateSystem);
    }
  }, [company?.country]);

  useEffect(() => {
    if (!isClient) return;
    const ad = localStorage.getItem("dateFormatAD") as ADFormatKey | null;
    const bs = localStorage.getItem("dateFormatBS") as BSFormatKey | null;
    if (ad && AD_DATE_FORMATS.some((f) => f.value === ad)) setDateFormatADState(ad);
    if (bs && BS_DATE_FORMATS.some((f) => f.value === bs)) setDateFormatBSState(bs);
  }, [isClient]);


  const decimalPlaces = company?.decimalPlaces;
  const companyShowDrCr = company?.showDrCr ?? true;
  const showCurrencySymbol = company?.showCurrencySymbol ?? true;
  const currencySymbol = company?.currencySymbol ?? "Rs.";
  const { settings: animationSettings } = useAnimationSettings();

  const setDateSystem = (system: DateSystem) => {
    localStorage.setItem("dateSystem", system);
    setDateSystemState(system);
  };

  const setDateFormatAD = (fmt: ADFormatKey) => {
    localStorage.setItem("dateFormatAD", fmt);
    setDateFormatADState(fmt);
  };

  const setDateFormatBS = (fmt: BSFormatKey) => {
    localStorage.setItem("dateFormatBS", fmt);
    setDateFormatBSState(fmt);
  };
  
  const formatDate = (date: Date): string => {
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
      }
      return format(date, dateFormatAD);
  };
  
  const formatDateBS = (date: Date): string => {
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
      }
      const nepaliDate = new NepaliDate(date);
      return nepaliDate.format(dateFormatBS);
  }
  
  const formatCurrencyForPrint = (amount: number, options?: CurrencyFormattingOptions): string => {
     if (typeof amount !== 'number' || isNaN(amount)) return '-';
        
    const isZeroDecimal = decimalPlaces === 0;
    const intlOptions: Intl.NumberFormatOptions = {
        style: 'decimal',
        minimumFractionDigits: isZeroDecimal ? 0 : (decimalPlaces ?? 2),
        maximumFractionDigits: isZeroDecimal ? 20 : (decimalPlaces ?? 2),
    };
    
    let formattedAmount = new Intl.NumberFormat('en-IN', intlOptions).format(Math.abs(amount));

    if (showCurrencySymbol) {
        formattedAmount = `${currencySymbol} ${formattedAmount}`;
    }

    if (options?.noSuffix) {
        return amount < 0 ? `-${formattedAmount}` : formattedAmount;
    }
    
    const showDrCr = options?.showDrCr === undefined ? companyShowDrCr : options.showDrCr;
    if (!showDrCr) {
        return amount < 0 ? `-${formattedAmount}` : formattedAmount;
    }
    
    const suffix = amount >= 0 ? "Dr" : "Cr";
    return `${formattedAmount} ${suffix}`;
  };


  const formatCurrency = (amount: number, options?: CurrencyFormattingOptions): React.ReactNode => {
    // Check if animation is enabled globally
    const isAnimationEnabled = animationSettings?.numbers?.enabled === true;
    
    if (options?.noAnimation || !isAnimationEnabled) {
      return formatCurrencyForPrint(amount, options);
    }
    
    // Use exact duration from settings when enabled
    const duration = options?.duration || animationSettings?.numbers?.duration || 2.5;

    // Ensure duration is at least 1 second when enabled
    if (duration < 1) {
      return formatCurrencyForPrint(amount, options);
    }

    return <AnimatedNumber value={amount} formatter={(n: number) => formatCurrencyForPrint(n, options)} duration={duration} />;
  };

  const formatRunning = (amount: number) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '-';
    // Here we pass noSuffix: true, so it will now include Rs. but exclude Dr/Cr.
    // We manually add Dr/Cr below.
    const formattedAmount = formatCurrencyForPrint(Math.abs(amount), { noSuffix: true });
    const suffix = amount >= 0 ? 'Dr' : 'Cr';
    return `${formattedAmount} ${suffix}`;
  };


  return (
    <DateContext.Provider value={{ dateSystem, setDateSystem, dateFormatAD, dateFormatBS, setDateFormatAD, setDateFormatBS, formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint, formatRunning }}>
      {children}
    </DateContext.Provider>
  );
};

export const useDate = () => {
  const context = useContext(DateContext);
  if (context === undefined) {
    throw new Error("useDate must be used within a DateProvider");
  }
  return context;
};
