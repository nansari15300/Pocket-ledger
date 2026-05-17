import fs from "fs";

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = `${d}/${f}`;
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

for (const file of walk("src/components")) {
  let c = fs.readFileSync(file, "utf8");
  if (!c.includes("<LedgerFooterChromePill")) continue;

  c = c.replace(
    /(<LedgerFooterChromePill className="px-1">[\s\S]*?<\/Select>)\s*(?!<\/LedgerFooterChromePill>)(\s*<Button)/g,
    "$1\n              </LedgerFooterChromePill>$2"
  );

  fs.writeFileSync(file, c);
  if (c.includes("<LedgerFooterChromePill")) console.log("patched", file);
}
