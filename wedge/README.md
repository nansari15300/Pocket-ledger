# Pocket Ledger — Home screen wedges (Android widgets)

Sab home-screen widgets is `wedge/` folder ke andar organized hain. **Ek hi APK** install hoti hai; yeh alag app nahi.

## Tree

```
wedge/
  shared/          ← common bridge + native helpers
  daybook/         ← scrollable daybook list widget
  outstanding/     ← (future)
```

Native build files `android/app/src/main/` me mirror hote hain (`java/.../wedge/`, `res/layout/wedge_*`).

## Naya wedge add karna

1. `wedge/<name>/` — types, sync, native, res
2. `android/.../wedge/<name>/` — Java provider + service
3. `AndroidManifest.xml` — receiver + service
4. `wedge/shared/bridge/WedgePlugin.ts` — naya push method (agar chahiye)

## Dev par kaise dekhein

### 1) Browser preview (recommended — APK se pehle)

`npm run dev` chalao, phir kholo:

**http://localhost:3000/dev/wedge/daybook**

- **Sample data** — demo rows
- **Live company data** — aaj ka real daybook (company select honi chahiye)
- **Empty state** — widget jab sync na hua ho

UI file: `wedge/daybook/preview/DaybookWedgePreview.tsx`  
Native XML: `android/app/src/main/res/layout/wedge_daybook_*.xml` — dono sync rakho.

### 2) Real home-screen widget (final test)

**Browser / `npm run dev` par asli widget nahi dikhega** — sirf Android home screen.

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Phone → long press → Widgets → **Pocket Ledger — Daybook**

### 3) Kam install jhanjhat

- **Pehli baar** debug APK install karo (ya Android Studio Run).
- Sirf **React/TS** change → `npm run build` + `npx cap sync android` — puri reinstall zaroori nahi agar same debug APK hai.
- Sirf **native XML/Java** change → dubara `assembleDebug` + install.

Log: `adb logcat | grep -i wedge`
