const sharp = require("sharp");
const path = require("path");

const WIDTH = 1080;
const HEIGHT = 760;

const ARROW_COLOR = "#4a9eff";

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f0f0f0;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- "Drag to Applications" text -->
  <text x="${WIDTH / 2}" y="160"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="36"
        font-weight="500"
        fill="#333333"
        text-anchor="middle">
    Drag to Applications
  </text>

  <!-- Arrow (positioned between icons at 2x scale: app at 280, apps folder at 800) -->
  <g transform="translate(${WIDTH / 2}, 380)">
    <!-- Arrow line -->
    <line x1="-80" y1="0" x2="60" y2="0" stroke="${ARROW_COLOR}" stroke-width="6" stroke-linecap="round"/>
    <!-- Arrow head -->
    <polygon points="60,-16 95,0 60,16" fill="${ARROW_COLOR}"/>
  </g>

  <!-- Subtle bottom text -->
  <text x="${WIDTH / 2}" y="${HEIGHT - 50}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="24"
        fill="#999999"
        text-anchor="middle">
    Docora
  </text>
</svg>
`;

async function generateBackground() {
  const outputPath = path.join(__dirname, "..", "assets", "dmg-background.png");

  await sharp(Buffer.from(svg)).png().toFile(outputPath);

  console.log(`DMG background generated at: ${outputPath}`);
}

generateBackground().catch(console.error);
