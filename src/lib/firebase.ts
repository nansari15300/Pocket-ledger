
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { disableNetwork, enableNetwork, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { setLogLevel } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyAtHvZ3PY50rwF5oqHjtRMjbec6NzMl6dM",
  authDomain: "studio-5452513410-a3f5b.firebaseapp.com",
  projectId: "studio-5452513410-a3f5b",
  storageBucket: "studio-5452513410-a3f5b.firebasestorage.app",
  messagingSenderId: "469450068553",
  appId: "1:469450068553:web:168952ea08dc78e2396598"
};

// Initialize Firebase
const apps = getApps();
const app = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Suppress Firebase console errors for offline/unavailable; track PERMISSION_DENIED (skip when logged out)
if (typeof window !== 'undefined') {
  const originalError = console.error;
  const isLocalFirstEnabled = () => {
    const mode = window.localStorage.getItem('dataSourceMode');
    // Local-first startup: missing key is treated as local.
    return !mode || mode === 'local';
  };
  console.error = (...args: any[]) => {
    const errorMessage = args.join(' ');
    // Don't log Firebase offline/unavailable errors
    if (
      errorMessage.includes('Could not reach Cloud Firestore backend') ||
      errorMessage.includes('code=unavailable') ||
      errorMessage.includes('healthy Internet connection') ||
      errorMessage.includes('operate in offline mode') ||
      (errorMessage.includes('Firestore') && errorMessage.includes('Connection failed'))
    ) {
      return;
    }
    // Firebase Auth: Google endpoints tak reach nahi (Wi‑Fi flap, firewall) — dev console spam kam.
    if (errorMessage.includes('auth/network-request-failed')) {
      return;
    }
    // PERMISSION_DENIED after logout is expected (listeners still firing with null auth) — don't log
    if (
      (errorMessage.includes('permission-denied') ||
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('Missing or insufficient permissions')) &&
      auth.currentUser == null
    ) {
      return;
    }
    // Suppress PERMISSION_DENIED during company create flow (company still creates; init may fail on rules)
    if (
      (errorMessage.includes('permission-denied') ||
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('Missing or insufficient permissions')) &&
      (errorMessage.includes('Initialization error') ||
        args.some((a) => typeof a === 'string' && (a.includes('CreateCompanyDialog') || a.includes('initializeCompanyData'))) ||
        args.some((a) => a && typeof a === 'object' && typeof (a as Error).stack === 'string' && ((a as Error).stack?.includes('CreateCompanyDialog') || (a as Error).stack?.includes('initializeCompanyData'))))
    ) {
      return;
    }
    // Track other PERMISSION_DENIED with extra context when user is logged in (real auth issue)
    if (
      errorMessage.includes('permission-denied') ||
      errorMessage.includes('PERMISSION_DENIED') ||
      errorMessage.includes('Missing or insufficient permissions')
    ) {
      if (isLocalFirstEnabled()) {
        return;
      }
      const err = args.find((a) => a && typeof a === 'object' && 'code' in a) as { code?: string; message?: string; path?: string } | undefined;
      originalError.apply(console, [
        '[Firestore PERMISSION_DENIED]',
        err?.message ?? errorMessage,
        err?.path != null ? { path: err.path } : {},
        'Stack/args:',
        ...args,
      ]);
      return;
    }
    originalError.apply(console, args);
  };
}
const firestore = getFirestore(app);
const storage = getStorage(app);

/**
 * Firestore 12.8: parallel / stacked `enableNetwork` + `disableNetwork` → PersistentWriteStream INTERNAL ASSERTION (da08).
 * Sab toggle ek hi serial chain pe — storage events, admin shell, outbox flush overlap na karein.
 */
let firestoreNetworkOpChain: Promise<unknown> = Promise.resolve();

export function queueFirestoreNetworkOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = firestoreNetworkOpChain.then(fn, fn);
  firestoreNetworkOpChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Sirf jab `disableNetwork(firestore)` successfully apply ho chuka ho — flush tab hi `enableNetwork` chalayega.
 * Har flush par `enableNetwork` + active `onSnapshot` race = Firestore 12.x INTERNAL ASSERTION (ca9 / ve:-1) offline→online.
 */
export let firestoreNetworkDisabledByApi = false;

/** Admin panel / tests: `disableNetwork` yahan ke alawa bhi ho sakta hai — outbox flush ko sahi `enableNetwork` chahiye. */
export function markFirestoreNetworkDisabledByApi(disabled: boolean): void {
  firestoreNetworkDisabledByApi = disabled;
}

if (typeof window !== 'undefined') {
  // Pehle yahan local-first = disableNetwork() tha — outbox flush / getDocFromServer tab server tak kabhi nahi pahunchte.
  // Optional: NEXT_PUBLIC_DISABLE_FIRESTORE_NETWORK=1 se purani "offline-only" behaviour.
  const applyFirestoreNetworkMode = async () => {
    await queueFirestoreNetworkOp(async () => {
      try {
        const mode = window.localStorage.getItem('dataSourceMode');
        const localFirst =
          !mode || mode === 'local' ||
          process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === '1' ||
          process.env.NEXT_PUBLIC_STATIC_BUILD === '1';
        const forceOff =
          process.env.NEXT_PUBLIC_DISABLE_FIRESTORE_NETWORK === '1' && localFirst;
        if (forceOff) {
          await disableNetwork(firestore);
          firestoreNetworkDisabledByApi = true;
        } else {
          // Default Firestore session is already online — har load/HMR par `enableNetwork` =
          // PersistentWriteStream pe redundant handshake → SDK 12.8 INTERNAL ASSERTION da08.
          if (firestoreNetworkDisabledByApi) {
            await enableNetwork(firestore);
          }
          firestoreNetworkDisabledByApi = false;
        }
      } catch {
        // non-blocking
      }
    });
  };

  void applyFirestoreNetworkMode();
  window.addEventListener('storage', (event) => {
    if (event.key && event.key !== 'dataSourceMode') return;
    void applyFirestoreNetworkMode();
  });
}

export { app, auth, firestore, storage };
