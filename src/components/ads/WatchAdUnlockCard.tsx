"use client";

import { Loader2, Megaphone } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAdSettings } from "@/hooks/useAdSettings";
import { useAdWallet } from "@/hooks/useAdWallet";
import { useToast } from "@/hooks/use-toast";
import { findUnlockOfferByFeatureId } from "@/lib/ads/adFeatureMap";
import type { AdUnlockOffer } from "@/lib/adSettings";
import { cn } from "@/lib/utils";

export function WatchAdUnlockCard({
  featureId,
  title,
  className,
}: {
  featureId: string;
  title?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const { adsEnabled, settings } = useAdSettings();
  const { wallet, canWatchAd, busy, watchRewardedAd, spendUnlock, unlockExpiresAt } = useAdWallet();
  const offer: AdUnlockOffer | undefined = findUnlockOfferByFeatureId(settings, featureId);
  const expiresAt = unlockExpiresAt(featureId);

  if (!adsEnabled || !offer) return null;

  async function onWatch() {
    const result = await watchRewardedAd();
    toast({
      title: result.ok ? "Points earned" : "Ad not completed",
      description: result.message,
      variant: result.ok ? "default" : "destructive",
    });
  }

  async function onUnlock() {
    if (!offer) return;
    const result = await spendUnlock(offer);
    toast({
      title: result.ok ? "Feature unlocked" : "Could not unlock",
      description: result.message,
      variant: result.ok ? "default" : "destructive",
    });
  }

  if (expiresAt && expiresAt > Date.now()) {
    const hrsLeft = Math.max(1, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)));
    return (
      <div className={cn("rounded-lg border bg-muted/40 p-3 text-sm", className)}>
        <p className="font-medium">{title || offer.label} is unlocked with points</p>
        <p className="text-xs text-muted-foreground">About {hrsLeft} hr remaining.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", className)}>
      <div className="flex items-start gap-2">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title || `Unlock ${offer.label} with points`}</p>
          <p className="text-xs text-muted-foreground">
            {offer.pointsCost} pts can provide upto {offer.durationHours} hrs. You have {wallet.points} pts.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy || !canWatchAd} onClick={() => void onWatch()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Watch ad
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || wallet.points < offer.pointsCost}
          onClick={() => void onUnlock()}
        >
          Unlock ({offer.pointsCost} pts)
        </Button>
        <Link href="/billing" className="text-xs font-medium text-primary underline">
          Upgrade plan
        </Link>
      </div>
      {!canWatchAd ? (
        <p className="text-xs text-muted-foreground">Rewarded ads play in the Android app.</p>
      ) : null}
    </div>
  );
}
