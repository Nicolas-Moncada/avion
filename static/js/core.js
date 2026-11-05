/* ============================================================================ *
 *  AERO FLOW AIRLINES — core.js (Núcleo de Utilidades Frontend)                *
 *  Cargado SIEMPRE antes de app.js. Expone window.AeroCore.                    *
 *  - escapeHtml / escapeAttr : blindaje XSS para TODOS los innerHTML           *
 *  - formatoCOP              : moneda colombiana                                *
 *  - request                 : fetch con timeout + barra global de progreso    *
 *  - animarContador          : count-up de estadísticas                        *
 *  - respetaMovimientoReducido / envolverTablas / anunciar                      *
 * ============================================================================ */
(function (global) {
  'use strict';

  var ENTITY_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#47;' };

  function escapeHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/[&<>"'`=\/]/g, function (ch) { return ENTITY_MAP[ch]; });
  }

  var escapeAttr = escapeHtml;

  function formatoCOP(n) {
    if (typeof n !== 'number' || !isFinite(n)) n = Number(n) || 0;
    return '$ ' + n.toLocaleString('es-CO') + ' COP';
  }

  var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function respetaMovimientoReducido() {
    return reduceMotion || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ------------------------------------------------------- Barra de progreso */
  var pendingRequests = 0;
  var progressBar = null;

  function barra() {
    if (!progressBar) {
      progressBar = document.getElementById('aero-global-progress');
      if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'aero-global-progress';
        progressBar.className = 'aero-global-progress';
        progressBar.innerHTML = '<i></i>';
        document.body.appendChild(progressBar);
      }
    }
    return progressBar;
  }

  function progresoMostrar() {
    pendingRequests++;
    barra().classList.add('visible');
  }

  function progresoOcultar() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0 && progressBar) {
      progressBar.classList.remove('visible');
    }
  }

  /* ----------------------------------------------------------------- fetch */
  function request(url, opciones) {
    opciones = opciones || {};
    progresoMostrar();
    var controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var temporizador = controlador ? setTimeout(function () { controlador.abort(); }, opciones.timeout || 20000) : null;
    var config = Object.assign({}, opciones);
    if (controlador) {
      config.signal = controlador.signal;
      delete config.timeout;
    }
    return fetch(url, config).then(function (respuesta) {
      return respuesta.json().catch(function () { return {}; }).then(function (cuerpo) {
        if (!respuesta.ok) {
          var error = new Error((cuerpo && (cuerpo.error || cuerpo.mensaje)) || ('HTTP ' + respuesta.status));
          error.estado = respuesta.status;
          error.cuerpo = cuerpo;
          throw error;
        }
        return cuerpo;
      });
    }).finally(function () {
      if (temporizador) clearTimeout(temporizador);
      progresoOcultar();
    });
  }

  function obtenerJSON(url, opciones) {
    return request(url, Object.assign({ method: 'GET', headers: { 'Accept': 'application/json' } }, opciones));
  }

  function enviarJSON(url, metodo, cuerpo, opciones) {
    return request(url, Object.assign({
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(cuerpo || {})
    }, opciones));
  }

  /* ------------------------------------------------------------ Count-up */
  function animarContador(elemento, valorFinal, opciones) {
    opciones = opciones || {};
    var prefijo = opciones.prefijo || '';
    var sufijo = opciones.sufijo || '';
    var duracion = respetaMovimientoReducido() ? 0 : (opciones.duracion || 900);
    var inicio = Number(elemento.dataset._valorActual || 0);
    if (duracion === 0) {
      elemento.textContent = prefijo + valorFinal.toLocaleString('es-CO') + sufijo;
      elemento.dataset._valorActual = String(valorFinal);
      return;
    }
    var t0 = performance.now();
    function cuadro(t) {
      var progreso = Math.min(1, (t - t0) / duracion);
      var suavizado = 1 - Math.pow(1 - progreso, 3);
      var actual = Math.round(inicio + (valorFinal - inicio) * suavizado);
      elemento.textContent = prefijo + actual.toLocaleString('es-CO') + sufijo;
      if (progreso < 1) requestAnimationFrame(cuadro);
      else elemento.dataset._valorActual = String(valorFinal);
    }
    requestAnimationFrame(cuadro);
  }

  /* ---------------------------------------------- Envolver tablas (scroll móvil) */
  function envolverTablas(selector) {
    document.querySelectorAll(selector || 'table.avianca-styled-table').forEach(function (tabla) {
      if (tabla.parentElement && tabla.parentElement.classList.contains('table-scroll')) return;
      var envoltorio = document.createElement('div');
      envoltorio.className = 'table-scroll';
      tabla.parentNode.insertBefore(envoltorio, tabla);
      envoltorio.appendChild(tabla);
    });
  }

  /* --------------------------------------------------- Anuncio accesible */
  var regionViva = null;

  function anunciar(texto) {
    if (!regionViva) {
      regionViva = document.createElement('div');
      regionViva.className = 'sr-only';
      regionViva.setAttribute('aria-live', 'assertive');
      document.body.appendChild(regionViva);
    }
    regionViva.textContent = '';
    setTimeout(function () { regionViva.textContent = texto; }, 50);
  }

  /* --------------------------------------------------- Skeleton y helpers DOM */
  function esqueletoHtml(filas, columnas) {
    filas = filas || 3; columnas = columnas || 4;
    var html = '<table class="avianca-styled-table skeleton-table"><thead><tr>';
    for (var c = 0; c < columnas; c++) html += '<th>&nbsp;</th>';
    html += '</tr></thead><tbody>';
    for (var f = 0; f < filas; f++) {
      html += '<tr>';
      for (var k = 0; k < columnas; k++) html += '<td><span class="skeleton-line"></span></td>';
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  function debounce(funcion, espera) {
    var temporizador;
    return function () {
      var contexto = this, argumentos = arguments;
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { funcion.apply(contexto, argumentos); }, espera || 250);
    };
  }

  global.AeroCore = {
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    formatoCOP: formatoCOP,
    request: request,
    obtenerJSON: obtenerJSON,
    enviarJSON: enviarJSON,
    progresoMostrar: progresoMostrar,
    progresoOcultar: progresoOcultar,
    animarContador: animarContador,
    respetaMovimientoReducido: respetaMovimientoReducido,
    envolverTablas: envolverTablas,
    anunciar: anunciar,
    esqueletoHtml: esqueletoHtml,
    debounce: debounce
  };

  document.addEventListener('DOMContentLoaded', function () {
    envolverTablas();
  });
})(window);
