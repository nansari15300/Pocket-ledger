import type { DaybookWedgeRow } from "@wedge/daybook/types/daybookWedgeRow";

export function formatDayLabelForSystem(
  day: Date,
  dateSystem: "AD" | "BS" | "Both",
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string
): string {
  if (dateSystem === "BS") return formatDateBS(day);
  if (dateSystem === "AD") return formatDate(day);
  return `${formatDate(day)} / ${formatDateBS(day)}`;
}

export function formatWedgeDayLabelFromIso(
  dayIso: string,
  dateSystem: "AD" | "BS" | "Both",
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string
): string {
  const d = new Date(dayIso);
  if (isNaN(d.getTime())) return "";
  return formatDayLabelForSystem(d, dateSystem, formatDate, formatDateBS);
}

/** Card footer date — respects AD / BS / Both toggle. */
export function formatWedgeRowMetaLine(
  row: DaybookWedgeRow,
  dateSystem: "AD" | "BS" | "Both",
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string
): string {
  const timePart = row.timePart || "";
  if (!row.sortKey) return row.metaLine;
  const d = new Date(row.sortKey);
  if (isNaN(d.getTime())) return row.metaLine;
  const datePart =
    dateSystem === "Both"
      ? `${formatDateBS(d)} · ${formatDate(d)}`
      : dateSystem === "BS"
        ? formatDateBS(d)
        : formatDate(d);
  return [datePart, timePart].filter(Boolean).join(" • ");
}
