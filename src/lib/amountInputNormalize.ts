/**
 * Amount/qty/rate fields: strip left-side zeros while typing (0 + 100 → 100, not 0100).
 * Keeps "0", "0.", and decimals like "0.5".
 */
export function sanitizeAmountInputString(raw: string): string {
  let s = String(raw ?? "").replace(/,/g, "");
  if (s === "") return "";

  const sign = s.startsWith("-") ? "-" : "";
  if (sign) s = s.slice(1);

  s = s.replace(/[^\d.]/g, "");
  const dotIdx = s.indexOf(".");
  const hadTrailingDot = s.endsWith(".");
  let intPart = dotIdx >= 0 ? s.slice(0, dotIdx) : s;
  let fracPart = dotIdx >= 0 ? s.slice(dotIdx + 1).replace(/\./g, "") : undefined;

  if (intPart.length > 1) {
    if (/^0+$/.test(intPart)) intPart = "0";
    else intPart = intPart.replace(/^0+(?=\d)/, "");
  }
  if (intPart === "" && fracPart !== undefined) {
    intPart = "0";
  }

  let out = sign + intPart;
  if (fracPart !== undefined) {
    out += "." + fracPart;
  } else if (hadTrailingDot && dotIdx >= 0) {
    out += ".";
  }
  return out;
}

/** Parse sanitized amount text for form state (empty → 0). */
export function parseAmountInputString(raw: string): number {
  const cleaned = sanitizeAmountInputString(String(raw ?? "").trim());
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Blur/display: number → input string without spurious leading zeros. */
export function formatAmountInputDisplay(value: unknown): string {
  if (value === "" || value === null || value === undefined) return "";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return sanitizeAmountInputString(String(value));
  if (n === 0) return "0";
  return sanitizeAmountInputString(String(n));
}
