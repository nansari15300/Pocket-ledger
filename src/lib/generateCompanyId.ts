import { slugify } from "@/lib/slugify";

/** Company doc ID: `name_shortId` — readable in Firestore + unique per create/restore. */
export function generateCompanyId(companyName: string): string {
  const slug = slugify(companyName, 40);
  const shortId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36).slice(-6)}`;
  return `${slug}_${shortId}`;
}
