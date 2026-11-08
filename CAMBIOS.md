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
**Estado:** ⏳ EN COLA (Inicia inmediatamente tras el commit de Fase 0)
