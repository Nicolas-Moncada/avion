/**
 * AERO FLOW AIRLINES — Client Configuration & Supabase Connection (v35.0)
 * La URL y la Anon Key de Supabase son públicas por diseño de cliente (arquitectura JAMstack).
 * La seguridad e integridad total de los datos reside en las Políticas RLS (Row Level Security)
 * de PostgreSQL en supabase/schema.sql. NUNCA utilizar la 'service_role' key en el frontend.
 */

(function () {
  'use strict';

  // Configuración base de Supabase
  // Reemplaza estos valores con la URL y la Anon Key de tu proyecto en https://app.supabase.com
  const DEFAULT_SUPABASE_URL = 'https://PEGA_AQUI_TU_PROYECTO.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY = 'PEGA_AQUI_TU_ANON_KEY';

  // Permitir sobreescritura dinámica desde localStorage (útil para pruebas inmediatas en el navegador)
  let storedUrl = '';
  let storedKey = '';
  try {
    storedUrl = localStorage.getItem('aeroflow_sb_url') || '';
    storedKey = localStorage.getItem('aeroflow_sb_key') || '';
  } catch (e) {}

  const activeUrl = storedUrl || (window.ENV_SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const activeAnonKey = storedKey || (window.ENV_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY);

  // Verificar si la URL configurada es real y válida
  const isConfigured = Boolean(
    activeUrl &&
    activeAnonKey &&
    !activeUrl.includes('PEGA_AQUI') &&
    !activeUrl.includes('[PEGA_AQUÍ]') &&
    activeUrl.startsWith('https://') &&
    activeAnonKey.length > 20
  );

  window.AEROFLOW_CONFIG = {
    SUPABASE_URL: activeUrl,
    SUPABASE_ANON_KEY: activeAnonKey,
    IS_CONFIGURED: isConfigured,
    
    // Método para actualizar credenciales de Supabase en caliente desde la interfaz
    guardarCredenciales: function (url, anonKey) {
      if (!url || !anonKey) return false;
      try {
        localStorage.setItem('aeroflow_sb_url', url.trim());
        localStorage.setItem('aeroflow_sb_key', anonKey.trim());
        window.location.reload();
        return true;
      } catch (err) {
        console.error('Error guardando credenciales en localStorage:', err);
        return false;
      }
    },

    limpiarCredenciales: function () {
      try {
        localStorage.removeItem('aeroflow_sb_url');
        localStorage.removeItem('aeroflow_sb_key');
        window.location.reload();
      } catch (e) {}
    }
  };

  console.log(
    `[AeroFlow] Configuración Supabase cargada. Estado: ${isConfigured ? '✅ Conectado a la nube' : '⚠️ Requiere credenciales reales en js/config.js'}`
  );
})();

