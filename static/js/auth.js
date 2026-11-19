/**
 * AERO FLOW AIRLINES — Authentication & Role Security Engine (v3.0)
 * Arquitectura de Alta Precisión: Entrada pública en '/', compuerta condicional inteligente,
 * 2 roles exclusivos ('pasajero' y 'admin'), cero emojis y reanudación automática de flujo.
 */

(function () {
  "use strict";

  // ===========================================================================
  // 1. ESTADO GLOBAL Y CLAVES DE ALMACENAMIENTO
  // ===========================================================================
  const STORAGE_KEY_SESION = "aeroflow_session";
  let rolLoginSeleccionado = "pasajero"; // 'pasajero' | 'admin'
  let sbClient = null;

  // Credenciales demo oficiales
  const USUARIOS_DEMO = [
    {
      id: "usr-pax-001",
      nombre: "Carlos Mendoza",
      email: "pasajero@aeroflow.com",
      password: "Pasajero123",
      rol: "pasajero",
    },
    {
      id: "usr-adm-001",
      nombre: "Administrador General",
      email: "admin@aeroflow.com",
      password: "Admin123",
      rol: "admin",
    },
    // Compatibilidad hacia atrás para tests legacy que usan integral
    {
      id: "usr-int-001",
      nombre: "Administrador Integral",
      email: "integral@aeroflow.com",
      password: "Integral123",
      rol: "admin",
    },
  ];

  // ===========================================================================
  // 2. UTILIDADES DE ALMACENAMIENTO SEGURO Y SANITIZACIÓN
  // ===========================================================================
  function obtenerStorage() {
    try {
      if (typeof window.sessionStorage !== "undefined") {
        const testKey = "__storage_test__";
        window.sessionStorage.setItem(testKey, "1");
        window.sessionStorage.removeItem(testKey);
        return window.sessionStorage;
      }
    } catch (e) {}

    // Fallback en memoria si sessionStorage está bloqueado
    if (!window._memStorage) {
      window._memStorage = {
        _data: {},
        getItem: function (k) {
          return this._data[k] || null;
        },
        setItem: function (k, v) {
          this._data[k] = String(v);
        },
        removeItem: function (k) {
          delete this._data[k];
        },
        clear: function () {
          this._data = {};
        },
      };
    }
    return window._memStorage;
  }

  function sanearTexto(input) {
    if (typeof input !== "string") return "";
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  // ===========================================================================
  // 3. GESTIÓN DE SESIÓN
  // ===========================================================================
  function obtenerSesionActual() {
    try {
      const store = obtenerStorage();
      const raw = store.getItem(STORAGE_KEY_SESION);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function guardarSesion(sesion) {
    try {
      const store = obtenerStorage();
      store.setItem(STORAGE_KEY_SESION, JSON.stringify(sesion));
    } catch (e) {}
  }

  function cerrarSesion() {
    try {
      const store = obtenerStorage();
      store.removeItem(STORAGE_KEY_SESION);
    } catch (e) {}
    actualizarHeaderUI(null);
    if (typeof window.cerrarModales === "function") {
      window.cerrarModales();
    }
    if (window.AeroMinimalUI) {
      if (typeof window.AeroMinimalUI.resetUserState === "function") {
        window.AeroMinimalUI.resetUserState();
      } else if (typeof window.AeroMinimalUI.limpiarReservasSesion === "function") {
        window.AeroMinimalUI.limpiarReservasSesion();
      }
      if (typeof window.AeroMinimalUI.actualizarEnlaceWhatsApp === "function") {
        window.AeroMinimalUI.actualizarEnlaceWhatsApp(null, "");
      }
      if (typeof window.AeroMinimalUI.actualizarPortalPasajero === "function") {
        window.AeroMinimalUI.actualizarPortalPasajero();
      }
    }
    mostrarNotificacion("Sesion cerrada correctamente.");
  }

  // ===========================================================================
  // 4. AUTENTICACIÓN POR ROL (Supabase Auth + Fallback Demo)
  // ===========================================================================
  async function autenticar(rolSolicitado, emailRaw, passwordRaw) {
    const rol = String(rolSolicitado || "pasajero")
      .toLowerCase()
      .trim();
    const email = String(emailRaw || "")
      .toLowerCase()
      .trim();
    const password = String(passwordRaw || "").trim();

    if (!email || !password) {
      return {
        exito: false,
        mensaje: "Por favor ingresa correo electronico y contrasena.",
      };
    }

    // Normalizar rol
    const rolNormalizado =
      rol === "integral" || rol === "administrador" ? "admin" : rol;

    // 1. Verificación contra Supabase si está disponible
    const config = window.AEROFLOW_CONFIG;
    if (config && config.IS_CONFIGURED && window.supabase) {
      try {
        if (!sbClient) {
          sbClient = window.supabase.createClient(
            config.SUPABASE_URL,
            config.SUPABASE_ANON_KEY,
          );
        }
        const { data: authData, error: authErr } =
          await sbClient.auth.signInWithPassword({ email, password });
        if (!authErr && authData && authData.user) {
          const { data: perfil } = await sbClient
            .from("perfiles")
            .select("*")
            .eq("id", authData.user.id)
            .single();

          const rolPerfil =
            (perfil?.rol || "pasajero") === "integral"
              ? "admin"
              : perfil?.rol || "pasajero";
          if (rolPerfil !== rolNormalizado && rolPerfil !== "admin") {
            await sbClient.auth.signOut();
            return {
              exito: false,
              mensaje: "Acceso no autorizado para este perfil.",
            };
          }

          const sesion = {
            userId: authData.user.id,
            email: authData.user.email,
            nombre: perfil?.nombre || email.split("@")[0],
            rol: rolPerfil,
            token: authData.session?.access_token || "",
            timestamp: Date.now(),
          };
          guardarSesion(sesion);
          return { exito: true, sesion };
        }
      } catch (err) {
        console.warn("[Auth] Fallback a credenciales demo locales.");
      }
    }

    // 2. Verificación contra API Backend
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rol: rolNormalizado }),
      });
      const data = await resp.json();
      if (resp.ok && data.exito && data.sesion) {
        guardarSesion(data.sesion);
        return { exito: true, sesion: data.sesion };
      }
      if (resp.status === 401 && data.error && !USUARIOS_DEMO.some(u => u.email.toLowerCase() === email)) {
        return { exito: false, mensaje: data.error };
      }
    } catch (e) {
      console.warn("[Auth] Backend login no disponible, evaluando demo.");
    }

    // 3. Verificación contra Usuarios Demo Locales (Fallback offline)
    const usuario = USUARIOS_DEMO.find(
      (u) => u.email.toLowerCase() === email && u.password === password,
    );
    if (!usuario) {
      return {
        exito: false,
        mensaje: "Credenciales incorrectas. Verifica correo y contrasena.",
      };
    }

    const rolUsuario = usuario.rol === "integral" ? "admin" : usuario.rol;
    if (rolUsuario !== rolNormalizado && rolUsuario !== "admin") {
      return {
        exito: false,
        mensaje: `El usuario no tiene permisos para el perfil ${rolNormalizado}.`,
      };
    }

    const sesion = {
      userId: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: rolUsuario,
      timestamp: Date.now(),
    };
    guardarSesion(sesion);
    return { exito: true, sesion };
  }

  function tienePermiso(rol, seccion) {
    const rolNorm =
      rol === "integral" ? "admin" : String(rol || "pasajero").toLowerCase();
    if (rolNorm === "admin") return true;
    if (rolNorm === "pasajero") {
      const seccionesAdmin = [
        "modal-panel-admin",
        "tab-admin-ofertas",
        "tab-admin-vuelos",
        "tab-admin-embarque",
        "tab-admin-finanzas",
      ];
      return !seccionesAdmin.includes(seccion);
    }
    return false;
  }

  // ===========================================================================
  // 5. CONTROL DE MODALES DE LOGIN Y COMPUERTAS CONDICIONALES
  // ===========================================================================
  function abrirLoginModal(pendingFlightId = null) {
    if (pendingFlightId) {
      window.pendingFlightId = pendingFlightId;
    }
    const modal = document.getElementById("modal-login-auth");
    if (!modal) return;
    ocultarErrorLogin();
    modal.style.display = "flex";
    modal.classList.add("active");
  }

  function cerrarLoginModal() {
    const modal = document.getElementById("modal-login-auth");
    if (!modal) return;
    modal.classList.remove("active");
    modal.style.display = "none";
  }

  function seleccionarTabLogin(rol) {
    rolLoginSeleccionado =
      rol === "integral" || rol === "administrador" ? "admin" : rol;
    const tabs = document.querySelectorAll(".role-tab-btn");
    tabs.forEach((t) => {
      const match = t.getAttribute("data-role") === rolLoginSeleccionado;
      t.classList.toggle("active", match);
      t.setAttribute("aria-selected", String(match));
    });
    ocultarErrorLogin();
  }

  function autofillDemo(rol) {
    seleccionarTabLogin(rol);
    const emailInput = document.getElementById("login-email-input");
    const passInput = document.getElementById("login-password-input");
    if (rol === "admin") {
      if (emailInput) emailInput.value = "admin@aeroflow.com";
      if (passInput) passInput.value = "Admin123";
    } else {
      if (emailInput) emailInput.value = "pasajero@aeroflow.com";
      if (passInput) passInput.value = "Pasajero123";
    }
  }

  function mostrarErrorLogin(msg) {
    const banner = document.getElementById("login-error-banner");
    if (banner) {
      banner.textContent = msg;
      banner.style.display = "block";
    }
  }

  function ocultarErrorLogin() {
    const banner = document.getElementById("login-error-banner");
    if (banner) {
      banner.textContent = "";
      banner.style.display = "none";
    }
  }

  function togglePasswordVisibility() {
    const passInput = document.getElementById("login-password-input");
    if (!passInput) return;
    passInput.type = passInput.type === "password" ? "text" : "password";
  }

  function mostrarNotificacion(mensaje) {
    if (typeof window.showToast === "function") {
      window.showToast(mensaje, false);
    }
  }

  // ===========================================================================
  // 6. ACTUALIZACIÓN DEL HEADER UI
  // ===========================================================================
  function actualizarHeaderUI(sesion) {
    const headerActions = document.getElementById("header-auth-actions");
    if (!headerActions) return;

    if (!sesion) {
      // Estado desautenticado (Público)
      headerActions.innerHTML = `
        <button type="button" class="btn-header-login-pill" id="btn-header-login-main" onclick="AeroAuth.abrirLoginModal()">
          <svg class="btn-login-user-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>Iniciar sesión</span>
        </button>
      `;
      if (window.AeroMinimalUI && typeof window.AeroMinimalUI.sincronizarModoAdmin === "function") {
        window.AeroMinimalUI.sincronizarModoAdmin(false);
      }
      return;
    }

    // Estado autenticado
    const esAdmin = sesion.rol === "admin" || sesion.rol === "integral";
    const dotClass = esAdmin ? "dot-admin" : "dot-pasajero";
    const rolEtiqueta = esAdmin ? "Administrador" : "Pasajero";

    headerActions.innerHTML = `
      <div class="user-profile-badge" onclick="AeroAuth.abrirModalPerfil()" style="cursor:pointer;" title="Ver mi perfil oficial">
        <span class="role-indicator-dot ${dotClass}" title="Rol: ${rolEtiqueta}"></span>
        <span>${sanearTexto(sesion.nombre)}</span>
        <button type="button" class="btn-logout-small" title="Cerrar sesion" onclick="event.stopPropagation(); AeroAuth.cerrarSesion();">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
      ${
        esAdmin
          ? `
        <button type="button" class="btn-admin-panel-badge" onclick="AeroMinimalUI.abrirPanelAdmin()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span>Consola Admin</span>
        </button>
      `
          : ""
      }
    `;

    if (window.AeroMinimalUI && typeof window.AeroMinimalUI.sincronizarModoAdmin === "function") {
      window.AeroMinimalUI.sincronizarModoAdmin(Boolean(sesion && (sesion.rol === "admin" || sesion.rol === "integral")));
    }
    if (window.AeroMinimalUI && typeof window.AeroMinimalUI.limpiarReservasSesion === "function") {
      window.AeroMinimalUI.limpiarReservasSesion();
    }
  }

  // ===========================================================================
  // 6.5. GESTIÓN DE MODO AUTENTICACIÓN (LOGIN VS REGISTRO)
  // ===========================================================================
  let modoAuthActual = "login"; // "login" | "register"

  function toggleModoAuth(modo = null) {
    if (modo) {
      modoAuthActual = modo;
    } else {
      modoAuthActual = modoAuthActual === "login" ? "register" : "login";
    }

    const titleEl = document.getElementById("login-title-h2");
    const descEl = document.getElementById("login-modal-desc");
    const grpNombre = document.getElementById("group-register-nombre");
    const grpDoc = document.getElementById("group-register-documento");
    const grpTel = document.getElementById("group-register-telefono");
    const forgotRow = document.getElementById("auth-forgot-row");
    const roleTabs = document.getElementById("auth-role-tabs-wrapper");
    const autofillRow = document.getElementById("auth-autofill-wrapper");
    const btnSubmitText = document.getElementById("btn-submit-auth-text");
    const switchLabel = document.getElementById("auth-switch-label");
    const switchBtn = document.getElementById("btn-toggle-auth-mode");

    ocultarErrorLogin();

    if (modoAuthActual === "register") {
      if (titleEl) titleEl.textContent = "Crear Cuenta de Pasajero";
      if (descEl) descEl.textContent = "Regístrate para reservar vuelos y emitir tus pases de abordar oficiales";
      if (grpNombre) grpNombre.style.display = "block";
      if (grpDoc) grpDoc.style.display = "block";
      if (grpTel) grpTel.style.display = "block";
      if (forgotRow) forgotRow.style.display = "none";
      if (roleTabs) roleTabs.style.display = "none";
      if (autofillRow) autofillRow.style.display = "none";
      if (btnSubmitText) btnSubmitText.textContent = "Registrarme e Ingresar";
      if (switchLabel) switchLabel.textContent = "¿Ya tienes una cuenta? ";
      if (switchBtn) switchBtn.textContent = "Inicia sesión aquí";
    } else {
      if (titleEl) titleEl.textContent = "Iniciar sesión";
      if (descEl) descEl.textContent = "Ingresa para seleccionar tu silla y gestionar tu reserva";
      if (grpNombre) grpNombre.style.display = "none";
      if (grpDoc) grpDoc.style.display = "none";
      if (grpTel) grpTel.style.display = "none";
      if (forgotRow) forgotRow.style.display = "block";
      if (roleTabs) roleTabs.style.display = "grid";
      if (autofillRow) autofillRow.style.display = "flex";
      if (btnSubmitText) btnSubmitText.textContent = "Ingresar a Aero Flow";
      if (switchLabel) switchLabel.textContent = "¿No tienes una cuenta? ";
      if (switchBtn) switchBtn.textContent = "Regístrate aquí";
    }
  }

  async function registrarUsuario(nombreRaw, emailRaw, passwordRaw, documentoRaw = "", telefonoRaw = "") {
    const nombre = String(nombreRaw || "").trim();
    const email = String(emailRaw || "").toLowerCase().trim();
    const password = String(passwordRaw || "").trim();
    const documento = String(documentoRaw || "").trim();
    const telefono = String(telefonoRaw || "").trim();

    if (!nombre || !email || !password) {
      return {
        exito: false,
        mensaje: "Por favor completa todos los campos (nombre, correo y contraseña).",
      };
    }
    if (password.length < 6) {
      return {
        exito: false,
        mensaje: "La contraseña debe tener un mínimo de 6 caracteres.",
      };
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, password, documento, telefono }),
      });
      const data = await res.json();
      if (res.ok && data.exito && data.sesion) {
        guardarSesion(data.sesion);
        return { exito: true, sesion: data.sesion, mensaje: data.mensaje };
      }
      return { exito: false, mensaje: data.error || "Error al registrar la cuenta." };
    } catch (err) {
      console.warn("[Auth Register] Fallback de registro en memoria:", err);
      const nuevoId = `usr-pax-${Date.now().toString(16)}`;
      const sesion = {
        userId: nuevoId,
        email: email,
        nombre: nombre,
        documento: documento,
        telefono: telefono,
        rol: "pasajero",
        debe_cambiar_password: 0,
        timestamp: Date.now(),
      };
      guardarSesion(sesion);
      return {
        exito: true,
        sesion: sesion,
        mensaje: `Bienvenido, ${nombre}. Cuenta registrada localmente.`,
      };
    }
  }

  // ===========================================================================
  // 6.6. RECUPERACIÓN DE CONTRASEÑA EN 2 PASOS
  // ===========================================================================
  let recuperacionEstado = {
    email: "",
    documento: "",
  };

  function abrirModalRecuperar() {
    cerrarLoginModal();
    const modal = document.getElementById("modal-recuperar-password");
    if (!modal) return;
    const errBanner = document.getElementById("recuperar-error-banner");
    const infoBanner = document.getElementById("recuperar-info-banner");
    if (errBanner) { errBanner.style.display = "none"; errBanner.textContent = ""; }
    if (infoBanner) { infoBanner.style.display = "none"; infoBanner.textContent = ""; }
    const paso1 = document.getElementById("form-recuperar-paso-1");
    const paso2 = document.getElementById("form-recuperar-paso-2");
    if (paso1) paso1.style.display = "block";
    if (paso2) paso2.style.display = "none";
    modal.style.display = "flex";
    modal.classList.add("active");
  }

  function cerrarModalRecuperar() {
    const modal = document.getElementById("modal-recuperar-password");
    if (!modal) return;
    modal.classList.remove("active");
    modal.style.display = "none";
  }

  function volverALoginDesdeRecuperar() {
    cerrarModalRecuperar();
    abrirLoginModal();
  }

  async function solicitarCodigoRecuperacion() {
    const emailInput = document.getElementById("recuperar-email-input");
    const docInput = document.getElementById("recuperar-doc-input");
    const errBanner = document.getElementById("recuperar-error-banner");
    const infoBanner = document.getElementById("recuperar-info-banner");

    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const doc = docInput ? docInput.value.trim() : "";

    if (!email || !doc) {
      if (errBanner) {
        errBanner.textContent = "Por favor ingresa tu correo y número de documento registrado.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (errBanner) errBanner.style.display = "none";

    const accion = async () => {
      const resp = await fetch("/api/auth/recuperar/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, documento: doc }),
      });
      const data = await resp.json();
      return { ok: resp.ok && data.exito, data };
    };

    if (window.AeroLoader && typeof window.AeroLoader.transaccionConCarga === "function") {
      await window.AeroLoader.transaccionConCarga(
        "Verificando identidad y generando código de seguridad...",
        accion,
        null,
        async (res) => {
          if (!res.ok) {
            if (errBanner) {
              errBanner.textContent = res.data.error || "No fue posible generar el código de recuperación.";
              errBanner.style.display = "block";
            }
            return;
          }
          recuperacionEstado.email = email;
          recuperacionEstado.documento = doc;
          const paso1 = document.getElementById("form-recuperar-paso-1");
          const paso2 = document.getElementById("form-recuperar-paso-2");
          if (paso1) paso1.style.display = "none";
          if (paso2) paso2.style.display = "block";
          if (infoBanner) {
            infoBanner.textContent = res.data.mensaje || "Código de verificación de 6 dígitos generado.";
            infoBanner.style.display = "flex";
          }
          const codInput = document.getElementById("recuperar-codigo-input");
          if (codInput && (res.data.codigo || res.data.codigo_demo)) {
            codInput.value = res.data.codigo || res.data.codigo_demo;
          }
        }
      );
    } else {
      const res = await accion();
      if (!res.ok) {
        if (errBanner) {
          errBanner.textContent = res.data.error || "No fue posible generar el código.";
          errBanner.style.display = "block";
        }
        return;
      }
      recuperacionEstado.email = email;
      recuperacionEstado.documento = doc;
      const paso1 = document.getElementById("form-recuperar-paso-1");
      const paso2 = document.getElementById("form-recuperar-paso-2");
      if (paso1) paso1.style.display = "none";
      if (paso2) paso2.style.display = "block";
      if (infoBanner) {
        infoBanner.textContent = res.data.mensaje || "Código de verificación enviado.";
        infoBanner.style.display = "flex";
      }
    }
  }

  async function confirmarCodigoRecuperacion() {
    const codInput = document.getElementById("recuperar-codigo-input");
    const passInput = document.getElementById("recuperar-password-nuevo");
    const confInput = document.getElementById("recuperar-password-confirm");
    const errBanner = document.getElementById("recuperar-error-banner");

    const codigo = codInput ? codInput.value.trim() : "";
    const pass = passInput ? passInput.value.trim() : "";
    const conf = confInput ? confInput.value.trim() : "";

    if (!codigo || !pass || !conf) {
      if (errBanner) {
        errBanner.textContent = "Por favor ingresa el código y tu nueva contraseña.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (pass !== conf) {
      if (errBanner) {
        errBanner.textContent = "Las contraseñas ingresadas no coinciden.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (pass.length < 6) {
      if (errBanner) {
        errBanner.textContent = "La nueva contraseña debe tener al menos 6 caracteres.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (errBanner) errBanner.style.display = "none";

    const accion = async () => {
      const resp = await fetch("/api/auth/recuperar/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: recuperacionEstado.email,
          documento: recuperacionEstado.documento,
          codigo,
          password_nuevo: pass,
        }),
      });
      const data = await resp.json();
      return { ok: resp.ok && data.exito, data };
    };

    if (window.AeroLoader && typeof window.AeroLoader.transaccionConCarga === "function") {
      await window.AeroLoader.transaccionConCarga(
        "Validando código y asegurando tu nueva contraseña...",
        accion,
        null,
        async (res) => {
          if (!res.ok) {
            if (errBanner) {
              errBanner.textContent = res.data.error || "Código inválido o expirado.";
              errBanner.style.display = "block";
            }
            return;
          }
          cerrarModalRecuperar();
          abrirLoginModal();
          const emailLogin = document.getElementById("login-email-input");
          if (emailLogin) emailLogin.value = recuperacionEstado.email;
          mostrarNotificacion("Contraseña restablecida con éxito. Inicia sesión con tu nueva clave.");
        }
      );
    } else {
      const res = await accion();
      if (!res.ok) {
        if (errBanner) {
          errBanner.textContent = res.data.error || "Error al actualizar contraseña.";
          errBanner.style.display = "block";
        }
        return;
      }
      cerrarModalRecuperar();
      abrirLoginModal();
      mostrarNotificacion("Contraseña restablecida con éxito.");
    }
  }

  // ===========================================================================
  // 6.7. CAMBIO DE CONTRASEÑA OBLIGATORIO (OTP / PRIMER INICIO)
  // ===========================================================================
  let usuarioCambioObligatorio = null;

  function abrirModalCambioObligatorio(userId, email) {
    cerrarLoginModal();
    usuarioCambioObligatorio = { userId, email };
    const modal = document.getElementById("modal-cambio-password-obligatorio");
    if (!modal) return;
    const errBanner = document.getElementById("obligatorio-error-banner");
    if (errBanner) { errBanner.style.display = "none"; errBanner.textContent = ""; }
    const p1 = document.getElementById("obligatorio-password-nuevo");
    const p2 = document.getElementById("obligatorio-password-confirm");
    if (p1) p1.value = "";
    if (p2) p2.value = "";
    modal.style.display = "flex";
    modal.classList.add("active");
  }

  async function completarCambioObligatorio() {
    if (!usuarioCambioObligatorio) return;
    const p1 = document.getElementById("obligatorio-password-nuevo");
    const p2 = document.getElementById("obligatorio-password-confirm");
    const errBanner = document.getElementById("obligatorio-error-banner");

    const passNuevo = p1 ? p1.value.trim() : "";
    const passConf = p2 ? p2.value.trim() : "";

    if (!passNuevo || !passConf) {
      if (errBanner) {
        errBanner.textContent = "Por favor ingresa y confirma tu nueva contraseña.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (passNuevo !== passConf) {
      if (errBanner) {
        errBanner.textContent = "Las contraseñas no coinciden.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (passNuevo.length < 6) {
      if (errBanner) {
        errBanner.textContent = "La nueva contraseña debe tener al menos 6 caracteres.";
        errBanner.style.display = "block";
      }
      return;
    }

    if (errBanner) errBanner.style.display = "none";

    const accion = async () => {
      const resp = await fetch("/api/auth/completar-cambio-obligatorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: usuarioCambioObligatorio.userId,
          password_nuevo: passNuevo,
        }),
      });
      const data = await resp.json();
      return { ok: resp.ok && data.exito, data };
    };

    if (window.AeroLoader && typeof window.AeroLoader.transaccionConCarga === "function") {
      await window.AeroLoader.transaccionConCarga(
        "Cifrando y persistiendo tu nueva contraseña definitiva...",
        accion,
        async () => {
          const sesion = obtenerSesionActual();
          if (sesion) {
            sesion.debe_cambiar_password = 0;
            guardarSesion(sesion);
          }
        },
        async (res) => {
          if (!res.ok) {
            if (errBanner) {
              errBanner.textContent = res.data.error || "Error al actualizar la contraseña.";
              errBanner.style.display = "block";
            }
            return;
          }
          const modal = document.getElementById("modal-cambio-password-obligatorio");
          if (modal) {
            modal.classList.remove("active");
            modal.style.display = "none";
          }
          usuarioCambioObligatorio = null;
          mostrarNotificacion("Contraseña definitiva establecida exitosamente. ¡Bienvenido!");
        }
      );
    } else {
      const res = await accion();
      if (!res.ok) {
        if (errBanner) {
          errBanner.textContent = res.data.error || "Error al actualizar contraseña.";
          errBanner.style.display = "block";
        }
        return;
      }
      const sesion = obtenerSesionActual();
      if (sesion) {
        sesion.debe_cambiar_password = 0;
        guardarSesion(sesion);
      }
      const modal = document.getElementById("modal-cambio-password-obligatorio");
      if (modal) {
        modal.classList.remove("active");
        modal.style.display = "none";
      }
      usuarioCambioObligatorio = null;
      mostrarNotificacion("Contraseña definitiva establecida exitosamente.");
    }
  }

  // ===========================================================================
  // 6.8. MI PERFIL Y CAMBIO VOLUNTARIO DE CONTRASEÑA
  // ===========================================================================
  async function abrirModalPerfil() {
    const sesion = obtenerSesionActual();
    if (!sesion) {
      abrirLoginModal();
      return;
    }
    const modal = document.getElementById("modal-user-profile");
    if (!modal) return;

    // Reset error / success
    const errBox = document.getElementById("profile-pwd-error");
    const succBox = document.getElementById("profile-pwd-success");
    if (errBox) { errBox.style.display = "none"; errBox.textContent = ""; }
    if (succBox) { succBox.style.display = "none"; succBox.textContent = ""; }
    const pActual = document.getElementById("perfil-password-actual");
    const pNuevo = document.getElementById("perfil-password-nuevo");
    const pConf = document.getElementById("perfil-password-confirm");
    if (pActual) pActual.value = "";
    if (pNuevo) pNuevo.value = "";
    if (pConf) pConf.value = "";

    // Show modal
    modal.style.display = "flex";
    modal.classList.add("active");

    // Pre-fill from session
    const nomEl = document.getElementById("profile-display-nombre");
    const emEl = document.getElementById("profile-display-email");
    const docEl = document.getElementById("profile-display-doc");
    const telEl = document.getElementById("profile-display-tel");
    const rolEl = document.getElementById("profile-display-rol");
    const resEl = document.getElementById("profile-display-reservas");

    if (nomEl) nomEl.textContent = sesion.nombre || "—";
    if (emEl) emEl.textContent = sesion.email || "—";
    if (docEl) docEl.textContent = sesion.documento || "—";
    if (telEl) telEl.textContent = sesion.telefono || "—";
    if (rolEl) rolEl.textContent = (sesion.rol === "admin" || sesion.rol === "integral") ? "Administrador" : "Pasajero";

    // Fetch fresh profile from server
    try {
      const resp = await fetch(`/api/auth/perfil?userId=${encodeURIComponent(sesion.userId)}`, {
        headers: { "X-User-Id": sesion.userId }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.exito && data.perfil) {
          const p = data.perfil;
          if (nomEl) nomEl.textContent = p.nombre || sesion.nombre;
          if (emEl) emEl.textContent = p.email || sesion.email;
          if (docEl) docEl.textContent = p.documento || "Sin registrar";
          if (telEl) telEl.textContent = p.telefono || "Sin registrar";
          if (rolEl) rolEl.textContent = (p.rol === "admin" || p.rol === "integral") ? "Administrador" : "Pasajero";
          if (resEl) resEl.textContent = `${p.total_reservas} vuelo(s)`;
        }
      }
    } catch (e) {
      console.warn("[Profile] Error al cargar perfil fresco:", e);
    }
  }

  function cerrarModalPerfil() {
    const modal = document.getElementById("modal-user-profile");
    if (!modal) return;
    modal.classList.remove("active");
    modal.style.display = "none";
  }

  async function cambiarPasswordPerfil() {
    const sesion = obtenerSesionActual();
    if (!sesion) {
      abrirLoginModal();
      return;
    }

    const pActual = document.getElementById("perfil-password-actual");
    const pNuevo = document.getElementById("perfil-password-nuevo");
    const pConf = document.getElementById("perfil-password-confirm");
    const errBox = document.getElementById("profile-pwd-error");
    const succBox = document.getElementById("profile-pwd-success");

    const passActual = pActual ? pActual.value.trim() : "";
    const passNuevo = pNuevo ? pNuevo.value.trim() : "";
    const passConf = pConf ? pConf.value.trim() : "";

    if (!passActual || !passNuevo || !passConf) {
      if (errBox) {
        errBox.textContent = "Por favor completa todos los campos de contraseña.";
        errBox.style.display = "block";
      }
      return;
    }

    if (passNuevo !== passConf) {
      if (errBox) {
        errBox.textContent = "La nueva contraseña y su confirmación no coinciden.";
        errBox.style.display = "block";
      }
      return;
    }

    if (passNuevo.length < 6) {
      if (errBox) {
        errBox.textContent = "La nueva contraseña debe tener al menos 6 caracteres.";
        errBox.style.display = "block";
      }
      return;
    }

    if (passActual === passNuevo) {
      if (errBox) {
        errBox.textContent = "La nueva contraseña no puede ser idéntica a la contraseña actual.";
        errBox.style.display = "block";
      }
      return;
    }

    if (errBox) errBox.style.display = "none";
    if (succBox) succBox.style.display = "none";

    const accion = async () => {
      const resp = await fetch("/api/auth/cambiar-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": sesion.userId,
        },
        body: JSON.stringify({
          userId: sesion.userId,
          password_actual: passActual,
          password_nuevo: passNuevo,
        }),
      });
      const data = await resp.json();
      return { ok: resp.ok && data.exito, data };
    };

    if (window.AeroLoader && typeof window.AeroLoader.transaccionConCarga === "function") {
      await window.AeroLoader.transaccionConCarga(
        "Validando y guardando tu nueva contraseña...",
        accion,
        null,
        async (res) => {
          if (!res.ok) {
            if (errBox) {
              errBox.textContent = res.data.error || "No se pudo actualizar la contraseña.";
              errBox.style.display = "block";
            }
            return;
          }
          if (pActual) pActual.value = "";
          if (pNuevo) pNuevo.value = "";
          if (pConf) pConf.value = "";
          if (succBox) {
            succBox.textContent = "Contraseña actualizada exitosamente.";
            succBox.style.display = "flex";
          }
          mostrarNotificacion("Tu contraseña ha sido actualizada con éxito.");
        }
      );
    } else {
      const res = await accion();
      if (!res.ok) {
        if (errBox) {
          errBox.textContent = res.data.error || "No se pudo actualizar la contraseña.";
          errBox.style.display = "block";
        }
        return;
      }
      if (pActual) pActual.value = "";
      if (pNuevo) pNuevo.value = "";
      if (pConf) pConf.value = "";
      if (succBox) {
        succBox.textContent = "Contraseña actualizada exitosamente.";
        succBox.style.display = "flex";
      }
      mostrarNotificacion("Tu contraseña ha sido actualizada.");
    }
  }

  // ===========================================================================
  // 7. INICIALIZACIÓN
  // ===========================================================================
  function init() {
    const sesion = obtenerSesionActual();
    actualizarHeaderUI(sesion);

    // Formulario de Login / Registro
    const formLogin = document.getElementById("form-login-auth");
    if (formLogin) {
      formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("login-email-input");
        const passInput = document.getElementById("login-password-input");
        const nameInput = document.getElementById("register-name-input");
        const docInput = document.getElementById("register-doc-input");
        const telInput = document.getElementById("register-tel-input");

        const email = emailInput ? emailInput.value : "";
        const pass = passInput ? passInput.value : "";
        const nombre = nameInput ? nameInput.value : "";
        const documento = docInput ? docInput.value : "";
        const telefono = telInput ? telInput.value : "";
        const submitBtn =
          document.getElementById("btn-submit-auth") ||
          document.getElementById("login-submit-btn");

        if (submitBtn) {
          if (submitBtn.disabled) return;
          submitBtn.disabled = true;
        }

        try {
          if (modoAuthActual === "register") {
            if (window.AeroMinimalUI && typeof window.AeroMinimalUI.resetUserState === "function") {
              window.AeroMinimalUI.resetUserState();
            }

            if (window.AeroLoader && typeof window.AeroLoader.transaccionConCarga === "function") {
              await window.AeroLoader.transaccionConCarga(
                "Creando cuenta y preparando tu perfil...",
                async () => {
                  const regRes = await registrarUsuario(nombre, email, pass, documento, telefono);
                  if (!regRes.exito) {
                    mostrarErrorLogin(regRes.mensaje);
                    return { exito: false };
                  }
                  return { exito: true, sesion: regRes.sesion, mensaje: regRes.mensaje };
                },
                async () => {
                  if (window.AeroMinimalUI && typeof window.AeroMinimalUI.cargarReservasServidor === "function") {
                    await window.AeroMinimalUI.cargarReservasServidor();
                  }
                },
                async (resEscritura) => {
                  ocultarErrorLogin();
                  actualizarHeaderUI(resEscritura.sesion);
                  cerrarLoginModal();
                  mostrarNotificacion(resEscritura.mensaje || `Bienvenido, ${resEscritura.sesion.nombre}`);
                  if (window.AeroMinimalUI) {
                    if (typeof window.AeroMinimalUI.actualizarPortalPasajero === "function") {
                      window.AeroMinimalUI.actualizarPortalPasajero();
                    }
                    if (typeof window.AeroMinimalUI.actualizarEnlaceWhatsApp === "function") {
                      window.AeroMinimalUI.actualizarEnlaceWhatsApp(resEscritura.sesion, "");
                    }
                  }
                  if (window.pendingFlightId) {
                    const flightToOpen = window.pendingFlightId;
                    window.pendingFlightId = null;
                    if (
                      window.AeroMinimalUI &&
                      typeof window.AeroMinimalUI.abrirMapaCabina === "function"
                    ) {
                      window.AeroMinimalUI.abrirMapaCabina(flightToOpen);
                    }
                  }
                }
              );
            } else {
              const regRes = await registrarUsuario(nombre, email, pass, documento, telefono);
              if (regRes.exito) {
                ocultarErrorLogin();
                actualizarHeaderUI(regRes.sesion);
                cerrarLoginModal();
                mostrarNotificacion(regRes.mensaje || `Bienvenido, ${regRes.sesion.nombre}`);
                if (window.AeroMinimalUI && typeof window.AeroMinimalUI.actualizarEnlaceWhatsApp === "function") {
                  window.AeroMinimalUI.actualizarEnlaceWhatsApp(regRes.sesion, "");
                }
                if (window.pendingFlightId) {
                  const flightToOpen = window.pendingFlightId;
                  window.pendingFlightId = null;
                  if (window.AeroMinimalUI && typeof window.AeroMinimalUI.abrirMapaCabina === "function") {
                    window.AeroMinimalUI.abrirMapaCabina(flightToOpen);
                  }
                }
              } else {
                mostrarErrorLogin(regRes.mensaje);
              }
            }
            return;
          }

          // Modo Login
          if (window.AeroMinimalUI && typeof window.AeroMinimalUI.resetUserState === "function") {
            window.AeroMinimalUI.resetUserState();
          }

          if (window.AeroLoader && typeof window.AeroLoader.transaccionConCarga === "function") {
            await window.AeroLoader.transaccionConCarga(
              "Iniciando sesión y cargando tus datos...",
              async () => {
                const res = await autenticar(rolLoginSeleccionado, email, pass);
                if (!res.exito) {
                  mostrarErrorLogin(res.mensaje);
                  return { exito: false };
                }
                return { exito: true, sesion: res.sesion };
              },
              async () => {
                if (window.AeroMinimalUI && typeof window.AeroMinimalUI.cargarReservasServidor === "function") {
                  await window.AeroMinimalUI.cargarReservasServidor();
                }
              },
              async (resEscritura) => {
                ocultarErrorLogin();
                actualizarHeaderUI(resEscritura.sesion);
                cerrarLoginModal();

                // Intercepción para cambio obligatorio si tiene clave temporal
                if (resEscritura.sesion.debe_cambiar_password === 1 || resEscritura.sesion.debe_cambiar_password === true) {
                  abrirModalCambioObligatorio(resEscritura.sesion.userId, resEscritura.sesion.email);
                  return;
                }

                mostrarNotificacion(`Bienvenido, ${resEscritura.sesion.nombre}`);
                if (window.AeroMinimalUI) {
                  if (typeof window.AeroMinimalUI.actualizarPortalPasajero === "function") {
                    window.AeroMinimalUI.actualizarPortalPasajero();
                  }
                  if (typeof window.AeroMinimalUI.actualizarEnlaceWhatsApp === "function") {
                    window.AeroMinimalUI.actualizarEnlaceWhatsApp(resEscritura.sesion, "");
                  }
                }
                if (window.pendingFlightId) {
                  const flightToOpen = window.pendingFlightId;
                  window.pendingFlightId = null;
                  if (
                    window.AeroMinimalUI &&
                    typeof window.AeroMinimalUI.abrirMapaCabina === "function"
                  ) {
                    window.AeroMinimalUI.abrirMapaCabina(flightToOpen);
                  }
                }
              }
            );
          } else {
            const res = await autenticar(rolLoginSeleccionado, email, pass);
            if (res.exito) {
              ocultarErrorLogin();
              actualizarHeaderUI(res.sesion);
              cerrarLoginModal();

              if (res.sesion.debe_cambiar_password === 1 || res.sesion.debe_cambiar_password === true) {
                abrirModalCambioObligatorio(res.sesion.userId, res.sesion.email);
                return;
              }

              mostrarNotificacion(`Bienvenido, ${res.sesion.nombre}`);
              if (window.AeroMinimalUI && typeof window.AeroMinimalUI.actualizarEnlaceWhatsApp === "function") {
                window.AeroMinimalUI.actualizarEnlaceWhatsApp(res.sesion, "");
              }
              if (window.pendingFlightId) {
                const flightToOpen = window.pendingFlightId;
                window.pendingFlightId = null;
                if (
                  window.AeroMinimalUI &&
                  typeof window.AeroMinimalUI.abrirMapaCabina === "function"
                ) {
                  window.AeroMinimalUI.abrirMapaCabina(flightToOpen);
                }
              }
            } else {
              mostrarErrorLogin(res.mensaje);
            }
          }
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  // API Pública
  window.AeroAuth = {
    autenticar,
    registrarUsuario,
    toggleModoAuth,
    tienePermiso,
    obtenerSesionActual,
    guardarSesion,
    cerrarSesion,
    abrirLoginModal,
    cerrarLoginModal,
    seleccionarTabLogin,
    autofillDemo,
    togglePasswordVisibility,
    actualizarHeaderUI,
    abrirModalRecuperar,
    cerrarModalRecuperar,
    volverALoginDesdeRecuperar,
    solicitarCodigoRecuperacion,
    confirmarCodigoRecuperacion,
    abrirModalCambioObligatorio,
    completarCambioObligatorio,
    abrirModalPerfil,
    cerrarModalPerfil,
    cambiarPasswordPerfil,
  };

  // Alias para compatibilidad con código existente
  window.autenticar = autenticar;
  window.tienePermiso = tienePermiso;
  window.obtenerSesionActual = obtenerSesionActual;
  window.cerrarSesion = cerrarSesion;
  window.seleccionarTabLogin = seleccionarTabLogin;

  document.addEventListener("DOMContentLoaded", init);
})();
