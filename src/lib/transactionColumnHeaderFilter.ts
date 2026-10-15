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
