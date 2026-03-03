import type { CapacitorConfig } from "@capacitor/cli";

/** Deployed app URL – APK मा यही load हुन्छ। Replace with your Vercel/hosting URL. */
const APP_URL = "https://YOUR-DEPLOYED-URL.vercel.app";

const config: CapacitorConfig = {
  appId: "com.pocketledger.app",
  appName: "Pocket Ledger",
  webDir: "out",
  server: {
    url: APP_URL,
    cleartext: true,
  },
};

export default config;
