import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  publishedWebsiteVideos,
  visibleWebsiteVideoCategories,
  WEBSITE_VIDEOS_DOC,
} from "@/lib/websiteVideos";
import {
  WEBSITE_VIDEO_STATS_DOC,
  emptyVideoEngagement,
  mergeVideoStatsDoc,
  publicEngagementPayload,
} from "@/lib/websiteVideoEngagement";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminDb();
    const [videosSnap, statsSnap, featuresSnap] = await Promise.all([
      db.doc(WEBSITE_VIDEOS_DOC).get(),
      db.doc(WEBSITE_VIDEO_STATS_DOC).get(),
      db.doc("app_settings/features").get(),
    ]);
    const featureConfig = (featuresSnap.exists ? featuresSnap.data() : {}) as Record<string, boolean>;
    const categories = visibleWebsiteVideoCategories(featureConfig);
    const stats = mergeVideoStatsDoc(statsSnap.exists ? statsSnap.data() : undefined);
    const videos = publishedWebsiteVideos(videosSnap.exists ? videosSnap.data() : undefined).map(
      (video) => ({
        ...video,
        engagement: publicEngagementPayload(stats[video.id] || emptyVideoEngagement()),
      })
    );
    return NextResponse.json(
      { videos, categories, source: "server" as const },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
