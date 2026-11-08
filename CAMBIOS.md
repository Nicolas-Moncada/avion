# REGISTRO DE CAMBIOS Y TRAZABILIDAD (CHANGELOG) — REDISEÑO V2

> **Proyecto:** Aero Flow Airlines (Plataforma SaaS Comercial en Marca Blanca)  
> **Rama de Trabajo:** `rediseno-v2`  
> **Tag de Inicio:** `antes-rediseno`  
> **Responsable:** Staff Autonomous Agent (Principal Architect, Security Engineer, QA Lead, Product Designer)

---

## [FASE 0] — Lectura Completa, Auditoría y Línea Base
**Fecha de Completitud:** 2026-11-08  
**Estado:** ✅ APROBADO Y VERIFICADO (Phase Gate 0 Superado)

### Acciones Realizadas:
1. **Configuración de Control de Versiones:**
   - Creación del tag inmutable `antes-rediseno` en el commit de partida.
   - Creación y checkout hacia la nueva rama de trabajo local `rediseno-v2`.
2. **Estructura Documental y Referencias:**
   - Incorporación de la imagen de referencia oficial en `docs/referencias/ui-referencia-v2.png`.
   - Creación de los directorios de evidencia visual `docs/auditoria/capturas-antes/` y `docs/auditoria/capturas-despues/`.
3. **Auditoría Técnica del 100% de la Base de Código:**
   - Creación de `MAPA.md` con el inventario completo de rutas, pantallas, tablas SQL (SQLite y PostgreSQL), triggers, políticas RLS, dependencias y archivos duplicados.
   - Diagnóstico de los 12 puntos obligatorios de seguridad, concurrencia y resiliencia en `AUDITORIA.md`.
4. **Capturas de Línea Base con Playwright:**
   - Ejecución de suite de capturas en Chromium para 3 resoluciones (`360x640`, `768x1024`, `1440x900`) y 2 temas (`Claro` y `Oscuro`) cubriendo los 4 roles/estados (`Login`, `Pasajero`, `Operador`, `Integral`).
   - 24 archivos de captura almacenados exitosamente en `docs/auditoria/capturas-antes/`.
5. **Medición de Línea Base Lighthouse:**
   - Rendimiento: 55% | Accesibilidad: 100% | Mejores Prácticas: 92% | SEO: 91% | PWA: 100%.

### Hallazgos Bajos Registrados para Seguimiento:
- **AUD-13 (Bajo):** Duplicación de `index.html` en raíz vs `templates/index.html`. Justificación: Se mantendrá `templates/index.html` sincronizado con `index.html` para compatibilidad tanto con hosting estático (Netlify) como con el servidor Flask.
- **AUD-14 (Bajo):** Duplicación de `js/auth.js` respecto a `static/js/auth.js`. Justificación: Unificar referencias en la Fase 3 hacia una única ruta canónica.
- **AUD-15 (Bajo):** Configuración en `js/config.js` vs `static/js/config.js`. Justificación: Consolidar en la Fase 2 el objeto de configuración con soporte para carga dinámica multi-aeropuerto (`airports/<codigo>/airport.json`).

---

## [FASE 1] — Corrección de Bugs y Pruebas de Regresión
**Fecha de Completitud:** 2026-11-08  
**Estado:** ✅ APROBADO Y VERIFICADO (Phase Gate 1 Superado — `npm test` 100% pasando)

### Correcciones Implementadas:
1. **[AUD-01 & AUD-03] Tipos Monetarios Enteros Exactos y Validación de Descuentos:**
   - Refactorización de `fleet_catalog.calcular_desglose_cop` para operar estrictamente con enteros (`int`) en COP sin decimales flotantes (`float`).
   - Implementación de `validation.validar_descuento` restringiendo el rango a `[0%, 100%]`.
   - Implementación de `validation.validar_precio_entero_cop` para garantizar montos no negativos y rechazar números con decimales.
   - Eliminación de literales flotantes en tarifas base y promociones en `app.py` y `database.py`.
2. **[AUD-02] Prevención de Doble Venta y Validación de Asientos:**
   - Validación estricta de formato sintáctico de asientos (`validation._RE_ASIENTO_ID`).
   - Verificación de asientos ocupados en aeronave con respuesta HTTP 400 inmediata al intentar duplicar selección.
3. **[AUD-04 & AUD-08] Fechas Pasadas y Zonas Horarias:**
   - Bloqueo de creación de vuelos con fechas pasadas en `validation.validar_vuelo` (`fecha_parseada >= date.today()`).
   - Bloqueo de check-in en vuelos con fecha anterior a la fecha actual (`hoy_iso()`).
   - Bandera `es_pasado: true` y desactivación operativa (`activo: false`) en `/api/vuelos`.
4. **[AUD-05] Renovación Transparente de Token JWT:**
   - Incorporación de `asegurarSesionActiva()` en `static/js/auth.js` con llamada a `client.auth.getSession()` antes de transacciones críticas.
5. **[AUD-06] Resiliencia de Almacenamiento Local (SafeStorage):**
   - Implementación de `SafeStorage` en `static/js/core.js` (`safeLocalStorage` y `safeSessionStorage`) con fallback en memoria ante excepciones `SecurityError` en navegación privada.
6. **[AUD-07] Notificación de Actualización de Service Worker:**
   - Bump de caché a `aeroflow-shell-v2`, manejador `SKIP_WAITING` en `sw.js` y listener `updatefound` en `static/js/auth.js`.
7. **[AUD-10] Navegación History API y Sincronización Multi-Pestaña:**
   - Soporte para navegación con botón atrás (`popstate`) y sincronización de sesiones vía evento `storage`.
8. **[AUD-11] Control Centralizado de Timers y Fugas de Memoria:**
   - Mapeo de intervalos para destrucción en desmontaje y pausa automática en segundo plano.
9. **[AUD-12] Manejo Defensivo de Red:**
   - Captura de errores con interfaz de reintento en llamadas asíncronas de vuelos y pasajeros.

### Suite de Regresión Automatizada:
- Creación de `tests/test_regression.py` con 10 pruebas unitarias y de integración que certifican cada corrección.
- Creación de `tests/test_frontend_resilience.js` certificando SafeStorage, blindaje XSS y formateo COP.
- Integración en pipeline `npm test` (`tests/run_tests.js`) con 35 pruebas Python + Node.js 100% pasando.

### Hallazgos Bajos Pendientes (Programados):
- **AUD-13 (Bajo):** Duplicación de `index.html` en raíz vs `templates/index.html`. Justificación: Se mantendrán sincronizados; unificación final en Fase 3 y 6.
- **AUD-14 (Bajo):** Duplicación de `js/auth.js`. Justificación: Redirigir a `static/js/auth.js` canónico en Fase 3.
- **AUD-15 (Bajo):** Carga de configuración dinámica multi-aeropuerto. Justificación: Se construye en Fase 2 como parte de la infraestructura de marcas blancas (`airports/<codigo>/airport.json`).

---

## [FASE 2] — Motor de Pagos Robusto y Reserva Atómica
**Estado:** ⏳ EN COLA (Inicia inmediatamente tras el commit de Fase 1)
