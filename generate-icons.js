const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'static/img/favicon.svg');
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  // Icono 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192.png'));
  console.log('✓ icon-192.png creado');

  // Icono 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512.png'));
  console.log('✓ icon-512.png creado');

  // Icono maskable 192x192 (con safe zone para máscara adaptativa)
  await sharp(svgBuffer)
    .resize(154, 154) // 80% de 192 para safe zone
    .extend({ top: 19, bottom: 19, left: 19, right: 19, background: '#0b1220' })
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable-192.png'));
  console.log('✓ icon-maskable-192.png creado');

  // Icono maskable 512x512
  await sharp(svgBuffer)
    .resize(410, 410) // 80% de 512 para safe zone
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: '#0b1220' })
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable-512.png'));
  console.log('✓ icon-maskable-512.png creado');

  console.log('\nTodos los íconos generados en:', iconsDir);
}

generateIcons().catch(err => {
  console.error('Error generando íconos:', err);
  process.exit(1);
});
