/**
 * Statement report header avatar fallback — PartyDetails `getInitials` jaisa (max 2 chars).
 */
export function reportEntityInitials(name: string) {
  if (!name?.trim()) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}
