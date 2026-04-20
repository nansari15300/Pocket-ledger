/**
 * `/company` and `/company/create` mount two parallel company queries (owned + shared).
 * `signOut` while those `onSnapshot` listeners are still active triggers Firestore 12.12 ca9/b815.
 * Each page registers its cleanup; `signOutWithFirestoreTeardown` runs it before auth is cleared.
 */
let detach: (() => void) | null = null;

export function registerCompanyPickerFirestoreDetach(fn: (() => void) | null): void {
  detach = fn;
}

export function detachCompanyPickerFirestoreListenersIfAny(): void {
  const run = detach;
  detach = null;
  try {
    run?.();
  } catch {
    /* ignore */
  }
}
