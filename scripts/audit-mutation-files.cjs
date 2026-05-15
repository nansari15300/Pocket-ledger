const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "src");
const PAT = /\b(setDoc|updateDoc|addDoc|deleteDoc|runTransaction|writeBatch)\b/;
function norm(p) {
  return p.split(path.sep).join("/");
}
function allowed(rel) {
  const n = norm(rel);
  return n.startsWith("src/lib/writeGateway/") || n === "src/lib/localVoucherOutbox.ts";
}
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}
const bad = new Set();
for (const f of walk(ROOT)) {
  const rel = norm(path.relative(path.join(__dirname, ".."), f));
  if (allowed(rel)) continue;
  const t = fs.readFileSync(f, "utf8");
  if (PAT.test(t)) bad.add(rel);
}
[...bad].sort().forEach((x) => console.log(x));
console.error("COUNT", bad.size);
