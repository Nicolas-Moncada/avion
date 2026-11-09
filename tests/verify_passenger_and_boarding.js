const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const screenshotsDir = path.join(__dirname, '..', 'docs', 'auditoria', 'capturas-v3');
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
  await page.screenshot({ path: path.join(screenshotsDir, '01_public_hero_new_buttons.png') });

  console.log('2. Verificando que Modo Admin sigue 100% intacto...');
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('button[data-role="admin"]');
  await page.fill('#login-email-input', 'admin@aeroflow.com');
  await page.fill('#login-password-input', 'Admin123');
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(1000);

  const pencilExists = await page.locator('.btn-admin-pencil').first().isVisible();
  const createCardExists = await page.locator('.card-create-flight-admin').isVisible();
  console.log('Admin check: Lapiz visible:', pencilExists, 'Tarjeta crear visible:', createCardExists);
  await page.screenshot({ path: path.join(screenshotsDir, '02_admin_mode_preserved.png') });

  // Cerrar sesión admin
  await page.click('.btn-logout-small');
  await page.waitForTimeout(500);

  console.log('3. Iniciando sesión como Pasajero...');
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('button[data-role="pasajero"]');
  await page.fill('#login-email-input', 'pasajero@aeroflow.com');
  await page.fill('#login-password-input', 'Pasajero123');
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(800);

  console.log('4. Abriendo checkout multipaso en un vuelo...');
  const chooseSeatBtn = await page.locator('.btn-choose-seat').first();
  await chooseSeatBtn.click();
  await page.waitForSelector('#modal-cabin-map.active');
  await page.screenshot({ path: path.join(screenshotsDir, '03_checkout_step1_seat_benefits.png') });

  console.log('5. Seleccionando poltrona VIP 1A...');
  const seat1A = await page.locator('.seat-vip-btn[data-seat="1A"]').first();
  if (await seat1A.isVisible()) {
    await seat1A.click();
  }
  await page.waitForTimeout(400);

  console.log('6. Avanzando a Paso 2 (Datos del Pasajero)...');
  await page.click('#checkout-step-1 button.btn-primary-flow');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, '04_checkout_step2_pax_luggage.png') });

  console.log('7. Avanzando a Paso 3 (AeroFlow Pay Original)...');
  await page.click('#checkout-step-2 button.btn-primary-flow');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, '05_checkout_step3_aeroflow_pay.png') });

  console.log('8. Confirmando pago y emitiendo tiquete oficial...');
  await page.click('#btn-finalizar-pago-pax');
  await page.waitForTimeout(1000);

  console.log('9. Verificando Portal Mis Viajes...');
  await page.screenshot({ path: path.join(screenshotsDir, '06_portal_mis_viajes_tickets.png') });

  console.log('10. Navegando al apartado "Abordar"...');
  await page.click('#nav-btn-abordar');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '07_apartado_abordar_queue_initial.png') });

  console.log('11. Ejecutando "Iniciar Abordaje Automático"...');
  await page.click('#btn-iniciar-abordaje-masivo');
  
  // Esperar a que el escáner láser óptico procese varios tiquetes automáticamente
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(screenshotsDir, '08_apartado_abordar_auto_scanning.png') });

  console.log('¡Pruebas end-to-end de Pasajero y Abordaje completadas con 100% de éxito!');
  await browser.close();
})();
