/**
 * Master alias index: entity/group id -> Alias Name (`aliasName` field on parties, items, staff, bank, tax,
 * expense accounts and all master groups). Fed from useVouchers' master lists; read by the shared Combobox so
 * EVERY master combobox (whatever builds its options) matches typed text against the alias as well as the label.
 */
import { skeletonQueryMatches } from "@/modules/ocr/translit";
export { skeletonQueryMatches };

const aliasById = new Map<string, string>();

export function registerMasterAliases(rows: ReadonlyArray<unknown> | null | undefined): void {
  if (!rows) return;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const id = (r as { id?: unknown }).id;
    const alias = (r as { aliasName?: unknown }).aliasName;
    if (typeof id !== "string" || !id) continue;
    if (typeof alias === "string" && alias.trim()) aliasById.set(id, alias.trim());
    else aliasById.delete(id);
  }
}

export function getMasterAlias(id: string | null | undefined): string {
  return id ? aliasById.get(id) ?? "" : "";
}

/** Case-insensitive, Unicode-normalized (Devanagari NFC) search key. */
export function normalizeComboboxSearch(s: string): string {
  return String(s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}
