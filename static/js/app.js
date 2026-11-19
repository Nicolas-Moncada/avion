/**
 * AERO FLOW AIRLINES — Frontend Engine
 * Basado estrictamente en Avianca.com y el mapa de asientos cenital adjunto.
 */

const state = {
  activeTab: 'tab-fids',
  lastSyncVersion: 0,
  selectedFlightCode: 'AF1001',
  selectedSeat: null,
  isBoardingSimulationRunning: false,
  boardingIntervalId: null,
  aircraftCatalog: null,
  lastPurchase: null,
  selectedPayMethod: 'card',
  isSubmittingVuelo: false,
  isSubmittingPasajero: false,
  isSubmittingCompra: false,
  isSubmittingPago: false,
  isCancellingTicket: false,
  isAudioMuted: false,
  directorioFiltroCategoria: 'todos',
  directorioBusquedaTexto: '',
  allPasajerosCache: []
};

// --- NÚCLEO DE UTILIDADES COMPARTIDAS (core.js) ---
const AeroCore = window.AeroCore || {};
const esc = AeroCore.escapeHtml || ((s) => String(s == null ? '' : s));
const escAttr = AeroCore.escapeAttr || esc;

// Fecha operativa del día (reemplaza la fecha congelada del demo original)
function fechaHoyStr() {
  const ahora = new Date();
  const desplazo = ahora.getTimezoneOffset();
  return new Date(ahora.getTime() - desplazo * 60000).toISOString().slice(0, 10);
}

// El form.reset() limpia <input type="date">; reagendar el valor del día en cada reset
function formVueloFijarFechaEnReset() {
  const formVuelo = document.getElementById('form-crear-vuelo');
  if (formVuelo && !formVuelo.dataset.resetBound) {
    formVuelo.dataset.resetBound = 'true';
    formVuelo.addEventListener('reset', () => {
      setTimeout(() => {
        const inp = document.getElementById('vuelo-fecha');
        if (inp) inp.value = fechaHoyStr();
      }, 10);
    });
  }
}
// --- MODAL TÁCTICO DE CONFIRMACIÓN GLASSMORPHISM (ZERO ALERTS / NATIVE CONFIRMS) ---
let tacticalConfirmResolver = null;

function mostrarTacticalConfirmModal({ titulo, mensaje, icono = '⚠️', textoBtn = 'Confirmar Acción' }) {
  return new Promise((resolve) => {
    tacticalConfirmResolver = resolve;
    const modal = document.getElementById('tactical-confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const descEl = document.getElementById('confirm-modal-desc');
    const iconEl = document.getElementById('confirm-modal-icon');
    const btnExec = document.getElementById('confirm-modal-btn-execute');

    if (titleEl) titleEl.innerText = titulo || 'Confirmar Acción Táctica';
    if (descEl) descEl.innerText = mensaje || '¿Estás seguro de que deseas proceder?';
    if (iconEl) iconEl.innerText = icono || '⚠️';
    if (btnExec) btnExec.innerText = textoBtn || 'Confirmar Acción';

    if (modal) modal.style.display = 'flex';
  });
}

window.cerrarTacticalConfirmModal = function(resultado) {
  const modal = document.getElementById('tactical-confirm-modal');
  if (modal) modal.style.display = 'none';
  if (typeof tacticalConfirmResolver === 'function') {
    tacticalConfirmResolver(resultado);
    tacticalConfirmResolver = null;
  }
};

// --- CONTROL DE AUDIO ACÚSTICO GLOBAL (MUTE / UNMUTE) ---
window.toggleAudioMute = function() {
  state.isAudioMuted = !state.isAudioMuted;
  const icon = document.getElementById('audio-icon-state');
  if (icon) {
    icon.innerText = state.isAudioMuted ? '🔇' : '🔊';
  }
  showToast(state.isAudioMuted ? 'Efectos acústicos silenciados 🔇' : 'Efectos acústicos activados 🔊');
};

// --- SINCRONIZACIÓN REACTIVA GLOBAL (ZERO DESYNC) ---
async function syncAllViews(opciones = {}) {
  try {
    const flightCode = opciones.codigo_vuelo || state.selectedFlightCode;
    await Promise.allSettled([
      cargarVuelos(),
      cargarPasajeros(),
      cargarPasajerosRecientes(),
      cargarSelectoresFlota(),
      cargarMapaAvion(flightCode),
      verificarEstadoBotonEmbarque(flightCode)
    ]);

    // Actualizar selector rápido de pase de abordar y precargar tiquete si está vacío
    actualizarSelectorRapidoPase(flightCode);
  } catch (err) {
    console.error('Error en syncAllViews:', err);
  }
}
window.syncAllViews = syncAllViews;

// --- GESTIÓN DE PASAJEROS DEL DIRECTORIO CON BÚSQUEDA Y FILTROS ---
function filtrarTablaPasajerosDirectorio() {
  const input = document.getElementById('input-filtro-directorio');
  state.directorioBusquedaTexto = (input ? input.value : '').toLowerCase().trim();
  renderizarTablaPasajerosFiltrada();
}
window.filtrarTablaPasajerosDirectorio = filtrarTablaPasajerosDirectorio;

function setFiltroCategoriaDirectorio(cat) {
  state.directorioFiltroCategoria = cat;
  document.querySelectorAll('.filter-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === cat);
  });
  renderizarTablaPasajerosFiltrada();
}
window.setFiltroCategoriaDirectorio = setFiltroCategoriaDirectorio;

function renderizarTablaPasajerosFiltrada() {
  const tbody = document.getElementById('tabla-pasajeros-body');
  if (!tbody) return;

  let filtrados = state.allPasajerosCache || [];

  // Filtro por categoría / estado
  if (state.directorioFiltroCategoria === 'vip') {
    filtrados = filtrados.filter(p => (p.categoria_viajero || '').toUpperCase() === 'VIP');
  } else if (state.directorioFiltroCategoria === 'estandar') {
    filtrados = filtrados.filter(p => (p.categoria_viajero || '').toUpperCase() !== 'VIP');
  } else if (state.directorioFiltroCategoria === 'espera') {
    filtrados = filtrados.filter(p => !p.vuelo_asignado || p.vuelo_asignado === 'Sin asignar');
  }

  // Filtro por texto en tiempo real
  if (state.directorioBusquedaTexto) {
    const q = state.directorioBusquedaTexto;
    filtrados = filtrados.filter(p => 
      String(p.documento || '').toLowerCase().includes(q) ||
      String(p.nombre || '').toLowerCase().includes(q) ||
      String(p.vuelo_asignado || '').toLowerCase().includes(q) ||
      String(p.nacionalidad || '').toLowerCase().includes(q)
    );
  }

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:1.5rem; font-weight:600;">No se encontraron pasajeros con el criterio seleccionado</td></tr>`;
    return;
  }

  let html = '';
  filtrados.forEach(p => {
    html += `
      <tr>
        <td><strong style="color:var(--avianca-black);">${esc(p.documento)}</strong></td>
        <td>${esc(p.nombre)}</td>
        <td>${esc(p.nacionalidad)}</td>
        <td>
          <span class="status-pill-clean ${p.categoria_viajero === 'VIP' ? 'llamada' : 'abierto'}">
            ${esc(p.categoria_viajero)}
          </span>
        </td>
        <td>${p.vuelo_asignado ? `<strong style="color:var(--avianca-red);">${esc(p.vuelo_asignado)}</strong>` : '<span style="color:var(--avianca-gray-text)">Sin asignar</span>'}</td>
        <td style="text-align:center;">
          <button type="button" class="btn-delete-pasajero" data-action="eliminar-pasajero" data-doc="${escAttr(p.documento)}" data-nomb="${escAttr(p.nombre)}" title="Eliminar a ${escAttr(p.nombre)} del directorio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            <span>Eliminar</span>
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// Selector Rápido de Pasajero en el Pase de Abordar v33.0
async function actualizarSelectorRapidoPase(codigoVuelo) {
  const box = document.getElementById('quick-pax-selector-box');
  const sel = document.getElementById('select-pax-boarding-pass');
  if (!box || !sel) return;

  try {
    const res = await fetch('/api/pasajeros-recientes');
    const data = await res.json();
    const regs = (data.registros || []).filter(r => r.vuelo_id === codigoVuelo);

    if (regs.length > 0) {
      box.style.display = 'inline-flex';
      let opts = '';
      regs.forEach(p => {
        opts += `<option value="${escAttr(p.documento)}">${esc(p.nombre_completo)} (Asiento ${esc(p.asiento)})</option>`;
      });
      sel.innerHTML = opts;

      // Si no hay tarjeta de boarding pass activa o está en estado vacío, cargar al primer pasajero
      const bpContainer = document.getElementById('boarding-pass-container');
      if (bpContainer && (!document.getElementById('card-boarding-pass') || bpContainer.querySelector('.empty-state-wizard'))) {
        cargarPrimerPaseDeVuelo(codigoVuelo);
      }
    } else {
      box.style.display = 'none';
    }
  } catch (e) {
    console.error('Error al actualizar selector rápido de pase', e);
  }
}
window.actualizarSelectorRapidoPase = actualizarSelectorRapidoPase;

window.onCambiarPasajeroBoardingPass = async function(doc) {
  const cod = state.selectedFlightCode;
  if (!doc || !cod) return;
  await reimprimirTicketPasajero(doc, cod);
};

// --- MAPEO DE MONUMENTOS REALES VERIFICADOS (WIKIPEDIA REST API) ---
const DESTINATION_LANDMARKS = {
  'BOG': { city: 'Bogotá', landmark: 'Monserrate', desc: 'Cerro de Monserrate y Skyline' },
  'MDE': { city: 'Medellín', landmark: 'Medellín', desc: 'Panorámica del Valle de Aburrá, Medellín' },
  'CTG': { city: 'Cartagena de Indias', landmark: 'Cartagena,_Colombia', desc: 'Ciudad Amurallada de Cartagena' },
  'CLO': { city: 'Cali', landmark: 'Cali', desc: 'Santiago de Cali' },
  'BAQ': { city: 'Barranquilla', landmark: 'Barranquilla', desc: 'Barranquilla y Río Magdalena' },
  'SMR': { city: 'Santa Marta', landmark: 'Santa_Marta', desc: 'Bahía de Santa Marta' },
  'ADZ': { city: 'San Andrés Islas', landmark: 'San_Andrés_(island)', desc: 'Mar de los Siete Colores, San Andrés' },
  'MEX': { city: 'Ciudad de México', landmark: 'Palacio_de_Bellas_Artes', desc: 'Palacio de Bellas Artes' },
  'CUN': { city: 'Cancún', landmark: 'Cancún', desc: 'Playas y Zona Hotelera de Cancún' },
  'MIA': { city: 'Miami', landmark: 'Downtown_Miami', altLandmark: 'Miami', desc: 'Skyline de Miami y Bahía Vizcaína' },
  'JFK': { city: 'Nueva York', landmark: 'Lower_Manhattan', desc: 'Skyline de Nueva York Manhattan' },
  'MAD': { city: 'Madrid', landmark: 'Puerta_de_Alcalá', desc: 'Puerta de Alcalá / Gran Vía' },
  'BCN': { city: 'Barcelona', landmark: 'Sagrada_Família', desc: 'Basílica de la Sagrada Familia' },
  'LHR': { city: 'Londres', landmark: 'Palace_of_Westminster', desc: 'Big Ben y Río Támesis' },
  'CDG': { city: 'París', landmark: 'Eiffel_Tower', altLandmark: 'Paris', desc: 'Torre Eiffel' },
  'EZE': { city: 'Buenos Aires', landmark: 'Puerto_Madero', desc: 'Puente de la Mujer y Puerto Madero' },
  'SCL': { city: 'Santiago de Chile', landmark: 'Sanhattan', desc: 'Santiago de Chile y Cordillera de los Andes' },
  'GRU': { city: 'São Paulo', landmark: 'Paulista_Avenue', desc: 'Avenida Paulista' },
  'PTY': { city: 'Ciudad de Panamá', landmark: 'Panama_City', desc: 'Skyline de Ciudad de Panamá' }
};

// URLs fijas verificadas de Wikimedia Commons para carga instantánea sincronizada (0ms) y fallback seguro
const VERIFIED_LANDMARK_FALLBACKS = {
  'BOG': '/assets/img/destino-placeholder.svg',
  'MDE': '/assets/img/destino-placeholder.svg',
  'CTG': '/assets/img/destino-placeholder.svg',
  'CLO': '/assets/img/destino-placeholder.svg',
  'BAQ': '/assets/img/destino-placeholder.svg',
  'SMR': '/assets/img/destino-placeholder.svg',
  'ADZ': '/assets/img/destino-placeholder.svg',
  'MEX': '/assets/img/destino-placeholder.svg',
  'CUN': '/assets/img/destino-placeholder.svg',
  'MIA': '/assets/img/destino-placeholder.svg',
  'JFK': '/assets/img/destino-placeholder.svg',
  'MAD': '/assets/img/destino-placeholder.svg',
  'BCN': '/assets/img/destino-placeholder.svg',
  'LHR': '/assets/img/destino-placeholder.svg',
  'CDG': '/assets/img/destino-placeholder.svg',
  'EZE': '/assets/img/destino-placeholder.svg',
  'SCL': '/assets/img/destino-placeholder.svg',
  'GRU': '/assets/img/destino-placeholder.svg',
  'PTY': '/assets/img/destino-placeholder.svg'
};

const IMAGE_CACHE = {};

function getDestinationIata(destStr) {
  if (!destStr) return 'MIA';
  const match = destStr.match(/\b([A-Z]{3})\b/);
  if (match && DESTINATION_LANDMARKS[match[1]]) return match[1];
  for (const code of Object.keys(DESTINATION_LANDMARKS)) {
    if (destStr.toUpperCase().includes(code)) return code;
  }
  return 'MIA';
}

function getDestinationPhotoUrl(iata, isBanner = true) {
  // 1. Memoria RAM (0ms)
  if (IMAGE_CACHE[iata]) return IMAGE_CACHE[iata];
  
  // 2. LocalStorage (0ms)
  try {
    const local = localStorage.getItem(`aeroflow_wiki_img_${iata}`);
    if (local) {
      IMAGE_CACHE[iata] = local;
      return local;
    }
  } catch (e) {
    // LocalStorage restringido
  }

  // 3. Fallback sincronizado verificado de Wikimedia
  return VERIFIED_LANDMARK_FALLBACKS[iata] || VERIFIED_LANDMARK_FALLBACKS['MEX'];
}

async function obtenerFotoWikipedia(iata) {
  if (IMAGE_CACHE[iata]) return IMAGE_CACHE[iata];
  
  try {
    const local = localStorage.getItem(`aeroflow_wiki_img_${iata}`);
    if (local) {
      IMAGE_CACHE[iata] = local;
      return local;
    }
  } catch (e) {}

  const info = DESTINATION_LANDMARKS[iata];
  if (!info) return VERIFIED_LANDMARK_FALLBACKS[iata] || VERIFIED_LANDMARK_FALLBACKS['MEX'];

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(info.landmark)}`;
    const res = await fetch(url, { headers: { 'Api-User-Agent': 'AeroFlowAirlines/1.0' } });
    if (res.ok) {
      const data = await res.json();
      let photo = data.originalimage?.source || data.thumbnail?.source;
      
      // Si la foto principal es un mapa SVG/PNG o logo, consultar altLandmark o fallback
      if ((!photo || photo.includes('logo') || photo.endsWith('.svg') || photo.includes('neighborhoodsmap')) && info.altLandmark) {
        const altRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(info.altLandmark)}`, { headers: { 'Api-User-Agent': 'AeroFlowAirlines/1.0' } });
        if (altRes.ok) {
          const altData = await altRes.json();
          photo = altData.originalimage?.source || altData.thumbnail?.source;
        }
      }

      if (photo && !photo.endsWith('.svg') && !photo.includes('neighborhoodsmap')) {
        IMAGE_CACHE[iata] = photo;
        try {
          localStorage.setItem(`aeroflow_wiki_img_${iata}`, photo);
        } catch (e) {}
        return photo;
      }
    }
  } catch (err) {
    console.warn(`Wikipedia API no disponible para ${iata}, usando imagen verificada.`, err);
  }

  const fallback = VERIFIED_LANDMARK_FALLBACKS[iata] || VERIFIED_LANDMARK_FALLBACKS['MEX'];
  IMAGE_CACHE[iata] = fallback;
  return fallback;
}

// Precarga en segundo plano de los 19 monumentos oficiales
async function precargarFotosMonumentos() {
  const iatas = Object.keys(DESTINATION_LANDMARKS);
  for (const iata of iatas) {
    try {
      const url = await obtenerFotoWikipedia(iata);
      const preImg = new Image();
      preImg.src = url;
    } catch (e) {}
  }
}

function buildPosterFallback(iata, city) {
  // Paleta diferenciada por destino para que cada póster sea reconocible
  const paletas = {
    BOG: ['#0B192C', '#1E4E8C', '#2E7DD1'], MDE: ['#122A16', '#2E7D32', '#66BB6A'],
    CTG: ['#1E1E10', '#8D6E2F', '#C9A227'], CLO: ['#0D1B2A', '#E8590C', '#FFA94D'],
    BAQ: ['#14213D', '#FCA311', '#FFD166'], SMR: ['#0B2941', '#00A8CC', '#7DD8E8'],
    ADZ: ['#023E8A', '#00B4D8', '#90E0EF'], MEX: ['#2B002F', '#E91E63', '#FF80AB'],
    CUN: ['#005F73', '#EE9B00', '#CA6702'], MIA: ['#00285E', '#0077B6', '#90CAF9'],
    JFK: ['#101820', '#37474F', '#FFC107'], MAD: ['#4A1A03', '#D62828', '#F46520'],
    BCN: ['#3D0C02', '#C1121F', '#FF6D00'], LHR: ['#0F1523', '#26418F', '#7C9CD6'],
    CDG: ['#1B2A49', '#3E5C9A', '#C8102E'], EZE: ['#0A2A43', '#5AB1BB', '#A7E8EB'],
    SCL: ['#0C2340', '#D93E30', '#F2A65A'], GRU: ['#1A2313', '#4E7D2C', '#9CCC65'],
    PTY: ['#062B2B', '#0E9594', '#67D2D2']
  };
  const colores = paletas[iata] || ['#0B192C', '#1E3A8A', '#DA291C'];
  const ciudad = (city || iata).replace(/[<>&"']/g, '');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320">
      <defs>
        <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colores[0]}"/>
          <stop offset="55%" stop-color="${colores[1]}"/>
          <stop offset="100%" stop-color="${colores[2]}"/>
        </linearGradient>
      </defs>
      <rect width="900" height="320" fill="url(#cg)"/>
      <g stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="1.5" fill="none">
        <circle cx="760" cy="60" r="42"/><circle cx="760" cy="60" r="70"/><circle cx="760" cy="60" r="98"/>
      </g>
      <g stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="6 8">
        <path d="M40 250 Q 340 60 860 120" fill="none"/>
      </g>
      <path d="M238 116 L296 104 L382 30 L405 36 L355 104 L447 96 L462 112 L350 122 L326 190 L306 186 L312 122 Z"
            fill="#FFFFFF" fill-opacity="0.92" transform="translate(30,30)"/>
      <text x="46" y="262" fill="#FFFFFF" font-family="Consolas, monospace" font-size="64" font-weight="900" letter-spacing="6">${iata}</text>
      <text x="48" y="296" fill="#FFFFFF" fill-opacity="0.85" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="700">${ciudad}</text>
      <text x="742" y="272" fill="#FFFFFF" fill-opacity="0.7" font-family="Consolas, monospace" font-size="16" text-anchor="end">AERO FLOW // RED GLOBAL</text>
    </svg>`);
}

function handleImageError(img) {
  if (!img) return;
  img.onerror = null;
  const iata = img.alt ? getDestinationIata(img.alt) : 'MEX';
  if (VERIFIED_LANDMARK_FALLBACKS[iata] && img.src !== VERIFIED_LANDMARK_FALLBACKS[iata]) {
    img.src = VERIFIED_LANDMARK_FALLBACKS[iata];
    return;
  }
  const infoCiudad = DESTINATION_LANDMARKS[iata];
  img.src = buildPosterFallback(iata, infoCiudad ? infoCiudad.city : iata);
}
window.handleImageError = handleImageError;

function renderDestinationHero(containerId, flight) {
  const container = document.getElementById(containerId);
  if (!container || !flight) return;
  const iata = getDestinationIata(flight.destino);
  const info = DESTINATION_LANDMARKS[iata] || { city: flight.destino, desc: 'Destino AeroFlow' };
  const initialPhotoUrl = getDestinationPhotoUrl(iata, true);
  const origen = flight.origen ? flight.origen.split('-')[0].trim() : 'BOG';

  container.style.display = 'block';
  container.innerHTML = `
    <div class="destination-hero-card">
      <img src="${initialPhotoUrl}" 
           alt="${info.city}" 
           id="hero-img-${containerId}"
           class="destination-hero-img" 
           loading="lazy" 
           decoding="async" 
           onerror="handleImageError(this)">
      <div class="destination-hero-overlay"></div>
      <div class="destination-hero-content">
        <div class="destination-hero-left">
          <span class="destination-hero-badge">✈️ Destino Conectado // Flota AeroFlow</span>
          <h3 class="destination-hero-city">${esc(info.city)} <span class="destination-hero-iata">(${iata})</span></h3>
        </div>
        <div class="destination-hero-pill-info">
          Ruta: <strong>${esc(origen)} ➔ ${iata}</strong> | Puerta: <strong>${esc(flight.puerta || 'B-01')}</strong> | Aeronave: <strong>${esc(flight.tipo_aeronave || 'Flota Comercial')}</strong>
        </div>
      </div>
    </div>
  `;

  // Consulta asíncrona de Wikipedia para refrescar con alta fidelidad si no estaba en caché
  obtenerFotoWikipedia(iata).then(freshUrl => {
    const imgEl = document.getElementById(`hero-img-${containerId}`);
    if (imgEl && freshUrl && imgEl.src !== freshUrl) {
      imgEl.src = freshUrl;
    }
  }).catch(() => {});
}
window.renderDestinationHero = renderDestinationHero;

// Helper de debouncing y estado visual de carga en botones
function setButtonLoading(btn, isLoading, originalHtml) {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('btn-is-loading');
    btn.innerHTML = `
      <span class="btn-loader-content">
        <svg class="spinner-minimal" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="32" stroke-linecap="round"/>
        </svg>
        <span>Procesando...</span>
      </span>
      <span class="btn-loader-progress-bar"></span>
    `;
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-is-loading');
    btn.innerHTML = originalHtml || btn.dataset.origHtml || 'Enviar';
  }
}

// Micro-interacción Global: Efecto de Onda Expansiva (Ripple Effect) al hacer clic
document.addEventListener('click', (e) => {
  const target = e.target.closest('.btn-avianca-red, .btn-secondary, .btn-cancelar-operacion, .btn-op-cancelar, .btn-op-reactivar, .btn-op-archivar, .island-nav-item, .btn-delete-pasajero');
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const circle = document.createElement('span');
  const diameter = Math.max(rect.width, rect.height);
  const radius = diameter / 2;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${e.clientX - rect.left - radius}px`;
  circle.style.top = `${e.clientY - rect.top - radius}px`;
  circle.classList.add('ripple-wave');

  const oldRipple = target.querySelector('.ripple-wave');
  if (oldRipple) oldRipple.remove();

  target.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
});

// --- DELEGACIÓN GLOBAL DE ACCIONES (sustituye a los onclick inline inyectados) ---
document.addEventListener('click', (e) => {
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  const accion = actionBtn.getAttribute('data-action');
  const cod = actionBtn.getAttribute('data-codificador') || '';
  const doc = actionBtn.getAttribute('data-doc') || '';
  const nomb = actionBtn.getAttribute('data-nomb') || '';

  if (accion === 'eliminar-pasajero') {
    eliminarPasajero(doc, nomb);
  } else if (accion === 'ir-comprar') {
    irAComprarParaPasajero(doc, nomb);
  } else if (accion === 'reimprimir-ticket') {
    reimprimirTicketPasajero(doc, cod);
  } else if (accion === 'cancelar-vuelo') {
    cancelarVueloOperador(cod);
  } else if (accion === 'reactivar-vuelo') {
    reactivarVueloOperador(cod);
  } else if (accion === 'archivar-vuelo') {
    archivarVueloOperador(cod);
  } else if (accion === 'cancelar-tiquete') {
    cancelarTiquete(cod, doc);
  } else if (accion === 'cancelar-reserva-pasajero') {
    const vuelo = actionBtn.getAttribute('data-vuelo') || cod;
    const documento = actionBtn.getAttribute('data-documento') || doc;
    cancelarReservaPasajeroConfirmada(vuelo, documento, nomb);
  } else if (accion === 'seleccionar-reserva') {
    irAReservarVuelo(cod);
  }
});

// Botón "Seleccionar" del tablero FIDS (antd data-codificador)
document.addEventListener('click', (e) => {
  const btnReserva = e.target.closest('.btn-select-reserva');
  if (!btnReserva) return;
  irAReservarVuelo(btnReserva.getAttribute('data-codificador') || '');
});

// Pausa de orbes animados al ocultar la pestaña para ahorro de GPU/CPU
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    document.body.classList.add('tab-hidden');
  } else {
    document.body.classList.remove('tab-hidden');
  }
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  initThemeMode();
  initClock12h();
  initHeroMediaCarousels();
  initCommercialNavigation();
  initVirtualCardListeners();
  initEventListeners();
  initPrintListeners();

  // Sincronizar rol con sesión activa de autenticación (auth.js)
  try {
    const sesion = (typeof obtenerSesionActual === 'function') ? obtenerSesionActual() : JSON.parse(sessionStorage.getItem('aeroflow_session') || 'null');
    if (sesion && sesion.rol) {
      const rolModo = (sesion.rol === 'pasajero') ? 'cliente' : (sesion.rol === 'operador') ? 'operador' : 'todos';
      if (typeof filtrarModoRol === 'function') filtrarModoRol(rolModo);
    }
  } catch (e) {
    if (typeof filtrarModoRol === 'function') filtrarModoRol('cliente');
  }

  // Fecha de salida del formulario con valor del día actual
  const inpFechaVuelo = document.getElementById('vuelo-fecha');
  if (inpFechaVuelo) {
    inpFechaVuelo.value = fechaHoyStr();
    formVueloFijarFechaEnReset();
  }

  // Precarga asíncrona de fotografías de monumentos reales
  precargarFotosMonumentos();

  await cargarCatalogoFlota();
  await cargarVuelos();
  await cargarPasajeros();
  await cargarPasajerosRecientes();
  await cargarSelectoresFlota();

  iniciarMotorContadorVuelos();

  // Routing por hash: permite enlaces directos a un módulo (#tab-compra-avion, etc.)
  const hashDestino = (location.hash || '').replace('#', '');
  if (hashDestino && document.getElementById(hashDestino) && hashDestino.startsWith('tab-')) {
    activarTab(hashDestino);
  }

  // Smart polling reactivo cada 2.5 segundos
  setInterval(verificarSincronizacion, 2500);
});

// --- GESTOR DE MODO OSCURO / CLARO AERONÁUTICO ---
function initThemeMode() {
  const toggleBtn = document.getElementById('btn-theme-toggle');
  
  // Recuperar preferencia guardada en localStorage o preferencia del sistema
  let savedTheme = 'dark';
  try {
    const stored = localStorage.getItem('aeroflow_theme');
    if (stored === 'light' || stored === 'dark') {
      savedTheme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      savedTheme = 'light';
    }
  } catch (e) {}

  aplicarTema(savedTheme);

  // Escuchar cambios de preferencia del sistema si el usuario no ha fijado una manualmente
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        try {
          if (!localStorage.getItem('aeroflow_theme')) {
            aplicarTema(e.matches ? 'light' : 'dark');
          }
        } catch (err) {}
      });
    } catch (e) {}
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || (document.body.classList.contains('dark-mode') ? 'dark' : 'light');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      aplicarTema(newTheme);
      try {
        localStorage.setItem('aeroflow_theme', newTheme);
      } catch (e) {}
      showToast(newTheme === 'dark' ? 'Modo Oscuro Glassmorphism Activado 🌙' : 'Modo Claro Corporativo Activado ☀️');
    });
  }
}

function aplicarTema(theme) {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-bs-theme', theme);
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    document.documentElement.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
    document.documentElement.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
  }

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.setAttribute('title', isDark ? 'Cambiar a Modo Claro Corporativo (☀️)' : 'Cambiar a Modo Oscuro Glassmorphism (🌙)');
    toggleBtn.setAttribute('aria-label', isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro');
  }
}

// --- CAROUSEL CINEMÁTICO DE FOTOGRAFÍAS AÉREAS EN HERO BANNERS ---
function initHeroMediaCarousels() {
  const heroBanners = document.querySelectorAll('.hero-banner-multimedia');
  heroBanners.forEach(banner => {
    const slides = banner.querySelectorAll('.hero-media-slide');
    const dots = banner.querySelectorAll('.slide-dot');
    if (!slides.length) return;

    let currentIndex = 0;
    slides.forEach((s, idx) => {
      if (s.classList.contains('active')) currentIndex = idx;
    });

    function goToSlide(targetIdx) {
      slides.forEach((s, i) => s.classList.toggle('active', i === targetIdx));
      dots.forEach((d, i) => d.classList.toggle('active', i === targetIdx));
      currentIndex = targetIdx;
    }

    let intervalId = setInterval(() => {
      if (document.hidden) return;
      const nextIdx = (currentIndex + 1) % slides.length;
      goToSlide(nextIdx);
    }, 7000);

    banner._carouselGoTo = (idx) => {
      clearInterval(intervalId);
      goToSlide(idx);
      intervalId = setInterval(() => {
        if (document.hidden) return;
        const nextIdx = (currentIndex + 1) % slides.length;
        goToSlide(nextIdx);
      }, 7000);
    };
  });
}

window.cambiarSlideManual = function(btnDot, slideIdx) {
  const banner = btnDot.closest('.hero-banner-multimedia');
  if (banner && typeof banner._carouselGoTo === 'function') {
    banner._carouselGoTo(slideIdx);
  }
};

// --- RELOJ LOCAL 12H EN HEADER (AM / PM) ---
function initClock12h() {
  const clockEl = document.getElementById('header-clock-12h');
  function tick() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    if (clockEl) {
      clockEl.innerText = `${strHours}:${minutes}:${seconds} ${ampm}`;
    }
  }
  tick();
  setInterval(tick, 1000);
}

// --- NAVEGACIÓN ESTILO "DYNAMIC ISLAND" (ISLA FLOTANTE) ---
function initCommercialNavigation() {
  document.querySelectorAll('.island-nav-item, .nav-link-item').forEach(link => {
    link.addEventListener('click', () => {
      const tabTarget = link.dataset.tab;
      activarTab(tabTarget);
    });
  });
}

// --- SELECTOR DE ROL: PORTAL PASAJERO VS CONSOLA OPERATIVA ---
window.filtrarModoRol = function(rol) {
  document.querySelectorAll('.role-chip-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-role-${rol}`) || (rol === 'todos' ? document.getElementById('btn-role-all') : null);
  if (activeBtn) activeBtn.classList.add('active');

  document.body.classList.remove('role-mode-cliente', 'role-mode-operador', 'role-mode-todos');
  if (rol === 'cliente') {
    document.body.classList.add('role-mode-cliente');
  } else if (rol === 'operador') {
    document.body.classList.add('role-mode-operador');
  } else {
    document.body.classList.add('role-mode-todos');
  }

  const navItems = document.querySelectorAll('.island-nav-item');
  navItems.forEach(item => {
    const itemRole = item.getAttribute('data-role');
    if (rol === 'todos') {
      item.classList.remove('dimmed-role');
    } else if (rol === 'cliente') {
      if (itemRole === 'cliente' || itemRole === 'dual') {
        item.classList.remove('dimmed-role');
      } else {
        item.classList.add('dimmed-role');
      }
    } else if (rol === 'operador') {
      if (itemRole === 'operador' || itemRole === 'dual') {
        item.classList.remove('dimmed-role');
      } else {
        item.classList.add('dimmed-role');
      }
    }
  });

  if (rol === 'cliente' && state.activeTab === 'tab-pasajeros') {
    activarTab('tab-fids');
  } else if (rol === 'operador' && state.activeTab === 'tab-compra-avion') {
    activarTab('tab-pasajeros');
  }

  showToast(
    rol === 'cliente' ? '👤 Portal Pasajero Activo: Búsqueda, reserva, cabina, pago en COP y pase de abordar' :
    rol === 'operador' ? '🛠️ Consola Operativa Activa: Manifiesto, directorio, control de puerta y rampa' :
    '🌐 Vista Integral Activa: Todos los portales y módulos operativos visibles',
    false
  );
};

window.activarTab = function(tabTarget) {
  // Validación de permisos por rol autenticado (auth.js)
  try {
    const sesion = (typeof obtenerSesionActual === 'function') ? obtenerSesionActual() : JSON.parse(sessionStorage.getItem('aeroflow_session') || 'null');
    const rolActual = sesion ? sesion.rol : 'pasajero';
    if (typeof tienePermiso === 'function' && !tienePermiso(rolActual, tabTarget)) {
      if (typeof window.showToast === 'function') {
        if (rolActual === 'operador' && tabTarget === 'tab-compra-avion') {
          window.showToast('⚠️ Acceso restringido: El flujo de reserva y compra es exclusivo para pasajeros.', true);
        } else {
          window.showToast('⚠️ Módulo restringido para tu perfil actual.', true);
        }
      }
      return false;
    }
  } catch (e) {}

  document.querySelectorAll('.island-nav-item, .nav-link-item, .mobile-nav-item').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  document.querySelectorAll(`.island-nav-item[data-tab="${tabTarget}"], .nav-link-item[data-tab="${tabTarget}"], .mobile-nav-item[data-tab="${tabTarget}"]`).forEach(l => {
    l.classList.add('active');
  });

  const pane = document.getElementById(tabTarget);
  if (pane) {
    pane.classList.add('active');
    // Reinicio de la animación de entrada del panel
    pane.classList.remove('pane-enter');
    void pane.offsetWidth;
    if (!AeroCore.respetaMovimientoReducido()) pane.classList.add('pane-enter');
  }
  state.activeTab = tabTarget;
  try {
    if (history.replaceState) history.replaceState(null, '', '#' + tabTarget);
  } catch (e) { /* Modo restringido */ }

  if (tabTarget === 'tab-pasajeros') {
    cargarPasajeros();
    cargarPasajerosRecientes();
  }

  if (tabTarget === 'tab-compra-avion') {
    let cod = document.getElementById('select-seatmap-vuelo')?.value || state.selectedFlightCode;
    if (!cod) {
      const sel = document.getElementById('select-seatmap-vuelo');
      if (sel && sel.options.length > 0 && sel.options[0].value) {
        cod = sel.options[0].value;
        sel.value = cod;
      } else {
        cod = 'AF1001';
      }
    }
    state.selectedFlightCode = cod;
    cargarMapaAvion(cod);
  }

  if (tabTarget === 'tab-puerta') {
    let cod = state.selectedFlightCode || document.getElementById('select-puerta-vuelo')?.value;
    if (!cod) {
      const selP = document.getElementById('select-puerta-vuelo');
      if (selP && selP.options.length > 0 && selP.options[0].value) {
        cod = selP.options[0].value;
        selP.value = cod;
      } else {
        cod = 'AF1001';
      }
    }
    state.selectedFlightCode = cod;
    // Cargar automáticamente el pase de abordar y actualizar el selector rápido
    cargarPrimerPaseDeVuelo(cod);
    actualizarSelectorRapidoPase(cod);
  }

  // Desplazamiento suave hacia arriba para vista limpia SPA
  window.scrollTo({ top: 0, behavior: AeroCore.respetaMovimientoReducido() ? 'auto' : 'smooth' });
};

function sanitizeCommercialText(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/Hash Map O\(1\)/gi, 'Itinerario de Vuelos')
    .replace(/Hash Map/gi, 'Itinerario de Vuelos')
    .replace(/Árbol AVL con complejidad O\(log n\)/gi, 'Directorio Oficial')
    .replace(/Árbol AVL/gi, 'Directorio Oficial')
    .replace(/Standby FIFO/gi, 'Lista de Espera Prioritaria')
    .replace(/Cola FIFO/gi, 'Lista de Espera')
    .replace(/¡Ascenso Automático FIFO!/gi, '¡Asignación Confirmada!')
    .replace(/salió de Standby y obtuvo/gi, 'ha obtenido')
    .replace(/FIFO/gi, 'Prioritario')
    .replace(/en cola/gi, 'en lista de espera')
    .replace(/cola de espera/gi, 'lista de espera')
    .replace(/cola/gi, 'lista');
}

function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const cleanMsg = sanitizeCommercialText(message);
  if (Array.from(container.children).some(el => el.innerText === cleanMsg)) {
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : 'toast-info'}`;
  toast.innerText = cleanMsg;
  container.appendChild(toast);

  if (isError && typeof window.reproducirTonoAeronautico === 'function') {
    window.reproducirTonoAeronautico('alerta');
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate3d(24px, 12px, 0) scale(0.95)';
    toast.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => toast.remove(), 280);
  }, 4000);
}

// --- CATALOGO FLOTA ---
async function cargarCatalogoFlota() {
  try {
    const res = await fetch('/api/flota/catalogo');
    state.aircraftCatalog = await res.json();
  } catch (err) {
    console.error('Error cargando catalogo', err);
  }
}

// --- EVENT LISTENERS ---
function initEventListeners() {
  // Módulo 1: Crear Vuelo
  const formVuelo = document.getElementById('form-crear-vuelo');
  if (formVuelo) {
    formVuelo.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isSubmittingVuelo) return;
      const btnSubmit = formVuelo.querySelector('button[type="submit"]');
      const origen = document.getElementById('vuelo-origen').value.trim();
      const destino = document.getElementById('vuelo-destino').value.trim();

      if (origen === destino) {
        showToast('El origen y el destino no pueden ser la misma terminal.');
        return;
      }

      state.isSubmittingVuelo = true;
      setButtonLoading(btnSubmit, true);
      payload = {
        codigo: document.getElementById('vuelo-codigo').value.trim().toUpperCase(),
        origen: origen,
        destino: destino,
        tipo_aeronave: document.getElementById('vuelo-aeronave').value,
        fecha_salida: document.getElementById('vuelo-fecha').value || new Date().toISOString().slice(0, 10),
        hora_salida_12h: document.getElementById('vuelo-hora-salida').value.trim(),
        puerta: document.getElementById('vuelo-puerta').value.trim(),
        estado: 'Check-in abierto'
      };

      try {
        const res = await fetch('/api/vuelos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.mensaje);
          formVuelo.reset();
          cargarVuelos();
          cargarSelectoresFlota();
        } else {
          showToast(data.error || 'Error al registrar vuelo');
        }
      } catch (err) {
        showToast('Error de comunicación con el servidor');
      } finally {
        state.isSubmittingVuelo = false;
        setButtonLoading(btnSubmit, false);
      }
    });
  }

  // Módulo 1: Buscador Hash Map O(1) con Menú Desplegable Inteligente
  const selBuscarVuelo = document.getElementById('select-buscar-vuelo');
  const btnBuscarVuelo = document.getElementById('btn-buscar-vuelo');
  if (selBuscarVuelo) {
    selBuscarVuelo.addEventListener('change', () => {
      consultarVueloHashMap(selBuscarVuelo.value);
    });
  }
  if (btnBuscarVuelo) {
    btnBuscarVuelo.addEventListener('click', () => {
      const cod = selBuscarVuelo ? selBuscarVuelo.value : '';
      consultarVueloHashMap(cod);
    });
  }

  // Módulo 2: Registrar Pasajero AVL
  const formPasajero = document.getElementById('form-crear-pasajero');
  if (formPasajero) {
    formPasajero.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isSubmittingPasajero) return;
      const btnSubmit = formPasajero.querySelector('button[type="submit"]');
      const doc = document.getElementById('pasajero-doc').value.trim();
      const nombre = document.getElementById('pasajero-nombre').value.trim();

      if (!doc || !nombre) {
        showToast('El documento y el nombre completo son obligatorios.');
        return;
      }

      state.isSubmittingPasajero = true;
      const payload = {
        documento: doc,
        nombre: nombre,
        nacionalidad: document.getElementById('pasajero-nac').value.trim() || 'Colombia',
        categoria_viajero: document.getElementById('pasajero-cat').value
      };

      setButtonLoading(btnSubmit, true);
      try {
        const res = await fetch('/api/pasajeros', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.mensaje);
          formPasajero.reset();
          cargarPasajeros();
        } else {
          showToast(data.error || 'Error al guardar pasajero');
        }
      } catch (err) {
        showToast('Error en el directorio');
      } finally {
        state.isSubmittingPasajero = false;
        setButtonLoading(btnSubmit, false);
      }
    });
  }

  // Módulo 2: Buscador Logarítmico AVL con Menú Desplegable Inteligente
  const selBuscarPasajero = document.getElementById('select-buscar-pasajero');
  const btnBuscarPasajero = document.getElementById('btn-buscar-pasajero');
  if (selBuscarPasajero) {
    selBuscarPasajero.addEventListener('change', () => {
      consultarPasajeroAVL(selBuscarPasajero.value);
    });
  }
  if (btnBuscarPasajero) {
    btnBuscarPasajero.addEventListener('click', () => {
      const doc = selBuscarPasajero ? selBuscarPasajero.value : '';
      consultarPasajeroAVL(doc);
    });
  }

  // Módulo 3: Selector Inteligente de Pasajero Registrado (AVL)
  const selCompraPasajero = document.getElementById('compra-pasajero-select');
  if (selCompraPasajero) {
    selCompraPasajero.addEventListener('change', () => {
      const opt = selCompraPasajero.selectedOptions[0];
      if (opt && opt.value) {
        document.getElementById('compra-pasajero-doc').value = opt.value;
        document.getElementById('compra-pasajero-nombre').value = opt.getAttribute('data-nombre') || '';
      }
    });
  }

  // Módulo 3: Selector Inteligente de Asiento en Cabina
  const selCompraAsiento = document.getElementById('compra-asiento-select');
  if (selCompraAsiento) {
    selCompraAsiento.addEventListener('change', () => {
      const seatId = selCompraAsiento.value;
      if (seatId) {
        onSeleccionarSilla(seatId, '', false);
      }
    });
  }

  // Módulo 3: Selector de Vuelo
  const selSeatmap = document.getElementById('select-seatmap-vuelo');
  if (selSeatmap) {
    selSeatmap.addEventListener('change', () => {
      const cod = selSeatmap.value;
      if (cod) {
        state.selectedFlightCode = cod;
        state.selectedSeat = null;
        cargarMapaAvion(cod);
      }
    });
  }

  // Módulo 3: Formulario Checkout / Compra con Pasarela AeroFlow Pay
  const formCompra = document.getElementById('form-emitir-boleto');
  if (formCompra) {
    formCompra.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isSubmittingCompra) return;
      const btnSubmit = formCompra.querySelector('button[type="submit"]');
      const cod = document.getElementById('select-seatmap-vuelo')?.value || state.selectedFlightCode;
      const doc = document.getElementById('compra-pasajero-doc')?.value.trim();
      const nombre = document.getElementById('compra-pasajero-nombre')?.value.trim();
      const asiento = state.selectedSeat ? state.selectedSeat.id : document.getElementById('compra-asiento-select')?.value.trim();

      if (!doc) {
        showToast('Por favor ingrese el documento de identidad del pasajero.');
        return;
      }

      state.isSubmittingCompra = true;
      setButtonLoading(btnSubmit, true);
      try {
        const checkRes = await fetch(`/api/avion/${cod}/mapa`);
        const checkData = await checkRes.json();

        if (checkData.lleno) {
          // Vuelo al 100% -> Ingreso directo a lista de espera sin cobro inmediato
          const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              codigo_vuelo: cod,
              documento: doc,
              nombre_nuevo: nombre,
              asiento: ''
            })
          });
          const data = await res.json();
          if (res.ok) {
            showToast('Autorización de pre-reserva en Lista de Espera sin cargo ($ 0 COP). Asignación automática al liberarse cupo.');
            document.getElementById('compra-pasajero-doc').value = '';
            document.getElementById('compra-pasajero-nombre').value = '';
            state.selectedSeat = null;
            cargarMapaAvion(cod);
            cargarVuelos();
          } else {
            showToast(data.error || 'Error al ingresar a la lista de espera');
          }
          return;
        }

        // Hay cupo disponible en cabina -> Verificar selección de butaca
        if (!asiento) {
          showToast('Por favor seleccione una butaca en el fuselaje o en el menú antes de proceder al pago.');
          return;
        }

        // Abrir pasarela comercial de alta fidelidad AeroFlow Pay
        abrirModalPago(cod, asiento, doc, nombre);

      } catch (err) {
        showToast('Error al verificar disponibilidad del vuelo');
      } finally {
        state.isSubmittingCompra = false;
        setButtonLoading(btnSubmit, false);
      }
    });
  }

  // Módulo 4: Botón Iniciar Embarque
  const btnIniciarEmbarque = document.getElementById('btn-iniciar-embarque');
  if (btnIniciarEmbarque) {
    btnIniciarEmbarque.addEventListener('click', () => {
      if (state.isBoardingSimulationRunning || btnIniciarEmbarque.disabled) return;
      const cod = document.getElementById('select-puerta-vuelo')?.value;
      if (!cod) {
        showToast('Seleccione un vuelo activo en puerta');
        return;
      }
      btnIniciarEmbarque.disabled = true;
      ejecutarSimulacionEmbarque(cod);
    });
  }

  // Módulo 4: Selector de Vuelo en Puerta
  const selPuerta = document.getElementById('select-puerta-vuelo');
  if (selPuerta) {
    selPuerta.addEventListener('change', () => {
      const cod = selPuerta.value;
      if (cod) {
        state.selectedFlightCode = cod;
        verificarEstadoBotonEmbarque(cod);
      }
    });
  }
}

// --- SYNC REACTIVO ---
async function verificarSincronizacion() {
  try {
    const res = await fetch('/api/sync-state');
    const data = await res.json();

    if (state.lastSyncVersion === 0) {
      state.lastSyncVersion = data.version;
      return;
    }

    if (data.version !== state.lastSyncVersion) {
      state.lastSyncVersion = data.version;
      cargarVuelos();
      if (state.activeTab === 'tab-pasajeros') {
        cargarPasajeros();
        cargarPasajerosRecientes();
      }
      if (state.activeTab === 'tab-compra-avion') {
        const cod = document.getElementById('select-seatmap-vuelo')?.value || state.selectedFlightCode;
        if (cod) cargarMapaAvion(cod);
      }
    }
  } catch (err) {
    // Offline
  }
}

// --- MÓDULO 1: VUELOS & FIDS ---
window.irAReservarVuelo = function(cod) {
  if (!cod) return;
  state.selectedFlightCode = cod;
  activarTab('tab-compra-avion');
  const sel = document.getElementById('select-seatmap-vuelo');
  if (sel) sel.value = cod;
  cargarMapaAvion(cod);
};

async function cargarVuelos() {
  try {
    const res = await fetch('/api/vuelos');
    const data = await res.json();

    renderFidsTable('tabla-en-curso-body', data.en_curso || []);
    renderFidsTable('tabla-proximos-body', data.proximos || [], true);
    renderAdminVuelosTable(data.todos_admin || []);

    const badge = document.getElementById('fids-telemetria-badge');
    if (badge) {
      badge.innerText = `${data.total || (data.proximos || []).length} Vuelos Disponibles`;
    }
    const heroCount = document.getElementById('hero-stat-vuelos-count');
    if (heroCount) {
      const tot = data.total || 0;
      if (AeroCore.animarContador) AeroCore.animarContador(heroCount, tot);
      else heroCount.innerText = tot;
    }
  } catch (err) {
    console.error('Error cargando vuelos', err);
  }
}

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return '00:00';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.flightTimerInterval = null;
const vuelosEnExpiracion = new Set();

async function expirarYReemplazarVuelo(codigo) {
  if (!codigo || vuelosEnExpiracion.has(codigo)) return;
  // Protección de vuelos comerciales base de demostración
  const VUELOS_BASE = ['AF1001', 'AF2020', 'AF2040', 'AF3022', 'AF4055', 'AF5088'];
  if (VUELOS_BASE.includes(codigo)) return;

  // Si el usuario está activamente pagando o simulando abordaje, no interrumpir con timeout
  if (state.isSubmittingPago || state.isSubmittingCompra || state.isBoardingSimulationRunning) return;

  vuelosEnExpiracion.add(codigo);
  try {
    const res = await fetch(`/api/vuelos/${codigo}/expirar-y-reemplazar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok) {
      if (data.cancelado_timeout) {
        showToast(data.mensaje || `Vuelo ${codigo} CANCELADO / EXPIRADO por superar tiempo límite sin sellado.`, true);
        if (typeof window.reproducirTonoAeronautico === 'function') {
          window.reproducirTonoAeronautico('cancelacion');
        }
      } else {
        showToast(data.mensaje || `Vuelo ${codigo} completó su ciclo y ha sido reemplazado en rampa.`);
        if (typeof window.reproducirTonoAeronautico === 'function') {
          window.reproducirTonoAeronautico('despegue');
        }
      }
      await syncAllViews({ codigo_vuelo: state.selectedFlightCode });
    }
  } catch (err) {
    console.error('Error al expirar vuelo', err);
  } finally {
    setTimeout(() => vuelosEnExpiracion.delete(codigo), 8000);
  }
}

function iniciarMotorContadorVuelos() {
  if (window.flightTimerInterval) {
    clearInterval(window.flightTimerInterval);
    window.flightTimerInterval = null;
  }

  window.flightTimerInterval = setInterval(() => {
    const pills = document.querySelectorAll('.countdown-pill[data-segundos]');
    pills.forEach(pill => {
      let seg = parseInt(pill.getAttribute('data-segundos'), 10);
      const codigo = pill.getAttribute('data-vuelo');
      const timerSpan = pill.querySelector('.countdown-timer');

      if (!isNaN(seg) && seg > 0) {
        seg -= 1;
        pill.setAttribute('data-segundos', seg);
        if (timerSpan) {
          timerSpan.textContent = formatCountdown(seg);
        } else {
          pill.textContent = `⏳ ${formatCountdown(seg)}`;
        }

        if (seg <= 120) {
          pill.classList.add('urgent');
        } else {
          pill.classList.remove('urgent');
        }

        if (seg === 0 && codigo && !vuelosEnExpiracion.has(codigo)) {
          const VUELOS_BASE = ['AF1001', 'AF2020', 'AF2040', 'AF3022', 'AF4055', 'AF5088'];
          if (VUELOS_BASE.includes(codigo)) {
            const resetSegs = codigo === 'AF1001' ? 300 : 720;
            pill.setAttribute('data-segundos', resetSegs);
            if (timerSpan) timerSpan.textContent = formatCountdown(resetSegs);
          } else {
            pill.innerHTML = '⚠️ Expirado';
            expirarYReemplazarVuelo(codigo);
          }
        }
      }
    });
  }, 1000);
}

function renderFidsTable(tbodyId, vuelos, showPuerta = false) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (vuelos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--avianca-gray-text); padding:1.5rem;">NO HAY VUELOS EN ESTA CATEGORÍA</td></tr>`;
    return;
  }

  let html = '';
  vuelos.forEach(v => {
    const estadoStr = String(v.estado || '');
    const isDespachado = (estadoStr === 'DESPEGADO' || estadoStr === 'Despegado' || estadoStr === 'Cerrado');
    const isCancelado = v.cancelado || estadoStr.includes('CANCELADO');
    const isExpirado = estadoStr.includes('EXPIRADO');

    let estadoClass = 'programado';
    if (isCancelado) estadoClass = isExpirado ? 'expirado' : 'cancelado';
    else if (isDespachado) estadoClass = 'embarcando';
    else if (v.estado === 'Embarcando') estadoClass = 'embarcando';
    else if (v.estado === 'Última llamada') estadoClass = 'llamada';
    else if (v.estado === 'Check-in abierto') estadoClass = 'abierto';

    let countdownHtml = '';
    if (isCancelado) {
      countdownHtml = `
        <div style="margin-top:0.35rem;">
          <span class="status-pill-clean ${estadoClass}" style="font-size:0.68rem; font-weight:800;">
            🚫 ${isExpirado ? 'Cancelado (Timeout)' : 'Anulado Operador'}
          </span>
        </div>
      `;
    } else if (isDespachado) {
      countdownHtml = `
        <div style="margin-top:0.35rem;">
          <span class="countdown-pill" style="background:rgba(16, 185, 129, 0.18); color:#34D399; border:1px solid rgba(16, 185, 129, 0.35); font-weight:800;">
            ✈️ Despachado
          </span>
        </div>
      `;
    } else {
      const segs = v.countdown_segundos !== undefined ? v.countdown_segundos : 600;
      const isUrgent = segs <= 120 && segs > 0;
      countdownHtml = `
        <div style="margin-top:0.35rem;">
          <span class="countdown-pill ${isUrgent ? 'urgent' : ''}" data-vuelo="${escAttr(v.codigo)}" data-segundos="${segs}">
            ⏳ <span class="countdown-timer">${formatCountdown(segs)}</span>
          </span>
        </div>
      `;
    }

    let reservaBtnHtml = '';
    if (showPuerta) {
      if (isCancelado) {
        reservaBtnHtml = `<td><span style="font-size:0.75rem; color:#EF4444; font-weight:700; padding:0.3rem 0.65rem; background:rgba(239, 68, 68, 0.1); border-radius:9999px;">No Disponible</span></td>`;
      } else {
        reservaBtnHtml = `<td><button class="btn-avianca-red btn-select-reserva" data-codificador="${escAttr(v.codigo)}" style="padding:0.35rem 0.85rem; font-size:0.75rem; border-radius:9999px;">Seleccionar</button></td>`;
      }
    }

    html += `
      <tr>
        <td><strong style="color:var(--avianca-red); font-weight:800;">${esc(v.codigo)}</strong></td>
        ${!showPuerta ? `<td>${esc((v.origen || 'BOG').split('-')[0].trim())}</td>` : ''}
        <td><strong>${esc(v.destino)}</strong></td>
        <td><span style="font-size:0.8rem; color:var(--avianca-gray-text);">${esc(v.tipo_aeronave)}</span></td>
        <td><strong>${esc(v.hora_salida_12h)}</strong></td>
        <td><span style="font-weight:700;">${esc(v.puerta)}</span></td>
        <td>
          <span style="font-weight:700; color:${v.lleno ? 'var(--avianca-red)' : 'var(--avianca-black)'};">
            ${v.ocupacion} / ${v.capacidad_maxima}
          </span>
        </td>
        ${!showPuerta ? `<td><span style="color:${v.standby_count > 0 ? '#B45309' : 'var(--avianca-gray-text)'}; font-weight:700;">${v.standby_count}</span></td>` : ''}
        <td>
          <span class="status-pill-clean ${estadoClass}">
            ${esc(v.estado)}
          </span>
          ${countdownHtml}
        </td>
        ${reservaBtnHtml}
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function renderAdminVuelosTable(vuelos) {
  const tbody = document.getElementById('tabla-admin-vuelos-body');
  if (!tbody) return;

  const badge = document.getElementById('admin-vuelos-badge');
  if (badge) badge.innerText = `${vuelos.length} Vuelos en Flota`;

  if (!vuelos || vuelos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--avianca-gray-text); padding:1.5rem;">No hay vuelos registrados en la flota comercial</td></tr>`;
    return;
  }

  let html = '';
  vuelos.forEach(v => {
    const estadoStr = String(v.estado || '');
    const isCancelado = v.cancelado || estadoStr.includes('CANCELADO');
    const isExpirado = estadoStr.includes('EXPIRADO');
    const isDespachado = (estadoStr === 'DESPEGADO' || estadoStr === 'Despegado' || estadoStr === 'Cerrado');

    let badgeClass = 'programado';
    if (isCancelado) badgeClass = isExpirado ? 'expirado' : 'cancelado';
    else if (isDespachado) badgeClass = 'embarcando';
    else if (estadoStr === 'Embarcando') badgeClass = 'embarcando';
    else if (estadoStr === 'Última llamada') badgeClass = 'llamada';
    else if (estadoStr === 'Check-in abierto') badgeClass = 'abierto';

    let actionsHtml = '';
    const codAttr = escAttr(v.codigo);
    if (isCancelado) {
      actionsHtml = `
        <div style="display:inline-flex; gap:0.4rem; justify-content:center;">
          <button type="button" class="btn-op-reactivar" data-action="reactivar-vuelo" data-codificador="${codAttr}" title="Reactivar vuelo a Check-in abierto">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            <span>Reactivar</span>
          </button>
          <button type="button" class="btn-op-archivar" data-action="archivar-vuelo" data-codificador="${codAttr}" title="Archivar definitivamente este vuelo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            <span>Archivar</span>
          </button>
        </div>
      `;
    } else if (isDespachado) {
      actionsHtml = `<span style="font-size:0.75rem; color:#10B981; font-weight:700;">✈️ Despachado</span>`;
    } else {
      actionsHtml = `
        <button type="button" class="btn-op-cancelar" data-action="cancelar-vuelo" data-codificador="${codAttr}" title="Cancelar este vuelo por error de programación">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>Cancelar (Error)</span>
        </button>
      `;
    }

    html += `
      <tr>
        <td><strong style="color:var(--avianca-red); font-weight:800;">${esc(v.codigo)}</strong></td>
        <td><strong>${esc((v.origen || '').split('-')[0].trim())} ➔ ${esc((v.destino || '').split('-')[0].trim())}</strong></td>
        <td><span style="font-size:0.8rem; color:var(--avianca-gray-text);">${esc(v.tipo_aeronave)}</span></td>
        <td><span>${esc(v.hora_salida_12h || '')}</span> <strong style="color:var(--text-muted); font-size:0.75rem;">(Pta: ${esc(v.puerta || '')})</strong></td>
        <td><strong>${v.ocupacion} / ${v.capacidad_maxima}</strong></td>
        <td><span class="status-pill-clean ${badgeClass}">${esc(v.estado)}</span></td>
        <td style="text-align:center;">${actionsHtml}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function cancelarVueloOperador(codigo) {
  if (!codigo) return;
  const confirmado = await mostrarTacticalConfirmModal({
    titulo: `Cancelar Vuelo ${codigo}`,
    mensaje: `¿Desea cancelar este vuelo por error de programación?\nEl vuelo pasará al estado "CANCELADO / ANULADO POR OPERADOR", se liberará su cabina y se anulará la asignación de pasajeros.`,
    icono: '⚠️',
    textoBtn: 'Confirmar Anulación'
  });
  if (!confirmado) return;

  try {
    const res = await fetch(`/api/vuelo/cancelar/${encodeURIComponent(codigo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.mensaje || `Vuelo ${codigo} cancelado correctamente por el operador.`);
      if (typeof window.reproducirTonoAeronautico === 'function') {
        window.reproducirTonoAeronautico('cancelacion');
      }
      await syncAllViews({ codigo_vuelo: codigo });
    } else {
      showToast(data.error || 'Error al cancelar vuelo', true);
    }
  } catch (err) {
    console.error('Error al cancelar vuelo:', err);
    showToast('Error de red al intentar cancelar el vuelo', true);
  }
}

async function reactivarVueloOperador(codigo) {
  if (!codigo) return;
  const confirmado = await mostrarTacticalConfirmModal({
    titulo: `Reactivar Vuelo ${codigo}`,
    mensaje: `¿Desea reactivar el vuelo ${codigo} a "Check-in abierto"?\nLos pasajeros podrán volver a reservar y abordar normalmente.`,
    icono: '🔄',
    textoBtn: 'Reactivar Vuelo'
  });
  if (!confirmado) return;

  try {
    const res = await fetch(`/api/vuelo/reactivar/${encodeURIComponent(codigo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.mensaje || `Vuelo ${codigo} reactivado a Check-in abierto.`);
      await syncAllViews({ codigo_vuelo: codigo });
    } else {
      showToast(data.error || 'Error al reactivar vuelo', true);
    }
  } catch (err) {
    console.error('Error al reactivar vuelo:', err);
    showToast('Error de red al intentar reactivar el vuelo', true);
  }
}

async function archivarVueloOperador(codigo) {
  if (!codigo) return;
  const confirmado = await mostrarTacticalConfirmModal({
    titulo: `Archivar Vuelo ${codigo}`,
    mensaje: `¿Desea archivar definitivamente el vuelo ${codigo}?\nEl vuelo se retirará de las listas activas en rampa.`,
    icono: '📦',
    textoBtn: 'Archivar Definitivamente'
  });
  if (!confirmado) return;

  try {
    const res = await fetch(`/api/vuelo/archivar/${encodeURIComponent(codigo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.mensaje || `Vuelo ${codigo} archivado.`);
      await syncAllViews({ codigo_vuelo: codigo });
    } else {
      showToast(data.error || 'Error al archivar vuelo', true);
    }
  } catch (err) {
    console.error('Error al archivar vuelo:', err);
    showToast('Error de red al intentar archivar el vuelo', true);
  }
}

// --- HELPERS DE BÚSQUEDA AUTOMÁTICA EN ESTRUCTURAS ---
async function consultarVueloHashMap(cod) {
  if (!cod) return;
  try {
    const res = await fetch(`/api/vuelos/buscar/${cod}`);
    const data = await res.json();
    const card = document.getElementById('vuelo-search-card');
    if (!card) return;
    card.style.display = 'block';
    card.classList.remove('fade-in');
    void card.offsetWidth; // Trigger reflow for animation restart
    card.classList.add('fade-in');

    if (res.ok && data.encontrado) {
      const v = data.vuelo;
      renderDestinationHero('destination-hero-m1', v);
      renderLiveRouteTelemetry(v, data.ocupacion);
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
          <span style="font-size:1.15rem; font-weight:800; color:var(--avianca-black);">${esc(v.codigo)} — ${esc(v.origen)} ✈ ${esc(v.destino)}</span>
          <span class="status-pill-clean abierto">Vuelo Activo</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:0.5rem; font-size:0.88rem;">
          <div><span style="color:var(--avianca-gray-text)">Aeronave:</span> <strong>${esc(v.tipo_aeronave)}</strong></div>
          <div><span style="color:var(--avianca-gray-text)">Salida (12H):</span> <strong>${esc(v.hora_salida_12h)}</strong></div>
          <div><span style="color:var(--avianca-gray-text)">Puerta:</span> <strong>${esc(v.puerta)}</strong></div>
          <div><span style="color:var(--avianca-gray-text)">Ocupación:</span> <strong>${data.ocupacion}/${v.capacidad_maxima}</strong></div>
        </div>
      `;
    } else {
      card.innerHTML = `<span style="color:var(--avianca-red); font-weight:700;">${esc(data.mensaje || 'Vuelo no encontrado')}</span>`;
    }
  } catch (err) {
    console.error('Error consultando vuelo en itinerario', err);
  }
}

async function consultarPasajeroAVL(doc) {
  if (!doc) return;
  try {
    const res = await fetch(`/api/pasajeros/buscar/${doc}`);
    const data = await res.json();
    const card = document.getElementById('pasajero-search-card');
    if (!card) return;
    card.style.display = 'block';
    card.classList.remove('fade-in');
    void card.offsetWidth; // Trigger reflow for animation restart
    card.classList.add('fade-in');

    if (res.ok && data.encontrado) {
      const p = data.pasajero;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <span style="font-size:1.1rem; font-weight:800; color:var(--avianca-black);">${esc(p.nombre)}</span>
          <span class="status-pill-clean abierto">Cliente Verificado</span>
        </div>
        <div style="background:rgba(30, 58, 138, 0.25); border-left:4px solid #3B82F6; padding:0.5rem 0.8rem; margin-bottom:0.6rem; font-family:var(--font-sans); font-size:0.85rem; color:#93C5FD; font-weight:600;">
          ⚡ Viajero frecuente verificado en la base de datos oficial de AERO FLOW AIRLINES
        </div>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.5rem; font-size:0.85rem;">
          <div><span style="color:var(--avianca-gray-text)">Doc:</span> <strong>${esc(p.documento)}</strong></div>
          <div><span style="color:var(--avianca-gray-text)">Categoría:</span> <strong>${esc(p.categoria_viajero)}</strong></div>
          <div><span style="color:var(--avianca-gray-text)">Vuelo Asignado:</span> <strong>${esc(p.vuelo_asignado || 'Sin vuelo asignado')}</strong></div>
        </div>
      `;
    } else {
      card.innerHTML = `<span style="color:var(--avianca-red); font-weight:700;">Pasajero no localizado en el directorio central</span>`;
    }
  } catch (err) {
    console.error('Error consultando pasajero en directorio', err);
  }
}

// --- MÓDULO 2: PASAJEROS ---
async function cargarPasajeros() {
  try {
    const res = await fetch('/api/pasajeros');
    const data = await res.json();
    const tbody = document.getElementById('tabla-pasajeros-body');
    const badge = document.getElementById('avl-metrics-badge');

    if (badge) {
      badge.innerText = `${data.total} Clientes Registrados | Estado Activo`;
    }

    // Actualizar selectores inteligentes de pasajeros
    const selBuscarP = document.getElementById('select-buscar-pasajero');
    const selCompraP = document.getElementById('compra-pasajero-select');

    if (selBuscarP && data.pasajeros.length > 0) {
      let bOpts = '';
      data.pasajeros.forEach(p => {
        bOpts += `<option value="${escAttr(p.documento)}">${esc(p.documento)} — ${esc(p.nombre)} (${esc(p.categoria_viajero)}) ${p.vuelo_asignado ? `[Vuelo: ${esc(p.vuelo_asignado)}]` : ''}</option>`;
      });
      selBuscarP.innerHTML = bOpts;
      if (!selBuscarP.dataset.initialized) {
        selBuscarP.dataset.initialized = 'true';
        consultarPasajeroAVL(data.pasajeros[0].documento);
      }
    }

    if (selCompraP) {
      let cOpts = '<option value="">-- Seleccionar Pasajero Frecuente --</option>';
      data.pasajeros.forEach(p => {
        cOpts += `<option value="${escAttr(p.documento)}" data-nombre="${escAttr(p.nombre)}">${esc(p.documento)} — ${esc(p.nombre)} (${esc(p.categoria_viajero)})</option>`;
      });
      selCompraP.innerHTML = cOpts;
    }

    state.allPasajerosCache = data.pasajeros || [];
    renderizarTablaPasajerosFiltrada();
  } catch (err) {
    console.error('Error cargando pasajeros', err);
  }
}

// --- FUNCIÓN GLOBAL DE ELIMINACIÓN DE PASAJERO CON MODAL TÁCTICO GLASSMORPHISM ---
async function eliminarPasajero(documento, nombre) {
  const nombreTxt = nombre ? `"${nombre}" (${documento})` : `con documento ${documento}`;
  const confirmar = await mostrarTacticalConfirmModal({
    titulo: 'Eliminar Pasajero del Directorio',
    mensaje: `¿Estás seguro de eliminar a ${nombreTxt}?\nEsta acción liberará de inmediato su butaca en cabina y cancelará la reserva en la base de datos oficial.`,
    icono: '🗑️',
    textoBtn: 'Eliminar Definitivamente'
  });
  if (!confirmar) return;

  try {
    const res = await fetch(`/api/pasajero/eliminar/${encodeURIComponent(documento)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (res.ok && data.exito) {
      showToast(`🗑️ ${data.mensaje}`);
      if (typeof window.reproducirTonoAeronautico === 'function') {
        window.reproducirTonoAeronautico('cancelacion');
      }
      
      // Sincronizar reactivamente todo el estado de la aplicación
      await syncAllViews();
    } else {
      showToast(data.error || 'No se pudo eliminar el pasajero', true);
    }
  } catch (err) {
    console.error('Error al eliminar pasajero:', err);
    showToast('Error de conexión al intentar eliminar el pasajero', true);
  }
}

// --- MÓDULO 2: PASAJEROS Y PAGOS CERRADO POR AVIÓN ---
async function cargarPasajerosRecientes() {
  try {
    const [resPagos, resVuelos, resPasajeros] = await Promise.all([
      fetch('/api/pasajeros-recientes'),
      fetch('/api/vuelos'),
      fetch('/api/pasajeros')
    ]);

    const dataPagos = await resPagos.json();
    const dataVuelos = await resVuelos.json();
    const dataPasajeros = await resPasajeros.json();

    const contenedor = document.getElementById('contenedor-manifiestos-aviones');
    const badge = document.getElementById('badge-total-pagos-recientes');
    const heroCount = document.getElementById('hero-stat-pagos-count');

    const totalPagos = dataPagos.total || 0;
    if (badge) badge.innerText = `${totalPagos} Pagos Registrados`;
    if (heroCount) {
      if (AeroCore.animarContador) AeroCore.animarContador(heroCount, totalPagos);
      else heroCount.innerText = totalPagos;
    }

    // Actualizar Panel de KPIs Operativos y Financieros v32.0
    actualizarPanelKPIsFlota(dataPagos, dataVuelos, dataPasajeros);

    if (!contenedor) return;

    const registros = dataPagos.registros || [];
    const todosVuelos = [...(dataVuelos.en_curso || []), ...(dataVuelos.proximos || []), ...(dataVuelos.despegados || [])];
    const mapaVuelosInfo = {};
    todosVuelos.forEach(v => {
      mapaVuelosInfo[v.codigo] = v;
    });

    // Agrupar pagos estrictamente por vuelo_id
    const pagosPorVuelo = {};
    registros.forEach(p => {
      const vId = p.vuelo_id || 'SIN_VUELO';
      if (!pagosPorVuelo[vId]) {
        pagosPorVuelo[vId] = [];
      }
      pagosPorVuelo[vId].push(p);
    });

    if (registros.length === 0) {
      contenedor.innerHTML = `
        <div style="text-align:center; padding:2rem; background:rgba(15, 23, 42, 0.6); border:1.5px dashed #334155; border-radius:12px; color:var(--text-muted); font-weight:600;">
          No hay registros de pagos ni tiquetes emitidos en este momento.
        </div>
      `;
      return;
    }

    let html = '';

    // Renderizar una tarjeta cerrada <details class="aircraft-manifest-card"> por cada avión / vuelo
    for (const [vueloId, pasajerosVuelo] of Object.entries(pagosPorVuelo)) {
      const vInfo = mapaVuelosInfo[vueloId] || {};
      const aeronave = vInfo.tipo_aeronave || 'Airbus A319 Corporate';
      const ruta = vInfo.origen && vInfo.destino
        ? `${vInfo.origen.split('-')[0].trim()} ➔ ${vInfo.destino.split('-')[0].trim()}`
        : (pasajerosVuelo[0]?.origen_destino || 'BOG ➔ MIA');
      const horario = vInfo.hora_salida_12h ? `Salida: ${vInfo.hora_salida_12h}` : 'Salida: 09:15 PM';

      // Calcular ocupación y recaudo total del vuelo
      const ocupacionPax = pasajerosVuelo.length;
      const recaudoTotalCop = pasajerosVuelo.reduce((acc, p) => acc + (Number(p.monto_cop) || 0), 0);

      // Determinar si todos los pasajeros de este avión están embarcados
      const todosEmbarcados = pasajerosVuelo.every(p => p.estado_embarque === 'EMBARCADO' || p.estado_embarque === 'Embarcado' || p.estado_embarque === 'A Bordo');
      const esDespegado = vInfo.estado === 'DESPEGADO' || vInfo.estado === 'Despegado' || vInfo.estado === 'Cerrado' || todosEmbarcados;
      const esAbordando = vInfo.estado === 'Embarcando' || vInfo.estado === 'Última llamada';

      let badgeEstadoHtml = '';
      if (esDespegado) {
        badgeEstadoHtml = `<span class="status-pill-clean embarcando" style="background:rgba(16, 185, 129, 0.18); color:#34D399; border:1px solid rgba(16, 185, 129, 0.4); font-weight:800;">EMBARCADO / DESPEGADO</span>`;
      } else if (esAbordando) {
        badgeEstadoHtml = `<span class="status-pill-clean embarcando" style="font-weight:800;">ABORDANDO EN PUERTA</span>`;
      } else {
        badgeEstadoHtml = `<span class="status-pill-clean programado" style="font-weight:800;">EN SALA / PROGRAMADO</span>`;
      }

      // Filas de pasajeros exclusivas de este avión
      let filasPasajeros = '';
      pasajerosVuelo.forEach(p => {
        const isVip = p.categoria === 'VIP';
        const badgeClase = isVip ? 'llamada' : 'abierto';
        const embarcado = p.estado_embarque === 'EMBARCADO' || p.estado_embarque === 'Embarcado' || p.estado_embarque === 'A Bordo';
        const embarquePill = embarcado
          ? '<span class="status-pill-clean embarcando" style="font-size:0.75rem;">A Bordo</span>'
          : '<span class="status-pill-clean abierto" style="font-size:0.75rem;">Confirmado</span>';

        const sesionActual = window.AeroAuth && typeof window.AeroAuth.obtenerSesionActual === 'function' ? window.AeroAuth.obtenerSesionActual() : null;
        const rolAct = String(sesionActual?.rol || (document.body.classList.contains('role-mode-cliente') ? 'pasajero' : 'admin')).toLowerCase();
        const esOpAdmin = ['admin', 'integral', 'operador', 'todos'].includes(rolAct);
        const nomSes = String(sesionActual?.nombre || '').toLowerCase();
        const esPropio = nomSes && String(p.nombre_completo || '').toLowerCase().includes(nomSes.split(' ')[0]);
        const puedeCancelarFila = (esOpAdmin || esPropio) && !esDespegado && !embarcado && p.estado_embarque !== 'CANCELADO';

        filasPasajeros += `
          <tr data-reserva-row="${escAttr(vueloId)}::${escAttr(p.documento)}">
            <td>
              <strong>${esc(p.nombre_completo)}</strong>
              <div style="margin-top:0.2rem;">
                <span class="status-pill-clean ${badgeClase}" style="font-size:0.68rem; padding:0.12rem 0.45rem;">
                  ${esc(p.categoria)}
                </span>
              </div>
            </td>
            <td><strong style="color:var(--avianca-black); font-family:var(--font-mono);">${esc(p.documento)}</strong></td>
            <td>
              <span style="font-family:var(--font-mono); font-weight:900; font-size:1.05rem; color:var(--avianca-black);">
                ${esc(p.asiento)}
              </span>
            </td>
            <td>
              <span style="font-family:var(--font-mono); font-size:0.78rem; font-weight:700; color:#0284C7;">
                ${esc(p.referencia_pago)}
              </span>
            </td>
            <td><span style="font-size:0.8rem; color:var(--text-main);">${esc(p.metodo_pago)}</span></td>
            <td>
              <strong style="color:#059669; font-family:var(--font-mono); font-size:0.92rem;">
                $ ${Number(p.monto_cop).toLocaleString('es-CO')} COP
              </strong>
            </td>
            <td>${embarquePill}</td>
            <td>
              <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
                <button type="button" class="btn-secondary" data-action="reimprimir-ticket" data-doc="${escAttr(p.documento)}" data-codificador="${escAttr(vueloId)}" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:9999px; white-space:nowrap; display:inline-flex; align-items:center; gap:0.3rem;">
                  Reimprimir 🖨️
                </button>
                ${puedeCancelarFila ? `
                  <button type="button" class="btn-cancelar-reserva btn-avianca-red" data-action="cancelar-reserva-pasajero" data-vuelo="${escAttr(vueloId)}" data-documento="${escAttr(p.documento)}" data-nomb="${escAttr(p.nombre_completo)}" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:9999px; white-space:nowrap; display:inline-flex; align-items:center; gap:0.3rem;">
                    ✕ Cancelar Vuelo / Reserva
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      });

      const destIata = getDestinationIata(vInfo.destino || ruta);
      const thumbUrl = getDestinationPhotoUrl(destIata, false);

      html += `
        <details class="aircraft-manifest-card">
          <summary class="aircraft-manifest-summary">
            <div style="display:flex; align-items:center; gap:0.85rem;">
              <img src="${thumbUrl}" alt="${escAttr(destIata)}" class="destination-thumb-circle" loading="lazy" decoding="async" onerror="handleImageError(this)">
              <div>
                <div class="manifest-plane-title">
                  ${esc(aeronave)} — <span style="color:var(--avianca-red); font-weight:900;">Vuelo ${esc(vueloId)}</span>
                </div>
                <div class="manifest-route-subtitle">
                  📍 <strong>${esc(ruta)}</strong> | ${esc(horario)}
                </div>
              </div>
            </div>

            <div class="manifest-summary-metrics">
              <div class="manifest-metric-item">
                <span class="manifest-metric-label">Ocupación del Avión</span>
                <span class="manifest-metric-val" style="color:var(--avianca-black);">👥 ${ocupacionPax} Pasajeros</span>
              </div>
              <div class="manifest-metric-item">
                <span class="manifest-metric-label">Recaudo Total</span>
                <span class="manifest-metric-val" style="color:#059669;">💰 $ ${recaudoTotalCop.toLocaleString('es-CO')} COP</span>
              </div>
              ${badgeEstadoHtml}
              <svg class="manifest-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </summary>

          <div style="padding:1rem 1.25rem; border-top:1px solid rgba(255, 255, 255, 0.08); background:rgba(15, 23, 42, 0.7); overflow-x:auto;">
            <table class="avianca-styled-table">
              <thead>
                <tr>
                  <th>Pasajero</th>
                  <th>Doc. Identidad</th>
                  <th>Asiento</th>
                  <th>Referencia Pago</th>
                  <th>Método de Pago</th>
                  <th>Total ($ COP)</th>
                  <th>Estado</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                ${filasPasajeros}
              </tbody>
            </table>
          </div>
        </details>
      `;
    }

    // Identificar pasajeros en el directorio AVL que aún no tienen vuelo asignado
    const docsConPago = new Set(registros.map(r => String(r.documento)));
    const todosPasajeros = dataPasajeros.pasajeros || [];
    const sinVuelo = todosPasajeros.filter(p => !docsConPago.has(String(p.documento)) && (!p.vuelo_asignado || p.vuelo_asignado === 'Sin asignar'));

    if (sinVuelo.length > 0) {
      let filasSinVuelo = '';
      sinVuelo.forEach(p => {
        const isVip = p.categoria_viajero === 'VIP';
        filasSinVuelo += `
          <tr>
            <td><strong style="color:var(--avianca-black); font-family:var(--font-mono);">${esc(p.documento)}</strong></td>
            <td><strong>${esc(p.nombre)}</strong></td>
            <td>${esc(p.nacionalidad)}</td>
            <td>
              <span class="status-pill-clean ${isVip ? 'llamada' : 'abierto'}">
                ${esc(p.categoria_viajero)}
              </span>
            </td>
            <td><span class="status-pill-clean programado">Sin Vuelo Asignado</span></td>
            <td>
              <button type="button" class="btn-avianca-red" data-action="ir-comprar" data-doc="${escAttr(p.documento)}" data-nomb="${escAttr(p.nombre)}" style="padding:0.35rem 0.85rem; font-size:0.75rem; border-radius:9999px;">
                Asignar Asiento ➔
              </button>
            </td>
          </tr>
        `;
      });

      html += `
        <details class="aircraft-manifest-card" style="border-style:dashed; margin-top:0.75rem;">
          <summary class="aircraft-manifest-summary" style="background:rgba(30, 41, 59, 0.6);">
            <div style="display:flex; align-items:center; gap:0.85rem;">
              <span style="font-size:1.5rem;">📋</span>
              <div>
                <div class="manifest-plane-title" style="color:var(--text-main);">
                  Pasajeros Registrados sin Vuelo Asignado
                </div>
                <div class="manifest-route-subtitle">
                  Clientes inscritos en el Directorio AVL que aún no han adquirido butaca en ninguna aeronave
                </div>
              </div>
            </div>

            <div class="manifest-summary-metrics">
              <div class="manifest-metric-item">
                <span class="manifest-metric-label">Pasajeros Pendientes</span>
                <span class="manifest-metric-val" style="color:#D97706;">👥 ${sinVuelo.length}</span>
              </div>
              <span class="status-pill-clean programado">PENDIENTES DE VUELO</span>
              <svg class="manifest-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </summary>

          <div style="padding:1rem 1.25rem; border-top:1px solid rgba(255, 255, 255, 0.08); background:rgba(15, 23, 42, 0.7); overflow-x:auto;">
            <table class="avianca-styled-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Nombre Completo</th>
                  <th>Nacionalidad</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${filasSinVuelo}
              </tbody>
            </table>
          </div>
        </details>
      `;
    }

    contenedor.innerHTML = html;

  } catch (err) {
    console.error('Error cargando pasajeros recientes por avión', err);
  }
}

window.irAComprarParaPasajero = function(doc, nombre) {
  activarTab('tab-compra-avion');
  const inpDoc = document.getElementById('compra-pasajero-doc');
  const inpNom = document.getElementById('compra-pasajero-nombre');
  const selPas = document.getElementById('compra-pasajero-select');
  if (inpDoc) inpDoc.value = doc;
  if (inpNom) inpNom.value = nombre;
  if (selPas) selPas.value = doc;
  showToast(`Pasajero ${nombre} seleccionado para asignación de vuelo y butaca`);
};

// --- SELECTORES DE FLOTA ---
async function cargarSelectoresFlota() {
  try {
    const res = await fetch('/api/vuelos');
    const data = await res.json();
    const todos = [...(data.en_curso || []), ...(data.proximos || [])].filter(v =>
      v.estado !== 'DESPEGADO' && v.estado !== 'Despegado' && v.estado !== 'Cerrado' &&
      !v.cancelado && !String(v.estado || '').includes('CANCELADO') && !String(v.estado || '').includes('ARCHIVADO')
    );

    const selBuscar = document.getElementById('select-buscar-vuelo');
    const selSeatmap = document.getElementById('select-seatmap-vuelo');
    const selPuerta = document.getElementById('select-puerta-vuelo');

    let opts = '';
    todos.forEach(v => {
      const origCode = (v.origen || '').split('-')[0].trim();
      const destCode = (v.destino || '').split('-')[0].trim();
      opts += `<option value="${escAttr(v.codigo)}">${esc(v.codigo)} — ${esc(origCode)} ➔ ${esc(destCode)} (${esc(v.tipo_aeronave)}) | ${esc(v.hora_salida_12h)} | Sillas: ${v.ocupacion}/${v.capacidad_maxima}</option>`;
    });

    const haySeleccionValida = todos.some(v => v.codigo === state.selectedFlightCode);
    if (!haySeleccionValida && todos.length > 0) {
      state.selectedFlightCode = todos[0].codigo;
    }

    if (selBuscar) {
      selBuscar.innerHTML = opts;
      if (state.selectedFlightCode) selBuscar.value = state.selectedFlightCode;
      if (selBuscar.value) {
        consultarVueloHashMap(selBuscar.value);
      }
    }

    if (selSeatmap) {
      selSeatmap.innerHTML = opts;
      if (state.selectedFlightCode) selSeatmap.value = state.selectedFlightCode;
    }

    if (selPuerta) {
      selPuerta.innerHTML = opts;
      if (state.selectedFlightCode) selPuerta.value = state.selectedFlightCode;
      verificarEstadoBotonEmbarque(selPuerta.value);
    }

    if (state.selectedFlightCode) {
      cargarMapaAvion(state.selectedFlightCode);
      actualizarSelectorRapidoPase(state.selectedFlightCode);
    }
  } catch (err) {
    console.error('Error cargando selectores', err);
  }
}

async function verificarEstadoBotonEmbarque(codigo) {
  const btn = document.getElementById('btn-iniciar-embarque');
  const btnIndiv = document.getElementById('btn-abordar-individual');
  if (!btn) return;
  if (!codigo) {
    btn.disabled = true;
    if (btnIndiv) btnIndiv.disabled = true;
    btn.style.background = '#059669';
    btn.style.borderColor = '#047857';
    btn.style.color = '#FFFFFF';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = '✈️ VUELO DESPACHADO — PUERTA CERRADA';
    return;
  }

  try {
    const res = await fetch(`/api/avion/${codigo}/mapa`);
    if (!res.ok) {
      btn.disabled = true;
      if (btnIndiv) btnIndiv.disabled = true;
      btn.style.background = '#059669';
      btn.style.borderColor = '#047857';
      btn.style.color = '#FFFFFF';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = '✈️ VUELO DESPACHADO — PUERTA CERRADA';
      return;
    }

    const data = await res.json();
    const v = data.vuelo || {};

    if (v.codigo) {
      renderDestinationHero('destination-hero-m4', v);
    }

    if (v.estado === 'DESPEGADO' || v.estado === 'Despegado' || v.estado === 'Cerrado') {
      btn.disabled = true;
      if (btnIndiv) btnIndiv.disabled = true;
      btn.style.background = '#059669';
      btn.style.borderColor = '#047857';
      btn.style.color = '#FFFFFF';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = '✈️ VUELO DESPACHADO — PUERTA CERRADA';
    } else {
      btn.disabled = false;
      if (btnIndiv) btnIndiv.disabled = false;
      btn.style.background = 'var(--avianca-red)';
      btn.style.borderColor = 'var(--avianca-red)';
      btn.style.color = '#FFFFFF';
      btn.style.cursor = 'pointer';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> <span>Auto-Embarque Completo</span>`;
    }

    // Auto-cargar tiquete del primer pasajero confirmado si el contenedor está vacío
    const bpContainer = document.getElementById('boarding-pass-container');
    if (bpContainer && (!document.getElementById('card-boarding-pass') || bpContainer.innerText.includes('SELECCIONE UN VUELO'))) {
      cargarPrimerPaseDeVuelo(codigo);
    }
  } catch (err) {
    //
  }
}

// Cargar automáticamente un tiquete de muestra/real para el vuelo seleccionado
async function cargarPrimerPaseDeVuelo(codigo) {
  try {
    const res = await fetch('/api/pasajeros-recientes');
    const data = await res.json();
    const regs = data.registros || [];
    const p = regs.find(r => r.vuelo_id === codigo) || regs[0];
    if (p) {
      const resV = await fetch(`/api/avion/${codigo}/mapa`);
      const dataV = await resV.json();
      const v = dataV.vuelo || {};
      const esVip = (p.categoria === 'VIP' || (p.asiento && parseInt(p.asiento) <= 3));
      const monto = p.monto_cop || (esVip ? 3850000 : 1820000);
      const montoStr = `$ ${Math.round(monto).toLocaleString('es-CO')} COP`;

      const bp = {
        vuelo_codigo: codigo,
        origen: v.origen || 'BOG - Bogotá El Dorado',
        destino: v.destino || 'MAD - Madrid Barajas',
        tipo_aeronave: v.tipo_aeronave || 'Airbus A319 Corporate',
        duracion: v.duracion_estimada || '09h 45m',
        distancia_km: v.distancia_km || 8034,
        puerta: v.puerta || 'B-01',
        hora_salida_12h: v.hora_salida_12h || '11:00 AM',
        hora_llegada_12h: v.hora_llegada_12h || '05:45 AM',
        fecha_salida: v.fecha_salida || fechaHoyStr(),
        pasajero_doc: p.documento,
        pasajero_nombre: p.nombre_completo,
        categoria: p.categoria,
        clase_cabina: esVip ? 'VIP' : 'Economy',
        tarifa_formateada: montoStr,
        asiento: p.asiento || '1A',
        secuencia_fifo: 1,
        hora_abordaje_12h: p.fecha_hora_registro ? (p.fecha_hora_registro.split('•')[1] || p.fecha_hora_registro).trim() : '10:30 AM',
        referencia: p.referencia_pago || `#AF-${codigo}-${p.documento.slice(-4)}`,
        metodo_pago: p.metodo_pago || 'Tarjeta Débito/Crédito Visa (•••• 4242)',
        desglose: {
          tarifa_base: `$ ${Math.round(monto * 0.77).toLocaleString('es-CO')} COP`,
          tarifa_admin: '$ 35.000 COP',
          iva_19: `$ ${Math.round(monto * 0.15).toLocaleString('es-CO')} COP`,
          tasa_aeroportuaria: '$ 42.000 COP',
          total_a_pagar: montoStr
        }
      };
      renderBoardingPassAvianca(bp, false);
    }
  } catch (e) {
    console.error('Error cargando primer pase de vuelo', e);
  }
}

// --- MÓDULO 3: DIBUJO VECTORIAL EXACTO AL DISEÑO ADJUNTO ---
async function cargarMapaAvion(codigo) {
  try {
    const res = await fetch(`/api/avion/${codigo}/mapa`);
    const data = await res.json();
    if (!res.ok) return;

    const v = data.vuelo;
    renderDestinationHero('destination-hero-m3', v);
    document.getElementById('spec-plane').innerText = v.tipo_aeronave;
    document.getElementById('spec-route').innerText = `${v.origen.split('-')[0].trim()} ✈ ${v.destino.split('-')[0].trim()}`;
    document.getElementById('spec-time').innerText = v.hora_salida_12h;
    document.getElementById('seatmap-flight-badge').innerText = `${data.ocupacion} / ${data.capacidad_maxima} Asientos (${data.lleno ? 'VUELO LLENO' : 'DISPONIBLE'})`;

    const btnCompra = document.getElementById('btn-confirmar-compra');
    if (data.lleno) {
      btnCompra.innerText = 'Vuelo Completo — Unirse a Lista de Espera';
      btnCompra.style.background = '#D97706';
    } else {
      btnCompra.innerText = 'Confirmar Pago y Emitir Tiquete';
      btnCompra.style.background = 'var(--avianca-red)';
    }

    // Poblar selector inteligente de asientos
    const selAsiento = document.getElementById('compra-asiento-select');
    if (selAsiento) {
      let sOpts = '<option value="">-- Seleccionar Asiento en Cabina --</option>';
      data.configuracion_aeronave.asientos.forEach(s => {
        const est = s.ocupado 
          ? '[OCUPADO]' 
          : `[LIBRE - $ ${s.tarifa_base_cop.toLocaleString('es-CO')} COP]`;
        sOpts += `<option value="${s.id}" ${s.ocupado ? 'disabled style="color:#94A3B8;"' : ''}>${s.id} — ${s.clase} (${s.tipo_asiento}) | ${est}</option>`;
      });
      selAsiento.innerHTML = sOpts;
      if (state.selectedSeat) {
        selAsiento.value = state.selectedSeat.id;
      } else {
        // Preseleccionar la primera butaca libre para no dejar el checkout en $ 0 COP
        const primeraLibre = data.configuracion_aeronave.asientos.find(s => !s.ocupado);
        if (primeraLibre) {
          state.selectedSeat = primeraLibre;
          selAsiento.value = primeraLibre.id;
          const elId = document.getElementById('selected-seat-id');
          const elType = document.getElementById('selected-seat-type');
          if (elId) elId.innerText = primeraLibre.id;
          if (elType) elType.innerText = `${primeraLibre.tipo_asiento} (${primeraLibre.clase})`;
          
          const badge = document.getElementById('selected-seat-badge');
          if (badge) {
            badge.className = primeraLibre.clase === 'VIP' ? 'status-pill-clean llamada' : 'status-pill-clean abierto';
            badge.innerText = primeraLibre.clase === 'VIP' ? 'VIP FIRST CLASS' : 'CLASE ECONOMY';
          }

          const desglose = primeraLibre.desglose_financiero;
          if (desglose) {
            const elBase = document.getElementById('chk-tarifa-base');
            const elAdmin = document.getElementById('chk-tarifa-admin');
            const elIva = document.getElementById('chk-iva');
            const elTasa = document.getElementById('chk-tasa');
            const elTotal = document.getElementById('chk-total-cop');
            if (elBase) elBase.innerText = desglose.tarifa_base;
            if (elAdmin) elAdmin.innerText = desglose.tarifa_admin;
            if (elIva) elIva.innerText = desglose.iva_19;
            if (elTasa) elTasa.innerText = desglose.tasa_aeroportuaria;
            if (elTotal) elTotal.innerText = desglose.total_a_pagar;
          }
        }
      }
    }

    // Renderizar Fuselaje Vectorial Exacto a la Imagen Adjunta
    renderizarFuselajeExacto(data.configuracion_aeronave);

    // Renderizar Cadena de Nodos
    renderizarCadenaNodos(data.manifiesto_cadena);

    // Renderizar Manifiesto y Standby
    renderizarTablasManifiesto(codigo, data);

  } catch (err) {
    console.error('Error cargando mapa', err);
  }
}

function renderizarFuselajeExacto(config) {
  const svg = document.getElementById('aircraft-svg-fuselage');
  if (!svg) return;

  // Filas únicas ordenadas y sets de cabina
  const filasUnicas = [...new Set(config.asientos.map(s => s.fila))].sort((a,b) => a - b);
  const numFilas = filasUnicas.length;
  const vipRows = filasUnicas.filter(f => config.asientos.some(s => s.fila === f && s.clase === 'VIP'));
  const ecoRows = filasUnicas.filter(f => config.asientos.some(s => s.fila === f && s.clase !== 'VIP'));

  // Mapeo horizontal adaptativo de coordenadas X
  const rowXMap = {};
  let curX = 265;
  filasUnicas.forEach(f => {
    rowXMap[f] = curX;
    const isVIP = config.asientos.some(s => s.fila === f && s.clase === 'VIP');
    curX += isVIP ? 72 : 56;
  });

  const firstRowX = rowXMap[filasUnicas[0]] || 265;
  const lastRowX = rowXMap[filasUnicas[filasUnicas.length - 1]] || 265;
  const cabinEndX = lastRowX + 38;

  // Zonas de servicio y cono de cola adaptativo
  const rearWcX = cabinEndX + 16;
  const taperStartX = rearWcX + 55;
  const tailConeLength = Math.max(120, Math.min(220, numFilas * 20));
  const tailConeX = taperStartX + tailConeLength;
  const totalSvgWidth = tailConeX + 70;
  const totalSvgHeight = 500;

  svg.setAttribute('viewBox', `0 0 ${totalSvgWidth} ${totalSvgHeight}`);
  svg.style.minWidth = `${Math.min(totalSvgWidth, 1150)}px`;

  // Actualizar subtítulos en tarjeta
  const subTitle = document.getElementById('fuselage-aircraft-subtitle');
  if (subTitle) {
    subTitle.innerText = `(${config.tipo || 'Aeronave Comercial'}) — ${filasUnicas.length} Filas Simétricas | ${config.capacidad} Butacas en Doble Cabina`;
  }
  const badgeInt = document.getElementById('seatmap-flight-badge-internal');
  const badgeExt = document.getElementById('seatmap-flight-badge');
  if (badgeInt && badgeExt) {
    badgeInt.innerText = badgeExt.innerText;
  }

  // --- ANCLAJE INTELIGENTE DE ALAS Y TURBINAS (CENTRADO DINÁMICAMENTE) ---
  let wingCenterX;
  if (ecoRows.length > 0) {
    wingCenterX = (rowXMap[ecoRows[0]] + rowXMap[ecoRows[ecoRows.length - 1]]) / 2;
  } else {
    wingCenterX = (firstRowX + lastRowX) / 2;
  }

  const wingRootWidth = Math.max(120, Math.min(240, numFilas * 26));
  const wingStart = wingCenterX - (wingRootWidth * 0.44);
  const wingEnd = wingCenterX + (wingRootWidth * 0.56);
  const wingTipX = wingCenterX + (wingRootWidth * 0.22);
  const wingTipWidth = Math.max(26, wingRootWidth * 0.16);

  const turbineX = wingCenterX - 22;
  const turbineW = Math.max(68, Math.min(84, wingRootWidth * 0.36));
  const turbineH = Math.max(34, Math.min(42, turbineW * 0.48));
  const turbinePylonX = turbineX + (turbineW * 0.48);

  // --- CONSTRUCCIÓN ESTRUCTURAL DE LA AERONAVE ---
  let svgElements = `
    <!-- ALAS EXTERIORES AERODINÁMICAS (ANCLADAS A LA CABINA) -->
    <!-- Ala Superior -->
    <path d="M ${wingStart} 160 L ${wingTipX} 20 L ${wingTipX + wingTipWidth} 42 L ${wingEnd} 160 Z" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="2"/>
    <line x1="${wingStart + (wingRootWidth * 0.35)}" y1="105" x2="${wingTipX + (wingTipWidth * 0.5)}" y2="40" stroke="#CBD5E1" stroke-width="1.5"/>

    <!-- Turbina Superior -->
    <g>
      <rect x="${turbineX}" y="${86 - (turbineH / 2)}" width="${turbineW}" height="${turbineH}" rx="12" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2"/>
      <ellipse cx="${turbineX}" cy="86" rx="5" ry="${turbineH / 2}" fill="#0B192C"/>
      <ellipse cx="${turbineX + 3}" cy="86" rx="2" ry="${turbineH * 0.35}" fill="#CBD5E1"/>
      <path d="M ${turbineX + turbineW} ${86 - (turbineH * 0.3)} L ${turbineX + turbineW + 15} 86 L ${turbineX + turbineW} ${86 + (turbineH * 0.3)} Z" fill="#64748B"/>
      <line x1="${turbinePylonX}" y1="${86 + (turbineH / 2)}" x2="${turbinePylonX}" y2="160" stroke="#64748B" stroke-width="4.5"/>
    </g>

    <!-- Ala Inferior -->
    <path d="M ${wingStart} 340 L ${wingTipX} 480 L ${wingTipX + wingTipWidth} 458 L ${wingEnd} 340 Z" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="2"/>
    <line x1="${wingStart + (wingRootWidth * 0.35)}" y1="395" x2="${wingTipX + (wingTipWidth * 0.5)}" y2="460" stroke="#CBD5E1" stroke-width="1.5"/>

    <!-- Turbina Inferior -->
    <g>
      <rect x="${turbineX}" y="${414 - (turbineH / 2)}" width="${turbineW}" height="${turbineH}" rx="12" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2"/>
      <ellipse cx="${turbineX}" cy="414" rx="5" ry="${turbineH / 2}" fill="#0B192C"/>
      <ellipse cx="${turbineX + 3}" cy="414" rx="2" ry="${turbineH * 0.35}" fill="#CBD5E1"/>
      <path d="M ${turbineX + turbineW} ${414 - (turbineH * 0.3)} L ${turbineX + turbineW + 15} 414 L ${turbineX + turbineW} ${414 + (turbineH * 0.3)} Z" fill="#64748B"/>
      <line x1="${turbinePylonX}" y1="${414 - (turbineH / 2)}" x2="${turbinePylonX}" y2="340" stroke="#64748B" stroke-width="4.5"/>
    </g>

    <!-- ESTABILIZADORES TRASEROS -->
    <path d="M ${taperStartX + 35} 210 L ${tailConeX + 15} 85 L ${tailConeX + 45} 110 L ${taperStartX + (tailConeLength * 0.85)} 242 Z" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="2"/>
    <path d="M ${taperStartX + 35} 290 L ${tailConeX + 15} 415 L ${tailConeX + 45} 390 L ${taperStartX + (tailConeLength * 0.85)} 258 Z" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="2"/>

    <!-- FUSELAJE PRINCIPAL -->
    <path d="
      M 45 250
      C 85 210, 145 160, 220 160
      L ${taperStartX} 160
      C ${taperStartX + 60} 160, ${taperStartX + (tailConeLength * 0.75)} 210, ${tailConeX} 250
      C ${taperStartX + (tailConeLength * 0.75)} 290, ${taperStartX + 60} 340, ${taperStartX} 340
      L 220 340
      C 145 340, 85 290, 45 250 Z" 
      fill="#FFFFFF" stroke="#CBD5E1" stroke-width="3" />

    <!-- Aleta Dorsal Vertical -->
    <path d="M ${taperStartX + 15} 248 L ${tailConeX + 12} 243 L ${tailConeX + 12} 257 L ${taperStartX + 15} 252 Z" fill="#94A3B8"/>

    <!-- CABINA DE PILOTOS / COCKPIT -->
    <path d="M 85 242 Q 105 230 125 227 L 128 240 Q 108 243 92 250 Z" fill="#0B192C"/>
    <path d="M 85 258 Q 105 270 125 273 L 128 260 Q 108 257 92 250 Z" fill="#0B192C"/>
    <path d="M 90 248 L 128 243 L 128 257 L 90 252 Z" fill="#0B192C"/>

    <!-- SECCIÓN DELANTERA: GALLEY & WC -->
    <rect x="165" y="168" width="44" height="62" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="187" y="204" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="1">GALLEY</text>

    <rect x="165" y="270" width="44" height="62" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="187" y="306" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" fill="#64748B" text-anchor="middle">WC</text>

    <!-- SECCIÓN TRASERA: BAÑOS WC POSTERIORES -->
    <rect x="${rearWcX}" y="168" width="44" height="62" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="${rearWcX + 22}" y="204" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" fill="#64748B" text-anchor="middle">WC</text>

    <rect x="${rearWcX}" y="270" width="44" height="62" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="${rearWcX + 22}" y="306" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" fill="#64748B" text-anchor="middle">WC</text>

    <!-- FLECHAS DE SALIDA DE EMERGENCIA DELANTERAS Y TRASERAS -->
    <text x="187" y="144" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="800" fill="#94A3B8" text-anchor="middle">◄ SALIDA / EXIT ►</text>
    <text x="187" y="358" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="800" fill="#94A3B8" text-anchor="middle">◄ SALIDA / EXIT ►</text>
    <text x="${rearWcX + 22}" y="144" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="800" fill="#94A3B8" text-anchor="middle">◄ SALIDA / EXIT ►</text>
    <text x="${rearWcX + 22}" y="358" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="800" fill="#94A3B8" text-anchor="middle">◄ SALIDA / EXIT ►</text>

    <!-- PASILLO CENTRAL HORIZONTAL -->
    <line x1="225" y1="236" x2="${cabinEndX}" y2="236" stroke="#E2E8F0" stroke-dasharray="3 3" stroke-width="1.2"/>
    <line x1="225" y1="264" x2="${cabinEndX}" y2="264" stroke="#E2E8F0" stroke-dasharray="3 3" stroke-width="1.2"/>
  `;

  // --- CABIN BRACKETS Y ETIQUETAS DE SECCIÓN (CON CERO SOLAPAMIENTOS) ---
  let vipCenterX = firstRowX;
  if (vipRows.length > 0) {
    const vipStartX = firstRowX - 25;
    const vipEndX = rowXMap[vipRows[vipRows.length - 1]] + 28;
    vipCenterX = (vipStartX + vipEndX) / 2;

    svgElements += `
      <!-- Cabina Delantera VIP -->
      <path d="M ${vipStartX} 130 L ${vipStartX} 122 L ${vipEndX} 122 L ${vipEndX} 130" stroke="#D97706" fill="none" stroke-width="1.8"/>
      <text x="${vipCenterX}" y="112" font-family="'Plus Jakarta Sans', sans-serif" font-size="10.5" font-weight="800" fill="#D97706" text-anchor="middle" letter-spacing="0.5">VIP CLASE INSIGNIA</text>
    `;
  }

  if (ecoRows.length > 0) {
    const ecoStartX = rowXMap[ecoRows[0]] - 25;
    const ecoEndX = rowXMap[ecoRows[ecoRows.length - 1]] + 28;
    const ecoCenterX = (ecoStartX + ecoEndX) / 2;

    // Si la distancia entre centros de cabina es menor a 170px, escalonar verticalmente para evitar colisiones
    const distance = ecoCenterX - vipCenterX;
    const ecoLabelY = (vipRows.length > 0 && distance < 170) ? 96 : 112;
    const ecoBracketY = (vipRows.length > 0 && distance < 170) ? 106 : 122;

    svgElements += `
      <!-- Cabina Trasera Economy -->
      <path d="M ${ecoStartX} ${ecoBracketY + 8} L ${ecoStartX} ${ecoBracketY} L ${ecoEndX} ${ecoBracketY} L ${ecoEndX} ${ecoBracketY + 8}" stroke="#0D9488" fill="none" stroke-width="1.8"/>
      <text x="${ecoCenterX}" y="${ecoLabelY}" font-family="'Plus Jakarta Sans', sans-serif" font-size="10.5" font-weight="800" fill="#0D9488" text-anchor="middle" letter-spacing="0.5">CLASE ECONOMY</text>
    `;
  }

  // Números de fila en el pasillo central
  filasUnicas.forEach(fNum => {
    const posX = rowXMap[fNum];
    svgElements += `
      <text x="${posX}" y="254" font-family="'JetBrains Mono', monospace" font-size="11.5" font-weight="800" fill="#94A3B8" text-anchor="middle">${fNum}</text>
    `;
  });

  // --- RENDERIZADO SIMÉTRICO ESTRICTO DE BUTACAS ---
  config.asientos.forEach((seat, idx) => {
    const rowX = rowXMap[seat.fila] || 300;
    let posX = 0;
    let posY = 0;
    let w = 38;
    let h = 28;

    if (seat.clase === 'VIP') {
      w = 46;
      h = 44;
      posX = rowX - 23;
      posY = seat.col === 'B' ? 178 : 278;
    } else {
      const has4cols = config.asientos.some(s => s.fila === seat.fila && s.col === 'D');
      if (has4cols) {
        w = 38;
        h = 28;
        posX = rowX - 19;
        if (seat.col === 'D') posY = 168;
        else if (seat.col === 'C') posY = 202;
        else if (seat.col === 'B') posY = 270;
        else posY = 304; // Columna A
      } else {
        w = 42;
        h = 38;
        posX = rowX - 21;
        posY = seat.col === 'B' ? 186 : 276;
      }
    }

    let shapeClass = '';
    if (seat.ocupado) {
      shapeClass = 'seat-rect-occupied';
    } else if (state.selectedSeat && state.selectedSeat.id === seat.id) {
      shapeClass = 'seat-rect-selected';
    } else if (seat.clase === 'VIP') {
      shapeClass = 'seat-rect-vip';
    } else {
      shapeClass = 'seat-rect-economy';
    }

    const tooltip = seat.ocupado 
      ? `Asiento ${seat.id} - ${seat.clase} (Ocupado)` 
      : `Asiento ${seat.id} - ${seat.clase} (${seat.tarifa_base_formato_cop})`;

    const asientoEntra = AeroCore.respetaMovimientoReducido()
      ? ''
      : ` seat-appear" style="--seat-delay:${Math.min(idx * 14, 900)}ms; transform-box:fill-box; transform-origin:center`;

    const paxNombre = seat.pasajero_nombre || seat.ocupante_nombre || '';
    const seatPrice = seat.tarifa_base_formato_cop || '$ 0 COP';

    svgElements += `
      <g class="seat-g-clickable${asientoEntra}" 
         onclick="onSeleccionarSilla('${seat.id}', '${seat.clase}', ${seat.ocupado})"
         onmouseenter="mostrarFloatingSeatTooltip(event, '${seat.id}', '${seat.clase}', ${seat.ocupado}, '${escAttr(seatPrice)}', '${escAttr(paxNombre)}')"
         onmousemove="moverFloatingSeatTooltip(event)"
         onmouseleave="ocultarFloatingSeatTooltip()">
        <rect class="${shapeClass}" x="${posX}" y="${posY}" width="${w}" height="${h}"/>
    `;

    // Detalles estéticos internos por butaca
    if (seat.clase === 'VIP') {
      svgElements += `
        <rect x="${posX + 5}" y="${posY + 5}" width="${w - 10}" height="${h - 10}" rx="4" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.2"/>
        <rect x="${posX + 10}" y="${posY + 3}" width="${w - 20}" height="4" rx="2" fill="rgba(255,255,255,0.6)"/>
      `;
    } else {
      svgElements += `
        <rect x="${posX + 4}" y="${posY + 3}" width="${w - 8}" height="3" rx="1.5" fill="rgba(255,255,255,0.3)"/>
      `;
    }

    const labelText = seat.ocupado ? '✕' : seat.id;
    const textClass = seat.ocupado ? 'seat-text-label seat-text-occupied' : 'seat-text-label';

    svgElements += `
        <text class="${textClass}" x="${posX + (w / 2)}" y="${posY + (h / 2) + 3.5}" text-anchor="middle">
          ${labelText}
        </text>
        <title>${tooltip}</title>
      </g>
    `;
  });

  svg.innerHTML = svgElements;
}

// Selección de Asiento y Checkout Avianca
window.onSeleccionarSilla = async function(seatId, clase, ocupado) {
  const cod = document.getElementById('select-seatmap-vuelo')?.value || state.selectedFlightCode;

  if (ocupado) {
    showToast(`El asiento ${seatId} (${clase}) ya se encuentra reservado. Por favor seleccione una butaca disponible en cabina.`, true);
    return;
  }

  try {
    const res = await fetch(`/api/avion/${encodeURIComponent(cod)}/mapa`);
    if (!res.ok) {
      showToast('No se pudo obtener la configuración del asiento en la aeronave', true);
      return;
    }
    const data = await res.json();
    const seatObj = data.configuracion_aeronave.asientos.find(x => x.id === seatId);
    if (!seatObj) return;

    state.selectedSeat = seatObj;

    // Llenar panel de checkout en COP
    const elId = document.getElementById('selected-seat-id');
    const elType = document.getElementById('selected-seat-type');
    if (elId) elId.innerText = seatObj.id;
    if (elType) elType.innerText = `${seatObj.tipo_asiento} (${seatObj.clase})`;
    
    const badge = document.getElementById('selected-seat-badge');
    if (badge) {
      badge.className = seatObj.clase === 'VIP' ? 'status-pill-clean llamada' : 'status-pill-clean abierto';
      badge.innerText = seatObj.clase === 'VIP' ? 'VIP FIRST CLASS' : 'CLASE ECONOMY';
    }

    const desglose = seatObj.desglose_financiero;
    if (desglose) {
      const elBase = document.getElementById('chk-tarifa-base');
      const elAdmin = document.getElementById('chk-tarifa-admin');
      const elIva = document.getElementById('chk-iva');
      const elTasa = document.getElementById('chk-tasa');
      const elTotal = document.getElementById('chk-total-cop');
      if (elBase) elBase.innerText = desglose.tarifa_base;
      if (elAdmin) elAdmin.innerText = desglose.tarifa_admin;
      if (elIva) elIva.innerText = desglose.iva_19;
      if (elTasa) elTasa.innerText = desglose.tasa_aeroportuaria;
      if (elTotal) elTotal.innerText = desglose.total_a_pagar;
    }

    const selAsiento = document.getElementById('compra-asiento-select');
    if (selAsiento && selAsiento.value !== seatId) {
      selAsiento.value = seatId;
    }

    renderizarFuselajeExacto(data.configuracion_aeronave);
  } catch (err) {
    console.error('Error al seleccionar silla:', err);
    showToast('Error de comunicación con el mapa de cabina', true);
  }
};

function renderizarCadenaNodos(cadenaStr) {
  const track = document.getElementById('linkedlist-chain-track');
  if (!track) return;

  const partes = cadenaStr.split(' -> ');
  let html = '';
  partes.forEach((p, idx) => {
    let cleanText = p;
    if (cleanText.includes('HEAD')) {
      cleanText = 'INICIO MANIFIESTO';
    } else if (cleanText.includes('NULL')) {
      cleanText = 'FIN DE CABINA';
    }
    const isHead = p.includes('HEAD');
    const isNull = p.includes('NULL');
    const bg = isHead ? 'rgba(245, 158, 11, 0.15)' : (isNull ? 'rgba(100, 116, 139, 0.15)' : 'rgba(30, 41, 59, 0.85)');
    const color = isHead ? '#FCD34D' : (isNull ? '#94A3B8' : '#F8FAFC');
    const border = isHead ? 'rgba(245, 158, 11, 0.4)' : (isNull ? 'rgba(100, 116, 139, 0.4)' : '#334155');

    html += `
      <div style="background:${bg}; border:1.5px solid ${border}; padding:0.4rem 0.85rem; border-radius:var(--radius-sm); color:${color}; font-weight:700;">
        ${esc(cleanText)}
      </div>
      ${idx < partes.length - 1 ? '<span style="color:var(--avianca-red); font-weight:800; font-size:1rem;">➔</span>' : ''}
    `;
  });
  track.innerHTML = html;
}

function renderizarTablasManifiesto(codigoVuelo, data) {
  const tbodyMan = document.getElementById('tabla-manifiesto-body');
  if (tbodyMan) {
    const ocupados = data.configuracion_aeronave.asientos.filter(s => s.ocupado);
    if (ocupados.length === 0) {
      tbodyMan.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:1.25rem; font-weight:600;">No hay asignaciones confirmadas en este vuelo</td></tr>`;
    } else {
      let html = '';
      ocupados.forEach(s => {
        const p = s.pasajero;
        html += `
          <tr>
            <td><strong style="color:var(--avianca-red); font-size:1.05rem;">${esc(s.id)}</strong></td>
            <td>
              <span class="status-pill-clean ${s.clase === 'VIP' ? 'llamada' : 'abierto'}">
                ${esc(s.clase)}
              </span>
            </td>
            <td><strong>${esc(p.documento)}</strong></td>
            <td>${esc(p.nombre)}</td>
            <td>${esc(p.hora_checkin)}</td>
            <td>
              <button class="btn-avianca-red" data-action="cancelar-tiquete" data-codificador="${escAttr(codigoVuelo)}" data-doc="${escAttr(p.documento)}" style="padding:0.25rem 0.65rem; font-size:0.75rem;">
                Liberar
              </button>
            </td>
          </tr>
        `;
      });
      tbodyMan.innerHTML = html;
    }
  }

  const tbodySt = document.getElementById('tabla-standby-body');
  if (tbodySt) {
    if (data.standby_cola.length === 0) {
      tbodySt.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1.25rem; font-weight:600;">No hay pasajeros en lista de espera en este momento</td></tr>`;
    } else {
      let html = '';
      data.standby_cola.forEach(st => {
        html += `
          <tr>
            <td><strong style="color:#D97706;">#${st.posicion}</strong></td>
            <td>${esc(st.pasajero_doc)}</td>
            <td>${esc(st.pasajero_nombre)}</td>
            <td>${esc(st.hora_ingreso)}</td>
          </tr>
        `;
      });
      tbodySt.innerHTML = html;
    }
  }
}

window.cancelarTiquete = async function(codigoVuelo, documento) {
  if (state.isCancellingTicket) return;
  state.isCancellingTicket = true;
  try {
    const res = await fetch('/api/checkin/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_vuelo: codigoVuelo, documento: documento })
    });
    const data = await res.json();
    if (res.ok) {
      // Remover fila del DOM inmediatamente
      const docClean = String(documento || '').replace(/^[A-Za-z]+-/, '').trim();
      document.querySelectorAll(`[data-reserva-row="${codigoVuelo}::${docClean}"]`).forEach(el => el.remove());

      showToast(data.mensaje);
      if (data.ascenso_standby) {
        showToast(data.ascenso_standby.mensaje);
      }
      cargarMapaAvion(codigoVuelo);
      cargarVuelos();
      if (typeof cargarPasajeros === 'function') cargarPasajeros();
      if (typeof cargarPasajerosRecientes === 'function') cargarPasajerosRecientes();
      if (typeof syncAllViews === 'function') syncAllViews();
    } else {
      showToast(data.error || 'Error al cancelar', true);
    }
  } catch (err) {
    showToast('Error de comunicación', true);
  } finally {
    state.isCancellingTicket = false;
  }
};

window.cancelarReservaPasajeroConfirmada = async function(codigoVuelo, documento, nombre) {
  if (!codigoVuelo || !documento) return;
  const paxDesc = nombre ? `"${nombre}" (Doc: ${documento})` : `documento ${documento}`;
  const confirmar = typeof mostrarTacticalConfirmModal === 'function'
    ? await mostrarTacticalConfirmModal({
        titulo: `Cancelar Reserva en ${codigoVuelo}`,
        mensaje: `¿Desea cancelar el tiquete del pasajero ${paxDesc} en el vuelo ${codigoVuelo}?\nEsta acción liberará su asiento en cabina y, si hay lista de espera (Standby FIFO), promoverá al siguiente pasajero.`,
        textoConfirmar: '✕ Sí, Cancelar Reserva',
        esPeligroso: true
      })
    : window.confirm(`¿Cancelar reserva del pasajero ${paxDesc} en el vuelo ${codigoVuelo}?`);

  if (!confirmar) return;
  await window.cancelarTiquete(codigoVuelo, documento);
};

// --- MÓDULO 4: SIMULADOR DE EMBARQUE & BOARDING PASS ---
async function ejecutarSimulacionEmbarque(codigo) {
  if (state.isBoardingSimulationRunning) return;

  try {
    const res = await fetch(`/api/embarque/${codigo}/iniciar`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'No se pudo iniciar embarque', true);
      return;
    }

    showToast(data.mensaje);
    state.isBoardingSimulationRunning = true;
    const btn = document.getElementById('btn-iniciar-embarque');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'ABORDANDO PASAJEROS EN PUERTA...';
    }

    // Accesibilidad: modo instantáneo si el usuario pide movimiento reducido
    const pasoMs = AeroCore.respetaMovimientoReducido() ? 300 : 1300;
    state.boardingIntervalId = setInterval(async () => {
      const stepRes = await fetch(`/api/embarque/${codigo}/abordar-siguiente`, { method: 'POST' });
      const stepData = await stepRes.json();

      if (stepData.boarding_pass) {
        renderBoardingPassAvianca(stepData.boarding_pass);
        actualizarProgresoEmbarque(stepData.progreso);
        reproducirAudioAbordaje('scan_success');
      }

      if (stepData.completado) {
        if (state.boardingIntervalId) {
          clearInterval(state.boardingIntervalId);
          state.boardingIntervalId = null;
        }
        state.isBoardingSimulationRunning = false;

        // 1. Bloquea inmediatamente el botón de embarque
        if (btn) {
          btn.disabled = true;
          btn.style.background = '#059669';
          btn.style.borderColor = '#047857';
          btn.style.color = '#FFFFFF';
          btn.style.cursor = 'not-allowed';
          btn.innerHTML = '✈️ VUELO DESPACHADO — PUERTA CERRADA';
        }

        const btnIndiv = document.getElementById('btn-abordar-individual');
        if (btnIndiv) btnIndiv.disabled = true;

        reproducirAudioAbordaje('flight_complete');
        showToast(stepData.mensaje || `¡Vuelo ${codigo} despachado al 100%! La puerta se ha cerrado y el avión ha despegado.`);

        // Actualizar datos del backend en tiempo real
        await cargarVuelos();
        await cargarPasajeros();
        await cargarPasajerosRecientes();

        // 3. Retira automáticamente ese vuelo de TODOS los menús desplegables (<select>)
        // y selecciona automáticamente el siguiente vuelo disponible tras 2 segundos
        setTimeout(async () => {
          await cargarSelectoresFlota();

          const selPuerta = document.getElementById('select-puerta-vuelo');
          if (selPuerta && selPuerta.options.length > 0) {
            const nextCode = selPuerta.options[0].value;
            state.selectedFlightCode = nextCode;
            selPuerta.value = nextCode;

            const selBuscar = document.getElementById('select-buscar-vuelo');
            if (selBuscar) selBuscar.value = nextCode;
            const selSeatmap = document.getElementById('select-seatmap-vuelo');
            if (selSeatmap) selSeatmap.value = nextCode;

            verificarEstadoBotonEmbarque(nextCode);
            cargarMapaAvion(nextCode);
            showToast(`Siguiente vuelo activo seleccionado en rampa: ${nextCode}`);
          } else {
            if (btn) {
              btn.disabled = true;
              btn.style.background = '#059669';
              btn.style.borderColor = '#047857';
              btn.style.color = '#FFFFFF';
              btn.style.cursor = 'not-allowed';
              btn.innerHTML = '✈️ VUELO DESPACHADO — PUERTA CERRADA';
            }
          }
        }, 2000);
        return;
      }
    }, pasoMs);

  } catch (err) {
    if (state.boardingIntervalId) {
      clearInterval(state.boardingIntervalId);
      state.boardingIntervalId = null;
    }
    state.isBoardingSimulationRunning = false;
    showToast('Error en la simulación', true);
  }
}

async function cancelarOperacionEmbarque() {
  const selPuerta = document.getElementById('select-puerta-vuelo');
  const codigo = (selPuerta && selPuerta.value) ? selPuerta.value : state.selectedFlightCode;
  if (!codigo) {
    showToast('Selecciona un vuelo para cancelar su operación de embarque', true);
    return;
  }

  const confirmado = await mostrarTacticalConfirmModal({
    titulo: `Abortar Embarque Vuelo ${codigo}`,
    mensaje: `¿Estás seguro de cancelar o abortar la operación de embarque del vuelo ${codigo}?\nEl estado se revertirá a "Check-in abierto" y los pasajeros volverán a su estado confirmado en rampa.`,
    icono: '🛑',
    textoBtn: 'Abortar Operación'
  });
  if (!confirmado) return;

  // Detener la simulación si está activa
  if (state.boardingIntervalId) {
    clearInterval(state.boardingIntervalId);
    state.boardingIntervalId = null;
  }
  state.isBoardingSimulationRunning = false;

  const btnCancelar = document.getElementById('btn-cancelar-embarque');
  if (btnCancelar) btnCancelar.disabled = true;

  try {
    const res = await fetch(`/api/embarque/${encodeURIComponent(codigo)}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Error al cancelar la operación de embarque', true);
      return;
    }

    // Resetear apariencia del botón de inicio de embarque
    const btn = document.getElementById('btn-iniciar-embarque');
    if (btn) {
      btn.disabled = false;
      btn.style.background = 'var(--avianca-red)';
      btn.style.borderColor = 'var(--avianca-red)';
      btn.style.color = '#FFFFFF';
      btn.style.cursor = 'pointer';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> <span>Auto-Embarque Completo</span>`;
    }

    const btnIndiv = document.getElementById('btn-abordar-individual');
    if (btnIndiv) btnIndiv.disabled = false;

    // Resetear barra y texto de progreso en puerta
    const bar = document.getElementById('gate-progress-bar');
    const text = document.getElementById('gate-progress-text');
    if (bar) bar.style.width = '0%';
    if (text) text.innerText = '0 / 0 Pasajeros Abordados (0%)';

    showToast(data.mensaje || `Operación de embarque del vuelo ${codigo} cancelada.`);
    if (typeof window.reproducirTonoAeronautico === 'function') {
      window.reproducirTonoAeronautico('cancelacion');
    }

    // Sincronizar datos y UI en tiempo real
    await cargarVuelos();
    await cargarPasajeros();
    await cargarPasajerosRecientes();
    await verificarEstadoBotonEmbarque(codigo);
    await cargarMapaAvion(codigo);
  } catch (err) {
    console.error('Error al cancelar embarque:', err);
    showToast('Error de red al intentar cancelar la operación de embarque', true);
  } finally {
    if (btnCancelar) btnCancelar.disabled = false;
  }
}

function actualizarProgresoEmbarque(progreso) {
  const bar = document.getElementById('gate-progress-bar');
  const text = document.getElementById('gate-progress-text');
  if (bar) bar.style.width = `${progreso.porcentaje}%`;
  if (text) text.innerText = `${progreso.abordados} / ${progreso.total} Pasajeros Abordados (${progreso.porcentaje}%)`;
}

// --- SISTEMA DE FEEDBACK DE AUDIO AEROPORTUARIO (WEB AUDIO API NATIVO) ---
let audioCtxGlobal = null;

function obtenerAudioContext() {
  try {
    if (!audioCtxGlobal) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtxGlobal = new AudioContextClass();
      }
    }
    if (audioCtxGlobal && audioCtxGlobal.state === 'suspended') {
      audioCtxGlobal.resume().catch(() => {});
    }
  } catch (e) {
    console.warn('AudioContext no soportado o bloqueado por política del navegador', e);
  }
  return audioCtxGlobal;
}

window.reproducirTonoAeronautico = function(tipo = 'confirmacion') {
  if (state.isAudioMuted) return;
  try {
    const ctx = obtenerAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (tipo === 'confirmacion' || tipo === 'scan_success' || tipo === 'pago_aprobado') {
      // 1. Doble beep armónico corporativo de aeropuerto (Chime de validación)
      // Primer tono: C6 (1046.5 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.50, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.10);

      // Segundo tono: G6 (1567.98 Hz) con armónico C7 (2093 Hz) tras pausa breve
      const t2 = now + 0.08;
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1567.98, t2);
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(2093.00, t2);
      gain2.gain.setValueAtTime(0.09, t2);
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.28);
      osc2.connect(gain2);
      osc3.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t2);
      osc3.start(t2);
      osc2.stop(t2 + 0.28);
      osc3.stop(t2 + 0.28);

    } else if (tipo === 'alerta' || tipo === 'error' || tipo === 'cancelacion') {
      // 2. Tono de alerta grave de advertencia aeroportuaria (165 Hz -> 110 Hz descendente)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(165.0, now);
      osc.frequency.exponentialRampToValueAtTime(110.0, now + 0.32);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

    } else if (tipo === 'flight_complete' || tipo === 'despegue') {
      // 3. Fanfarria armónica ascendente de despegue (C5 - E5 - G5 - C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + (idx * 0.10);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.08, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.40);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteStart + 0.40);
      });
    }
  } catch (err) {
    // Manejo silencioso en caso de bloqueo por política de navegador
  }
};
window.reproducirAudioAbordaje = window.reproducirTonoAeronautico;

// --- ABORDAJE INDIVIDUAL SECUENCIAL (PASAJERO POR PASAJERO - FIFO) ---
window.abordarSiguientePasajeroManual = async function() {
  const selPuerta = document.getElementById('select-puerta-vuelo');
  const codigo = (selPuerta && selPuerta.value) ? selPuerta.value : state.selectedFlightCode;
  if (!codigo) {
    showToast('Seleccione un vuelo activo en puerta para abordar', true);
    return;
  }

  // Si hay una simulación automática corriendo, no interferir
  if (state.isBoardingSimulationRunning) {
    showToast('La simulación automática de embarque ya está en curso', true);
    return;
  }

  const btnIndiv = document.getElementById('btn-abordar-individual');
  if (btnIndiv) setButtonLoading(btnIndiv, true);

  try {
    const res = await fetch(`/api/embarque/${encodeURIComponent(codigo)}/abordar-siguiente`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'No se pudo procesar el abordaje', true);
      return;
    }

    if (data.despachado && !data.boarding_pass) {
      showToast(data.mensaje || 'Todos los pasajeros confirmados ya han abordado este vuelo.', true);
      return;
    }

    if (data.boarding_pass) {
      const bp = data.boarding_pass;

      // 1. Desplegar el pase de abordar con animación de escáner láser óptico en vivo
      renderBoardingPassAvianca(bp, true);

      // 2. Actualizar barra de progreso de puerta en tiempo real
      if (data.progreso) {
        actualizarProgresoEmbarque(data.progreso);
      }

      // 3. Audio feedback de confirmación en lector de puerta
      reproducirAudioAbordaje('scan_success');

      // 4. Scroll suave hacia el pase si es visible
      const bpCard = document.getElementById('card-boarding-pass');
      if (bpCard) {
        bpCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // 5. Toast táctico con datos del pasajero
      const unboarded = data.progreso ? (data.progreso.total - data.progreso.abordados) : 0;
      showToast(`🎟️ Pasajero Abordado: ${bp.pasajero_nombre} [${bp.pasajero_doc}] • Asiento ${bp.asiento} (${bp.clase_cabina}) • Restantes: ${unboarded}`);
    }

    if (data.completado) {
      reproducirAudioAbordaje('flight_complete');
      showToast(data.mensaje || `🎉 ¡Vuelo ${codigo} completó el 100% de abordaje! Puerta cerrada y vuelo DESPEGADO.`);

      const btnEmbarque = document.getElementById('btn-iniciar-embarque');
      if (btnEmbarque) {
        btnEmbarque.disabled = true;
        btnEmbarque.style.background = '#059669';
        btnEmbarque.style.borderColor = '#047857';
        btnEmbarque.style.color = '#FFFFFF';
        btnEmbarque.style.cursor = 'not-allowed';
        btnEmbarque.innerHTML = '✈️ VUELO DESPACHADO — PUERTA CERRADA';
      }

      if (btnIndiv) {
        btnIndiv.disabled = true;
      }

      await cargarVuelos();
      await cargarPasajeros();
      await cargarPasajerosRecientes();
      await cargarSelectoresFlota();
    } else {
      // Actualizar bitácora de pasajeros recientes para reflejar "ABORDADO"
      await cargarPasajerosRecientes();
      if (typeof cargarMapaAvion === 'function') {
        await cargarMapaAvion(codigo);
      }
      if (typeof cargarPasajeros === 'function') {
        await cargarPasajeros();
      }
      if (typeof cargarVuelos === 'function') {
        await cargarVuelos();
      }
    }

  } catch (err) {
    console.error('Error al abordar siguiente pasajero:', err);
    showToast('Error de conexión con el lector de puerta', true);
  } finally {
    if (btnIndiv) setButtonLoading(btnIndiv, false);
  }
};

// --- VIRTUAL CARD INTERACTIVE LISTENERS ---
function initVirtualCardListeners() {
  const numInput = document.getElementById('pay-card-num');
  const nameInput = document.getElementById('pay-card-name');
  const expInput = document.getElementById('pay-card-exp');

  if (numInput) {
    numInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 16);
      let formatted = val.match(/.{1,4}/g)?.join(' ') || '';
      e.target.value = formatted;
      const vNum = document.getElementById('vcard-number');
      if (vNum) vNum.innerText = formatted || '•••• •••• •••• ••••';
    });
  }

  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase();
      e.target.value = val;
      const vHolder = document.getElementById('vcard-holder');
      if (vHolder) vHolder.innerText = val || 'NOMBRE DEL PASAJERO';
    });
  }

  if (expInput) {
    expInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 4);
      if (val.length >= 2) val = val.substring(0, 2) + '/' + val.substring(2);
      e.target.value = val;
      const vExp = document.getElementById('vcard-expiry');
      if (vExp) vExp.innerText = val || 'MM/AA';
    });
  }
}

// --- PASARELA DE PAGOS "AEROFLOW PAY" ---
window.abrirModalPago = async function(cod, asientoId, doc, nombre) {
  const modal = document.getElementById('modal-aeroflow-pay');
  if (!modal) return;

  // Reset overlays
  const overlay = document.getElementById('modal-pay-processing-overlay');
  const spinnerBox = document.getElementById('pay-processing-spinner-box');
  const successBox = document.getElementById('pay-processing-success-box');
  if (overlay) overlay.style.display = 'none';
  if (spinnerBox) spinnerBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';

  try {
    const res = await fetch(`/api/avion/${cod}/mapa`);
    const data = await res.json();
    const v = data.vuelo;
    const seat = data.configuracion_aeronave.asientos.find(s => s.id === asientoId);
    if (!seat) {
      showToast('No se encontró la butaca solicitada');
      return;
    }

    // Poblar resumen del vuelo en modal
    document.getElementById('pay-summary-flight-cod').innerText = v.codigo;
    document.getElementById('pay-summary-route').innerText = `${v.origen.split('-')[0].trim()} ✈ ${v.destino.split('-')[0].trim()}`;
    document.getElementById('pay-summary-seat').innerText = `${seat.id} (${seat.clase})`;
    document.getElementById('pay-summary-passenger').innerText = nombre || `Pasajero ${doc}`;
    document.getElementById('pay-summary-doc').innerText = doc;
    document.getElementById('pay-summary-time').innerText = v.hora_salida_12h;

    const desglose = seat.desglose_financiero;
    document.getElementById('pay-sum-base').innerText = desglose.tarifa_base;
    document.getElementById('pay-sum-admin').innerText = desglose.tarifa_admin;
    document.getElementById('pay-sum-iva').innerText = desglose.iva_19;
    document.getElementById('pay-sum-tasa').innerText = desglose.tasa_aeroportuaria;
    document.getElementById('pay-sum-total').innerText = desglose.total_a_pagar;

    // Poblar nombre en el plástico virtual
    const cardNameInput = document.getElementById('pay-card-name');
    if (cardNameInput) {
      const nomTitular = (nombre || 'VIAJERO AEROFLOW').toUpperCase();
      cardNameInput.value = nomTitular;
      const vHolder = document.getElementById('vcard-holder');
      if (vHolder) vHolder.innerText = nomTitular;
    }

    seleccionarMetodoPago('card');
    modal.style.display = 'flex';
  } catch (err) {
    showToast('Error cargando información de la pasarela');
  }
};

window.cerrarModalPago = function() {
  const modal = document.getElementById('modal-aeroflow-pay');
  if (modal) modal.style.display = 'none';
  state.isSubmittingPago = false;
};

window.seleccionarMetodoPago = function(metodo) {
  state.selectedPayMethod = metodo;
  document.querySelectorAll('.pay-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.paymethod === metodo);
  });
  const viewCard = document.getElementById('pay-view-card');
  const viewPse = document.getElementById('pay-view-pse');
  const viewMiles = document.getElementById('pay-view-miles');
  if (viewCard) viewCard.style.display = metodo === 'card' ? 'block' : 'none';
  if (viewPse) viewPse.style.display = metodo === 'pse' ? 'block' : 'none';
  if (viewMiles) viewMiles.style.display = metodo === 'miles' ? 'block' : 'none';
};

window.procesarPagoAeroFlow = async function() {
  if (state.isSubmittingPago) return;
  state.isSubmittingPago = true;
  const overlay = document.getElementById('modal-pay-processing-overlay');
  const spinnerBox = document.getElementById('pay-processing-spinner-box');
  const successBox = document.getElementById('pay-processing-success-box');
  const refEl = document.getElementById('pay-success-ref');
  const btnExecute = document.getElementById('btn-pay-execute');

  if (btnExecute) setButtonLoading(btnExecute, true);
  if (overlay) overlay.style.display = 'flex';
  if (spinnerBox) spinnerBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';

  const cod = document.getElementById('select-seatmap-vuelo')?.value || state.selectedFlightCode;
  const doc = document.getElementById('compra-pasajero-doc')?.value.trim();
  const nombre = document.getElementById('compra-pasajero-nombre')?.value.trim();
  const asiento = state.selectedSeat ? state.selectedSeat.id : document.getElementById('compra-asiento-select')?.value.trim();

  const refCode = `AF-${Math.floor(1000 + Math.random() * 9000)}-${['CO', 'BOG', 'VIP', 'PAY'][Math.floor(Math.random() * 4)]}`;

  // Animación realista de procesamiento bancario (1.8s)
  setTimeout(async () => {
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_vuelo: cod,
          documento: doc,
          nombre_nuevo: nombre,
          asiento: asiento
        })
      });
      const data = await res.json();
      if (btnExecute) setButtonLoading(btnExecute, false);

      if (res.ok) {
        if (typeof window.reproducirTonoAeronautico === 'function') {
          window.reproducirTonoAeronautico('pago_aprobado');
        }
        if (spinnerBox) spinnerBox.style.display = 'none';
        if (successBox) successBox.style.display = 'block';
        if (refEl) refEl.innerText = `Referencia Bancaria: #${refCode}`;

        let metodoNombre = 'Tarjeta Débito/Crédito Visa/MC (•••• 4242)';
        if (state.selectedPayMethod === 'pse') {
          const banco = document.getElementById('pay-pse-bank')?.value || 'Bancolombia';
          metodoNombre = `PSE Transferencia Bancaria (${banco})`;
        } else if (state.selectedPayMethod === 'miles') {
          metodoNombre = 'Redención 18.500 Millas LifeMiles / AeroFlow';
        }

        const fecha = new Date();
        let hours = fecha.getHours();
        const minutes = String(fecha.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const strHora = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

        state.lastPurchase = {
          vuelo_codigo: cod,
          pasajero_doc: doc,
          pasajero_nombre: nombre || `Pasajero ${doc}`,
          asiento: asiento,
          clase_cabina: state.selectedSeat?.clase || 'Economy',
          tipo_asiento: state.selectedSeat?.tipo_asiento || 'Estándar',
          referencia: refCode,
          metodo_pago: metodoNombre,
          hora_pago_12h: strHora,
          fecha_pago: fecha.toLocaleDateString('es-CO'),
          tarifa_formateada: data.total_cop || state.selectedSeat?.desglose_financiero?.total_a_pagar || '$ 1.005.200 COP',
          desglose: state.selectedSeat?.desglose_financiero || {
            tarifa_base: '$ 780.000 COP',
            tarifa_admin: '$ 35.000 COP',
            iva_19: '$ 148.200 COP',
            tasa_aeroportuaria: '$ 42.000 COP',
            total_a_pagar: data.total_cop || '$ 1.005.200 COP'
          }
        };

        // Limpiar formulario y actualizar mapas y vuelos
        document.getElementById('compra-pasajero-doc').value = '';
        document.getElementById('compra-pasajero-nombre').value = '';
        state.selectedSeat = null;

        cargarMapaAvion(cod);
        cargarVuelos();
        cargarPasajeros();
        cargarPasajerosRecientes();

        // Renderizar el pase oficial y comprobante en Módulo 04
        renderBoardingPassDesdeCompra(state.lastPurchase);

      } else {
        if (overlay) overlay.style.display = 'none';
        showToast(data.error || 'Error al procesar la compra con el banco');
      }
    } catch (err) {
      if (btnExecute) setButtonLoading(btnExecute, false);
      if (overlay) overlay.style.display = 'none';
      showToast('Error de conexión con la entidad financiera');
    } finally {
      state.isSubmittingPago = false;
    }
  }, 1800);
};

window.irAPaseDeAbordarDesdePago = function() {
  cerrarModalPago();
  activarTab('tab-puerta');
};

function prepararAreaImpresion() {
  const printArea = document.getElementById('print-ticket-area');
  const ticketCard = document.getElementById('card-boarding-pass');
  if (printArea && ticketCard) {
    printArea.innerHTML = ticketCard.outerHTML;
  }
}

function initPrintListeners() {
  window.addEventListener('beforeprint', () => {
    prepararAreaImpresion();
  });
}

window.imprimirTicketFisico = function() {
  prepararAreaImpresion();
  window.print();
};

window.imprimirTicketDirecto = function() {
  cerrarModalPago();
  activarTab('tab-puerta');
  setTimeout(() => {
    prepararAreaImpresion();
    window.print();
  }, 350);
};

window.reimprimirTicketPasajero = async function(doc, vueloId) {
  try {
    const resPagos = await fetch('/api/pasajeros-recientes');
    const dataPagos = await resPagos.json();
    const pago = dataPagos.registros?.find(r => String(r.documento) === String(doc) && r.vuelo_id === vueloId)
              || dataPagos.registros?.find(r => String(r.documento) === String(doc));

    const resVuelo = await fetch(`/api/avion/${vueloId}/mapa`);
    const dataVuelo = await resVuelo.json();
    const v = dataVuelo.vuelo || {};

    const asiento = pago ? pago.asiento : '1A';
    const esVip = (pago && pago.categoria === 'VIP') || asiento.startsWith('1') || asiento.startsWith('2');
    const monto = pago ? pago.monto_cop : 1143100;
    const montoStr = `$ ${Number(monto).toLocaleString('es-CO')} COP`;

    const bp = {
      vuelo_codigo: vueloId,
      origen: v.origen || 'BOG - Bogotá El Dorado',
      destino: v.destino || (pago ? pago.origen_destino : 'MIA - Miami International'),
      tipo_aeronave: v.tipo_aeronave || 'Airbus A319 Corporate',
      duracion: v.duracion_estimada || '01h 35m',
      distancia_km: v.distancia_km || 950,
      puerta: v.puerta || 'B-08',
      hora_salida_12h: v.hora_salida_12h || '09:15 PM',
      hora_llegada_12h: v.hora_llegada_12h || '11:45 PM',
      fecha_salida: v.fecha_salida || fechaHoyStr(),
      pasajero_doc: doc,
      pasajero_nombre: pago ? pago.nombre_completo : `Pasajero ${doc}`,
      categoria: pago ? pago.categoria : (esVip ? 'VIP' : 'Estándar'),
      clase_cabina: esVip ? 'VIP' : 'Economy',
      tarifa_formateada: montoStr,
      asiento: asiento,
      secuencia_fifo: 1,
      hora_abordaje_12h: pago?.fecha_hora_registro?.split('•')[1]?.trim() || '10:30 AM',
      referencia: pago ? pago.referencia_pago : `#AF-${vueloId}-${doc.slice(-4)}`,
      metodo_pago: pago ? pago.metodo_pago : 'Tarjeta Débito/Crédito Visa/Mastercard',
      desglose: {
        tarifa_base: `$ ${Math.round(monto * 0.77).toLocaleString('es-CO')} COP`,
        tarifa_admin: '$ 35.000 COP',
        iva_19: `$ ${Math.round(monto * 0.15).toLocaleString('es-CO')} COP`,
        tasa_aeroportuaria: '$ 42.000 COP',
        total_a_pagar: montoStr
      }
    };

    renderBoardingPassAvianca(bp);
    activarTab('tab-puerta');

    const bpCard = document.getElementById('card-boarding-pass');
    if (bpCard) bpCard.scrollIntoView({ behavior: 'smooth' });

    prepararAreaImpresion();
    setTimeout(() => {
      window.print();
    }, 400);

  } catch (err) {
    console.error('Error al reimprimir tiquete', err);
    showToast('Error al recuperar información para la reimpresión del tiquete');
  }
};

// Generar ticket completo a partir de la compra
async function renderBoardingPassDesdeCompra(purchase) {
  try {
    const res = await fetch(`/api/avion/${purchase.vuelo_codigo}/mapa`);
    const data = await res.json();
    const v = data.vuelo;

    const bp = {
      vuelo_codigo: purchase.vuelo_codigo,
      origen: v.origen,
      destino: v.destino,
      tipo_aeronave: v.tipo_aeronave,
      duracion: v.duracion_estimada || '01h 35m',
      distancia_km: v.distancia_km || 950,
      puerta: v.puerta,
      hora_salida_12h: v.hora_salida_12h,
      hora_llegada_12h: v.hora_llegada_12h || '11:45 PM',
      fecha_salida: v.fecha_salida,
      pasajero_doc: purchase.pasajero_doc,
      pasajero_nombre: purchase.pasajero_nombre,
      categoria: 'Viajero Frecuente',
      clase_cabina: purchase.clase_cabina,
      tarifa_formateada: purchase.tarifa_formateada,
      asiento: purchase.asiento,
      secuencia_fifo: 1,
      hora_abordaje_12h: purchase.hora_pago_12h,
      referencia: purchase.referencia,
      metodo_pago: purchase.metodo_pago,
      desglose: purchase.desglose
    };

    // Actualizar selector de puerta de embarque
    const selPuerta = document.getElementById('select-puerta-vuelo');
    if (selPuerta) selPuerta.value = purchase.vuelo_codigo;

    // Renderizar pase de compra y disparar automáticamente el escaneo biométrico
    renderBoardingPassAvianca(bp, true);
  } catch (err) {
    console.error('Error renderizando pase de compra', err);
  }
}

// --- RENDERIZADO DEL PASE DE ABORDAR COMERCIAL + RECIBO ELECTRÓNICO ---
function renderBoardingPassAvianca(bp, autoScan = false) {
  const container = document.getElementById('boarding-pass-container');
  if (!container) return;

  container.classList.remove('fade-in');
  void container.offsetWidth;
  container.classList.add('fade-in');

  const isVip = bp.clase_cabina === 'VIP';
  const badgeClase = isVip ? 'VIP FIRST CLASS' : 'CLASE ECONOMY';
  const badgeClass = isVip ? 'llamada' : 'abierto';
  const refNum = bp.referencia || `AF-${Math.floor(1000 + Math.random() * 9000)}-CO`;
  const metodoPago = bp.metodo_pago || 'Tarjeta Débito/Crédito Visa/Mastercard';
  const desglose = bp.desglose || {
    tarifa_base: '$ 780.000 COP',
    tarifa_admin: '$ 35.000 COP',
    iva_19: '$ 148.200 COP',
    tasa_aeroportuaria: '$ 42.000 COP',
    total_a_pagar: bp.tarifa_formateada || '$ 1.005.200 COP'
  };

  container.innerHTML = `
    <div class="printable-ticket-card" id="card-boarding-pass">
      
      <!-- HUD del Escáner Láser Aeroportuario en Vivo -->
      <div class="ticket-scanner-hud" id="ticket-scanner-hud" style="display:none;">
        <div class="scanner-laser-line"></div>
        <div class="scanner-glow-curtain"></div>
        <div class="scanner-corner top-left"></div>
        <div class="scanner-corner top-right"></div>
        <div class="scanner-corner bottom-left"></div>
        <div class="scanner-corner bottom-right"></div>
        <div class="scanner-status-hud">
          <div class="scanner-status-pill">
            <span class="scanner-radar-ping"></span>
            <span class="scanner-status-label" id="scanner-status-label">ESCANEANDO CÓDIGO QR Y BIOMETRÍA EN PUERTA...</span>
          </div>
          <div class="scanner-telemetry-text" id="scanner-telemetry-text">PUERTA ${esc(bp.puerta || 'B-01')} // FRECUENCIA LÁSER 635nm // ENCRIPTACIÓN SHA-256</div>
        </div>
      </div>

      <!-- Tira Superior de Identidad de Marca -->
      <div class="ticket-header-strip">
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <svg style="width:28px; height:28px;" viewBox="0 0 100 80" fill="none">
            <path d="M10 20 C25 15, 60 10, 85 45 C70 40, 50 42, 40 50 C55 46, 75 48, 88 65 C70 60, 45 62, 35 70 C50 68, 68 70, 78 78 C45 78, 20 65, 10 20 Z" fill="#38BDF8"/>
            <path d="M30 68 C45 65, 65 67, 78 78 C55 78, 38 74, 30 68 Z" fill="#DA291C"/>
          </svg>
          <span style="font-weight:900; font-size:1.05rem; letter-spacing:0.04em;">AERO FLOW AIRLINES</span>
        </div>
        <div style="font-size:0.75rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
          PASE DE ABORDAR OFICIAL & RECIBO ELECTRÓNICO
        </div>
      </div>

      <!-- CUERPO PRINCIPAL DEL PASE (DIVISIÓN TROQUELADA) -->
      <div class="ticket-body-grid">
        
        <!-- Lado Izquierdo: Itinerario y Pasajero -->
        <div class="ticket-left-main">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ${isVip ? '#D97706' : 'var(--avianca-red)'}; padding-bottom:0.75rem; margin-bottom:1rem;">
            <div style="font-size:0.85rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;">
              Tarjeta de Embarque Digital
            </div>
            <span class="status-pill-clean ${badgeClass}">
              ${badgeClase}
            </span>
          </div>

          <div style="display:flex; align-items:baseline; gap:0.85rem; margin-bottom:1.25rem;">
            <span style="font-size:2rem; font-weight:900; color:var(--avianca-black);">${esc(bp.origen.split('-')[0].trim())}</span>
            <span style="color:var(--avianca-red); font-size:1.3rem;">✈</span>
            <span style="font-size:2rem; font-weight:900; color:var(--avianca-red);">${esc(bp.destino.split('-')[0].trim())}</span>
            <span style="margin-left:auto; font-size:0.82rem; font-weight:700; color:var(--avianca-gray-text);">
              ${bp.distancia_km ? bp.distancia_km.toLocaleString() : '850'} KM | ${bp.duracion || '01h 35m'}
            </span>
          </div>

          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:0.85rem; font-size:0.85rem;">
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Pasajero</span><br><strong>${esc(bp.pasajero_nombre)}</strong></div>
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Documento</span><br><strong>${esc(bp.pasajero_doc)}</strong></div>
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Vuelo</span><br><strong style="color:var(--avianca-red);">${esc(bp.vuelo_codigo)}</strong></div>
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Puerta</span><br><strong>${esc(bp.puerta)}</strong></div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:0.85rem; font-size:0.85rem; border-top:1px solid rgba(255, 255, 255, 0.08); padding-top:0.85rem; margin-top:0.85rem;">
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Salida (12H)</span><br><strong>${esc(bp.hora_salida_12h)}</strong></div>
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Fecha</span><br><strong>${esc(bp.fecha_salida)}</strong></div>
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Tarifa Pagada</span><br><strong style="color:#059669;">${esc(bp.tarifa_formateada)}</strong></div>
            <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; font-weight:700; text-transform:uppercase;">Secuencia</span><br><strong style="color:var(--avianca-red);">#${bp.secuencia_fifo || 1}</strong></div>
          </div>

        </div>

        <!-- Lado Derecho: Talón de Embarque con Asiento y Códigos -->
        <div class="ticket-right-stub">
          <div>
            <div style="font-size:0.7rem; font-weight:800; color:var(--avianca-gray-text); text-transform:uppercase; letter-spacing:0.05em;">BOARDING PASS</div>
            <div style="font-size:1.15rem; font-weight:900; color:var(--avianca-black); margin-top:0.2rem;">${esc(bp.vuelo_codigo)}</div>
          </div>

          <div class="ticket-seat-stub-box" style="border-radius:var(--radius-sm); padding:0.75rem 0.5rem; margin:0.6rem 0;">
            <div style="font-size:0.7rem; font-weight:800; color:var(--avianca-red); text-transform:uppercase;">ASIENTO</div>
            <div style="font-family:var(--font-mono); font-size:2.1rem; font-weight:900; color:var(--avianca-black); line-height:1.1;">${esc(bp.asiento)}</div>
            <div style="font-size:0.68rem; font-weight:700; color:var(--avianca-gray-text); text-transform:uppercase;">${esc(bp.clase_cabina)}</div>
          </div>

          <!-- Código QR Vectorial Nítido -->
          <div style="display:flex; justify-content:center; margin-bottom:0.4rem;">
            <svg width="68" height="68" viewBox="0 0 100 100" style="background:#FFFFFF; padding:3px; border:1px solid #CBD5E1; border-radius:4px;">
              <rect x="0" y="0" width="30" height="30" fill="#0B192C"/>
              <rect x="5" y="5" width="20" height="20" fill="#FFFFFF"/>
              <rect x="10" y="10" width="10" height="10" fill="#0B192C"/>
              <rect x="70" y="0" width="30" height="30" fill="#0B192C"/>
              <rect x="75" y="5" width="20" height="20" fill="#FFFFFF"/>
              <rect x="80" y="10" width="10" height="10" fill="#0B192C"/>
              <rect x="0" y="70" width="30" height="30" fill="#0B192C"/>
              <rect x="5" y="75" width="20" height="20" fill="#FFFFFF"/>
              <rect x="10" y="80" width="10" height="10" fill="#0B192C"/>
              <rect x="40" y="15" width="10" height="20" fill="#0B192C"/>
              <rect x="45" y="45" width="15" height="15" fill="#0B192C"/>
              <rect x="70" y="60" width="20" height="10" fill="#0B192C"/>
              <rect x="65" y="80" width="25" height="15" fill="#0B192C"/>
            </svg>
          </div>

          <!-- Código de Barras -->
          <svg width="100%" height="24" viewBox="0 0 160 24" style="fill:#334155;">
            <rect x="0" y="0" width="3" height="24"/>
            <rect x="6" y="0" width="2" height="24"/>
            <rect x="11" y="0" width="4" height="24"/>
            <rect x="18" y="0" width="1" height="24"/>
            <rect x="22" y="0" width="5" height="24"/>
            <rect x="30" y="0" width="2" height="24"/>
            <rect x="35" y="0" width="4" height="24"/>
            <rect x="42" y="0" width="2" height="24"/>
            <rect x="47" y="0" width="6" height="24"/>
            <rect x="56" y="0" width="3" height="24"/>
            <rect x="62" y="0" width="2" height="24"/>
            <rect x="67" y="0" width="5" height="24"/>
            <rect x="75" y="0" width="1" height="24"/>
            <rect x="79" y="0" width="6" height="24"/>
            <rect x="88" y="0" width="3" height="24"/>
            <rect x="94" y="0" width="2" height="24"/>
            <rect x="99" y="0" width="4" height="24"/>
            <rect x="106" y="0" width="2" height="24"/>
            <rect x="111" y="0" width="5" height="24"/>
            <rect x="119" y="0" width="2" height="24"/>
            <rect x="124" y="0" width="6" height="24"/>
            <rect x="133" y="0" width="2" height="24"/>
            <rect x="138" y="0" width="4" height="24"/>
            <rect x="145" y="0" width="2" height="24"/>
            <rect x="150" y="0" width="5" height="24"/>
          </svg>
        </div>

      </div>

      <!-- SECCIÓN DE RECIBO ELECTRÓNICO OFICIAL DE COMPRA -->
      <div class="ticket-receipt-section">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
          <div style="font-size:0.85rem; font-weight:800; color:var(--avianca-black); text-transform:uppercase;">
            Comprobante Electrónico de Compra // AeroFlow Pay
          </div>
          <span id="badge-transaccion-aprobada" style="font-family:var(--font-mono); font-size:0.75rem; font-weight:800; background:rgba(16, 185, 129, 0.18); color:#34D399; padding:0.25rem 0.65rem; border-radius:var(--radius-pill); border:1px solid rgba(16, 185, 129, 0.4); transition:all 0.3s ease;">
            TRANSACCIÓN APROBADA ✓
          </span>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; font-size:0.82rem;">
          <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; text-transform:uppercase;">Referencia Bancaria:</span><br><strong style="font-family:var(--font-mono); color:#0284C7;">#${esc(refNum)}</strong></div>
          <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; text-transform:uppercase;">Método de Pago:</span><br><strong>${esc(metodoPago)}</strong></div>
          <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; text-transform:uppercase;">Emisión:</span><br><strong>${esc(bp.fecha_salida)} • ${esc(bp.hora_abordaje_12h || '10:00 AM')}</strong></div>
          <div><span style="color:var(--avianca-gray-text); font-size:0.7rem; text-transform:uppercase;">Total Pagado ($ COP):</span><br><strong style="font-size:1.05rem; font-family:var(--font-mono); color:#059669;">${esc(bp.tarifa_formateada)}</strong></div>
        </div>

        <!-- Desglose de Impuestos -->
        <div class="ticket-tax-grid" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:0.5rem; font-size:0.75rem; border-radius:8px; padding:0.5rem 0.75rem; margin-top:0.75rem;">
          <div>Base: <strong style="color:var(--text-main);">${desglose.tarifa_base}</strong></div>
          <div>Admin: <strong style="color:var(--text-main);">${desglose.tarifa_admin}</strong></div>
          <div>IVA 19%: <strong style="color:var(--text-main);">${desglose.iva_19}</strong></div>
          <div>Tasa STAX: <strong style="color:var(--text-main);">${desglose.tasa_aeroportuaria}</strong></div>
        </div>
      </div>

    </div>

    <!-- Botones de Acción (Ocultos al Imprimir) -->
    <div class="ticket-action-row no-print" style="display:flex; justify-content:center; gap:1rem; margin-top:1.5rem; flex-wrap:wrap;">
      <button type="button" class="btn-scan-boarding" id="btn-verificar-ticket" onclick="iniciarEscaneoBoardingPass(this)" style="padding:0.75rem 1.6rem; font-size:0.92rem;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
          <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
          <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
          <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
          <line x1="7" y1="12" x2="17" y2="12"/>
        </svg>
        <span>🔍 Verificar Abordaje</span>
      </button>
      <button type="button" class="btn-avianca-red" onclick="imprimirTicketFisico()" style="padding:0.75rem 1.75rem; font-size:0.92rem;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        🖨️ Imprimir Ticket Físico / Guardar PDF
      </button>
      <button type="button" class="btn-secondary" onclick="activarTab('tab-fids')" style="padding:0.75rem 1.4rem;">
        Consultar Más Vuelos ➔
      </button>
    </div>
  `;

  // Pre-cargar el área aislada para impresión oficial limpia y sin hoja en blanco
  prepararAreaImpresion();

  // Escaneo automático interactivo si fue solicitado
  if (autoScan) {
    setTimeout(() => {
      iniciarEscaneoBoardingPass();
    }, 280);
  }
}

// --- FUNCIÓN GLOBAL: ANIMACIÓN DE ESCÁNER LÁSER Y BIOMETRÍA EN PUERTA ---
window.iniciarEscaneoBoardingPass = function(btnElement) {
  const card = document.getElementById('card-boarding-pass');
  if (!card) {
    showToast('Genere o seleccione un pase de abordar para escanear', true);
    return;
  }

  // Prevenir disparos duplicados si ya está en curso
  if (card.classList.contains('is-scanning')) return;

  const btn = btnElement || document.getElementById('btn-verificar-ticket');
  if (btn) setButtonLoading(btn, true);

  // Accesibilidad: sin animación láser ni tonos si el usuario pide movimiento reducido
  if (AeroCore.respetaMovimientoReducido()) {
    card.classList.remove('scan-approved');
    card.classList.add('scan-approved');
    if (btn) {
      setButtonLoading(btn, false);
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>✓ Abordaje Autorizado</span>
      `;
    }
    showToast('✓ ABORDAJE AUTORIZADO — Pasajero validado en puerta con éxito', false);
    return;
  }

  const hud = document.getElementById('ticket-scanner-hud');
  const label = document.getElementById('scanner-status-label');
  const telem = document.getElementById('scanner-telemetry-text');
  const badgeReceipt = document.getElementById('badge-transaccion-aprobada');

  if (hud) {
    hud.style.display = 'block';
    hud.style.opacity = '1';
  }
  card.classList.remove('scan-approved');
  card.classList.add('is-scanning');

  if (label) label.innerText = 'ESCANEANDO CÓDIGO QR Y BIOMETRÍA EN PUERTA...';
  if (telem) telem.innerText = 'LÁSER ÓPTICO 635nm // LECTURA BIOMÉTRICA // VALIDANDO ASIENTO';

  // Chime sintético de inicio de escáner (Web Audio API nativo y seguro)
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1480, audioCtx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    // Audio opcional sin interrupciones
  }

  // Animación interactiva en tiempo real (1.2s según especificación de puerta)
  setTimeout(() => {
    card.classList.remove('is-scanning');
    card.classList.add('scan-approved');

    if (label) label.innerText = '✓ ABORDAJE AUTORIZADO / TRANSACCIÓN APROBADA';
    if (telem) telem.innerText = 'DOCUMENTO VALIDADO // ASIGNACIÓN CONFIRMADA // PASAJERO A BORDO';

    if (badgeReceipt) {
      badgeReceipt.innerText = 'ABORDAJE AUTORIZADO ✓';
      badgeReceipt.classList.add('receipt-approved-pulse');
    }

    if (btn) {
      setButtonLoading(btn, false);
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>✓ Abordaje Autorizado</span>
      `;
      btn.style.background = 'linear-gradient(135deg, #065F46 0%, #047857 100%)';
      btn.style.borderColor = '#34D399';
    }

    // Doble beep armónico corporativo de confirmación de aeropuerto
    if (typeof window.reproducirTonoAeronautico === 'function') {
      window.reproducirTonoAeronautico('confirmacion');
    }

    showToast('✓ ABORDAJE AUTORIZADO — Pasajero validado en puerta con éxito', false);

    // Desvanecer suavemente el HUD tras 1.2s para dejar el ticket despejado
    setTimeout(() => {
      if (hud) {
        hud.style.opacity = '0';
        setTimeout(() => {
          hud.style.display = 'none';
          hud.style.opacity = '1';
          card.classList.remove('scan-approved');
        }, 400);
      }
    }, 1200);

  }, 1200);
};

// =============================================================================
// MÓDULO VISUAL AVANZADO v32.0: TELEMETRÍA, KPIS, TOOLTIPS, 3D TILT & AUDIO
// =============================================================================

function renderLiveRouteTelemetry(vuelo, ocupacion) {
  const container = document.getElementById('flight-live-telemetry');
  if (!container || !vuelo) return;

  container.style.display = 'block';

  // Datos climatológicos y de vuelo basados en destino
  const destStr = (vuelo.destino || '').toUpperCase();
  let climaIcon = '☀️';
  let tempC = '24°C';
  let altitud = '38,000 FT';
  let velocidad = '495 KTS / 916 KM/H';

  if (destStr.includes('MAD') || destStr.includes('MADRID')) {
    climaIcon = '🌤️';
    tempC = '21°C';
    altitud = '41,000 FT';
    velocidad = '515 KTS / 954 KM/H';
  } else if (destStr.includes('MIA') || destStr.includes('MIAMI')) {
    climaIcon = '🌴';
    tempC = '28°C';
    altitud = '36,000 FT';
    velocidad = '480 KTS / 889 KM/H';
  } else if (destStr.includes('JFK') || destStr.includes('NUEVA YORK')) {
    climaIcon = '🏙️';
    tempC = '19°C';
    altitud = '39,000 FT';
    velocidad = '490 KTS / 907 KM/H';
  }

  container.innerHTML = `
    <div class="telemetry-route-card">
      <div class="telemetry-route-header">
        <div>
          <strong style="font-size:0.95rem; color:var(--text-main); font-family:var(--font-sans);">
            📡 Telemetría Aeronáutica en Vivo // Ruta BOG ➔ ${esc(vuelo.destino)}
          </strong>
          <div style="font-size:0.75rem; color:var(--avianca-gray-text);">Aeronave ${esc(vuelo.tipo_aeronave)} • Corredor Internacional</div>
        </div>
        <span class="telemetry-badge-live">
          <span class="fids-dot live"></span> RADAR ACTIVO
        </span>
      </div>

      <!-- Trayectoria Curva de Vuelo con Avión Animado -->
      <div class="telemetry-curve-box">
        <svg class="telemetry-curve-svg" viewBox="0 0 600 80" preserveAspectRatio="none">
          <defs>
            <linearGradient id="flightArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#38BDF8"/>
              <stop offset="50%" stop-color="#FCD116"/>
              <stop offset="100%" stop-color="#DA291C"/>
            </linearGradient>
          </defs>
          <path class="flight-path-arc" d="M 30 65 Q 300 5 570 65"/>
          <path class="flight-path-active-arc" d="M 30 65 Q 300 5 570 65"/>
          
          <!-- Origen BOG -->
          <circle cx="30" cy="65" r="5" fill="#38BDF8"/>
          <text x="30" y="78" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="800" fill="#38BDF8" text-anchor="middle">BOG</text>
          
          <!-- Destino -->
          <circle cx="570" cy="65" r="5" fill="#DA291C"/>
          <text x="570" y="78" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="800" fill="#DA291C" text-anchor="middle">DEST</text>

          <!-- Avión Animado en Trayectoria -->
          <g class="telemetry-airplane-marker" transform="translate(295, 25)">
            <circle r="14" fill="rgba(56, 189, 248, 0.2)"/>
            <svg x="-10" y="-10" width="20" height="20" viewBox="0 0 24 24" fill="#38BDF8">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
          </g>
        </svg>
      </div>

      <!-- Métricas Aeronáuticas en Vivo -->
      <div class="telemetry-metrics-grid">
        <div class="telemetry-metric-box">
          <div class="telemetry-metric-lbl">Altitud de Crucero</div>
          <div class="telemetry-metric-val">✈️ ${altitud}</div>
        </div>
        <div class="telemetry-metric-box">
          <div class="telemetry-metric-lbl">Velocidad / Groundspeed</div>
          <div class="telemetry-metric-val">⚡ ${velocidad}</div>
        </div>
        <div class="telemetry-metric-box">
          <div class="telemetry-metric-lbl">Clima en Destino</div>
          <div class="telemetry-metric-val">${climaIcon} ${tempC}</div>
        </div>
        <div class="telemetry-metric-box">
          <div class="telemetry-metric-lbl">Estado de Cabina</div>
          <div class="telemetry-metric-val" style="color:#10B981;">🛡️ Presurización Óptima</div>
        </div>
      </div>
    </div>
  `;
}

function actualizarPanelKPIsFlota(dataPagos, dataVuelos, dataPasajeros) {
  const elRecaudo = document.getElementById('kpi-total-recaudo');
  const elPorc = document.getElementById('kpi-porcentaje-ocupacion');
  const elFrac = document.getElementById('kpi-fraccion-sillas');
  const elFill = document.getElementById('kpi-ocupacion-fill');
  const elStatus = document.getElementById('kpi-ocupacion-status');
  const elVip = document.getElementById('kpi-pax-vip');
  const elEco = document.getElementById('kpi-pax-eco');
  const elBoarded = document.getElementById('kpi-pax-abordados');
  const elWaiting = document.getElementById('kpi-pax-espera');

  const registros = (dataPagos && dataPagos.registros) ? dataPagos.registros : [];
  
  // 1. Recaudo Total COP
  let totalRecaudo = 0;
  registros.forEach(p => {
    totalRecaudo += Number(p.monto_cop || 0);
  });

  if (elRecaudo) {
    if (AeroCore.animarContador) {
      AeroCore.animarContador(elRecaudo, totalRecaudo);
    } else {
      elRecaudo.innerText = totalRecaudo.toLocaleString('es-CO');
    }
  }

  // 2. Capacidad Global y Ocupación
  const todosVuelos = [
    ...(dataVuelos?.en_curso || []),
    ...(dataVuelos?.proximos || []),
    ...(dataVuelos?.despegados || [])
  ];

  let sillasOcupadas = 0;
  let capacidadTotal = 0;

  if (todosVuelos.length > 0) {
    todosVuelos.forEach(v => {
      sillasOcupadas += Number(v.ocupacion || 0);
      capacidadTotal += Number(v.capacidad_maxima || 26);
    });
  } else {
    sillasOcupadas = registros.length;
    capacidadTotal = 26;
  }

  if (capacidadTotal === 0) capacidadTotal = 26;
  const sillasLibres = Math.max(0, capacidadTotal - sillasOcupadas);
  const disponibilidadPct = Math.round((sillasLibres / capacidadTotal) * 100);
  const ocupacionPct = Math.min(100, Math.round((sillasOcupadas / capacidadTotal) * 100));

  if (elPorc) elPorc.innerText = `${disponibilidadPct}% Disp.`;
  if (elFrac) elFrac.innerText = `(${sillasLibres} libres / ${capacidadTotal} Sillas)`;
  if (elFill) elFill.style.width = `${ocupacionPct}%`;

  if (elStatus) {
    if (sillasLibres === 0) {
      elStatus.innerText = '0% Disponibilidad (Cabina Llena - Lista de Espera Activa)';
      elStatus.style.color = '#EF4444';
      elStatus.style.fontWeight = '800';
    } else {
      elStatus.innerText = `${disponibilidadPct}% Disponibilidad (${sillasLibres} asientos libres para reserva inmediata)`;
      elStatus.style.color = disponibilidadPct < 25 ? '#F59E0B' : '#10B981';
      elStatus.style.fontWeight = '600';
    }
  }

  // 3. VIP vs Economy
  let vipCount = 0;
  let ecoCount = 0;
  registros.forEach(p => {
    const sId = (p.asiento || '').toUpperCase();
    if (sId.startsWith('1') || sId.startsWith('2') || (p.categoria_viajero || '').toUpperCase().includes('VIP')) {
      vipCount++;
    } else {
      ecoCount++;
    }
  });

  if (elVip) {
    if (AeroCore.animarContador) AeroCore.animarContador(elVip, vipCount);
    else elVip.innerText = vipCount;
  }
  if (elEco) {
    if (AeroCore.animarContador) AeroCore.animarContador(elEco, ecoCount);
    else elEco.innerText = ecoCount;
  }

  // 4. Abordados vs En Espera
  let abordadosCount = 0;
  let esperaCount = 0;
  registros.forEach(p => {
    if (p.embarcado) abordadosCount++;
    else esperaCount++;
  });

  if (elBoarded) {
    if (AeroCore.animarContador) AeroCore.animarContador(elBoarded, abordadosCount);
    else elBoarded.innerText = abordadosCount;
  }
  if (elWaiting) {
    if (AeroCore.animarContador) AeroCore.animarContador(elWaiting, esperaCount);
    else elWaiting.innerText = esperaCount;
  }
}

// 4. Tooltip Flotante para Asientos de Cabina
let seatTooltipEl = null;

function getOrCreateSeatTooltip() {
  if (!seatTooltipEl) {
    seatTooltipEl = document.createElement('div');
    seatTooltipEl.className = 'seat-floating-tooltip';
    seatTooltipEl.style.display = 'none';
    document.body.appendChild(seatTooltipEl);
  }
  return seatTooltipEl;
}

function mostrarFloatingSeatTooltip(event, seatId, clase, ocupado, precio, ocupante) {
  const tip = getOrCreateSeatTooltip();
  const claseLabel = clase === 'VIP' ? 'VIP First Class' : 'Clase Economy';
  
  let html = `<div><span class="seat-tooltip-seat-num">${seatId}</span><span class="seat-tooltip-class">${claseLabel}</span></div>`;
  if (ocupado) {
    html += `<span class="seat-tooltip-pax">👤 Ocupado${ocupante ? ' — ' + ocupante : ''}</span>`;
  } else {
    html += `<span class="seat-tooltip-price">Tarifa: ${precio}</span>`;
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  tip.style.opacity = '1';
  moverFloatingSeatTooltip(event);
}

function moverFloatingSeatTooltip(event) {
  if (!seatTooltipEl) return;
  seatTooltipEl.style.left = `${event.clientX}px`;
  seatTooltipEl.style.top = `${event.clientY - 12}px`;
}

function ocultarFloatingSeatTooltip() {
  if (seatTooltipEl) {
    seatTooltipEl.style.display = 'none';
  }
}

// 5. Efecto 3D Tilt & Holograma interactivo en mousemove
function init3DTiltEffects() {
  document.addEventListener('mousemove', (e) => {
    const tiltCards = document.querySelectorAll('.printable-ticket-card, .destination-hero-card');
    tiltCards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const inX = e.clientX >= rect.left && e.clientX <= rect.right;
      const inY = e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (inX && inY) {
        card.classList.add('card-3d-tilt');
        if (!card.querySelector('.holographic-sheen')) {
          const sheen = document.createElement('div');
          sheen.className = 'holographic-sheen';
          card.appendChild(sheen);
        }
        const xVal = e.clientX - rect.left;
        const yVal = e.clientY - rect.top;
        const xRot = 14 * ((yVal - rect.height / 2) / rect.height);
        const yRot = -14 * ((xVal - rect.width / 2) / rect.width);
        card.style.transform = `perspective(1000px) rotateX(${xRot}deg) rotateY(${yRot}deg) scale3d(1.02, 1.02, 1.02)`;
      } else if (card.classList.contains('card-3d-tilt')) {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      }
    });
  });
}

// Inicializar efectos al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  init3DTiltEffects();
});

// Asignaciones en Window para interacción global
window.mostrarFloatingSeatTooltip = mostrarFloatingSeatTooltip;
window.moverFloatingSeatTooltip = moverFloatingSeatTooltip;
window.ocultarFloatingSeatTooltip = ocultarFloatingSeatTooltip;
window.renderLiveRouteTelemetry = renderLiveRouteTelemetry;
window.actualizarPanelKPIsFlota = actualizarPanelKPIsFlota;

// =============================================================================
// ASIGNACIONES GLOBALES EN WINDOW (ACCESIBILIDAD Y ENLACE DE EVENTOS SPA)
// =============================================================================
window.eliminarPasajero = eliminarPasajero;
window.cancelarOperacionEmbarque = cancelarOperacionEmbarque;
window.cancelarVueloOperador = cancelarVueloOperador;
window.reactivarVueloOperador = reactivarVueloOperador;
window.archivarVueloOperador = archivarVueloOperador;
window.cargarPrimerPaseDeVuelo = cargarPrimerPaseDeVuelo;
window.irAReservarVuelo = irAReservarVuelo;
window.filtrarModoRol = filtrarModoRol;
window.activarTab = activarTab;
window.iniciarEscaneoBoardingPass = iniciarEscaneoBoardingPass;
window.renderBoardingPassAvianca = renderBoardingPassAvianca;

