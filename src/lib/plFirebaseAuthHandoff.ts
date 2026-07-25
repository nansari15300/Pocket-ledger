"use client";

import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import {
  getFirebaseIdTokenForApi,
  hasRealFirebaseAuthSession,
  isLocalSyntheticAuthUid,
} from "@/lib/firebaseAuthForApi";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isPlSharingServerPortOrigin } from "@/lib/plRemoteServerClient";

const HANDOFF_QUERY = "pl_fc";
const HANDOFF_COOKIE = "pl_fc_handoff";

function resolveFirebaseHandoffApiUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    if (!isStaticAppBuild() && !isPlSharingServerPortOrigin()) {
      return `${window.location.origin}/api/auth/pl-firebase-handoff`;
    }
  } catch {
    /* ignore */
  }
  return getBillingApiUrl("/api/auth/pl-firebase-handoff");
}

function readHandoffCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const prefix = `${HANDOFF_COOKIE}=`;
    for (const part of document.cookie.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(prefix)) continue;
      const raw = trimmed.slice(prefix.length);
      return decodeURIComponent(raw).trim() || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function clearHandoffCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${HANDOFF_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function stashHandoffCookie(customToken: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${HANDOFF_COOKIE}=${encodeURIComponent(customToken)}; path=/; max-age=90; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/** Source origin (3000 / EXE shell): Firebase custom token for cross-port login. */
export async function fetchPlFirebaseHandoffCustomToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!hasRealFirebaseAuthSession()) return null;
  const uid = auth.currentUser?.uid;
  if (!uid || isLocalSyntheticAuthUid(uid)) return null;
  try {
    const { token } = await getFirebaseIdTokenForApi();
    const res = await fetch(resolveFirebaseHandoffApiUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { customToken?: unknown };
    const customToken = String(data.customToken || "").trim();
    return customToken || null;
  } catch {
    return null;
  }
}

export function appendPlFirebaseHandoffToConnectUrl(connectUrl: string, customToken: string): string {
  const tok = customToken.trim();
  if (!tok) return connectUrl;
  stashHandoffCookie(tok);
  try {
    const u = new URL(connectUrl);
    u.searchParams.set(HANDOFF_QUERY, tok);
    return u.toString();
  } catch {
    const sep = connectUrl.includes("?") ? "&" : "?";
    return `${connectUrl}${sep}${HANDOFF_QUERY}=${encodeURIComponent(tok)}`;
  }
}

/** Destination (3001): read handoff once, strip URL + cookie, sign in. */
export function readAndStripPlFirebaseHandoffFromLanding(): string | null {
  if (typeof window === "undefined") return null;
  let token: string | null = null;
  try {
    const u = new URL(window.location.href);
    const fromQuery = (u.searchParams.get(HANDOFF_QUERY) || "").trim();
    if (fromQuery) {
      token = fromQuery;
      u.searchParams.delete(HANDOFF_QUERY);
      const clean = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState(window.history.state, "", clean);
    }
  } catch {
    /* ignore */
  }
  if (!token) token = readHandoffCookie();
  clearHandoffCookie();
  return token;
}

export async function applyPlFirebaseHandoffCustomToken(customToken: string): Promise<boolean> {
  const tok = customToken.trim();
  if (!tok) return false;
  try {
    await signInWithCustomToken(auth, tok);
    return true;
  } catch {
    return false;
  }
}
