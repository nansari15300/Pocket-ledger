/**
 * Safe for Firestore document IDs: no . / [ ]
 * Used for company and user doc IDs: name_uid so path is readable in console.
 */
export function slugify(name: string, maxLength = 40): string {
  if (!name || typeof name !== "string") return "item";
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[./[\]\\]/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (s || "item").slice(0, maxLength);
}
