/**
 * Firebase Storage bucket par root `cors.json` apply karta hai (`gsutil cors set`).
 * Cloud SDK PATH par ho ya Windows default install path — dono try.
 * Bucket override: env `FIREBASE_STORAGE_BUCKET` = `studio-xxx.firebasestorage.app` (bina gs://)
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const corsPath = path.join(repoRoot, "cors.json");
const bucketArg =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.GSUTIL_BUCKET ||
  "studio-5452513410-a3f5b.firebasestorage.app";
const gsUri = bucketArg.startsWith("gs://") ? bucketArg : `gs://${bucketArg}`;

function exists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Windows: Cloud SDK default locations (PATH me kabhi add nahi hota) — inhe pehle try karo. */
function gsutilCandidates() {
  const out = [];
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    for (const base of [
      path.join(pf, "Google", "Cloud SDK", "google-cloud-sdk", "bin"),
      path.join(pfx86, "Google", "Cloud SDK", "google-cloud-sdk", "bin"),
      local && path.join(local, "Google", "Cloud SDK", "google-cloud-sdk", "bin"),
    ].filter(Boolean)) {
      for (const n of ["gsutil.cmd", "gsutil"]) {
        const full = path.join(base, n);
        if (exists(full)) out.push(full);
      }
    }
    const where = spawnSync("where.exe", ["gsutil"], { encoding: "utf-8", shell: true });
    if (where.status === 0 && where.stdout) {
      for (const line of where.stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (t && exists(t)) out.push(t);
      }
    }
  }
  const names = process.platform === "win32" ? ["gsutil.cmd", "gsutil"] : ["gsutil"];
  for (const n of names) out.push(n);
  return [...new Set(out)];
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  return r.status === 0;
}

if (!exists(corsPath)) {
  console.error("[apply-firebase-storage-cors] Missing file:", corsPath);
  process.exit(1);
}

const args = ["cors", "set", corsPath, gsUri];
let ok = false;
for (const cmd of gsutilCandidates()) {
  console.log("[apply-firebase-storage-cors] Trying:", cmd, ...args);
  if (run(cmd, args)) {
    ok = true;
    break;
  }
}

if (!ok) {
  console.error(`
[apply-firebase-storage-cors] gsutil nahi mila.

1) Google Cloud SDK install karo: https://cloud.google.com/sdk/docs/install
2) "Google Cloud SDK Shell" ya terminal jahan gsutil chalta ho se yeh chalao:

   gsutil cors set "${corsPath}" ${gsUri}

3) Bucket alag ho to:
   set FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   npm run storage:cors
`);
  process.exit(1);
}

console.log("[apply-firebase-storage-cors] OK — verify: gsutil cors get", gsUri);
