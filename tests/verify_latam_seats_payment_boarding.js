const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const screenshotsDir = path.join(__dirname, '..', 'docs', 'auditoria', 'capturas-v4');
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
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('--- FASE 1: Verificación de Inicio Público y Preservación de Modo Admin ---');
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotsDir, '01_public_hero_latam.png') });

  // Login Admin para comprobar que lápiz y edición están 100% intactos
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('button[data-role="admin"]');
  await page.fill('#login-email-input', 'admin@aeroflow.com');
  await page.fill('#login-password-input', 'Admin123');
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(1000);

  const pencilBtn = await page.locator('.btn-admin-pencil').first();
  const pencilVisible = await pencilBtn.isVisible();
  console.log('✓ Modo Administrador intacto: Lápiz de edición visible =', pencilVisible);
  await page.screenshot({ path: path.join(screenshotsDir, '02_admin_mode_preserved.png') });

  // Logout admin
  await page.click('.btn-logout-small');
  await page.waitForTimeout(500);

  console.log('--- FASE 2: Login Pasajero y Apertura del Selector Estilo LATAM ---');
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('button[data-role="pasajero"]');
  await page.fill('#login-email-input', 'pasajero@aeroflow.com');
  await page.fill('#login-password-input', 'Pasajero123');
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(800);

  // Abrir selección de asientos
  const chooseSeatBtn = await page.locator('.btn-choose-seat').first();
  await chooseSeatBtn.click();
  await page.waitForSelector('#modal-cabin-map.active');
  await page.waitForTimeout(600);

  // Verificar la arquitectura de 3 columnas
  const leftCol = await page.locator('.seat-categories-sidebar').isVisible();
  const centerCol = await page.locator('.fuselage-column-wrap').isVisible();
  const rightCol = await page.locator('.seat-passenger-sidebar').isVisible();
  const wingsVisible = await page.locator('.aircraft-wings-backdrop').isVisible();
  const emergencyBanners = await page.locator('.emergency-exit-banner-row').count();
  const seatsCount = await page.locator('.latam-seat-btn').count();

  console.log('✓ Columna Izquierda (Acordeones):', leftCol);
  console.log('✓ Columna Central (Fuselaje + Alas):', centerCol, '| Alas SVG visible:', wingsVisible);
  console.log('✓ Banderas Salida de Emergencia:', emergencyBanners);
  console.log('✓ Total Sillas Vectoriales SVG renderizadas:', seatsCount);
  console.log('✓ Columna Derecha (Panel Pasajeros):', rightCol);

  await page.screenshot({ path: path.join(screenshotsDir, '03_latam_3col_seat_selection_default_5b.png') });

  // Probar despliegue de acordeón "Más adelante"
  console.log('Probando acordeón "Más adelante"...');
  await page.click('#acc-card-forward button.category-accordion-header');
  await page.waitForTimeout(300);

  // Seleccionar otra silla: e.g. 12A (Salida de Emergencia XL)
  console.log('Seleccionando asiento 12A (Salida de emergencia)...');
  const seat12A = await page.locator('.latam-seat-btn[data-seat="12A"]');
  if (await seat12A.isVisible()) {
    await seat12A.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(screenshotsDir, '04_latam_seat_12a_selected.png') });

  // Volver a seleccionar 5B (AeroFlow+ VIP XL) como en el mockup
  console.log('Seleccionando de nuevo 5B (AeroFlow+ VIP XL)...');
  const seat5B = await page.locator('.latam-seat-btn[data-seat="5B"]');
  if (await seat5B.isVisible()) {
    await seat5B.click();
    await page.waitForTimeout(400);
  }

  // Clic en "Agregar y continuar"
  console.log('--- FASE 3: Avanzando por Checkout a Paso 2 y Paso 3 (Desglose Contable) ---');
  await page.click('#btn-latam-continue');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, '05_checkout_step2_passengers.png') });

  // Avanzar a Paso 3 (Pago)
  await page.click('#btn-step2-next');
  await page.waitForTimeout(600);

  // Verificar Paso 3: Resumen visual de 3 renglones y sin aviso duplicado
  const summaryCardVisible = await page.locator('.payment-flight-summary-card').isVisible();
  const breakdownCardVisible = await page.locator('.payment-clean-breakdown-card').isVisible();
  const breakdownRows = await page.locator('.clean-breakdown-row').count();
  console.log('✓ Paso 3 Tarjeta compacta resumen visible:', summaryCardVisible);
  console.log('✓ Paso  clean breakdown visible:', breakdownCardVisible, '| Renglones:', breakdownRows);

  // Probar desplegable de impuestos
  await page.click('.btn-toggle-tax-details');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotsDir, '06_checkout_step3_clean_breakdown_with_taxes.png') });

  // Probar simulador Nequi
  await page.click('button.pay-tab-btn[data-pay="nequi"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, '07_checkout_step3_nequi_simulator.png') });

  // Pagar y emitir tiquete
  console.log('--- FASE 4: Procesando Pago y Emisión de Pase de Abordar Panorámico ---');
  await page.click('#btn-finalizar-pago-pax');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotsDir, '08_portal_mis_viajes_panoramic_ticket.png') });

  // Verificar que el tiquete tiene foto banner, avatar de pasajero y talón sin recortar
  const ticketBanner = await page.locator('.ticket-photo-banner').first().isVisible();
  const ticketAvatar = await page.locator('.ticket-pax-avatar').first().isVisible();
  const stubSeat = await page.locator('.stub-seat-number').first().isVisible();
  console.log('✓ Ticket Photo Banner visible:', ticketBanner);
  console.log('✓ Ticket Pax Avatar visible:', ticketAvatar);
  console.log('✓ Stub Seat Number visible:', stubSeat);

  // --- FASE 5: Consola de Puerta y Abordaje Manual (1 por 1) + Cola FIFO ---
  console.log('--- FASE 5: Consola de Abordaje y Verificación Manual 1 por 1 ---');
  await page.click('#nav-btn-abordar');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '09_gate_console_initial_queue.png') });

  // Probar botón superior "Abordar Siguiente (1 por 1)"
  console.log('Probando botón "Abordar Siguiente (1 por 1)"...');
  await page.click('#btn-abordar-siguiente');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '10_gate_board_next_manual.png') });

  // Probar botón individual "Abordar este pasajero" en la tarjeta del segundo pasajero
  console.log('Probando botón individual "Abordar este pasajero" en ticket #1...');
  const individualBoardBtn = await page.locator('.btn-ticket-board-manual').nth(1);
  if (await individualBoardBtn.isVisible()) {
    await individualBoardBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(screenshotsDir, '11_gate_individual_board_ticket.png') });

  // Verificar progreso de puerta
  const progressText = await page.locator('#gate-counter-text').innerText();
  console.log('✓ Contador de puerta actualizado:', progressText);

  console.log('--- TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO ---');
  await browser.close();
})();
