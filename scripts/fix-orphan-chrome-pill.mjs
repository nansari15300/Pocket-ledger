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
  const orphan = /(\s*)<\/Select>\s*<\/LedgerFooterChromePill>/g;
  if (!orphan.test(c)) continue;
  c = fs.readFileSync(file, "utf8");

  c = c.replace(
    /(\s*)<Select(\s+value=\{[^}]+\}[\s\S]*?<SelectTrigger className=")h-8 w-\[70px\](">)/g,
    (m, indent, mid, end) => {
      const slice = c.slice(Math.max(0, c.indexOf(m) - 200), c.indexOf(m));
      if (slice.includes("<LedgerFooterChromePill")) return m;
      return `${indent}<LedgerFooterChromePill className="px-1">\n${indent}<Select${mid}h-7 w-[64px] border-0 bg-transparent shadow-none focus:ring-0${end}`;
    }
  );

  // Remove orphan closing when still no opening in 400 chars before
  c = c.replace(/<\/Select>\s*<\/LedgerFooterChromePill>/g, (match, offset) => {
    const before = c.slice(Math.max(0, offset - 600), offset);
    if (before.includes("<LedgerFooterChromePill")) return match;
    return "</Select>";
  });

  fs.writeFileSync(file, c);
  console.log("fixed", file);
}
