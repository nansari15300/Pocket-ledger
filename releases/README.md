# Staged installers only (not every build)

`npm run website:stage-releases` copies the current EXE + APK into a **date folder**:

```text
releases/2026-08-14/Pocket Ledger Setup 1.0.0.exe
releases/2026-08-14/app-release.apk
releases/latest.json
```

Local downloads: `http://localhost:3000/releases/...`

Binaries stay gitignored. Live site uses Firebase Storage via `/admin-release/`.
