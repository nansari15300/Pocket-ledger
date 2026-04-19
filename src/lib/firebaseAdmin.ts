// src/lib/firebaseAdmin.ts
import "server-only";
import admin from "firebase-admin";

function normalizePrivateKey(key?: string): string | undefined {
  if (!key || typeof key !== "string") return undefined;
  let k = key.trim();
  if (!k) return undefined;
  // Unescape: \\n (from .env as string) -> real newline
  if (k.includes("\\n")) {
    k = k.replace(/\\n/g, "\n");
  }
  // Normalize line endings (Windows \r\n -> \n)
  k = k.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // PEM must have BEGIN/END; if stored without newlines after base64, re-wrap (optional)
  if (!k.includes("-----BEGIN") && k.length > 100) {
    return undefined; // invalid format
  }
  return k;
}

/** API routes: service account env poora hai ya nahi (503 + client fallback ke liye). */
export function isFirebaseAdminConfigured(): boolean {
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  return !!(projectId && clientEmail && privateKey);
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();

  // Web app jis project me hai, Admin bhi wahi hona chahiye (warna likha data client ko dikhega nahi).
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  try {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("parse private key") || msg.includes("PEM") || msg.includes("Invalid")) {
      throw new Error(
        "Firebase Admin private key is invalid. In .env, set FIREBASE_PRIVATE_KEY with the full key from Firebase Console (Service account), including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----. If the key is in one line, replace newlines with \\n (backslash-n)."
      );
    }
    throw err;
  }
}

export function getAdminDb() {
  getAdminApp();
  return admin.firestore();
}
