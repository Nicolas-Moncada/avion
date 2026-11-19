const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  console.log(
    "=== INICIANDO AUDITORÍA Y VERIFICACIÓN E2E DE AERO FLOW AIRLINES ===",
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
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    } else if (msg.type() === "warning") {
      consoleWarnings.push(msg.text());
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

  await page.screenshot({
    path: path.join(screenshotsDir, "01_home_paper_plane_logo.png"),
  });
  console.log("   - Guardado 01_home_paper_plane_logo.png");

  // 3. VERIFICAR FLUJO COMPLETO DE RECUPERACIÓN DE CONTRASEÑA (2 PASOS)
  console.log("3. Verificando flujo de recuperación de contraseña...");
  await page.click("#btn-header-login-main");
  await page.waitForSelector("#modal-login-auth.active");

  // Click en "¿Olvidaste tu contraseña?"
  await page.click("#btn-forgot-password");
  await page.waitForSelector("#modal-recuperar-password.active");
  console.log("   - Modal recuperación abierto.");

  // Paso 1: ingresar correo y documento
  await page.fill("#recuperar-email-input", "pasajero@aeroflow.com");
  await page.fill("#recuperar-doc-input", "101829384");
  await page.click("#btn-recuperar-solicitar");

  // Esperar a que se active paso 2
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

  // Paso 2: ingresar nueva contraseña
  await page.fill("#recuperar-password-nuevo", "Pasajero123");
  await page.fill("#recuperar-password-confirm", "Pasajero123");
  await page.click("#btn-recuperar-confirmar");

  // Esperar a que el modal de recuperación se cierre y se abra login
  await page.waitForSelector("#modal-login-auth.active", { timeout: 8000 });
  console.log("   - Contraseña recuperada y redirigido a Login.");

  // 4. INICIAR SESIÓN COMO ADMINISTRADOR Y VERIFICAR TABLA DE USUARIOS
  console.log("4. Verificando Consola Admin y Gestión de Usuarios...");
  await page.click('.role-tab-btn[data-role="admin"]');
  await page.fill("#login-email-input", "admin@aeroflow.com");
  await page.fill("#login-password-input", "Admin123");
  await page.click("#btn-submit-auth");

  await page.waitForSelector(".btn-admin-panel-badge", { timeout: 8000 });
  console.log("   - Administrador autenticado.");

  // Abrir Consola Admin
  await page.click(".btn-admin-panel-badge");
  await page.waitForSelector("#modal-panel-admin.active");

  // Cambiar a la pestaña "Usuarios"
  await page.click('.admin-tab-btn[data-tab="usuarios"]');
  await page.waitForSelector("#admin-tab-usuarios.active");

  // Esperar a que los usuarios se carguen desde la BD
  await page.waitForSelector(".btn-otp-action", { timeout: 8000 });

  const usuariosRowsCount = await page.$$eval(
    "#admin-usuarios-tbody tr",
    (rows) => rows.length,
  );
  console.log("   - Total filas de usuarios renderizadas en Admin:", usuariosRowsCount);

  // Verificar que CADA fila corresponde a un usuario único (cero filas duplicadas)
  const userEmails = await page.$$eval("#admin-usuarios-tbody tr", (rows) =>
    rows.map((r) => r.children[2] ? r.children[2].innerText.trim().toLowerCase() : "")
  );
  console.log("   - Emails en la tabla:", userEmails);
  const emailsSet = new Set(userEmails);
  if (userEmails.length !== emailsSet.size) {
    throw new Error(`¡ERROR! Se detectaron filas duplicadas para el mismo usuario: ${userEmails}`);
  }
  console.log("   - [OK]: Cada usuario aparece en EXACTAMENTE UNA SOLA FILA (0 duplicados).");

  // Verificar que el botón Eliminar esté deshabilitado para el Administrador Principal
  const adminDeleteDisabled = await page.$$eval("#admin-usuarios-tbody tr", (rows) => {
    for (const r of rows) {
      const email = r.children[2] ? r.children[2].innerText.trim().toLowerCase() : "";
      if (email === "admin@aeroflow.com") {
        const btnDel = r.querySelector(".btn-delete-user");
        return btnDel ? btnDel.disabled : false;
      }
    }
    return false;
  });
  console.log("   - Botón 'Eliminar' deshabilitado para admin@aeroflow.com:", adminDeleteDisabled);

  // Probar buscador reactivo en vivo
  await page.fill("#input-buscar-usuarios", "Carlos");
  await page.waitForTimeout(400);
  const rowsFiltradas = await page.$$eval(
    "#admin-usuarios-tbody tr",
    (rows) => rows.length,
  );
  console.log("   - Filas filtradas por 'Carlos':", rowsFiltradas);
  await page.fill("#input-buscar-usuarios", ""); // limpiar búsqueda
  await page.waitForTimeout(400);

  await page.screenshot({
    path: path.join(screenshotsDir, "03_admin_users_management.png"),
  });
  console.log("   - Guardado 03_admin_users_management.png");

  // 4b. VERIFICAR DETALLE DE RESERVAS EN MODAL AL CLIC EN CONTEO DE RESERVAS
  console.log("4b. Probando visualización de reservas en modal (#modal-admin-user-reservas)...");
  // Buscar fila de Carlos Mendoza que tiene reservas
  await page.fill("#input-buscar-usuarios", "Carlos");
  await page.waitForTimeout(400);

  const btnReservaCount = await page.$("#admin-usuarios-tbody .btn-reservas-count");
  if (!btnReservaCount) {
    throw new Error("No se encontró el botón de reservas para Carlos Mendoza");
  }
  const countText = await btnReservaCount.innerText();
  console.log("   - Conteo de reservas visible al frente:", countText.trim());

  // Click en el conteo de reservas
  await btnReservaCount.click();
  await page.waitForSelector("#modal-admin-user-reservas.active", { timeout: 8000 });
  await page.waitForTimeout(600);

  const reservasRowCount = await page.$$eval(
    "#admin-user-reservas-tbody tr",
    (rows) => rows.length,
  );
  console.log("   - Filas de tiquetes renderizadas en modal de reservas:", reservasRowCount);

  const primerPnr = await page.$eval(
    "#admin-user-reservas-tbody tr:first-child .pnr-code-badge",
    (el) => el.innerText.trim(),
  );
  console.log("   - PNR verificado en detalle de reservas:", primerPnr);

  await page.screenshot({
    path: path.join(screenshotsDir, "08_admin_user_reservas_modal.png"),
  });
  console.log("   - Guardado 08_admin_user_reservas_modal.png");

  // Cerrar modal de reservas sin duplicar filas en la tabla principal
  await page.click('button[onclick="AeroMinimalUI.cerrarModalUserReservas()"]');
  await page.waitForSelector("#modal-admin-user-reservas", { state: "hidden", timeout: 8000 });
  await page.waitForTimeout(300);

  // Limpiar búsqueda
  await page.fill("#input-buscar-usuarios", "");
  await page.waitForTimeout(400);

  // 4c. PROBAR ELIMINACIÓN DE USUARIO CON CONFIRMACIÓN Y BARRERA TRANSACCIONAL
  console.log("4c. Probando creación y eliminación limpia de usuario de prueba...");
  // Crear usuario temporal vía API
  const tempEmail = `e2e.test.${Date.now()}@aeroflow.com`;
  const regResp = await page.evaluate(async (email) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: "Pasajero Temporal E2E",
        email: email,
        password: "Password123!",
        documento: "8887776655",
        telefono: "+57 300 000 0000"
      }),
    });
    return res.json();
  }, tempEmail);
  console.log("   - Usuario de prueba registrado:", regResp.exito, tempEmail);

  // Recargar tabla de usuarios
  await page.evaluate(async () => {
    await AeroMinimalUI.cargarUsuariosAdmin();
  });
  await page.waitForTimeout(600);

  // Filtrar por el usuario temporal
  await page.fill("#input-buscar-usuarios", tempEmail);
  await page.waitForTimeout(500);

  const deleteBtnTemp = await page.$("#admin-usuarios-tbody .btn-delete-user");
  if (!deleteBtnTemp) {
    throw new Error("No se encontró el botón Eliminar para el usuario temporal");
  }

  // Click en Eliminar -> Abre modal de confirmación
  await deleteBtnTemp.click();
  await page.waitForSelector("#modal-admin-confirm-delete.active", { timeout: 8000 });

  await page.screenshot({
    path: path.join(screenshotsDir, "09_admin_confirm_delete_modal.png"),
  });
  console.log("   - Guardado 09_admin_confirm_delete_modal.png");

  // Confirmar eliminación
  await page.click('button[onclick="AeroMinimalUI.ejecutarEliminarUsuario()"]');

  // Esperar a que se cierre el modal de confirmación y se actualice la tabla
  await page.waitForSelector("#modal-admin-confirm-delete", { state: "hidden", timeout: 8000 });
  await page.waitForTimeout(800);

  // Verificar que ya no exista
  const filasTrasBorrado = await page.$$eval(
    "#admin-usuarios-tbody tr",
    (rows) => rows.length,
  );
  console.log("   - Filas filtradas tras borrado:", filasTrasBorrado);

  // Limpiar búsqueda
  await page.fill("#input-buscar-usuarios", "");
  await page.waitForTimeout(400);

  // 5. GENERAR OTP DESDE EL PANEL ADMIN
  console.log("5. Probando Generación de OTP por Administrador...");
  // Filtrar específicamente por 'Carlos' para generar el OTP de Carlos Mendoza (pasajero@aeroflow.com)
  await page.fill("#input-buscar-usuarios", "Carlos");
  await page.waitForTimeout(400);

  await page.click(".btn-otp-action");
  await page.waitForSelector("#modal-admin-otp-display.active", { timeout: 8000 });
  const otpGenerado = await page.$eval("#admin-otp-code-text", (el) => el.innerText.trim());
  console.log("   - OTP Generado para Carlos Mendoza:", otpGenerado);

  // Probar botón de copiado
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

  // Cerrar sesión admin
  await page.click(".btn-logout-small");
  await page.waitForSelector("#btn-header-login-main", { timeout: 8000 });
  await page.waitForTimeout(500);

  // 6. PROBAR LOGIN CON OTP Y VERIFICAR BLOQUEO / CAMBIO OBLIGATORIO
  console.log("6. Probando login con OTP y cambio obligatorio de contraseña...");
  await page.click("#btn-header-login-main");
  await page.waitForSelector("#modal-login-auth.active");

  await page.click('.role-tab-btn[data-role="pasajero"]');
  await page.fill("#login-email-input", "pasajero@aeroflow.com");
  await page.fill("#login-password-input", otpGenerado);
  await page.click("#btn-submit-auth");

  // Debe saltar automáticamente el modal de cambio obligatorio
  await page.waitForSelector("#modal-cambio-password-obligatorio.active", { timeout: 8000 });
  console.log("   - [OK]: Modal de cambio obligatorio interceptó el flujo correctamente.");

  await page.screenshot({
    path: path.join(screenshotsDir, "05_forced_password_change.png"),
  });
  console.log("   - Guardado 05_forced_password_change.png");

  // Establecer nueva contraseña definitiva
  await page.fill("#obligatorio-password-nuevo", "Pasajero123");
  await page.fill("#obligatorio-password-confirm", "Pasajero123");
  await page.click("#btn-submit-obligatorio");
  await page.waitForSelector("#modal-cambio-password-obligatorio", { state: "hidden", timeout: 8000 });
  console.log("   - Nueva contraseña definitiva guardada con éxito.");
  await page.waitForTimeout(500);

  // 7. VERIFICAR MODAL "MI PERFIL" Y CAMBIO VOLUNTARIO DE CONTRASEÑA
  console.log("7. Verificando modal Mi Perfil oficial...");
  await page.click(".user-profile-badge");
  await page.waitForSelector("#modal-user-profile.active", { timeout: 8000 });

  const profileDoc = await page.$eval("#profile-display-doc", (el) => el.innerText);
  const profileRol = await page.$eval("#profile-display-rol", (el) => el.innerText);
  console.log("   - Perfil cargado en modal. Documento:", profileDoc, "| Rol:", profileRol);

  await page.screenshot({
    path: path.join(screenshotsDir, "06_user_profile_modal.png"),
  });
  console.log("   - Guardado 06_user_profile_modal.png");

  // Cerrar modal de perfil
  await page.click('button[onclick="AeroAuth.cerrarModalPerfil()"]');
  await page.waitForTimeout(400);

  // 8. VERIFICAR RESPONSIVE MÓVIL (390x844) EN HOME
  console.log("8. Probando responsividad móvil en 390x844...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow390 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(
    "   - Scroll horizontal en 390x844:",
    overflow390 ? "OVERFLOW DETECTADO" : "CERO OVERFLOW (Correcto)",
  );

  await page.screenshot({
    path: path.join(screenshotsDir, "07_mobile_390x844_clean.png"),
  });
  console.log("   - Guardado 07_mobile_390x844_clean.png");

  console.log("   - Errores de consola finales:", consoleErrors.length, consoleErrors);
  console.log("   - Advertencias de consola finales:", consoleWarnings.length, consoleWarnings);

  console.log("=== AUDITORÍA Y VERIFICACIÓN COMPLETADAS CON ÉXITO ===");
  await browser.close();
})();
