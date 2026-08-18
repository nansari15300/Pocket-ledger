import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import type { AdSettings } from "@/lib/adSettings";

export const GOOGLE_TEST_REWARDED_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";

let initialized = false;

function isAndroidNative(): boolean {
  if (!isCapacitorNativeApp()) return false;
  try {
    const C = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return String(C?.getPlatform?.() || "").toLowerCase() === "android";
  } catch {
    return false;
  }
}

export function canPlayRewardedAd(): boolean {
  return isAndroidNative();
}

export function rewardedAdUnitId(settings: AdSettings): string {
  if (settings.admob.testMode || !settings.admob.rewardedUnitId.trim()) {
    return GOOGLE_TEST_REWARDED_UNIT_ID;
  }
  return settings.admob.rewardedUnitId.trim();
}

type ShowResult = { rewarded: boolean; elapsedSeconds: number };

/**
 * Play a rewarded ad on Android APK only. Credits happen only when the SDK reports a reward.
 * Web / EXE / iOS: returns rewarded false (no fake credit).
 */
export async function showRewardedAd(settings: AdSettings): Promise<ShowResult> {
  if (!canPlayRewardedAd()) {
    return { rewarded: false, elapsedSeconds: 0 };
  }
  const started = Date.now();
  try {
    const { AdMob, RewardAdPluginEvents } = await import("@capacitor-community/admob");
    if (!initialized) {
      await AdMob.initialize({
        initializeForTesting: settings.admob.testMode !== false,
      });
      initialized = true;
    }

    const adId = rewardedAdUnitId(settings);
    let rewarded = false;
    const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      rewarded = true;
    });

    await AdMob.prepareRewardVideoAd({
      adId,
      isTesting: settings.admob.testMode !== false || adId === GOOGLE_TEST_REWARDED_UNIT_ID,
    });
    const rewardItem = await AdMob.showRewardVideoAd();
    if (rewardItem) rewarded = true;
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - started) / 1000));
    return { rewarded, elapsedSeconds };
  } catch {
    return { rewarded: false, elapsedSeconds: Math.max(0, Math.round((Date.now() - started) / 1000)) };
  }
}
