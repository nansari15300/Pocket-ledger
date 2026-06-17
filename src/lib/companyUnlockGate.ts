import type { Company } from "@/hooks/useCompany";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";

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

/** Online shared row par user-specific password (Manage Sharing / Company Profile) — Protect company ke alag. */
export function onlineSharedHasPerUserPassword(company: CompanyUnlockRow, userEmail?: string | null): boolean {
  if (!isOnlineSharedCompany(company)) return false;
  const se = getShareEntryForEmail(company, userEmail);
  return !!(se && se.password != null && String(se.password).trim() !== "");
}

/** Offline company me `localCompanyUsers` rows — bina Protect company password ke bhi login chahiye. */
export function offlineCompanyHasLocalLoginUsers(company: unknown): boolean {
  if (!company || typeof company !== "object") return false;
  return parseLocalCompanyUserRows((company as { localCompanyUsers?: unknown }).localCompanyUsers).length > 0;
}

/** Select se pehle dialog dikhana hai ya nahi */
export function shouldPromptCompanyUnlock(company: CompanyUnlockRow, userEmail?: string | null): boolean {
  // Shared + cloud: Protect company password ya shared row par user-specific password.
  if (isOnlineSharedCompany(company)) {
    return !!company.password || onlineSharedHasPerUserPassword(company, userEmail);
  }
  if (isOfflineCompanyStorage(company)) {
    if (company.password) return true;
    if (offlineCompanyHasLocalLoginUsers(company)) return true;
    const se = getShareEntryForEmail(company, userEmail || undefined);
    return !!se?.password;
  }
  const se = getShareEntryForEmail(company, userEmail || undefined);
  return !!(se?.password || company.password);
}

/** List row slim ho to SQLite se local users check — unlock dialog ke liye. */
export async function shouldPromptCompanyUnlockAsync(
  company: CompanyUnlockRow,
  userEmail?: string | null
): Promise<boolean> {
  if (shouldPromptCompanyUnlock(company, userEmail)) return true;
  if (!isOfflineCompanyStorage(company) || !company.id) return false;
  try {
    const doc = await getLocalCompanyById(company.id, { includeDeleted: true });
    return offlineCompanyHasLocalLoginUsers(doc);
  } catch {
    return false;
  }
}

/** Username field: online shared jab Protect on ho ya shared user ka apna password ho; offline shared jab share row me name+password ho */
export function showCompanyUserNameField(company: CompanyUnlockRow, userEmail?: string | null): boolean {
  if (isOnlineSharedCompany(company)) {
    return !!company.password || onlineSharedHasPerUserPassword(company, userEmail);
  }
  const se = getShareEntryForEmail(company, userEmail || undefined);
  return !!(se?.password && String((se as { name?: string }).name || "").trim());
}

/**
 * Company access verify: owner = root password; online shared = shared row email/name + per-user password,
 * ya (Protect on ho to) Admin username + root password fallback.
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

    const sharedPassRaw = se.password;
    const sharedPass =
      sharedPassRaw != null && String(sharedPassRaw).trim() !== "" ? String(sharedPassRaw) : "";

    /** Per-shared-user password: login = same Google email, display name, ya email ka @ se pehle wala hissa. */
    const verifyPerUserSharedUnlock = (): { ok: true } | { ok: false; message: string } => {
      if (!sharedPass) return { ok: false, message: "Wrong company username or password." };
      const u = usernameInput.trim().toLowerCase();
      const emailNorm = String(se.email || "").toLowerCase().trim();
      const nameNorm = String((se as { name?: string }).name || "").trim().toLowerCase();
      const localFromEmail =
        emailNorm.includes("@") ? emailNorm.split("@")[0]!.trim().toLowerCase() : "";
      const userOk =
        (!!emailNorm && u === emailNorm) ||
        (!!localFromEmail && u === localFromEmail) ||
        (!!nameNorm && u === nameNorm);
      if (!userOk || passwordInput !== sharedPass) {
        return { ok: false, message: "Wrong company username or password." };
      }
      return { ok: true };
    };

    if (!company.password) {
      if (sharedPass) return verifyPerUserSharedUnlock();
      return { ok: true };
    }

    if (sharedPass) {
      const per = verifyPerUserSharedUnlock();
      if (per.ok) return per;
      const adminLogin = effectiveCompanyAdminUsername(company);
      if (
        adminLogin &&
        usernameInput.trim().toLowerCase() === adminLogin.toLowerCase() &&
        passwordInput === String(company.password)
      ) {
        return { ok: true };
      }
      return { ok: false, message: "Wrong company username or password." };
    }

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
