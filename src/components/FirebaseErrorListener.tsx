'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FIRESTORE_NO_PERMISSION_DESCRIPTION_CLOUD,
  FIRESTORE_NO_PERMISSION_DESCRIPTION_LOCAL,
  FIRESTORE_NO_PERMISSION_TITLE,
  isFirestorePermissionLikeError,
  shouldSuppressFirestorePermissionPopup,
} from '@/lib/firestorePermissionUi';
import { isLocalOnlyMode } from '@/lib/localMode';
import { isFirestoreWatchTeardownAssertionMessage } from '@/lib/firestoreWatchAssertionGuard';

/**
 * Global Firestore permission errors — Next.js runtime overlay nahi, user-friendly popup.
 */
export function FirebaseErrorListener() {
  const [open, setOpen] = useState(false);
  const lastShownAtRef = useRef(0);
  const pathname = usePathname();

  const showPermissionPopup = useCallback(() => {
    // Local-only: Firestore deny normal — SQLite path use hota hai; popup mat dikhao.
    if (shouldSuppressFirestorePermissionPopup()) return;
    const now = Date.now();
    // Ek hi action par multiple listeners se spam na ho.
    if (now - lastShownAtRef.current < 2000) return;
    lastShownAtRef.current = now;
    setOpen(true);
  }, []);

  useEffect(() => {
    const handleError = (_error: FirestorePermissionError) => {
      showPermissionPopup();
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [showPermissionPopup]);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const code = String((reason as { code?: string })?.code ?? '');
      const message = String((reason as { message?: string })?.message ?? reason ?? '');

      // firebase.ts capture handler already mutes ca9 — belt-and-suspenders for late listeners.
      if (isFirestoreWatchTeardownAssertionMessage(message)) {
        event.preventDefault();
        return;
      }

      if (isFirestorePermissionLikeError(reason)) {
        event.preventDefault();
        showPermissionPopup();
        return;
      }

      // Auth: LAN/offline par token refresh fail — fatal overlay nahi.
      if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [pathname, showPermissionPopup]);

  // Sync throw (FirebaseError) — dev overlay ke bajay popup.
  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const candidate = event.error ?? event.message;
      const message =
        typeof candidate === 'string'
          ? candidate
          : `${(candidate as Error)?.message ?? ''}\n${(candidate as Error)?.stack ?? ''}\n${event.message ?? ''}`;
      if (isFirestoreWatchTeardownAssertionMessage(message)) {
        event.preventDefault();
        return;
      }
      if (!isFirestorePermissionLikeError(candidate)) return;
      event.preventDefault();
      showPermissionPopup();
    };

    window.addEventListener('error', onWindowError);
    return () => {
      window.removeEventListener('error', onWindowError);
    };
  }, [showPermissionPopup]);

  const description = isLocalOnlyMode()
    ? FIRESTORE_NO_PERMISSION_DESCRIPTION_LOCAL
    : FIRESTORE_NO_PERMISSION_DESCRIPTION_CLOUD;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{FIRESTORE_NO_PERMISSION_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
