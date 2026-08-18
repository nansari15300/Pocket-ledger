import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { isSuperAdminServer } from "@/lib/server/isSuperAdminServer";
import {
  DOWNLOAD_EVENTS_COLLECTION,
  DOWNLOAD_STATS_DOC,
  mergeDownloadStatsDoc,
  type WebsiteDownloadEvent,
  type WebsiteDownloadPlatform,
} from "@/lib/websiteDownloadStats";

export const dynamic = "force-dynamic";

async function requireSuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { error: NextResponse.json({ error: "Missing Authorization" }, { status: 401 }) };
  if (!isFirebaseAdminConfigured()) {
    return { error: NextResponse.json({ error: "Admin not configured" }, { status: 503 }) };
  }
  getAdminDb();
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return { error: NextResponse.json({ error: "Invalid auth token" }, { status: 401 }) };
  }
  if (!(await isSuperAdminServer(decoded.uid, decoded.email ?? undefined))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if ("error" in gate) return gate.error;

    const db = getAdminDb();
    const [statsSnap, eventsSnap] = await Promise.all([
      db.doc(DOWNLOAD_STATS_DOC).get(),
      db.collection(DOWNLOAD_EVENTS_COLLECTION).orderBy("createdAtMs", "desc").limit(100).get(),
    ]);
    const stats = mergeDownloadStatsDoc(statsSnap.exists ? statsSnap.data() : undefined);
    const recent: WebsiteDownloadEvent[] = eventsSnap.docs.map((d) => {
      const row = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        platform: String(row.platform || "windows") as WebsiteDownloadPlatform,
        country: String(row.country || "ZZ"),
        version: row.version ? String(row.version) : undefined,
        fileName: row.fileName ? String(row.fileName) : undefined,
        source: row.source ? String(row.source) : undefined,
        createdAtMs: Number(row.createdAtMs) || 0,
      };
    });

    const byCountryRows = Object.entries(stats.byCountry)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));

    return NextResponse.json({
      stats,
      byCountry: byCountryRows,
      recent,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
