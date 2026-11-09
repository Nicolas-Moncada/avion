/**
 * AERO FLOW AIRLINES — Minimal UI Interactive Engine (v3.2)
 * REDISEÑO PREMIUM DEL PASAJERO, SISTEMA DE BOTONES Y ANIMACIONES AVANZADAS,
 * RESTAURACIÓN DE PAGOS ORIGINALES, TICKETS DE DOBLE TALÓN Y APARTADO "ABORDAR" AUTOMÁTICO.
 * MODO ADMINISTRADOR PRESERVADO AL 100% (Lápiz SVG flotante, Creador y Eliminador).
 * CERO EMOJIS — 100% SVG minimalista de trazo fino.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. ESTADO GLOBAL DE LA INTERFAZ
  // =========================================================================
  const uiState = {
    activeSection: 'explorar', // 'explorar' | 'viajes' | 'abordar'
    tripType: 'round', // 'round' | 'oneway'
    origin: 'Miami (MIA)',
    destination: 'Bogotá (BOG)',
    departureDate: '2026-11-08',
    returnDate: '2026-12-08',
    passengers: 1,
    activeSelectingField: 'departure',
    calendarCurrentMonth: new Date(2026, 10, 1), // Noviembre 2026
    currentCategoryFilter: 'todos',
    vuelosCargados: [],
    selectedFlight: null,
    selectedSeat: null,
    currentCheckoutStep: 1,
    passengerData: {
      docType: 'CC',
      docNumber: '101829384',
      fullName: 'Carlos Alberto Mendoza',
      email: 'carlos.mendoza@aeroflow.com',
      phone: '+57 310 987 6543',
      hasLuggageHold: false
    },
    activePaymentMethod: 'card', // 'card' | 'pse' | 'nequi'
    retentionSeconds: 720, // 12 minutos pesimistas
    retentionInterval: null,
    misReservas: [],
    // Consola de Abordaje Masivo
    activeGateFlight: 'AF2025',
    flightQueueTickets: [],
    isAutomaticBoardingRunning: false,
    boardingInterval: null
  };

  const NOMBRES_MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // =========================================================================
  // 2. UTILIDADES DE FORMATO Y MONEDA
  // =========================================================================
  function formatoCOP(numero) {
    const n = Math.round(Number(numero) || 0);
    return 'COP ' + n.toLocaleString('es-CO');
  }

  function calcularTarifaDia(year, month, day) {
    // Noviembre 2026 (month === 10)
    if (year === 2026 && month === 10) {
      if (day < 8) return { past: true, tier: 'past', label: '', precio: 0 };
      if (day === 8) return { today: true, tier: 'today', label: '$', precio: 71810 };
      if (day >= 9 && day <= 15) return { tier: 'low', label: '$', precio: 71810 };
      if (day >= 16 && day <= 22) return { tier: 'mid', label: '$$', precio: 145000 };
      if (day >= 23 && day <= 30) return { tier: 'low', label: '$', precio: 71810 };
    }
    // Diciembre 2026 (month === 11)
    if (year === 2026 && month === 11) {
      if (day === 9 || day === 26 || day === 27) return { tier: 'high', label: '$$$', precio: 320000 };
      if ((day >= 16 && day <= 25) || day >= 28) return { tier: 'mid', label: '$$', precio: 165000 };
      return { tier: 'low', label: '$', precio: 75970 };
    }
    const d = new Date(year, month, day);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { tier: 'mid', label: '$$', precio: 165000 };
    } else if (day % 11 === 0) {
      return { tier: 'high', label: '$$$', precio: 320000 };
    } else {
      return { tier: 'low', label: '$', precio: 71810 };
    }
  }

  // =========================================================================
  // 3. SINTETIZADOR DE AUDIO WEB AUDIO API (CERO ARCHIVOS EXTERNOS)
  // =========================================================================
  let audioCtx = null;

  function obtenerAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playAirportChime() {
    try {
      const ctx = obtenerAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Nota 1: F5 (~698.46 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(698.46, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.28, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.65);

      // Nota 2: C5 (~523.25 Hz) sonando 280ms después (clásico ding-dong de aeropuerto)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, now + 0.28);
      gain2.gain.setValueAtTime(0, now + 0.28);
      gain2.gain.linearRampToValueAtTime(0.32, now + 0.32);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.28);
      osc2.stop(now + 1.1);
    } catch (e) {
      console.warn('[Audio] Web Audio Chime:', e);
    }
  }

  function playScannerBeep() {
    try {
      const ctx = obtenerAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Beep de escáner óptico de puerta (1850 Hz, 80ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1850, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.32, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      console.warn('[Audio] Web Audio Beep:', e);
    }
  }

  // =========================================================================
  // 4. TOASTS Y NOTIFICACIONES (CERO EMOJIS)
  // =========================================================================
  function showToast(mensaje, esError = false) {
    let container = document.getElementById('toast-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-notification-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background:${esError ? '#EF4444' : '#0F172A'};
      color:#FFFFFF;
      padding:12px 20px;
      border-radius:12px;
      font-size:0.875rem;
      font-weight:600;
      box-shadow:0 10px 25px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15);
      opacity:0;
      transform:translateY(10px);
      transition:all 0.22s cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events:auto;
      display:flex;
      align-items:center;
      gap:8px;
    `;
    toast.textContent = mensaje;
    container.appendChild(toast);

    toast.offsetHeight;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }
  window.showToast = showToast;

  // =========================================================================
  // 5. NAVEGACIÓN SPA ENTRE SECCIONES (EXPLORAR, VIAJES, ABORDAR)
  // =========================================================================
  function mostrarSeccion(nombreSeccion) {
    uiState.activeSection = nombreSeccion;

    const views = {
      explorar: document.getElementById('view-explorar'),
      viajes: document.getElementById('view-viajes'),
      abordar: document.getElementById('view-abordar')
    };

    Object.keys(views).forEach(k => {
      if (views[k]) {
        views[k].style.display = (k === nombreSeccion) ? 'block' : 'none';
        if (k === nombreSeccion) {
          views[k].classList.remove('view-section-fade');
          void views[k].offsetWidth;
          views[k].classList.add('view-section-fade');
        }
      }
    });

    // Actualizar botones de navegación
    const navBtnReservar = document.getElementById('nav-btn-reservar');
    const navBtnViajes = document.getElementById('nav-btn-viajes');
    const navBtnAbordar = document.getElementById('nav-btn-abordar');

    if (navBtnReservar) navBtnReservar.classList.toggle('active', nombreSeccion === 'explorar');
    if (navBtnViajes) navBtnViajes.classList.toggle('active', nombreSeccion === 'viajes');
    if (navBtnAbordar) navBtnAbordar.classList.toggle('active', nombreSeccion === 'abordar');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (nombreSeccion === 'viajes') {
      actualizarPortalPasajero();
    } else if (nombreSeccion === 'abordar') {
      inicializarConsolaAbordaje();
    }
  }

  // =========================================================================
  // 6. CONTROL DEL HERO Y CALENDARIO TARIFARIO
  // =========================================================================
  function alternarTipoViaje(tipo) {
    uiState.tripType = tipo;
    const btns = document.querySelectorAll('.segmented-pill-btn');
    btns.forEach(b => {
      const match = b.getAttribute('data-type') === tipo;
      b.classList.toggle('active', match);
    });

    const boxRegreso = document.getElementById('search-field-regreso');
    if (boxRegreso) {
      boxRegreso.style.opacity = (tipo === 'oneway') ? '0.4' : '1';
      boxRegreso.style.pointerEvents = (tipo === 'oneway') ? 'none' : 'auto';
    }
  }

  function intercambiarRutas() {
    const inputOrigen = document.getElementById('search-input-origen');
    const inputDestino = document.getElementById('search-input-destino');
    if (inputOrigen && inputDestino) {
      const temp = inputOrigen.value;
      inputOrigen.value = inputDestino.value;
      inputDestino.value = temp;
      uiState.origin = inputOrigen.value;
      uiState.destination = inputDestino.value;
      showToast('Rutas intercambiadas');
    }
  }

  function abrirCalendarioTarifas(campo) {
    uiState.activeSelectingField = campo;
    const popover = document.getElementById('fare-calendar-popover');
    if (!popover) return;

    renderizarMesesCalendario();
    popover.classList.add('open');
  }

  function cerrarCalendarioTarifas() {
    const popover = document.getElementById('fare-calendar-popover');
    if (popover) popover.classList.remove('open');
  }

  function navegarMesCalendario(offset) {
    const cur = uiState.calendarCurrentMonth;
    uiState.calendarCurrentMonth = new Date(cur.getFullYear(), cur.getMonth() + offset, 1);
    renderizarMesesCalendario();
  }

  function renderizarMesesCalendario() {
    const container = document.getElementById('calendar-months-container');
    if (!container) return;
    container.innerHTML = '';

    const mes1 = new Date(uiState.calendarCurrentMonth);
    const mes2 = new Date(mes1.getFullYear(), mes1.getMonth() + 1, 1);

    container.appendChild(crearCardMes(mes1, true, false));
    container.appendChild(crearCardMes(mes2, false, true));
  }

  function crearCardMes(fechaMes, tienePrev = false, tieneNext = false) {
    const card = document.createElement('div');
    card.className = 'calendar-month-card';

    const year = fechaMes.getFullYear();
    const month = fechaMes.getMonth();
    const nombreMes = NOMBRES_MESES[month];

    const header = document.createElement('div');
    header.className = 'calendar-month-header';

    const btnPrev = tienePrev
      ? `<button type="button" class="calendar-nav-btn" onclick="AeroMinimalUI.navegarMesCalendario(-1)" aria-label="Mes anterior">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
             <polyline points="15 18 9 12 15 6"></polyline>
           </svg>
         </button>`
      : '<span class="calendar-nav-placeholder"></span>';

    const btnNext = tieneNext
      ? `<button type="button" class="calendar-nav-btn" onclick="AeroMinimalUI.navegarMesCalendario(1)" aria-label="Mes siguiente">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
             <polyline points="9 18 15 12 9 6"></polyline>
           </svg>
         </button>`
      : '<span class="calendar-nav-placeholder"></span>';

    header.innerHTML = `
      ${btnPrev}
      <span class="calendar-month-title">${nombreMes} ${year}</span>
      ${btnNext}
    `;
    card.appendChild(header);

    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays-row';
    weekdays.innerHTML = `
      <span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span>
    `;
    card.appendChild(weekdays);

    const grid = document.createElement('div');
    grid.className = 'calendar-days-grid';

    const primerDia = new Date(year, month, 1).getDay();
    const offsetInicio = (primerDia === 0) ? 6 : primerDia - 1;
    const diasEnMes = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < offsetInicio; i++) {
      const empty = document.createElement('span');
      grid.appendChild(empty);
    }

    for (let day = 1; day <= diasEnMes; day++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calendar-day-btn';
      btn.textContent = day;

      const tarifa = calcularTarifaDia(year, month, day);

      if (tarifa.past) {
        btn.classList.add('disabled', 'past');
        btn.disabled = true;
      } else {
        if (tarifa.today) {
          btn.classList.add('today');
          btn.title = `Hoy (${day} de ${nombreMes}): ${formatoCOP(tarifa.precio)}`;
        } else if (tarifa.tier === 'low') {
          btn.classList.add('tier-low');
          btn.title = `Día ${day}: ${formatoCOP(tarifa.precio)}`;
        } else if (tarifa.tier === 'mid') {
          btn.classList.add('tier-mid');
          btn.title = `Día ${day}: ${formatoCOP(tarifa.precio)}`;
        } else if (tarifa.tier === 'high') {
          btn.classList.add('tier-high');
          btn.title = `Día ${day}: ${formatoCOP(tarifa.precio)}`;
        }

        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (uiState.departureDate === isoDate) {
          btn.classList.add('selected');
        } else if (uiState.returnDate === isoDate) {
          btn.classList.add('selected');
        }

        btn.onclick = (e) => {
          e.stopPropagation();
          seleccionarFechaCalendario(year, month, day);
        };
      }
      grid.appendChild(btn);
    }

    card.appendChild(grid);
    return card;
  }

  function seleccionarFechaCalendario(year, month, day) {
    const formatted = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${String(year).slice(2)}`;
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (uiState.activeSelectingField === 'departure') {
      uiState.departureDate = isoDate;
      const el = document.getElementById('search-val-salida');
      if (el) el.textContent = formatted;

      if (uiState.tripType === 'round') {
        uiState.activeSelectingField = 'return';
        renderizarMesesCalendario();
        return;
      }
    } else {
      uiState.returnDate = isoDate;
      const el = document.getElementById('search-val-regreso');
      if (el) el.textContent = formatted;
    }

    cerrarCalendarioTarifas();
  }

  // =========================================================================
  // 7. CATÁLOGO VISUAL DE OFERTAS Y MODO ADMINISTRADOR (PRESERVADO INTACTO)
  // =========================================================================
  async function cargarVuelosCatalogo() {
    try {
      const res = await fetch('/api/vuelos');
      if (!res.ok) throw new Error('Error al consultar vuelos');
      const data = await res.json();
      uiState.vuelosCargados = data.vuelos || data.proximos || data.todos_admin || [];
      renderizarCatalogoOfertas();
      poblarSelectVuelosGate();
    } catch (e) {
      console.warn('[UI] Usando vuelos de respaldo:', e);
      renderizarCatalogoOfertas();
    }
  }

  function filtrarPorCategoria(cat) {
    uiState.currentCategoryFilter = cat;
    const pills = document.querySelectorAll('.category-filter-pill');
    pills.forEach(p => {
      const match = p.getAttribute('data-cat') === cat;
      p.classList.toggle('active', match);
    });
    renderizarCatalogoOfertas();
  }

  function esUsuarioAdmin() {
    if (!window.AeroAuth || typeof window.AeroAuth.obtenerSesionActual !== 'function') return false;
    const sesion = window.AeroAuth.obtenerSesionActual();
    return Boolean(sesion && (sesion.rol === 'admin' || sesion.rol === 'integral'));
  }

  function sincronizarModoAdmin(forzarEstado) {
    const esAdmin = (typeof forzarEstado === 'boolean') ? forzarEstado : esUsuarioAdmin();
    const btnTop = document.getElementById('btn-admin-top-create');
    if (btnTop) {
      btnTop.style.display = esAdmin ? 'inline-flex' : 'none';
    }
    renderizarCatalogoOfertas();
  }

  function renderizarCatalogoOfertas() {
    const container = document.getElementById('offers-cards-grid');
    if (!container) return;

    container.innerHTML = '';
    const esAdmin = esUsuarioAdmin();
    const vuelos = uiState.vuelosCargados;

    // Tarjeta "+ Crear nuevo vuelo" en el grid si es admin
    if (esAdmin) {
      const createCard = document.createElement('div');
      createCard.className = 'card-create-flight-admin visible';
      createCard.onclick = () => abrirEditorVuelo(null);
      createCard.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <h3 style="font-size:1.125rem;font-weight:700;color:#1E3A8A;margin:0;">Crear nuevo vuelo</h3>
        <p style="font-size:0.8125rem;color:#475569;margin:0;">Agrega una nueva ruta o destino al catálogo oficial en la base de datos.</p>
      `;
      container.appendChild(createCard);
    }

    let filtrados = vuelos.filter(v => {
      if (uiState.currentCategoryFilter === 'todos') return true;
      if (uiState.currentCategoryFilter === 'oferta') return (v.precio_base_cop || 0) < 100000;
      return v.categoria === uiState.currentCategoryFilter;
    });

    if (filtrados.length === 0) filtrados = vuelos;

    filtrados.forEach(v => {
      const card = document.createElement('article');
      card.className = 'offer-flight-card';
      card.id = `card-vuelo-${v.codigo}`;
      card.onclick = () => interceptarAccionVuelo(v.codigo);

      const destinoParts = (v.destino || '').split('-');
      const iata = destinoParts[0] ? destinoParts[0].trim() : 'BOG';
      const ciudadNombre = destinoParts[1] ? destinoParts[1].trim().split(' ')[0] : v.destino;
      const fechaCorta = (v.fecha_salida || '2026-12-01').split('-').reverse().join('/');
      const precioExacto = formatoCOP(v.precio_base_cop || 71810);
      const tagText = v.tag_destacado || 'Recomendado para ti';
      const imgSrc = v.imagen_url || '/static/img/oferta-cali.jpg';

      card.innerHTML = `
        <div class="offer-card-media">
          <img src="${imgSrc}" alt="${ciudadNombre}" class="offer-card-img" loading="lazy">
          <span class="offer-badge-floating">${tagText}</span>
          <span class="offer-badge-direct">${v.tipo_aeronave || 'Airbus A320neo'}</span>

          <!-- Botones Flotantes de Edición Admin -->
          <div class="card-admin-floating-btns ${esAdmin ? 'visible' : ''}">
            <button type="button" class="btn-admin-pencil" onclick="event.stopPropagation(); AeroMinimalUI.abrirEditorVuelo('${v.codigo}')" title="Editar este vuelo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn-admin-trash" onclick="event.stopPropagation(); AeroMinimalUI.eliminarVueloAdmin('${v.codigo}')" title="Eliminar vuelo de la base de datos">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="offer-card-body">
          <h3 class="offer-destination-title">${ciudadNombre} (${iata})</h3>
          <p class="offer-flight-meta">Solo ida - ${fechaCorta} • ${v.duracion_estimada || '01h 30m'}</p>
          <div class="offer-price-block">
            <span class="offer-price-val tabular-nums">${precioExacto}</span>
            <span class="offer-price-note">Tasas incluidas</span>
          </div>
          <button type="button" class="btn-choose-seat btn-primary-flow" onclick="event.stopPropagation(); AeroMinimalUI.interceptarAccionVuelo('${v.codigo}')">
            <span>Reservar vuelo</span>
            <svg class="arrow-icon-flow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    // Tarjeta final CTA
    const closingCard = document.createElement('div');
    closingCard.className = 'closing-cta-card';
    closingCard.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h4 class="closing-cta-title">¿Todavia no encuentras tu destino preferido?</h4>
      <p class="closing-cta-sub">Explora mas rutas con tarifas dinamicas en pesos colombianos.</p>
      <button type="button" class="btn-closing-cta btn-secondary-glass" onclick="AeroMinimalUI.buscarVuelosHero()">
        <span>Ver todas las rutas</span>
      </button>
    `;
    container.appendChild(closingCard);
  }

  function buscarVuelosHero() {
    mostrarSeccion('explorar');
    const elGrid = document.getElementById('catalog-offers-section');
    if (elGrid) elGrid.scrollIntoView({ behavior: 'smooth' });
    showToast('Mostrando las mejores tarifas disponibles');
  }

  // =========================================================================
  // 8. GESTOR Y EDITOR DE VUELOS (ADMINISTRADOR — INTACTO 100%)
  // =========================================================================
  function abrirEditorVuelo(codigo) {
    const modal = document.getElementById('modal-admin-editor-vuelo');
    if (!modal) return;

    const titleEl = document.getElementById('editor-flight-modal-title');
    const badgeEl = document.getElementById('editor-mode-badge');
    const isNewInput = document.getElementById('editor-is-new-flight');
    const codeInput = document.getElementById('editor-flight-code');
    const origenInput = document.getElementById('editor-flight-origen');
    const destinoInput = document.getElementById('editor-flight-destino');
    const aeronaveInput = document.getElementById('editor-flight-aeronave');
    const priceInput = document.getElementById('editor-flight-price');
    const catInput = document.getElementById('editor-flight-categoria');
    const dateInput = document.getElementById('editor-flight-date');
    const timeInput = document.getElementById('editor-flight-time');
    const gateInput = document.getElementById('editor-flight-gate');
    const statusInput = document.getElementById('editor-flight-status');
    const urlInput = document.getElementById('editor-flight-image-url');
    const tagInput = document.getElementById('editor-flight-tag');
    const submitBtnText = document.getElementById('editor-submit-btn-text');

    if (!codigo) {
      isNewInput.value = '1';
      titleEl.textContent = 'Crear Nuevo Vuelo y Oferta';
      badgeEl.textContent = 'Nuevo Vuelo';
      badgeEl.style.background = '#10B981';

      const nuevoCod = 'AF' + Math.floor(1000 + Math.random() * 9000);
      codeInput.value = nuevoCod;
      codeInput.readOnly = false;
      origenInput.value = 'BOG - Bogotá El Dorado';
      destinoInput.value = 'CTG - Cartagena';
      aeronaveInput.value = 'Airbus A320neo';
      priceInput.value = 75900;
      catInput.value = 'playa';
      dateInput.value = '2026-12-05';
      timeInput.value = '10:00 AM';
      gateInput.value = 'B-04';
      statusInput.value = 'Programado';
      urlInput.value = '/static/img/oferta-cartagena.jpg';
      tagInput.value = 'Recomendado para ti';
      submitBtnText.textContent = 'Crear Vuelo en Base de Datos';
    } else {
      const vuelo = uiState.vuelosCargados.find(v => v.codigo === codigo);
      if (!vuelo) {
        showToast('Vuelo no encontrado', true);
        return;
      }
      isNewInput.value = '0';
      titleEl.textContent = `Editar Vuelo ${codigo}`;
      badgeEl.textContent = 'Modo Edición';
      badgeEl.style.background = '#0F172A';

      codeInput.value = vuelo.codigo;
      codeInput.readOnly = true;
      origenInput.value = vuelo.origen || 'BOG - Bogotá El Dorado';
      destinoInput.value = vuelo.destino || '';
      aeronaveInput.value = vuelo.tipo_aeronave || 'Airbus A320neo';
      priceInput.value = vuelo.precio_base_cop || 71810;
      catInput.value = vuelo.categoria || 'ciudad';
      dateInput.value = vuelo.fecha_salida || '2026-12-01';
      timeInput.value = vuelo.hora_salida_12h || '08:30 AM';
      gateInput.value = vuelo.puerta || 'B-03';
      statusInput.value = vuelo.estado || 'Programado';
      urlInput.value = vuelo.imagen_url || '/static/img/oferta-cali.jpg';
      tagInput.value = vuelo.tag_destacado || 'Recomendado para ti';
      submitBtnText.textContent = 'Guardar Cambios en Base de Datos';
    }

    actualizarPreviewFoto(urlInput.value);
    actualizarCalculoTarifaEditor();
    modal.classList.add('active');
  }

  function cerrarEditorVuelo() {
    const modal = document.getElementById('modal-admin-editor-vuelo');
    if (modal) modal.classList.remove('active');
  }

  function actualizarPreviewFoto(url) {
    const imgEl = document.getElementById('editor-flight-image-preview');
    if (imgEl && url) imgEl.src = url;
  }

  async function cargarFotoArchivo(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    // Vista previa inmediata con FileReader
    const reader = new FileReader();
    reader.onload = function (e) {
      actualizarPreviewFoto(e.target.result);
    };
    reader.readAsDataURL(file);

    showToast('Procesando y recortando imagen a 16:10 en el servidor...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;
      const response = await fetch('/api/admin/upload-imagen', {
        method: 'POST',
        headers: {
          'X-User-Role': sesion ? sesion.rol : 'admin'
        },
        body: formData
      });

      const res = await response.json();
      if (response.ok && res.exito && res.url) {
        const urlInput = document.getElementById('editor-flight-image-url');
        if (urlInput) urlInput.value = res.url;
        actualizarPreviewFoto(res.url);
        showToast(`Imagen procesada a 16:10 (${res.ancho}x${res.alto}px, ${res.peso_kb} KB)`);
      } else {
        showToast(res.error || 'Error al procesar la imagen', true);
      }
    } catch (err) {
      console.warn('Fallback a vista previa local:', err);
      showToast('Imagen cargada localmente');
    }
  }

  function actualizarCalculoTarifaEditor() {
    const priceInput = document.getElementById('editor-flight-price');
    const breakdownBox = document.getElementById('editor-price-breakdown');
    if (!priceInput || !breakdownBox) return;

    const base = Number(priceInput.value) || 0;
    const admin = 45000;
    const tasa = 158000;
    const iva = Math.round(base * 0.19);
    const total = base + admin + tasa + iva;

    breakdownBox.innerHTML = `
      Base: ${formatoCOP(base)} + Admin: ${formatoCOP(admin)} + Tasa: ${formatoCOP(tasa)} + IVA (19%): ${formatoCOP(iva)} = <strong>Total: ${formatoCOP(total)}</strong>
    `;
  }

  function alCambiarAeronaveEditor() {
    actualizarCalculoTarifaEditor();
  }

  async function guardarVueloAdmin() {
    const isNew = document.getElementById('editor-is-new-flight')?.value === '1';
    const codigo = document.getElementById('editor-flight-code')?.value?.trim()?.toUpperCase();
    const origen = document.getElementById('editor-flight-origen')?.value?.trim();
    const destino = document.getElementById('editor-flight-destino')?.value?.trim();
    const aeronave = document.getElementById('editor-flight-aeronave')?.value?.trim();
    const precioBase = Number(document.getElementById('editor-flight-price')?.value) || 71810;
    const categoria = document.getElementById('editor-flight-categoria')?.value;
    const fecha = document.getElementById('editor-flight-date')?.value;
    const hora = document.getElementById('editor-flight-time')?.value?.trim();
    const puerta = document.getElementById('editor-flight-gate')?.value?.trim();
    const estado = document.getElementById('editor-flight-status')?.value;
    const imagenUrl = document.getElementById('editor-flight-image-url')?.value?.trim() || '/static/img/oferta-cali.jpg';
    const tag = document.getElementById('editor-flight-tag')?.value?.trim() || 'Recomendado para ti';

    if (!codigo || !destino) {
      showToast('El código y destino son obligatorios', true);
      return;
    }

    const payload = {
      codigo, origen, destino,
      tipo_aeronave: aeronave,
      precio_base_cop: precioBase,
      categoria, fecha_salida: fecha,
      hora_salida_12h: hora, puerta, estado,
      imagen_url: imagenUrl, tag_destacado: tag
    };

    const endpoint = isNew ? '/api/admin/vuelos' : `/api/admin/vuelos/${encodeURIComponent(codigo)}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast(isNew ? `Vuelo ${codigo} creado en la base de datos.` : `Vuelo ${codigo} actualizado.`);
      cerrarEditorVuelo();
      await cargarVuelosCatalogo();
    } catch (e) {
      showToast('Error al conectar con la base de datos: ' + e.message, true);
    }
  }

  async function eliminarVueloAdmin(codigo) {
    if (!confirm(`¿Eliminar definitivamente el vuelo ${codigo} de la base de datos?`)) return;

    try {
      const res = await fetch(`/api/admin/vuelos/${encodeURIComponent(codigo)}`, {
        method: 'DELETE',
        headers: { 'X-User-Role': 'admin' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      showToast(`Vuelo ${codigo} eliminado exitosamente.`);
      const card = document.getElementById(`card-vuelo-${codigo}`);
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => {
          card.remove();
          cargarVuelosCatalogo();
        }, 200);
      } else {
        cargarVuelosCatalogo();
      }
    } catch (e) {
      showToast('Error al eliminar: ' + e.message, true);
    }
  }

  // =========================================================================
  // 9. COMPUERTA CONDICIONAL INTELIGENTE (AUTH GATE)
  // =========================================================================
  function interceptarAccionVuelo(codigoVuelo) {
    const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;
    if (!sesion) {
      window.pendingFlightId = codigoVuelo;
      if (window.AeroAuth && typeof window.AeroAuth.abrirLoginModal === 'function') {
        window.AeroAuth.abrirLoginModal(codigoVuelo);
      }
      return;
    }
    abrirMapaCabina(codigoVuelo);
  }

  // =========================================================================
  // 10. CHECKOUT MULTIPASO (SILLA -> DATOS -> PAGOS -> TICKET)
  // =========================================================================
  async function abrirMapaCabina(codigoVuelo) {
    const vuelo = uiState.vuelosCargados.find(v => v.codigo === codigoVuelo);
    if (!vuelo) {
      showToast('Vuelo no encontrado', true);
      return;
    }
    uiState.selectedFlight = vuelo;
    uiState.selectedSeat = null; // Cero preselección inicial

    const modal = document.getElementById('modal-cabin-map');
    if (!modal) return;

    const titleEl = document.getElementById('cabin-modal-title');
    const routeCities = document.getElementById('cabin-route-cities');
    const routeDate = document.getElementById('cabin-route-date');
    if (titleEl) titleEl.textContent = 'Elige tus asientos';
    if (routeCities) {
      const orig = vuelo.origen.split('-')[0].trim();
      const dest = vuelo.destino.split('-')[0].trim();
      routeCities.textContent = `${orig} a ${dest}`;
    }
    if (routeDate) routeDate.textContent = vuelo.fecha_salida || '1 de diciembre';

    // Resetear panel lateral de asiento al estado inicial vacío
    const badgeBox = document.getElementById('latam-seat-badge-box');
    const badgeNum = document.getElementById('latam-seat-number-badge');
    const paxCat = document.getElementById('latam-pax-category');
    const seatPrice = document.getElementById('latam-seat-price');
    const finalPrice = document.getElementById('latam-final-price-display');

    if (badgeBox) badgeBox.style.background = '#94A3B8';
    if (badgeNum) badgeNum.textContent = '--';
    if (paxCat) {
      paxCat.style.color = '#64748B';
      paxCat.textContent = 'Elige tu silla en el avión';
    }
    if (seatPrice) seatPrice.textContent = 'COP 0';
    if (finalPrice) finalPrice.textContent = formatoCOP(vuelo.precio_base_cop || 71810);

    // Botón Continuar desactivado hasta seleccionar silla
    const btnContinue = document.getElementById('btn-latam-continue');
    if (btnContinue) {
      btnContinue.setAttribute('disabled', 'disabled');
      btnContinue.classList.add('disabled');
    }

    iniciarTemporizadorRetencion();
    renderizarFuselajeAeronave(vuelo);
    actualizarDesgloseFinancieroPaso3();
    avanzarPasoCheckout(1);
    alternarMetodoPago('card');

    modal.classList.add('active');
  }

  function cerrarMapaCabina() {
    const modal = document.getElementById('modal-cabin-map');
    if (modal) modal.classList.remove('active');
    detenerTemporizadorRetencion();
  }

  // Intercepta clics en los números del Stepper superior para imponer bloqueo estricto
  function intentarNavegarPaso(paso) {
    if (paso === 1) {
      avanzarPasoCheckout(1);
      return;
    }
    if (paso === 2) {
      if (!uiState.selectedSeat) {
        showToast('Selecciona primero tu asiento en el avión para continuar', true);
        return;
      }
      avanzarPasoCheckout(2);
      return;
    }
    if (paso === 3) {
      if (!uiState.selectedSeat) {
        showToast('Selecciona primero tu asiento en el avión antes de ir a pagar', true);
        return;
      }
      if (uiState.currentCheckoutStep < 2) {
        showToast('Completa tus datos de pasajero en el Paso 2 antes de pagar', true);
        return;
      }
      avanzarPasoCheckout(3);
      return;
    }
  }

  function avanzarPasoCheckout(paso) {
    if (paso >= 2 && !uiState.selectedSeat) {
      showToast('Por favor selecciona una silla en el mapa de cabina antes de continuar.', true);
      return;
    }

    uiState.currentCheckoutStep = paso;

    // Actualizar Stepper Navigation con bloqueo estricto
    for (let p = 1; p <= 3; p++) {
      const stepNav = document.getElementById(`step-nav-${p}`);
      const stepContent = document.getElementById(`checkout-step-${p}`);
      if (stepNav) {
        stepNav.classList.toggle('active', p === paso);
        stepNav.classList.toggle('completed', p < paso);

        // Bloqueo visual estricto
        if (p === 1) {
          stepNav.classList.remove('disabled');
        } else if (p === 2) {
          stepNav.classList.toggle('disabled', !uiState.selectedSeat);
        } else if (p === 3) {
          stepNav.classList.toggle('disabled', !uiState.selectedSeat || paso < 2);
        }
      }
      if (stepContent) {
        stepContent.style.display = (p === paso) ? 'block' : 'none';
      }
    }

    const modalTitle = document.getElementById('cabin-modal-title');
    if (modalTitle) {
      if (paso === 1) modalTitle.textContent = 'Elige tus asientos';
      else if (paso === 2) modalTitle.textContent = 'Datos del Pasajero';
      else if (paso === 3) modalTitle.textContent = 'Pasarela de Pagos';
    }

    if (paso === 3) {
      actualizarDesgloseFinancieroPaso3();
      // Sincronizar nombres del titular con los datos del pasajero
      const paxName = document.getElementById('passenger-name-input')?.value.trim() || 'CARLOS ALBERTO MENDOZA';
      const vHolder = document.getElementById('cc-preview-name');
      if (vHolder) vHolder.textContent = paxName.toUpperCase();
    }
  }

  function iniciarTemporizadorRetencion() {
    detenerTemporizadorRetencion();
    uiState.retentionSeconds = 720;
    actualizarBadgeTimer();

    uiState.retentionInterval = setInterval(() => {
      uiState.retentionSeconds--;
      if (uiState.retentionSeconds <= 0) {
        detenerTemporizadorRetencion();
        showToast('El tiempo de retención pesimista de 12 minutos ha expirado.', true);
        cerrarMapaCabina();
      } else {
        actualizarBadgeTimer();
      }
    }, 1000);
  }

  function detenerTemporizadorRetencion() {
    if (uiState.retentionInterval) {
      clearInterval(uiState.retentionInterval);
      uiState.retentionInterval = null;
    }
  }

  function actualizarBadgeTimer() {
    const el = document.getElementById('retention-timer-clock');
    const elPay = document.getElementById('checkout-pessimistic-timer');
    const m = Math.floor(uiState.retentionSeconds / 60);
    const s = uiState.retentionSeconds % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} min`;
    if (el) el.textContent = timeStr;
    if (elPay) elPay.textContent = timeStr;
  }

  const CATEGORIAS_ASIENTO = {
    vip: {
      id: 'vip',
      nombre: 'AeroFlow+',
      color: '#E11D48',
      fill: '#FFE4E6',
      precio: 58075,
      esXL: true
    },
    forward: {
      id: 'forward',
      nombre: 'Más adelante',
      color: '#7C3AED',
      fill: '#F3E8FF',
      precio: 53630,
      esXL: false
    },
    emergency: {
      id: 'emergency',
      nombre: 'Salida de emergencia',
      color: '#65A30D',
      fill: '#ECFCCB',
      precio: 54587,
      esXL: true
    },
    standard: {
      id: 'standard',
      nombre: 'Estándar',
      color: '#4F46E5',
      fill: '#E0E7FF',
      precio: 31277,
      esXL: false
    }
  };

  const ASIENTOS_OCUPADOS_DEMO = new Set([
    '1A', '1C', '2D', '3B', '4A', '4B', '4C', '4D', '5A',
    '6B', '7C', '8B', '8C', '8D', '8E', '10A',
    '11A', '11B',
    '12F',
    '14B', '15E', '18C', '20A', '22D', '25B', '27F', '29C'
  ]);

  function renderizarFuselajeAeronave(vuelo) {
    const container = document.getElementById('fuselage-rows-list');
    if (!container) return;
    container.innerHTML = '';

    const destinoRaw = vuelo.destino || 'CLO - Cali';
    const origenRaw = vuelo.origen || 'MDE - Medellín';
    const destCiudad = destinoRaw.split('-')[1]?.trim().split(' ')[0] || destinoRaw;
    const origCiudad = origenRaw.split('-')[1]?.trim().split(' ')[0] || origenRaw;

    const elRouteCities = document.getElementById('cabin-route-cities');
    const elRouteDate = document.getElementById('cabin-route-date');
    const elAircraft = document.getElementById('cabin-aircraft-label');

    if (elRouteCities) elRouteCities.textContent = `${origCiudad} a ${destCiudad}`;
    if (elRouteDate) elRouteDate.textContent = '1 de diciembre';
    if (elAircraft) elAircraft.textContent = vuelo.tipo_aeronave ? vuelo.tipo_aeronave.replace('neo', '').trim() : 'Airbus 320';

    for (let f = 1; f <= 30; f++) {
      if (f === 11 || f === 12) {
        const exitBanner = document.createElement('div');
        exitBanner.className = 'emergency-exit-banner-row';
        exitBanner.innerHTML = '<span>&lt;-------- SALIDA DE EMERGENCIA --------&gt;</span>';
        container.appendChild(exitBanner);
      }

      let cat = CATEGORIAS_ASIENTO.standard;
      if (f <= 5) cat = CATEGORIAS_ASIENTO.vip;
      else if (f <= 10) cat = CATEGORIAS_ASIENTO.forward;
      else if (f === 12) cat = CATEGORIAS_ASIENTO.emergency;

      const rowDiv = document.createElement('div');
      rowDiv.className = 'cabin-latam-row';

      // Grupo Izquierdo: A, B, C
      ['A', 'B', 'C'].forEach(col => {
        const seatId = `${f}${col}`;
        const isOccupied = ASIENTOS_OCUPADOS_DEMO.has(seatId);
        rowDiv.appendChild(crearBotonSillaLATAM(f, col, cat, isOccupied));
      });

      // Pasillo Central con Número de Fila
      const aisleLabel = document.createElement('span');
      aisleLabel.className = 'latam-aisle-num';
      aisleLabel.textContent = f;
      rowDiv.appendChild(aisleLabel);

      // Grupo Derecho: D, E, F
      ['D', 'E', 'F'].forEach(col => {
        const seatId = `${f}${col}`;
        const isOccupied = ASIENTOS_OCUPADOS_DEMO.has(seatId);
        rowDiv.appendChild(crearBotonSillaLATAM(f, col, cat, isOccupied));
      });

      container.appendChild(rowDiv);
    }
  }

  function crearBotonSillaLATAM(fila, col, categoria, ocupada) {
    const seatId = `${fila}${col}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `latam-seat-btn tier-${categoria.id}`;
    btn.setAttribute('data-seat', seatId);
    btn.setAttribute('data-category', categoria.id);

    const esXL = categoria.esXL;
    const isSelected = uiState.selectedSeat?.id === seatId;

    let posicion = 'Medio';
    if (col === 'A' || col === 'F') posicion = 'Ventana';
    else if (col === 'C' || col === 'D') posicion = 'Pasillo';

    btn.setAttribute('data-position', posicion);

    if (ocupada) {
      btn.classList.add('occupied');
      btn.disabled = true;
      btn.title = `Asiento ${seatId} (${categoria.nombre}) - No disponible`;
      btn.innerHTML = `
        <svg class="latam-seat-svg" viewBox="0 0 32 36" fill="none">
          ${esXL ? '<rect x="8" y="2" width="16" height="6" rx="2" stroke="#CBD5E1" stroke-dasharray="2,2" stroke-width="1.2"/><text x="16" y="7" font-size="5" font-weight="bold" fill="#94A3B8" text-anchor="middle">XL</text>' : ''}
          <rect x="5" y="8" width="22" height="17" rx="3" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
          <path d="M2 13v9a2 2 0 0 0 2 2h1M30 13v9a2 2 0 0 1-2 2h-1" stroke="#CBD5E1" stroke-width="1.5"/>
          <line x1="11" y1="12" x2="21" y2="21" stroke="#94A3B8" stroke-width="1.5"/>
          <line x1="21" y1="12" x2="11" y2="21" stroke="#94A3B8" stroke-width="1.5"/>
          <rect x="6" y="24" width="20" height="9" rx="2" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
        </svg>
      `;
    } else {
      btn.title = `Asiento ${seatId} (${categoria.nombre}) • COP ${categoria.precio.toLocaleString('es-CO')} • ${posicion}`;
      if (isSelected) btn.classList.add('selected');

      const strokeColor = categoria.color;
      const fillColor = isSelected ? strokeColor : categoria.fill;
      const checkOrContent = isSelected
        ? `<path d="M10 17l4 4 8-8" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : '';

      btn.innerHTML = `
        <svg class="latam-seat-svg" viewBox="0 0 32 36" fill="none">
          ${esXL ? `<rect x="8" y="2" width="16" height="6" rx="2" stroke="${isSelected ? '#FFFFFF' : strokeColor}" stroke-dasharray="2,2" stroke-width="1.2"/><text x="16" y="7" font-size="5" font-weight="bold" fill="${isSelected ? '#FFFFFF' : strokeColor}" text-anchor="middle">XL</text>` : ''}
          <rect x="5" y="8" width="22" height="17" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
          <path d="M2 13v9a2 2 0 0 0 2 2h1M30 13v9a2 2 0 0 1-2 2h-1" stroke="${strokeColor}" stroke-width="1.5"/>
          ${checkOrContent}
          <rect x="6" y="24" width="20" height="9" rx="2" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        </svg>
      `;

      btn.onclick = () => seleccionarSillaLATAM(seatId, categoria, posicion);
    }

    return btn;
  }

  function seleccionarSillaLATAM(seatId, categoria, posicion) {
    uiState.selectedSeat = {
      id: seatId,
      categoria: categoria.nombre,
      catId: categoria.id,
      color: categoria.color,
      fill: categoria.fill,
      precio: categoria.precio,
      posicion: posicion,
      esXL: categoria.esXL
    };

    document.querySelectorAll('.latam-seat-btn').forEach(btn => {
      const sId = btn.getAttribute('data-seat');
      if (btn.classList.contains('occupied')) return;

      const btnCatId = btn.getAttribute('data-category');
      const cat = CATEGORIAS_ASIENTO[btnCatId] || CATEGORIAS_ASIENTO.standard;
      const isSelected = (sId === seatId);
      btn.classList.toggle('selected', isSelected);

      const strokeColor = cat.color;
      const fillColor = isSelected ? strokeColor : cat.fill;
      const checkOrContent = isSelected
        ? `<path d="M10 17l4 4 8-8" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : '';

      btn.innerHTML = `
        <svg class="latam-seat-svg" viewBox="0 0 32 36" fill="none">
          ${cat.esXL ? `<rect x="8" y="2" width="16" height="6" rx="2" stroke="${isSelected ? '#FFFFFF' : strokeColor}" stroke-dasharray="2,2" stroke-width="1.2"/><text x="16" y="7" font-size="5" font-weight="bold" fill="${isSelected ? '#FFFFFF' : strokeColor}" text-anchor="middle">XL</text>` : ''}
          <rect x="5" y="8" width="22" height="17" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
          <path d="M2 13v9a2 2 0 0 0 2 2h1M30 13v9a2 2 0 0 1-2 2h-1" stroke="${strokeColor}" stroke-width="1.5"/>
          ${checkOrContent}
          <rect x="6" y="24" width="20" height="9" rx="2" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        </svg>
      `;
    });

    const badgeBox = document.getElementById('latam-seat-badge-box');
    const badgeNum = document.getElementById('latam-seat-number-badge');
    const paxCat = document.getElementById('latam-pax-category');
    const seatPrice = document.getElementById('latam-seat-price');
    const finalPrice = document.getElementById('latam-final-price-display');

    if (badgeBox) badgeBox.style.background = categoria.color;
    if (badgeNum) badgeNum.textContent = seatId;
    if (paxCat) {
      paxCat.style.color = categoria.color;
      paxCat.textContent = `${categoria.nombre} | ${posicion}`;
    }
    if (seatPrice) seatPrice.textContent = `COP ${categoria.precio.toLocaleString('es-CO')}`;

    const baseVuelo = uiState.selectedFlight?.precio_base_cop || 71810;
    const total = baseVuelo + categoria.precio;
    if (finalPrice) finalPrice.textContent = `COP ${total.toLocaleString('es-CO')}`;

    // Habilitar instantáneamente el botón "Agregar y continuar" y el Paso 2
    const btnContinue = document.getElementById('btn-latam-continue');
    if (btnContinue) {
      btnContinue.removeAttribute('disabled');
      btnContinue.classList.remove('disabled');
    }
    const step2 = document.getElementById('step-nav-2');
    if (step2) {
      step2.classList.remove('disabled');
    }

    actualizarDesgloseFinancieroPaso3();
  }

  function toggleAccordion(catKey) {
    const categories = ['vip', 'forward', 'emergency', 'standard'];
    const body = document.getElementById(`acc-body-${catKey}`);
    const card = document.getElementById(`acc-card-${catKey}`);
    if (!body || !card) return;

    const willOpen = (body.style.display === 'none');

    // Cerrar los otros acordeones para mantener la columna izquierda compacta y sin desbordes
    categories.forEach(k => {
      const b = document.getElementById(`acc-body-${k}`);
      const c = document.getElementById(`acc-card-${k}`);
      if (b && c) {
        b.style.display = 'none';
        c.classList.remove('active');
        const chev = c.querySelector('.acc-chevron-svg');
        if (chev) chev.style.transform = 'rotate(0deg)';
      }
    });

    if (willOpen) {
      body.style.display = 'block';
      card.classList.add('active');
      const chevron = card.querySelector('.acc-chevron-svg');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  }

  function elegirAsientoDespues() {
    uiState.selectedSeat = {
      id: '16C',
      categoria: 'Estándar',
      catId: 'standard',
      color: '#4F46E5',
      fill: '#E0E7FF',
      precio: 0,
      posicion: 'Pasillo',
      esXL: false
    };

    const btnContinue = document.getElementById('btn-latam-continue');
    if (btnContinue) {
      btnContinue.removeAttribute('disabled');
      btnContinue.classList.remove('disabled');
    }
    const step2 = document.getElementById('step-nav-2');
    if (step2) {
      step2.classList.remove('disabled');
    }

    showToast('Asiento estándar 16C asignado automáticamente sin costo.');
    actualizarDesgloseFinancieroPaso3();
    avanzarPasoCheckout(2);
  }

  function alternarDetalleImpuestos() {
    const drop = document.getElementById('tax-details-dropdown');
    if (drop) {
      drop.style.display = (drop.style.display === 'none') ? 'flex' : 'none';
    }
  }

  function alternarDetallePrecioFinal() {
    showToast('Incluye tarifa de vuelo base y cargo por asiento asignado.');
  }

  function alCambiarEquipajeBodega(tieneEquipaje) {
    uiState.passengerData.hasLuggageHold = tieneEquipaje;
    actualizarDesgloseFinancieroPaso3();
  }

  function actualizarDesgloseFinancieroPaso3() {
    const vuelo = uiState.selectedFlight || { codigo: 'AF2025', origen: 'BOG', destino: 'CTG', precio_base_cop: 71810, tipo_aeronave: 'Airbus A320neo' };
    const seat = uiState.selectedSeat || { id: '5B', categoria: 'AeroFlow+', precio: 58075, esXL: true };

    const origenIATA = (vuelo.origen || 'BOG').split('-')[0].trim();
    const destinoIATA = (vuelo.destino || 'CTG').split('-')[0].trim();
    const nombrePax = document.getElementById('passenger-name-input')?.value.trim() || 'Carlos Alberto Mendoza';

    const elRoute = document.getElementById('pfs-route');
    const elPlane = document.getElementById('pfs-plane');
    const elPax = document.getElementById('pfs-pax-name');
    const elSeatText = document.getElementById('pfs-seat-text');

    if (elRoute) elRoute.textContent = `${origenIATA} ➔ ${destinoIATA}`;
    if (elPlane) elPlane.textContent = vuelo.tipo_aeronave || 'Airbus A320neo';
    if (elPax) elPax.textContent = nombrePax;
    if (elSeatText) elSeatText.textContent = `${seat.id} • ${seat.categoria}${seat.esXL ? ' XL' : ''}`;

    const baseVuelo = vuelo.precio_base_cop || 71810;
    const precioSilla = seat.precio || 0;
    const vueloMasSilla = baseVuelo + precioSilla;

    const equipaje = uiState.passengerData?.hasLuggageHold ? 65000 : 0;
    const admin = 45000;
    const tasaAeropuerto = 158000;
    const iva = Math.round(vueloMasSilla * 0.19);
    const totalImpuestos = admin + tasaAeropuerto + iva;
    const totalPagar = vueloMasSilla + equipaje + totalImpuestos;

    const elFlightSeat = document.getElementById('pay-clean-flight-seat');
    const elLuggage = document.getElementById('pay-clean-luggage');
    const elTaxes = document.getElementById('pay-clean-taxes');
    const elTotal = document.getElementById('pay-clean-total');
    const btnPay = document.getElementById('btn-confirmar-pago-text');

    if (elFlightSeat) elFlightSeat.textContent = `COP ${vueloMasSilla.toLocaleString('es-CO')}`;
    if (elLuggage) elLuggage.textContent = `COP ${equipaje.toLocaleString('es-CO')}`;
    if (elTaxes) elTaxes.textContent = `COP ${totalImpuestos.toLocaleString('es-CO')}`;
    if (elTotal) elTotal.textContent = `COP ${totalPagar.toLocaleString('es-CO')}`;

    const elTaxAdmin = document.getElementById('pay-tax-admin');
    const elTaxAirport = document.getElementById('pay-tax-airport');
    const elTaxIva = document.getElementById('pay-tax-iva');
    if (elTaxAdmin) elTaxAdmin.textContent = `COP ${admin.toLocaleString('es-CO')}`;
    if (elTaxAirport) elTaxAirport.textContent = `COP ${tasaAeropuerto.toLocaleString('es-CO')}`;
    if (elTaxIva) elTaxIva.textContent = `COP ${iva.toLocaleString('es-CO')}`;

    if (btnPay) btnPay.textContent = `Pagar COP ${totalPagar.toLocaleString('es-CO')} y Emitir Tiquete Oficial`;
  }

  // =========================================================================
  // 11. RESTAURACIÓN DE LA PASARELA DE PAGOS (TARJETA, PSE, NEQUI)
  // =========================================================================
  function alternarMetodoPago(metodo) {
    uiState.activePaymentMethod = metodo;

    const btns = document.querySelectorAll('.pay-tab-btn');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-pay') === metodo));

    const panels = {
      card: document.getElementById('pay-panel-card'),
      pse: document.getElementById('pay-panel-pse'),
      nequi: document.getElementById('pay-panel-nequi')
    };

    Object.keys(panels).forEach(key => {
      if (panels[key]) panels[key].style.display = (key === metodo) ? 'block' : 'none';
    });
  }

  function alCambiarTarjetaCredito() {
    const numInput = document.getElementById('card-number-input');
    const expInput = document.getElementById('card-exp-input');
    const nameInput = document.getElementById('passenger-name-input');

    const numPrev = document.getElementById('cc-preview-number');
    const expPrev = document.getElementById('cc-preview-exp');
    const namePrev = document.getElementById('cc-preview-name');
    const brandDisplay = document.getElementById('vcard-brand-display');

    if (numPrev && numInput) {
      const val = numInput.value.trim();
      numPrev.textContent = val ? val : '•••• •••• •••• ••••';
      
      // Detección de Franquicia
      if (brandDisplay) {
        if (val.startsWith('4')) brandDisplay.textContent = 'VISA SIGNATURE';
        else if (val.startsWith('5')) brandDisplay.textContent = 'MASTERCARD BLACK';
        else if (val.startsWith('3')) brandDisplay.textContent = 'AMERICAN EXPRESS PLATINUM';
        else brandDisplay.textContent = 'AERO FLOW PLATINUM';
      }
    }
    if (expPrev && expInput) {
      expPrev.textContent = expInput.value.trim() || '12/28';
    }
    if (namePrev && nameInput) {
      namePrev.textContent = nameInput.value.trim().toUpperCase() || 'CARLOS ALBERTO MENDOZA';
    }
  }

  function alCambiarCelularNequi() {
    const phoneInput = document.getElementById('nequi-phone-number');
    const banner = document.getElementById('nequi-push-banner');
    if (phoneInput && banner) {
      banner.textContent = `Notificación simulada enviada a ${phoneInput.value}: Abre tu app Nequi en tu celular para confirmar el pago.`;
    }
  }

  async function procesarPagoReserva() {
    if (!uiState.selectedSeat) {
      showToast('Por favor selecciona una silla en el mapa interactivo del avión.', true);
      return;
    }

    const docType = document.getElementById('pax-doc-type')?.value || 'CC';
    const docNumber = document.getElementById('passenger-doc-input')?.value.trim() || '101829384';
    const fullName = document.getElementById('passenger-name-input')?.value.trim() || 'Carlos Alberto Mendoza';
    const email = document.getElementById('passenger-email-input')?.value.trim() || 'carlos.mendoza@aeroflow.com';
    const phone = document.getElementById('passenger-phone-input')?.value.trim() || '+57 310 987 6543';

    const vuelo = uiState.selectedFlight;
    const pnr = 'AF' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const recibo = `REC-BOG-${Math.floor(1000 + Math.random() * 9000)}`;

    const isVip = uiState.selectedSeat.clase === 'VIP';
    const basePrice = vuelo.precio_base_cop || 71810;
    const tarifaBase = Math.round(basePrice * (isVip ? 1.6 : 1.0));
    const admin = 45000;
    const tasa = 158000;
    const equipaje = uiState.passengerData.hasLuggageHold ? 65000 : 0;
    const iva = Math.round(tarifaBase * 0.19);
    const totalPagar = tarifaBase + admin + tasa + equipaje + iva;

    const nuevaReserva = {
      pnr,
      recibo,
      vueloCodigo: vuelo.codigo,
      origen: vuelo.origen,
      destino: vuelo.destino,
      fecha: vuelo.fecha_salida,
      hora: vuelo.hora_salida_12h || '08:30 AM',
      puerta: vuelo.puerta || 'B-03',
      tipoAeronave: vuelo.tipo_aeronave || 'Airbus A320neo',
      asiento: uiState.selectedSeat.id,
      clase: isVip ? 'VIP Executive' : 'Economy',
      pasajeroDoc: `${docType}-${docNumber}`,
      pasajeroNombre: fullName,
      pasajeroEmail: email,
      pasajeroPhone: phone,
      metodoPago: uiState.activePaymentMethod,
      tarifaTotalCOP: totalPagar,
      estado: 'Confirmado'
    };

    uiState.misReservas.unshift(nuevaReserva);

    cerrarMapaCabina();
    showToast(`¡Pago exitoso! Tiquete ${pnr} emitido. Recibo ${recibo}.`);
    mostrarSeccion('viajes');
  }

  // =========================================================================
  // 12. GENERADOR DEL PASE DE ABORDAR DE DOBLE TALÓN TROQUELADO (FOTOGRAFÍA + AVATAR)
  // =========================================================================
  function obtenerFotoDestino(reserva) {
    if (reserva.imagen_url) return reserva.imagen_url;
    const d = ((reserva.destino || '') + ' ' + (reserva.origen || '')).toUpperCase();
    if (d.includes('MDE') || d.includes('MEDELL')) return '/static/img/oferta-medellin.jpg';
    if (d.includes('CLO') || d.includes('CALI')) return '/static/img/oferta-cali.jpg';
    if (d.includes('MTR') || d.includes('MONTER')) return '/static/img/oferta-monteria.jpg';
    if (d.includes('CTG') || d.includes('CARTAGENA')) return '/static/img/oferta-cartagena.jpg';
    if (d.includes('SMR') || d.includes('SANTA MARTA')) return '/static/img/oferta-santamarta.jpg';
    if (d.includes('BAQ') || d.includes('BARRANQUILLA')) return '/static/img/oferta-barranquilla.jpg';
    if (d.includes('MIA') || d.includes('MIAMI')) return '/static/img/oferta-miami.jpg';
    return '/static/img/oferta-cartagena.jpg';
  }

  function generarHTMLPaseDobleTalon(reserva, idx, puedeEscanearEnRampa = true) {
    const isVip = reserva.clase.includes('VIP');
    const badgeClass = isVip ? 'style="background:#3B82F6;color:#FFFFFF;"' : 'style="background:#0F172A;color:#FFFFFF;"';
    const iataOrigen = (reserva.origen || 'BOG').split('-')[0].trim();
    const iataDestino = (reserva.destino || 'CTG').split('-')[0].trim();
    const esAbordado = reserva.estado === 'Abordado';
    const fotoDestino = obtenerFotoDestino(reserva);

    return `
      <div class="printable-ticket-card stagger-item-${(idx % 3) + 1}" id="ticket-card-${idx}">
        
        ${esAbordado ? '<div class="stamp-abordado">ABORDADO</div>' : ''}

        <!-- Tira Superior con Fotografía Real de Destino y Degradado Oscuro -->
        <div class="ticket-photo-banner" style="background-image: url('${fotoDestino}');">
          <div class="ticket-photo-banner-overlay"></div>
          <div class="ticket-photo-banner-content">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2">
                <path d="M22 2L11 13"></path>
                <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
              </svg>
              <span class="ticket-brand-logo-text" style="color:#FFFFFF;font-weight:800;letter-spacing:0.04em;">AERO FLOW AIRLINES</span>
            </div>
            <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#E2E8F0;">
              PASE DE ABORDAR OFICIAL • ${reserva.recibo || 'REC-BOG-2026'}
            </div>
          </div>
        </div>

        <!-- Cuerpo del Boleto con Troquel -->
        <div class="ticket-body-grid">
          
          <!-- Lado Izquierdo: Ruta, Horarios y Pasajero -->
          <div class="ticket-left-main">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span class="pass-status-pill" ${badgeClass}>
                ${isVip ? 'VIP FIRST CLASS' : 'CLASE ECONOMY'}
              </span>
              <span class="pass-status-pill ${esAbordado ? 'status-abordado' : ''}" id="badge-status-${idx}">
                ${reserva.estado}
              </span>
            </div>

            <!-- Gran Ruta Aérea IATA -->
            <div class="ticket-route-large">
              <span class="iata-large-text">${iataOrigen}</span>
              <svg class="plane-route-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
              <span class="iata-large-text">${iataDestino}</span>
              <span style="margin-left:auto;font-size:0.8125rem;color:#64748B;font-weight:600;">
                ${reserva.tipoAeronave || 'Airbus A320neo'}
              </span>
            </div>

            <!-- Grilla Técnica del Vuelo con Avatar Fotográfico de Pasajero -->
            <div class="ticket-grid-meta">
              <div>
                <span class="ticket-meta-label">Pasajero</span>
                <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
                  <div class="ticket-pax-avatar">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <p class="ticket-meta-val" style="margin:0;">${reserva.pasajeroNombre}</p>
                </div>
              </div>
              <div>
                <span class="ticket-meta-label">Documento</span>
                <p class="ticket-meta-val">${reserva.pasajeroDoc}</p>
              </div>
              <div>
                <span class="ticket-meta-label">Codigo PNR</span>
                <p class="ticket-meta-val" style="color:#0284C7;font-family:var(--font-mono, monospace);">${reserva.pnr}</p>
              </div>
              <div>
                <span class="ticket-meta-label">Vuelo</span>
                <p class="ticket-meta-val">${reserva.vueloCodigo}</p>
              </div>
              <div>
                <span class="ticket-meta-label">Puerta</span>
                <p class="ticket-meta-val">${reserva.puerta}</p>
              </div>
              <div>
                <span class="ticket-meta-label">Salida (12H)</span>
                <p class="ticket-meta-val">${reserva.hora} • ${reserva.fecha}</p>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:0.75rem;color:#64748B;">
              <span>Total Pagado: <strong>${formatoCOP(reserva.tarifaTotalCOP || 288454)}</strong></span>
              <span>Metodo: <strong>${(reserva.metodoPago || 'Tarjeta').toUpperCase()}</strong></span>
            </div>
          </div>

          <!-- Lado Derecho: Talón Desprendible de Rampa (Ancho 195px Sin Recortes) -->
          <div class="ticket-right-stub">
            <div>
              <span style="font-size:0.6875rem;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;">BOARDING PASS</span>
              <p style="font-size:1.125rem;font-weight:800;color:#0F172A;margin:2px 0 0;">${reserva.vueloCodigo}</p>
            </div>

            <div class="ticket-seat-stub-box">
              <span style="font-size:0.6875rem;font-weight:800;color:#E11D48;text-transform:uppercase;">ASIENTO</span>
              <div class="stub-seat-number">${reserva.asiento}</div>
              <span style="font-size:0.6875rem;font-weight:700;color:#64748B;">${isVip ? 'ZONA VIP FIFO' : 'ZONA GENERAL'}</span>
            </div>

            <!-- Código QR Nítido Completo -->
            <svg width="68" height="68" viewBox="0 0 100 100" style="background:#FFFFFF;padding:4px;border:1px solid #CBD5E1;border-radius:6px;">
              <rect x="0" y="0" width="30" height="30" fill="#0F172A"/>
              <rect x="5" y="5" width="20" height="20" fill="#FFFFFF"/>
              <rect x="10" y="10" width="10" height="10" fill="#0F172A"/>
              <rect x="70" y="0" width="30" height="30" fill="#0F172A"/>
              <rect x="75" y="5" width="20" height="20" fill="#FFFFFF"/>
              <rect x="80" y="10" width="10" height="10" fill="#0F172A"/>
              <rect x="0" y="70" width="30" height="30" fill="#0F172A"/>
              <rect x="5" y="75" width="20" height="20" fill="#FFFFFF"/>
              <rect x="10" y="80" width="10" height="10" fill="#0F172A"/>
              <rect x="40" y="15" width="10" height="20" fill="#0F172A"/>
              <rect x="45" y="45" width="15" height="15" fill="#0F172A"/>
              <rect x="70" y="60" width="20" height="10" fill="#0F172A"/>
              <rect x="65" y="80" width="25" height="15" fill="#0F172A"/>
            </svg>

            <!-- Código de Barras Lineal Completo -->
            <svg width="100%" height="20" viewBox="0 0 160 20" style="fill:#334155;margin-top:6px;">
              <rect x="0" y="0" width="3" height="20"/>
              <rect x="6" y="0" width="2" height="20"/>
              <rect x="11" y="0" width="4" height="20"/>
              <rect x="18" y="0" width="1" height="20"/>
              <rect x="22" y="0" width="5" height="20"/>
              <rect x="30" y="0" width="2" height="20"/>
              <rect x="35" y="0" width="4" height="20"/>
              <rect x="42" y="0" width="2" height="20"/>
              <rect x="47" y="0" width="6" height="20"/>
              <rect x="56" y="0" width="3" height="20"/>
              <rect x="62" y="0" width="2" height="20"/>
              <rect x="67" y="0" width="5" height="20"/>
              <rect x="75" y="0" width="1" height="20"/>
              <rect x="79" y="0" width="6" height="20"/>
              <rect x="88" y="0" width="3" height="20"/>
              <rect x="94" y="0" width="2" height="20"/>
              <rect x="99" y="0" width="4" height="20"/>
              <rect x="106" y="0" width="2" height="20"/>
              <rect x="111" y="0" width="5" height="20"/>
              <rect x="119" y="0" width="2" height="20"/>
              <rect x="124" y="0" width="6" height="20"/>
              <rect x="133" y="0" width="2" height="20"/>
              <rect x="138" y="0" width="4" height="20"/>
              <rect x="145" y="0" width="2" height="20"/>
              <rect x="150" y="0" width="5" height="20"/>
            </svg>
            <span style="font-size:0.625rem;font-family:monospace;letter-spacing:0.18em;color:#64748B;">${reserva.pnr}</span>

            ${!puedeEscanearEnRampa ? `
              <!-- Botón de Abordaje Manual Uno a Uno en Cola FIFO -->
              <button type="button" class="btn-ticket-board-manual ${esAbordado ? 'boarded' : ''}" 
                      id="btn-board-ticket-queue-${idx}" 
                      onclick="AeroMinimalUI.abordarTicketEnFila(${idx})" 
                      style="width:100%;margin-top:10px;" 
                      ${esAbordado ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${esAbordado ? 'Abordado' : 'Abordar este pasajero'}</span>
              </button>
            ` : `
              <!-- Botón de Abordaje Individual en Portal Pasajero -->
              <button type="button" class="btn-board-flight ${esAbordado ? 'boarded' : ''}" 
                      id="btn-board-stub-${idx}" 
                      onclick="AeroMinimalUI.abordarVueloPasajero(${idx})" 
                      style="width:100%;margin-top:10px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${esAbordado ? 'Abordado' : 'Abordar'}</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 13. ACTUALIZACIÓN DEL PORTAL DEL PASAJERO ("MIS VIAJES")
  // =========================================================================
  function asegurarReservaDemo() {
    if (uiState.misReservas.length === 0) {
      uiState.misReservas.push({
        pnr: 'AF7K9B',
        recibo: 'REC-BOG-8921',
        vueloCodigo: 'AF2025',
        origen: 'BOG - Bogotá El Dorado',
        destino: 'MDE - Medellín',
        fecha: '2026-12-02',
        hora: '07:15 AM',
        puerta: 'B-03',
        tipoAeronave: 'Airbus A320neo',
        asiento: '1A',
        clase: 'VIP Executive',
        pasajeroDoc: 'CC-101829384',
        pasajeroNombre: 'Carlos Alberto Mendoza',
        pasajeroEmail: 'carlos.mendoza@aeroflow.com',
        pasajeroPhone: '+57 310 987 6543',
        metodoPago: 'Tarjeta Bancaria',
        tarifaTotalCOP: 331500,
        estado: 'Confirmado'
      });
    }
  }

  function actualizarPortalPasajero() {
    asegurarReservaDemo();

    const container = document.getElementById('passenger-portal-tickets-list');
    if (!container) return;

    // Actualizar Estadísticas
    const statTotal = document.getElementById('stat-pax-total-vuelos');
    const statRecibo = document.getElementById('stat-pax-recibo');
    if (statTotal) statTotal.textContent = `${uiState.misReservas.length} vuelo${uiState.misReservas.length > 1 ? 's' : ''}`;
    if (statRecibo && uiState.misReservas[0]) statRecibo.textContent = uiState.misReservas[0].recibo;

    // Actualizar Línea de Tiempo del Vuelo Más Próximo
    const proxima = uiState.misReservas[0];
    if (proxima) {
      const routeTitle = document.getElementById('timeline-route-title');
      if (routeTitle) routeTitle.textContent = `${proxima.origen} -> ${proxima.destino} • Vuelo ${proxima.vueloCodigo}`;
    }

    container.innerHTML = '';
    uiState.misReservas.forEach((reserva, idx) => {
      container.innerHTML += generarHTMLPaseDobleTalon(reserva, idx, true);
    });
  }

  // =========================================================================
  // 14. CONSOLA DE PUERTA Y ABORDAJE AUTOMÁTICO MASIVO ("ABORDAR")
  // =========================================================================
  function poblarSelectVuelosGate() {
    const selector = document.getElementById('gate-flight-selector');
    if (!selector) return;

    selector.innerHTML = '';
    const codigosVistos = new Set();

    uiState.vuelosCargados.forEach(v => {
      if (!codigosVistos.has(v.codigo)) {
        codigosVistos.add(v.codigo);
        const opt = document.createElement('option');
        opt.value = v.codigo;
        opt.textContent = `${v.codigo} — ${v.origen.split('-')[0].trim()} -> ${v.destino.split('-')[0].trim()}`;
        if (v.codigo === uiState.activeGateFlight) opt.selected = true;
        selector.appendChild(opt);
      }
    });

    if (selector.options.length > 0 && !uiState.activeGateFlight) {
      uiState.activeGateFlight = selector.options[0].value;
    }
  }

  function cambiarVueloConsolaAbordaje(codigo) {
    uiState.activeGateFlight = codigo;
    detenerAbordajeAutomatico();
    inicializarConsolaAbordaje();
  }

  function generarManifiestoCompletoVuelo(codigoVuelo) {
    const vuelo = uiState.vuelosCargados.find(v => v.codigo === codigoVuelo) || {
      codigo: codigoVuelo || 'AF2025',
      origen: 'BOG - Bogotá El Dorado',
      destino: 'MDE - Medellín',
      tipo_aeronave: 'Airbus A320neo',
      puerta: 'B-03',
      hora_salida_12h: '08:30 AM',
      fecha_salida: '2026-12-02'
    };

    // Actualizar cabecera de la puerta
    const gateBadge = document.getElementById('gate-number-badge');
    const planeBadge = document.getElementById('gate-plane-badge');
    if (gateBadge) gateBadge.textContent = `Puerta ${vuelo.puerta || 'B-03'}`;
    if (planeBadge) planeBadge.textContent = vuelo.tipo_aeronave || 'Airbus A320neo';

    // 1. Obtener tiquetes del usuario para este vuelo
    const ticketsUsuario = uiState.misReservas.filter(r => r.vueloCodigo === vuelo.codigo);

    // 2. Generar pasajeros complementarios de rampa para fila completa y realista
    const nombresDemo = [
      { doc: '102938475', nombre: 'Alejandra Morales', asiento: '1B', clase: 'VIP Executive' },
      { doc: '109283746', nombre: 'Gabriel Restrepo', asiento: '2A', clase: 'VIP Executive' },
      { doc: '103847291', nombre: 'Mariana Duque', asiento: '2B', clase: 'VIP Executive' },
      { doc: '104829103', nombre: 'Felipe Jaramillo', asiento: '5A', clase: 'Economy' },
      { doc: '105839201', nombre: 'Camila Ospina', asiento: '5B', clase: 'Economy' },
      { doc: '106829402', nombre: 'Andres Velez', asiento: '5C', clase: 'Economy' },
      { doc: '107839204', nombre: 'Sofia Castro', asiento: '6A', clase: 'Economy' },
      { doc: '108849205', nombre: 'Mateo Cardenas', asiento: '6B', clase: 'Economy' }
    ];

    const todos = [];

    // Prioridad 1: Sillas VIP del usuario y demo
    ticketsUsuario.filter(t => t.clase.includes('VIP')).forEach(t => todos.push(t));
    nombresDemo.filter(d => d.clase.includes('VIP')).forEach(d => {
      if (!todos.some(x => x.asiento === d.asiento)) {
        todos.push({
          pnr: 'AF' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          recibo: `REC-BOG-${Math.floor(1000 + Math.random() * 9000)}`,
          vueloCodigo: vuelo.codigo,
          origen: vuelo.origen,
          destino: vuelo.destino,
          fecha: vuelo.fecha_salida,
          hora: vuelo.hora_salida_12h,
          puerta: vuelo.puerta,
          tipoAeronave: vuelo.tipo_aeronave,
          asiento: d.asiento,
          clase: d.clase,
          pasajeroDoc: `CC-${d.doc}`,
          pasajeroNombre: d.nombre,
          tarifaTotalCOP: 331500,
          estado: 'En Fila FIFO'
        });
      }
    });

    // Prioridad 2: Sillas Economy
    ticketsUsuario.filter(t => !t.clase.includes('VIP')).forEach(t => todos.push(t));
    nombresDemo.filter(d => !d.clase.includes('VIP')).forEach(d => {
      if (!todos.some(x => x.asiento === d.asiento)) {
        todos.push({
          pnr: 'AF' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          recibo: `REC-BOG-${Math.floor(1000 + Math.random() * 9000)}`,
          vueloCodigo: vuelo.codigo,
          origen: vuelo.origen,
          destino: vuelo.destino,
          fecha: vuelo.fecha_salida,
          hora: vuelo.hora_salida_12h,
          puerta: vuelo.puerta,
          tipoAeronave: vuelo.tipo_aeronave,
          asiento: d.asiento,
          clase: d.clase,
          pasajeroDoc: `CC-${d.doc}`,
          pasajeroNombre: d.nombre,
          tarifaTotalCOP: 288454,
          estado: 'En Fila FIFO'
        });
      }
    });

    uiState.flightQueueTickets = todos;
    return todos;
  }

  function inicializarConsolaAbordaje() {
    poblarSelectVuelosGate();
    const codigo = uiState.activeGateFlight || 'AF2025';
    const tickets = generarManifiestoCompletoVuelo(codigo);

    const container = document.getElementById('gate-fifo-queue-list');
    const badgeTotal = document.getElementById('fifo-total-count-badge');
    if (!container) return;

    container.innerHTML = '';
    tickets.forEach((t, idx) => {
      container.innerHTML += generarHTMLPaseDobleTalon(t, idx, false);
    });

    if (badgeTotal) badgeTotal.textContent = `Total en fila: ${tickets.length}`;
    actualizarProgresoPuerta();
  }

  function actualizarProgresoPuerta() {
    const tickets = uiState.flightQueueTickets;
    const abordados = tickets.filter(t => t.estado === 'Abordado').length;
    const total = tickets.length;
    const pct = total > 0 ? Math.round((abordados / total) * 100) : 0;

    const counterText = document.getElementById('gate-counter-text');
    const progressFill = document.getElementById('gate-progress-fill');
    if (counterText) counterText.textContent = `${abordados} / ${total} Pasajeros Abordados (${pct}%)`;
    if (progressFill) progressFill.style.width = `${pct}%`;
  }

  function iniciarAbordajeAutomatico() {
    if (uiState.isAutomaticBoardingRunning) {
      detenerAbordajeAutomatico();
      return;
    }

    const unboardedIndex = uiState.flightQueueTickets.findIndex(t => t.estado !== 'Abordado');
    if (unboardedIndex === -1) {
      showToast('Todos los pasajeros de este vuelo ya han sido abordados.');
      return;
    }

    uiState.isAutomaticBoardingRunning = true;

    // Actualizar botón
    const btnText = document.getElementById('btn-iniciar-abordaje-text');
    if (btnText) btnText.textContent = 'Pausar Abordaje';

    // 1. Tocar el clásico Airport PA Chime al iniciar el llamado
    playAirportChime();
    showToast('Llamado a rampa iniciado: escaneando tiquetes en orden FIFO.');

    const statusHud = document.getElementById('scanner-hud-status');
    if (statusHud) statusHud.textContent = 'ESCANEANDO CÓDIGOS QR DE FORMA AUTOMÁTICA // SECUENCIA FIFO ACTIVA';

    uiState.boardingInterval = setInterval(() => {
      const nextIdx = uiState.flightQueueTickets.findIndex(t => t.estado !== 'Abordado');
      if (nextIdx === -1) {
        detenerAbordajeAutomatico();
        playAirportChime();
        showToast('Abordaje del vuelo completado exitosamente.');
        if (btnText) btnText.textContent = 'Abordaje Completado';
        return;
      }

      const ticket = uiState.flightQueueTickets[nextIdx];
      escanearYAbordarTicket(nextIdx, ticket);
    }, 1500);
  }

  function detenerAbordajeAutomatico() {
    if (uiState.boardingInterval) {
      clearInterval(uiState.boardingInterval);
      uiState.boardingInterval = null;
    }
    uiState.isAutomaticBoardingRunning = false;
    const btnText = document.getElementById('btn-iniciar-abordaje-text');
    if (btnText) btnText.textContent = 'Reanudar Abordaje';
  }

  function reiniciarFilaAbordaje() {
    detenerAbordajeAutomatico();
    uiState.flightQueueTickets.forEach(t => t.estado = 'En Fila FIFO');
    uiState.misReservas.forEach(r => {
      if (r.vueloCodigo === uiState.activeGateFlight) r.estado = 'Confirmado';
    });

    const btnText = document.getElementById('btn-iniciar-abordaje-text');
    if (btnText) btnText.textContent = 'Iniciar Abordaje Automatico';

    inicializarConsolaAbordaje();
    showToast('Fila de abordaje reiniciada para pruebas.');
  }

  async function escanearYAbordarTicket(idx, ticket) {
    // 1. Resaltar tarjeta actual en la fila
    const ticketCard = document.getElementById(`ticket-card-${idx}`);
    if (ticketCard) {
      ticketCard.classList.add('active-scanning');
      ticketCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 2. Beep del escáner óptico a 1850 Hz
    playScannerBeep();

    // 3. Estampar sello "ABORDADO" y actualizar estado
    ticket.estado = 'Abordado';

    // Sincronizar si es del usuario
    const userRes = uiState.misReservas.find(r => r.pnr === ticket.pnr);
    if (userRes) userRes.estado = 'Abordado';

    // Notificar al backend en la base de datos
    try {
      fetch(`/api/embarque/${encodeURIComponent(ticket.vueloCodigo)}/abordar-pasajero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento: ticket.pasajeroDoc,
          nombre: ticket.pasajeroNombre,
          asiento: ticket.asiento
        })
      });
    } catch (e) {}

    // 4. Actualizar DOM del ticket
    setTimeout(() => {
      if (ticketCard) {
        ticketCard.classList.remove('active-scanning');
        if (!ticketCard.querySelector('.stamp-abordado')) {
          const stamp = document.createElement('div');
          stamp.className = 'stamp-abordado';
          stamp.textContent = 'ABORDADO';
          ticketCard.appendChild(stamp);
        }

        // Actualizar botón individual de abordaje manual si existe
        const btnManual = ticketCard.querySelector('.btn-ticket-board-manual');
        if (btnManual) {
          btnManual.classList.add('boarded');
          btnManual.disabled = true;
          const span = btnManual.querySelector('span');
          if (span) span.textContent = 'Abordado';
        }
      }

      const badgeStatus = document.getElementById(`badge-status-${idx}`);
      if (badgeStatus) {
        badgeStatus.textContent = 'Abordado';
        badgeStatus.classList.add('status-abordado');
      }

      const lastPax = document.getElementById('scanner-last-scanned-pax');
      if (lastPax) lastPax.textContent = `Último: ${ticket.pasajeroNombre} (Silla ${ticket.asiento})`;

      actualizarProgresoPuerta();
    }, 400);
  }

  // Abordaje manual 1 por 1 desde el botón superior de la consola
  function abordarSiguienteManual() {
    if (uiState.isAutomaticBoardingRunning) {
      detenerAbordajeAutomatico();
    }
    const nextIdx = uiState.flightQueueTickets.findIndex(t => t.estado !== 'Abordado');
    if (nextIdx === -1) {
      showToast('Todos los pasajeros de este vuelo ya han sido abordados.');
      return;
    }
    const ticket = uiState.flightQueueTickets[nextIdx];
    showToast(`Abordando pasajero #${nextIdx + 1}: ${ticket.pasajeroNombre} (Silla ${ticket.asiento})`);
    escanearYAbordarTicket(nextIdx, ticket);
  }

  // Abordaje manual individual desde la tarjeta del tiquete en la fila
  function abordarTicketEnFila(idx) {
    if (uiState.isAutomaticBoardingRunning) {
      detenerAbordajeAutomatico();
    }
    const ticket = uiState.flightQueueTickets[idx];
    if (!ticket || ticket.estado === 'Abordado') {
      showToast('Este pasajero ya ha completado su abordaje.');
      return;
    }
    showToast(`Abordando a: ${ticket.pasajeroNombre} (Silla ${ticket.asiento})`);
    escanearYAbordarTicket(idx, ticket);
  }

  // Abordaje manual individual desde un tiquete
  async function abordarVueloPasajero(idx) {
    const reserva = uiState.misReservas[idx];
    if (!reserva || reserva.estado === 'Abordado') return;

    playAirportChime();

    try {
      await fetch(`/api/embarque/${encodeURIComponent(reserva.vueloCodigo)}/abordar-pasajero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento: reserva.pasajeroDoc,
          nombre: reserva.pasajeroNombre,
          asiento: reserva.asiento
        })
      });
    } catch (e) {}

    setTimeout(() => {
      playScannerBeep();
      reserva.estado = 'Abordado';

      const statusEl = document.getElementById(`badge-status-${idx}`);
      const btnEl = document.getElementById(`btn-board-stub-${idx}`);

      if (statusEl) {
        statusEl.textContent = 'Abordado';
        statusEl.classList.add('status-abordado');
      }
      if (btnEl) {
        btnEl.classList.add('boarded');
        btnEl.querySelector('span').textContent = 'Abordado';
      }

      const card = document.getElementById(`ticket-card-${idx}`);
      if (card && !card.querySelector('.stamp-abordado')) {
        const stamp = document.createElement('div');
        stamp.className = 'stamp-abordado';
        stamp.textContent = 'ABORDADO';
        card.appendChild(stamp);
      }

      showToast(`Pasajero ${reserva.pasajeroNombre} ha abordado exitosamente.`);
    }, 450);
  }

  // =========================================================================
  // 15. MODAL MIS RESERVAS (POPUP SECUNDARIO)
  // =========================================================================
  function abrirModalMisReservas() {
    asegurarReservaDemo();
    const modal = document.getElementById('modal-mis-reservas');
    if (!modal) return;

    const container = document.getElementById('boarding-passes-container');
    if (container) {
      container.innerHTML = '';
      uiState.misReservas.forEach((r, idx) => {
        container.innerHTML += generarHTMLPaseDobleTalon(r, idx, true);
      });
    }

    modal.classList.add('active');
  }

  function cerrarModalMisReservas() {
    const modal = document.getElementById('modal-mis-reservas');
    if (modal) modal.classList.remove('active');
  }

  // =========================================================================
  // 16. CONSOLA DE ADMINISTRACIÓN GENERAL (MODAL TABLAS Y FINANZAS INTACTO)
  // =========================================================================
  function abrirPanelAdmin() {
    const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;
    if (!sesion || (sesion.rol !== 'admin' && sesion.rol !== 'integral')) {
      showToast('Acceso exclusivo para el Administrador', true);
      return;
    }
    const modal = document.getElementById('modal-panel-admin');
    if (!modal) return;
    renderizarAdminOfertas();
    cargarFinanzasAdmin();
    modal.classList.add('active');
  }

  function cerrarPanelAdmin() {
    const modal = document.getElementById('modal-panel-admin');
    if (modal) modal.classList.remove('active');
  }

  function alternarTabAdmin(tabId) {
    const btns = document.querySelectorAll('.admin-tab-btn');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));

    const contents = document.querySelectorAll('.admin-tab-content');
    contents.forEach(c => c.classList.toggle('active', c.id === `admin-tab-${tabId}`));
  }

  function renderizarAdminOfertas() {
    const tbody = document.getElementById('admin-ofertas-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    uiState.vuelosCargados.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${v.codigo}</strong></td>
        <td>${v.destino}</td>
        <td>
          <input type="number" class="form-input-minimal tabular-nums" style="height:34px;width:120px;" id="admin-price-${v.codigo}" value="${v.precio_base_cop || 71810}">
        </td>
        <td>
          <select class="form-input-minimal" style="height:34px;width:120px;" id="admin-cat-${v.codigo}">
            <option value="playa" ${v.categoria === 'playa' ? 'selected' : ''}>Playa</option>
            <option value="ciudad" ${v.categoria === 'ciudad' ? 'selected' : ''}>Ciudad</option>
            <option value="nocturna" ${v.categoria === 'nocturna' ? 'selected' : ''}>Nocturna</option>
            <option value="naturaleza" ${v.categoria === 'naturaleza' ? 'selected' : ''}>Naturaleza</option>
          </select>
        </td>
        <td>
          <input type="text" class="form-input-minimal" style="height:34px;width:140px;" id="admin-tag-${v.codigo}" value="${v.tag_destacado || 'Recomendado'}">
        </td>
        <td>
          <button type="button" class="btn-admin-action" onclick="AeroMinimalUI.guardarCambiosVueloAdmin('${v.codigo}')">
            Guardar
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function guardarCambiosVueloAdmin(codigo) {
    const priceInput = document.getElementById(`admin-price-${codigo}`);
    const catInput = document.getElementById(`admin-cat-${codigo}`);
    const tagInput = document.getElementById(`admin-tag-${codigo}`);

    const precio_base_cop = Number(priceInput?.value) || 71810;
    const categoria = catInput?.value || 'ciudad';
    const tag_destacado = tagInput?.value || 'Recomendado';

    try {
      const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;
      const res = await fetch(`/api/admin/vuelos/${encodeURIComponent(codigo)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': sesion?.rol || 'admin'
        },
        body: JSON.stringify({ codigo, precio_base_cop, categoria, tag_destacado })
      });

      if (!res.ok) throw new Error('Error al guardar cambios');
      showToast(`Vuelo ${codigo} actualizado correctamente.`);
      cargarVuelosCatalogo();
    } catch (e) {
      showToast('Error al actualizar vuelo en servidor.', true);
    }
  }

  async function cargarFinanzasAdmin() {
    try {
      const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;
      const res = await fetch('/api/pagos/conciliacion', {
        headers: { 'X-User-Role': sesion?.rol || 'admin' }
      });
      if (!res.ok) return;
      const data = await res.json();

      const elRecaudo = document.getElementById('admin-fin-recaudo');
      const elOrdenes = document.getElementById('admin-fin-ordenes');
      const elOcupacion = document.getElementById('admin-fin-ocupacion');

      if (elRecaudo) elRecaudo.textContent = formatoCOP(data.monto_total_pagado_cop || 18500000);
      if (elOrdenes) elOrdenes.textContent = (data.ordenes_pagadas || 26) + ' reservas';
      if (elOcupacion) elOcupacion.textContent = (data.tasa_ocupacion_pct || 92) + '%';
    } catch (e) {}
  }

  // =========================================================================
  // 17. CIERRE GLOBAL DE MODALES
  // =========================================================================
  function cerrarModales() {
    cerrarCalendarioTarifas();
    cerrarMapaCabina();
    cerrarModalMisReservas();
    cerrarPanelAdmin();
    cerrarEditorVuelo();
    if (window.AeroAuth && typeof window.AeroAuth.cerrarLoginModal === 'function') {
      window.AeroAuth.cerrarLoginModal();
    }
  }
  window.cerrarModales = cerrarModales;

  // =========================================================================
  // 18. INICIALIZACIÓN
  // =========================================================================
  function init() {
    cargarVuelosCatalogo();

    const btnSwap = document.getElementById('btn-swap-routes');
    if (btnSwap) btnSwap.addEventListener('click', intercambiarRutas);

    document.addEventListener('click', (e) => {
      const calendar = document.getElementById('fare-calendar-popover');
      const boxSalida = document.getElementById('search-field-salida');
      const boxRegreso = document.getElementById('search-field-regreso');
      if (calendar && calendar.classList.contains('open')) {
        if (!calendar.contains(e.target) && !boxSalida?.contains(e.target) && !boxRegreso?.contains(e.target)) {
          cerrarCalendarioTarifas();
        }
      }
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          detenerTemporizadorRetencion();
        }
      });
    });

    setTimeout(() => {
      sincronizarModoAdmin();
    }, 100);
  }

  // API Pública
  window.AeroMinimalUI = {
    mostrarSeccion,
    alternarTipoViaje,
    intercambiarRutas,
    abrirCalendarioTarifas,
    cerrarCalendarioTarifas,
    navegarMesCalendario,
    filtrarPorCategoria,
    buscarVuelosHero,
    interceptarAccionVuelo,
    sincronizarModoAdmin,
    abrirEditorVuelo,
    cerrarEditorVuelo,
    actualizarPreviewFoto,
    cargarFotoArchivo,
    actualizarCalculoTarifaEditor,
    alCambiarAeronaveEditor,
    guardarVueloAdmin,
    eliminarVueloAdmin,
    abrirMapaCabina,
    cerrarMapaCabina,
    intentarNavegarPaso,
    toggleAccordion,
    seleccionarSillaLATAM,
    elegirAsientoDespues,
    alternarDetalleImpuestos,
    avanzarPasoCheckout,
    alCambiarEquipajeBodega,
    alternarMetodoPago,
    alCambiarTarjetaCredito,
    alCambiarCelularNequi,
    procesarPagoReserva,
    abrirModalMisReservas,
    cerrarModalMisReservas,
    actualizarPortalPasajero,
    inicializarConsolaAbordaje,
    cambiarVueloConsolaAbordaje,
    iniciarAbordajeAutomatico,
    detenerAbordajeAutomatico,
    reiniciarFilaAbordaje,
    abordarSiguienteManual,
    abordarTicketEnFila,
    abordarVueloPasajero,
    abrirPanelAdmin,
    cerrarPanelAdmin,
    alternarTabAdmin,
    guardarCambiosVueloAdmin,
    playAirportChime,
    playScannerBeep
  };

  document.addEventListener('DOMContentLoaded', init);
})();
