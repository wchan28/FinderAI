const sharp = require("sharp");
const path = require("path");

const WIDTH = 540;
const HEIGHT = 380;

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- Arrow -->
  <g transform="translate(270, 190)">
    <!-- Arrow line -->
    <line x1="-40" y1="0" x2="30" y2="0" stroke="#4a9eff" stroke-width="3" stroke-linecap="round"/>
    <!-- Arrow head -->
    <polygon points="30,-8 45,0 30,8" fill="#4a9eff"/>
  </g>

  <!-- "Drag to Applications" text -->
  <text x="${WIDTH / 2}" y="90"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="18"
        font-weight="500"
        fill="#ffffff"
        text-anchor="middle">
    Drag to Applications
  </text>

  <!-- Subtle bottom text -->
  <text x="${WIDTH / 2}" y="${HEIGHT - 30}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="12"
        fill="#888888"
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
