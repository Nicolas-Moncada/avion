const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '../docs/screenshots');

(async () => {
  console.log('=== INICIANDO GENERACIÓN DE LAS 10 CAPTURAS OFICIALES DEFINITIVAS ===');

  // 1. Limpieza de capturas viejas
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  } else {
    const files = fs.readdirSync(SCREENSHOTS_DIR);
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.webp')) {
        fs.unlinkSync(path.join(SCREENSHOTS_DIR, file));
        console.log(`Eliminado archivo antiguo: ${file}`);
      }
    }
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const contextDesktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5
  });
  const page = await contextDesktop.newPage();

  console.log('1. Navegando a http://127.0.0.1:5000...');
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });

  // Asegurar que las imágenes de ofertas cargaron
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('.offer-card-img'));
    return imgs.length >= 6 && imgs.every(img => img.complete && img.naturalWidth >= 800);
  }, { timeout: 10000 });

  // 01-portada-buscador.png
  console.log('Generando 01-portada-buscador.png...');
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '01-portada-buscador.png'),
    fullPage: false
  });

  // 02-ofertas-destinos-hd.png
  console.log('Generando 02-ofertas-destinos-hd.png...');
  await page.evaluate(() => {
    const el = document.getElementById('seccion-ofertas') || document.querySelector('.offers-grid-section');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '02-ofertas-destinos-hd.png'),
    fullPage: false
  });

  // 03-calendario-tarifario.png
  console.log('Generando 03-calendario-tarifario.png...');
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    AeroMinimalUI.abrirCalendarioTarifas('salida');
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '03-calendario-tarifario.png'),
    fullPage: false
  });
  await page.evaluate(() => {
    AeroMinimalUI.cerrarCalendarioTarifas();
  });
  await page.waitForTimeout(300);

  // 04-selector-asientos.png
  console.log('Generando 04-selector-asientos.png...');
  await page.evaluate(() => {
    AeroMinimalUI.abrirMapaCabina('AF2020');
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '04-selector-asientos.png'),
    fullPage: false
  });

  // 05-checkout-tarjeta-3d.png
  console.log('Generando 05-checkout-tarjeta-3d.png...');
  await page.evaluate(() => {
    AeroMinimalUI.seleccionarSillaLATAM('1A', 'vip', 'Ventana');
    AeroMinimalUI.avanzarPasoCheckout(2);
    AeroMinimalUI.avanzarPasoCheckout(3);
    const cardNum = document.getElementById('card-number-input');
    const cardExp = document.getElementById('card-exp-input');
    const cardHolder = document.getElementById('card-holder-input');
    if (cardNum) cardNum.value = '4532 0123 4567 8910';
    if (cardExp) cardExp.value = '12/28';
    if (cardHolder) cardHolder.value = 'CARLOS ALBERTO MENDOZA';
    AeroMinimalUI.alCambiarTarjetaCredito();
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '05-checkout-tarjeta-3d.png'),
    fullPage: false
  });
  await page.evaluate(() => {
    AeroMinimalUI.cerrarMapaCabina();
  });
  await page.waitForTimeout(300);

  // 06-mis-reservas-pase-abordar.png
  console.log('Generando 06-mis-reservas-pase-abordar.png...');
  await page.evaluate(async () => {
    AeroMinimalUI.abrirModalMisReservas();
  });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const input = document.getElementById('input-buscar-pnr');
    if (input) {
      input.value = 'AFC5DC';
      await AeroMinimalUI.buscarReservaPorPnrInput();
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '06-mis-reservas-pase-abordar.png'),
    fullPage: false
  });
  await page.evaluate(() => {
    AeroMinimalUI.cerrarModalMisReservas();
  });
  await page.waitForTimeout(300);

  // 07-consola-abordaje.png
  console.log('Generando 07-consola-abordaje.png...');
  await page.evaluate(() => {
    AeroMinimalUI.mostrarSeccion('abordar');
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '07-consola-abordaje.png'),
    fullPage: false
  });

  // 08-panel-admin.png (Panel de administración con KPIs SQL y desplegable dinámico de destinos)
  console.log('Generando 08-panel-admin.png...');
  await page.evaluate(() => {
    localStorage.setItem('aeroflow_sesion_activa', JSON.stringify({
      id: 'usr-adm-001',
      nombre: 'Administrador AeroFlow',
      email: 'admin@aeroflow.com',
      rol: 'admin'
    }));
  });
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    AeroMinimalUI.abrirEditorVuelo(null);
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '08-panel-admin.png'),
    fullPage: false
  });
  await page.evaluate(() => {
    AeroMinimalUI.cerrarEditorVuelo();
  });
  await page.waitForTimeout(300);

  // 09-tema-oscuro-y-loader.png
  console.log('Generando 09-tema-oscuro-y-loader.png...');
  await page.evaluate(() => {
    document.body.classList.add('dark-mode');
    if (window.AeroLoader) {
      window.AeroLoader.show('Sincronizando operaciones con torre de control...');
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '09-tema-oscuro-y-loader.png'),
    fullPage: false
  });
  await page.evaluate(() => {
    if (window.AeroLoader) window.AeroLoader.hide();
    document.body.classList.remove('dark-mode');
  });
  await page.waitForTimeout(300);

  await contextDesktop.close();

  // 10-vista-movil.png (390x844 responsive)
  console.log('Generando 10-vista-movil.png...');
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
  await pageMobile.waitForTimeout(800);
  await pageMobile.screenshot({
    path: path.join(SCREENSHOTS_DIR, '10-vista-movil.png'),
    fullPage: false
  });
  await contextMobile.close();

  await browser.close();

  // VALIDACIÓN OBLIGATORIA
  console.log('\n=== VALIDACIÓN DE LAS 10 CAPTURAS GENERADAS ===');
  const expectedFiles = [
    '01-portada-buscador.png',
    '02-ofertas-destinos-hd.png',
    '03-calendario-tarifario.png',
    '04-selector-asientos.png',
    '05-checkout-tarjeta-3d.png',
    '06-mis-reservas-pase-abordar.png',
    '07-consola-abordaje.png',
    '08-panel-admin.png',
    '09-tema-oscuro-y-loader.png',
    '10-vista-movil.png'
  ];

  let passed = true;
  for (const f of expectedFiles) {
    const fullPath = path.join(SCREENSHOTS_DIR, f);
    if (!fs.existsSync(fullPath)) {
      console.error(`[FAIL] Falta el archivo: ${f}`);
      passed = false;
      continue;
    }
    const stat = fs.statSync(fullPath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    if (stat.size < 20 * 1024) {
      console.error(`[FAIL] ${f} es demasiado pequeño (${sizeKB} KB < 20 KB)`);
      passed = false;
    } else {
      console.log(`[PASS] ${f} (${sizeKB} KB) OK`);
    }
  }

  if (passed) {
    console.log('\n=== LAS 10 CAPTURAS FUERON GENERADAS Y VALIDADAS CON ÉXITO (100%) ===');
  } else {
    process.exit(1);
  }
})();
