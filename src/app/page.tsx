"use client";

import { LoginForm } from '@/components/auth/LoginForm';
import { Flame } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
        router.push('/company');
    }
  }, [user, loading, router]);

  if (loading || user) {
      return <LoadingSpinner />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
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
