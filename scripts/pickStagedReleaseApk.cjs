/**
 * Pick the APK to publish from releases/YYYY-MM-DD/.
 * Avoids uploading a stale app-release-1.1.xx.apk when a newer app-release.apk exists.
 */
const fs = require("fs");
const path = require("path");

function pickStagedReleaseApk(localDir, androidVersion) {
  if (!fs.existsSync(localDir)) return null;
  const files = fs
    .readdirSync(localDir)
    .filter((n) => n.toLowerCase().endsWith(".apk") && !/unsigned/i.test(n));
  if (!files.length) return null;

  const v = String(androidVersion || "").trim();
  if (v) {
    const exact = files.find((n) => n.includes(v));
    if (exact) return exact;
    const canonical = `app-release-${v}.apk`;
    if (files.includes(canonical)) return canonical;
  }

  const gradleDefault = files.find((n) => /^app-release\.apk$/i.test(n));
  if (gradleDefault) return gradleDefault;

  return files
    .map((n) => ({
      n,
      mtime: fs.statSync(path.join(localDir, n)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0].n;
}

function canonicalAndroidReleaseApkName(androidVersion) {
  const v = String(androidVersion || "latest").trim() || "latest";
  return `app-release-${v}.apk`;
}

module.exports = { pickStagedReleaseApk, canonicalAndroidReleaseApkName };
