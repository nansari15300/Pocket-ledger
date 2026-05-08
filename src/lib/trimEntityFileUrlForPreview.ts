/**
 * Party / staff / bank / tax list avatar + hover portal:
 * kabhi-kabhi Firestore/SQLite me `fileUrl` string `"null"` / khali save ho jata — bina file ke bhi PDF preview spinner.
 * Ye helper se sirf usable URL par hover + `ResolvedEntityAvatar` src lagao.
 */
export function trimEntityFileUrlForPreview(raw: string | null | undefined): string | null {
  const u = String(raw ?? "").trim();
  if (!u) return null;
  const low = u.toLowerCase();
  if (low === "null" || low === "undefined" || low === "none" || low === "n/a") return null;
  return u;
}
