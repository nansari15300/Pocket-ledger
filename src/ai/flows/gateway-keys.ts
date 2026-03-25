
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

const keysDocRef = doc(firestore, 'app_settings', 'payment_gateways');

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

export async function updateGatewayKeys(keys: GatewayKeys): Promise<void> {
  await setDoc(keysDocRef, keys, { merge: true });
}
