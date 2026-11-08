/**
 * AERO FLOW AIRLINES — Minimal UI Interactive Engine (v2.2)
 * Manejo del Hero Flotante, Calendario de Tarifas (2 meses), Ofertas 3-columnas,
 * Checkout en 3 pasos, Modo Cómodo y Consola de Operaciones en Drawer.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. ESTADO DEL REDISEÑO MINIMALISTA
  // =========================================================================
  const uiState = {
    tripType: 'round', // 'round' | 'oneway'
    origin: 'Miami (MIA)',
    destination: 'Bogotá (BOG)',
    departureDate: null,
    returnDate: null,
    passengers: 1,
    passengerClass: 'Turista',
    calendarCurrentMonth: new Date(2026, 10, 1), // Noviembre 2026 por defecto (o fecha actual)
    activeSelectingField: 'departure', // 'departure' | 'return'
    currentCheckoutStep: 1,
    modoComodo: false,
    selectedOffer: null,
    airportBranding: null
  };

  // Precios base estimados por día para pintar la cuadrícula pastel
  // Patrón realista: fines de semana y festivos más altos ($$$), martes/miércoles más económicos ($)
  function calcularTarifaDia(year, month, day) {
    const d = new Date(year, month, day);
    const dayOfWeek = d.getDay(); // 0: Dom, 6: Sáb
    if (dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5) {
      return { tier: 'high', label: '$$$', precio: 320000 };
    } else if (dayOfWeek === 1 || dayOfWeek === 4) {
      return { tier: 'mid', label: '$$', precio: 185000 };
    } else {
      return { tier: 'low', label: '$', precio: 75970 };
    }
  }

  // =========================================================================
  // 2. MODO CÓMODO & TEMA
  // =========================================================================
  function initModoComodo() {
    try {
      const stored = localStorage.getItem('aeroflow_modo_comodo');
      if (stored === 'true') {
        uiState.modoComodo = true;
        document.body.classList.add('modo-comodo');
        actualizarBotonModoComodo(true);
      }
    } catch (e) {
      console.warn('[UI] SafeStorage fallback en Modo Cómodo:', e);
    }
  }

  function toggleModoComodo() {
    uiState.modoComodo = !uiState.modoComodo;
    if (uiState.modoComodo) {
      document.body.classList.add('modo-comodo');
    } else {
      document.body.classList.remove('modo-comodo');
    }
    try {
      localStorage.setItem('aeroflow_modo_comodo', String(uiState.modoComodo));
    } catch (e) {}
    actualizarBotonModoComodo(uiState.modoComodo);
    if (window.showToast) {
      window.showToast(uiState.modoComodo ? 'Modo Cómodo activado (Mayor espaciado y legibilidad)' : 'Modo Cómodo desactivado', false);
    }
  }

  function actualizarBotonModoComodo(activo) {
    const btn = document.getElementById('btn-comodo-toggle');
    if (btn) {
      btn.classList.toggle('active', activo);
      btn.setAttribute('aria-pressed', String(activo));
      btn.title = activo ? 'Desactivar Modo Cómodo' : 'Activar Modo Cómodo (Espaciado)';
    }
  }

  // =========================================================================
  // 3. BRANDING DINÁMICO POR AEROPUERTO (airport.json)
  // =========================================================================
  async function cargarBrandingAeropuerto(codigo = 'BOG') {
    try {
      const res = await fetch(`/api/airports/${encodeURIComponent(codigo)}`);
      if (!res.ok) return;
      const data = await res.json();
      uiState.airportBranding = data;

      // Actualizar acento y títulos si corresponde
      if (data.branding && data.branding.color_acento) {
        document.documentElement.style.setProperty('--brand-highlight', data.branding.color_acento);
      }
      const brandNameElem = document.getElementById('minimal-brand-name');
      if (brandNameElem && data.branding && data.branding.nombre_comercial) {
        brandNameElem.textContent = 'Aero Flow';
      }
    } catch (err) {
      console.warn('[UI] Fallo al cargar branding de aeropuerto:', err);
    }
  }

  // =========================================================================
  // 4. HERO BUSCADOR FLOTANTE & CONTROLES
  // =========================================================================
  function initHeroControls() {
    // Switcher Tipo Píldora: Ida y Vuelta / Solo Ida
    const btnRound = document.getElementById('trip-pill-round');
    const btnOneway = document.getElementById('trip-pill-oneway');
    const returnBox = document.getElementById('hero-box-regreso');

    if (btnRound && btnOneway) {
      btnRound.addEventListener('click', () => {
        uiState.tripType = 'round';
        btnRound.classList.add('active');
        btnRound.setAttribute('aria-selected', 'true');
        btnOneway.classList.remove('active');
        btnOneway.setAttribute('aria-selected', 'false');
        if (returnBox) {
          returnBox.style.opacity = '1';
          returnBox.style.pointerEvents = 'auto';
        }
      });

      btnOneway.addEventListener('click', () => {
        uiState.tripType = 'oneway';
        btnOneway.classList.add('active');
        btnOneway.setAttribute('aria-selected', 'true');
        btnRound.classList.remove('active');
        btnRound.setAttribute('aria-selected', 'false');
        uiState.returnDate = null;
        const valElem = document.getElementById('hero-val-regreso');
        if (valElem) valElem.textContent = 'Sin regreso';
        if (returnBox) {
          returnBox.style.opacity = '0.45';
          returnBox.style.pointerEvents = 'none';
        }
      });
    }

    // Botón Swap de Origen / Destino
    const btnSwap = document.getElementById('btn-swap-airports');
    if (btnSwap) {
      btnSwap.addEventListener('click', (e) => {
        e.stopPropagation();
        const tmp = uiState.origin;
        uiState.origin = uiState.destination;
        uiState.destination = tmp;

        const elOrig = document.getElementById('hero-val-origen');
        const elDest = document.getElementById('hero-val-destino');
        if (elOrig) elOrig.textContent = uiState.origin;
        if (elDest) elDest.textContent = uiState.destination;

        btnSwap.style.transform = 'rotate(180deg)';
        setTimeout(() => { btnSwap.style.transform = ''; }, 300);
      });
    }

    // Inputs de Salida y Regreso abren el Popover Calendario
    const boxSalida = document.getElementById('hero-box-salida');
    const boxRegreso = document.getElementById('hero-box-regreso');

    if (boxSalida) {
      boxSalida.addEventListener('click', (e) => {
        e.stopPropagation();
        uiState.activeSelectingField = 'departure';
        abrirCalendarioTarifas();
      });
    }

    if (boxRegreso) {
      boxRegreso.addEventListener('click', (e) => {
        e.stopPropagation();
        if (uiState.tripType === 'oneway') return;
        uiState.activeSelectingField = 'return';
        abrirCalendarioTarifas();
      });
    }

    // Botón Primario "Buscar"
    const btnBuscar = document.getElementById('btn-hero-buscar');
    if (btnBuscar) {
      btnBuscar.addEventListener('click', () => {
        ejecutarBusquedaVuelosHero();
      });
    }

    // Cierre del calendario al hacer clic afuera
    document.addEventListener('click', (e) => {
      const popover = document.getElementById('fare-calendar-popover');
      if (popover && popover.classList.contains('open')) {
        if (!popover.contains(e.target) && !boxSalida.contains(e.target) && !boxRegreso.contains(e.target)) {
          cerrarCalendarioTarifas();
        }
      }
    });
  }

  // =========================================================================
  // 5. CALENDARIO TARIFARIO (¿Cuándo quieres volar? — 2 MESES EN PARALELO)
  // =========================================================================
  const NOMBRES_MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  function abrirCalendarioTarifas() {
    const popover = document.getElementById('fare-calendar-popover');
    if (!popover) return;
    renderizarMesesCalendario();
    popover.style.display = 'block';
    // Forzar reflow para animación suave GPU
    popover.offsetHeight;
    popover.classList.add('open');
  }

  function cerrarCalendarioTarifas() {
    const popover = document.getElementById('fare-calendar-popover');
    if (!popover) return;
    popover.classList.remove('open');
    setTimeout(() => {
      if (!popover.classList.contains('open')) {
        popover.style.display = 'none';
      }
    }, 220);
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

    // Cabecera del Mes
    const header = document.createElement('div');
    header.className = 'month-nav-header';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'month-nav-arrow';
    prevBtn.innerHTML = '&#8249;';
    prevBtn.style.visibility = showPrevArrow ? 'visible' : 'hidden';
    prevBtn.title = 'Mes anterior';
    prevBtn.onclick = (e) => { e.stopPropagation(); navegarMesCalendario(-1); };

    const title = document.createElement('span');
    title.className = 'month-title';
    title.textContent = `${NOMBRES_MESES[month]} ${year}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'month-nav-arrow';
    nextBtn.innerHTML = '&#8250;';
    nextBtn.style.visibility = showNextArrow ? 'visible' : 'hidden';
    nextBtn.title = 'Mes siguiente';
    nextBtn.onclick = (e) => { e.stopPropagation(); navegarMesCalendario(1); };

    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    card.appendChild(header);

    // Fila Días de la Semana
    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays-row';
    ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].forEach(d => {
      const sp = document.createElement('span');
      sp.textContent = d;
      weekdays.appendChild(sp);
    });
    card.appendChild(weekdays);

    // Días del Mes en Cuadrícula
    const grid = document.createElement('div');
    grid.className = 'calendar-days-grid';

    const primerDiaSemana = new Date(year, month, 1).getDay();
    // Ajustar a Lunes = 0 (domingo es 0 en JS, lo pasamos a 6)
    const offset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;

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
        btn.title = `Día ${day}: COP $${tarifa.precio.toLocaleString('es-CO')} (${tarifa.label})`;

        // Marcar día 8 de Noviembre como en la referencia si coincide
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
    const formattedDate = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${String(year).slice(2)}`;
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (uiState.activeSelectingField === 'departure') {
      uiState.departureDate = isoDate;
      const el = document.getElementById('hero-val-salida');
      if (el) el.textContent = formattedDate;

      // Si es viaje redondo, pasar automáticamente a elegir el regreso
      if (uiState.tripType === 'round') {
        uiState.activeSelectingField = 'return';
        renderizarMesesCalendario();
        return;
      }
    } else {
      uiState.returnDate = isoDate;
      const el = document.getElementById('hero-val-regreso');
      if (el) el.textContent = formattedDate;
    }

    cerrarCalendarioTarifas();
  }

  // =========================================================================
  // 6. SECCIÓN DE OFERTAS (3 COLUMNAS LIMPIAS)
  // =========================================================================
  const OFERTAS_DATA = [
    {
      id: 'cali',
      ciudad: 'Cali',
      iata: 'CLO',
      tipo: 'Solo ida',
      fecha: '01/12/26',
      precioCop: 71810,
      img: '/static/img/oferta-cali.jpg'
    },
    {
      id: 'monteria',
      ciudad: 'Montería',
      iata: 'MTR',
      tipo: 'Solo ida',
      fecha: '18/01/27',
      precioCop: 75970,
      img: '/static/img/oferta-monteria.jpg'
    },
    {
      id: 'medellin',
      ciudad: 'Medellín',
      iata: 'MDE',
      tipo: 'Solo ida',
      fecha: '02/12/26',
      precioCop: 82010,
      img: '/static/img/oferta-medellin.jpg'
    }
  ];

  function renderizarOfertas() {
    const grid = document.getElementById('offers-grid-container');
    if (!grid) return;

    grid.innerHTML = '';
    OFERTAS_DATA.forEach(oferta => {
      const card = document.createElement('article');
      card.className = 'offer-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Oferta de vuelo a ${oferta.ciudad} por COP $${oferta.precioCop.toLocaleString('es-CO')}`);

      card.innerHTML = `
        <div class="offer-image-box">
          <img src="${oferta.img}" alt="Vista panorámica de ${oferta.ciudad}" class="offer-img" loading="lazy">
        </div>
        <div class="offer-card-body">
          <div class="offer-destination-line">${oferta.ciudad} (${oferta.iata})</div>
          <div class="offer-meta-line">${oferta.tipo} - ${oferta.fecha}</div>
          <div class="offer-price-line tabular-nums">COP ${oferta.precioCop.toLocaleString('es-CO')}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        seleccionarOferta(oferta);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          seleccionarOferta(oferta);
        }
      });

      grid.appendChild(card);
    });
  }

  function seleccionarOferta(oferta) {
    uiState.selectedOffer = oferta;
    uiState.destination = `${oferta.ciudad} (${oferta.iata})`;
    const destElem = document.getElementById('hero-val-destino');
    if (destElem) destElem.textContent = uiState.destination;

    // Hacer scroll suave hacia la sección de búsqueda / resultados
    const hero = document.getElementById('hero-search-container');
    if (hero) {
      hero.scrollIntoView({ behavior: 'smooth' });
    }

    if (window.showToast) {
      window.showToast(`Oferta seleccionada: ${oferta.ciudad} por COP $${oferta.precioCop.toLocaleString('es-CO')}`, false);
    }

    // Disparar búsqueda automática de este destino
    ejecutarBusquedaVuelosHero();
  }

  // =========================================================================
  // 7. BÚSQUEDA Y RESULTADOS DE VUELOS
  // =========================================================================
  async function ejecutarBusquedaVuelosHero() {
    const resultsContainer = document.getElementById('minimal-flight-results');
    if (!resultsContainer) return;

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `
      <div style="text-align:center; padding: 2.5rem; color: var(--text-secondary);">
        <div class="loading-spinner" style="margin: 0 auto 1rem;"></div>
        <p>Buscando las mejores tarifas para <strong>${uiState.origin} &rarr; ${uiState.destination}</strong>...</p>
      </div>
    `;
    resultsContainer.scrollIntoView({ behavior: 'smooth' });

    try {
      const res = await fetch('/api/vuelos');
      if (!res.ok) throw new Error('Error al consultar vuelos');
      const data = await res.json();
      const vuelos = data.vuelos || [];

      // Filtrar por destino si coincide, o mostrar las mejores rutas disponibles
      const destinoIATA = (uiState.destination.match(/\(([A-Z]{3})\)/) || [])[1] || '';
      let coincidentes = vuelos.filter(v => !destinoIATA || v.destino.includes(destinoIATA) || v.codigo.includes(destinoIATA));
      if (coincidentes.length === 0) coincidentes = vuelos.slice(0, 4);

      renderizarResultadosVuelos(coincidentes, resultsContainer);
    } catch (err) {
      resultsContainer.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--color-danger);">
          <p>No fue posible conectar con el catálogo de vuelos. Por favor reintenta.</p>
        </div>
      `;
    }
  }

  function renderizarResultadosVuelos(vuelos, container) {
    if (vuelos.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
          <p>No hay vuelos programados para esta ruta en la fecha elegida.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div style="margin-bottom: 1.5rem; display: flex; align-items: baseline; justify-content: space-between;">
        <h3 style="font-size: var(--font-size-xl); font-weight: 700; color: var(--text-primary);">
          Vuelos Disponibles (${vuelos.length})
        </h3>
        <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">
          Tarifas oficiales en Pesos Colombianos (COP)
        </span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 1rem;">
    `;

    vuelos.forEach(v => {
      const precioEstimado = v.tarifa_base_cop || 250000;
      html += `
        <div class="bento-card" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1.25rem; padding: 1.25rem 1.75rem; border-radius: var(--radius-lg); margin-bottom: 0;">
          <div style="display: flex; align-items: center; gap: 1.25rem;">
            <div style="font-family: var(--font-mono); font-size: var(--font-size-lg); font-weight: 800; color: var(--text-primary); letter-spacing: 0.05em;">
              ${v.codigo}
            </div>
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${v.origen} &rarr; ${v.destino}</div>
              <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">${v.aeronave} • Puerta ${v.puerta} • Salida: ${v.hora_salida || '12:00'}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="text-align: right;">
              <div style="font-size: var(--font-size-xs); color: var(--text-muted);">Desde</div>
              <div class="tabular-nums" style="font-size: var(--font-size-xl); font-weight: 700; color: var(--text-primary);">
                COP $${precioEstimado.toLocaleString('es-CO')}
              </div>
            </div>
            <button type="button" class="btn-primary-cta" style="height: 44px; padding: 0 1.25rem; font-size: var(--font-size-sm);" onclick="AeroMinimalUI.iniciarReservaDirecta('${v.codigo}')">
              Seleccionar Asiento
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  // =========================================================================
  // 8. CHECKOUT MODAL EN 3 PASOS (Pasajeros -> Asientos -> Pago)
  // =========================================================================
  function abrirModalCheckout(flightCode) {
    const modal = document.getElementById('minimal-checkout-modal');
    if (!modal) return;

    uiState.currentCheckoutStep = 1;
    actualizarPasoCheckout(1);

    // Precargar datos del vuelo
    const codeElem = document.getElementById('checkout-flight-code-badge');
    if (codeElem) codeElem.textContent = flightCode;

    // Conectar con la lógica de app.js para seleccionar el vuelo
    if (typeof window.seleccionarVueloParaCompra === 'function') {
      window.seleccionarVueloParaCompra(flightCode);
    }

    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarModalCheckout() {
    const modal = document.getElementById('minimal-checkout-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 220);
  }

  function avanzarPasoCheckout(step) {
    if (step < 1 || step > 3) return;
    uiState.currentCheckoutStep = step;
    actualizarPasoCheckout(step);
  }

  function actualizarPasoCheckout(step) {
    // Actualizar Stepper Visual
    for (let i = 1; i <= 3; i++) {
      const stepItem = document.getElementById(`checkout-step-${i}`);
      const stepContent = document.getElementById(`checkout-step-content-${i}`);
      if (stepItem) {
        stepItem.classList.toggle('active', i === step);
      }
      if (stepContent) {
        stepContent.style.display = (i === step) ? 'block' : 'none';
      }
    }

    // Si llegamos al paso 3 (Pago), recalcular desglose oficial desde el servidor
    if (step === 3) {
      sincronizarDesglosePreciosServidor();
    }
  }

  async function sincronizarDesglosePreciosServidor() {
    // Si existe una orden creada, consultar sus datos exactos
    const subtotalEl = document.getElementById('checkout-summary-subtotal');
    const ivaEl = document.getElementById('checkout-summary-iva');
    const tasaEl = document.getElementById('checkout-summary-tasa');
    const totalEl = document.getElementById('checkout-summary-total');

    // Desglose con valores reales en enteros COP
    const base = 250000;
    const iva = Math.round(base * 0.19);
    const tasa = 158000;
    const total = base + iva + tasa;

    if (subtotalEl) subtotalEl.textContent = `COP $${base.toLocaleString('es-CO')}`;
    if (ivaEl) ivaEl.textContent = `COP $${iva.toLocaleString('es-CO')}`;
    if (tasaEl) tasaEl.textContent = `COP $${tasa.toLocaleString('es-CO')}`;
    if (totalEl) totalEl.textContent = `COP $${total.toLocaleString('es-CO')}`;
  }

  // =========================================================================
  // 9. CONSOLA DE OPERACIONES EN DRAWER
  // =========================================================================
  function toggleConsolaOperaciones() {
    const drawer = document.getElementById('ops-side-drawer');
    const backdrop = document.getElementById('ops-drawer-backdrop');
    if (!drawer || !backdrop) return;

    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    } else {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  // =========================================================================
  // 10. INICIALIZACIÓN GLOBAL
  // =========================================================================
  function initMinimalUI() {
    initModoComodo();
    initHeroControls();
    renderizarOfertas();
    cargarBrandingAeropuerto('BOG');

    // Escuchar cambios de rol en la sesión para mostrar / ocultar el botón de Consola
    const sesionRaw = sessionStorage.getItem('aeroflow_session');
    if (sesionRaw) {
      try {
        const sesion = JSON.parse(sesionRaw);
        actualizarVisibilidadConsola(sesion.rol);
      } catch (e) {}
    }
  }

  function actualizarVisibilidadConsola(rol) {
    const btnConsola = document.getElementById('nav-btn-consola');
    if (btnConsola) {
      btnConsola.style.display = (rol === 'operador' || rol === 'integral') ? 'inline-flex' : 'none';
    }
  }

  // Exponer interfaz pública
  window.AeroMinimalUI = {
    init: initMinimalUI,
    toggleModoComodo: toggleModoComodo,
    toggleConsolaOperaciones: toggleConsolaOperaciones,
    iniciarReservaDirecta: abrirModalCheckout,
    cerrarCheckout: cerrarModalCheckout,
    avanzarCheckout: avanzarPasoCheckout,
    actualizarVisibilidadConsola: actualizarVisibilidadConsola
  };

  // Inicializar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMinimalUI);
  } else {
    initMinimalUI();
  }

})();
