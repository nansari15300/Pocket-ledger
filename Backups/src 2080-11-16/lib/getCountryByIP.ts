/**
 * Fetches country name for the current client by IP (via our API route).
 * Used at signup/login to set user.country for "User by country" categorization.
 */
export async function getCountryByIP(): Promise<string | null> {
  try {
    const res = await fetch("/api/geo", { cache: "no-store" });
    const data = await res.json();
    return typeof data?.country === "string" ? data.country : null;
  } catch {
    return null;
  }
}
