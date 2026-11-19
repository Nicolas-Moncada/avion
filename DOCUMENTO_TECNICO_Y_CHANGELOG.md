# ✈️ AERO FLOW AIRLINES — Dossier Técnico Integral y Registro de Cambios (Changelog)

---

## 📑 Tabla de Contenido
1. [Resumen Ejecutivo del Sistema](#1-resumen-ejecutivo-del-sistema)
2. [Arquitectura General y Tecnologías](#2-arquitectura-general-y-tecnologías)
3. [Estructuras de Datos Algorítmicas en Memoria](#3-estructuras-de-datos-algorítmicas-en-memoria)
4. [Módulos y Funcionalidades del Software](#4-módulos-y-funcionalidades-del-software)
   - 4.1. Portal Comercial del Pasajero (Experiencia de Compra)
   - 4.2. Módulo de Pase de Abordar Oficial y Recibo Fiscal
   - 4.3. Consola Operativa y Despacho en Rampa (Puerta de Embarque)
   - 4.4. Panel Administrativo en Vivo (Gestión de Flota y Medios)
   - 4.5. Sistema de Identidad, Autenticación y Control de Acceso (RBAC)
   - 4.6. Motor de Pagos, Máquina de Estados y Retención Atómica de Sillas
   - 4.7. Ecosistema Multiplataforma (Web PWA, Escritorio Windows y Móvil Android)
5. [Matriz Comparativa: Versión Actual vs. Versión Anterior](#5-matriz-comparativa-versión-actual-vs-versión-anterior)
6. [Resumen Detallado de Commits y Evolución del Código](#6-resumen-detallado-de-commits-y-evolución-del-código)
7. [Guía de Ejecución y Despliegue](#7-guía-de-ejecución-y-despliegue)

---

## 1. Resumen Ejecutivo del Sistema

**AERO FLOW AIRLINES** es una solución integral de software empresarial de grado aeronáutico, diseñada para cubrir de extremo a extremo las operaciones comerciales y aeroportuarias de una aerolínea de pasajeros.

El sistema unifica en una única plataforma dos grandes frentes de la industria aérea:
1. **El frente comercial (B2C - Portal Pasajero):** Búsqueda de itinerarios, selección visual de cabina y asientos estilo aerolínea internacional (LATAM / Avianca), liquidación financiera en Pesos Colombianos (`$ COP`), pasarela de pago multi-método, emisión de billetes electrónicos y pases de abordar con escáner biométrico.
2. **El frente operativo (B2B - Consola de Operaciones y Administración):** Control de rampa y puertas de embarque, abordaje secuencial y masivo con feedback sonoro (Web Audio API), listas de espera automatizadas (*Standby FIFO*) para sobreventa, cancelación de emergencia con reversión atómica de asientos, y gestión administrativa en tiempo real de rutas, tarifas y aeronaves con escalado universal de fotografías a proporción 16:10.

---

## 2. Arquitectura General y Tecnologías

El sistema adopta una arquitectura desacoplada de alto desempeño:

* **Backend (Python 3.10+ / Flask 3.1.3):**
  * Servidor WSGI liviano con enrutamiento RESTful JSON.
  * Mutex y exclusión mutua (`threading.Lock()`) para garantizar operaciones seguras ante accesos concurrentes a memoria viva.
  * Configuración desacoplada por entorno mediante variables de ambiente (`config.py`).
  * Validación declarativa de esquemas y sanitización estricta de entradas (`validation.py`).

* **Frontend (Vanilla JavaScript ES6+ / CSS3 Glassmorphism):**
  * Arquitectura **Single Page Application (SPA)** reactiva sin dependencias pesadas de frameworks externos (cero React/Angular/Vue), logrando tiempos de carga casi instantáneos y un rendimiento de más del 95% en Google Lighthouse.
  * Hojas de estilos modulares tácticas (`tactical.css`, `minimal-ui.css`, `login.css`, `design-tokens.css`).
  * Micro-interacciones aceleradas por GPU (`transform`, `translate3d`, `will-change`).
  * Modo visual bimodal (Dark Mode cinemático y Light Mode de alto contraste).

* **Persistencia Híbrida y Resiliencia:**
  * **Base de Datos Local SQLite 3:** Configurada en modo de alto rendimiento `WAL` (*Write-Ahead Logging*), con `busy_timeout = 30000 ms`, llaves foráneas estrictas y lectura no bloqueante.
  * **Integración Cloud Supabase (PostgreSQL):** Esquemas relacionales con soporte de políticas de seguridad por fila (*Row Level Security - RLS*).
  * **Auto-Seeding Inteligente:** Rutina de siembra automática no destructiva que inicializa vuelos, rutas troncales y usuarios demo en cada arranque si la base de datos se encuentra vacía.

---

## 3. Estructuras de Datos Algorítmicas en Memoria

Para cumplir con los más altos estándares de las ciencias de la computación, el núcleo operativo del sistema mantiene en memoria viva cuatro estructuras fundamentales optimizadas:

| Estructura | Archivo Fuente | Complejidad Temporal | Caso de Uso en Aero Flow |
| :--- | :--- | :---: | :--- |
| **Tabla Hash con Encadenamiento** | `data_structures/hash_map.py` | **$O(1)$** amortizado | Búsqueda, inserción y actualización ultrarrápida de vuelos por código (`AF1001`, `AF2020`). Cálculo de factor de carga y métricas de colisiones. |
| **Árbol AVL Auto-balanceado** | `data_structures/avl_tree.py` | **$O(\log n)$** garantizado | Indexación, ordenamiento y búsqueda de pasajeros por documento de identidad. Utiliza rotaciones simples (LL, RR) y dobles (LR, RL) para garantizar equilibrio estricto. |
| **Lista Enlazada Dinámica** | `data_structures/linked_list.py` | **$O(n)$** | Modelado del manifiesto de cabina de cada aeronave. Admite adición al final, eliminación dinámica y exportación visual de la secuencia de nodos. |
| **Colas FIFO (First-In, First-Out)** | `data_structures/fifo_queue.py` | **$O(1)$** encolar/desencolar | **1. Cola de Standby:** Gestión estricta de sobreventa para pasajeros en lista de espera ante vuelos al 100%.<br>**2. Cola de Abordaje:** Ordenamiento secuencial del flujo de pasajeros en puerta de embarque. |

---

## 4. Módulos y Funcionalidades del Software

### 4.1. Portal Comercial del Pasajero (Experiencia de Compra)
* **Buscador de Itinerarios y Telemetría Aeronáutica:** Selector de rutas nacionales e internacionales (Bogotá, Medellín, Miami, Cartagena, Cancún, etc.) con datos meteorológicos, altitud de crucero (41,000 FT) y velocidad en nudos (KTS).
* **Flujo Guiado de Checkout en Acordeón:**
  * **Paso 1: Selección de Vuelo e Información de Tarifa:** Visualización de horario, código de vuelo, aeronave y clase.
  * **Paso 2: Mapa Interactivo de Asientos estilo LATAM:**
    * Disposición gráfica en 3 columnas representativa del fuselaje de la aeronave.
    * Identificación de cabinas VIP Ejecutiva y Estándar.
    * Estado de asientos en tiempo real (disponible, seleccionado, ocupado).
  * **Paso 3: Datos del Viajero:** Formulario validado para documento de identidad, nombre completo, correo electrónico y nacionalidad.
  * **Paso 4: Pasarela AeroFlow Pay:**
    * Desglose financiero transparente en `$ COP`: Tarifa base, Cargo administrativo, IVA (19%) y Tasa aeroportuaria.
    * Métodos de pago disponibles: Tarjeta de Crédito/Débito (con previsualización 3D interactiva), PSE bancario nacional y Redención de Millas de viajero frecuente.
    * Mecanismo anti-doble clic (`isSubmitting`) e idempotencia para prevenir cargos duplicados.

### 4.2. Módulo de Pase de Abordar Oficial y Recibo Fiscal
* **Tarjeta de Embarque Panorámica:** Diseño oficial acorde a especificaciones IATA con código de barras lineal (Code 128) y código QR vectorial de alta legibilidad.
* **Escáner Óptico Interactivo:** Simulador de lector láser con duración exacta de 1.2 segundos, verificación biométrica y chime sonoro de validación positiva.
* **Comprobante Fiscal Digital:** Recibo con código único de autorización bancaria, desglose contable y botón directo para exportación limpia a PDF o impresión en papel sin fondos oscuros residuales.

### 4.3. Consola Operativa y Despacho en Rampa (Puerta de Embarque)
* **Abordaje Secuencial y Automático:**
  * Botón táctil para llamar al siguiente pasajero de la cola FIFO priorizando categoría VIP.
  * Modo de auto-embarque masivo temporizado.
  * Retroalimentación sonora mediante **Web Audio API** (doble beep armónico al abordar y tono grave en cancelaciones).
* **Gestión Inteligente de Standby y Ascensos:** Si un pasajero con tiquete confirmado cancela su reserva, el sistema promueve automáticamente al primer pasajero de la cola de espera, asignándole el asiento liberado sin intervención manual.
* **Cancelación de Emergencia en Rampa:** Botón táctico para abortar de inmediato el abordaje por contingencias climáticas o técnicas, deteniendo temporizadores y revirtiendo atómicamente el estado del vuelo a `Check-in abierto`.

### 4.4. Panel Administrativo en Vivo (Gestión de Flota y Medios)
* **CRUD Dinámico de Vuelos:** Formulario para programar nuevas rutas, modificar horarios, editar tarifas base y cambiar el estado operacional (Programado, Check-in abierto, Embarcando, Cerrado, En vuelo, Aterrizado, Cancelado).
* **Escalador y Normalizador Universal de Imágenes 16:10 (`Pillow`):**
  * Admite cualquier formato gráfico (JPEG, PNG, WebP, GIF) y resoluciones de hasta 4K/8K con un límite de carga ampliado a **16 MB**.
  * Neutraliza transparencias sobre lienzo blanco sólido.
  * Recorta y escala proporcionalmente a **1280 × 800 px (16:10)** usando el filtro de interpolación de alta calidad `LANCZOS`.
  * Comprime la salida a JPEG optimizado (calidad 85, peso objetivo < 300 KB) garantizando uniformidad visual en las tarjetas de destino.

### 4.5. Sistema de Identidad, Autenticación y Control de Acceso (RBAC)
* **Módulo AeroAuth (`static/js/auth.js` & `/api/auth/*`):**
  * **Registro Abierto de Usuarios:** Modal interactivo para que nuevos usuarios creen su cuenta especificando nombre, correo y contraseña.
  * **Inicio de Sesión con Control de Roles:** Acceso diferenciado por perfiles:
    1. **Pasajero / Cliente:** Acceso restringido al portal de compra, selección de asientos, pagos y consulta de tickets propios.
    2. **Operador Aeroportuario / Administrador:** Acceso a la consola de rampa, manifiesto de pasajeros, edición de vuelos y métricas de despacho.
  * **Compuertas de Acceso Estrictas:** Ocultamiento visual de módulos no autorizados y rechazo en el backend ante accesos indebidos con respuesta JSON 403 Forbidden.

### 4.6. Motor de Pagos, Máquina de Estados y Retención Atómica de Sillas
* **Máquina de Estados de Órdenes (`payments/adapter.py`):**
  * Ciclo de vida estricto: `pendiente` ➔ `autorizado` ➔ `pagado` ➔ `reembolsado` (o `fallido` / `expirado` / `cancelado`).
  * Prohibición absoluta de saltos de estado ilegales (ej. de cancelado a pagado).
* **Retención de Asiento con TTL (Seat Locking):** Al abrir la orden de pago, el asiento queda bloqueado temporalmente por un tiempo límite para evitar que dos usuarios compren la misma silla en concurrencia.
* **Cálculo del Desglose en Servidor:** Las tarifas base, IVA, tasas y recargos se computan forzosamente en el backend, imposibilitando la alteración maliciosa de precios desde las herramientas de desarrollador del navegador.

### 4.7. Ecosistema Multiplataforma (Web PWA, Escritorio Windows y Móvil Android)
1. **PWA Instalable (Progressive Web App):**
   * Manifiesto web estandarizado (`manifest.webmanifest`) con iconos adaptables (maskable) de 192px y 512px.
   * Service Worker (`sw.js`) con estrategia de caché local para recursos críticos y fallback a página fuera de línea (`offline.html`).
2. **Aplicación de Escritorio Windows (.exe):**
   * Script de lanzamiento autónomo [`Iniciar_AeroFlow.bat`](file:///c:/Users/cr362/avion-1/Iniciar_AeroFlow.bat).
   * Lanzador nativo en Python [`desktop_launcher.py`](file:///c:/Users/cr362/avion-1/desktop_launcher.py) que detecta automáticamente un puerto libre (5000 a 5050), inicia el servidor embebido y abre una ventana nativa independiente de alta definición sin barras de navegador utilizando Chrome o Edge en modo quiosco/app.
   * Especificaciones de empaquetado PyInstaller (`AeroFlowAirlines.spec` y `AeroFlow_Portable.spec`).
3. **Aplicación Móvil Nativa Android (APK):**
   * Proyecto nativo Android configurado con **Capacitor** en la carpeta `android/`.
   * Script automatizado de generación de binarios [`scripts/build_android_apk.py`](file:///c:/Users/cr362/avion-1/scripts/build_android_apk.py).
   * APK compilado disponible para descarga directa de los usuarios mediante el botón de la barra superior y los endpoints `/descargar-apk` y `/api/descargar-apk`.

---

## 5. Matriz Comparativa: Versión Actual vs. Versión Anterior

A continuación se contrastan las capacidades de la **versión base anterior** (commit inicial `2bf4389`) frente a la **versión actual desplegada** (commit `284a2e4`):

| Característica / Dimensión | Versión Anterior (Base Inicial `2bf4389`) | Versión Actual (Actualizada `284a2e4`) |
| :--- | :--- | :--- |
| **Sistema de Registro de Usuarios** | ❌ Inexistente. Solo existían credenciales estáticas demo hardcodeadas. | ✅ **Implementado.** Modal de registro en vivo (`/api/auth/register`), persistencia de credenciales con hash seguro y login dinámico. |
| **Control de Acceso y Roles (RBAC)** | ⚠️ Simulación cosmética en frontend; no bloqueaba la navegación interna ni endpoints sensibles. | ✅ **Blindaje integral.** Roles diferenciados (`pasajero`, `operador`, `admin`), bloqueo condicional de vistas y validación en endpoints REST. |
| **Flujo de Asignación de Asientos** | ⚠️ Mapa de cabina genérico sin restricción de avance al pago. | ✅ **Diseño LATAM 3 columnas** con compuerta de bloqueo estricta (*Gate Locking*): es obligatorio seleccionar asiento para habilitar los pasos 2 y 3. |
| **Gestión de Fotografías de Destinos** | ❌ Enlaces manuales externos no normalizados; rompían el diseño de las tarjetas. | ✅ **Escalador Universal 16:10 en Backend** (`Pillow LANCZOS`, hasta 16 MB). Convierte automáticamente cualquier foto a 1280x800 JPEG optimizado. |
| **Motor Transaccional de Pagos** | ⚠️ Cálculo de precios dependiente del frontend sin máquina de estados formal. | ✅ **Arquitectura de pagos en servidor** (`payments/adapter.py`) con máquina de estados estricta, bloqueo de sillas (seat locks con TTL) y conciliación. |
| **Alertas e Interacción de Usuario** | ❌ Uso frecuente de `alert()` y `confirm()` nativos que congelaban la interfaz. | ✅ **100% Notificaciones Toast no intrusivas**, modales glassmorphism y micro-interacciones GPU a 60 FPS. |
| **Retroalimentación Auditiva** | ⚠️ Básica o ausente en varias acciones operativas. | ✅ **Motor Web Audio API profesional** con doble beep armónico en embarque y tono grave en cancelaciones. |
| **Soporte PWA y Modo Offline** | ❌ No disponía de Service Worker ni manifiesto web válido. | ✅ **PWA instalable completa:** `manifest.webmanifest`, `sw.js` con caché local, iconos maskable y `offline.html`. |
| **Ejecución en Escritorio (Desktop)** | ❌ Requería necesariamente abrir terminal manual y ejecutar comandos Python. | ✅ **Lanzador de escritorio nativo:** `Iniciar_AeroFlow.bat` y `desktop_launcher.py` que abren ventana de aplicación sin barra de navegador. |
| **Aplicación Móvil Nativa (Android)** | ❌ No existía soporte para dispositivos móviles ni paquete descargable. | ✅ **Proyecto Android Capacitor completo**, script generador de APK (`build_android_apk.py`) y descarga directa desde la web. |
| **Cobertura de Pruebas Automatizadas** | ⚠️ 21 pruebas básicas de integración en `unittest`. | ✅ **Suite robusta con pytest:** 48 pruebas automatizadas cubriendo seguridad por rol, regresión, pasarela de pagos y estructuras algorítmicas. |
| **Manejo de Errores e Idempotencia** | ⚠️ Rastro de colisiones en base de datos bajo condiciones de alta concurrencia. | ✅ **Protección atómica SQLite WAL**, llaves de idempotencia en pagos y exclusión mutua mediante mutex en memoria. |

---

## 6. Resumen Detallado de Commits y Evolución del Código

La transición de la versión anterior a la actual abarcó **177 archivos modificados/creados**, con más de **39,000 líneas de código añadidas**. Los hitos más destacados de la evolución en el historial de Git son:

1. **`a9817a1` & `314e34e` — PWA & Mobile-First:**
   * Creación del manifiesto PWA, iconos corporativos y Service Worker con caché offline.
   * Incorporación del cliente Supabase con autenticación en la nube y reglas RLS.
2. **`63d5cca` — Soporte de Escritorio Nativo:**
   * Creación de `desktop_launcher.py` y configuración de especificaciones PyInstaller para binarios independientes de Windows.
3. **`93c90a4` & `85e0869` — Auditoría Forense y Corrección de Regresiones:**
   * Resolución de inconsistencias en la base de datos y creación de la suite `tests/test_regression.py`.
4. **`4d9b784` — Reingeniería del Motor de Pagos:**
   * Módulo `payments/adapter.py`, máquina de estados de órdenes de compra, cálculo estricto de impuestos en el servidor y reserva de asientos con temporizador.
5. **`ce33af0` & `a2beb4f` — Rediseño Minimalista y Aceleración GPU:**
   * Optimización visual según tokens de diseño, micro-interacciones a 60 FPS y 95% de puntuación en Lighthouse.
6. **`deec404` — Hardening y Auditoría de Seguridad por Rol:**
   * Suite `tests/test_role_security.py` para verificar que perfiles de pasajero no puedan manipular inventarios ni consolas de operadores.
7. **`d433569`, `8658227`, `c97d91d` & `749cee8` — Aero Flow Airlines V3 (Inspiración LATAM):**
   * Mapa de asientos cenital en 3 columnas.
   * Acordeón de compra paso a paso con compuerta de bloqueo por asiento.
   * Escaneo de billetes con sonido armónico y abordaje manual/automático.
   * Escalador universal 16:10 para imágenes del administrador con soporte hasta 16 MB.
8. **`1113c8a` — Eliminación de Alertas Nativas:**
   * Erradicación de `window.alert()` y adopción universal de notificaciones dinámicas tipo toast.
9. **`e4df530` & `45927d9` — Registro Abierto y Distribución de APK:**
   * Módulo de registro de nuevos usuarios en pantalla de autenticación.
   * Integración de Android Capacitor y endpoints de descarga de la aplicación móvil (`/descargar-apk`).
10. **`122bd79` & `284a2e4` (Release Actual) — Depuración Forense y Pulido Final:**
    * Corrección de advertencias en IDE, ajustes de micro-interacciones y validación de la suite de pruebas.

---

## 7. Guía de Ejecución y Despliegue

### Requisitos Previos
* **Python:** Versión 3.10 o superior (instalado en el sistema con `pip`).
* **Dependencias:** Instalables ejecutando `python -m pip install -r requirements.txt pytest`.

### Comandos de Ejecución

1. **Iniciar Servidor Web Tradicional:**
   ```powershell
   python app.py
   ```
   *Acceso en navegador:* `http://127.0.0.1:5000`

2. **Iniciar como Aplicación de Escritorio (Ventana Nativa):**
   * Doble clic sobre [`Iniciar_AeroFlow.bat`](file:///c:/Users/cr362/avion-1/Iniciar_AeroFlow.bat), o desde consola:
   ```powershell
   python desktop_launcher.py
   ```

3. **Ejecutar Suite de Pruebas Automatizadas:**
   ```powershell
   # Pruebas con pytest (48 tests unitarios, regresión y seguridad)
   python -m pytest tests/test_api.py tests/test_payments.py tests/test_regression.py tests/test_role_security.py -v

   # Pruebas algorítmicas de estructuras de datos nativas
   python -m unittest test_structures.py -v
   ```

4. **Compilar / Generar APK de Android:**
   ```powershell
   python scripts/build_android_apk.py
   ```

---
*AERO FLOW AIRLINES — Precision in Flight, Elegance in Code.* ✈️
