# iOS App बनाउने विधि (Pocket Ledger)

iOS को लागि app बनाउन **Capacitor** र **Xcode** (Mac जरुरी) प्रयोग गर्नुहोस्।

---

## १) आवश्यकता

- **Mac** (macOS) – Xcode सिर्फ Mac मा चल्छ।
- **Xcode** (App Store बाट install गर्नुहोस्)।
- **Apple Developer account** (TestFlight वा App Store publish गर्न चाहिएमा)।

---

## २) चरण

### Step 1: Capacitor install गर्नु (अगाडि नगरेको भए)

Pocket Ledger root मा:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init
```

### Step 2: iOS platform थप्नु

```bash
npx cap add ios
```

### Step 3: Config (Web Dir वा Server URL)

`capacitor.config.ts` मा:

- **Deployed URL** प्रयोग गर्न: `server: { url: 'https://YOUR-APP.vercel.app' }`
- **Static export** प्रयोग गर्न: `webDir: 'out'` (र `npm run build` पछि `out/` बन्छ)

### Step 4: Sync र Xcode मा खोल्नु

```bash
npx cap sync ios
npx cap open ios
```

Xcode मा project खुल्छ। त्यहाँबाट:

- **Simulator** रोजेर Run गर्नुहोस् (Cmd + R)।
- **Real device** को लागि device जोड्नुहोस्, Team/Signing सेट गर्नुहोस्, र Run गर्नुहोस्।

### Step 5: Archive (Release build)

- Xcode मा **Product → Archive**।
- Archive पछि **Distribute App** बाट TestFlight वा App Store लाई upload गर्न सकिन्छ।

---

## ३) नोट

- **CocoaPods:** `npx cap sync ios` ले आवश्यक pods install गर्छ। पहिले पटक धेरै समय लाग्न सक्छ।
- **Permissions:** Camera, Storage जस्ता native features चाहिएमा `ios/App/App/Info.plist` मा description थप्नुहोस्।
- **Icon / Splash:** Xcode मा Assets मा icon र splash सेट गर्न सकिन्छ वा Capacitor icon/splash tool प्रयोग गर्न सकिन्छ।

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [BUILD-APK.md](./BUILD-APK.md) | [BUILD-WEB.md](./BUILD-WEB.md)
