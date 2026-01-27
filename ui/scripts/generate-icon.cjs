const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const sizes = [16, 32, 64, 128, 256, 512, 1024];

function createIconSVG(size) {
  const padding = size * 0.1;
  const circleRadius = (size - padding * 2) / 2;
  const centerX = size / 2;
  const centerY = size / 2;
  const fontSize = size * 0.55;

  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#5B7FFF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4361EE;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Blue circle background -->
  <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}" fill="url(#bg)"/>

  <!-- White "D" letter -->
  <text x="${centerX}" y="${centerY + fontSize * 0.35}"
        font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
        font-size="${fontSize}"
        font-weight="600"
        fill="#ffffff"
        text-anchor="middle">D</text>
</svg>
`;
}

async function generateIcons() {
  const iconsetDir = path.join(__dirname, "..", "public", "icon.iconset");

  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  console.log("Generating icon PNGs...");

  for (const size of sizes) {
    const svg = createIconSVG(size);
    const outputPath = path.join(iconsetDir, `icon_${size}x${size}.png`);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`  Generated ${size}x${size}`);

    if (size <= 512) {
      const retinaPath = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
      const retinaSvg = createIconSVG(size * 2);

      await sharp(Buffer.from(retinaSvg))
        .png()
        .toFile(retinaPath);

      console.log(`  Generated ${size}x${size}@2x`);
    }
  }

  const mainIconPath = path.join(__dirname, "..", "public", "icon.png");
  const svg512 = createIconSVG(512);
  await sharp(Buffer.from(svg512)).png().toFile(mainIconPath);
  console.log("Generated main icon.png (512x512)");

  console.log("\nNow run:");
  console.log("  iconutil -c icns ui/public/icon.iconset -o ui/public/icon.icns");
  console.log("\nFor Windows .ico, use an online converter or ImageMagick:");
  console.log("  convert ui/public/icon.iconset/icon_256x256.png ui/public/icon.ico");
}

generateIcons().catch(console.error);
