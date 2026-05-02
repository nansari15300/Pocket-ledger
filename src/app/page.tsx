"use client";

import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { isLocalOnlyMode } from '@/lib/localMode';
import { resolvePostAuthCompanyRoute } from '@/lib/postAuthCompanyRoute';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  /** `loading`/`user` dobara fire hone par sirf ek replace — kai baar SPA "refresh" jaisa dikhta tha */
  const postAuthNavigateOnceRef = useRef(false);

  useEffect(() => {
    if (loading || !user) {
      postAuthNavigateOnceRef.current = false;
      return;
    }
    if (postAuthNavigateOnceRef.current) return;
    postAuthNavigateOnceRef.current = true;
    // Static/local: valid remember-window ho to `/company` skip karke seedha `/dashboard`.
    const next = isLocalOnlyMode() ? resolvePostAuthCompanyRoute(user.uid) : '/company';
    router.replace(next);
  }, [user, loading, router]);

  if (loading || user) {
      return <LoadingSpinner />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          {/* Login brand: sidebar/Electron jaisa sirf app icon (`object-contain`) — alag text logo web vs static confuse na kare. */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-border bg-muted/40 shadow-sm">
            <img
              src="/app-icon.png"
              alt="Pocket Ledger"
              className="h-full w-full object-contain p-1"
              width={80}
              height={80}
              loading="eager"
            />
          </div>
          <h1 className="sr-only">Pocket Ledger</h1>
          <p className="text-muted-foreground">
            Sign in to access your account.
          </p>
        </div>
        <LoginForm />
        <div className="text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Pocket Ledger. All rights reserved.</p>
        </div>
      </div>
    </main>
  );
}
