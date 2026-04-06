# Android APK बनाउने विधि (Pocket Ledger)

Android को लागि `.apk` बनाउन **Capacitor** र **Android Studio** (वा command line) प्रयोग गर्नुहोस्।

**नियम:** कुनै पनि build मा Super Admin setting ननिकाल्ने। विवरण: [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md)

**Standard requirements (online/offline, device मा data save, आदि):** [BUILD-REQUIREMENTS.md](./BUILD-REQUIREMENTS.md)

---

## १) सामान्य अवधारणा

- **Capacitor** ले web app लाई native WebView मा राखेर APK बनाउँछ।
- **दुई ढंग:**
  - **सजिलो:** Deployed URL लाई WebView मा खोल्ने (internet चाहिन्छ)।
  - **ठूलो:** Next.js लाई static export गरेर `webDir` मा राख्ने (offline-friendly)।

---

## २) चरण (सजिलो – Deployed URL)

### Step 1: Capacitor install गर्नु

Pocket Ledger को root मा:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
```

`init` मा app name र bundle id दिनुहोस् (e.g. `com.pocketledger.app`)。

### Step 2: `capacitor.config.ts` (वा `.json`) मा server URL र version

App **version** यहाँ वा `package.json` बाट लिन सकिन्छ। विवरण: [BUILD-VERSION.md](./BUILD-VERSION.md)

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pocketledger.app',
  appName: 'Pocket Ledger',
  webDir: 'out',
  server: {
    url: 'https://YOUR-APP.vercel.app',
    cleartext: true
  }
};
export default config;
```

(Deployed URL नचाहिएमा `server` हटाएर `webDir: 'out'` मा static export राख्नुहोस्।)

### Step 3: Android platform थप्नु

```bash
npx cap add android
```

### Launcher icon (Pocket Ledger logo)

1. Source image **`assets/icon-only.png`** ma rakhnus (≥1024×1024 PNG).
2. Generate garhnus (`cap:icons` le adaptive foreground pani sync garxa):
   ```bash
   npm run cap:icons
   ```
3. `npx cap sync android` → Android Studio bata APK.

### Step 4: Sync र Build

```bash
npx cap sync android
```

Android Studio खोल्नु (वा CLI बाट build):

```bash
npx cap open android
```

Android Studio मा: **Build → Build Bundle(s) / APK(s) → Build APK(s)**।

---

## ३) Static export बाट APK (offline-friendly)

1. **Next.js** मा `next.config.js` मा `output: 'export'` राख्नुहोस् (जहाँ सम्भव)।
2. `npm run build` गर्नु → `out/` बन्छ।
3. `capacitor.config` मा `webDir: 'out'` राख्नुहोस्, `server` हटाउनुहोस्।
4. `npx cap sync android` र पछि Android Studio बाट APK बनाउनुहोस्।

**नोट:** App मा Firebase + API routes छन् भने पहिले सजिलो तरिका (deployed URL) प्रयोग गर्नुहोस्।

### Static build: refresh / “Page not found”

- `build:static` मा **`trailingSlash: true`** हुन्छ — URL अक्सर `/party/` जस्तो हुन्छ; refresh मा `out/party/index.html` खुल्छ।
- `out/404.html` पनि `index.html` बाट copy हुन्छ (कहीँ host unknown path मा SPA bootstrap को लागि)।
- Local test: `npx http-server out -p 3000 -c-1` — गहिरो route खोल्दा **`/party/`** (अन्त्यमा slash) प्रयोग गर्नुहोस्।

### Android back button

- `@capacitor/app` dependency छ; **`npx cap sync android`** पछि hardware back पहिले in-app `history` pop गर्छ, एउटा मात्र entry भए `exitApp`।
- Plugin थपे/हटाएपछि सधैं **`npx cap sync android`** चलाउनुहोस्।

### Print / PDF (static APK)

- **`NEXT_PUBLIC_STATIC_BUILD=1`** मा PDF **`window.open` बाहिर खोलिँदैन** — **`inAppPdfPreview`** ले **Print / Share / Close** दिन्छ।
- **Android WebView** मा PDF **iframe** प्रायः खाली — preview को लागि **PDF.js → canvas** (scroll)। Offline को लागि **`public/pdf.worker.min.mjs`** राख्नुहोस् (`node_modules/pdfjs-dist/build/pdf.worker.min.mjs` बाट copy; `pdfjs-dist` अपडेट गर्दा फेरि copy)।
- Share को लागि **`@capacitor/filesystem`** + **`@capacitor/share`** चाहिन्छ; plugin थपेपछि **`npx cap sync android`** अनिवार्य।

---

## ४) Release APK / AAB

- **Signed APK/AAB** को लागि Android Studio मा signing config सेट गर्नुहोस्।
- Play Store को लागि **Android App Bundle (.aab)** बनाउनुहोस्: Build → Generate Signed Bundle / APK → Android App Bundle।

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [BUILD-EXE.md](./BUILD-EXE.md) | [BUILD-IOS.md](./BUILD-IOS.md)
