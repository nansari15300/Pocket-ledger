'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * It throws any received error to be caught by Next.js's global-error.tsx.
 */
export function FirebaseErrorListener() {
  // Use the specific error type for the state for type safety.
  const [error, setError] = useState<FirestorePermissionError | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // The callback now expects a strongly-typed error, matching the event payload.
    const handleError = (error: FirestorePermissionError) => {
      // Set error in state to trigger a re-render.
      setError(error);
    };

    // The typed emitter will enforce that the callback for 'permission-error'
    // matches the expected payload type (FirestorePermissionError).
    errorEmitter.on('permission-error', handleError);

    // Unsubscribe on unmount to prevent memory leaks.
    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as any;
      const code = String(reason?.code ?? '');
      const message = String(reason?.message ?? '');
      const stack = String(reason?.stack ?? '');
      const isPermissionError =
        code === 'permission-denied' ||
        code === 'PERMISSION_DENIED' ||
        message.toLowerCase().includes('missing or insufficient permissions');

      if (isPermissionError) {
        event.preventDefault();
        return;
      }

      // Auth: LAN/offline par token refresh fail — fatal overlay nahi; session persistence / listener recover karega.
      if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
        event.preventDefault();
        return;
      }

      return;
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [pathname]);

  // On re-render, if an error exists in state, throw it.
  if (error) {
    throw error;
  }

  // This component renders nothing.
  return null;
}
