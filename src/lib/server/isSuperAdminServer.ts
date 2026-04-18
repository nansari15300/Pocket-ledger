import { getAdminDb } from "@/lib/firebaseAdmin";

/** Admin API: SuperAdmin = users role, superAdminEmails, ya hardcoded allowlist. */
export async function isSuperAdminServer(uid: string, email: string | undefined): Promise<boolean> {
  const db = getAdminDb();
  const uidSnap = await db.collection("users").doc(uid).get();
  const roleFromUid = uidSnap.exists ? String((uidSnap.data() as { role?: string })?.role ?? "") : "";
  if (roleFromUid === "SuperAdmin") return true;

  if (email) {
    const byEmail = await db.collection("users").where("email", "==", email).limit(10).get();
    for (const d of byEmail.docs) {
      if (String((d.data() as { role?: string })?.role ?? "") === "SuperAdmin") return true;
    }
    const cfg = await db.doc("app_settings/admin_config").get();
    const list = ((cfg.data() as { superAdminEmails?: string[] })?.superAdminEmails ?? []) as string[];
    if (list.includes(email)) return true;
  }
  return (
    email === "nansari15300@gmail.com" ||
    email === "nabiullah.ansari@gmail.com"
  );
}
