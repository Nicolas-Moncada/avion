const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  console.log(
    "=== INICIANDO AUDITORÍA Y VERIFICACIÓN INTEGRAL E2E DE AERO FLOW AIRLINES ===",
  );

  const screenshotsDir = path.join(__dirname, "../docs/screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath:
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    } else if (msg.type() === "warning") {
      consoleWarnings.push(msg.text());
    }
  });

  page.on("response", (res) => {
    const status = res.status();
    const url = res.url();
    // Filtrar favicon u otros recursos no críticos si aplican
    if (status >= 400 && !url.includes("favicon.ico")) {
      networkErrors.push({ status, url });
    }
  });

  // 1. CARGAR PÁGINA PRINCIPAL
  console.log("1. Cargando http://127.0.0.1:5000...");
  await page.goto("http://127.0.0.1:5000", { waitUntil: "networkidle" });

  // 2. VERIFICAR LOGOTIPO DEL AVIÓN DE PAPEL Y BOTONES DE ENCABEZADO
  console.log("2. Verificando Header y Logotipo animado...");
  const brandIconSvg = await page.$(".brand-icon-svg");
  console.log(
    "   - Logotipo avión de papel SVG presente:",
    Boolean(brandIconSvg),
  );

  // Verificar animación CSS de planeo
  const animStyles = await page.evaluate(() => {
    const el = document.querySelector(".brand-icon-svg");
    if (!el) return null;
    const computed = window.getComputedStyle(el);
    return {
      animationName: computed.animationName,
      willChange: computed.willChange,
      stroke: computed.stroke,
    };
  });
  console.log("   - Estilos y aceleración GPU del logo:", animStyles);

  // Verificar botones de descarga en header: solo iconos, sin texto
  const windowsBtnText = await page.$eval(".btn-download-windows-header", (el) => el.innerText.trim());
  const androidBtnText = await page.$eval(".btn-download-android-header", (el) => el.innerText.trim());
  console.log("   - Texto botón Windows en header (debe ser vacío):", JSON.stringify(windowsBtnText));
  console.log("   - Texto botón Android en header (debe ser vacío):", JSON.stringify(androidBtnText));

  await page.screenshot({
    path: path.join(screenshotsDir, "01_home_paper_plane_logo.png"),
  });
  console.log("   - Guardado 01_home_paper_plane_logo.png");

  // 3. AUDITORÍA DE IMÁGENES HD DE DESTINOS
  console.log("3. Auditando imágenes HD de ofertas y destinos...");
  await page.evaluate(() => {
    document.getElementById("catalog-offers-section")?.scrollIntoView({ behavior: "instant" });
  });
  await page.waitForSelector("#offers-cards-grid .offer-flight-card", { timeout: 8000 });
  await page.waitForTimeout(1000);

  const imagenesAudit = await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("#offers-cards-grid img.offer-card-img"));
    // Asegurar que todas las promesas de carga se resuelvan
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
    return imgs.map((img) => ({
      src: img.src,
      alt: img.alt,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }));
  });

  console.log(`   - Total tarjetas de ofertas evaluadas: ${imagenesAudit.length}`);
  for (const img of imagenesAudit) {
    if (!img.complete || img.naturalWidth < 800) {
      throw new Error(`¡ERROR EN IMAGEN! ${img.src} no cumple HD (ancho: ${img.naturalWidth}, complete: ${img.complete})`);
    }
  }
  console.log(`   - [OK]: 100% de las imágenes (${imagenesAudit.length}/${imagenesAudit.length}) cargaron con ancho >= 800px.`);

  await page.screenshot({
    path: path.join(screenshotsDir, "10_offers_grid_hd_images.png"),
  });
  console.log("   - Guardado 10_offers_grid_hd_images.png");

  // 4. VERIFICAR FLUJO COMPLETO DE RECUPERACIÓN DE CONTRASEÑA (2 PASOS)
  console.log("4. Verificando flujo de recuperación de contraseña...");
  await page.click("#btn-header-login-main");
  await page.waitForSelector("#modal-login-auth.active");

  await page.click("#btn-forgot-password");
  await page.waitForSelector("#modal-recuperar-password.active");
  console.log("   - Modal recuperación abierto.");

  await page.fill("#recuperar-email-input", "pasajero@aeroflow.com");
  await page.fill("#recuperar-doc-input", "101829384");
  await page.click("#btn-recuperar-solicitar");

  await page.waitForSelector("#form-recuperar-paso-2", { state: "visible", timeout: 8000 });
  await page.waitForTimeout(600);

  let codigoDemo = await page.$eval("#recuperar-codigo-input", (el) => el.value);
  if (!codigoDemo) {
    const bannerText = await page.$eval("#recuperar-info-banner", (el) => el.innerText).catch(() => "");
    const m = bannerText.match(/\b\d{6}\b/);
    if (m) {
      codigoDemo = m[0];
      await page.fill("#recuperar-codigo-input", codigoDemo);
    }
  }
  console.log("   - Código de verificación recibido:", codigoDemo);

  await page.screenshot({
    path: path.join(screenshotsDir, "02_password_recovery_flow.png"),
  });
  console.log("   - Guardado 02_password_recovery_flow.png");

  await page.fill("#recuperar-password-nuevo", "Pasajero123");
  await page.fill("#recuperar-password-confirm", "Pasajero123");
  await page.click("#btn-recuperar-confirmar");

  await page.waitForSelector("#modal-login-auth.active", { timeout: 8000 });
  console.log("   - Contraseña recuperada y redirigido a Login.");

  // 5. INICIAR SESIÓN COMO ADMINISTRADOR Y VERIFICAR TABLA DE USUARIOS
  console.log("5. Verificando Consola Admin y Gestión de Usuarios...");
  await page.click('.role-tab-btn[data-role="admin"]');
  await page.fill("#login-email-input", "admin@aeroflow.com");
  await page.fill("#login-password-input", "Admin123");
  await page.click("#btn-submit-auth");

  await page.waitForSelector(".btn-admin-panel-badge", { timeout: 8000 });
  console.log("   - Administrador autenticado.");

  // Abrir Consola Admin
  await page.click(".btn-admin-panel-badge");
  await page.waitForSelector("#modal-panel-admin.active");

  await page.click('.admin-tab-btn[data-tab="usuarios"]');
  await page.waitForSelector("#admin-tab-usuarios.active");
  await page.waitForSelector(".btn-otp-action", { timeout: 8000 });

  const usuariosRowsCount = await page.$$eval(
    "#admin-usuarios-tbody tr",
    (rows) => rows.length,
  );
  console.log("   - Total filas de usuarios renderizadas en Admin:", usuariosRowsCount);

  const userEmails = await page.$$eval("#admin-usuarios-tbody tr", (rows) =>
    rows.map((r) => r.children[2] ? r.children[2].innerText.trim().toLowerCase() : "")
  );
  console.log("   - Emails en la tabla:", userEmails);
  const emailsSet = new Set(userEmails);
  if (userEmails.length !== emailsSet.size) {
    throw new Error(`¡ERROR! Se detectaron filas duplicadas para el mismo usuario: ${userEmails}`);
  }
  console.log("   - [OK]: Cada usuario aparece en EXACTAMENTE UNA SOLA FILA (0 duplicados).");

  await page.screenshot({
    path: path.join(screenshotsDir, "03_admin_users_management.png"),
  });
  console.log("   - Guardado 03_admin_users_management.png");

  // 5b. VERIFICAR DETALLE DE RESERVAS EN MODAL AL CLIC EN CONTEO DE RESERVAS
  console.log("5b. Probando visualización de reservas en modal (#modal-admin-user-reservas)...");
  await page.fill("#input-buscar-usuarios", "Carlos");
  await page.waitForTimeout(400);

  const btnReservaCount = await page.$("#admin-usuarios-tbody .btn-reservas-count");
  if (!btnReservaCount) {
    throw new Error("No se encontró el botón de reservas para Carlos Mendoza");
  }
  const countText = await btnReservaCount.innerText();
  console.log("   - Conteo de reservas visible al frente:", countText.trim());

  await btnReservaCount.click();
  await page.waitForSelector("#modal-admin-user-reservas.active", { timeout: 8000 });
  await page.waitForTimeout(600);

  const reservasRowCount = await page.$$eval(
    "#admin-user-reservas-tbody tr",
    (rows) => rows.length,
  );
  console.log("   - Filas de tiquetes renderizadas en modal de reservas:", reservasRowCount);

  await page.screenshot({
    path: path.join(screenshotsDir, "08_admin_user_reservas_modal.png"),
  });
  console.log("   - Guardado 08_admin_user_reservas_modal.png");

  await page.click('button[onclick="AeroMinimalUI.cerrarModalUserReservas()"]');
  await page.waitForSelector("#modal-admin-user-reservas", { state: "hidden", timeout: 8000 });
  await page.waitForTimeout(300);

  await page.fill("#input-buscar-usuarios", "");
  await page.waitForTimeout(400);

  // 5c. GENERAR OTP DESDE EL PANEL ADMIN
  console.log("5c. Probando Generación de OTP por Administrador...");
  await page.fill("#input-buscar-usuarios", "Carlos");
  await page.waitForTimeout(400);

  await page.click(".btn-otp-action");
  await page.waitForSelector("#modal-admin-otp-display.active", { timeout: 8000 });
  const otpGenerado = await page.$eval("#admin-otp-code-text", (el) => el.innerText.trim());
  console.log("   - OTP Generado para Carlos Mendoza:", otpGenerado);

  await page.click("#btn-copy-otp-action");
  await page.waitForTimeout(300);
  const copyLabel = await page.$eval("#btn-copy-otp-label", (el) => el.innerText);
  console.log("   - Feedback de copiado:", copyLabel);

  await page.screenshot({
    path: path.join(screenshotsDir, "04_admin_otp_generated.png"),
  });
  console.log("   - Guardado 04_admin_otp_generated.png");

  await page.click('button[onclick="AeroMinimalUI.cerrarModalOtpDisplay()"]');
  await page.waitForTimeout(400);

  // Cerrar consola admin
  await page.click('button[onclick="AeroMinimalUI.cerrarPanelAdmin()"]');
  await page.waitForSelector("#modal-panel-admin", { state: "hidden", timeout: 8000 });
  await page.waitForTimeout(400);

  // 6. VERIFICAR 2 VUELOS LLENOS AL 100% EN MAPA DE CABINA
  console.log("6. Verificando mapa de cabina y ocupación al 100% de AF4055 y AF2020...");
  const statusAF4055 = await page.evaluate(async () => {
    const res = await fetch("/api/avion/AF4055/mapa");
    return res.json();
  });
  console.log(`   - AF4055 (Bogotá -> Cartagena): ${statusAF4055.ocupacion}/${statusAF4055.capacidad_maxima} asientos ocupados (Lleno: ${statusAF4055.lleno})`);
  if (!statusAF4055.lleno || statusAF4055.ocupacion !== 36) {
    throw new Error(`¡ERROR! AF4055 no tiene ocupación al 100%: ${statusAF4055.ocupacion}/36`);
  }

  const statusAF2020 = await page.evaluate(async () => {
    const res = await fetch("/api/avion/AF2020/mapa");
    return res.json();
  });
  console.log(`   - AF2020 (Bogotá -> Miami): ${statusAF2020.ocupacion}/${statusAF2020.capacidad_maxima} asientos ocupados (Lleno: ${statusAF2020.lleno})`);
  if (!statusAF2020.lleno || statusAF2020.ocupacion !== 36) {
    throw new Error(`¡ERROR! AF2020 no tiene ocupación al 100%: ${statusAF2020.ocupacion}/36`);
  }

  // Abrir modal de mapa de cabina en UI para captura de pantalla
  await page.evaluate(async () => {
    await AeroMinimalUI.abrirMapaCabina("AF4055");
  });
  await page.waitForSelector("#modal-cabin-map.active", { timeout: 8000 });
  await page.waitForTimeout(600);

  await page.screenshot({
    path: path.join(screenshotsDir, "11_cabin_map_100_percent_full.png"),
  });
  console.log("   - Guardado 11_cabin_map_100_percent_full.png");

  await page.click('button[onclick="AeroMinimalUI.cerrarMapaCabina()"]');
  await page.waitForSelector("#modal-cabin-map", { state: "hidden", timeout: 8000 });
  await page.waitForTimeout(400);

  // 7. VERIFICAR MÓDULO DE ABORDAJE (CONSOLA DE PUERTA)
  console.log("7. Verificando Consola de Abordaje y simulación en vivo...");
  await page.click("#nav-btn-abordar");
  await page.waitForSelector("#view-abordar", { state: "visible", timeout: 8000 });
  await page.waitForTimeout(600);

  // Seleccionar vuelo AF4055
  await page.selectOption("#gate-flight-selector", "AF4055");
  await page.waitForTimeout(800);

  // Verificar cola y contador de abordaje
  let gateCounter = await page.$eval("#gate-counter-text", (el) => el.innerText.trim());
  console.log("   - Contador de abordaje inicial AF4055:", gateCounter);

  const colaCardsCount = await page.$$eval("#gate-fifo-queue-list .printable-ticket-card", (els) => els.length);
  console.log("   - Pasajeros en cola de espera en puerta:", colaCardsCount);

  await page.screenshot({
    path: path.join(screenshotsDir, "12_boarding_gate_36_passengers.png"),
  });
  console.log("   - Guardado 12_boarding_gate_36_passengers.png");

  // Abordar 1 pasajero manualmente
  console.log("   - Abordando 1 pasajero mediante '#btn-abordar-siguiente'...");
  await page.click("#btn-abordar-siguiente");
  await page.waitForTimeout(1000);

  gateCounter = await page.$eval("#gate-counter-text", (el) => el.innerText.trim());
  console.log("   - Contador tras abordar 1 pasajero:", gateCounter);
  if (!gateCounter.includes("1 / 36")) {
    throw new Error(`Se esperaba 1 / 36 pasajeros abordados pero se obtuvo: ${gateCounter}`);
  }

  // Recargar página para probar persistencia de abordaje
  console.log("   - Probando persistencia tras recarga de página...");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Volver a sección abordar
  await page.click("#nav-btn-abordar");
  await page.waitForSelector("#view-abordar", { state: "visible", timeout: 8000 });
  await page.selectOption("#gate-flight-selector", "AF4055");
  await page.waitForTimeout(800);

  const counterPostReload = await page.$eval("#gate-counter-text", (el) => el.innerText.trim());
  console.log("   - Contador persistido tras reload:", counterPostReload);
  if (!counterPostReload.includes("1 / 36")) {
    throw new Error(`Fallo en persistencia: tras reload el contador es ${counterPostReload}`);
  }

  // Probar botón de "Reiniciar Vuelos Demo"
  console.log("   - Probando restablecimiento rápido con '#btn-reiniciar-vuelos-demo'...");
  await page.click("#btn-reiniciar-vuelos-demo");
  await page.waitForTimeout(1500);

  const counterReset = await page.$eval("#gate-counter-text", (el) => el.innerText.trim());
  console.log("   - Contador restablecido tras botón demo:", counterReset);
  if (!counterReset.includes("0 / 36") || !counterReset.includes("0%")) {
    throw new Error(`Se esperaba 0 / 36 (0%) tras reiniciar demo, pero se obtuvo: ${counterReset}`);
  }

  await page.screenshot({
    path: path.join(screenshotsDir, "13_boarding_reset_zero_percent.png"),
  });
  console.log("   - Guardado 13_boarding_reset_zero_percent.png");

  // 8. CERRAR SESIÓN ADMIN Y PROBAR LOGIN CON OTP + CAMBIO OBLIGATORIO
  console.log("8. Probando login con OTP y cambio obligatorio...");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.click(".btn-logout-small");
  await page.waitForSelector("#btn-header-login-main", { timeout: 8000 });
  await page.waitForTimeout(500);

  await page.click("#btn-header-login-main");
  await page.waitForSelector("#modal-login-auth.active");

  await page.click('.role-tab-btn[data-role="pasajero"]');
  await page.fill("#login-email-input", "pasajero@aeroflow.com");
  await page.fill("#login-password-input", otpGenerado);
  await page.click("#btn-submit-auth");

  await page.waitForSelector("#modal-cambio-password-obligatorio.active", { timeout: 8000 });
  console.log("   - [OK]: Modal de cambio obligatorio interceptó el flujo correctamente.");

  await page.screenshot({
    path: path.join(screenshotsDir, "05_forced_password_change.png"),
  });
  console.log("   - Guardado 05_forced_password_change.png");

  await page.fill("#obligatorio-password-nuevo", "Pasajero123");
  await page.fill("#obligatorio-password-confirm", "Pasajero123");
  await page.click("#btn-submit-obligatorio");
  await page.waitForSelector("#modal-cambio-password-obligatorio", { state: "hidden", timeout: 8000 });
  console.log("   - Nueva contraseña definitiva guardada con éxito.");
  await page.waitForTimeout(500);

  // 9. VERIFICAR MODAL "MI PERFIL" Y BOTÓN DINÁMICO DE WHATSAPP
  console.log("9. Verificando perfil y botón dinámico de WhatsApp...");
  await page.click(".user-profile-badge");
  await page.waitForSelector("#modal-user-profile.active", { timeout: 8000 });

  const profileDoc = await page.$eval("#profile-display-doc", (el) => el.innerText);
  const profileRol = await page.$eval("#profile-display-rol", (el) => el.innerText);
  console.log("   - Perfil cargado en modal. Documento:", profileDoc, "| Rol:", profileRol);

  await page.screenshot({
    path: path.join(screenshotsDir, "06_user_profile_modal.png"),
  });
  console.log("   - Guardado 06_user_profile_modal.png");

  await page.click('button[onclick="AeroAuth.cerrarModalPerfil()"]');
  await page.waitForTimeout(400);

  // Verificar botón de WhatsApp
  const whatsappHref = await page.$eval("#btn-whatsapp-support", (el) => el.href);
  console.log("   - Enlace dinámico de WhatsApp:", whatsappHref);
  if (!whatsappHref.includes("wa.me/573155667152") || !whatsappHref.includes("Carlos%20Mendoza")) {
    throw new Error(`Enlace de WhatsApp no contiene el nombre dinámico correcto: ${whatsappHref}`);
  }
  console.log("   - [OK]: Botón WhatsApp inyectó el nombre de Carlos Mendoza dinámicamente sin fugas de datos.");

  // 10. VERIFICAR RESPONSIVIDAD MÓVIL EN 390x844 Y 360x640
  console.log("10. Probando responsividad móvil en 390x844 y 360x640...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const overflow390 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log("   - Scroll horizontal en 390x844:", overflow390 ? "OVERFLOW DETECTADO" : "CERO OVERFLOW (Correcto)");
  if (overflow390) throw new Error("¡Error de overflow horizontal detectado en 390x844!");

  await page.screenshot({
    path: path.join(screenshotsDir, "07_mobile_390x844_clean.png"),
  });
  console.log("   - Guardado 07_mobile_390x844_clean.png");

  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(400);
  const overflow360 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log("   - Scroll horizontal en 360x640:", overflow360 ? "OVERFLOW DETECTADO" : "CERO OVERFLOW (Correcto)");
  if (overflow360) throw new Error("¡Error de overflow horizontal detectado en 360x640!");

  // Restaurar viewport desktop
  await page.setViewportSize({ width: 1440, height: 900 });

  // 11. AUDITORÍA FINAL DE CONSOLA Y RED
  console.log("11. Verificando métricas finales de calidad...");
  console.log("   - Errores de consola finales:", consoleErrors.length, consoleErrors);
  console.log("   - Advertencias de consola finales:", consoleWarnings.length, consoleWarnings);
  console.log("   - Errores de red HTTP >= 400:", networkErrors.length, networkErrors);

  if (consoleErrors.length > 0) {
    throw new Error(`Errores detectados en consola del navegador: ${JSON.stringify(consoleErrors)}`);
  }
  if (networkErrors.length > 0) {
    throw new Error(`Peticiones fallidas HTTP >= 400 detectadas: ${JSON.stringify(networkErrors)}`);
  }

  console.log("=== AUDITORÍA Y VERIFICACIÓN INTEGRAL COMPLETADAS CON ÉXITO (0 ERRORES) ===");
  await browser.close();
})();
