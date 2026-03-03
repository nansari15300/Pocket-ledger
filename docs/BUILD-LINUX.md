# Linux App बनाउने विधि (Pocket Ledger)

Linux को लागि desktop app (.AppImage, .deb वा direct run) बनाउन **Electron** र **electron-builder** प्रयोग गर्नुहोस्।

---

## १) सामान्य अवधारणा

- **Electron** नै Windows .exe जस्तै Linux मा पनि चल्छ।
- **electron-builder** ले Linux को लागि **AppImage**, **.deb**, **.rpm** आदि बनाउँछ।
- तपाईंले EXE को लागि बनाएको Electron project मा Linux target थप्नुहोस्।

---

## २) चरण (Electron project बाट)

### Step 1: Electron project (EXE जस्तै)

अगर अझै बनाएको छैन भने [BUILD-EXE.md](./BUILD-EXE.md) अनुसार `main.js` र base `package.json` बनाउनुहोस्।

### Step 2: `package.json` मा Linux build config

```json
{
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win",
    "build:linux": "electron-builder --linux"
  },
  "build": {
    "appId": "com.pocketledger.app",
    "productName": "Pocket Ledger",
    "directories": { "output": "dist" },
    "win": { "target": "nsis", "icon": "build/icon.ico" },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "build/icon.png",
      "category": "Finance"
    }
  }
}
```

### Step 3: Linux मा build गर्नु

**Linux machine** (वा WSL/Docker) मा:

```bash
npm run build:linux
```

वा एकै चोटि Windows + Linux:

```json
"build:all": "electron-builder --win --linux"
```

```bash
npm run build:all
```

Output:
- `dist/` मा **Pocket Ledger-x.x.x.AppImage** (सामान्य Linux)
- **.deb** (Debian/Ubuntu)
- चाहिएमा **.rpm** (Fedora/RHEL) – `"target": ["AppImage", "deb", "rpm"]`।

---

## ३) चलाउनु (AppImage)

```bash
chmod +x "Pocket Ledger-x.x.x.AppImage"
./"Pocket Ledger-x.x.x.AppImage"
```

---

## ४) नोट

- **Windows मा Linux build:** कुनै dependency (जस्तै `rpm`) को लागि Linux वातावरण (WSL या Docker) चाहिन्छ; **AppImage** सामान्यतः cross-platform build मा पनि बन्छ।
- **Icon:** `build/icon.png` (256x256 वा ठूलो) राख्नुहोस्।

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [BUILD-EXE.md](./BUILD-EXE.md) | [BUILD-APK.md](./BUILD-APK.md)
