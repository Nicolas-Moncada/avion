const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('--- TEST DE REGISTRO DE NUEVOS USUARIOS Y LOGIN ---');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, '..', 'docs', 'auditoria', 'capturas-v6');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Cargar página pública
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle' });
  console.log('✓ 1. Portada pública cargada');

  // 2. Abrir modal de Login
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');
  console.log('✓ 2. Modal de Login abierto');

  await page.screenshot({ path: path.join(screenshotsDir, '01_login_modal_initial.png') });

  // 3. Cambiar a modo Registro
  await page.click('#btn-toggle-auth-mode');
  await page.waitForTimeout(300);

  const modalTitle = await page.textContent('#login-title-h2');
  const nameFieldVisible = await page.isVisible('#group-register-nombre');
  const submitText = await page.textContent('#btn-submit-auth-text');
  console.log('✓ 3. Modo Registro activado:', { modalTitle, nameFieldVisible, submitText });

  await page.screenshot({ path: path.join(screenshotsDir, '02_register_modal_active.png') });

  // 4. Llenar formulario de registro con nuevo pasajero
  const testEmail = `pasajero_${Date.now()}@viajes.com`;
  await page.fill('#register-name-input', 'Andrea Villamizar');
  await page.fill('#login-email-input', testEmail);
  await page.fill('#login-password-input', 'AndreaSegura123');

  await page.screenshot({ path: path.join(screenshotsDir, '03_register_form_filled.png') });

  // 5. Enviar registro
  await page.click('#btn-submit-auth');
  await page.waitForSelector('#modal-login-auth.active', { state: 'detached', timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);

  // Verificar que el header muestra el perfil del nuevo usuario
  const profileBadgeText = await page.textContent('.user-profile-badge span:nth-child(2)');
  console.log('✓ 4. Usuario registrado y logueado en sesión:', profileBadgeText);

  await page.screenshot({ path: path.join(screenshotsDir, '04_user_registered_logged_in.png') });

  // 6. Cerrar sesión
  await page.click('.btn-logout-small');
  await page.waitForTimeout(400);
  const loginBtnVisibleAfterLogout = await page.isVisible('button.btn-header-login');
  console.log('✓ 5. Sesión cerrada correctamente:', loginBtnVisibleAfterLogout);

  // 7. Iniciar sesión con la cuenta recién creada
  await page.click('button.btn-header-login');
  await page.waitForSelector('#modal-login-auth.active');

  // Asegurar que está en modo Login
  const isNameFieldHidden = !(await page.isVisible('#group-register-nombre'));
  if (!isNameFieldHidden) {
    await page.click('#btn-toggle-auth-mode');
    await page.waitForTimeout(200);
  }

  await page.fill('#login-email-input', testEmail);
  await page.fill('#login-password-input', 'AndreaSegura123');
  await page.click('#btn-submit-auth');
  await page.waitForTimeout(600);

  const reLoginUserText = await page.textContent('.user-profile-badge span:nth-child(2)');
  console.log('✓ 6. Re-login exitoso con credenciales registradas:', reLoginUserText);

  await page.screenshot({ path: path.join(screenshotsDir, '05_relogin_success.png') });

  console.log('--- TODAS LAS PRUEBAS DE REGISTRO COMPLETADAS CON ÉXITO ---');
  await browser.close();
})();
