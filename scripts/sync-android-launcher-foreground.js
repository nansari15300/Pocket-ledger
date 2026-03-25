/**
 * `capacitor-assets` sirf `ic_launcher.png` / `ic_launcher_round.png` banata hai;
 * adaptive-icon ab `@drawable/ic_launcher_foreground_inset` (mipmap foreground par symmetric inset) use karti hai;
 * yahan sirf har mipmap me `ic_launcher` → `ic_launcher_foreground.png` copy rehta hai.
 */
const fs = require("fs");
const path = require("path");

const res = path.join(__dirname, "..", "android", "app", "src", "main", "res");
if (!fs.existsSync(res)) {
  console.warn("[sync-android-launcher-foreground] android res missing, skip");
  process.exit(0);
}

let n = 0;
for (const name of fs.readdirSync(res, { withFileTypes: true })) {
  if (!name.isDirectory() || !name.name.startsWith("mipmap-")) continue;
  const dir = path.join(res, name.name);
  const launcher = path.join(dir, "ic_launcher.png");
  const fg = path.join(dir, "ic_launcher_foreground.png");
  if (fs.existsSync(launcher)) {
    fs.copyFileSync(launcher, fg);
    n += 1;
  }
}
console.log(`[sync-android-launcher-foreground] updated ${n} ic_launcher_foreground.png`);
