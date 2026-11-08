# MAPA DEL SISTEMA Y ARQUITECTURA DE CÓDIGO — AERO FLOW AIRLINES

> **Versión de Auditoría:** Línea Base v2.1.0 / v35.0  
> **Fecha:** 2026-11-08  
> **Rama Git:** `rediseno-v2` (Tag base: `antes-rediseno`)

---

## 1. Inventario de Rutas y Pantallas

### 1.1 Vistas Frontend (SPA Vanilla JS)
Todas las vistas se renderizan dentro del contenedor principal y se activan dinámicamente mediante el selector de vistas `data-view`:

| Vista | Selector DOM | Rol Mínimo | Descripción |
|---|---|---|---|
| **Login / Registro** | `#aeroflow-login-overlay` | Anónimo | Pantalla de bienvenida con 3 pestañas (`pasajero`, `operador`, `integral`), formulario unificado de login/registro con Supabase Auth y validación de contraseñas. |
| **Buscador & Ofertas** | `#view-vuelos` | Pasajero | Hero con carrusel de destinos, ticker superior con cotizaciones COP, formulario de búsqueda origen-destino, grilla de resultados y ofertas destacadas. |
| **Directorio de Pasajeros** | `#view-directorio` | Pasajero / Operador / Integral | Interfaz conectada a un Árbol AVL en memoria con búsqueda en $O(\log n)$ por documento, filtrado por categorías (VIP / Estándar) y conteo de nodos. |
| **Mapa de Asientos & Pago** | `#view-asientos` | Pasajero / Integral | Fuselaje interactivo en SVG según configuración de cabina del avión seleccionado. Permite seleccionar butacas libres, calcular desglose de tarifas y procesar el checkout. |
| **Pase de Abordar** | `#view-pase` | Pasajero / Integral | Tarjeta digital de embarque de alta fidelidad con código de barras interactivo, QR, resumen de puerta, hora de embarque y categoría del viajero. |
| **Consola de Operaciones** | `#view-operaciones` | Operador / Integral | Tablero FIDS en tiempo real, gestión de puertas, telemetría de rampa, monitoreo de colas FIFO (Embarque y Standby) y abordaje asistido. |
| **Panel de Administración** | `#view-admin` | Integral | Creación de nuevos vuelos, asignación de aeronaves, manifiesto de pasajeros con lista enlazada, auditoría de transacciones recientes y métricas globales. |

---

### 1.2 Endpoints REST Backend (`app.py` Flask)

| Método | Endpoint | Descripción | Concurrencia / Mutex |
|---|---|---|---|
| `GET` | `/` | Renderiza la plantilla principal `templates/index.html`. | Lectura concurrente |
| `GET` | `/manifest.webmanifest` | Manifiesto PWA con configuración de íconos e inicio standalone. | Estático |
| `GET` | `/sw.js` | Service Worker para modo offline y caché de recursos locales. | Estático |
| `GET` | `/offline.html` | Pantalla de contingencia cuando no hay conexión a internet. | Estático |
| `GET` | `/icons/<filename>` | Entrega de favicons e íconos maskable (192px y 512px). | Estático |
| `GET` | `/vendor/<filename>` | Entrega del cliente UMD local de Supabase (`vendor/supabase.js`). | Estático |
| `GET` | `/assets/<filename>` | Entrega de fuentes WOFF2 locales e imágenes SVG de apoyo. | Estático |
| `GET` | `/js/<filename>` | Entrega de archivos de script de configuración (`js/config.js`). | Estático |
| `GET` | `/api/health` | Estado de salud, uptime y conteo de nodos en memoria. | Lectura |
| `GET` | `/api/sync-state` | Versión de estado, hora 12h y telemetría global para sincronización. | Lectura |
| `GET` | `/api/flota/catalogo` | Catálogo de las 7 aeronaves oficiales y geometrías de cabina. | Lectura |
| `GET` | `/api/vuelos` | Listado categorizado de vuelos (en curso, próximos, completados). | Lectura |
| `POST` | `/api/vuelos` | Creación de nuevo vuelo programado y persistencia en DB + Hash Map. | `ESTADO_MUTEX` |
| `GET` | `/api/vuelos/buscar/<cod>` | Búsqueda $O(1)$ en Hash Map de vuelos. | Lectura |
| `GET` | `/api/pasajeros` | Listado ordenado de pasajeros mediante recorrido in-order del Árbol AVL. | Lectura |
| `POST` | `/api/pasajeros` | Inserción balanceada de un nuevo pasajero en el Árbol AVL y SQLite. | `ESTADO_MUTEX` |
| `GET` | `/api/pasajeros/buscar/<doc>`| Búsqueda $O(\log n)$ en el Árbol AVL por documento de identidad. | Lectura |
| `DELETE` | `/api/pasajeros/<doc>` | Eliminación balanceada en Árbol AVL y cascada en manifiestos. | `ESTADO_MUTEX` |
| `GET` | `/api/avion/<cod>/mapa` | Mapa de butacas ocupadas y libres para el vuelo especificado. | Lectura |
| `POST` | `/api/checkin` | Emisión de boleto, asignación de asiento, pago y actualización de manifiesto. | `ESTADO_MUTEX` |
| `POST` | `/api/checkin/cancelar` | Cancelación de check-in, liberación de asiento y promoción de standby. | `ESTADO_MUTEX` |
| `POST` | `/api/embarque/<cod>/iniciar`| Encola los pasajeros del manifiesto a la Cola FIFO de embarque. | `ESTADO_MUTEX` |
| `POST` | `/api/embarque/<cod>/abordar-siguiente` | Desencola el siguiente pasajero y actualiza su estado a ABORDADO. | `ESTADO_MUTEX` |
| `POST` | `/api/embarque/<cod>/abordar-individual` | Abordaje puntual por documento de pasajero. | `ESTADO_MUTEX` |
| `POST` | `/api/embarque/<cod>/cancelar`| Restaura el vuelo al estado Check-in abierto y vacía la cola FIFO. | `ESTADO_MUTEX` |
| `GET` | `/api/pasajeros-recientes` | Historial de las últimas compras y transacciones registradas. | Lectura |
| `POST` | `/api/vuelos/<cod>/cancelar` | Marca el vuelo como Cancelado y notifica a pasajeros. | `ESTADO_MUTEX` |
| `POST` | `/api/vuelos/<cod>/reactivar`| Restaura un vuelo cancelado a su estado operativo. | `ESTADO_MUTEX` |
| `POST` | `/api/vuelos/<cod>/archivar` | Archiva un vuelo despegado o cerrado para liberar la pantalla. | `ESTADO_MUTEX` |
| `POST` | `/api/vuelos/<cod>/expirar-y-reemplazar` | Cierra un vuelo viejo y genera automáticamente una ruta de reemplazo. | `ESTADO_MUTEX` |

---

## 2. Capa de Datos y Persistencia

### 2.1 Tablas SQLite Locales (`database.py` / `aerocore.db`)
1. **`vuelos`**: Catálogo de vuelos programados (código, origen, destino, aeronave, distancia, horas 12h, puerta, capacidad y estado).
2. **`pasajeros`**: Registro de clientes (documento, nombre completo, nacionalidad, categoría VIP/Estándar).
3. **`manifiesto`**: Relación vuelo-pasajero con asiento asignado, tarifa en COP, hora de check-in y estado de abordaje (`UNIQUE(codigo_vuelo, asiento_id)`).
4. **`cola_standby`**: Cola de pasajeros en lista de espera priorizada para butacas liberadas.
5. **`lista_espera`**: Solicitudes de asientos no disponibles.
6. **`pasajeros_recientes_pagos`**: Bitácora de transacciones de pago procesadas (monto en COP, método y últimos 4 dígitos).

### 2.2 Tablas Supabase Cloud PostgreSQL (`supabase/schema.sql`)
1. **`perfiles`**: Identidades sincronizadas con `auth.users` (`id`, `nombre`, `rol`, `email`, `created_at`). Roles estrictos: `'pasajero'`, `'operador'`, `'integral'`.
2. **`vuelos`**: Rutas maestras y estados operativos con lectura pública.
3. **`asientos`**: Inventario de butacas por aeronave con tarifa base en COP y bandera `ocupado`.
4. **`reservas`**: Asignaciones asiento-pasajero con restricciones únicas (`UNIQUE(vuelo_codigo, asiento_id)` y `UNIQUE(vuelo_codigo, pasajero_id)`).
5. **`pagos`**: Registro de cobros (monto entero COP, moneda, método, últimos 4 dígitos de tarjeta sanitizados y estado).

---

## 3. Funciones RPC, Triggers y Políticas RLS

### 3.1 Triggers y Procedimientos Almacenados
- **Trigger `on_auth_user_created`**: Al insertar en `auth.users`, ejecuta `public.crear_perfil_por_defecto()` para garantizar que cualquier usuario auto-registrado obtenga exclusivamente el rol `pasajero`.
- **Gaps a implementar en Fase 2**:
  - Función RPC `crear_orden` con cálculo server-side y bloqueo de precios.
  - Trigger PostgreSQL de Máquina de Estados para transiciones inmutables en `pagos`.
  - Mecanismo de bloqueo pesimista `FOR UPDATE` para retención de asientos (10-15 min).

### 3.2 Políticas RLS Activas
- **`perfiles`**:
  - `SELECT`: Propietario (`auth.uid() = id`) o rol `integral`.
  - `UPDATE`: Exclusivo para rol `integral` (auto-cambio de rol prohibido por política RLS).
- **`vuelos`**:
  - `SELECT`: Público (`true`).
  - `INSERT/UPDATE/DELETE`: Roles `operador` e `integral`.
- **`asientos`**:
  - `SELECT`: Público (`true`).
  - `ALL`: Roles `operador` e `integral`.
- **`reservas`**:
  - `SELECT`: Pasajero lee únicamente las suyas; operador e integral leen todas.
  - `INSERT/UPDATE`: Pasajero gestiona sus reservas; operador bloqueado para modificar ventas; integral con acceso total.
- **`pagos`**:
  - `SELECT/INSERT`: Pasajero gestiona sus pagos personales (`pasajero_id = auth.uid()`); integral tiene visibilidad global; operador sin acceso.

---

## 4. Dependencias del Ecosistema

### 4.1 Backend (Python 3.11)
- `flask` (2.x): Servidor de aplicaciones WSGI y API REST.
- `pytest` (9.1.1): Marco de pruebas unitarias y de integración.
- `anyio` (4.15.1): Soporte de concurrencia y fixtures asíncronos.
- `pyinstaller`: Generación de ejecutables nativos empaquetados para Windows.

### 4.2 Frontend y Automatización (Node.js v24)
- `sharp` (0.35.5): Procesamiento y redimensionamiento de íconos PWA.
- `playwright` (1.65.0): Suite de automatización E2E y captura visual en Chromium.
- `@supabase/supabase-js` (2.x, Vendor UMD): Cliente de base de datos en tiempo real y autenticación.

---

## 5. Hallazgos de Archivos Duplicados y Recursos Obsoletos

1. **`index.html` (raíz, 93.2 KB) vs `templates/index.html` (97.6 KB)**:
   - Duplicidad crítica. Flask renderiza exclusivamente `templates/index.html`. El archivo de la raíz quedó rezagado respecto a las modificaciones PWA y contenía un enlace a video externo no seguro.
2. **`js/auth.js` (32.8 KB) vs `static/js/auth.js` (32.8 KB)**:
   - Contenido 100% idéntico. Duplicación innecesaria en el repositorio.
3. **`js/config.js` (464 bytes) vs `static/js/config.js` (2.4 KB)**:
   - Discrepancia funcional: `js/config.js` define variables globales planas (`window.SUPABASE_URL`), mientras que `static/js/config.js` define un objeto estructurado `window.AEROFLOW_CONFIG`. Debe unificarse en una única fuente de verdad.
