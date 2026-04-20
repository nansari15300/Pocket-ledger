"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  GoogleAuthProvider,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useLayoutEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import {
  REMEMBER_EMAIL_ENABLED_KEY,
  REMEMBER_EMAIL_KEY,
  readRememberEmailEnabled,
  readRememberedEmail,
} from "@/lib/loginRememberEmail";

// One-time handling of redirect result (survives Strict Mode double-mount so we don't consume result twice)
let redirectResultHandledThisLoad = false;

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

/** Never add a key for password — only email may be persisted when "Remember email" is on. */

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => readRememberEmailEnabled());
  /** Blocks browser autofill into empty fields when "Remember email" is off (readonly until focus). */
  const [emailAutofillGuard, setEmailAutofillGuard] = useState(() => !readRememberEmailEnabled());
  const [passwordAutofillGuard, setPasswordAutofillGuard] = useState(() => !readRememberEmailEnabled());
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Handle return from Google sign-in redirect — run once per load so result isn't consumed twice (e.g. Strict Mode)
  useEffect(() => {
    if (redirectResultHandledThisLoad) return;
    redirectResultHandledThisLoad = true;
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          router.replace("/company");
        }
      })
      .catch((error: any) => {
        redirectResultHandledThisLoad = false; // allow retry on next mount
        let description = "Could not complete Google sign-in. Please try again.";
        if (error.code === "auth/operation-not-allowed") {
          description = "Google Sign-In is not enabled for this project. Enable it in Firebase Console > Authentication > Sign-in method.";
        } else if (error.code === "auth/popup-blocked") {
          description = "Sign-in was blocked. Use the redirect flow (you were redirected back here).";
        }
        toast({
          variant: "destructive",
          title: "Google Sign-In Failed",
          description,
        });
      });
  }, [router, toast]);

  useLayoutEffect(() => {
    const enabled = readRememberEmailEnabled();
    setRememberEmail(enabled);
    if (!enabled) {
      form.reset({ email: "", password: "" });
      setEmailAutofillGuard(true);
      setPasswordAutofillGuard(true);
    } else {
      const saved = readRememberedEmail();
      form.reset({ email: saved, password: "" });
      setEmailAutofillGuard(false);
      setPasswordAutofillGuard(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- login entry: sync storage once before paint
  }, []);

  // Browsers often autofill after layout; clear again if user did not opt in to remembered email.
  useEffect(() => {
    if (readRememberEmailEnabled()) return;
    const timeouts = [50, 200, 600].map((ms) =>
      window.setTimeout(() => {
        if (!readRememberEmailEnabled()) {
          form.setValue("email", "");
          form.setValue("password", "");
        }
      }, ms)
    );
    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      await (isSignUp
        ? createUserWithEmailAndPassword(auth, values.email, values.password)
        : signInWithEmailAndPassword(auth, values.email, values.password));

      // After successful auth only: persist email if opted in — password is never written to storage.
      try {
        if (rememberEmail) {
          localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, "1");
          localStorage.setItem(REMEMBER_EMAIL_KEY, values.email.trim());
        } else {
          localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, "0");
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
          setEmailAutofillGuard(true);
          setPasswordAutofillGuard(true);
        }
      } catch (_) {}

      form.setValue("password", "");
      router.push("/company");

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: isSignUp ? "Sign Up Failed" : "Authentication Failed",
        description:
            error.code === "auth/email-already-in-use"
            ? "This email is already registered."
            : error.code === "auth/invalid-credential"
            ? "Invalid email or password."
            : "An error occurred. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    try {
      // Native APK/WebView: Firebase web popup/redirect often gets stuck; use Capacitor native Google auth instead.
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
        if (!clientId) {
          throw new Error("NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing");
        }
        await GoogleAuth.initialize({ clientId, scopes: ["profile", "email"], grantOfflineAccess: false });
        const nativeUser = await GoogleAuth.signIn();
        const idToken = nativeUser.authentication?.idToken;
        if (!idToken) {
          throw new Error("Google idToken missing from native sign-in");
        }
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        if (result?.user) {
          router.replace("/company");
          return;
        }
      }

      // Prefer popup so user stays on same page; fallback to redirect if popup is blocked
      try {
        const result = await signInWithPopup(auth, provider);
        if (result?.user) {
          router.replace("/company");
          return;
        }
      } catch (popupError: any) {
        if (popupError.code === "auth/popup-blocked" || popupError.code === "auth/cancelled-popup-request") {
          // Popup blocked or user closed it — use redirect instead
          await signInWithRedirect(auth, provider);
          return; // Page will navigate away; getRedirectResult handles return
        }
        throw popupError;
      }
    } catch (error: any) {
      setIsGoogleLoading(false);
      let description = "Could not start Google sign-in. Please try again.";
      if (error.code === "auth/operation-not-allowed") {
        description = "Google Sign-In is not enabled for this project. Enable it in Firebase Console > Authentication > Sign-in method.";
      } else if (error.code === "auth/popup-blocked") {
        description = "Popup was blocked. Please allow popups for this site or try again.";
      } else if (error.message?.includes("NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID")) {
        description = "Google client ID missing. Set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.local for APK login.";
      }
      toast({
        variant: "destructive",
        title: "Google Sign-In Failed",
        description,
      });
    }
  }

  const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691c-1.218 2.296-1.921 4.88-1.921 7.639s.703 5.343 1.921 7.639l-5.657 5.657C.803 32.748 0 28.59 0 24s.803-8.748 2.57-11.961l5.736 2.652z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-4.635 0-8.527-2.64-10.37-6.309l-5.657 5.657C6.155 38.303 14.136 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.447-2.274 4.481-4.244 5.962l6.19 5.238C42.015 35.19 44 30.026 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <Form {...form}>
        <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="name@example.com"
                    {...field}
                    readOnly={emailAutofillGuard}
                    autoComplete={rememberEmail ? "username" : "off"}
                    onFocus={(e) => {
                      setEmailAutofillGuard(false);
                      field.onFocus?.(e);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    readOnly={passwordAutofillGuard}
                    autoComplete={
                      isSignUp ? "new-password" : rememberEmail ? "current-password" : "new-password"
                    }
                    onFocus={(e) => {
                      setPasswordAutofillGuard(false);
                      field.onFocus?.(e);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* Local remember toggle for email convenience in desktop/web login forms. */}
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(event) => {
                const next = event.target.checked;
                setRememberEmail(next);
                try {
                  localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, next ? "1" : "0");
                  if (next) {
                    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
                    form.setValue("email", saved ?? "");
                    setEmailAutofillGuard(false);
                    setPasswordAutofillGuard(false);
                  } else {
                    form.setValue("email", "");
                    form.setValue("password", "");
                    localStorage.removeItem(REMEMBER_EMAIL_KEY);
                    setEmailAutofillGuard(true);
                    setPasswordAutofillGuard(true);
                  }
                } catch (_) {}
              }}
              className="h-4 w-4 rounded border-input"
            />
            Remember email
          </label>
          <p className="text-xs text-muted-foreground">
            Only the email can be saved on this device. Your password is never stored.
          </p>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSignUp ? "Sign Up with Email" : "Sign In with Email"}
          </Button>
        </form>
      </Form>
       <div className="mt-4 text-center text-sm">
          <p className="text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{' '}
            <Button variant="link" className="p-0 h-auto" onClick={() => {
                setIsSignUp(!isSignUp);
                form.reset({ email: "", password: "" });
                try {
                  const enabled = readRememberEmailEnabled();
                  setRememberEmail(enabled);
                  if (enabled) {
                    const saved = readRememberedEmail();
                    if (saved) form.setValue("email", saved);
                    setEmailAutofillGuard(false);
                    setPasswordAutofillGuard(false);
                  } else {
                    setEmailAutofillGuard(true);
                    setPasswordAutofillGuard(true);
                  }
                } catch (_) {}
            }}>
                {isSignUp ? "Sign In" : "Sign Up"}
            </Button>
          </p>
        </div>
      <div className="relative my-6">
        <Separator />
        <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-sm text-muted-foreground">
          OR
        </span>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading}
      >
        {/* Guest login removed: local-first now runs under authenticated user session only. */}
        {isGoogleLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Sign in with Google
      </Button>
    </div>
  );
}