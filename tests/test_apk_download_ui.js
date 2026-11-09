const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = 'C:/Users/nicol/.gemini/antigravity/brain/b5844ad2-48ea-4d4e-acc4-aaca090a2361/screenshots_v7';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

(async () => {
  console.log('🚀 Iniciando verificación de botones de descarga de APK...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  const page = await context.newPage();

  // 1. Cargar la página principal
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle' });
  console.log('✅ Página principal cargada.');

  // 2. Verificar botón en la cabecera (Header)
  const headerBtn = page.locator('.btn-download-apk-header');
  await headerBtn.waitFor({ state: 'visible', timeout: 5000 });
  const headerHref = await headerBtn.getAttribute('href');
  console.log(`✅ Botón en Header encontrado: href="${headerHref}"`);

  // 3. Verificar Banner Hero de APK
  const heroCard = page.locator('.apk-download-hero-card');
  await heroCard.waitFor({ state: 'visible', timeout: 5000 });
  const mainBtn = page.locator('.btn-download-apk-main');
  const mainHref = await mainBtn.getAttribute('href');
  console.log(`✅ Banner Hero encontrado: href="${mainHref}"`);

  // Captura del header
  const headerElem = page.locator('.minimal-header');
  await headerElem.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_header_apk_button.png') });

  // Captura del banner hero
  await heroCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await heroCard.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_apk_hero_banner.png') });

  // Captura de página completa desktop
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_desktop_fullpage.png'), fullPage: true });

  // 4. Probar descarga real haciendo clic en el botón
  console.log('⏳ Probando evento de descarga al hacer clic en el botón...');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    mainBtn.click()
  ]);

  const suggestedFilename = download.suggestedFilename();
  console.log(`📦 Archivo sugerido de descarga: ${suggestedFilename}`);

  const downloadPath = path.join(SCREENSHOTS_DIR, suggestedFilename);
  await download.saveAs(downloadPath);

  const stats = fs.statSync(downloadPath);
  console.log(`✅ Descarga completada con éxito. Tamaño descargado: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  if (stats.size < 1000000) {
    throw new Error(`El archivo descargado parece incompleto: ${stats.size} bytes`);
  }

  // 5. Probar vista móvil
  console.log('📱 Probando adaptación responsiva móvil (390x844)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_mobile_apk_banner.png') });

  console.log('🎉 Todas las verificaciones de descarga de APK concluyeron con ÉXITO!');
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('❌ Error en test de descarga de APK:', err);
  process.exit(1);
});
