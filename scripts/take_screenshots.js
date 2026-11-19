const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE:', msg.text()));

  console.log('Navigating to http://127.0.0.1:5000...');
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });

  // 1. Home Hero
  console.log('Capturing 01_home_hero_windows.png...');
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/01_home_hero_windows.png'), fullPage: false });

  // 2. Admin Flight Editor
  console.log('Configuring admin session...');
  await page.evaluate(() => {
    localStorage.setItem('aeroflow_sesion_activa', JSON.stringify({
      id: 'usr-adm-001',
      nombre: 'Administrador AeroFlow',
      email: 'admin@aeroflow.com',
      rol: 'admin'
    }));
  });
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });

  console.log('Opening Admin Flight Editor...');
  await page.evaluate(() => {
    AeroMinimalUI.abrirEditorVuelo(null);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/02_admin_destination_dropdown.png') });

  // Cerrar editor
  await page.evaluate(() => {
    AeroMinimalUI.cerrarEditorVuelo();
  });
  await page.waitForTimeout(300);

  // 3. LATAM Fuselage Cabin Map
  console.log('Opening LATAM Fuselage Cabin Map for flight AF2020...');
  await page.evaluate(() => {
    AeroMinimalUI.abrirMapaCabina('AF2020');
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/03_seat_selection_fuselage.png') });

  // 4. Checkout step 3 (3D Card)
  console.log('Navigating to checkout step 3 (3D Card)...');
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
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/04_checkout_3d_card.png') });

  // Cerrar checkout modal
  await page.evaluate(() => {
    AeroMinimalUI.cerrarMapaCabina();
  });
  await page.waitForTimeout(300);

  // 5. Gate Boarding Console
  console.log('Opening Gate Boarding Console...');
  await page.evaluate(() => {
    AeroMinimalUI.mostrarSeccion('abordar');
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/05_boarding_console_sound.png') });

  // 6. Boarding Pass with QR & Linear Barcode in "Mis Reservas"
  console.log('Opening Mis Reservas / Boarding Pass with active PNR AFC5DC...');
  await page.evaluate(async () => {
    AeroMinimalUI.abrirModalMisReservas();
  });
  await page.waitForTimeout(600);

  await page.evaluate(async () => {
    const input = document.getElementById('input-buscar-pnr');
    if (input) {
      input.value = 'AFC5DC';
      await AeroMinimalUI.buscarReservaPorPnrInput();
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/06_boarding_pass_qr.png') });

  console.log('All screenshots captured successfully in docs/screenshots/!');
  await browser.close();
  process.exit(0);
})();
