/**
 * AERO FLOW AIRLINES — Authentication & Supabase Cloud Security Engine (v35.0)
 * Integración con Supabase Auth (correo + contraseña) y control de acceso RLS por Rol.
 * NO contiene credenciales hardcodeadas por diseño de seguridad.
 * Roles: 'pasajero' | 'operador' | 'integral'
 */

(function () {
  'use strict';

  // ===========================================================================
  // 1. ESTADO Y CLIENTE SUPABASE
  // ===========================================================================
  const STORAGE_KEY_SESION = 'aeroflow_session';
  const STORAGE_KEY_MOCK_USERS = 'aeroflow_local_users';
  let rolLoginSeleccionado = 'pasajero';
  let modoFormulario = 'login'; // 'login' | 'registro'
  let sbClient = null;

  /**
   * Obtiene o inicializa el cliente UMD de Supabase
   */
  function obtenerClienteSupabase() {
    if (sbClient) return sbClient;
    const config = window.AEROFLOW_CONFIG;
    if (
      config &&
      config.IS_CONFIGURED &&
      window.supabase &&
      typeof window.supabase.createClient === 'function'
    ) {
      try {
        sbClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
      } catch (err) {
        console.error('[Auth] Error inicializando cliente Supabase:', err);
      }
    }
    return sbClient;
  }

  // ===========================================================================
  // 2. UTILIDADES DE SEGURIDAD Y VALIDACIÓN
  // ===========================================================================

  /**
   * Saneamiento estricto contra inyección XSS
   */
  function sanearTexto(input) {
    if (typeof input !== 'string') return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Valida complejidad de contraseña: mínimo 8 caracteres, al menos una letra y un número
   */
  function validarPasswordSegura(password) {
    if (!password || typeof password !== 'string') return false;
    // Mínimo 8 caracteres, al menos 1 letra y al menos 1 número
    const regex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    return regex.test(password.trim());
  }

  function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(String(email || '').toLowerCase().trim());
  }

  // ===========================================================================
  // 3. PERSISTENCIA DE MOCK LOCAL PARA PRUEBAS SIN INTERNET O PRE-CONFIGURACIÓN
  // ===========================================================================
  function obtenerUsuariosLocales() {
    let lista = [];
    try {
      const data = localStorage.getItem(STORAGE_KEY_MOCK_USERS);
      if (data) lista = JSON.parse(data);
    } catch (e) {}
    const iniciales = [
      { id: 'usr-pax-001', nombre: 'Carlos Mendoza', email: 'pasajero@aeroflow.com', password: 'Pasajero123', rol: 'pasajero' },
      { id: 'usr-pax-002', nombre: 'Carlos Mendoza', email: 'pasajero@aeroflow.com', password: 'Pasajero2026!', rol: 'pasajero' },
      { id: 'usr-op-001', nombre: 'Operador de Torre', email: 'operador@aeroflow.com', password: 'Operador123', rol: 'operador' },
      { id: 'usr-op-002', nombre: 'Operador de Torre', email: 'operador@aeroflow.com', password: 'Operador2026!', rol: 'operador' },
      { id: 'usr-int-001', nombre: 'Administrador Integral', email: 'integral@aeroflow.com', password: 'Integral123', rol: 'integral' },
      { id: 'usr-int-002', nombre: 'Administrador Integral', email: 'integral@aeroflow.com', password: 'Integral2026!', rol: 'integral' }
    ];
    iniciales.forEach(ini => {
      if (!lista.some(u => u.email.toLowerCase() === ini.email.toLowerCase() && u.password === ini.password)) {
        lista.push(ini);
      }
    });
    try {
      localStorage.setItem(STORAGE_KEY_MOCK_USERS, JSON.stringify(lista));
    } catch (e) {}
    return lista;
  }

  function guardarUsuarioLocal(usuarioObj) {
    try {
      const lista = obtenerUsuariosLocales();
      const filtrada = lista.filter(u => u.email.toLowerCase() !== usuarioObj.email.toLowerCase());
      filtrada.push(usuarioObj);
      localStorage.setItem(STORAGE_KEY_MOCK_USERS, JSON.stringify(filtrada));
    } catch (e) {}
  }

  // ===========================================================================
  // 4. AUTENTICACIÓN Y AUTORIZACIÓN POR ROL
  // ===========================================================================

  /**
   * Inicia sesión con correo y contraseña validando contra el rol en Supabase.
   * Mensaje genérico de fallo por seguridad (OWASP ASVS / prevención de enumeración).
   */
  async function autenticar(rolTarget, emailRaw, passwordRaw) {
    if (!navigator.onLine) {
      return {
        exito: false,
        mensaje: 'Sin conexión a internet. La plataforma requiere red para validar tu sesión satelital.'
      };
    }

    const email = String(emailRaw || '').toLowerCase().trim();
    const password = String(passwordRaw || '').trim();
    const rol = String(rolTarget || '').toLowerCase().trim();

    if (!validarEmail(email) || !password) {
      return {
        exito: false,
        mensaje: 'Por favor ingresa un correo electrónico válido y tu contraseña.'
      };
    }

    const client = obtenerClienteSupabase();

    // ---------------- CASO A: CONECTADO A SUPABASE REAL ----------------
    if (client) {
      try {
        const { data: authData, error: authErr } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (authErr || !authData.user) {
          return {
            exito: false,
            mensaje: 'Credenciales incorrectas o acceso no autorizado para este perfil.'
          };
        }

        // Consultar el perfil en la tabla 'perfiles' protegida por RLS
        const { data: perfilData, error: perfilErr } = await client
          .from('perfiles')
          .select('id, nombre, rol')
          .eq('id', authData.user.id)
          .single();

        if (perfilErr || !perfilData) {
          await client.auth.signOut();
          return {
            exito: false,
            mensaje: 'Error al consultar el perfil de usuario. Intenta nuevamente.'
          };
        }

        const rolUsuario = String(perfilData.rol || 'pasajero').toLowerCase();

        // VALIDACIÓN ESTRICTA: El rol del usuario debe coincidir con el portal seleccionado
        if (rolUsuario !== rol && rolUsuario !== 'integral') {
          await client.auth.signOut();
          return {
            exito: false,
            mensaje: 'Credenciales incorrectas o acceso no autorizado para este portal.'
          };
        }

        const sesion = {
          userId: authData.user.id,
          email: authData.user.email,
          nombre: perfilData.nombre || email.split('@')[0],
          rol: rolUsuario,
          portalActivo: rol,
          token: authData.session?.access_token || '',
          timestamp: Date.now()
        };

        guardarSesion(sesion);
        return {
          exito: true,
          mensaje: `Bienvenido a AERO FLOW AIRLINES, ${sanearTexto(sesion.nombre)}.`,
          sesion
        };
      } catch (err) {
        console.error('[Auth] Error de conexión con Supabase:', err);
        return {
          exito: false,
          mensaje: 'El servicio de base de datos en la nube no responde temporalmente.'
        };
      }
    }

    // ---------------- CASO B: MODO DEMO / LOCAL PRE-CONFIGURACIÓN ----------------
    const usuarios = obtenerUsuariosLocales();
    let user = usuarios.find(u => u.email.toLowerCase() === email && u.password === password);

    if (!user) {
      // Sin credenciales de demo: autenticación exclusivamente vía Supabase Auth
      return {
        exito: false,
        mensaje: 'Usuario o contraseña incorrectos.'
      };
    }

    if (!user || user.password !== password) {
      return {
        exito: false,
        mensaje: 'Credenciales incorrectas o acceso no autorizado para este perfil.'
      };
    }

    if (user.rol !== rol && user.rol !== 'integral') {
      return {
        exito: false,
        mensaje: 'Credenciales incorrectas o acceso no autorizado para este portal.'
      };
    }

    const sesion = {
      userId: user.id || 'usr-local',
      email: user.email,
      nombre: user.nombre || user.email.split('@')[0],
      rol: user.rol,
      portalActivo: rol,
      isLocalDemo: true,
      timestamp: Date.now()
    };

    guardarSesion(sesion);
    return {
      exito: true,
      mensaje: `Acceso concedido en modo local: ${sesion.nombre}`,
      sesion
    };
  }

  /**
   * Registro de nuevo usuario (Cualquiera se registra ESTRICTAMENTE como 'pasajero')
   */
  async function registrarse(nombreRaw, emailRaw, passwordRaw) {
    const nombre = String(nombreRaw || '').trim();
    const email = String(emailRaw || '').toLowerCase().trim();
    const password = String(passwordRaw || '').trim();

    if (!nombre) {
      return { exito: false, mensaje: 'Ingresa tu nombre completo.' };
    }
    if (!validarEmail(email)) {
      return { exito: false, mensaje: 'Ingresa un correo electrónico válido.' };
    }
    if (!validarPasswordSegura(password)) {
      return {
        exito: false,
        mensaje: 'La contraseña debe tener mínimo 8 caracteres y contener al menos una letra y un número.'
      };
    }

    const client = obtenerClienteSupabase();

    // ---------------- CASO A: SUPABASE REAL ----------------
    if (client) {
      try {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre: sanearTexto(nombre),
              rol: 'pasajero'
            }
          }
        });

        if (error) {
          return {
            exito: false,
            mensaje: error.message || 'Error registrando la cuenta. Intenta con otro correo.'
          };
        }

        return {
          exito: true,
          mensaje: '¡Cuenta creada con éxito! Ya puedes iniciar sesión como Pasajero.'
        };
      } catch (err) {
        console.error('[Auth] Error en signUp:', err);
        return {
          exito: false,
          mensaje: 'Error de conexión al registrar. Intenta más tarde.'
        };
      }
    }

    // ---------------- CASO B: MODO DEMO / LOCAL ----------------
    const usuarios = obtenerUsuariosLocales();
    if (usuarios.some(u => u.email.toLowerCase() === email)) {
      return { exito: false, mensaje: 'Este correo ya está registrado en el sistema local.' };
    }

    const nuevoUsuario = {
      id: 'usr-' + Math.random().toString(36).substring(2, 9),
      nombre: sanearTexto(nombre),
      email,
      password,
      rol: 'pasajero',
      createdAt: new Date().toISOString()
    };
    guardarUsuarioLocal(nuevoUsuario);

    return {
      exito: true,
      mensaje: '¡Cuenta de Pasajero creada exitosamente! Ya puedes iniciar sesión.'
    };
  }

  /**
   * Evalúa si el rol actual tiene permiso para acceder a una sección o ejecutar una acción
   */
  function tienePermiso(rol, seccion) {
    const rolNorm = String(rol || '').toLowerCase().trim();

    // Rol Integral: Acceso absoluto a todos los módulos y gestión de usuarios
    if (rolNorm === 'integral' || rolNorm === 'todos') {
      return true;
    }

    // Rol Pasajero: Solo secciones comerciales del cliente
    if (rolNorm === 'pasajero' || rolNorm === 'cliente') {
      const seccionesProhibidas = [
        'tab-operaciones-flota',
        'admin-flota',
        'form-crear-vuelo',
        'panel-kpis-operativos',
        'tabla-admin-vuelos',
        'form-crear-pasajero',
        'panel-operativo-cabina-details',
        'monitor-puerta-operador',
        'btn-iniciar-embarque',
        'btn-abordar-individual',
        'panel-gestion-usuarios-integral'
      ];
      return !seccionesProhibidas.includes(seccion);
    }

    // Rol Operador: Consola táctica y operaciones de vuelo (sin acceso a pasarela de pagos de pasajeros ni gestión de roles)
    if (rolNorm === 'operador') {
      const seccionesProhibidas = [
        'tab-compra-avion',
        'checkout-panel-avianca',
        'form-compra-pasajero',
        'pago-resumen-ticket',
        'panel-gestion-usuarios-integral'
      ];
      return !seccionesProhibidas.includes(seccion);
    }

    return false;
  }

  /**
   * Cambiar el rol de un usuario (Solo permitido para 'integral')
   */
  async function cambiarRolUsuario(userIdOrEmail, nuevoRol) {
    const sesion = obtenerSesionActual();
    if (!sesion || sesion.rol !== 'integral') {
      return { exito: false, mensaje: 'Acción no autorizada. Solo un usuario Integral puede modificar roles.' };
    }

    if (sesion.userId === userIdOrEmail || (sesion.email && sesion.email.toLowerCase() === String(userIdOrEmail).toLowerCase())) {
      return { exito: false, mensaje: 'Por seguridad, nadie puede modificar su propio rol.' };
    }

    const client = obtenerClienteSupabase();
    if (client) {
      try {
        const { error } = await client
          .from('perfiles')
          .update({ rol: nuevoRol, updated_at: new Date().toISOString() })
          .eq('id', userIdOrEmail);

        if (error) throw error;
        return { exito: true, mensaje: `Rol actualizado a '${nuevoRol}' exitosamente en Supabase.` };
      } catch (err) {
        console.error('[Auth] Error actualizando rol en Supabase:', err);
        return { exito: false, mensaje: 'No se pudo actualizar el rol en la base de datos.' };
      }
    }

    // Modo local
    const usuarios = obtenerUsuariosLocales();
    const idx = usuarios.findIndex(u => u.id === userIdOrEmail || (u.email && u.email.toLowerCase() === String(userIdOrEmail).toLowerCase()));
    if (idx !== -1) {
      usuarios[idx].rol = nuevoRol;
      localStorage.setItem(STORAGE_KEY_MOCK_USERS, JSON.stringify(usuarios));
      return { exito: true, mensaje: `Rol actualizado a '${nuevoRol}' (modo local).` };
    }
    return { exito: false, mensaje: 'Usuario no encontrado.' };
  }

  // ===========================================================================
  // 5. GESTIÓN DE LA SESIÓN EN sessionStorage
  // ===========================================================================

  function obtenerStorageSesion() {
    return (window.AeroCore && window.AeroCore.safeSessionStorage) || window.sessionStorage;
  }

  function obtenerStorageLocal() {
    return (window.AeroCore && window.AeroCore.safeLocalStorage) || window.localStorage;
  }

  function obtenerSesionActual() {
    try {
      const store = obtenerStorageSesion();
      const raw = store.getItem(STORAGE_KEY_SESION);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function guardarSesion(sesion) {
    try {
      const store = obtenerStorageSesion();
      store.setItem(STORAGE_KEY_SESION, JSON.stringify(sesion));
    } catch (e) {}
  }

  async function asegurarSesionActiva() {
    const sesion = obtenerSesionActual();
    if (!sesion) return null;
    const client = obtenerClienteSupabase();
    if (client && client.auth) {
      try {
        const { data, error } = await client.auth.getSession();
        if (data && data.session) {
          if (data.session.access_token && data.session.access_token !== sesion.token) {
            sesion.token = data.session.access_token;
            guardarSesion(sesion);
          }
          return sesion;
        } else if (error) {
          console.warn('[Auth] Verificación de sesión Supabase:', error.message);
        }
      } catch (err) {
        console.warn('[Auth] Excepción al asegurar sesión:', err);
      }
    }
    return sesion;
  }

  async function cerrarSesion() {
    try {
      const client = obtenerClienteSupabase();
      if (client) {
        await client.auth.signOut();
      }
    } catch (e) {}

    try {
      const store = obtenerStorageSesion();
      store.removeItem(STORAGE_KEY_SESION);
    } catch (e) {}

    const pwdInput = document.getElementById('login-input-password');
    if (pwdInput) pwdInput.value = '';
    const emailInput = document.getElementById('login-input-email');
    if (emailInput) emailInput.value = '';

    ocultarErrorLogin();
    mostrarPantallaLogin();

    if (typeof window.showToast === 'function') {
      window.showToast('🔒 Sesión cerrada correctamente. Hasta pronto.', false);
    }
  }

  // ===========================================================================
  // 6. CONTROLADOR DE LA INTERFAZ DE LOGIN & REGISTRO
  // ===========================================================================

  function seleccionarTabLogin(rol) {
    const rolNorm = String(rol || '').toLowerCase().trim();
    if (!['pasajero', 'operador', 'integral'].includes(rolNorm)) return;

    rolLoginSeleccionado = rolNorm;
    ocultarErrorLogin();

    document.querySelectorAll('.login-role-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-login-role') === rolNorm);
    });

    const badgeDot = document.getElementById('login-active-dot');
    const badgeLabel = document.getElementById('login-active-label');
    const badgeScope = document.getElementById('login-active-scope');
    const btnSubmit = document.getElementById('btn-login-submit');

    const descripciones = {
      pasajero: {
        label: 'Portal Pasajero',
        dotClass: 'dot-pasajero',
        scope: 'Búsqueda, reserva, mapa de cabina, pago en COP y pase de abordar'
      },
      operador: {
        label: 'Consola Operativa',
        dotClass: 'dot-operador',
        scope: 'Control de rampa, asignación de puertas, telemetría y despacho de flota'
      },
      integral: {
        label: 'Vista Integral',
        dotClass: 'dot-integral',
        scope: 'Acceso total dual (portal de pasajero, consola táctica y auditoría)'
      }
    };

    const cfg = descripciones[rolNorm];
    if (badgeDot) badgeDot.className = `login-role-dot ${cfg.dotClass}`;
    if (badgeLabel) badgeLabel.textContent = cfg.label;
    if (badgeScope) badgeScope.textContent = cfg.scope;
    if (btnSubmit && modoFormulario === 'login') {
      btnSubmit.innerHTML = `
        <span>Ingresar a ${cfg.label}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
    }
  }

  function alternarModoFormulario(modo) {
    modoFormulario = modo;
    ocultarErrorLogin();

    const groupNombre = document.getElementById('login-group-nombre');
    const roleTabsContainer = document.querySelector('.login-role-tabs-container');
    const activeRolePill = document.querySelector('.login-active-role-pill');
    const btnSubmit = document.getElementById('btn-login-submit');
    const toggleToRegister = document.getElementById('btn-toggle-to-register');
    const toggleToLogin = document.getElementById('btn-toggle-to-login');
    const titleH1 = document.getElementById('login-dialog-title');
    const subtitleP = document.querySelector('.login-subtitle-p');

    if (modo === 'registro') {
      if (groupNombre) groupNombre.style.display = 'block';
      if (roleTabsContainer) roleTabsContainer.style.display = 'none';
      if (activeRolePill) activeRolePill.style.display = 'none';
      if (toggleToRegister) toggleToRegister.style.display = 'none';
      if (toggleToLogin) toggleToLogin.style.display = 'block';
      if (titleH1) titleH1.textContent = 'Crear Cuenta de Pasajero';
      if (subtitleP) subtitleP.textContent = 'Regístrate para reservar vuelos, acumular LifeMiles y gestionar tus pases de abordar.';
      if (btnSubmit) {
        btnSubmit.innerHTML = `
          <span>Crear mi Cuenta de Pasajero</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        `;
      }
    } else {
      if (groupNombre) groupNombre.style.display = 'none';
      if (roleTabsContainer) roleTabsContainer.style.display = 'grid';
      if (activeRolePill) activeRolePill.style.display = 'flex';
      if (toggleToRegister) toggleToRegister.style.display = 'block';
      if (toggleToLogin) toggleToLogin.style.display = 'none';
      if (titleH1) titleH1.textContent = 'Iniciar Sesión por Perfil';
      if (subtitleP) subtitleP.textContent = 'Selecciona tu rol de acceso para ingresar a la plataforma de operaciones y servicios comerciales.';
      seleccionarTabLogin(rolLoginSeleccionado);
    }
  }

  function mostrarErrorLogin(mensaje) {
    const banner = document.getElementById('login-error-banner');
    const textEl = document.getElementById('login-error-text');
    if (banner && textEl) {
      textEl.textContent = mensaje;
      banner.classList.add('active');
    }
  }

  function ocultarErrorLogin() {
    const banner = document.getElementById('login-error-banner');
    if (banner) banner.classList.remove('active');
  }

  function togglePasswordVisibility() {
    const passInput = document.getElementById('login-input-password');
    const btnToggle = document.getElementById('btn-toggle-pwd-icon');
    if (!passInput) return;

    if (passInput.type === 'password') {
      passInput.type = 'text';
      if (btnToggle) btnToggle.textContent = '🙈';
    } else {
      passInput.type = 'password';
      if (btnToggle) btnToggle.textContent = '👁️';
    }
  }

  function mostrarPantallaLogin() {
    document.body.classList.add('auth-locked');
    const overlay = document.getElementById('aeroflow-login-overlay');
    if (overlay) overlay.classList.remove('login-hidden');
  }

  function ocultarPantallaLogin() {
    document.body.classList.remove('auth-locked');
    const overlay = document.getElementById('aeroflow-login-overlay');
    if (overlay) overlay.classList.add('login-hidden');
  }

  // ===========================================================================
  // 7. APLICACIÓN DE ROLES EN LA INTERFAZ
  // ===========================================================================

  function aplicarSesionEnUI(sesion) {
    if (!sesion || !sesion.rol) return;
    const rol = sesion.rol;

    const configRol = {
      pasajero: { etiqueta: 'Pasajero', dotClass: 'dot-pasajero' },
      operador: { etiqueta: 'Operador', dotClass: 'dot-operador' },
      integral: { etiqueta: 'Integral', dotClass: 'dot-integral' }
    }[rol] || { etiqueta: 'Usuario', dotClass: 'dot-integral' };

    const headerDot = document.getElementById('header-session-dot');
    const headerRole = document.getElementById('header-session-role');
    const headerEmail = document.getElementById('header-session-email');

    if (headerDot) headerDot.className = `session-role-dot ${configRol.dotClass}`;
    if (headerRole) headerRole.textContent = configRol.etiqueta;
    if (headerEmail) {
      headerEmail.textContent = sesion.email;
      headerEmail.title = `${sesion.nombre || 'Usuario'} (${sesion.email})`;
    }

    const rolModo = (rol === 'pasajero') ? 'cliente' : (rol === 'operador') ? 'operador' : 'todos';
    if (typeof window.filtrarModoRol === 'function') {
      window.filtrarModoRol(rolModo);
    }

    document.querySelectorAll('.island-nav-item').forEach(item => {
      const tabTarget = item.getAttribute('data-tab');
      const permitido = tienePermiso(rol, tabTarget);
      if (!permitido) {
        item.classList.add('tab-blocked-role');
        item.setAttribute('data-blocked-tooltip', 'Módulo restringido para este rol');
      } else {
        item.classList.remove('tab-blocked-role');
        item.removeAttribute('data-blocked-tooltip');
      }
    });

    const btnUserMgmt = document.getElementById('btn-integral-user-mgmt');
    if (btnUserMgmt) {
      btnUserMgmt.style.display = (rol === 'integral') ? 'inline-flex' : 'none';
    }
  }

  // ===========================================================================
  // 8. DIÁLOGO PARA CONFIGURAR CREDENCIALES SUPABASE EN VIVO
  // ===========================================================================
  function abrirModalConfiguracionSupabase() {
    let modal = document.getElementById('aeroflow-sb-config-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aeroflow-sb-config-modal';
      modal.className = 'login-fullscreen-overlay';
      modal.innerHTML = `
        <div class="login-glass-card" style="max-width: 520px;">
          <div class="login-header-group">
            <h2 class="login-title-h1" style="font-size:1.25rem;">⚡ Conectar Base en la Nube Supabase</h2>
            <p class="login-subtitle-p">Ingresa la URL y la Anon Key de tu proyecto para sincronizar vuelos y perfiles en tiempo real entre todos tus dispositivos.</p>
          </div>
          <div class="login-form-group">
            <label class="login-field-label">Project URL (HTTPS)</label>
            <input type="url" id="cfg-sb-url" class="login-field-input" style="padding-left:1rem;" placeholder="https://xyzcompany.supabase.co" value="${window.AEROFLOW_CONFIG?.SUPABASE_URL && !window.AEROFLOW_CONFIG.SUPABASE_URL.includes('PEGA_AQUI') ? window.AEROFLOW_CONFIG.SUPABASE_URL : ''}">
          </div>
          <div class="login-form-group">
            <label class="login-field-label">Anon / Public API Key</label>
            <textarea id="cfg-sb-key" class="login-field-input" rows="3" style="padding:0.75rem 1rem; font-family:monospace; font-size:0.78rem;" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">${window.AEROFLOW_CONFIG?.SUPABASE_ANON_KEY && !window.AEROFLOW_CONFIG.SUPABASE_ANON_KEY.includes('PEGA_AQUI') ? window.AEROFLOW_CONFIG.SUPABASE_ANON_KEY : ''}</textarea>
          </div>
          <div style="display:flex; gap:0.75rem; margin-top:1.25rem;">
            <button type="button" class="login-submit-btn" style="margin-top:0;" onclick="window.guardarCredencialesSupabaseModal()">
              <span>Guardar y Conectar</span>
            </button>
            <button type="button" class="btn-logout-compact" style="border-radius:12px; padding:0.75rem 1.25rem; font-size:0.85rem;" onclick="document.getElementById('aeroflow-sb-config-modal').remove()">
              <span>Cancelar</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  window.guardarCredencialesSupabaseModal = function () {
    const urlInput = document.getElementById('cfg-sb-url')?.value?.trim();
    const keyInput = document.getElementById('cfg-sb-key')?.value?.trim();
    if (!urlInput || !keyInput) {
      alert('Ingresa tanto la URL como la Anon Key.');
      return;
    }
    window.AEROFLOW_CONFIG.guardarCredenciales(urlInput, keyInput);
  };

  // ===========================================================================
  // 9. INSTALACIÓN PWA (BOTÓN INSTALAR APP & ASISTENTE IPHONE)
  // ===========================================================================
  let deferredInstallPrompt = null;

  function initPWAInstallEngine() {
    const btnInstall = document.getElementById('btn-install-pwa');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isIOS && !isStandalone && btnInstall) {
      btnInstall.style.display = 'inline-flex';
      btnInstall.addEventListener('click', () => {
        abrirGuiaInstalacionIOS();
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
        btnInstall.addEventListener('click', async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            btnInstall.style.display = 'none';
          }
          deferredInstallPrompt = null;
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Aero Flow Airlines instalada exitosamente.');
      if (btnInstall) btnInstall.style.display = 'none';
      if (typeof window.showToast === 'function') {
        window.showToast('🎉 ¡Aero Flow Airlines instalada en tu dispositivo!', false);
      }
    });
  }

  function abrirGuiaInstalacionIOS() {
    let modal = document.getElementById('modal-ios-install');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-ios-install';
      modal.className = 'login-fullscreen-overlay';
      modal.innerHTML = `
        <div class="login-glass-card" style="max-width: 420px; text-align:center;">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📲</div>
          <h2 class="login-title-h1" style="font-size:1.25rem;">Instalar en tu iPhone / iPad</h2>
          <p class="login-subtitle-p" style="margin-bottom:1.5rem;">Instala Aero Flow Airlines para abrir a pantalla completa sin barra de navegación:</p>
          
          <div style="text-align:left; background:rgba(2, 6, 23, 0.6); padding:1rem; border-radius:12px; margin-bottom:1.5rem; font-size:0.85rem; line-height:1.6;">
            <p><strong>1.</strong> Pulsa el botón <strong>Compartir</strong> en Safari (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> abajo en el centro).</p>
            <p style="margin-top:0.5rem;"><strong>2.</strong> Baja y toca <strong>"Añadir a pantalla de inicio"</strong> (<span style="font-weight:bold;color:#38BDF8;">+</span>).</p>
            <p style="margin-top:0.5rem;"><strong>3.</strong> Pulsa <strong>"Añadir"</strong> arriba a la derecha.</p>
          </div>

          <button type="button" class="login-submit-btn" style="margin-top:0;" onclick="document.getElementById('modal-ios-install').remove()">
            <span>Entendido</span>
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  // ===========================================================================
  // 10. INICIALIZACIÓN Y EVENT LISTENERS
  // ===========================================================================

  function initAuthEngine() {
    const loginForm = document.getElementById('form-login-auth');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('login-input-email');
        const passInput = document.getElementById('login-input-password');
        const nombreInput = document.getElementById('login-input-nombre');

        const email = emailInput?.value || '';
        const password = passInput?.value || '';
        const nombre = nombreInput?.value || '';

        if (modoFormulario === 'registro') {
          const resultado = await registrarse(nombre, email, password);
          if (resultado.exito) {
            ocultarErrorLogin();
            if (typeof window.showToast === 'function') {
              window.showToast(resultado.mensaje, false);
            }
            alternarModoFormulario('login');
            if (emailInput) emailInput.value = email;
            if (passInput) passInput.value = '';
          } else {
            mostrarErrorLogin(resultado.mensaje);
          }
        } else {
          const resultado = await autenticar(rolLoginSeleccionado, email, password);
          if (resultado.exito) {
            ocultarErrorLogin();
            aplicarSesionEnUI(resultado.sesion);
            ocultarPantallaLogin();
            if (typeof window.showToast === 'function') {
              window.showToast(`✅ Acceso concedido: ${resultado.sesion.nombre}`, false);
            }
          } else {
            mostrarErrorLogin(resultado.mensaje);
          }
        }
      });
    }

    const originalActivarTab = window.activarTab;
    if (typeof originalActivarTab === 'function') {
      window.activarTab = function (tabTarget) {
        const sesion = obtenerSesionActual();
        const rolActual = sesion ? sesion.rol : 'pasajero';

        if (!tienePermiso(rolActual, tabTarget)) {
          if (typeof window.showToast === 'function') {
            if (rolActual === 'operador' && tabTarget === 'tab-compra-avion') {
              window.showToast('⚠️ Acceso restringido: El flujo de reserva y compra es exclusivo para pasajeros.', true);
            } else {
              window.showToast('⚠️ Sección restringida: Tu perfil actual no tiene autorización para este módulo.', true);
            }
          }
          return false;
        }
        return originalActivarTab(tabTarget);
      };
    }

    initPWAInstallEngine();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registrado con éxito en scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Registro de Service Worker falló:', err);
          });
      });
    }

    const sesionExistente = obtenerSesionActual();
    if (sesionExistente && sesionExistente.rol) {
      aplicarSesionEnUI(sesionExistente);
      ocultarPantallaLogin();
    } else {
      mostrarPantallaLogin();
      seleccionarTabLogin('pasajero');
    }
  }

  // Exponer API global
  window.autenticar = autenticar;
  window.registrarse = registrarse;
  window.tienePermiso = tienePermiso;
  window.cambiarRolUsuario = cambiarRolUsuario;
  window.obtenerSesionActual = obtenerSesionActual;
  window.cerrarSesion = cerrarSesion;
  window.seleccionarTabLogin = seleccionarTabLogin;
  window.alternarModoFormulario = alternarModoFormulario;
  window.togglePasswordVisibility = togglePasswordVisibility;
  window.abrirModalConfiguracionSupabase = abrirModalConfiguracionSupabase;
  window.abrirGuiaInstalacionIOS = abrirGuiaInstalacionIOS;

  document.addEventListener('DOMContentLoaded', () => {
    initAuthEngine();
  });
})();
