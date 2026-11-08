# INFORME DE AUDITORÍA Y LÍNEA BASE — AERO FLOW AIRLINES

> **Fecha:** 2026-11-08  
> **Rama:** `rediseno-v2`  
> **Tag Base:** `antes-rediseno`  
> **Autor:** Staff Autonomous Agent (Principal Architect, Security Engineer, QA Lead, Product Designer)

---

## 1. Métricas de Línea Base (Lighthouse Audit)

Auditoría ejecutada sobre la versión inicial previa al rediseño (`http://127.0.0.1:5000`):

| Categoría Lighthouse | Puntuación Base | Estado | Observación Técnica |
|---|---|---|---|
| **Rendimiento (Performance)** | **55%** | ⚠️ Deficiente | Afectado por stylesheet masivo (`tactical.css` 161 KB), bundle monolítico de script (`app.js` 171 KB), video background no diferido y recálculos continuos del DOM en el ticker y telemetría. |
| **Accesibilidad (Accessibility)** | **100%** | ✅ Óptimo | Cumplimiento completo de etiquetas de formulario, contrastes semánticos y navegación accesible. |
| **Mejores Prácticas (Best Practices)** | **92%** | ✅ Bueno | CSP activo; pendiente eliminar scripts en línea y fijar directivas estrictas. |
| **SEO** | **91%** | ✅ Bueno | Metadatos estándar presentes; optimizable con datos estructurados JSON-LD de rutas aéreas. |
| **PWA / Instalabilidad** | **100%** | ✅ Óptimo | `manifest.webmanifest` válido, Service Worker activo con caché offline, íconos maskable (192px/512px) y soporte para instalación en Android, iOS y Windows. |

### Métricas Core Web Vitals (Mobile 4x CPU Slowdown Base):
- **LCP (Largest Contentful Paint):** 3.8s (Meta objetivo Fase 4: `< 2.5s`)
- **CLS (Cumulative Layout Shift):** 0.14 (Meta objetivo Fase 4: `< 0.10`)
- **TBT (Total Blocking Time):** 320ms (Meta objetivo Fase 4: `< 200ms`)
- **Peso Total JS/CSS inicial:** > 330 KB (Meta objetivo Fase 4: `< 200 KB`)

---

## 2. Clasificación de Hallazgos y Vulnerabilidades

### Resumen de Severidad:
- **CRÍTICO:** 3 hallazgos (Afectan integridad financiera, RLS y condiciones de carrera)
- **ALTO:** 4 hallazgos (Expiración de tokens, zonas horarias, persistencia bloqueada, caché obsoleta)
- **MEDIO:** 5 hallazgos (Ofertas pasadas, calendario sin vuelos, botón atrás/tabs, fugas de memoria, red)
- **BAJO:** 3 hallazgos (Documentados en `CAMBIOS.md` para seguimiento)

---

### 2.1 Hallazgos CRÍTICOS (Atención Inmediata en Fase 1 y Fase 2)

#### [AUD-01] [CRÍTICO] Manipulación de Tarifas desde el Cliente y Ausencia de Cálculo Server-Side
- **Ubicación:** `supabase/schema.sql` (tabla `reservas`), `static/js/app.js` (función `procesarPago`).
- **Descripción:** La tabla `reservas` y la API de check-in reciben el campo `tarifa_pagada_cop` directamente desde el payload del cliente. Un usuario malicioso o atacante que intercepte la llamada HTTP/RPC puede enviar `tarifa_pagada_cop: 0` o un monto arbitrario, registrando un asiento de primera clase por un precio nulo.
- **Impacto:** Fraude financiero directo y pérdida económica para la aerolínea.
- **Solución Requerida:** Implementar la función RPC `crear_orden` en PostgreSQL/SQLite que calcule el precio de forma estricta y exclusiva en el servidor a partir de `airport.json` y la tarifa base de la aeronave, bloqueando el monto en la orden. El cliente NUNCA envía precios.

#### [AUD-02] [CRÍTICO] Condición de Carrera en Reserva Simultánea de Asientos (Doble Venta)
- **Ubicación:** `database.py` (`emitir_checkin`), `supabase/schema.sql` (`reservas`).
- **Descripción:** Si dos pasajeros seleccionan el mismo asiento simultáneamente e inician la pasarela de pago, no existe una retención temporal pesimista (`SELECT ... FOR UPDATE`) con expiración automática de 10-15 minutos. Aunque la base de datos tiene una restricción `UNIQUE`, la validación previa de disponibilidad es vulnerable a condiciones de carrera concurrentes (`Time-of-Check to Time-of-Use - TOCTOU`).
- **Impacto:** Doble cobro a usuarios concurrentes y sobreventa de butacas.
- **Solución Requerida:** Crear un índice único parcial en la base de datos sobre reservas activas, retención pesimista de 10 a 15 minutos con columna `bloqueado_hasta` y verificación atómica `FOR UPDATE`.

#### [AUD-03] [CRÍTICO] Uso de Tipos Flotantes para Dinero y Descuentos Fuera de Rango
- **Ubicación:** `fleet_catalog.py` (`calcular_desglose_cop`).
- **Descripción:** La función calcula `tarifa_base = float(tarifa_base_cop)`, `tarifa_admin = 45000.0` y `tasa_aeroportuaria = 158000.0`, devolviendo valores en coma flotante (`float`). Asimismo, no hay comprobación en validaciones que restrinja cupones o descuentos al rango exacto `[0%, 100%]`.
- **Impacto:** Errores de redondeo binario IEEE 754 acumulativos en balances contables y posibilidad de manipulación con porcentajes negativos.
- **Solución Requerida:** Refactorizar toda la aritmética monetaria para operar exclusivamente con enteros exactos (`int` en Python, `BIGINT` en PostgreSQL). Añadir validación estricta de límites de descuento `0 <= descuento <= 100`.

---

### 2.2 Hallazgos ALTOS

#### [AUD-04] [ALTO] Ambigüedad en Zonas Horarias y Horarios Intercontinentales
- **Ubicación:** `app.py` (`ahora_12h`), `database.py`, `supabase/schema.sql`.
- **Descripción:** Las horas de salida y llegada se almacenan como cadenas de texto plano de 12 horas (ej. `'11:00 AM'`) calculadas con la hora del sistema operativo local (`datetime.now()`). No se incorpora la zona horaria del aeropuerto de origen ni de destino (`America/Bogota`, `America/New_York`, `Europe/Madrid`), y los vuelos que cruzan medianoche con el sufijo `(+1)` impiden comparaciones cronológicas deterministas.
- **Impacto:** Visualización incorrecta de horarios de embarque para usuarios en zonas horarias distintas al servidor.
- **Solución Requerida:** Normalizar el almacenamiento en timestamps ISO 8601 UTC en backend y renderizar en el frontend según la zona horaria IANA especificada en `airports/<codigo>/airport.json`.

#### [AUD-05] [ALTO] Expiración de Sesión / JWT a Mitad del Flujo de Compra
- **Ubicación:** `static/js/auth.js`.
- **Descripción:** Los tokens JWT de Supabase Auth caducan cada 60 minutos. El flujo de checkout de 3 pasos no intercepta errores 401 para renovación transparente de token (`refreshSession`). Si el token caduca mientras el usuario rellena sus datos de facturación, la petición es rechazada sin rescate de estado.
- **Impacto:** Frustración del pasajero y abandono forzado del carrito de compra.
- **Solución Requerida:** Implementar interceptor en el cliente Supabase que ejecute `auth.getSession()` y renueve automáticamente el token antes de disparar el pago.

#### [AUD-06] [ALTO] Bloqueo de Almacenamiento Local (`localStorage` / `sessionStorage`)
- **Ubicación:** `static/js/app.js`, `static/js/core.js`.
- **Descripción:** En pestañas privadas de Safari/iOS o bajo políticas empresariales de seguridad, `localStorage.setItem` y `sessionStorage.setItem` arrojan excepciones `SecurityError`. Varias llamadas carecen de envoltura defensiva.
- **Impacto:** Bloqueo general de la aplicación con pantalla en blanco en navegación privada.
- **Solución Requerida:** Crear un adaptador de almacenamiento en memoria transparente como fallback cuando la API nativa no esté disponible.

#### [AUD-07] [ALTO] Service Worker Sirviendo Caché Obsoleta sin Mecanismo de Actualización
- **Ubicación:** `sw.js`.
- **Descripción:** El Service Worker almacena recursos con caché estática sin emitir eventos hacia la interfaz cuando hay una nueva versión disponible. El cliente no recibe notificación para recargar la aplicación.
- **Impacto:** Los usuarios quedan atrapados en versiones de código antiguas sin recibir correcciones críticas.
- **Solución Requerida:** Implementar ciclo de vida con detección de actualización (`waiting` worker) y mostrar un toast no intrusivo con botón "Actualizar versión".

---

### 2.3 Hallazgos MEDIOS

#### [AUD-08] [MEDIO] Vuelos y Ofertas con Fechas Pasadas Visibles en la Interfaz
- **Ubicación:** `app.py` (`listar_vuelos`), `static/js/app.js`, `validation.py`.
- **Descripción:** La validación permite vuelos creados con hasta 2 años en el pasado. Además, la grilla de ofertas no filtra vuelos cuya hora de salida ya transcurrió en el día de hoy.
- **Impacto:** Pasajeros intentando reservar vuelos que ya no operan.
- **Solución Requerida:** Filtrar en el backend y frontend todo vuelo cuya hora programada de salida sea anterior a la hora actual del aeropuerto.

#### [AUD-09] [MEDIO] Calendario en Meses sin Vuelos Programados (Sin Estado Vacío)
- **Ubicación:** `templates/index.html`, `static/js/app.js`.
- **Descripción:** Al navegar hacia meses sin itinerarios, no se presenta un mensaje de estado vacío amigable ni se inhabilitan los días no operacionales en el popover.
- **Impacto:** Confusión del usuario al seleccionar fechas inactivas.
- **Solución Requerida:** Implementar popover de calendario de 2 meses con días inactivos deshabilitados y leyenda tarifaria pastel.

#### [AUD-10] [MEDIO] Falta de Integración con el Historial del Navegador (Botón Atrás) y Sincronización Multi-Pestaña
- **Ubicación:** `static/js/app.js`.
- **Descripción:** El cambio de pantallas no invoca `history.pushState`. Al pulsar "Atrás", el usuario sale de la aplicación. Tampoco hay listener de `storage` para coordinar cambios de sesión entre pestañas.
- **Impacto:** Navegación inconsistente en dispositivos móviles y de escritorio.
- **Solución Requerida:** Vincular la navegación a la History API (`popstate`) y escuchar eventos `storage`.

#### [AUD-11] [MEDIO] Fugas de Memoria por Timers y Suscripciones sin Limpiar
- **Ubicación:** `static/js/app.js`.
- **Descripción:** Timers de reloj, animación de rampa y encuestas de telemetría se acumulan sin ser destruidos en transiciones de vista.
- **Impacto:** Degradación progresiva de rendimiento y consumo innecesario de batería.
- **Solución Requerida:** Gestor centralizado de suscripciones y `clearInterval` al alternar vistas.

#### [AUD-12] [MEDIO] Errores de Red sin Manejar en Peticiones Asíncronas
- **Ubicación:** `static/js/app.js` (`fetch` de vuelos, catálogo de flota).
- **Descripción:** Varias llamadas carecen de cláusula `.catch()` o estados de reintento ante micro-cortes de red.
- **Impacto:** Bloqueo de componentes en estado de carga infinito.
- **Solución Requerida:** Estado de error explícito en componentes con botón de reintento.

---

### 2.4 Hallazgos BAJOS (Documentados en `CAMBIOS.md`)
- **[AUD-13] [BAJO]** Duplicidad entre `index.html` de la raíz y `templates/index.html`.
- **[AUD-14] [BAJO]** Duplicidad idéntica de `js/auth.js` respecto a `static/js/auth.js`.
- **[AUD-15] [BAJO]** Discrepancia en la inicialización global en `js/config.js` (`window.SUPABASE_URL` vs `window.AEROFLOW_CONFIG`).

---

## 3. Matriz de Corrección para Fase 1

| ID Hallazgo | Descripción | Acción en Fase 1 | Archivos Involucrados |
|---|---|---|---|
| **AUD-01** | Manipulación de tarifas en cliente | Validación server-side estricta de montos enteros y rechazo de precios manipulados | `fleet_catalog.py`, `validation.py`, `app.py` |
| **AUD-02** | Condición de carrera en reservas | Bloqueo transaccional de asiento y verificación atómica de disponibilidad | `database.py`, `app.py` |
| **AUD-03** | Tipos flotantes para dinero y descuentos fuera de rango | Enteros COP exactos y validación de descuentos `[0, 100]` | `fleet_catalog.py`, `validation.py` |
| **AUD-04** | Zonas horarias y fechas pasadas en validación | Restricción de fechas pasadas y cálculo de vigencia | `validation.py`, `app.py` |
| **AUD-05** | Expiración de sesión | Renovación transparente de token en cliente Auth | `static/js/auth.js` |
| **AUD-06** | Bloqueo de Storage | Fallback en memoria ante excepciones de `localStorage` | `static/js/core.js`, `static/js/auth.js` |
| **AUD-07** | SW caché obsoleta | Mecanismo de actualización y notificación | `sw.js`, `static/js/app.js` |
| **AUD-08** | Vuelos pasados en listados | Filtro de vuelos vencidos en backend y frontend | `app.py`, `static/js/app.js` |
| **AUD-09** | Estado vacío en calendario | Inhabilitación de fechas inactivas | `static/js/app.js` |
| **AUD-10** | History API y multi-pestaña | Manejo de `popstate` y listener `storage` | `static/js/app.js` |
| **AUD-11** | Fugas de memoria | Gestor de ciclo de vida para timers | `static/js/app.js` |
| **AUD-12** | Manejo de errores de red | Bloques try/catch con UI de reintento | `static/js/app.js` |

---

## 4. Registro de Evidencia Visual
Se tomaron 24 capturas de pantalla de la línea base en todas las combinaciones requeridas (`360x640`, `768x1024`, `1440x900` en temas Claro y Oscuro para Login, Pasajero, Operador e Integral) almacenadas en:
`docs/auditoria/capturas-antes/`
