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
    modal.classList.add("active");
  }

  function cerrarLoginModal() {
    const modal = document.getElementById("modal-login-auth");
    if (!modal) return;
    modal.classList.remove("active");
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
        <button type="button" class="btn-header-login" onclick="AeroAuth.abrirLoginModal()">Iniciar sesión</button>
      `;
      return;
    }

    // Estado autenticado
    const esAdmin = sesion.rol === "admin" || sesion.rol === "integral";
    const dotClass = esAdmin ? "dot-admin" : "dot-pasajero";
    const rolEtiqueta = esAdmin ? "Administrador" : "Pasajero";

    headerActions.innerHTML = `
      <div class="user-profile-badge">
        <span class="role-indicator-dot ${dotClass}" title="Rol: ${rolEtiqueta}"></span>
        <span>${sanearTexto(sesion.nombre)}</span>
        <button type="button" class="btn-logout-small" title="Cerrar sesion" onclick="AeroAuth.cerrarSesion()">
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
      if (roleTabs) roleTabs.style.display = "none";
      if (autofillRow) autofillRow.style.display = "none";
      if (btnSubmitText) btnSubmitText.textContent = "Registrarme e Ingresar";
      if (switchLabel) switchLabel.textContent = "¿Ya tienes una cuenta? ";
      if (switchBtn) switchBtn.textContent = "Inicia sesión aquí";
    } else {
      if (titleEl) titleEl.textContent = "Iniciar sesión";
      if (descEl) descEl.textContent = "Ingresa para seleccionar tu silla y gestionar tu reserva";
      if (grpNombre) grpNombre.style.display = "none";
      if (roleTabs) roleTabs.style.display = "grid";
      if (autofillRow) autofillRow.style.display = "flex";
      if (btnSubmitText) btnSubmitText.textContent = "Ingresar a Aero Flow";
      if (switchLabel) switchLabel.textContent = "¿No tienes una cuenta? ";
      if (switchBtn) switchBtn.textContent = "Regístrate aquí";
    }
  }

  async function registrarUsuario(nombreRaw, emailRaw, passwordRaw) {
    const nombre = String(nombreRaw || "").trim();
    const email = String(emailRaw || "").toLowerCase().trim();
    const password = String(passwordRaw || "").trim();

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
        body: JSON.stringify({ nombre, email, password }),
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
        rol: "pasajero",
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

        const email = emailInput ? emailInput.value : "";
        const pass = passInput ? passInput.value : "";
        const nombre = nameInput ? nameInput.value : "";
        const submitBtn = document.getElementById("login-submit-btn");

        if (submitBtn) {
          if (submitBtn.disabled) return;
          submitBtn.disabled = true;
        }

        try {
          if (modoAuthActual === "register") {
            const regRes = await registrarUsuario(nombre, email, pass);
            if (regRes.exito) {
              ocultarErrorLogin();
              actualizarHeaderUI(regRes.sesion);
              cerrarLoginModal();
              mostrarNotificacion(regRes.mensaje || `Bienvenido, ${regRes.sesion.nombre}`);

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
              mostrarErrorLogin(regRes.mensaje);
            }
            return;
          }

          // Modo Login
          const res = await autenticar(rolLoginSeleccionado, email, pass);
          if (res.exito) {
            ocultarErrorLogin();
            actualizarHeaderUI(res.sesion);
            cerrarLoginModal();
            mostrarNotificacion(`Bienvenido, ${res.sesion.nombre}`);

            // Si había una intención pendiente de elegir silla, reanudarla automáticamente
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
  };

  // Alias para compatibilidad con código existente
  window.autenticar = autenticar;
  window.tienePermiso = tienePermiso;
  window.obtenerSesionActual = obtenerSesionActual;
  window.cerrarSesion = cerrarSesion;
  window.seleccionarTabLogin = seleccionarTabLogin;

  document.addEventListener("DOMContentLoaded", init);
})();
