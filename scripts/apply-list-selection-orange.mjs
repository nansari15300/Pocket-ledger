import fs from "fs";

const selected =
  "border-orange-400 bg-orange-50 shadow-sm dark:border-orange-500 dark:bg-orange-950/40";
const selectedPlain =
  "border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/40";

const files = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = `${d}/${f}`;
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
}
walk("src/components");

for (const file of files) {
  let c = fs.readFileSync(file, "utf8");
  if (!c.includes("border-primary bg-secondary") && !c.includes("MasterListRow")) continue;
  const before = c;
  c = c.replace(/border-primary bg-secondary shadow-sm/g, selected);
  c = c.replace(/border-primary bg-secondary/g, selectedPlain);
  c = c.replace(/hover:border-primary\/40 hover:bg-muted\/30/g, "hover:border-orange-300/80 hover:bg-orange-50/30");
  c = c.replace(/hover:border-primary\/50/g, "hover:border-orange-300/80 hover:bg-orange-50/30");
  c = c.replace(/hover:border-primary\/40 hover:bg-muted\/30/g, "hover:border-orange-300/80 hover:bg-orange-50/30");
  // MasterListRow: selected={isSelected} + hatao duplicate selected classes
  c = c.replace(
    /<MasterListRow className=\{cardClassName\}>/g,
    "<MasterListRow selected={isSelected} className={cardClassName}>"
  );
  c = c.replace(
    /<MasterListRow className=\{cn\(([^)]*)\)\} onClick/g,
    "<MasterListRow selected={isSelected} className={cn($1)} onClick"
  );
  // cardClassName ternary — selected side empty (MasterListRow handles)
  c = c.replace(
    /const cardClassName = cn\(\s*isSelected\s*\?\s*"[^"]*border-orange[^"]*"\s*:\s*"([^"]+)"\s*\);/g,
    'const cardClassName = cn(!isSelected && "$1");'
  );
  c = c.replace(
    /isSelected\s*\?\s*"border-orange[^"]*"\s*:\s*"([^"]+)"/g,
    '!isSelected && "$1"'
  );
  if (c !== before) {
    fs.writeFileSync(file, c);
    console.log("updated", file);
  }
}
