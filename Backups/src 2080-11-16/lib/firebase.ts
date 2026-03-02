
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

export { app, auth, firestore, storage };
