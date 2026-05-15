/**
 * CI / pre-push: `firebase/firestore` se seedha `setDoc|updateDoc|addDoc|deleteDoc|runTransaction|writeBatch`
 * import sirf `src/lib/writeGateway/**` aur `src/lib/localVoucherOutbox.ts` me allowed — baaki `src/` par exit 1.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const MUTATIONS = new Set(["setDoc", "updateDoc", "addDoc", "deleteDoc", "runTransaction", "writeBatch"]);

function isAllowed(filePath) {
  const rel = path.relative(SRC, filePath).split(path.sep).join("/");
  if (rel.startsWith("lib/writeGateway/")) return true;
  if (rel === "lib/localVoucherOutbox.ts") return true;
  return false;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

/** Curly import block se bare names nikaalo (type-only / `as` alias handle). */
function specifiersFromNamedImportBlock(block) {
  const names = [];
  for (const raw of block.split(",")) {
    let s = raw.trim();
    if (!s) continue;
    if (s.startsWith("type ")) s = s.slice(5).trim();
    const asIdx = s.indexOf(" as ");
    if (asIdx !== -1) s = s.slice(0, asIdx).trim();
    const word = s.split(/\s+/)[0];
    if (word) names.push(word);
  }
  return names;
}

function findViolations(content) {
  const violations = [];
  const re = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+["']firebase\/firestore["']/g;
  let m;
  while ((m = re.exec(content))) {
    const specs = specifiersFromNamedImportBlock(m[1]);
    for (const sp of specs) {
      if (MUTATIONS.has(sp)) violations.push(sp);
    }
  }
  return violations;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("assert-no-firestore-mutations: src/ not found");
    process.exit(1);
  }
  const bad = [];
  for (const file of walk(SRC)) {
    if (isAllowed(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const hits = findViolations(text);
    if (hits.length) {
      const rel = path.relative(path.join(SRC, ".."), file).split(path.sep).join("/");
      bad.push(`${rel}: forbidden import(s) → ${[...new Set(hits)].join(", ")}`);
    }
  }
  if (bad.length) {
    console.error(
      "Firestore mutation APIs must only be imported under src/lib/writeGateway/ or localVoucherOutbox.ts.\n",
    );
    for (const line of bad.slice(0, 80)) console.error("  ", line);
    if (bad.length > 80) console.error(`  … and ${bad.length - 80} more files`);
    process.exit(1);
  }
  console.log("assert-no-firestore-mutations: OK");
}

main();
