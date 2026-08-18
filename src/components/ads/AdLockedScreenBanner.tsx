"use client";

import { usePathname } from "next/navigation";
import { useAdSettings } from "@/hooks/useAdSettings";
import { useAdWallet } from "@/hooks/useAdWallet";
import { usePlanFeatureAllowed } from "@/hooks/use-feature-access";
import { WatchAdUnlockCard } from "@/components/ads/WatchAdUnlockCard";
import { adScreenIdFromPathname, findUnlockOfferForScreen, isFeatureLockScreenTicked } from "@/lib/ads/adFeatureMap";

/** Shows Watch-ad only on ticked locked screens when ads master switch is ON. */
export function AdLockedScreenBanner() {
  const pathname = usePathname();
  const { adsEnabled, settings } = useAdSettings();
  const screenId = adScreenIdFromPathname(pathname);
  const offer = screenId ? findUnlockOfferForScreen(settings, screenId) : undefined;
  const planAllowed = usePlanFeatureAllowed(screenId || "dashboard");
  const { isFeatureTemporarilyUnlocked } = useAdWallet();

  if (!adsEnabled || !screenId || !offer) return null;
  if (!isFeatureLockScreenTicked(settings, screenId)) return null;
  if (planAllowed) return null;
  if (isFeatureTemporarilyUnlocked(screenId)) return null;

  return (
    <div className="border-b bg-background px-3 py-2 sm:px-4">
      <WatchAdUnlockCard featureId={screenId} />
    </div>
  );
}
