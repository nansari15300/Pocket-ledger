
'use server';

/**
 * @fileOverview Securely manages payment gateway API keys using Firebase Firestore.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
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

export const getGatewayKeys = ai.defineFlow(
  {
    name: 'getGatewayKeys',
    outputSchema: GatewayKeysSchema,
  },
  async (): Promise<GatewayKeys> => {
    try {
        const docSnap = await getDoc(keysDocRef);
        if (docSnap.exists()) {
            return docSnap.data() as GatewayKeys;
        }
        return {};
    } catch (e) {
        console.error("Error fetching gateway keys:", e);
        return {};
    }
  }
);

export const updateGatewayKeys = ai.defineFlow(
  {
    name: 'updateGatewayKeys',
    inputSchema: GatewayKeysSchema,
  },
  async (keys: GatewayKeys): Promise<void> => {
    await setDoc(keysDocRef, keys, { merge: true });
  }
);
