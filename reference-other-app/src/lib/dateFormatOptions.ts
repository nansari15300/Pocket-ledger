/**
 * Date format options for AD (Anno Domini) and BS (Bikram Samvat).
 * Used in DateFormatSettingsDialog and useDate.
 */

export const AD_DATE_FORMATS = [
  { value: "MM-dd-yyyy", label: "Month - Date - Year", example: "01-15-2025" },
  { value: "dd-MM-yyyy", label: "Date - Month - Year", example: "15-01-2025" },
  { value: "MMM dd, yyyy", label: "Month name - Date - Year", example: "Jan 15, 2025" },
  { value: "dd MMM yyyy", label: "Date - Short month - Year", example: "15 Jan 2025" },
  { value: "yyyy-MM-dd", label: "Year - Month - Date", example: "2025-01-15" },
  { value: "dd/MM/yyyy", label: "Date / Month / Year", example: "15/01/2025" },
] as const;

export const BS_DATE_FORMATS = [
  { value: "MM-DD-YYYY", label: "Month - Date - Year", example: "09-01-2082" },
  { value: "DD-MM-YYYY", label: "Date - Month - Year", example: "01-09-2082" },
  { value: "MMMM DD, YYYY", label: "Month name - Date - Year", example: "Poush 17, 2082" },
  { value: "MMM DD, YYYY", label: "Short month - Date - Year", example: "Pou 17, 2082" },
  { value: "YYYY-MM-DD", label: "Year - Month - Date", example: "2082-09-01" },
  { value: "DD/MM/YYYY", label: "Date / Month / Year", example: "01/09/2082" },
] as const;

export type ADFormatKey = (typeof AD_DATE_FORMATS)[number]["value"];
export type BSFormatKey = (typeof BS_DATE_FORMATS)[number]["value"];
