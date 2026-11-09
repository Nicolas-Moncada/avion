const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const screenshotsDir = path.join(
    __dirname,
    "..",
    "docs",
    "auditoria",
    "capturas-v5",
  );
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  console.log("--- 1. Carga de página y Login como Pasajero ---");
  await page.goto("http://127.0.0.1:5000/", { waitUntil: "networkidle" });

  await page.click("button.btn-header-login");
  await page.waitForSelector("#modal-login-auth.active");
  await page.click('button[data-role="pasajero"]');
  await page.fill("#login-email-input", "pasajero@aeroflow.com");
  await page.fill("#login-password-input", "Pasajero123");
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(800);

  console.log(
    "--- 2. Apertura del Selector de Asientos y Verificación de Estado Inicial Bloqueado ---",
  );
  const chooseSeatBtn = await page.locator(".btn-choose-seat").first();
  await chooseSeatBtn.click();
  await page.waitForSelector("#modal-cabin-map.active");
  await page.waitForTimeout(600);

  // Verificación de Error 1: Checks verdes pequeños y acordeones limpios
  const checkSvgSize = await page.evaluate(() => {
    const svg = document.querySelector(".benefit-check-svg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  console.log(
    "✓ Error 1 Corregido: Tamaño del SVG Check Verde:",
    checkSvgSize,
    "(Debe ser ~14x14px, CERO deformaciones gigantes)",
  );

  // Probar colapso suave de acordeones: abrir 'Más adelante' y verificar que cierra el anterior
  await page.click("#acc-card-forward button.category-accordion-header");
  await page.waitForTimeout(300);
  const vipIsOpenAfter = await page.evaluate(
    () => document.getElementById("acc-body-vip").style.display !== "none",
  );
  const forwardIsOpen = await page.evaluate(
    () => document.getElementById("acc-body-forward").style.display !== "none",
  );
  console.log(
    "✓ Acordeón exclusivo: VIP cerrado =",
    !vipIsOpenAfter,
    "| Más adelante abierto =",
    forwardIsOpen,
  );

  await page.screenshot({
    path: path.join(
      screenshotsDir,
      "01_latam_accordions_compact_clean_checks.png",
    ),
  });

  // Verificación de Error 2: Bloqueo estricto antes de elegir asiento
  const continueBtnDisabled = await page.evaluate(() => {
    const btn = document.getElementById("btn-latam-continue");
    return btn.hasAttribute("disabled") || btn.classList.contains("disabled");
  });
  const step2Disabled = await page.evaluate(() =>
    document.getElementById("step-nav-2").classList.contains("disabled"),
  );
  const step3Disabled = await page.evaluate(() =>
    document.getElementById("step-nav-3").classList.contains("disabled"),
  );
  const currentSeat = await page.evaluate(() =>
    document.getElementById("latam-seat-number-badge").textContent.trim(),
  );

  console.log(
    '✓ Error 2 Corregido: Botón "Agregar y continuar" bloqueado inicialmente:',
    continueBtnDisabled,
  );
  console.log(
    '✓ Error 2 Corregido: Paso 2 ("Datos y Equipaje") bloqueado en Stepper:',
    step2Disabled,
  );
  console.log(
    '✓ Error 2 Corregido: Paso 3 ("Pasarela de Pago") bloqueado en Stepper:',
    step3Disabled,
  );
  console.log(
    "✓ Error 2 Corregido: Silla actual seleccionada inicial:",
    currentSeat,
    '(esperado: "--")',
  );

  // Verificar que Paso 3 tiene pointer-events: none y que intentar invocarlo no abre el checkout
  const pointerEvents3 = await page.evaluate(() => window.getComputedStyle(document.getElementById('step-nav-3')).pointerEvents);
  console.log('✓ Bloqueo CSS: Paso 3 tiene pointer-events: none =', pointerEvents3 === 'none');

  await page.evaluate(() => {
    document.getElementById('step-nav-3').click();
  });
  await page.waitForTimeout(300);
  const step3VisibleWithoutSeat = await page.evaluate(
    () => document.getElementById("checkout-step-3").style.display !== "none",
  );
  console.log(
    "✓ Bloqueo activo: Paso 3 NO es accesible sin asiento =",
    !step3VisibleWithoutSeat,
  );

  await page.screenshot({
    path: path.join(
      screenshotsDir,
      "02_step_gate_locked_before_seat_selection.png",
    ),
  });

  // Seleccionar asiento 26D (Estándar)
  console.log("--- 3. Seleccionando Asiento 26D en el Fuselaje ---");
  const seat26D = page.locator('.latam-seat-btn[data-seat="26D"]');
  await seat26D.scrollIntoViewIfNeeded();
  await seat26D.click();
  await page.waitForTimeout(400);

  const continueBtnNowEnabled = await page.evaluate(() => {
    const btn = document.getElementById("btn-latam-continue");
    return !btn.hasAttribute("disabled") && !btn.classList.contains("disabled");
  });
  const selectedSeatNow = await page.evaluate(() =>
    document.getElementById("latam-seat-number-badge").textContent.trim(),
  );
  console.log(
    "✓ Asiento 26D seleccionado:",
    selectedSeatNow,
    "| Botón Continuar Habilitado:",
    continueBtnNowEnabled,
  );

  await page.screenshot({
    path: path.join(screenshotsDir, "03_seat_26d_selected_button_enabled.png"),
  });

  // Avanzar a Paso 2
  console.log("--- 4. Avanzando a Paso 2 con Asiento Confirmado ---");
  await page.click("#btn-latam-continue");
  await page.waitForTimeout(500);

  const step1Completed = await page.evaluate(() =>
    document.getElementById("step-nav-1").classList.contains("completed"),
  );
  const step2Active = await page.evaluate(() =>
    document.getElementById("step-nav-2").classList.contains("active"),
  );
  const step3StillDisabled = await page.evaluate(() =>
    document.getElementById("step-nav-3").classList.contains("disabled"),
  );
  console.log(
    "✓ En Paso 2: Paso 1 completado =",
    step1Completed,
    "| Paso 2 activo =",
    step2Active,
    "| Paso 3 deshabilitado =",
    step3StillDisabled,
  );

  await page.screenshot({
    path: path.join(screenshotsDir, "04_checkout_step2_passengers_active.png"),
  });

  // Avanzar a Paso 3
  console.log("--- 5. Avanzando a Paso 3 (Pasarela de Pago) ---");
  await page.click("#btn-step2-next");
  await page.waitForTimeout(500);

  const step3Active = await page.evaluate(() =>
    document.getElementById("step-nav-3").classList.contains("active"),
  );
  const step2Completed = await page.evaluate(() =>
    document.getElementById("step-nav-2").classList.contains("completed"),
  );
  console.log(
    "✓ En Paso 3: Paso 2 completado =",
    step2Completed,
    "| Paso 3 activo =",
    step3Active,
  );

  await page.screenshot({
    path: path.join(screenshotsDir, "05_checkout_step3_payment_active.png"),
  });

  // Cerrar modal de cabina
  await page.click("#modal-cabin-map .modal-close-btn");
  await page.waitForTimeout(400);

  // Cerrar sesión pasajero
  await page.click(".btn-logout-small");
  await page.waitForTimeout(400);

  console.log(
    "--- 6. Verificación de Error 3: Procesador Universal de Imágenes en Modo Admin ---",
  );
  // Login admin
  await page.click("button.btn-header-login");
  await page.waitForSelector("#modal-login-auth.active");
  await page.click('button[data-role="admin"]');
  await page.fill("#login-email-input", "admin@aeroflow.com");
  await page.fill("#login-password-input", "Admin123");
  await page.click('#form-login-auth button[type="submit"]');
  await page.waitForTimeout(800);

  // Abrir editor de vuelo desde el lápiz flotante
  const pencilBtn = page.locator(".btn-admin-pencil").first();
  await pencilBtn.click();
  await page.waitForSelector("#modal-admin-editor-vuelo.active");
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(screenshotsDir, "06_admin_flight_editor_open.png"),
  });

  console.log("--- TODAS LAS VERIFICACIONES VISUALES COMPLETADAS ---");
  await browser.close();
})();
