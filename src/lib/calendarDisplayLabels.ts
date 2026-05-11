/**
 * Company display setting `calendarDateSystem` ke hisaab se copy — recurring / auto voucher UI.
 * Engine ab bhi BS schedule use karta hai; AD mode me labels Gregorian reference dikhate hain.
 * Deletion: due se pehle delete par dubara generate ho sakta hai; due ke baad delete par `suppressedPeriodKeys` = us BS month (period).
 */
export type CalendarDisplayMode = "AD" | "BS" | "Both";

export function recurringAutoVoucherLabels(mode: CalendarDisplayMode) {
  if (mode === "AD") {
    return {
      settingsIntro:
        "Schedule uses the Bikram Sambat (BS) calendar: “last day” means the last day of that BS month, which maps to a normal Gregorian (AD) date on the voucher — often mid-month in AD, not the 30th/31st of an AD month. " +
        "Optional increase by percent or fixed amount; N under every N months/years is the interval (1–24). " +
        "Save in this window only stores schedule and rate here (then closes); turn Auto Monthly on or off with the main voucher Save. " +
        "Generate now (when allowed) opens a list when several BS months are missing: each row shows the voucher date for that period; tick rows to create only those, Select all for every gap, or leave all unticked to create just the most recent missing month. " +
        "(Delete before the scheduled day → can run again on that day; delete on or after that day → no auto recreate for that BS month.) " +
        "Journal: same debit/credit account lines share one template — Auto on/off on any month’s voucher applies to the whole series.",
      // AD display mode: voucher date still BS-boundary → label me “BS” zaroor — warna user AD month-end expect karta hai.
      scheduleMonthDayLabel: "BS month day (generate on)",
      lastDayOfScheduledMonth: "Last day of BS month",
      everyMonthOption: "Every month (each scheduled voucher)",
      oncePerYearOption: "Once per year (pick month and day)",
      everyNMonthsLabel: "Every (months)",
      bumpWhenMonthLabel: "Month when bump applies (BS month names)",
      bumpDayLabel: "Day of month",
      everyNYearsLabel: "Every (years)",
      yearlyBaseAnchorLabel: "Base date for every-N-years (optional)",
      yearlyBaseAnchorHint:
        "If you started using this app mid-year but your yearly increase should align with an older fiscal year in your books, pick any date that falls in that BS calendar year. Leave empty to use “Apply increase from” for the year phase instead.",
      applyIncreaseFromLabel: "Apply increase from (AD)",
    };
  }
  if (mode === "Both") {
    return {
      settingsIntro:
        "Schedule day, optional increase by percent or fixed amount. Your company shows both AD and BS — schedule " +
        "rules use BS month boundaries. For % or fixed, N means the interval you enter under Every (BS months) or " +
        "Every (BS years): 1 = every eligible period, 2 = every second period, and so on (up to 24). Pick month/day " +
        "when using yearly mode, then optional start date. Save here only stores schedule and rate (closes this window); Auto on/off uses main voucher Save. " +
        "Generate now (when allowed) opens a list when several BS months are missing: each row shows the voucher date for that period; tick rows to create only those, Select all for every gap, or leave all unticked to create just the most recent missing month. " +
        "(Delete before the scheduled day → can run again on that day; delete on or after that day → no auto recreate for that BS month.) " +
        "Journal: same debit/credit account lines share one template — Auto on/off on any month’s voucher applies to the whole series.",
      scheduleMonthDayLabel: "BS month day (generate on)",
      lastDayOfScheduledMonth: "Last day of BS month",
      everyMonthOption: "Every BS month (each scheduled voucher)",
      oncePerYearOption: "Once per BS year (pick BS month and day)",
      everyNMonthsLabel: "Every (BS months)",
      bumpWhenMonthLabel: "BS month (when bump applies)",
      bumpDayLabel: "BS day",
      everyNYearsLabel: "Every (BS years)",
      yearlyBaseAnchorLabel: "Base date for every-N-BS-years (optional)",
      yearlyBaseAnchorHint:
        "The BS calendar year of this date sets the phase for “every N years” (for example, pick a date in BS 2080 if you began using the app in BS 2081 but the increase rhythm should follow the earlier year). Leave empty to use the “Apply increase from” BS year instead.",
      applyIncreaseFromLabel: "Apply increase from (BS / AD)",
    };
  }
  return {
    settingsIntro:
      "Schedule day, optional increase by percent or fixed amount. For % or fixed, N is the interval you set under " +
      "Every (BS months) or Every (BS years): 1 = every eligible period, 2 = every second period, etc. (max 24). " +
      "Use yearly mode to pick BS month and day, then optional start date on the calendar. Save here only stores schedule and rate (closes this window); Auto on/off uses main voucher Save. " +
      "Generate now (when allowed) opens a list when several BS months are missing: each row shows the voucher date for that period; tick rows to create only those, Select all for every gap, or leave all unticked to create just the most recent missing month. " +
      "(Delete before the scheduled day → can run again on that day; delete on or after that day → no auto recreate for that BS month.) " +
      "Journal: same debit/credit account lines share one template — Auto on/off on any month’s voucher applies to the whole series.",
    scheduleMonthDayLabel: "BS month day (generate on)",
    lastDayOfScheduledMonth: "Last day of BS month",
    everyMonthOption: "Every BS month (each scheduled voucher)",
    oncePerYearOption: "Once per BS year (pick BS month and day)",
    everyNMonthsLabel: "Every (BS months)",
    bumpWhenMonthLabel: "BS month (when bump applies)",
    bumpDayLabel: "BS day",
    everyNYearsLabel: "Every (BS years)",
    yearlyBaseAnchorLabel: "Base date for every-N-BS-years (optional)",
    yearlyBaseAnchorHint:
      "The BS calendar year of this date sets the phase for “every N years” (for example, pick a date in BS 2080 if you began using the app in BS 2081 but the increase rhythm should follow the earlier year). Leave empty to use the “Apply increase from” BS year instead.",
    applyIncreaseFromLabel: "Apply increase from (BS)",
  };
}
