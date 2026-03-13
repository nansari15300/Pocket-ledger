"use client";

import { LoginForm } from '@/components/auth/LoginForm';
import { Flame, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';


const LOGOUT_REASON_KEY = "logout_reason";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showInactivityMessage, setShowInactivityMessage] = useState(false);

  useEffect(() => {
    if (!loading && user) {
        router.push('/company');
    }
  }, [user, loading, router]);

  useEffect(() => {
    try {
      const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
      if (reason === "inactivity") setShowInactivityMessage(true);
    } catch (_) {}
  }, []);

  const dismissInactivityMessage = () => {
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY); } catch (_) {}
    setShowInactivityMessage(false);
  };
  
  if (loading || user) {
      return <LoadingSpinner />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {showInactivityMessage && (
          <div className="w-full rounded-lg border border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-4 py-3 flex items-start gap-3">
            <p className="flex-1 text-sm">
              You were logged out due to inactivity. Please sign in again.
            </p>
            <button
              type="button"
              onClick={dismissInactivityMessage}
              className="shrink-0 rounded p-1 hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Flame className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-foreground">
            Pocket Ledger
          </h1>
          <p className="mt-2 text-muted-foreground">
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
