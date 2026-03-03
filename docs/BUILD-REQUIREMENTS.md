# EXE र Android (APK) Build – Standard Requirements

EXE र Android app build गर्दा **कस्ता चीजहरू चाहिन्छ** (online/offline, device मा data save, आदि) यो doc मा छ।

---

## १) EXE (Windows) Build को लागि

| # | Requirement | विवरण |
|---|--------------|--------|
| 1 | **Online / Offline** | App ले **online** (internet जोडेर Firebase/server use) वा **offline** (local data) दुवै support गर्न सक्छ। Deployed URL वाला EXE मा पहिले **internet** चाहिन्छ; पछि Firebase cache बाट केही offline काम हुन सक्छ। पूर्ण offline को लागि local server वा static build चाहिन्छ। |
| 2 | **Device मा data save** | **Online mode:** Firebase/Firestore मा data; browser/Electron को cache (IndexedDB) पनि device मा। **Offline mode (भविष्य):** SQLite वा local file मा data save। अहिले EXE (deployed URL) मा cache बाट केही data device मा रहन्छ। |
| 3 | **Offline ७ दिन** | Offline मा ७ दिन मात्र चल्ने; जुन दिन online आउँछ त्यही दिनबाट दिन रिसेट। सबै build मा लागू। विवरण: [OFFLINE-7-DAYS-AND-RESET.md](./OFFLINE-7-DAYS-AND-RESET.md) |
| 4 | **Super Admin** | कुनै build मा Super Admin setting ननिकाल्ने। विवरण: [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md) |
| 5 | **Windows** | Build गर्ने machine: Windows (वा WSL/CI)। User को device: Windows (जहाँ .exe चल्छ)। |
| 6 | **Node.js** | Electron project बनाउन र `electron-builder` चलाउन Node.js (e.g. 18+) चाहिन्छ। |
| 7 | **Version** | `package.json` मा `version` राख्नुहोस्। विवरण: [BUILD-VERSION.md](./BUILD-VERSION.md) |

---

## २) Android (APK) Build को लागि

| # | Requirement | विवरण |
|---|--------------|--------|
| 1 | **Online / Offline** | **Deployed URL** वाला APK मा पहिले **internet** चाहिन्छ (WebView ले URL load गर्छ)। पूर्ण **offline** को लागि static export (`webDir: 'out'`) र local data (SQLite/cache) चाहिन्छ। |
| 2 | **Device मा data save** | **Online:** Firestore + WebView cache (device मा)। **Offline (भविष्य):** SQLite वा Capacitor Storage; static build भएमा `out/` device मा नै हुन्छ। |
| 3 | **Offline ७ दिन** | EXE जस्तै – offline ७ दिन मात्र; online आएदिन रिसेट। [OFFLINE-7-DAYS-AND-RESET.md](./OFFLINE-7-DAYS-AND-RESET.md) |
| 4 | **Super Admin** | कुनै build मा Super Admin ननिकाल्ने। [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md) |
| 5 | **Android environment** | Build को लागि: **Android Studio** वा Android SDK + Gradle। Capacitor को लागि `npx cap add android`। |
| 6 | **Min SDK / permissions** | Android को लागि `minSdkVersion` र आवश्यक permissions (internet, storage यदि चाहिएको भए) `android/` project मा सेट गर्नुहोस्। |
| 7 | **Version** | `package.json` वा `capacitor.config` मा version; Android को लागि `versionCode` / `versionName` पनि। [BUILD-VERSION.md](./BUILD-VERSION.md) |

---

## ३) साझा (EXE + APK दुवै)

| Requirement | के |
|-------------|-----|
| **Online / Offline** | Online = internet + Firebase/server। Offline = device मा data (cache वा SQLite)। दुवै support गर्न plan छ; अहिले deployed build मा online primary। |
| **Device मा data save** | Cache (IndexedDB/Firestore offline), localStorage, र भविष्यमा SQLite (offline company)। |
| **Offline ७ दिन** | सबै build मा; online आएपछि दिन रिसेट। |
| **Super Admin** | सबै build मा रहनुपर्छ। |
| **Version** | हरेक build अघि version सही राख्नुहोस्। |

---

## ४) भविष्यमा (Plan अनुसार)

- **Company type:** Local (Offline) वा Online/Server – create गर्दा रोज्ने।
- **Device मा पूर्ण data (Offline company):** SQLite मा vouchers, accounts, parties save।
- **Client/Server:** Settings मा Run as Server वा Connect to Server; port र Server URL।
- **EXE/APK:** एउटै codebase बाट; यी requirements सबै build मा लागू।

विवरण: [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md)

---

**सम्बन्धित:** [BUILD-EXE.md](./BUILD-EXE.md) | [BUILD-APK.md](./BUILD-APK.md) | [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md)
