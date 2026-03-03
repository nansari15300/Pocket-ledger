# Pocket Ledger – EXE / APK बनाउने Plan (Offline, Online, Local DB, Client–Server)

तपाईंले चाहेको:
- **EXE** (Windows) र **APK** (Android) मा चल्ने app
- **Data:** offline वा online (option)
- **Mode:** Client / Server (एक device server, अरू client)
- **Local save:** Data locally save (database बनाएर)
- पछि **build** (exe, apk)

यो document मा **क्रममा के–के गर्नुपर्छ** को list र **EXE/APK बनाउने विधि** दुवै छ।

---

## Plan (संक्षेप)

| # | काम |
|---|-----|
| 1 | **Company type:** Create गर्दा **Local (Offline)** वा **Online/Server** रोज्ने। Offline = data phone/device मा (SQLite); Online = server/Firebase। |
| 2 | **SQLite** लगाएर Offline company को लागि local schema र read/write layer बनाउने। |
| 3 | **Settings** मा Online/Offline/Server URL रोज्ने; data access layer ले company type अनुसार SQLite वा server use गर्ने। |
| 4 | **Server:** एक PC मा backend + SQLite + API; अर्को devices त्यहीमा connect। |
| 5 | **EXE:** Electron + electron-builder; **APK:** Capacitor + Android Studio। एकै codebase बाट Web, EXE, APK। |

---

## App मा option कहाँ थप्ने (Where to add)

| Option | कहाँ थप्ने | के दिने |
|--------|-------------|---------|
| **Company type** (Local vs Online/Server) | **Company Create** form/screen | नयाँ company बनाउँदा: "Save as" वा "Data storage" – **Local (Offline)** (data यही device मा) वा **Online / Server** (data server/Firebase मा)। |
| **Client / Server** (यो device server हो कि client) | **Settings** (e.g. Settings → Connection / Data mode वा "Server" section) | (१) **Run as Server** – यो device मा server चल्छ, data यहीँ; अरू devices यहीको IP सँग connect। (२) **Connect to Server** – Server URL (e.g. `http://192.168.1.5:3000`) input; यो device client। |
| **Port change** (server को port) | **Settings** (Server section मा) | जब "Run as Server" रोजिएको छ, त्यहीँ **Port** field (e.g. default 3000; user ले 8080, 5000 जस्तो change गर्न सक्ने)। Server यही port मा listen गर्छ; client connect गर्दा `http://<IP>:<port>` use गर्छ। |

**Client + Server दुवै एकै app मा:** अलग दुईटा app बनाउनु पर्दैन। **एकै app** मा Settings बाट रोज्ने: यो device **Server** चलाउँछ (backend + SQLite + UI) वा **Client** मात्र (Server URL लेर connect)। एकै PC मा "Run as Server" रोज्यो भने उही device **Server पनि Client पनि** (localhost बाट आफैँ use गर्छ)।

**छोट्करी:** Company type = **Company Create** मा। Client/Server = **Settings** मा। दुवै mode **एकै build** (EXE/APK) मा।

---

## Company Type: Online / Offline (नाम र option)

हरेक company को एउटा **type** हुन्छ:

| Type (नाम) | अर्थ | Data कहाँ save |
|------------|------|-----------------|
| **Online** | Server वा Firebase मा | Local server (जब connect छ) वा Firebase। |
| **Offline** | Phone/device मा मात्र | केवल यही device को SQLite (local)। |

**Company create गर्दा user ले choose गर्ने option:**
- **Local** (वा **Offline**) – यो company को data **केवल यो device/phone** मा save हुन्छ (SQLite)। Server वा cloud मा जाँदैन।
- **Online** (वा **Online/Server**) – यो company को data **local server** मा save हुन्छ (जब mobile/EXE server सँग connect छ); वा Firebase (अहिले जस्तै)।

यसरी बनाउनुपर्छ: Company create form मा **"Save as: Local (Offline)"** वा **"Online / Server"** जस्तो option दिने। र company को type/store मा यो value (online / offline) राख्ने।

---

## Build नियम: Super Admin

**कुनै पनि build (EXE, APK, iOS, Web, Linux) मा Super Admin setting ननिकाल्ने।** Admin Panel, plans, super admin emails र सम्बन्धित logic सबै build मा रहनुपर्छ। विवरण: [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md)

---

## Phase 1: Architecture र Decision

| # | कुरा | विकल्प | नोट |
|---|------|--------|-----|
| 1.1 | **Data mode** | (A) Online only (B) Offline only (C) Dual: offline + online/server | (C) – company अनुसार Online वा Offline। |
| 1.2 | **Local database** | SQLite (file-based, EXE/APK दुवैमा चल्छ) | Recommended |
| 1.3 | **Server कहाँ चल्छ** | एक PC मा (Node/Express वा Next.js API + SQLite) | Same network मा अरू devices यहीमा connect |
| 1.4 | **Client कहाँ चल्छ** | EXE (Electron), APK (Capacitor), Web (browser) | एकै codebase |
| 1.5 | **Company type** | **Online** (server/Firebase) वा **Offline** (local only) | Company create गर्दा user ले **Local** वा **Online/Server** रोज्छ। |

---

## Phase 2: Data Layer – Local DB र Mode

| # | काम | विवरण |
|---|-----|--------|
| 2.1 | **SQLite introduce गर्नु** | App मा local DB को लागि SQLite use गर्ने (e.g. `better-sqlite3` for Node/Electron; Capacitor को लागि `@capacitor-community/sqlite` वा similar). |
| 2.2 | **Data access layer बनाउनु** | एक layer जहाँ: company को type **Online** हो भने server/Firebase, **Offline** हो भने SQLite बाट read/write। |
| 2.3 | **Offline schema** | Offline company को लागि SQLite मा vouchers, accounts, parties, transactions जस्ता tables को schema (structure) बनाउनु। |
| 2.4 | **Settings: Online / Offline / Server URL** | User ले रोज्न सक्ने: (1) **Online** (Firebase वा local server URL), (2) **Offline** (local only). Company create गर्दा **Local (Offline)** वा **Online/Server** option दिने। |

---

## Phase 3: Server Mode (एक PC = Server)

| # | काम | विवरण |
|---|-----|--------|
| 3.1 | **Server app define गर्नु** | एक ओटा small backend (e.g. Next.js API routes वा Express) जसले SQLite (वा file DB) use गर्छ, same PC मा चल्छ। |
| 3.2 | **API endpoints** | Login, vouchers CRUD, accounts, parties, transactions – client ले call गर्ने REST। |
| 3.3 | **Server + Client same PC** | उही PC मा server run गर्दा आफैँ `http://localhost:3000` बाट client जस्तै use गर्न सक्ने। |
| 3.4 | **Network access** | अर्को device (APK/Web) ले `http://<server-pc-ip>:3000` बाट connect गर्न सक्ने। |

---

## Phase 4: Client Modes (EXE / APK / Web)

| # | काम | विवरण |
|---|-----|--------|
| 4.1 | **Company type use गर्नु** | Company **Offline** हो भने local SQLite; **Online** हो भने server URL वा Firebase। |
| 4.2 | **EXE (Electron)** | Electron app: local SQLite र Server URL दुवै support; company अनुसार Online/Offline। |
| 4.3 | **APK (Capacitor)** | Capacitor + SQLite plugin र Server URL; company अनुसार Online/Offline। |
| 4.4 | **Device name / location** | EXE: hostname; APK: Device plugin + Geolocation (optional) – device slot setting मा। |

---

## Phase 5: Build – EXE र APK (Plan)

| # | काम | विवरण |
|---|-----|--------|
| 5.1 | **EXE build** | Electron + electron-builder; Windows .exe (र optional installer)। |
| 5.2 | **APK build** | Capacitor: `cap add android` → Android Studio वा Gradle बाट release APK। |
| 5.3 | **Single codebase** | Web, EXE, APK सबै यही repo बाट; company type Online/Offline सबै platform मा same। |

---

## Summary – क्रममा के गर्ने (List)

1. **Company type:** **Online** / **Offline** नाम दिने। Company create गर्दा **Local (Offline)** वा **Online/Server** option दिने।
2. **Architecture:** Offline + Online + Server mode, local DB = SQLite.
3. **SQLite + data layer:** Offline company को लागि schema र read/write layer.
4. **Settings:** Offline / Online / Server URL रोज्ने UI; company create मा Local वा Online/Server choose.
5. **Server (एक PC):** Small backend + SQLite, API, same PC मा client पनि.
6. **Client:** EXE र APK मा same app, company type अनुसार data source (local वा server).
7. **Build:** EXE को लागि electron-builder, APK को लागि Capacitor + Android.

तपाईं "start गर्नुहोस्" भन्नुहोस्, त्यसपछि Phase 1 बाट step-by-step सुरु गर्न सकिन्छ।

---

# EXE / APK बनाउने विधि (कसरी build गर्ने)

यो app **Next.js** (web) + **Firebase** हो। Data internet मा हुन्छ, त्यसैले exe/APK बनाउन दुई मुख्य तरिका छन्।

---

## १) सजिलो तरिका: Deploy गरेर PWA / Browser install

- App लाई **Vercel** या **Firebase Hosting** मा deploy गर्नुहोस्।
- **PWA (Progressive Web App)** बनाउनुहोस्: mobile मा "Add to Home Screen" गर्दा app जस्तै खुल्छ।
- PC मा Chrome/Edge बाट "Install Pocket Ledger" (Install app) ले window मा install हुन्छ।
- यसले **साँचो .exe / .apk फाइल** दिँदैन, तर install जस्तो experience दिन्छ र सबै platform मा चल्छ।

**के गर्ने:**  
Next.js मा PWA support थप्न `next-pwa` या manual `manifest.json` + service worker प्रयोग गर्न सकिन्छ।

---

## २) साँचो .exe (PC) र .apk (Android) बनाउने

### A) PC को लागि .exe (Electron)

1. **Electron** प्रयोग गर्ने (web app लाई desktop app बनाउँछ)।
2. तपाईंले **दुई ढंग** मध्ये एक रोज्नुपर्छ:
   - **विकल्प १:** App लाई **deploy** गर्नुहोस् (e.g. `https://pocket-ledger.vercel.app`), र Electron app मा त्यही URL खोल्ने window बनाउनुहोस्। (सजिलो, exe सानो।)
   - **विकल्प २:** Next.js लाई **build** गरेर Electron भित्रै **Node server** चलाउने। (exe ठूलो, तर offline-ish चल्न सक्छ अगर Firebase cache मा छ।)

3. **सामान्य चरण:**
   - नयाँ folder मा Electron project बनाउनुहोस् (e.g. `pocket-ledger-desktop`).
   - `package.json` मा `electron` dependency र `main` script (e.g. `main.js`) सेट गर्नुहोस्।
   - `main.js` मा `BrowserWindow` खोलेर तपाईंको **deployed URL** लोड गर्नुहोस् वा local Next.js build चलाउनुहोस्।
   - Windows मा build गर्न: `electron-builder` प्रयोग गरेर `.exe` बनाउन सकिन्छ।

**उदाहरण (deployed URL खोल्ने):**

```bash
# नयाँ folder
mkdir pocket-ledger-desktop && cd pocket-ledger-desktop
npm init -y
npm install electron electron-builder --save-dev
```

`main.js` (भावना):

```js
const { app, BrowserWindow } = require('electron');
function createWindow() {
  const win = new BrowserWindow({ width: 1200, height: 800 });
  win.loadURL('https://YOUR-DEPLOYED-URL.vercel.app');
}
app.whenReady().then(createWindow);
```

त्यसपछि `electron-builder` को config ले .exe बनाउँछ।

---

### B) Android को लागि .apk (Capacitor)

1. **Capacitor** प्रयोग गर्ने (web app लाई native WebView मा राखेर APK बनाउँछ)।
2. पहिले Next.js लाई **export** गर्नुपर्छ:
   - अगर तपाईंको app मा **API routes / server-side** धेरै छैन भने, `next.config` मा `output: 'export'` राखेर **static export** गर्न सकिन्छ।
   - वा तपाईं **deployed URL** लाई Capacitor मा WebView मा खोल्न सक्नुहुन्छ (सजिलो)।

3. **सामान्य चरण:**
   - Project मा Capacitor थप्नुहोस्:  
     `npm install @capacitor/core @capacitor/cli @capacitor/android`
   - `npx cap init` गर्नुहोस् (app name, bundle id दिनुहोस्)।
   - Next.js को **build output** (e.g. `out/` for static export) लाई `capacitor.config` मा `webDir` को रूपमा सेट गर्नुहोस्।
   - वा config मा **server** राखेर deployed URL लोड गर्न सक्नुहुन्छ।
   - Android project add: `npx cap add android`
   - Android Studio खोलेर वा command line बाट **APK build** गर्नुहोस्:  
     `npx cap sync android` पछि Android Studio बाट Build → Build Bundle(s) / APK(s).

**नोट:** तपाईंको app मा Firebase + possible API routes छन्, त्यसैले:
- **सजिलो:** Deploy गर्नुहोस्, Capacitor को WebView मा त्यही URL खोल्ने (Capacitor config मा `server.url`)। त्यसपछि मात्र APK बनाउनुहोस्।
- **ठूलो काम:** Next.js लाई static export गर्न मिल्ने बनाउनु (सबै logic client-side / Firebase मा) र त्यो `out/` लाई Capacitor को `webDir` बनाउनु।

---

## सारांश (Build)

| लक्ष्य        | सिफारिश |
|---------------|----------|
| सजिलो र छिटो | App लाई **deploy** गर्नुहोस्। PWA बनाउनुहोस् र "Install" / "Add to Home" प्रयोग गर्नुहोस्। |
| साँचो .exe   | **Electron** ले deployed URL खोल्ने app बनाउनुहोस् र **electron-builder** बाट Windows .exe बनाउनुहोस्। |
| साँचो .apk   | **Capacitor** ले same deployed URL वा static export लोड गर्ने app बनाउनुहोस् र **Android Studio** बाट APK बनाउनुहोस्। |

पहिले **deploy** (Vercel/Firebase Hosting) गर्नुहोस्, त्यसपछि Electron र Capacitor दुवैले त्यही URL use गर्न सक्छन्।

---

## Build गाइडहरू (अलग अलग .md फाइलमा)

विधि अनुसार step-by-step build निम्न फाइलहरूमा छ:

| Platform | फाइल | के पाइन्छ |
|----------|------|-----------|
| **Windows .exe** | [BUILD-EXE.md](./BUILD-EXE.md) | Electron + electron-builder बाट .exe |
| **Android APK** | [BUILD-APK.md](./BUILD-APK.md) | Capacitor + Android Studio बाट APK |
| **iOS** | [BUILD-IOS.md](./BUILD-IOS.md) | Capacitor + Xcode बाट iOS app |
| **Web / Deploy** | [BUILD-WEB.md](./BUILD-WEB.md) | Vercel, Firebase Hosting, PWA |
| **Linux** | [BUILD-LINUX.md](./BUILD-LINUX.md) | Electron बाट AppImage / .deb |
| **Version** | [BUILD-VERSION.md](./BUILD-VERSION.md) | App version कहाँ सेट गर्ने र कसरी decide गर्ने |
| **Super Admin / Plans / Offline** | [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md) | कुनै build मा super admin ननिकाल्ने; offline device मा plans/super admin कसरी apply गर्ने |
| **Offline ७ दिन र reset** | [OFFLINE-7-DAYS-AND-RESET.md](./OFFLINE-7-DAYS-AND-RESET.md) | Offline मा ७ दिन मात्र; online आएदिन दिन रिसेट गर्ने बिधि |
| **EXE/APK Standard requirements** | [BUILD-REQUIREMENTS.md](./BUILD-REQUIREMENTS.md) | Online/offline, device मा data save, Super Admin, version आदि कस्ता चाहिन्छ |
| **src फोल्डर / Protection** | [SRC-FOLDER-PROTECTION.md](./SRC-FOLDER-PROTECTION.md) | Build गरिएको app मा src को code को हेर्न सक्छ कि सक्दैन; के गर्ने |
| **Offline ७ दिन र Reset** | [OFFLINE-7-DAYS-RESET.md](./OFFLINE-7-DAYS-RESET.md) | Offline मात्र ७ दिन; जुन दिन online त्यस दिन दिन रिसेट |
