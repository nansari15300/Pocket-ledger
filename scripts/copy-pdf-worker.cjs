/**
 * Keep public/pdf.worker.min.mjs in sync with installed pdfjs-dist (API vs worker version must match).
 * Run from postinstall and after upgrading pdfjs-dist.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const dest = path.join(root, "public", "pdf.worker.min.mjs");

if (!fs.existsSync(src)) {
  console.warn("[copy-pdf-worker] Skip: not found:", src);
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
const pkgPath = path.join(root, "node_modules", "pdfjs-dist", "package.json");
const ver = fs.existsSync(pkgPath)
  ? JSON.parse(fs.readFileSync(pkgPath, "utf8")).version
  : "?";
console.log(`[copy-pdf-worker] public/pdf.worker.min.mjs <= pdfjs-dist@${ver}`);
