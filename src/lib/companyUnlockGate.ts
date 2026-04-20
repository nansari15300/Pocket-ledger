import type { Company } from "@/hooks/useCompany";

/** Company row jisme selector `isOwned` set karta hai */
export type CompanyUnlockRow = Company & { isOwned?: boolean };

/** `storageOption` local = offline device par data */
export function isOfflineCompanyStorage(c: { storageOption?: string }): boolean {
  return String(c.storageOption || "local").toLowerCase() === "local";
}

/** Shared + cloud (Firebase) — unlock: Company Profile `adminUsername` + root `password` */
export function isOnlineSharedCompany(c: CompanyUnlockRow): boolean {
  return !c.isOwned && !isOfflineCompanyStorage(c);
}

/** Unlock verify ke liye: `adminUsername` ya owner email ka prefix (local login jaisa fallback). */
export function effectiveCompanyAdminUsername(company: CompanyUnlockRow): string {
  let u = String((company as { adminUsername?: string | null }).adminUsername ?? "").trim();
  if (u) return u;
  const oe = String(company.ownerEmail ?? "").trim();
  if (oe.includes("@")) return oe.split("@")[0].trim();
  return "";
}

export function getShareEntryForEmail(company: CompanyUnlockRow, email: string | undefined | null) {
  if (!email) return undefined;
  const e = email.toLowerCase().trim();
  return company.sharedWith?.find((u: { email?: string }) => String(u.email || "").toLowerCase().trim() === e);
}

/** Select se pehle dialog dikhana hai ya nahi */
export function shouldPromptCompanyUnlock(company: CompanyUnlockRow, userEmail?: string | null): boolean {
  // Shared + cloud: sirf tab jab owner ne "Protect company" password lagaya ho (Company Profile).
  if (isOnlineSharedCompany(company)) return !!company.password;
  const se = getShareEntryForEmail(company, userEmail || undefined);
  return !!(se?.password || company.password);
}

/** Username field: online shared jab company password on ho; offline shared jab share row me name+password ho */
export function showCompanyUserNameField(company: CompanyUnlockRow, userEmail?: string | null): boolean {
  if (isOnlineSharedCompany(company)) return !!company.password;
  const se = getShareEntryForEmail(company, userEmail || undefined);
  return !!(se?.password && String((se as { name?: string }).name || "").trim());
}

/**
 * Company access verify: owner = root password; online shared = Company Profile admin username + root password.
 */
export function verifyCompanyUnlock(
  company: CompanyUnlockRow,
  userEmail: string | undefined,
  usernameInput: string,
  passwordInput: string
): { ok: true } | { ok: false; message: string } {
  const se = getShareEntryForEmail(company, userEmail);

  const isOwner = company.isOwned === true;

  // Owner: sirf root company password (shared user password alag)
  if (isOwner && company.password && !se?.password) {
    if (passwordInput !== company.password) return { ok: false, message: "Wrong company password." };
    return { ok: true };
  }

  if (isOnlineSharedCompany(company)) {
    if (!se) return { ok: false, message: "No share entry for your account." };
    if (!company.password) return { ok: true };
    const adminLogin = effectiveCompanyAdminUsername(company);
    if (!adminLogin) {
      return {
        ok: false,
        message: "Owner must set Admin username (Company Profile) before shared users can unlock with password.",
      };
    }
    const nameOk = usernameInput.trim().toLowerCase() === adminLogin.toLowerCase();
    const passOk = passwordInput === String(company.password);
    if (!nameOk || !passOk) return { ok: false, message: "Wrong company username or password." };
    return { ok: true };
  }

  if (se?.password) {
    if (showCompanyUserNameField(company, userEmail)) {
      const nameOk = usernameInput.trim().toLowerCase() === String((se as { name?: string }).name || "").trim().toLowerCase();
      const passOk = passwordInput === se.password;
      if (!nameOk || !passOk) return { ok: false, message: "Wrong company user name or password." };
      return { ok: true };
    }
    if (passwordInput !== se.password) return { ok: false, message: "Incorrect password." };
    return { ok: true };
  }

  if (company.password && !isOwner) {
    if (passwordInput !== company.password) return { ok: false, message: "Incorrect password." };
    return { ok: true };
  }

  return { ok: true };
}
