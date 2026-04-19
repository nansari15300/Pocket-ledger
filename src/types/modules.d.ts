declare module 'html2pdf.js';
declare module 'khalti-checkout-web';
/** Dynamic import in LoginForm for native Google sign-in (Capacitor); package may not ship .d.ts */
declare module '@codetrix-studio/capacitor-google-auth' {
  export const GoogleAuth: {
    initialize: (opts: {
      clientId: string;
      scopes?: string[];
      grantOfflineAccess?: boolean;
    }) => Promise<void>;
    signIn: () => Promise<{ authentication?: { idToken?: string } }>;
  };
}
