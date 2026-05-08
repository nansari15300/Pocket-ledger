import * as React from "react";

/** User-typed search substring ke liye regex escape. */
export function escapeRegExpForHighlight(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Overlap mila kar ek hi pink segment banane ke liye intervals merge. */
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur);
  }
  return out;
}

/**
 * Recent footer search: visible string me case-insensitive match ko pink mark.
 * Space alag words — har word alag highlight (AND filter ke saath align).
 * Sirf caller jo text pass kare — global DOM search nahi.
 */
export function highlightQueryInText(text: string, query: string): React.ReactNode {
  const src = text ?? "";
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length || !src) return src;
  try {
    const intervals: [number, number][] = [];
    for (const tok of tokens) {
      const re = new RegExp(escapeRegExpForHighlight(tok), "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        intervals.push([m.index, m.index + m[0].length]);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    const merged = mergeIntervals(intervals);
    if (!merged.length) return src;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    merged.forEach(([a, b], i) => {
      if (a > cursor) parts.push(<React.Fragment key={`pre-${i}-${cursor}`}>{src.slice(cursor, a)}</React.Fragment>);
      parts.push(
        <mark
          key={`mk-${i}-${a}`}
          className="rounded-sm bg-fuchsia-200 px-px text-inherit dark:bg-fuchsia-500/40"
        >
          {src.slice(a, b)}
        </mark>
      );
      cursor = b;
    });
    if (cursor < src.length) parts.push(<React.Fragment key="tail">{src.slice(cursor)}</React.Fragment>);
    return parts;
  } catch {
    return src;
  }
}
