const WORD_LETTER_RE = /(^|[\s([{/"'`-])([A-Za-z])([A-Za-z]*)/g;

export function toFirstLetterCapitalWords(value: string): string {
  return value.replace(WORD_LETTER_RE, (_match, prefix: string, first: string, rest: string) => {
    return `${prefix}${first.toUpperCase()}${rest.toLowerCase()}`;
  });
}

export function shouldAutoCapitalizeTextField(meta: {
  type?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoCapitalize?: string;
  disabled?: boolean;
  readOnly?: boolean;
}): boolean {
  if (meta.disabled || meta.readOnly) return false;
  if (meta.autoCapitalize === "off" || meta.autoCapitalize === "none") return false;
  const type = String(meta.type || "text").toLowerCase();
  if (!["", "text"].includes(type)) return false;
  const haystack = `${meta.name || ""} ${meta.placeholder || ""} ${meta.ariaLabel || ""}`.toLowerCase();
  if (/(email|phone|mobile|ifsc|pan|gst|vat|code|number|no\.|url|link|search|password|voucher)/.test(haystack)) {
    return false;
  }
  return /(name|title|narration|description|account|party|staff|group|bank|address|city|state|country|remarks?)/.test(haystack);
}

export function shouldNormalizeOnTextChange(value: string): boolean {
  return /\s$/.test(value);
}
