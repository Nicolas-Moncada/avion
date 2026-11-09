/**
 * AERO FLOW AIRLINES — Minimal UI Interactive Engine (v3.1)
 * MODO ADMINISTRADOR EN VIVO (Lápiz SVG flotante, Creador y Eliminador con persistencia en DB)
 * MAPA VECTORIAL DE CABINA (Airbus A320neo / A350 con poltronas VIP vs Economy)
 * SIMULADOR DE PAGOS (Tarjeta con preview interactivo 3D, PSE, Nequi con push)
 * PASE DE ABORDAR CON SONIDO REAL (Web Audio API: Ding-Dong F5->C5 y Beep 1850Hz)
 * CERO EMOJIS — 100% SVG minimalista de trazo fino.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. ESTADO GLOBAL DE LA INTERFAZ
  // =========================================================================
  const uiState = {
    tripType: 'round', // 'round' | 'oneway'
    origin: 'Miami (MIA)',
    destination: 'Bogotá (BOG)',
    departureDate: '2026-11-08',
    returnDate: '2026-12-08',
    passengers: 1,
    activeSelectingField: 'departure', // 'departure' | 'return'
    calendarCurrentMonth: new Date(2026, 10, 1), // Noviembre 2026
    currentCategoryFilter: 'todos',
    vuelosCargados: [],
    selectedFlight: null,
    selectedSeat: null,
    activePaymentMethod: 'card', // 'card' | 'pse' | 'nequi'
    retentionSeconds: 720, // 12 minutos
    retentionInterval: null,
    misReservas: []
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
    const d = new Date(year, month, day);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5) {
      return { tier: 'high', label: '$$$', precio: 320000 };
    } else if (dayOfWeek === 1 || dayOfWeek === 4) {
      return { tier: 'mid', label: '$$', precio: 185000 };
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
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.04);
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
      gain2.gain.linearRampToValueAtTime(0.3, now + 0.32);
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

      // Beep de escáner óptico (1850 Hz, 80ms)
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
      border-radius:10px;
      font-size:0.875rem;
      font-weight:500;
      box-shadow:0 10px 25px rgba(0,0,0,0.15);
      opacity:0;
      transform:translateY(10px);
      transition:all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
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
  // 5. CONTROL DEL HERO Y CALENDARIO TARIFARIO
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
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <path d="M15 18l-6-6 6-6"></path>
           </svg>
         </button>`
      : '<span style="width:28px;"></span>';

    const btnNext = tieneNext
      ? `<button type="button" class="calendar-nav-btn" onclick="AeroMinimalUI.navegarMesCalendario(1)" aria-label="Mes siguiente">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <path d="M9 18l6-6-6-6"></path>
           </svg>
         </button>`
      : '<span style="width:28px;"></span>';

    header.innerHTML = `
      ${btnPrev}
      <span class="calendar-month-title">${nombreMes} ${year}</span>
      ${btnNext}
    `;
    card.appendChild(header);

    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays-row';
    weekdays.innerHTML = `
      <span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sa</span><span>Do</span>
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

      const esPasado = (year === 2026 && month === 10 && day < 8);
      if (esPasado) {
        btn.classList.add('disabled');
        btn.disabled = true;
      } else {
        const tarifa = calcularTarifaDia(year, month, day);
        if (tarifa.tier === 'low') btn.classList.add('tier-low');
        else if (tarifa.tier === 'mid') btn.classList.add('tier-mid');
        else btn.classList.add('tier-high');

        btn.title = `Día ${day}: ${formatoCOP(tarifa.precio)}`;

        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (uiState.departureDate === isoDate || (!uiState.departureDate && month === 10 && day === 8)) {
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
  // 6. CATÁLOGO VISUAL DE OFERTAS Y MODO ADMINISTRADOR EN VIVO
  // =========================================================================
  async function cargarVuelosCatalogo() {
    try {
      const res = await fetch('/api/vuelos');
      if (!res.ok) throw new Error('Error al consultar vuelos');
      const data = await res.json();
      uiState.vuelosCargados = data.vuelos || data.proximos || data.todos_admin || [];
      renderizarCatalogoOfertas();
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
    
    // Botón superior de "+ Nuevo vuelo"
    const btnTop = document.getElementById('btn-admin-top-create');
    if (btnTop) {
      btnTop.style.display = esAdmin ? 'inline-flex' : 'none';
    }

    // Re-renderizar ofertas para mostrar/ocultar botones flotantes y tarjeta de creación
    renderizarCatalogoOfertas();
  }

  function renderizarCatalogoOfertas() {
    const container = document.getElementById('offers-cards-grid');
    if (!container) return;

    container.innerHTML = '';
    const esAdmin = esUsuarioAdmin();
    const vuelos = uiState.vuelosCargados;

    // Si es Administrador, insertar tarjeta "+ Crear nuevo vuelo" al inicio
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

    if (filtrados.length === 0) {
      filtrados = vuelos;
    }

    filtrados.forEach(v => {
      const card = document.createElement('article');
      card.className = 'offer-flight-card';
      card.id = `card-vuelo-${v.codigo}`;
      card.onclick = () => interceptarAccionVuelo(v.codigo);

      // Extraer ciudad e IATA
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
          <button type="button" class="btn-choose-seat" onclick="event.stopPropagation(); AeroMinimalUI.interceptarAccionVuelo('${v.codigo}')">
            <span>Elegir silla / Reservar</span>
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    // Tarjeta final de cierre (CTA)
    const closingCard = document.createElement('div');
    closingCard.className = 'closing-cta-card';
    closingCard.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h4 class="closing-cta-title">¿Todavia no encuentras la oferta a tu destino?</h4>
      <p class="closing-cta-sub">Explora mas de 40 rutas nacionales e internacionales con tarifas dinamicas.</p>
      <button type="button" class="btn-closing-cta" onclick="AeroMinimalUI.buscarVuelosHero()">
        <span>Ver mas vuelos y rutas</span>
      </button>
    `;
    container.appendChild(closingCard);
  }

  function buscarVuelosHero() {
    const elGrid = document.getElementById('catalog-offers-section');
    if (elGrid) {
      elGrid.scrollIntoView({ behavior: 'smooth' });
    }
    showToast('Mostrando las mejores tarifas disponibles');
  }

  // =========================================================================
  // 7. GESTOR Y EDITOR DE VUELOS EN VIVO (ADMINISTRADOR)
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
      // Modo: Crear Nuevo Vuelo
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
      // Modo: Editar Vuelo Existente
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
    if (imgEl && url) {
      imgEl.src = url;
    }
  }

  function cargarFotoArchivo(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const dataUrl = e.target.result;
      const urlInput = document.getElementById('editor-flight-image-url');
      if (urlInput) urlInput.value = dataUrl;
      actualizarPreviewFoto(dataUrl);
      showToast('Fotografía cargada correctamente');
    };
    reader.readAsDataURL(file);
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
    // Si la aeronave cambia, actualizar valores sugeridos
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
      codigo,
      origen,
      destino,
      tipo_aeronave: aeronave,
      precio_base_cop: precioBase,
      categoria,
      fecha_salida: fecha,
      hora_salida_12h: hora,
      puerta,
      estado,
      imagen_url: imagenUrl,
      tag_destacado: tag
    };

    const endpoint = isNew ? '/api/admin/vuelos' : `/api/admin/vuelos/${encodeURIComponent(codigo)}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'admin'
        },
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
    if (!confirm(`¿Eliminar definitivamente el vuelo ${codigo} de la base de datos?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/vuelos/${encodeURIComponent(codigo)}`, {
        method: 'DELETE',
        headers: {
          'X-User-Role': 'admin'
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      showToast(`Vuelo ${codigo} eliminado exitosamente.`);
      
      // Animación suave de salida en el DOM
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
  // 8. COMPUERTA CONDICIONAL INTELIGENTE (AUTH GATE)
  // =========================================================================
  function interceptarAccionVuelo(codigoVuelo) {
    const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;

    if (!sesion) {
      // Guardar intención y abrir modal de login
      window.pendingFlightId = codigoVuelo;
      if (window.AeroAuth && typeof window.AeroAuth.abrirLoginModal === 'function') {
        window.AeroAuth.abrirLoginModal(codigoVuelo);
      }
      return;
    }

    // Usuario autenticado: abrir directamente el mapa de cabina del vuelo elegido
    abrirMapaCabina(codigoVuelo);
  }

  // =========================================================================
  // 9. MAPA DE CABINA VECTORIAL (VIP Y ECONOMY) Y CHECKOUT MULTIMÉTODO
  // =========================================================================
  async function abrirMapaCabina(codigoVuelo) {
    const vuelo = uiState.vuelosCargados.find(v => v.codigo === codigoVuelo);
    if (!vuelo) {
      showToast('Vuelo no encontrado', true);
      return;
    }
    uiState.selectedFlight = vuelo;
    uiState.selectedSeat = null;

    const modal = document.getElementById('modal-cabin-map');
    if (!modal) return;

    // Actualizar cabecera del modal
    const titleEl = document.getElementById('cabin-modal-title');
    const routeEl = document.getElementById('cabin-modal-route');
    if (titleEl) titleEl.textContent = `Mapa de Cabina — ${vuelo.tipo_aeronave || 'Airbus A320neo'}`;
    if (routeEl) routeEl.textContent = `${vuelo.origen} -> ${vuelo.destino} (Vuelo ${vuelo.codigo})`;

    // Iniciar temporizador de retención de 12 minutos
    iniciarTemporizadorRetencion();

    // Renderizar fuselaje y filas vectoriales según la aeronave
    renderizarFuselajeAeronave(vuelo);

    // Calcular desglose inicial
    actualizarDesglosePrecios(vuelo.precio_base_cop || 71810, false);

    // Seleccionar pestaña de pago 'card' por defecto
    alternarMetodoPago('card');

    modal.classList.add('active');
  }

  function cerrarMapaCabina() {
    const modal = document.getElementById('modal-cabin-map');
    if (modal) modal.classList.remove('active');
    detenerTemporizadorRetencion();
  }

  function iniciarTemporizadorRetencion() {
    detenerTemporizadorRetencion();
    uiState.retentionSeconds = 720;
    actualizarBadgeTimer();

    uiState.retentionInterval = setInterval(() => {
      uiState.retentionSeconds--;
      if (uiState.retentionSeconds <= 0) {
        detenerTemporizadorRetencion();
        showToast('El tiempo de retención de 12 minutos ha expirado.', true);
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
    if (!el) return;
    const m = Math.floor(uiState.retentionSeconds / 60);
    const s = uiState.retentionSeconds % 60;
    el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderizarFuselajeAeronave(vuelo) {
    const container = document.getElementById('fuselage-rows-list');
    if (!container) return;
    container.innerHTML = '';

    const modelo = vuelo.tipo_aeronave || 'Airbus A320neo';
    let filasVip = 4;
    let filasEco = 7;

    if (modelo.includes('A350')) {
      filasVip = 6;
      filasEco = 14;
    } else if (modelo.includes('787')) {
      filasVip = 5;
      filasEco = 11;
    } else if (modelo.includes('Praetor')) {
      filasVip = 2;
      filasEco = 2;
    }

    const ocupados = new Set(['1B', '2A', '4C', '5B', '6D', '7A']);

    // Filas VIP (2x2: A, B y C, D)
    for (let f = 1; f <= filasVip; f++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'cabin-row';

      const label = document.createElement('span');
      label.className = 'row-num-label';
      label.textContent = f;
      rowDiv.appendChild(label);

      // Izquierda (A, B)
      const leftGroup = document.createElement('div');
      leftGroup.className = 'seat-group';
      ['A', 'B'].forEach(col => {
        leftGroup.appendChild(crearBotonSilla(f, col, 'VIP', ocupados.has(`${f}${col}`)));
      });
      rowDiv.appendChild(leftGroup);

      // Pasillo central
      const aisle = document.createElement('div');
      aisle.className = 'seat-aisle-space';
      aisle.textContent = '||';
      rowDiv.appendChild(aisle);

      // Derecha (C, D)
      const rightGroup = document.createElement('div');
      rightGroup.className = 'seat-group';
      ['C', 'D'].forEach(col => {
        rightGroup.appendChild(crearBotonSilla(f, col, 'VIP', ocupados.has(`${f}${col}`)));
      });
      rowDiv.appendChild(rightGroup);

      container.appendChild(rowDiv);
    }

    // Separador visual de cabina
    const cabinaDivider = document.createElement('div');
    cabinaDivider.style.cssText = 'text-align:center;font-size:0.6875rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;padding:8px 0;';
    cabinaDivider.textContent = 'Cabina Economy Estándar';
    container.appendChild(cabinaDivider);

    // Filas Economy
    const inicioEco = filasVip + 1;
    for (let f = inicioEco; f < inicioEco + filasEco; f++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'cabin-row';

      const label = document.createElement('span');
      label.className = 'row-num-label';
      label.textContent = f;
      rowDiv.appendChild(label);

      const leftGroup = document.createElement('div');
      leftGroup.className = 'seat-group';
      ['A', 'B'].forEach(col => {
        leftGroup.appendChild(crearBotonSilla(f, col, 'Economy', ocupados.has(`${f}${col}`)));
      });
      rowDiv.appendChild(leftGroup);

      const aisle = document.createElement('div');
      aisle.className = 'seat-aisle-space';
      aisle.textContent = '||';
      rowDiv.appendChild(aisle);

      const rightGroup = document.createElement('div');
      rightGroup.className = 'seat-group';
      ['C', 'D'].forEach(col => {
        rightGroup.appendChild(crearBotonSilla(f, col, 'Economy', ocupados.has(`${f}${col}`)));
      });
      rowDiv.appendChild(rightGroup);

      container.appendChild(rowDiv);
    }
  }

  function crearBotonSilla(fila, col, clase, estaOcupada) {
    const seatId = `${fila}${col}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = (clase === 'VIP') ? 'seat-vip-btn' : 'seat-eco-btn';
    btn.textContent = col;
    btn.setAttribute('data-seat', seatId);
    btn.setAttribute('data-class', clase);

    if (estaOcupada) {
      btn.classList.add('seat-occupied');
      btn.disabled = true;
      btn.title = `Silla ${seatId} (${clase}) - Ocupada`;
    } else {
      btn.title = `Silla ${seatId} (${clase}) - Disponible`;
      btn.onclick = () => seleccionarSilla(seatId, clase);
    }

    return btn;
  }

  function seleccionarSilla(seatId, clase) {
    uiState.selectedSeat = { id: seatId, clase };

    document.querySelectorAll('.seat-vip-btn, .seat-eco-btn').forEach(b => {
      const match = b.getAttribute('data-seat') === seatId;
      b.classList.toggle('selected', match);
    });

    const basePrice = uiState.selectedFlight?.precio_base_cop || 71810;
    const factorClase = (clase === 'VIP') ? 1.6 : 1.0;
    const tarifaFinal = Math.round(basePrice * factorClase);

    const lbl = document.getElementById('label-tarifa-base');
    if (lbl) {
      lbl.textContent = `Tarifa Base (Silla ${seatId} ${clase})`;
    }

    actualizarDesglosePrecios(tarifaFinal, clase === 'VIP');
  }

  function actualizarDesglosePrecios(tarifaBase, esVip = false) {
    const admin = 45000;
    const tasa = 158000;
    const iva = Math.round(tarifaBase * 0.19);
    const total = tarifaBase + admin + tasa + iva;

    const elBase = document.getElementById('summary-base-cop');
    const elAdmin = document.getElementById('summary-admin-cop');
    const elTasa = document.getElementById('summary-tasa-cop');
    const elIva = document.getElementById('summary-iva-cop');
    const elTotal = document.getElementById('summary-total-cop');
    const btnPay = document.getElementById('btn-confirmar-pago-text');

    if (elBase) elBase.textContent = formatoCOP(tarifaBase);
    if (elAdmin) elAdmin.textContent = formatoCOP(admin);
    if (elTasa) elTasa.textContent = formatoCOP(tasa);
    if (elIva) elIva.textContent = formatoCOP(iva);
    if (elTotal) elTotal.textContent = formatoCOP(total);
    if (btnPay) btnPay.textContent = `Pagar ${formatoCOP(total)} y Confirmar`;
  }

  // =========================================================================
  // 10. SIMULADOR PASARELA DE PAGOS (TARJETA, PSE, NEQUI)
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
      if (panels[key]) {
        panels[key].style.display = (key === metodo) ? 'block' : 'none';
      }
    });
  }

  function alCambiarTarjetaCredito() {
    const numInput = document.getElementById('card-number-input');
    const expInput = document.getElementById('card-exp-input');
    const nameInput = document.getElementById('passenger-name-input');

    const numPrev = document.getElementById('cc-preview-number');
    const expPrev = document.getElementById('cc-preview-exp');
    const namePrev = document.getElementById('cc-preview-name');

    if (numPrev && numInput) {
      const val = numInput.value.trim();
      numPrev.textContent = val ? val : '•••• •••• •••• ••••';
    }
    if (expPrev && expInput) {
      const val = expInput.value.trim();
      expPrev.textContent = val ? val : '12/28';
    }
    if (namePrev && nameInput) {
      const val = nameInput.value.trim();
      namePrev.textContent = val ? val.toUpperCase() : 'CARLOS MENDOZA';
    }
  }

  function alCambiarCelularNequi() {
    const phoneInput = document.getElementById('nequi-phone-number');
    const banner = document.getElementById('nequi-push-banner');
    if (phoneInput && banner) {
      banner.textContent = `Notificación simulada enviada a ${phoneInput.value}: Al presionar pagar, confirma la transacción en tu teléfono.`;
    }
  }

  async function procesarPagoReserva() {
    if (!uiState.selectedSeat) {
      showToast('Por favor selecciona una silla en el mapa interactivo del avión.', true);
      return;
    }

    const docInput = document.getElementById('passenger-doc-input');
    const nameInput = document.getElementById('passenger-name-input');
    const doc = docInput?.value?.trim() || 'CC-101829384';
    const nombre = nameInput?.value?.trim() || 'Carlos Alberto Mendoza';

    const vuelo = uiState.selectedFlight;
    const pnr = 'AF' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const nuevaReserva = {
      pnr,
      vueloCodigo: vuelo.codigo,
      origen: vuelo.origen,
      destino: vuelo.destino,
      fecha: vuelo.fecha_salida,
      hora: vuelo.hora_salida_12h || '08:30 AM',
      puerta: vuelo.puerta || 'B-03',
      asiento: uiState.selectedSeat.id,
      clase: uiState.selectedSeat.clase,
      pasajeroDoc: doc,
      pasajeroNombre: nombre,
      metodoPago: uiState.activePaymentMethod,
      estado: 'Confirmado'
    };

    uiState.misReservas.unshift(nuevaReserva);

    cerrarMapaCabina();
    showToast(`Pago simulado con éxito (${uiState.activePaymentMethod.toUpperCase()}). Tiquete PNR ${pnr} emitido.`);
    abrirModalMisReservas();
  }

  // =========================================================================
  // 11. MIS RESERVAS, PASE DE ABORDAR Y ABORDAJE SONORO EN VIVO
  // =========================================================================
  function abrirModalMisReservas() {
    const modal = document.getElementById('modal-mis-reservas');
    if (!modal) return;
    renderizarPasesAbordar();
    modal.classList.add('active');
  }

  function cerrarModalMisReservas() {
    const modal = document.getElementById('modal-mis-reservas');
    if (modal) modal.classList.remove('active');
  }

  function generarBarcodeSVG(pnr) {
    return `
      <div class="pass-cut-line"></div>
      <div class="barcode-svg-container">
        <svg class="barcode-svg" viewBox="0 0 280 38" preserveAspectRatio="none">
          <rect x="0" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="5" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="8" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="15" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="20" y="0" width="5" height="38" fill="#0F172A"/>
          <rect x="28" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="32" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="38" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="43" y="0" width="6" height="38" fill="#0F172A"/>
          <rect x="52" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="56" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="63" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="67" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="73" y="0" width="5" height="38" fill="#0F172A"/>
          <rect x="81" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="86" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="90" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="97" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="103" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="107" y="0" width="5" height="38" fill="#0F172A"/>
          <rect x="115" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="120" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="127" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="131" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="137" y="0" width="6" height="38" fill="#0F172A"/>
          <rect x="146" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="151" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="155" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="162" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="168" y="0" width="5" height="38" fill="#0F172A"/>
          <rect x="176" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="180" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="186" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="191" y="0" width="6" height="38" fill="#0F172A"/>
          <rect x="200" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="205" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="212" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="216" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="222" y="0" width="5" height="38" fill="#0F172A"/>
          <rect x="230" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="235" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="239" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="246" y="0" width="3" height="38" fill="#0F172A"/>
          <rect x="252" y="0" width="6" height="38" fill="#0F172A"/>
          <rect x="261" y="0" width="2" height="38" fill="#0F172A"/>
          <rect x="266" y="0" width="4" height="38" fill="#0F172A"/>
          <rect x="273" y="0" width="1" height="38" fill="#0F172A"/>
          <rect x="277" y="0" width="3" height="38" fill="#0F172A"/>
        </svg>
        <span style="font-size:0.6875rem;font-family:monospace;letter-spacing:0.25em;color:#64748B;margin-top:4px;">${pnr} // AERO FLOW IATA BCBP</span>
      </div>
    `;
  }

  function renderizarPasesAbordar() {
    const container = document.getElementById('boarding-passes-container');
    if (!container) return;

    if (uiState.misReservas.length === 0) {
      uiState.misReservas.push({
        pnr: 'AF7K9B',
        vueloCodigo: 'AF2025',
        origen: 'BOG - Bogotá El Dorado',
        destino: 'MDE - Medellín',
        fecha: '2026-12-02',
        hora: '07:15 AM',
        puerta: 'B-02',
        asiento: '3A',
        clase: 'VIP',
        pasajeroDoc: '101829384',
        pasajeroNombre: 'Carlos Alberto Mendoza',
        estado: 'Confirmado'
      });
    }

    container.innerHTML = '';
    uiState.misReservas.forEach((reserva, idx) => {
      const card = document.createElement('div');
      card.className = 'boarding-pass-card';

      const esAbordado = reserva.estado === 'Abordado';

      card.innerHTML = `
        <div class="pass-header">
          <span class="pass-brand-text">AERO FLOW AIRLINES • BOARDING PASS</span>
          <span class="pass-status-pill ${esAbordado ? 'status-abordado' : ''}" id="pass-status-${idx}">
            ${reserva.estado}
          </span>
        </div>
        <div class="pass-body">
          <div class="pass-info-grid">
            <div>
              <span class="pass-field-label">Vuelo</span>
              <p class="pass-field-val">${reserva.vueloCodigo}</p>
            </div>
            <div>
              <span class="pass-field-label">PNR</span>
              <p class="pass-field-val">${reserva.pnr}</p>
            </div>
            <div>
              <span class="pass-field-label">Pasajero</span>
              <p class="pass-field-val">${reserva.pasajeroNombre}</p>
            </div>
            <div>
              <span class="pass-field-label">Documento</span>
              <p class="pass-field-val">${reserva.pasajeroDoc}</p>
            </div>
            <div>
              <span class="pass-field-label">Asiento / Clase</span>
              <p class="pass-field-val">${reserva.asiento} (${reserva.clase})</p>
            </div>
            <div>
              <span class="pass-field-label">Puerta</span>
              <p class="pass-field-val">${reserva.puerta}</p>
            </div>
          </div>
          <div class="pass-qr-container">
            <svg class="qr-code-svg" viewBox="0 0 100 100" fill="currentColor">
              <path d="M10 10h30v30h-30z M15 15v20h20v-20z M20 20h10v10h-10z M60 10h30v30h-30z M65 15v20h20v-20z M70 20h10v10h-10z M10 60h30v30h-30z M15 65v20h20v-20z M20 70h10v10h-10z M50 20h5v10h-5z M50 50h10v10h-10z M70 60h10v10h-10z M80 70h10v20h-10z M60 80h10v10h-10z"/>
            </svg>
            <span style="font-size:0.6875rem;color:#94A3B8;margin-top:4px;">Escanear en rampa</span>
          </div>
        </div>

        ${generarBarcodeSVG(reserva.pnr)}

        <div class="pass-actions-footer">
          <span style="font-size:0.8125rem;color:#64748B;">Salida: ${reserva.fecha} • ${reserva.hora}</span>
          <button type="button" class="btn-board-flight ${esAbordado ? 'boarded' : ''}" id="btn-board-${idx}" onclick="AeroMinimalUI.abordarVueloPasajero(${idx})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>${esAbordado ? 'Abordado' : 'Abordar vuelo'}</span>
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async function abordarVueloPasajero(idx) {
    const reserva = uiState.misReservas[idx];
    if (!reserva || reserva.estado === 'Abordado') return;

    // 1. Tocar campana de anuncio de rampa (F5 -> C5)
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

    // 2. Tocar beep de escáner tras 400ms
    setTimeout(() => {
      playScannerBeep();
      reserva.estado = 'Abordado';

      const statusEl = document.getElementById(`pass-status-${idx}`);
      const btnEl = document.getElementById(`btn-board-${idx}`);

      if (statusEl) {
        statusEl.textContent = 'Abordado';
        statusEl.classList.add('status-abordado');
      }
      if (btnEl) {
        btnEl.classList.add('boarded');
        btnEl.querySelector('span').textContent = 'Abordado';
      }

      showToast(`Pasajero ${reserva.pasajeroNombre} ha abordado exitosamente.`);
    }, 450);
  }

  // =========================================================================
  // 12. CONSOLA DE ADMINISTRACIÓN GENERAL (MODAL TABLAS Y FINANZAS)
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
        body: JSON.stringify({
          codigo,
          precio_base_cop,
          categoria,
          tag_destacado
        })
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
        headers: {
          'X-User-Role': sesion?.rol || 'admin'
        }
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
  // 13. CIERRE GLOBAL DE MODALES
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
  // 14. INICIALIZACIÓN
  // =========================================================================
  function init() {
    cargarVuelosCatalogo();

    // Eventos del buscador
    const btnSwap = document.getElementById('btn-swap-routes');
    if (btnSwap) btnSwap.addEventListener('click', intercambiarRutas);

    // Cerrar popovers al hacer click fuera
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

    // Delegación para cerrar modales al hacer clic en el backdrop
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          detenerTemporizadorRetencion();
        }
      });
    });

    // Sincronizar estado inicial de admin si ya hay sesión
    setTimeout(() => {
      sincronizarModoAdmin();
    }, 100);
  }

  // API Pública
  window.AeroMinimalUI = {
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
    alternarMetodoPago,
    alCambiarTarjetaCredito,
    alCambiarCelularNequi,
    procesarPagoReserva,
    abrirModalMisReservas,
    cerrarModalMisReservas,
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
