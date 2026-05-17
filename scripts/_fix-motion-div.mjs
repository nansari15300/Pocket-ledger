import fs from "fs";

const p = "src/components/layout/GlobalFileHoverPreviewSwitch.tsx";
let s = fs.readFileSync(p, "utf8");
const count = (s.match(/<\/motion\.motion.div>/g) || []).length;
s = s.replace(/<\/motion\.div>/g, "</div>");
fs.writeFileSync(p, s);
console.log("replaced closing tags:", count);
