const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function getSvg(size, isMaskable = false) {
  const bgRadius = isMaskable ? 0 : Math.round(size * 0.22);
  const pad = isMaskable ? Math.round(size * 0.16) : Math.round(size * 0.12);
  const innerWidth = size - pad * 2;
  const scale = innerWidth / 100;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#070D18"/>
    </linearGradient>
    <linearGradient id="wingGradMaster" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="50%" stop-color="#1D4ED8"/>
      <stop offset="100%" stop-color="#0B192C"/>
    </linearGradient>
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#DA291C" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${bgRadius}" fill="url(#bgGrad)"/>
  <g transform="translate(${pad}, ${pad + (isMaskable ? 0 : size * 0.02)}) scale(${scale})">
    <g filter="url(#neonGlow)">
      <path d="M10 20 C25 15, 60 10, 85 45 C70 40, 50 42, 40 50 C55 46, 75 48, 88 65 C70 60, 45 62, 35 70 C50 68, 68 70, 78 78 C45 78, 20 65, 10 20 Z" fill="url(#wingGradMaster)"/>
      <path d="M30 68 C45 65, 65 67, 78 78 C55 78, 38 74, 30 68 Z" fill="#DA291C"/>
    </g>
    <!-- Speed Dots -->
    <circle cx="85" cy="45" r="3.5" fill="#38BDF8"/>
    <circle cx="88" cy="65" r="2.8" fill="#FFFFFF"/>
    <circle cx="78" cy="78" r="2.2" fill="#DA291C"/>
  </g>
</svg>`;
}

const icons = [
  { name: 'icon-192.svg', png: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.svg', png: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.svg', png: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.svg', png: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.svg', png: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon-32.svg', png: 'favicon-32.png', size: 32, maskable: false }
];

icons.forEach(icon => {
  const svgPath = path.join(iconsDir, icon.name);
  fs.writeFileSync(svgPath, getSvg(icon.size, icon.maskable), 'utf8');
});

console.log('SVGs created. Converting to PNG via Chrome headless...');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

icons.forEach(icon => {
  const svgPath = path.join(iconsDir, icon.name);
  const pngPath = path.join(iconsDir, icon.png);
  const htmlWrapper = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;"><img src="file://${svgPath.replace(/\\/g, '/')}" width="${icon.size}" height="${icon.size}" style="display:block;"/></body></html>`;
  const tempHtml = path.join(iconsDir, `_temp_${icon.size}.html`);
  fs.writeFileSync(tempHtml, htmlWrapper, 'utf8');

  try {
    execSync(`"${chromePath}" --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=${icon.size},${icon.size} --screenshot="${pngPath}" "file://${tempHtml.replace(/\\/g, '/')}"`);
    console.log(`Rendered ${icon.png} (${icon.size}x${icon.size})`);
  } catch (err) {
    console.error(`Error rendering ${icon.png}:`, err.message);
  } finally {
    if (fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml);
  }
});

console.log('Icon generation completed successfully.');

