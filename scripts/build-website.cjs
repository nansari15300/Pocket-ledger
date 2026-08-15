/**
 * Build marketing site only (no Next/app build).
 * Output: website/dist — deploy independently or via Firebase Hosting.
 *
 *   npm run website:build
 *   npm run website:serve
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "website");
const dist = path.join(root, "dist");

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === "dist" || name === "node_modules" || name === "hosting-app-rewrite.example.json") continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDir(from, to);
    else if (/\.(html|css|js|svg|png|jpg|jpeg|webp|ico|txt|xml|webmanifest|json)$/i.test(name)) {
      copyFile(from, to);
    }
  }
}

rmrf(dist);
copyDir(root, dist);

console.log("[website:build] Wrote", dist);
console.log("[website:build] Open: website/dist/index.html");
console.log("[website:build] Deploy folder: website/dist (Firebase Hosting public)");
