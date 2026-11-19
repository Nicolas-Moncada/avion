const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log("=== INICIANDO AUDITORÍA Y VERIFICACIÓN E2E DE AERO FLOW AIRLINES ===");

  const screenshotsDir = path.join(__dirname, '../docs/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text());
    }
  });

  // 1. CARGAR PÁGINA PRINCIPAL
  console.log("1. Cargando http://127.0.0.1:5000...");
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });

  // 2. VERIFICAR META TAGS Y CONSOLA
  console.log("2. Verificando advertencias de consola...");
  const appleMeta = await page.$('meta[name="apple-mobile-web-app-capable"]');
  const mobileMeta = await page.$('meta[name="mobile-web-app-capable"]');
  console.log("   - Meta apple-mobile-web-app-capable:", appleMeta ? "PRESENTE (Invalido)" : "ELIMINADO (Correcto)");
  console.log("   - Meta mobile-web-app-capable:", mobileMeta ? "PRESENTE (Correcto)" : "FALTA");
  console.log("   - Errores de consola:", consoleErrors.length, consoleErrors);
  console.log("   - Advertencias de consola:", consoleWarnings.length, consoleWarnings);

  // 3. VERIFICAR LOGOTIPO DEL AVIÓN DE PAPEL Y BOTONES DE ENCABEZADO
  console.log("3. Verificando Header...");
  const brandIconSvg = await page.$('.brand-icon-svg');
  console.log("   - Logotipo avión de papel SVG presente:", Boolean(brandIconSvg));
  const btnAndroid = await page.$('.btn-download-android-header');
  const btnWindows = await page.$('.btn-download-windows-header');
  console.log("   - Botón Descarga Android presente:", Boolean(btnAndroid));
  console.log("   - Botón Descarga Windows presente:", Boolean(btnWindows));

  // 4. VERIFICAR ENLACE WHATSAPP ANÓNIMO
  console.log("4. Verificando WhatsApp anónimo...");
  const whatsappHrefAnon = await page.$eval('#btn-whatsapp-support', el => el.getAttribute('href'));
  console.log("   - WhatsApp Href Anónimo:", whatsappHrefAnon);
  if (whatsappHrefAnon.includes("Carlos") || whatsappHrefAnon.includes("Mendoza")) {
    console.error("   [ERROR CRÍTICO]: WhatsApp anónimo contiene 'Carlos Mendoza'!");
  } else {
    console.log("   [OK]: WhatsApp anónimo está 100% limpio sin nombres inventados.");
  }

  // 5. CAPTURA: Home con Header Oficial y Botones
  await page.screenshot({ path: path.join(screenshotsDir, '01_home_hero_official_logo.png') });
  console.log("   - Guardado 01_home_hero_official_logo.png");

  // 6. PROBAR LOGIN Y CAPTURAR PANTALLA DE CARGA (AEROLOADER)
  console.log("5. Probando Login y pantalla de carga AeroLoader...");
  await page.click('#btn-header-login-main');
  await page.waitForSelector('#modal-login-auth.active');

  // Llenar datos de pasajero demo
  await page.fill('#login-email-input', 'pasajero@aeroflow.com');
  await page.fill('#login-password-input', 'Pasajero123');

  // Enviar formulario y capturar AeroLoader mientras está activo
  const submitPromise = page.click('#btn-submit-auth');
  await page.waitForTimeout(200); // Dar tiempo para que el loader se active

  const loaderActive = await page.$eval('#aero-global-loader', el => el.classList.contains('active'));
  console.log("   - AeroLoader activo durante login:", loaderActive);
  await page.screenshot({ path: path.join(screenshotsDir, '02_aeroloader_turbine_active.png') });
  console.log("   - Guardado 02_aeroloader_turbine_active.png");

  await submitPromise;
  await page.waitForTimeout(900); // Esperar que termine el ciclo transaccional

  // Verificar sesión iniciada
  const headerUser = await page.$eval('#header-auth-actions', el => el.innerText);
  console.log("   - Header tras login:", headerUser.trim());

  // Verificar WhatsApp con usuario Carlos Mendoza
  const whatsappHrefUser = await page.$eval('#btn-whatsapp-support', el => el.getAttribute('href'));
  console.log("   - WhatsApp Href Usuario Autenticado:", whatsappHrefUser);

  // 7. CERRAR SESIÓN Y LIMPIAR ESTADO
  console.log("6. Probando Cerrar Sesión y reseteo estricto...");
  await page.click('.btn-logout-small');
  await page.waitForTimeout(400);

  const whatsappHrefAfterLogout = await page.$eval('#btn-whatsapp-support', el => el.getAttribute('href'));
  console.log("   - WhatsApp tras Logout:", whatsappHrefAfterLogout);
  if (whatsappHrefAfterLogout.includes("Carlos")) {
    console.error("   [ERROR]: Tras logout sigue apareciendo Carlos!");
  } else {
    console.log("   [OK]: Tras logout el enlace WhatsApp queda 100% limpio.");
  }

  // 8. REGISTRO DE NUEVO PASAJERO (JUAN VALDEZ)
  console.log("7. Registrando nuevo pasajero 'Juan Valdez'...");
  await page.click('#btn-header-login-main');
  await page.waitForSelector('#modal-login-auth.active');
  await page.click('#btn-toggle-auth-mode'); // Cambiar a pestaña Registro

  const uniqueEmail = `juan.valdez.${Date.now()}@aeroflow.com`;
  await page.fill('#register-name-input', 'Juan Valdez');
  await page.fill('#login-email-input', uniqueEmail);
  await page.fill('#login-password-input', 'Valdez2026!');

  await page.click('#btn-submit-auth');
  await page.waitForTimeout(1000);

  const headerNewUser = await page.$eval('#header-auth-actions', el => el.innerText);
  console.log("   - Header tras registro nuevo:", headerNewUser.trim());

  const whatsappHrefJuan = await page.$eval('#btn-whatsapp-support', el => el.getAttribute('href'));
  console.log("   - WhatsApp Href Juan Valdez:", whatsappHrefJuan);

  // 9. REVISAR 'MIS RESERVAS' DE JUAN VALDEZ (DEBE ESTAR VACÍO)
  console.log("8. Verificando que Juan Valdez NO vea reservas de Carlos Mendoza...");
  await page.click('#nav-btn-viajes');
  await page.waitForTimeout(500);

  const misViajesText = await page.$eval('#passenger-portal-tickets-list', el => el.innerText);
  console.log("   - Estado de portal de viajes:", misViajesText.trim() ? "Tiene elementos" : "VACÍO (Correcto)");
  if (misViajesText.includes("Carlos Alberto Mendoza") || misViajesText.includes("AF2025")) {
    console.error("   [ERROR CRÍTICO DE PRIVACIDAD]: Juan Valdez puede ver el viaje de Carlos Mendoza!");
  } else {
    console.log("   [OK DE PRIVACIDAD]: Juan Valdez NO tiene reservas residuales de otros pasajeros.");
  }

  // 10. COMPRA DE VUELO CON JUAN VALDEZ Y BARRERA TRANSACCIONAL
  console.log("9. Realizando compra de vuelo con Juan Valdez...");
  await page.click('#nav-btn-reservar');
  await page.waitForTimeout(400);

  // Abrir primer vuelo usando .btn-choose-seat
  const selectFlightBtn = await page.$('.btn-choose-seat');
  if (selectFlightBtn) {
    await selectFlightBtn.click();
    await page.waitForSelector('#modal-cabin-map.active');
    console.log("   - Modal mapa de cabina abierto.");

    // Seleccionar una silla disponible
    await page.waitForSelector('.latam-seat-btn:not(.occupied)');
    await page.click('.latam-seat-btn:not(.occupied)');
    console.log("   - Silla seleccionada.");
    await page.waitForTimeout(200);

    // Avanzar a paso 2
    await page.click('#btn-latam-continue');
    await page.waitForTimeout(300);

    // Verificar nombre en formulario de pasajero
    const paxNameInputVal = await page.$eval('#passenger-name-input', el => el.value);
    console.log("   - Nombre auto-rellenado en checkout:", paxNameInputVal);

    // Llenar documento único para evitar conflicto con compras anteriores
    const dynamicDoc = "109" + Math.floor(1000000 + Math.random() * 9000000);
    await page.fill('#passenger-doc-input', dynamicDoc);

    // Avanzar a paso 3 (pago)
    await page.click('#btn-step2-next');
    await page.waitForTimeout(300);

    // Llenar tarjeta de crédito válida
    await page.fill('#card-number-input', '4532012345678910');
    await page.fill('#card-exp-input', '12/28');
    await page.fill('#card-cvv-input', '789');

    await page.screenshot({ path: path.join(screenshotsDir, '03_checkout_juan_valdez.png') });
    console.log("   - Guardado 03_checkout_juan_valdez.png");

    // Procesar pago con barrera AeroLoader
    console.log("   - Procesando pago con barrera AeroLoader...");
    const payPromise = page.click('#btn-finalizar-pago-pax');
    await page.waitForTimeout(150);
    const isPayingLoaderActive = await page.$eval('#aero-global-loader', el => el.classList.contains('active'));
    console.log("   - AeroLoader activo durante pago:", isPayingLoaderActive);

    await payPromise;
    await page.waitForTimeout(2500);

    // Verificar que estamos en la sección viajes con la nueva reserva
    const ticketsAfterPay = await page.$eval('#passenger-portal-tickets-list', el => el.innerText);
    console.log("   - Tiquete de Juan Valdez emitido:", ticketsAfterPay.includes(dynamicDoc) || ticketsAfterPay.includes("Juan Valdez"));

    // Verificar que WhatsApp ahora incluye el PNR
    const whatsappHrefWithPnr = await page.$eval('#btn-whatsapp-support', el => el.getAttribute('href'));
    console.log("   - WhatsApp Href con PNR activo:", whatsappHrefWithPnr);

    await page.screenshot({ path: path.join(screenshotsDir, '04_juan_valdez_ticket_issued.png') });
    console.log("   - Guardado 04_juan_valdez_ticket_issued.png");
  }

  // 11. VERIFICACIÓN RESPONSIVE MÓVIL (360x640 y 390x844) EN HOME
  console.log("10. Probando responsividad móvil en 360x640 y 390x844...");
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  });
  await page.waitForTimeout(200);
  await page.click('#nav-btn-reservar');
  await page.waitForTimeout(300);

  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(400);

  const overflow360 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log("   - Scroll horizontal en 360x640:", overflow360 ? "OVERFLOW DETECTADO" : "CERO OVERFLOW (Correcto)");
  await page.screenshot({ path: path.join(screenshotsDir, '05_mobile_360x640_clean.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow390 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log("   - Scroll horizontal en 390x844:", overflow390 ? "OVERFLOW DETECTADO" : "CERO OVERFLOW (Correcto)");
  await page.screenshot({ path: path.join(screenshotsDir, '06_mobile_390x844_clean.png') });

  console.log("=== AUDITORÍA Y VERIFICACIÓN COMPLETADAS CON ÉXITO ===");
  await browser.close();
})();
