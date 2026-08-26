/** Nepal calendar = BS/Both dropdown; baaki companies sirf AD. */
export function isNepalCalendarCompany(company: {
  country?: string | null;
  fiscalYearStart?: unknown;
  displaySettings?: { calendarDateSystem?: string | null } | null;
} | null | undefined): boolean {
  if (!company) return false;
  if (String(company.country || "").trim() === "Nepal") return true;
  if (company.fiscalYearStart != null && company.fiscalYearStart !== "") return true;
  const cal = String(company.displaySettings?.calendarDateSystem || "").trim();
  return cal === "BS" || cal === "Both";
}

export function effectiveWedgeDateSystem(
  company: Parameters<typeof isNepalCalendarCompany>[0],
  preferred: "AD" | "BS" | "Both"
): "AD" | "BS" | "Both" {
  return isNepalCalendarCompany(company) ? preferred : "AD";
}
