/**
 * Document navigation offline fallback (`sw.ts` fallbacks.entries).
 * User ko blank error ke bajaye short message — data tab bhi SQLite pe ho sakta hai jab app shell cache se khule.
 */
export default function OfflineFallbackPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg font-semibold text-foreground">No internet connection</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {/* PWA sirf offline shell/`~offline` dikhaye jab SW precache incomplete ho; cloud login ke liye ek baar online + Firestore IndexedDB warmup; SQLite companies ke liye app me Local data source */}
        Open Pocket Ledger online once so this device can cache the app shell and your signed-in Firestore profile. Offline/local companies stored in SQLite on this device work after that cached session exists.
      </p>
    </div>
  );
}
