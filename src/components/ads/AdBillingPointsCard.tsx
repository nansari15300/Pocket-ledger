"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdSettings } from "@/hooks/useAdSettings";
import { useAdWallet } from "@/hooks/useAdWallet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function AdBillingPointsCard() {
  const { toast } = useToast();
  const { adsEnabled, settings } = useAdSettings();
  const { wallet, canWatchAd, busy, watchRewardedAd, spendUnlock, unlockExpiresAt } = useAdWallet();
  const [unlockListOpen, setUnlockListOpen] = useState(false);

  if (!adsEnabled || !settings.placements.billing) return null;

  const enabledTiers = settings.rewardTiers.filter((tier) => tier.enabled);
  const enabledOffers = settings.unlockOffers.filter((offer) => offer.enabled);

  async function onWatch() {
    const result = await watchRewardedAd();
    toast({
      title: result.ok ? "Points earned" : "Ad not completed",
      description: result.message,
      variant: result.ok ? "default" : "destructive",
    });
  }

  async function onUnlockOffer(offer: (typeof enabledOffers)[number]) {
    const result = await spendUnlock(offer);
    toast({
      title: result.ok ? "Feature unlocked" : "Could not unlock",
      description: result.message,
      variant: result.ok ? "default" : "destructive",
    });
  }

  return (
    <div className="mb-4 space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Reward points</p>
            <p className="text-xs text-muted-foreground">
              Balance {wallet.points} pts · today {wallet.earnedToday}/{settings.dailyMaxPoints} pts
            </p>
            {!canWatchAd ? (
              <p className="mt-1 text-xs text-muted-foreground">Rewarded ads play in the Android app.</p>
            ) : null}
          </div>
        </div>
        <Button type="button" size="sm" disabled={busy || !canWatchAd} onClick={() => void onWatch()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Watch ad
        </Button>
      </div>

      {enabledTiers.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Earn points per ad</p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {enabledTiers.map((tier) => (
              <li key={tier.id}>
                {tier.label}: up to {tier.points} pts
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {enabledOffers.length > 0 ? (
        <div>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left"
            onClick={() => setUnlockListOpen((open) => !open)}
            aria-expanded={unlockListOpen}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Unlock with points ({enabledOffers.length})
            </p>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", unlockListOpen && "rotate-180")}
            />
          </button>
          {unlockListOpen ? (
            <ul className="mt-2 space-y-2">
              {enabledOffers.map((offer) => {
                const expiresAt = unlockExpiresAt(offer.featureId);
                const active = expiresAt != null && expiresAt > Date.now();
                const hrsLeft =
                  active && expiresAt != null
                    ? Math.max(1, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)))
                    : null;
                return (
                  <li
                    key={offer.id}
                    className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{offer.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {offer.pointsCost} pts · upto {offer.durationHours} hrs
                        {active ? ` · active (~${hrsLeft} hr left)` : null}
                      </p>
                    </div>
                    {!active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        disabled={busy || wallet.points < offer.pointsCost}
                        onClick={() => void onUnlockOffer(offer)}
                      >
                        Unlock ({offer.pointsCost} pts)
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
