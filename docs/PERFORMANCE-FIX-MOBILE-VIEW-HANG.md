# Performance Fix: Page Unresponsive / Hang on Mobile View (PC)

## Problem (समस्या)

- **Symptom:** When using mobile view on PC (e.g. dev tools mobile toggle or resizing window), the page became unresponsive and showed "Page Unresponsive" / hung, especially on the **Items** page (`/items`).
- **Cause:** The mobile view state is driven by `useIsMobile()` from `use-mobile.tsx`. The hook listens to `resize` and `orientationchange` and runs `checkIsMobile()` / `checkOrientation()` on **every** event. Resize events fire many times per second while the user resizes or toggles view. Each run called `setState`, which re-rendered the whole app (Items page, ItemDetails, useVouchers, useTransactions, etc.). The main thread was overloaded → browser showed "Page Unresponsive".

## Root Cause

- **File:** `src/hooks/use-mobile.tsx`
- **Behavior:** No debouncing on `resize` / `orientationchange`. Every event triggered:
  1. `setIsPortrait(...)` (orientation effect)
  2. `checkIsMobile()` → `setIsMobile(...)` (and sometimes `setForcedViewModeState`)
- **Impact:** Dozens of state updates per second during resize → full tree re-renders → hang, especially on heavy pages like Items (list + details + transactions).

## Fix (समाधान)

- **File changed:** `src/hooks/use-mobile.tsx`
- **Change:** Debounce all resize/orientation handlers by **150 ms**.
  - Orientation: `setIsPortrait` is now scheduled with `setTimeout(..., 150)`; rapid resize only updates once after the user stops.
  - Mobile check: `checkIsMobile()` is now scheduled the same way; `setIsMobile` / `setForcedViewModeState` run at most once per 150 ms after the last resize.
- **Result:** Toggling mobile view on PC or resizing no longer floods the app with updates; the UI stays responsive and updates shortly after resize stops.

## Testing

1. Open Items page (`/items`), select an item so details load.
2. Toggle device toolbar (mobile view) in browser dev tools or resize the window repeatedly.
3. **Before:** Page could freeze / "Page Unresponsive".
4. **After:** Page stays responsive; layout switches to mobile/desktop about 150 ms after you stop resizing or toggling.

## Report Summary

| Item        | Detail |
|------------|--------|
| Issue      | Page hang / unresponsive when using mobile view on PC, especially on Items page |
| Root cause | Resize/orientation handlers in `use-mobile.tsx` running on every event without debounce |
| Fix        | Debounce 150 ms for both orientation and mobile-check handlers in `use-mobile.tsx` |
| Files      | `src/hooks/use-mobile.tsx` |
