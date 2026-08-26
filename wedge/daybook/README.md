# Daybook home-screen wedge

Scrollable list of **today's** daybook rows on Android home screen.

## Files

| Layer | Path |
|--------|------|
| Types | `types/daybookWedgeRow.ts` |
| Snapshot builder | `sync/buildDaybookSnapshot.ts` |
| App sync | `src/components/wedge/DaybookWedgeSyncManager.tsx` |
| Native provider | `android/.../wedge/daybook/DaybookWedgeProvider.java` |
| Native list | `android/.../wedge/daybook/DaybookWedgeService.java` |
| Layouts | `android/app/src/main/res/layout/wedge_daybook_*.xml` |

## Dev

See root `wedge/README.md` — widget **sirf APK + home screen** par dikhta hai, browser dev par nahi.
