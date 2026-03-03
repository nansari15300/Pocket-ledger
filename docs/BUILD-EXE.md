# Windows .exe बनाउने विधि (Pocket Ledger)

Windows को लागि साँचो `.exe` बनाउन **Electron** र **electron-builder** प्रयोग गर्नुहोस्।

**नियम:** कुनै पनि build मा Super Admin setting ननिकाल्ने। विवरण: [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md)

**Standard requirements (online/offline, device मा data save, आदि):** [BUILD-REQUIREMENTS.md](./BUILD-REQUIREMENTS.md)

---

## १) सामान्य अवधारणा

- **Electron** ले web app लाई desktop window मा चलाउँछ।
- **दुई ढंग:**
  - **विकल्प १ (सजिलो):** App लाई deploy गर्नुहोस् (e.g. Vercel), र Electron मा त्यही URL खोल्ने window बनाउनुहोस्। EXE सानो, तर internet चाहिन्छ।
  - **विकल्प २:** Next.js build गरेर Electron भित्रै local server चलाउनु। EXE ठूलो, तर offline-ish चल्न सक्छ।

---

## २) चरण (विकल्प १ – Deployed URL)

### Step 1: Electron project बनाउनु

```bash
mkdir pocket-ledger-desktop && cd pocket-ledger-desktop
npm init -y
npm install electron electron-builder --save-dev
```

### Step 2: main.js बनाउनु

Root मा `main.js`:

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL('https://YOUR-APP.vercel.app');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

### Step 3: package.json मा script र build config (र version)

App को **version** यहीँबाट लिन्छ – build अघि `version` सही राख्नुहोस्। विवरण: [BUILD-VERSION.md](./BUILD-VERSION.md)

```json
{
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win"
  },
  "build": {
    "appId": "com.pocketledger.app",
    "productName": "Pocket Ledger",
    "directories": { "output": "dist" },
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    }
  }
}
```

### Step 4: Windows .exe build गर्नु

```bash
npm run build
```

Output: `dist/` मा `.exe` (NSIS installer) मिल्छ।

---

## ३) नोट

- **Icon:** `build/icon.ico` राख्नुहोस् (वा win.icon हटाउनुहोस्)।
- **Auto-update** चाहिएमा `electron-updater` थप्न सकिन्छ।
- विकल्प २ को लागि Next.js build output लाई Electron बाट serve गर्ने server लेख्नुपर्छ।

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [BUILD-APK.md](./BUILD-APK.md) | [BUILD-LINUX.md](./BUILD-LINUX.md)
