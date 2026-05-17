import "server-only";

import admin from "firebase-admin";
import { NextRequest } from "next/server";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export async function verifyBearerUid(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
  if (!isFirebaseAdminConfigured()) {
    return { error: "Firebase Admin not configured", status: 503 };
  }
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { error: "Missing Authorization Bearer token", status: 401 };
  getAdminDb();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return { error: "Invalid auth token", status: 401 };
  }
}
