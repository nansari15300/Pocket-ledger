import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { publishedWebsiteVideos, WEBSITE_VIDEOS_DOC } from "@/lib/websiteVideos";
import {
  WEBSITE_VIDEO_STATS_DOC,
  clampRating,
  emptyVideoEngagement,
  mergeVideoEngagement,
  normalizeVideoId,
  publicEngagementPayload,
  type WebsiteVideoEngagementAction,
} from "@/lib/websiteVideoEngagement";

export const dynamic = "force-dynamic";

function isAction(raw: unknown): raw is WebsiteVideoEngagementAction {
  return raw === "view" || raw === "like" || raw === "unlike" || raw === "rate";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const videoId = normalizeVideoId(body.videoId);
    if (!videoId) {
      return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
    }
    if (!isAction(body.action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const action = body.action;
    const rating = action === "rate" ? clampRating(body.rating) : null;
    const previousRating = action === "rate" ? clampRating(body.previousRating) : null;
    if (action === "rate" && rating == null) {
      return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
    }

    const db = getAdminDb();
    const videosSnap = await db.doc(WEBSITE_VIDEOS_DOC).get();
    const published = publishedWebsiteVideos(videosSnap.exists ? videosSnap.data() : undefined);
    // Match both raw and normalized ids (admin may store vid-… with punctuation).
    const known = published.some(
      (video) => video.id === videoId || normalizeVideoId(video.id) === videoId
    );
    if (!known) {
      return NextResponse.json({ error: "Unknown video" }, { status: 404 });
    }

    const statsKey =
      published.find((video) => video.id === videoId || normalizeVideoId(video.id) === videoId)?.id ||
      videoId;

    const statsRef = db.doc(WEBSITE_VIDEO_STATS_DOC);
    const now = Date.now();
    const engagement = await db.runTransaction(async (tx) => {
      const snap = await tx.get(statsRef);
      const prevRoot = snap.exists ? (snap.data() as Record<string, unknown>) : {};
      const byVideo =
        prevRoot.byVideo && typeof prevRoot.byVideo === "object"
          ? { ...(prevRoot.byVideo as Record<string, unknown>) }
          : {};
      const current = mergeVideoEngagement(byVideo[statsKey] || byVideo[videoId]);
      const next = { ...current };
      if (action === "view") next.views += 1;
      if (action === "like") next.likes += 1;
      if (action === "unlike") next.likes = Math.max(0, next.likes - 1);
      if (action === "rate" && rating != null) {
        if (previousRating != null && next.ratingCount > 0) {
          // Same visitor changing stars — replace previous vote, don't add a new voter.
          next.ratingSum = Math.max(0, next.ratingSum - previousRating) + rating;
        } else {
          next.ratingSum += rating;
          next.ratingCount += 1;
        }
      }
      next.ratingAvg =
        next.ratingCount > 0 ? Math.round((next.ratingSum / next.ratingCount) * 10) / 10 : 0;
      byVideo[statsKey] = {
        views: next.views,
        likes: next.likes,
        ratingSum: next.ratingSum,
        ratingCount: next.ratingCount,
      };
      tx.set(
        statsRef,
        {
          byVideo,
          updatedAtMs: now,
        },
        { merge: true }
      );
      return next;
    });

    return NextResponse.json({
      ok: true,
      videoId: statsKey,
      engagement: publicEngagementPayload(engagement || emptyVideoEngagement()),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
