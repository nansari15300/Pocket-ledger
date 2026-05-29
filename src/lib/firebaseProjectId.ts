/**
 * Static/APK hosted API calls (Drive OAuth, plans) — Firebase project id client bundle se.
 * Server isi se verify karta hai ke request sahi project ki hai (secrets server par rehte hain).
 */
export function firebaseConfigProjectId(): string {
  const fromEnv =
    typeof process !== "undefined" ? String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim() : "";
  if (fromEnv) return fromEnv;
  // firebase.ts hardcoded config fallback — static build me env miss ho to bhi project key mile.
  return "studio-5452513410-a3f5b";
}
