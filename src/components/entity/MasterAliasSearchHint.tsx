"use client";

import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";

/**
 * Master list row: shows the optional Alias Name (pink search highlight) only when the
 * current search matched the alias and not the visible name - so users see why the row matched.
 */
export function MasterAliasSearchHint({ alias, name, search }: { alias?: unknown; name?: unknown; search: string }) {
  const a = typeof alias === "string" ? alias.trim() : "";
  const q = search.trim();
  if (!a || !q) return null;
  if (!masterEntityTextMatchesSearch(a, q) || masterEntityTextMatchesSearch(name, q)) return null;
  return (
    <span className="block min-w-0 truncate text-[11px] leading-tight text-muted-foreground" title={`Alias: ${a}`}>
      Alias: {highlightQueryInText(a, q)}
    </span>
  );
}
