const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const screenshotsDir = path.join(__dirname, '..', 'docs', 'auditoria', 'capturas-v2');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('1. Cargando pagina principal pública...');
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotsDir, '01_public_hero_catalog.png') });

  console.log('2. Iniciando sesión como Administrador...');
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('button[data-role="admin"]');
  await page.fill('#login-email-input', 'admin@aeroflow.com');
  await page.fill('#login-password-input', 'Admin123');
  await page.click('#form-login-auth button[type="submit"]');

  await page.waitForTimeout(1000);
  console.log('3. Verificando que aparecieron los botones de Lápiz y la tarjeta de Crear Vuelo...');
  const createCardVisible = await page.isVisible('.card-create-flight-admin');
  console.log('Tarjeta Crear Vuelo visible:', createCardVisible);
  await page.screenshot({ path: path.join(screenshotsDir, '02_admin_mode_cards_pencil.png') });

  console.log('4. Abriendo Editor de Vuelo con el lápiz...');
  await page.click('.btn-admin-pencil');
  await page.waitForSelector('#modal-admin-editor-vuelo.active');
  await page.screenshot({ path: path.join(screenshotsDir, '03_admin_flight_editor_modal.png') });

  console.log('5. Cerrando editor y cerrando sesión admin...');
  await page.click('#modal-admin-editor-vuelo .modal-close-btn');
  await page.waitForTimeout(500);
  await page.click('.btn-logout-small');
  await page.waitForTimeout(500);

  console.log('6. Iniciando sesión como Pasajero...');
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('button[data-role="pasajero"]');
  await page.fill('#login-email-input', 'pasajero@aeroflow.com');
  await page.fill('#login-password-input', 'Pasajero123');
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(800);

  console.log('7. Abriendo mapa vectorial de cabina...');
  const firstChooseSeatBtn = await page.locator('.btn-choose-seat').first();
  await firstChooseSeatBtn.click();
  await page.waitForSelector('#modal-cabin-map.active');
  await page.screenshot({ path: path.join(screenshotsDir, '04_cabin_vector_seats_vip_eco.png') });

  console.log('8. Seleccionando poltrona VIP 1A...');
  const seat1A = await page.locator('.seat-vip-btn[data-seat="1A"]').first();
  if (await seat1A.isVisible()) {
    await seat1A.click();
  }
  await page.waitForTimeout(400);

  console.log('9. Probando pestañas de pago (PSE y Nequi)...');
  await page.click('.pay-tab-btn[data-pay="nequi"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, '05_payment_nequi_simulator.png') });

  console.log('10. Pagando y emitiendo tiquete...');
  await page.click('.btn-confirm-pay');
  await page.waitForSelector('#modal-mis-reservas.active');
  await page.screenshot({ path: path.join(screenshotsDir, '06_boarding_pass_with_barcode.png') });

  console.log('11. Ejecutando abordaje con sonido Web Audio API...');
  const boardBtn = await page.locator('.btn-board-flight').first();
  await boardBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotsDir, '07_boarding_pass_boarded_status.png') });

  console.log('¡Pruebas end-to-end con Edge completadas exitosamente!');
  await browser.close();
})();
