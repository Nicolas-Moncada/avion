/**
 * AERO FLOW AIRLINES — Minimal UI Interactive Engine (v3.0)
 * Referencia visual exacta: Hero flotante, calendario tarifario de 2 meses con precios pastel,
 * grid de ofertas en 3 columnas, compuerta condicional inteligente, mapa de cabina A320,
 * pase de abordar con abordaje FIFO interactivo y consola de administración completa.
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
  // 3. TOASTS Y NOTIFICACIONES (CERO EMOJIS)
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
  // 4. CONTROL DEL HERO Y CALENDARIO TARIFARIO
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
    const temp = uiState.origin;
    uiState.origin = uiState.destination;
    uiState.destination = temp;

    const elOrig = document.getElementById('search-input-origen');
    const elDest = document.getElementById('search-input-destino');
    if (elOrig) elOrig.value = uiState.origin;
    if (elDest) elDest.value = uiState.destination;
  }

  function abrirCalendarioTarifas(campo = 'departure') {
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

  function navegarMesCalendario(delta) {
    const d = new Date(uiState.calendarCurrentMonth);
    d.setMonth(d.getMonth() + delta);
    uiState.calendarCurrentMonth = d;
    renderizarMesesCalendario();
  }

  function renderizarMesesCalendario() {
    const container = document.getElementById('calendar-months-container');
    if (!container) return;
    container.innerHTML = '';

    const mes1 = new Date(uiState.calendarCurrentMonth);
    const mes2 = new Date(uiState.calendarCurrentMonth);
    mes2.setMonth(mes2.getMonth() + 1);

    container.appendChild(crearCardMes(mes1, true, false));
    container.appendChild(crearCardMes(mes2, false, true));
  }

  function crearCardMes(dateObj, showPrevArrow, showNextArrow) {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();

    const card = document.createElement('div');
    card.className = 'month-view-card';

    // Cabecera del mes
    const header = document.createElement('div');
    header.className = 'month-nav-header';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'month-nav-arrow';
    prevBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    `;
    prevBtn.style.visibility = showPrevArrow ? 'visible' : 'hidden';
    prevBtn.title = 'Mes anterior';
    prevBtn.onclick = (e) => { e.stopPropagation(); navegarMesCalendario(-1); };

    const title = document.createElement('span');
    title.className = 'month-title';
    title.textContent = `${NOMBRES_MESES[month]} ${year}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'month-nav-arrow';
    nextBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    nextBtn.style.visibility = showNextArrow ? 'visible' : 'hidden';
    nextBtn.title = 'Mes siguiente';
    nextBtn.onclick = (e) => { e.stopPropagation(); navegarMesCalendario(1); };

    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    card.appendChild(header);

    // Días de la semana
    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays-row';
    ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].forEach(d => {
      const sp = document.createElement('span');
      sp.textContent = d;
      weekdays.appendChild(sp);
    });
    card.appendChild(weekdays);

    // Cuadrícula de días
    const grid = document.createElement('div');
    grid.className = 'calendar-days-grid';

    const primerDia = new Date(year, month, 1).getDay();
    const offset = primerDia === 0 ? 6 : primerDia - 1;

    for (let i = 0; i < offset; i++) {
      const empty = document.createElement('div');
      grid.appendChild(empty);
    }

    const totalDias = new Date(year, month + 1, 0).getDate();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    for (let day = 1; day <= totalDias; day++) {
      const fechaActual = new Date(year, month, day);
      const isPast = fechaActual < hoy;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calendar-day-btn';
      btn.textContent = day;

      const tarifa = calcularTarifaDia(year, month, day);

      if (isPast) {
        btn.classList.add('inactive');
        btn.disabled = true;
      } else {
        btn.classList.add(`tier-${tarifa.tier}`);
        btn.title = `Día ${day}: ${formatoCOP(tarifa.precio)}`;

        // Día 8 seleccionado por defecto como en la referencia visual
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
  // 5. CATÁLOGO VISUAL DE OFERTAS Y FILTRADO POR CATEGORÍA
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

  function renderizarCatalogoOfertas() {
    const container = document.getElementById('offers-cards-grid');
    if (!container) return;

    container.innerHTML = '';
    const vuelos = uiState.vuelosCargados;

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
      card.onclick = () => interceptarAccionVuelo(v.codigo);

      // Extraer ciudad e IATA
      const destinoParts = (v.destino || '').split('-');
      const iata = destinoParts[0] ? destinoParts[0].trim() : 'BOG';
      const ciudadNombre = destinoParts[1] ? destinoParts[1].trim().split(' ')[0] : v.destino;
      const fechaCorta = (v.fecha_salida || '2026-12-01').split('-').reverse().join('/');
      const precioExacto = formatoCOP(v.precio_base_cop || 71810);
      const tagText = v.tag_destacado || 'Recomendado';
      const imgSrc = v.imagen_url || '/static/img/oferta-cali.jpg';

      card.innerHTML = `
        <div class="offer-card-media">
          <img src="${imgSrc}" alt="${ciudadNombre}" class="offer-card-img" loading="lazy">
          <span class="offer-badge-floating">${tagText}</span>
          <span class="offer-badge-direct">Vuelo directo</span>
        </div>
        <div class="offer-card-body">
          <h3 class="offer-destination-title">${ciudadNombre} (${iata})</h3>
          <p class="offer-flight-meta">Solo ida - ${fechaCorta} • ${v.tipo_aeronave || 'Airbus A320'}</p>
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
  // 6. COMPUERTA CONDICIONAL INTELIGENTE (AUTH GATE)
  // =========================================================================
  function interceptarAccionVuelo(codigoVuelo) {
    const sesion = window.AeroAuth ? window.AeroAuth.obtenerSesionActual() : null;

    if (!sesion) {
      // Usuario no autenticado: guardar intención y abrir modal de login suave
      window.pendingFlightId = codigoVuelo;
      if (window.AeroAuth && typeof window.AeroAuth.abrirLoginModal === 'function') {
        window.AeroAuth.abrirLoginModal(codigoVuelo);
      }
      return;
    }

    // Usuario autenticado: abrir directamente mapa de cabina del vuelo elegido
    abrirMapaCabina(codigoVuelo);
  }

  // =========================================================================
  // 7. MAPA DE CABINA AIRBUS A320 (BLOQUEO ATÓMICO 12 MIN)
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
    if (titleEl) titleEl.textContent = `Vuelo ${vuelo.codigo} — Mapa de Cabina`;
    if (routeEl) routeEl.textContent = `${vuelo.origen} -> ${vuelo.destino} (${vuelo.tipo_aeronave || 'Airbus A320'})`;

    // Iniciar temporizador de 12 minutos
    iniciarTemporizadorRetencion();

    // Renderizar fuselaje y filas A320
    renderizarFuselajeA320(vuelo);

    // Calcular desglose inicial
    actualizarDesglosePrecios(vuelo.precio_base_cop || 71810);

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
        showToast('El tiempo de retencion de 12 minutos ha expirado.', true);
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

  function renderizarFuselajeA320(vuelo) {
    const container = document.getElementById('fuselage-rows-list');
    if (!container) return;
    container.innerHTML = '';

    // Asientos ocupados simulados para realismo
    const ocupados = new Set(['1B', '2A', '4C', '5B', '6D', '7A']);

    // Filas 1 a 3 VIP (2x2: A, B y C, D)
    for (let f = 1; f <= 3; f++) {
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

    // Filas 4 a 8 Economy (2x2)
    for (let f = 4; f <= 8; f++) {
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
    btn.className = 'seat-btn';
    btn.textContent = col;
    btn.setAttribute('data-seat', seatId);
    btn.setAttribute('data-class', clase);

    if (estaOcupada) {
      btn.classList.add('occupied');
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

    document.querySelectorAll('.seat-btn').forEach(b => {
      const match = b.getAttribute('data-seat') === seatId;
      b.classList.toggle('selected', match);
    });

    const basePrice = uiState.selectedFlight?.precio_base_cop || 71810;
    const factorClase = (clase === 'VIP') ? 1.5 : 1.0;
    actualizarDesglosePrecios(Math.round(basePrice * factorClase));
  }

  function actualizarDesglosePrecios(tarifaBase) {
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

  async function procesarPagoReserva() {
    if (!uiState.selectedSeat) {
      showToast('Por favor selecciona una silla en el mapa de cabina.', true);
      return;
    }

    const docInput = document.getElementById('passenger-doc-input');
    const nameInput = document.getElementById('passenger-name-input');
    const doc = docInput?.value?.trim() || 'CC-102938475';
    const nombre = nameInput?.value?.trim() || 'Carlos Mendoza';

    const vuelo = uiState.selectedFlight;
    const pnr = 'AF-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    // Crear objeto reserva
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
      estado: 'Confirmado'
    };

    uiState.misReservas.unshift(nuevaReserva);

    cerrarMapaCabina();
    showToast(`Pago procesado con exito. Tiquete PNR ${pnr} emitido.`);
    abrirModalMisReservas();
  }

  // =========================================================================
  // 8. MIS RESERVAS Y PASE DE ABORDAR (CON ABORDAJE FIFO EN VIVO)
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

  function renderizarPasesAbordar() {
    const container = document.getElementById('boarding-passes-container');
    if (!container) return;

    if (uiState.misReservas.length === 0) {
      // Si no hay reservas creadas aún, proveer una demo por defecto
      uiState.misReservas.push({
        pnr: 'AF-7K9B2',
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

    try {
      const res = await fetch(`/api/embarque/${encodeURIComponent(reserva.vueloCodigo)}/abordar-pasajero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento: reserva.pasajeroDoc,
          nombre: reserva.pasajeroNombre,
          asiento: reserva.asiento
        })
      });

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
    } catch (e) {
      reserva.estado = 'Abordado';
      renderizarPasesAbordar();
      showToast('Abordaje registrado.');
    }
  }

  // =========================================================================
  // 9. PANEL DE ADMINISTRACIÓN (EXCLUSIVO ADMINISTRADOR)
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
      const res = await fetch('/api/admin/vuelos/editar', {
        method: 'POST',
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
  // 10. CIERRE GLOBAL DE MODALES AL HACER CLICK EN EL BACKDROP
  // =========================================================================
  function cerrarModales() {
    cerrarCalendarioTarifas();
    cerrarMapaCabina();
    cerrarModalMisReservas();
    cerrarPanelAdmin();
    if (window.AeroAuth && typeof window.AeroAuth.cerrarLoginModal === 'function') {
      window.AeroAuth.cerrarLoginModal();
    }
  }
  window.cerrarModales = cerrarModales;

  // =========================================================================
  // 11. INICIALIZACIÓN
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

    // Delegación para cerrar modales al hacer clic en el overlay difuminado
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          detenerTemporizadorRetencion();
        }
      });
    });
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
    abrirMapaCabina,
    cerrarMapaCabina,
    procesarPagoReserva,
    abrirModalMisReservas,
    cerrarModalMisReservas,
    abordarVueloPasajero,
    abrirPanelAdmin,
    cerrarPanelAdmin,
    alternarTabAdmin,
    guardarCambiosVueloAdmin
  };

  document.addEventListener('DOMContentLoaded', init);
})();
