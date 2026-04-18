/**
 * Simple similarity: 0 = no match, 1 = exact.
 * Uses normalized (lowercase, trim) and ratio of matching chars / max length.
 */
export function stringSimilarity(a: string, b: string): number {
  const na = String(a ?? "").trim().toLowerCase();
  const nb = String(b ?? "").trim().toLowerCase();
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  let matches = 0;
  const minLen = Math.min(na.length, nb.length);
  for (let i = 0; i < minLen; i++) {
    if (na[i] === nb[i]) matches++;
  }
  return matches / maxLen;
}

/**
 * Levenshtein-based similarity (0–1). More accurate for typos.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const na = String(a ?? "").trim().toLowerCase();
  const nb = String(b ?? "").trim().toLowerCase();
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const d = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - d / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/** Threshold above which we ask user: merge or keep separate (e.g. 0.75). */
export const FUZZY_MERGE_THRESHOLD = 0.75;
