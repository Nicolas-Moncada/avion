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
**Fecha de Completitud:** 2026-11-08  
**Estado:** ✅ APROBADO Y VERIFICADO (Phase Gate 2 Superado — 8 Pruebas Financieras 100% Pasando)

### Funcionalidades Implementadas:
1. **Configuración Dinámica Multi-Aeropuerto (`airports/<codigo>/airport.json`):**
   - Creación de estructuras para Bogotá (`BOG`), Miami (`MIA`) y Medellín (`MDE`) con tasas aeroportuarias, tarifas administrativas e identidades de marca.
   - Módulo `airport_config.py` con resolución y caché en memoria.
2. **Cálculo Server-Side de Precios y Bloqueo de Tarifas:**
   - RPC `crear_orden` en PostgreSQL y SQLite (`crear_orden_atomic`).
   - El cliente NUNCA envía precios ni determina tasas: el servidor calcula tarifa base, tasas, IVA y total en COP enteros exactos (`BIGINT`/`INTEGER`).
   - Generación de código PNR alfanumérico único de 6 caracteres.
3. **Máquina de Estados Estricta y Bitácora Inmutable:**
   - Definición de estados: `pendiente -> autorizado -> pagado`; `fallido`; `expirado`; `reembolsado`.
   - Trigger en PostgreSQL y validación en Python (`pm_adapter.validar_transicion_estado`) que rechaza transiciones ilegales.
   - Tabla append-only `pago_eventos` con registro inmutable de cada cambio de estado.
4. **Retención Pesimista de Asiento (12 min) y Cero Doble Venta:**
   - Índice único parcial en PostgreSQL (`idx_ordenes_asiento_activo`) y SQLite sobre órdenes activas.
   - Bloqueo pesimista con temporizador `bloqueado_hasta`.
   - Protección ante webhook tardío: si llega un pago aprobado tras vencer la retención, se confirma si el asiento sigue libre o se reembolsa automáticamente de forma íntegra si fue ocupado, impidiendo en todo momento la doble venta.
5. **Idempotencia Estricta:**
   - Soporte para header y payload `idempotency_key` con índice `UNIQUE` en base de datos.
   - Respuestas consistentes y deterministas ante doble clic en interfaz o webhooks repetidos de pasarelas.
6. **Adaptador de Pago (`ProveedorPago`) y Plantilla de Edge Function:**
   - Interfaz extensible con métodos `crear_intento`, `confirmar`, `consultar`, `reembolsar`, `verificar_webhook`.
   - Implementación `SimuladorPagoAdapter` con tarjetas de prueba (aprobado `4242`/`5555`, fondos insuficientes `0002`, revisión `0003`) y verificación HMAC-SHA256.
   - Plantilla completa para producción en Supabase Edge Function (`supabase/functions/procesar-pago/index.ts`).
7. **Administración y Posventa Segura:**
   - Reembolsos restringidos exclusivamente al rol `Integral` con motivo obligatorio y registro en `reembolsos`.
   - Numeración atómica consecutiva de recibos (`REC-BOG-000001`).
   - Módulo de conciliación financiera (`obtener_reporte_conciliacion_atomic`).

### Suite de Pruebas Financieras (100% Pasando):
- `test_1_dos_usuarios_reservando_mismo_asiento`: Confirma rechazo de colisión concurrente sobre el mismo asiento.
- `test_2_doble_clic_en_pagar_idempotente`: Garantiza que dos clics simultáneos generen un solo cobro y retornen el mismo recibo.
- `test_3_webhook_repetido_idempotente`: Procesa reintentos de webhooks sin duplicar pagos.
- `test_4_pago_aprobado_tras_expirar_retencion_reembolso_si_ocupado`: Reembolsa automáticamente si la retención venció y el asiento fue ocupado.
- `test_5_tarifa_modificada_respeta_precio_bloqueado`: Respeta el precio acordado en la orden aunque el catálogo aumente de precio.
- `test_6_monto_manipulado_desde_cliente_ignorado_por_servidor`: Descarta montos fraudulentos enviados desde el frontend.
- `test_7_intento_reembolso_sin_rol_integral_rechazado`: Bloquea intentos de reembolso por usuarios sin rol `Integral` (HTTP 403).
- `test_8_reembolso_exitoso_con_auditoria`: Permite reembolsos con auditoría a administradores y libera la butaca.

---

## [FASE 3 & FASE 4] — Rediseño Minimalista Integral y Core Web Vitals
**Fecha de Completitud:** 2026-11-08  
**Estado:** ✅ APROBADO Y VERIFICADO (Phase Gates 3 y 4 Superados — 52 Tests 100% Pasando)

### Funcionalidades y Componentes Implementados:
1. **Sistema de Tokens de Diseño Centralizado (`static/css/design-tokens.css`):**
   - Escala espacial de 8px (`--space-1` a `--space-16`).
   - Tokens semánticos de color para tema Claro (`#F8FAFC`, superficie `#FFFFFF`) y Oscuro (`#0B0F17`, superficie `#111827`).
   - Paleta de precios pastel de baja saturación para el calendario: Verde `$ #86EFAC` (`#DCFCE7`), Ámbar `$$ #FDE047` (`#FEF9C3`) y Coral `$$$ #FCA5A5` (`#FEE2E2`).
   - Regla de rendimiento GPU: Transiciones únicamente mediante `transform` y `opacity`.

---

## [FASE 5] — Reingeniería Limpia (Clean-Slate) de Alta Gama — Edición Minimalista
**Fecha de Completitud:** 2026-11-08  
**Estado:** ✅ APROBADO Y VERIFICADO (Cero Emojis, 2 Roles Estrictos, Entrada Pública Directa, 52 Tests + Resiliencia Frontend 100% Pasando, 7 Capturas E2E)

### 1. Eliminación Radical de Emojis y Clean-Slate Rewrite:
- Erradicación del 100% de emojis en HTML, CSS, JS y API responses.
- Sustitución por iconografía vectorial pura SVG inline con trazo fino minimalista (`stroke-width="1.5"` y `stroke="currentColor"`).
- Reescribieron por completo desde cero (`write_file`): `templates/index.html`, `index.html`, `static/css/minimal-ui.css`, `static/js/auth.js` y `static/js/minimal-ui.js`.

### 2. Flujo de Acceso Público y Compuerta Condicional Inteligente:
- **Entrada Pública Directa en `/`:** La aplicación carga de inmediato la pantalla pública con el buscador y el catálogo de tarjetas fotográficas. Cero bloqueos de login en arranque inicial.
- **Compuerta de Login Suave:** Un visitante sin sesión puede explorar destinos y tarifas. Al hacer clic en "Elegir silla / Reservar" o en cualquier tarjeta:
  - Guarda la intención en memoria (`window.pendingFlightId`).
  - Despliega un modal minimalista con fondo difuminado (`backdrop-filter: blur(8px)`).
  - Incluye botones de autofill rápido de 1 clic: `[Pasajero Demo]` y `[Admin Demo]`.
  - Al autenticarse, cierra el modal y **continúa automáticamente hacia el mapa de sillas Airbus A320 del vuelo elegido** sin obligar a buscar de nuevo.

### 3. Modelo de 2 Roles Estrictos (Eliminación Total del Rol Operador):
- El rol `operador` fue eliminado en su totalidad de la interfaz de usuario.
- **Pasajero:** `pasajero@aeroflow.com` / `Pasajero123` (Selección de silla, bloqueo de 12 min, desglose en enteros COP, tiquete con QR y botón de abordaje FIFO interactivo).
- **Administrador:** `admin@aeroflow.com` / `Admin123` (Consola de administración con: 1. Edición de ofertas/imágenes/precios, 2. Creación/cancelación de vuelos con reembolso automático, 3. Monitor de cola de embarque FIFO y manifiesto enlazado, 4. Cierre financiero y conciliación contable).

### 4. Catálogo de Tarjetas Fotográficas y Buscador Flotante (Referencia Exacta):
- Cuadrícula de tarjetas en 3 columnas (desktop), 2 columnas (tablet) y 1 columna (móvil) con fotos 16:10 de alta definición:
  - Cali (`CLO` / `AF2022`): **COP 71.810**
  - Montería (`MTR` / `AF2024`): **COP 75.970**
  - Medellín (`MDE` / `AF2025`): **COP 82.010**
  - Cartagena (`CTG` / `AF4055`): **COP 115.000**
  - Santa Marta (`SMR` / `AF2030`): **COP 108.500**
  - Barranquilla (`BAQ` / `AF2028`): **COP 98.000**
  - Miami (`MIA` / `AF2020`): **COP 890.000**
- Calendario tarifario desplegable con vista de 2 meses en paralelo (Noviembre y Diciembre 2026), precios pastel `$`, `$$`, `$$$` y día 8 preseleccionado idéntico a la referencia visual.
- Barra de filtros de categoría: `[Todos los vuelos]`, `[En oferta]`, `[Destinos playeros]`, `[Aventuras urbanas]`, `[Vida nocturna]`, `[Retiros naturales]`.

### 5. Pase de Abordar con Abordaje FIFO en Vivo:
- Cada reserva confirmada emite un pase con PNR, código QR vectorial y botón primario "Abordar vuelo".
- Al pulsar "Abordar vuelo", llama a `POST /api/embarque/<codigo>/abordar-pasajero`, encola al pasajero en la cola FIFO de rampa y actualiza el estado a "Abordado".

### 6. Base de Datos y Persistencia:
- Soporte para conexión a MySQL con fallback silencioso a SQLite WAL (`aerocore.db`).
- Suite completa de 52 pruebas Python y pruebas Node.js de resiliencia pasando al 100%.
- Parada obligatoria previa a la compilación de APK, a la espera de confirmación del usuario.
