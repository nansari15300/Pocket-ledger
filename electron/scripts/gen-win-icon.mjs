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
const sizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = [];
for (const size of sizes) {
  const img = base.clone();
  img.resize({ w: size, h: size });
  pngBuffers.push(await img.getBuffer("image/png"));
}

const icoBuf = await pngToIco(pngBuffers);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(icoPath, icoBuf);
console.log("Wrote", icoPath);
