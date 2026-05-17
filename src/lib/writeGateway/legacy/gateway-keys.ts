
/* No 'use server' - static export compatible */

/**
 * @fileOverview Securely manages payment gateway API keys using Firebase Firestore.
 * Plain async helpers (no Genkit) so admin UI and API routes can import without bundling Node-only AI SDK code in the browser.
 */

import { z } from 'zod';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

const GatewayKeysSchema = z.object({
  stripeSecretKey: z.string().optional(),
  khaltiPublicKey: z.string().optional(),
  esewaMerchantCode: z.string().optional(),
  esewaSecretKey: z.string().optional(),
});

export type GatewayKeys = z.infer<typeof GatewayKeysSchema>;

/** `app_settings/payment_gateways` — plan page par kaunsa gateway dikhe (keys alag configure hote hain). */
export type GatewayPaymentFlags = {
  stripePaymentEnabled: boolean;
  khaltiPaymentEnabled: boolean;
  esewaPaymentEnabled: boolean;
};

export const DEFAULT_GATEWAY_PAYMENT_FLAGS: GatewayPaymentFlags = {
  stripePaymentEnabled: true,
  khaltiPaymentEnabled: true,
  esewaPaymentEnabled: true,
};

export function parseGatewayPaymentFlags(
  raw: Record<string, unknown> | null | undefined
): GatewayPaymentFlags {
  if (!raw) return { ...DEFAULT_GATEWAY_PAYMENT_FLAGS };
  return {
    stripePaymentEnabled: raw.stripePaymentEnabled !== false,
    khaltiPaymentEnabled: raw.khaltiPaymentEnabled !== false,
    esewaPaymentEnabled: raw.esewaPaymentEnabled !== false,
  };
}

/** Billing UI + `/api/payments/gateway-status` — configured keys + admin toggle dono true hon. */
export function resolveBillingGatewayAvailability(
  keys: GatewayKeys,
  flags: GatewayPaymentFlags
): { stripe: boolean; khalti: boolean; esewa: boolean } {
  return {
    stripe: !!keys.stripeSecretKey?.trim() && flags.stripePaymentEnabled,
    khalti: !!keys.khaltiPublicKey?.trim() && flags.khaltiPaymentEnabled,
    esewa:
      !!(keys.esewaMerchantCode?.trim() && keys.esewaSecretKey?.trim()) && flags.esewaPaymentEnabled,
  };
}

export type BillingGatewayId = "stripe" | "khalti" | "esewa";

export function isBillingGatewayAvailable(
  gateway: BillingGatewayId,
  keys: GatewayKeys,
  flags: GatewayPaymentFlags
): boolean {
  return resolveBillingGatewayAvailability(keys, flags)[gateway];
}

/** Official eSewa Epay v2 UAT merchant id — public test credential (developer.esewa.com.np Test credentials). */
export const ESEWA_UAT_MERCHANT_CODE = 'EPAYTEST';

/**
 * Official eSewa Epay v2 UAT HMAC secret — public test-only value from eSewa docs (not a live merchant secret).
 * Use only with EPAYTEST + uat.esewa.com.np; test wallet IDs 9806800001–5 / Nepal@123 per same page.
 */
export const ESEWA_UAT_SECRET_KEY = '8gBm/:&EnhH.1/q';

const keysDocRef = doc(firestore, 'app_settings', 'payment_gateways');

/** eSewa public UAT defaults — only auto-filled in development. */
function isDevPaymentFallbackEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

function pickStr(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/**
 * Merge stored gateway doc with server env (Stripe/Khalti/eSewa; eSewa UAT only in dev when still empty).
 * Khalti: Firestore → KHALTI_TEST_PUBLIC_KEY → NEXT_PUBLIC_KHALTI_PUBLIC_KEY / KHALTI_PUBLIC_KEY (local + cloud naming mismatch avoid).
 * eSewa: Firestore → ESEWA_MERCHANT_CODE / ESEWA_SECRET_KEY → dev UAT defaults.
 * Payment API route should pass `stored` from Firebase Admin read — client `getGatewayKeys()` cannot run unauthenticated on the server.
 */
export function mergeGatewayKeysWithEnv(stored: GatewayKeys): GatewayKeys {
  const stripe =
    pickStr(stored.stripeSecretKey) ??
    pickStr(process.env.STRIPE_TEST_SECRET_KEY) ??
    pickStr(process.env.STRIPE_SECRET_KEY);
  const khalti =
    pickStr(stored.khaltiPublicKey) ??
    pickStr(process.env.KHALTI_TEST_PUBLIC_KEY) ??
    pickStr(process.env.NEXT_PUBLIC_KHALTI_PUBLIC_KEY) ??
    pickStr(process.env.KHALTI_PUBLIC_KEY);
  const esewaCodeStored = pickStr(stored.esewaMerchantCode);
  const esewaSecretStored = pickStr(stored.esewaSecretKey);
  const esewaCode =
    esewaCodeStored ??
    pickStr(process.env.ESEWA_MERCHANT_CODE) ??
    (isDevPaymentFallbackEnabled() ? ESEWA_UAT_MERCHANT_CODE : undefined);
  const esewaSecret =
    esewaSecretStored ??
    pickStr(process.env.ESEWA_SECRET_KEY) ??
    (isDevPaymentFallbackEnabled() ? ESEWA_UAT_SECRET_KEY : undefined);

  return {
    stripeSecretKey: stripe,
    khaltiPublicKey: khalti,
    esewaMerchantCode: esewaCode,
    esewaSecretKey: esewaSecret,
  };
}

/** Client-side: authenticated Firestore read + env merge (do not use from API routes without auth). */
export async function resolveGatewayKeysForPayments(): Promise<GatewayKeys> {
  const stored = await getGatewayKeys();
  return mergeGatewayKeysWithEnv(stored);
}

export async function getGatewayKeys(): Promise<GatewayKeys> {
  try {
    const docSnap = await getDoc(keysDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as GatewayKeys;
    }
    return {};
  } catch (e) {
    console.error('Error fetching gateway keys:', e);
    return {};
  }
}

/** Admin card switch — sirf plan page payment option; keys/doc merge. */
export async function updateGatewayPaymentFlags(
  patch: Partial<GatewayPaymentFlags>
): Promise<void> {
  await setDoc(keysDocRef, patch, { merge: true });
}

export async function updateGatewayKeys(keys: GatewayKeys): Promise<void> {
  // Firestore rejects `undefined` (and non-primitive oddities); normalise every field to string.
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  await setDoc(
    keysDocRef,
    {
      stripeSecretKey: str(keys.stripeSecretKey),
      khaltiPublicKey: str(keys.khaltiPublicKey),
      esewaMerchantCode: str(keys.esewaMerchantCode),
      esewaSecretKey: str(keys.esewaSecretKey),
    },
    { merge: true }
  );
}
