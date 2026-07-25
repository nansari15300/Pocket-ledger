declare module "pdfmake/interfaces" {
  // pdfmake ships runtime only; loose types match printDirect usage (spread, qr, columns, etc.).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Content = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type TableCell = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type TDocumentDefinitions = any;
}

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
    signOut: () => Promise<void>;
  };
}
