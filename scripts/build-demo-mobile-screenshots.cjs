/**
 * Redact personal text on marketing screenshots → "Demo" labels.
 * Output: website/assets/mobile-demo/*.png
 *
 *   node scripts/build-demo-mobile-screenshots.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "website", "assets", "mobile-demo");
const srcDir = path.join(root, "website", "assets", "mobile-demo-src");

const staffNameRows = [];
for (let y = 112; y <= 508; y += 36) {
  staffNameRows.push([108, y, 152, 30]);
}

/** Top app bar — company name + profile photo (524×1024 mobile shots). */
const mobileCompanyBar = [82, 38, 286, 38];
const mobileProfilePic = [442, 32, 76, 76];

/** Desktop chrome — company label, top profile, sidebar account block. */
const pcSidebarCompany = [44, 46, 136, 34];
const pcSidebarProfile = [4, 588, 210, 68];
const pcTopProfilePic = [954, 2, 62, 62];
const pcTopCompanyPicker = [518, 2, 224, 34];

const sources = [
  {
    out: "01-daybook.png",
    src: path.join(srcDir, "daybook-src.png"),
    boxes: [
      mobileCompanyBar,
      mobileProfilePic,
      [188, 426, 310, 34],
      [18, 464, 488, 38],
      [18, 524, 190, 26],
      [188, 568, 320, 34],
      [18, 606, 488, 38],
      [18, 666, 190, 26],
      [12, 772, 340, 44],
    ],
  },
  {
    out: "02-parties.png",
    src: path.join(srcDir, "parties-src.png"),
    boxes: [
      mobileCompanyBar,
      mobileProfilePic,
      [92, 138, 278, 34],
      [92, 182, 278, 34],
      [92, 226, 278, 34],
      [92, 270, 278, 34],
      [92, 314, 278, 34],
      [92, 358, 278, 34],
      [92, 402, 278, 34],
      [92, 446, 278, 34],
      [92, 490, 278, 34],
      [92, 534, 278, 34],
      [92, 578, 278, 34],
      [92, 622, 278, 34],
      [92, 666, 278, 34],
      [92, 710, 278, 34],
      [92, 754, 278, 34],
    ],
  },
  {
    out: "03-party-detail.png",
    src: path.join(srcDir, "party-detail-src.png"),
    boxes: [
      mobileCompanyBar,
      mobileProfilePic,
      [48, 122, 420, 50],
      [40, 214, 292, 38],
      [18, 302, 360, 32],
      [268, 372, 232, 26],
      [18, 392, 360, 32],
      [268, 462, 232, 26],
      [18, 484, 360, 32],
      [268, 554, 232, 26],
      [18, 576, 360, 32],
      [268, 646, 232, 26],
    ],
  },
  {
    out: "04-pc-dashboard.png",
    src: path.join(srcDir, "pc-dashboard-src.png"),
    boxes: [
      pcSidebarCompany,
      pcSidebarProfile,
      pcTopProfilePic,
      [248, 548, 390, 42],
    ],
  },
  {
    out: "05-pc-staff.png",
    src: path.join(srcDir, "pc-staff-src.png"),
    boxes: [
      pcSidebarCompany,
      pcSidebarProfile,
      pcTopProfilePic,
      pcTopCompanyPicker,
      ...staffNameRows,
      [388, 102, 270, 38],
      [668, 168, 92, 420],
    ],
  },
];

function demoSvg(width, height, boxes) {
  const labels = boxes
    .map(([x, y, w, h]) => {
      const font = Math.max(11, Math.min(18, Math.round(h * 0.52)));
      const cx = x + w / 2;
      const cy = y + h / 2 + font * 0.34;
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(8, h / 3)}" fill="#f4f8fd" fill-opacity="0.97" stroke="#d7e0ea" stroke-width="1"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${font}" font-weight="700" fill="#0b1f3a">Demo</text>
      `;
    })
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels}</svg>`
  );
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const item of sources) {
    if (!fs.existsSync(item.src)) {
      console.warn("[demo-screens] missing source:", item.src);
      continue;
    }
    const meta = await sharp(item.src).metadata();
    const overlay = demoSvg(meta.width, meta.height, item.boxes);
    const dest = path.join(outDir, item.out);
    await sharp(item.src).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(dest);
    console.log("[demo-screens] wrote", dest);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
