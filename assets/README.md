# App icon source (APK / Android)

- **`icon-only.png`** — launcher icon source (Capacitor). **Kam se kam 1024×1024** PNG recommended.
- APK icons regenerate karne ke liye project root se:

```bash
npm run cap:icons
```

- `npm run cap:icons` ke andar hi **`scripts/sync-android-launcher-foreground.js`** chalta hai (adaptive `ic_launcher_foreground` = naya icon).

- Uske baad: `npx cap sync android` → Android Studio se APK build.
