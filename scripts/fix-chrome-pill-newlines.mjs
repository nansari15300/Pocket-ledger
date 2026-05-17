import fs from "fs";
import path from "path";

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const badBtn =
  /variant="chromePill"`n\s*size="icon"`n\s*className="h-8 w-8 shrink-0 p-0"/g;
const badCols =
  /className="h-8 shrink-0 gap-1">`n\s*<Columns3/g;

const goodBtn = `variant="chromePill"\n                size="icon"\n                className="h-8 w-8 shrink-0 p-0"`;
const goodCols = `className="h-8 shrink-0 gap-1">\n                    <Columns3`;

for (const file of walk("src/components")) {
  let c = fs.readFileSync(file, "utf8");
  const n = c.replace(badBtn, goodBtn).replace(badCols, goodCols);
  if (n !== c) {
    fs.writeFileSync(file, n);
    console.log("fixed", file);
  }
}
