import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { corsHeadersForPocketLedgerBillingApi } from "@/lib/server/billingApiCors";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { todayDayKey, type AdActiveUnlock, type AdPendingEvent } from "@/lib/ads/adWalletTypes";

const MAX_EVENTS = 80;
const MAX_PROCESSED = 400;

type Body = {
  pending?: unknown;
  local?: {
    points?: unknown;
    earnedToday?: unknown;
    dayKey?: unknown;
    unlocks?: unknown;
  };
};

function asInt(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function parsePending(raw: unknown): AdPendingEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: AdPendingEvent[] = [];
  for (const item of raw.slice(0, MAX_EVENTS)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const eventId = String(row.eventId || "").trim().slice(0, 80);
    const type = row.type === "spend" ? "spend" : row.type === "reward" ? "reward" : "";
    if (!eventId || !type) continue;
    out.push({
      eventId,
      type,
      pointsDelta: asInt(row.pointsDelta),
      unlockId: row.unlockId ? String(row.unlockId).slice(0, 80) : undefined,
      featureId: row.featureId ? String(row.featureId).slice(0, 80) : undefined,
      durationHours: row.durationHours != null ? asInt(row.durationHours) : undefined,
      expiresAtMs: row.expiresAtMs != null ? asInt(row.expiresAtMs) : undefined,
      createdAtMs: asInt(row.createdAtMs, Date.now()),
    });
  }
  return out;
}

function parseUnlocks(raw: unknown): AdActiveUnlock[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id || "").trim().slice(0, 80);
      const featureId = String(row.featureId || "").trim().slice(0, 80);
      const expiresAtMs = asInt(row.expiresAtMs);
      if (!id || !featureId || expiresAtMs <= now) return null;
      return { id, featureId, expiresAtMs };
    })
    .filter((row): row is AdActiveUnlock => Boolean(row));
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeadersForPocketLedgerBillingApi(req) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeadersForPocketLedgerBillingApi(req);
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503, headers: cors });
    }
    const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401, headers: cors });
    }
    getAdminDb();
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401, headers: cors });
    }
    const uid = decoded.uid;
    const body = (await req.json().catch(() => ({}))) as Body;
    const pending = parsePending(body.pending);
    const db = getAdminDb();
    const ref = db.collection("ad_wallets").doc(uid);
    const snap = await ref.get();
    const prev = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const processed = new Set(
      Array.isArray(prev.processedEventIds) ? prev.processedEventIds.map((id) => String(id)) : []
    );

    let points = asInt(prev.points);
    let earnedToday = asInt(prev.earnedToday);
    let dayKey = String(prev.dayKey || todayDayKey());
    const today = todayDayKey();
    if (dayKey !== today) {
      dayKey = today;
      earnedToday = 0;
    }
    let unlocks = parseUnlocks(prev.unlocks);
    const applied: string[] = [];

    for (const event of pending) {
      if (processed.has(event.eventId)) {
        applied.push(event.eventId);
        continue;
      }
      if (event.type === "reward") {
        const add = Math.max(0, event.pointsDelta);
        points += add;
        earnedToday += add;
      } else if (event.type === "spend") {
        const cost = Math.abs(event.pointsDelta);
        points = Math.max(0, points - cost);
        if (event.featureId && event.expiresAtMs && event.unlockId) {
          unlocks = [
            ...unlocks.filter((row) => row.featureId !== event.featureId),
            { id: event.unlockId, featureId: event.featureId, expiresAtMs: event.expiresAtMs },
          ];
        }
      }
      processed.add(event.eventId);
      applied.push(event.eventId);
    }

    unlocks = unlocks.filter((row) => row.expiresAtMs > Date.now());
    const processedEventIds = [...processed].slice(-MAX_PROCESSED);
    await ref.set(
      {
        points,
        earnedToday,
        dayKey,
        unlocks,
        processedEventIds,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        ok: true,
        points,
        earnedToday,
        dayKey,
        unlocks,
        processedEventIds: applied,
      },
      { headers: cors }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ad reward sync failed";
    return NextResponse.json({ error: msg }, { status: 500, headers: cors });
  }
}
