/**
 * NSIS / makensis sirf .ico installer icons maanta hai — PNG se Windows ICO banata hai (build pipeline).
 * Bada PNG direct png-to-ico me crash ho sakta hai; pehle choti sizes (256/48) par resize.
 * Run: node scripts/gen-win-icon.mjs (electron folder se)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Jimp } from "jimp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.join(__dirname, "..");
const pngPath = path.join(electronRoot, "..", "public", "app-icon.png");
const outDir = path.join(electronRoot, "build");
const icoPath = path.join(outDir, "icon.ico");

const base = await Jimp.read(pngPath);
// Taskbar / installer: 256 + chota slot NSIS/MUI ke liye
base.resize({ w: 256, h: 256 });
const buf256 = await base.getBuffer("image/png");
const small = base.clone();
small.resize({ w: 48, h: 48 });
const buf48 = await small.getBuffer("image/png");

const icoBuf = await pngToIco([buf48, buf256]);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(icoPath, icoBuf);
console.log("Wrote", icoPath);
