# CHANGELOG — AERO FLOW AIRLINES

Todo cambio notable en este proyecto se documenta aquí.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [2.1.0] — 2026-10-25

### Núcleo endurecido (Backend)
- **Nueva `config.py`:** configuración por entorno (`AEROFLOW_HOST`, `AEROFLOW_PORT`, `AEROFLOW_DB_PATH`, `AEROFLOW_DEBUG`). El servidor escucha en `127.0.0.1` por defecto en lugar de `0.0.0.0`.
- **Nueva `validation.py`:** validadores declarativos para vuelos, pasajeros y check-in (regex de código `AF####`, documento, nombre, puerta, horas 12h, fechas ISO y método de pago) con mensajes de error claros en español.
- **Semillas no destructivas:** la base de datos solo se puebla si las tablas `vuelos`, `pasajeros` y `manifiesto` están completamente vacías. Los datos de operación sobreviven a reinicios; el reset único es `python database.py --reset` (con el servidor detenido).
- **Mutex de escritura (`ESTADO_MUTEX`):** todas las mutaciones de estado se ejecutan bajo `threading.RLock` (acquirido en `before_request`, liberado en `teardown_request`), eliminando condiciones de carrera.
- **Fechas dinámicas:** la semilla y los vuelos nuevos usan la fecha operativa del día; `AF1001` ya no queda anclada a `2026-10-22`.
- **Hora de llegada calculada en servidor:** `sumar_duracion()` suma la duración estimada de la aeronave a la hora de salida; el cliente ya no envía `hora_llegada_12h`.
- **Índices únicos y deduplicación en `database.py`:** `manifiesto(vuelo, pasajero_doc)`, `manifiesto(vuelo, asiento)`, `cola_standby(vuelo, pasajero_doc)` con limpieza de duplicados heredados antes de crear los índices.
- **Regla "un tiquete activo por pasajero":** el check-in devuelve `409` si el pasajero tiene tiquete confirmado en otro vuelo activo.
- **Embarque reanudable:** reiniciar el embarque no re-encola pasajeros ya abordados (persistidos en la tabla de embarque).
- **Seguridad HTTP:** cabeceras `CSP`, `nosniff`, `DENY`, `Referrer-Policy` y `Permissions-Policy`; handlers JSON uniformes para `400/404/405/413/500`; límite de payload de 1 MiB.
- **Endpoint `/api/health`:** diagnóstico con versión, uptime y telemetría de memoria.
- **CLI de mantenimiento en `database.py`:** `--reset`, `--seed-si-vacia` y `--stats` (salida ASCII segura para consolas cp1252).

### Frontend
- **Nueva `static/js/core.js` (AeroCore):** `escapeHtml`/`escapeAttr`, `formatoCOP`, `request` con timeout y barra global de progreso, `animarContador`, detección `prefers-reduced-motion`, envoltorio responsive de tablas, región `aria-live`, skeletons y `debounce`.
- **Blindaje XSS:** todos los `innerHTML` dinámicos de `app.js` interpolan datos escapados; los botones generados dinámicamente (eliminar pasajero, ir a comprar, reimprimir, cancelar/reactivar/archivar vuelo, liberar tiquete, seleccionar reserva) migran de `onclick` inline a **delegación de eventos con `data-action`**.
- **Routing por hash:** cada módulo activo refleja su ancla (`#tab-fids`, `#tab-compra-avion`, …), con entrada animada de paneles y soporte de enlaces directos.
- **Formulario de vuelos con fecha real:** `input type="date"` (valor del día por defecto, restaurado tras `reset`); se elimina la fecha congelada del demo.
- **Pósters de destino por ciudad:** si la foto de Wikipedia no está disponible, se genera un póster SVG con paleta específica por aeropuerto (19 ciudades) en lugar del cartel genérico.
- **Animaciones y accesibilidad:** count-up en métricas del hero, entrada escalonada del mapa de asientos (`seat-appear`), skip-link, `focus-visible`, `role="status"` en toasts, escáner de embarque y simulación FIFO respetan `prefers-reduced-motion`.
- **Responsive multi-breakpoint:** capas de 1080/900/768/560/420 px con scroll horizontal de tablas en móvil.
- **Favicon corporativo SVG**, meta `description` y `theme-color`.

### Pruebas
- **Nueva `tests/test_api.py`:** 16 pruebas REST de integración con base de datos temporal aislada (salud, validación 400/409/413, regla un-tiquete-activo, standby FIFO con ascenso por cancelación, errores JSON).
- Suites existentes (`test_structures.py`, `verify_e2e.py`) verificadas en verde.

## [2.0.0] — Versión base
- SPA de reservas y operaciones con estructuras de datos nativas (Tabla Hash, Árbol AVL, Lista Enlazada, Colas FIFO), pasarela AeroFlow Pay, puerta de embarque con escaneo láser y persistencia SQLite en modo WAL.
- Cancelación de emergencia de embarque, gestión de pasajeros, cancelación/reactivación/archivo de vuelos y expiración por timeout con rotación de flota.
