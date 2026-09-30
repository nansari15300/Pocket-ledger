import { getAdminDb } from "@/lib/firebaseAdmin";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";

/** Admin API: SuperAdmin = users role, admin_config, env allowlist, ya hardcoded emails. */
export async function isSuperAdminServer(uid: string, email: string | undefined): Promise<boolean> {
  const db = getAdminDb();
  const normalize = (v: string | undefined | null) => String(v || "").trim().toLowerCase();
  const uidSnap = await db.collection("users").doc(uid).get();
  const roleFromUid = uidSnap.exists ? normalize(String((uidSnap.data() as { role?: string })?.role ?? "")) : "";
  if (roleFromUid === "superadmin") return true;

  if (email) {
    const normEmail = normalize(email);
    // Client SuperAdmin gate (`getSuperAdminEmails` / NEXT_PUBLIC_SUPER_ADMIN_EMAILS) ke saath align.
    if (getSuperAdminEmails().map((x) => normalize(x)).includes(normEmail)) return true;

    const byEmailExact = await db.collection("users").where("email", "==", email).limit(10).get();
    const byEmailLower =
      normalize(email) !== email
        ? await db.collection("users").where("email", "==", normalize(email)).limit(10).get()
        : null;
    for (const d of [...byEmailExact.docs, ...(byEmailLower?.docs ?? [])]) {
      const role = normalize(String((d.data() as { role?: string })?.role ?? ""));
      if (role === "superadmin") return true;
    }
    const cfg = await db.doc("app_settings/admin_config").get();
    const list = ((cfg.data() as { superAdminEmails?: string[] })?.superAdminEmails ?? []) as string[];
    // Config list casing/space mismatch me bhi super-admin email match ho.
    if (list.map((x) => normalize(x)).includes(normEmail)) return true;
    if (normalize("nansari15300@gmail.com") === normEmail) return true;
    if (normalize("nabiullah.ansari@gmail.com") === normEmail) return true;
  }
  return false;
}
