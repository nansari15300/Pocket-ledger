/** Per-column header filter: space-separated tokens; har token column text me kahin bhi match ho sakta hai. */

export function normalizeColumnFilterTokens(raw: string): string[] {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/,/g, "").trim())
    .filter(Boolean);
}

export function columnHaystackMatchesFilter(haystack: string, rawSearchTerm: string): boolean {
  const tokens = normalizeColumnFilterTokens(rawSearchTerm);
  if (tokens.length === 0) return true;
  const hay = String(haystack || "")
    .toLowerCase()
    .replace(/,/g, " ");
  return tokens.every((tok) => hay.includes(tok));
}

/** Amount columns: number search + text labels (e.g. TDS Verified / Unverified in empty Dr/Cr). */
export function amountColumnHaystackMatchesFilter(
  displayHaystack: string,
  rawSearchTerm: string
): boolean {
  const tokens = normalizeColumnFilterTokens(rawSearchTerm);
  if (tokens.length === 0) return true;
  const hay = String(displayHaystack || "")
    .toLowerCase()
    .replace(/,/g, " ");

  // Text first — "verified" must not match "unverified".
  const textOk = tokens.every((tok) => {
    if (tok === "verified") {
      return hay.includes("tds verified") || (/\bverified\b/.test(hay) && !hay.includes("unverified"));
    }
    if (tok === "paid") {
      return hay.includes("tds verified") || /\bpaid\b/.test(hay);
    }
    if (tok === "unpaid") {
      return hay.includes("unpaid") || hay.includes("tds unverified");
    }
    if (tok === "unverified") {
      return hay.includes("unverified");
    }
    return hay.includes(tok);
  });
  if (textOk) return true;

  const numericTokens = tokens.map((t) => t.replace(/[^0-9.]/g, "")).filter(Boolean);
  if (numericTokens.length === 0) return false;
  const clean = String(displayHaystack || "").replace(/[^0-9.-]/g, "");
  return numericTokens.every((tok) => clean.includes(tok));
}

export function columnFieldValuesHaystack(fields: readonly unknown[]): string {
  return fields
    .map((v) => {
      if (v == null || v === "") return "";
      if (typeof v === "number" && Number.isFinite(v)) {
        return [String(v), v.toFixed(2), v.toLocaleString("en-IN"), v.toLocaleString()].join(" ");
      }
      return String(v);
    })
    .filter(Boolean)
    .join(" ");
}

/** Chip tokens for the Dr/Cr header filter popup (exact TDS badge filter, per column). */
export const TDS_BADGE_CHIP_TOKENS = ["verified", "unverified"] as const;

/**
 * Debit/Credit header filter on one row.
 * - NUMBER tokens match the amount of the SAME column (ownAmountHaystack).
 * - TEXT tokens (typed text) match the column's own amount display text first, then the TDS badge sitting in the OPPOSITE column
 *   (Debit filter -> badge in Credit cell, Credit filter -> badge in Debit cell). Pass "" when no such badge.
 * All tokens must pass. "verified" is an exact word (never matches "unverified").
 */
export function drCrFilterMatchesRow(rawTerm: string, ownAmountHaystack: string, oppositeBadgeLabel: string): boolean {
  const tokens = normalizeColumnFilterTokens(rawTerm);
  if (tokens.length === 0) return true;
  const badge = String(oppositeBadgeLabel || "");
  return tokens.every((tok) => {
    if (/^[\d.\-]+$/.test(tok)) return amountColumnHaystackMatchesFilter(ownAmountHaystack, tok);
    // Non-numeric text: try the column's own amount display text first ("Rs.", formatted strings), then the opposite-column badge.
    if (amountColumnHaystackMatchesFilter(ownAmountHaystack, tok)) return true;
    return badge ? amountColumnHaystackMatchesFilter(badge, tok) : false;
  });
}

/** Column that is OPPOSITE to the one holding the badge: its filter is the one that matches/highlights that badge. */
/** Chip state lives in its own filter key (not in the text input): "debitChip" / "creditChip" = "verified" | "unverified" | "". */
export function drCrChipKey(column: "debit" | "credit"): "debitChip" | "creditChip" {
  return column === "debit" ? "debitChip" : "creditChip";
}

/**
 * One Dr/Cr column filter = typed text/number (drCrFilterMatchesRow) AND chip (exact badge status in the OPPOSITE column).
 * Returns null when this column filter is not active (no text and no chip).
 */
export function drCrColumnFilterResult(
  text: string,
  chip: string,
  ownAmountHaystack: string,
  oppositeBadgeLabel: string
): boolean | null {
  const t = String(text || "").trim();
  const c = String(chip || "").trim().toLowerCase();
  if ((!t || t === "all") && !c) return null;
  const badge = String(oppositeBadgeLabel || "").trim().toLowerCase();
  const textOk = !t || t === "all" ? true : drCrFilterMatchesRow(t, ownAmountHaystack, oppositeBadgeLabel);
  const chipOk = !c ? true : badge === `tds ${c}`;
  return textOk && chipOk;
}

export function drCrOppositeKey(badgeColumn: string | null | undefined): "debit" | "credit" {
  return badgeColumn === "credit" ? "debit" : "credit";
}

/** Highlight text for a TDS badge: chip/exact word => only the status word; typed text => that text. */
export function tdsBadgeHighlightQuery(columnFilterText: string, badgeLabel: string, chip?: string): string {
  const q = String(columnFilterText || "").trim();
  const tok = q.toLowerCase();
  const word = String(badgeLabel || "").replace(/^\s*TDS\s+/i, "");
  // Chip / exact word: highlight only the status word ("Verified" / "Unverified"), not the "TDS " prefix.
  const chipWord = chip && word.toLowerCase() === String(chip).trim().toLowerCase() ? word : "";
  const textPart = (TDS_BADGE_CHIP_TOKENS as readonly string[]).includes(tok) ? (word.toLowerCase() === tok ? word : "") : q;
  return [textPart, chipWord].filter(Boolean).join(" ");
}
