const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('=== INICIANDO AUDITORÍA AUTOMATIZADA DE UI Y FOTOGRAFÍAS HD ===\n');

  // 1. ESCRITORIO 1440x900
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[PÁGINA ERROR]:', msg.text());
  });

  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // AUDITORÍA 1: HEADER
  console.log('1. Auditando Header...');
  const androidBtnCount = await page.locator('.btn-download-android-header').count();
  assert.strictEqual(androidBtnCount, 0, 'ERROR: El botón de Android NO debe existir en el header!');
  console.log('  [PASS] Ícono de Android eliminado por completo del header.');

  const windowsBtn = page.locator('.btn-download-windows-header');
  assert.strictEqual(await windowsBtn.count(), 1, 'ERROR: Botón de Windows debe existir en el header.');
  const windowsText = (await windowsBtn.innerText()).trim();
  assert.strictEqual(windowsText, '', 'ERROR: El botón de Windows no debe tener texto, sólo ícono.');
  console.log('  [PASS] Botón de Windows presente en modo sólo ícono.');

  const loginBtn = page.locator('.btn-header-login-pill, #btn-header-login-main');
  assert.strictEqual(await loginBtn.count(), 1, 'ERROR: Botón Iniciar sesión píldora debe existir.');
  const loginText = await loginBtn.innerText();
  assert.ok(loginText.includes('Iniciar sesión'), 'ERROR: El botón debe decir Iniciar sesión.');
  const userIconCount = await loginBtn.locator('svg').count();
  assert.ok(userIconCount >= 1, 'ERROR: El botón Iniciar sesión debe contener el ícono SVG de usuario.');
  console.log('  [PASS] Botón Iniciar sesión píldora oficial con ícono SVG validado.');

  // AUDITORÍA 2: BOTÓN DE WHATSAPP FLOTANTE
  console.log('\n2. Auditando Botón Flotante de WhatsApp...');
  const waBtn = page.locator('#btn-whatsapp-support');
  assert.strictEqual(await waBtn.count(), 1, 'ERROR: Botón flotante de WhatsApp debe existir.');
  const waBox = await waBtn.boundingBox();
  assert.ok(waBox, 'ERROR: No se pudo obtener el bounding box de WhatsApp.');

  // Posición: right >= 1350 en 1440 viewport (24px del borde derecho)
  const distFromRight = 1440 - (waBox.x + waBox.width);
  console.log(`  Posición WhatsApp en escritorio: x=${waBox.x}, y=${waBox.y}, distRight=${distFromRight}px, distBottom=${900 - (waBox.y + waBox.height)}px`);
  assert.ok(Math.abs(distFromRight - 24) <= 6, `ERROR: WhatsApp debe estar a ~24px de la derecha, actual: ${distFromRight}px`);

  const waHref = await waBtn.getAttribute('href');
  assert.ok(waHref.includes('https://wa.me/573155667152'), 'ERROR: URL de WhatsApp incorrecta.');

  // Probar hover y tooltip hacia la izquierda
  await waBtn.hover();
  await page.waitForTimeout(250);
  const tooltip = page.locator('.whatsapp-tooltip-text');
  const tooltipText = await tooltip.innerText();
  assert.ok(tooltipText.includes('¿Necesitas ayuda? Escríbenos'), 'ERROR: Texto del tooltip incorrecto.');
  console.log('  [PASS] Botón flotante en esquina inferior derecha con tooltip validado.');

  // AUDITORÍA 3: AEROLOADER
  console.log('\n3. Auditando Componente AeroLoader...');
  await page.evaluate(() => {
    window.AeroLoader.show('Comprobación de vuelo en órbita...');
  });
  await page.waitForTimeout(200);
  const loaderActive = await page.locator('#aero-global-loader.active').count();
  assert.strictEqual(loaderActive, 1, 'ERROR: AeroLoader debe estar visible tras show()');
  const loaderLabel = await page.locator('#aero-loader-text').innerText();
  assert.strictEqual(loaderLabel, 'Comprobación de vuelo en órbita...');

  await page.evaluate(() => {
    window.AeroLoader.hide(true);
  });
  await page.waitForTimeout(100);
  const loaderInactive = await page.locator('#aero-global-loader.active').count();
  assert.strictEqual(loaderInactive, 0, 'ERROR: AeroLoader debe ocultarse tras hide()');
  console.log('  [PASS] AeroLoader con avión en órbita y control anti-parpadeo validado.');

  // AUDITORÍA 4: TARJETAS DE OFERTAS Y FOTOGRAFÍAS HD
  console.log('\n4. Auditando Tarjetas de Ofertas y Fotografías HD...');
  await page.locator('#catalog-offers-section').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const offerCards = page.locator('.offer-flight-card');
  const cardCount = await offerCards.count();
  console.log(`  Se encontraron ${cardCount} tarjetas de vuelos en la grilla.`);
  assert.ok(cardCount >= 6, 'ERROR: Deben haber al menos 6 ofertas comerciales en catálogo.');

  const seenUrls = new Set();
  const seenTitles = [];

  for (let i = 0; i < cardCount; i++) {
    const card = offerCards.nth(i);
    const title = (await card.locator('.offer-destination-title').innerText()).trim();
    seenTitles.push(title);

    const img = card.locator('img.offer-card-img');
    const src = await img.getAttribute('src');
    assert.ok(src && src.includes('/api/destinos/'), `ERROR: La imagen de ${title} no usa la API de destino: ${src}`);
    assert.ok(!src.includes('oferta-'), `ERROR: La imagen de ${title} todavía referencia archivo viejo: ${src}`);

    // Comprobar que no hayan URLs repetidas
    assert.ok(!seenUrls.has(src), `ERROR: URL de imagen DUPLICADA encontrada en ${title}: ${src}`);
    seenUrls.add(src);

    // Validar carga en el navegador y dimensiones naturales
    const imgMetrics = await img.evaluate(el => ({
      complete: el.complete,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight
    }));

    console.log(`    Tarjeta ${i+1}: ${title} -> ${src} | ${imgMetrics.naturalWidth}x${imgMetrics.naturalHeight} | complete=${imgMetrics.complete}`);
    assert.strictEqual(imgMetrics.complete, true, `ERROR: Imagen no completó carga para ${title}`);
    assert.ok(imgMetrics.naturalWidth >= 1200, `ERROR: Ancho insuficiente para ${title}: ${imgMetrics.naturalWidth}px`);
    assert.ok(imgMetrics.naturalHeight >= 750, `ERROR: Alto insuficiente para ${title}: ${imgMetrics.naturalHeight}px`);
  }

  // Comprobar nombres completos sin truncar
  console.log('\n  Comprobando nombres de ciudades completos:');
  for (const t of seenTitles) {
    console.log(`    ${t}`);
    if (t.includes('SMR')) {
      assert.ok(t.includes('Santa Marta'), `ERROR: Santa Marta no debe estar cortado en "Santa": ${t}`);
    }
    if (t.includes('MEX')) {
      assert.ok(t.includes('Ciudad de México'), `ERROR: Ciudad de México no debe estar cortado en "Ciudad": ${t}`);
    }
    if (t.includes('JFK')) {
      assert.ok(t.includes('Nueva York'), `ERROR: Nueva York no debe estar cortado en "Nueva": ${t}`);
    }
    if (t.includes('LHR')) {
      assert.ok(t.includes('Londres'), `ERROR: Londres incorrecto: ${t}`);
    }
    if (t.includes('SCL')) {
      assert.ok(t.includes('Santiago'), `ERROR: Santiago incorrecto: ${t}`);
    }
  }
  console.log('  [PASS] Todos los nombres de ciudad se renderizan completos y sin truncamiento.');

  // Comprobar ortografía del CTA de cierre
  const ctaTitle = await page.locator('.closing-cta-title').innerText();
  assert.ok(ctaTitle.includes('¿Todavía no encuentras tu destino preferido?'), `ERROR: Tilde faltante en Todavía: ${ctaTitle}`);
  console.log('  [PASS] Ortografía de "¿Todavía no encuentras tu destino preferido?" verificada.');

  // AUDITORÍA 5: MÓVIL 390x844
  console.log('\n5. Auditando vista móvil (390x844)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2.0
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(300);

  const mobWaBtn = mobilePage.locator('#btn-whatsapp-support');
  const mobWaBox = await mobWaBtn.boundingBox();
  const mobDistRight = 390 - (mobWaBox.x + mobWaBox.width);
  console.log(`  Posición WhatsApp en móvil: x=${mobWaBox.x}, y=${mobWaBox.y}, distRight=${mobDistRight}px`);
  assert.ok(Math.abs(mobDistRight - 18) <= 4, `ERROR: WhatsApp móvil debe estar a ~18px de la derecha, actual: ${mobDistRight}px`);
  console.log('  [PASS] WhatsApp móvil responsivo posicionado a 18px de la derecha.');

  console.log('\n=== TODAS LAS AUDITORÍAS PASARON EXITOSAMENTE (100%) ===\n');

  await browser.close();
  process.exit(0);
})();
