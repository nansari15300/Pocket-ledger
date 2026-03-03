# App Version कसरी Decide गर्ने र कहाँ सेट गर्ने

Build गर्दा app को **version** कहाँबाट लिन्छ र कसरी बदल्ने।

---

## १) मुख्य ठाउँ: `package.json`

**Pocket Ledger** को version अहिले यहीँ छ:

**फाइल:** प्रोजेक्ट को root मा `package.json`

```json
{
  "name": "pocket-ledger",
  "version": "0.1.0",
  ...
}
```

- **`version`** नै app को official version हो।  
- Build गर्दा (Next.js, Vercel, आदि) यही value use हुन्छ।  
- EXE/Electron बनाउँदा पनि **electron-builder** ले यही `package.json` को `version` लिन्छ (Electron project को `package.json` मा राख्नुहोस्)।

**Version बदल्न:** `package.json` मा जानुहोस् र `"version": "0.1.0"` लाई जस्तो चाहिन्छ त्यस्तो गर्नुहोस् (e.g. `"0.2.0"`, `"1.0.0"`)।

---

## २) Version कसरी Decide गर्ने (Semantic Versioning)

सामान्य ढाँचा: **`MAJOR.MINOR.PATCH`** (e.g. `1.2.3`)

| भाग | कब बढाउने | उदाहरण |
|-----|-------------|--------|
| **MAJOR** | ठूलो change, पुरानो सँग अक्सर नमिल्ने | 1.0.0 → 2.0.0 |
| **MINOR** | नयाँ feature, पछि पनि मिल्ने | 0.1.0 → 0.2.0 |
| **PATCH** | सानो fix, bug fix | 0.1.0 → 0.1.1 |

- **0.x.x** = अझै stable release भएको छैन।  
- **1.0.0** = पहिलो production-ready release।

त्यसैले build अघि सोच्नुहोस्: यो release मा के भयो?  
- सानो fix मात्र → PATCH बढाउनु (0.1.0 → 0.1.1)।  
- नयाँ feature → MINOR बढाउनु (0.1.0 → 0.2.0)।  
- Breaking change → MAJOR बढाउनु (0.1.0 → 1.0.0)।

---

## ३) प्रत्येक Build मा Version कहाँ हुन्छ

| Build | Version कहाँ सेट गर्ने |
|-------|--------------------------|
| **Web / Next.js** | Root को `package.json` → `"version"` |
| **Windows .exe (Electron)** | Electron project को `package.json` → `"version"` (electron-builder यही लिन्छ) |
| **Android APK (Capacitor)** | Capacitor: `capacitor.config.ts` मा version नदिएको भए **app** को `package.json` वा Android को `android/app/build.gradle` मा `versionName` / `versionCode` |
| **iOS (Capacitor)** | Xcode मा project को **General → Version / Build** वा `ios/App/App/Info.plist` मा `CFBundleShortVersionString` |
| **Linux (Electron)** | Electron को `package.json` → `"version"` (EXE जस्तै) |

**सिफारिश:** एउटा **single source of truth** राख्नुहोस्।  
- Web + Electron/Linux को लागि: **`package.json`** को `version` बदल्नुहोस्।  
- Electron desktop project बनाउँदा त्यही version नयाँ project को `package.json` मा राख्नुहोस् (वा script ले copy गराउन सकिन्छ)।  
- Capacitor को लागि: `capacitor.config` मा `version` दिन सकिन्छ (कुनै tool ले `package.json` बाट read गरेर सेट गर्न सक्छ)।

---

## ४) छोट्करी

1. **Version कहाँ खुल्छ / सेट गर्ने:**  
   - मुख्य ठाउँ = **root को `package.json`** मा `"version": "0.1.0"`।  
   - EXE/Linux = Electron को **`package.json`**।  
   - APK/iOS = Capacitor/Android/iOS को config वा `package.json`।

2. **कसरी decide गर्ने:**  
   - Semantic versioning: **MAJOR.MINOR.PATCH**।  
   - सानो fix → PATCH, नयाँ feature → MINOR, breaking → MAJOR।

3. **Build अघि:**  
   - जो release दिन लाग्नुभयो, त्यो version `package.json` (वा सम्बन्धित config) मा राख्नुहोस् र त्यसपछि build गर्नुहोस्।

---

**सम्बन्धित:** [BUILD-EXE.md](./BUILD-EXE.md) | [BUILD-APK.md](./BUILD-APK.md) | [BUILD-IOS.md](./BUILD-IOS.md) | [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md)
