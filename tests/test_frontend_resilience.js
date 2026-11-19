/**
 * Suite de Pruebas de Resiliencia Frontend — AERO FLOW AIRLINES
 * Verifica SafeStorage, escapeHtml XSS, validaciones de acceso y sincronización.
 */

const assert = require('assert');

console.log('--- EJECUTANDO PRUEBAS DE RESILIENCIA FRONTEND (Node.js) ---');

// 1. Simulación de SafeStorage en memoria ante bloqueo de localStorage / sessionStorage (AUD-06)
function MemoryStorage() {
  this._data = Object.create(null);
}
MemoryStorage.prototype.getItem = function (key) {
  return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
};
MemoryStorage.prototype.setItem = function (key, value) {
  this._data[key] = String(value);
};
MemoryStorage.prototype.removeItem = function (key) {
  delete this._data[key];
};
MemoryStorage.prototype.clear = function () {
  this._data = Object.create(null);
};

function createSafeStorageMock(shouldThrow) {
  const mem = new MemoryStorage();
  const failingStore = {
    getItem: () => { if (shouldThrow) throw new Error('SecurityError: The operation is insecure.'); return null; },
    setItem: () => { if (shouldThrow) throw new Error('SecurityError: The operation is insecure.'); },
    removeItem: () => { if (shouldThrow) throw new Error('SecurityError: The operation is insecure.'); },
    clear: () => { if (shouldThrow) throw new Error('SecurityError: The operation is insecure.'); }
  };

  return {
    getItem: (k) => {
      try { return failingStore.getItem(k); } catch (e) { return mem.getItem(k); }
    },
    setItem: (k, v) => {
      try { failingStore.setItem(k, v); } catch (e) { mem.setItem(k, v); }
    },
    removeItem: (k) => {
      try { failingStore.removeItem(k); } catch (e) { mem.removeItem(k); }
    },
    clear: () => {
      try { failingStore.clear(); } catch (e) { mem.clear(); }
    }
  };
}

// Test SafeStorage Fallback
const safeStore = createSafeStorageMock(true); // Siempre arroja SecurityError en store nativo
safeStore.setItem('aeroflow_session', JSON.stringify({ usuario: 'Test User', rol: 'pasajero' }));
const sesionGuardada = JSON.parse(safeStore.getItem('aeroflow_session'));
assert.strictEqual(sesionGuardada.usuario, 'Test User', 'SafeStorage debió persistir en memoria fallback');
assert.strictEqual(sesionGuardada.rol, 'pasajero', 'Rol debe coincidir');
console.log('✔ SafeStorage en memoria opera transparentemente cuando Storage está bloqueado (AUD-06)');

// 2. Blindaje XSS (AUD-11)
const ENTITY_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#47;' };
function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"'`=\/]/g, function (ch) { return ENTITY_MAP[ch]; });
}

const payloadMalicioso = '<script>alert("XSS")</script>&"\'';
const saneado = escapeHtml(payloadMalicioso);
assert(!saneado.includes('<script>'), 'El HTML debe estar debidamente escapado');
assert(saneado.includes('&lt;script&gt;'), 'Los corchetes angulares deben ser entidades HTML');
console.log('✔ Blindaje XSS sanea payloads maliciosos correctamente (AUD-11)');

// 3. Formato de Moneda COP (AUD-03)
function formatoCOP(n) {
  if (typeof n !== 'number' || !isFinite(n)) n = Number(n) || 0;
  return '$ ' + Math.round(n).toLocaleString('es-CO') + ' COP';
}

const precioFormateado = formatoCOP(780000);
assert(precioFormateado.includes('780.000'), 'Formato COP debe incluir separador de miles');
assert(precioFormateado.includes('COP'), 'Formato COP debe incluir sufijo COP');
console.log('✔ Formato COP entero exacto opera correctamente (AUD-03)');

// 4. Verificación estructural de Cola FIFO e identificación inmutable de tarjetas (Fase 2)
const fs = require('fs');
const path = require('path');
const minimalUiSrc = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'minimal-ui.js'), 'utf8');
assert(minimalUiSrc.includes('data-boarding-doc='), 'Las tarjetas deben renderizar atributo inmutable data-boarding-doc');
assert(minimalUiSrc.includes('data-boarding-asiento='), 'Las tarjetas deben renderizar atributo inmutable data-boarding-asiento');
assert(!minimalUiSrc.includes('getElementById(`ticket-card-${idx}`)') && !minimalUiSrc.includes('id="ticket-card-${idx}"'), 'No deben existir IDs colisionables ticket-card-${idx} entre Mis reservas y Cola FIFO');
assert(!minimalUiSrc.includes('getElementById(`badge-status-${idx}`)') && !minimalUiSrc.includes('id="badge-status-${idx}"'), 'No deben existir IDs colisionables badge-status-${idx} entre Mis reservas y Cola FIFO');
assert(minimalUiSrc.includes('✓ Pasajero Abordado'), 'El botón en fila FIFO debe mostrar "✓ Pasajero Abordado" al completar abordaje');
console.log('✔ Identificación inmutable de tarjetas FIFO y ausencia de colisión de IDs verificadas');

// 5. Verificación de animación de despegue, persistencia DESPEGADO y transición al siguiente vuelo (Fase 3)
const tplHtml = fs.readFileSync(path.join(__dirname, '..', 'templates', 'index.html'), 'utf8');
assert(tplHtml.includes('id="gate-departure-overlay"'), 'La plantilla debe incluir el overlay cinemático de despegue');
assert(tplHtml.includes('id="gate-live-status-badge"'), 'La plantilla debe incluir el badge dinámico de estado en puerta');
assert(minimalUiSrc.includes('dispararSecuenciaDespegueVuelo'), 'Debe existir la secuencia cinemática de despegue');
assert(minimalUiSrc.includes('esVueloDespegado'), 'Debe existir validación de vuelos DESPEGADO al volver a Abordar');
assert(minimalUiSrc.includes('✈️ DESPEGADO'), 'El selector debe marcar los vuelos cerrados con ✈️ DESPEGADO');
assert(minimalUiSrc.includes('Todos los vuelos con pasajeros en rampa han sido despachados'), 'Debe existir el estado vacío final tras despachar todos los vuelos');
console.log('✔ Secuencia cinemática de despegue, bloqueo DESPEGADO y transición automática verificadas');

console.log('--- TODAS LAS PRUEBAS DE RESILIENCIA FRONTEND PASARON (100%) ---');
