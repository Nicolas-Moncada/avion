-- =============================================================================
--  AERO FLOW AIRLINES — Esquema Supabase (Base de datos compartida)
--  Tablas: perfiles, vuelos, asientos, reservas, pagos
--  RLS por rol: Pasajero, Operador, Integral
--  Trigger: crea perfil siempre como 'pasajero'
-- =============================================================================

-- ---------------------------------------------------------------
-- 1. TABLA perfiles (id = auth.users.id, rol por defecto 'pasajero')
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('pasajero','operador','integral')) DEFAULT 'pasajero',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 2. TABLA vuelos (6 vuelos actuales semilla)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vuelos (
  codigo TEXT PRIMARY KEY,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  tipo_aeronave TEXT NOT NULL,
  duracion_estimada TEXT NOT NULL,
  distancia_km INTEGER NOT NULL,
  fecha_salida DATE NOT NULL,
  hora_salida_12h TEXT NOT NULL,
  hora_llegada_12h TEXT NOT NULL,
  puerta TEXT NOT NULL,
  capacidad_maxima INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Check-in abierto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 3. TABLA asientos (mapa de cabina por vuelo)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asientos (
  id SERIAL PRIMARY KEY,
  vuelo_codigo TEXT NOT NULL REFERENCES vuelos(codigo) ON DELETE CASCADE,
  asiento_id TEXT NOT NULL,
  clase TEXT NOT NULL CHECK (clase IN ('VIP','Estándar')) DEFAULT 'Estándar',
  tarifa_base_cop INTEGER NOT NULL DEFAULT 780000,
  ocupado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vuelo_codigo, asiento_id)
);

-- ---------------------------------------------------------------
-- 4. TABLA reservas (asignación pasajero → asiento en vuelo)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  vuelo_codigo TEXT NOT NULL REFERENCES vuelos(codigo) ON DELETE CASCADE,
  pasajero_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  asiento_id TEXT NOT NULL,
  clase_cabina TEXT NOT NULL DEFAULT 'Estándar',
  tarifa_pagada_cop INTEGER NOT NULL DEFAULT 0,
  hora_checkin TEXT,
  estado_embarque TEXT NOT NULL DEFAULT 'Confirmado' CHECK (estado_embarque IN ('Confirmado','EMBARCADO','ABORDADO','VUELO ANULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vuelo_codigo, asiento_id),
  UNIQUE (vuelo_codigo, pasajero_id)
);

-- ---------------------------------------------------------------
-- 5. TABLA pagos (SOLO estado, monto, moneda, últimos 4 dígitos)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
  id SERIAL PRIMARY KEY,
  reserva_id INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  pasajero_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  monto INTEGER NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'COP',
  ultimos_4 TEXT CHECK (ultimos_4 ~ '^\d{4}$'),
  metodo_pago TEXT NOT NULL DEFAULT 'Tarjeta',
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','reembolsado')),
  referencia_pago TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Índices de rendimiento
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);
CREATE INDEX IF NOT EXISTS idx_vuelos_estado ON vuelos(estado);
CREATE INDEX IF NOT EXISTS idx_asientos_vuelo ON asientos(vuelo_codigo);
CREATE INDEX IF NOT EXISTS idx_reservas_vuelo ON reservas(vuelo_codigo);
CREATE INDEX IF NOT EXISTS idx_reservas_pasajero ON reservas(pasajero_id);
CREATE INDEX IF NOT EXISTS idx_pagos_reserva ON pagos(reserva_id);
CREATE INDEX IF NOT EXISTS idx_pagos_pasajero ON pagos(pasajero_id);

-- ---------------------------------------------------------------
-- 6. TRIGGER: crear perfil siempre como 'pasajero' al registrarse
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_perfil_por_defecto()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, rol, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    'pasajero',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_perfil_por_defecto();

-- ---------------------------------------------------------------
-- 7. DATOS SEMILLA — 6 vuelos actuales
-- ---------------------------------------------------------------
INSERT INTO vuelos (codigo, origen, destino, tipo_aeronave, duracion_estimada, distancia_km, fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima, estado) VALUES
  ('AF1001', 'BOG - Bogotá El Dorado', 'MAD - Madrid Barajas', 'Airbus A319 Corporate', '09h 45m', 8034, CURRENT_DATE, '11:00 AM', '05:45 AM', 'B-01', 26, 'Embarcando'),
  ('AF2020', 'BOG - Bogotá El Dorado', 'MIA - Miami International', 'Airbus A320neo', '04h 10m', 2435, CURRENT_DATE, '01:30 PM', '05:40 PM', 'B-04', 36, 'Check-in abierto'),
  ('AF3022', 'BOG - Bogotá El Dorado', 'JFK - Nueva York John F. Kennedy', 'Boeing 787-8 Dreamliner', '05h 50m', 3995, CURRENT_DATE, '03:15 PM', '09:05 PM', 'A-02', 36, 'Check-in abierto'),
  ('AF4055', 'BOG - Bogotá El Dorado', 'CTG - Cartagena Rafael Núñez', 'Airbus A320neo', '01h 25m', 650, CURRENT_DATE, '05:00 PM', '06:25 PM', 'C-01', 36, 'Check-in abierto'),
  ('AF5088', 'BOG - Bogotá El Dorado', 'MEX - Ciudad de México Benito Juárez', 'Airbus A319 Corporate', '04h 45m', 3160, CURRENT_DATE, '07:30 PM', '12:15 AM', 'B-06', 26, 'Check-in abierto'),
  ('AF6012', 'BOG - Bogotá El Dorado', 'LHR - Londres Heathrow', 'Boeing 777-300ER Flagship', '09h 30m', 8502, CURRENT_DATE, '10:00 PM', '04:30 PM (+1)', 'G-06', 100, 'Check-in abierto')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) en todas las tablas
-- ---------------------------------------------------------------

-- 8.1 perfiles
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perfiles: cualquiera lee su propio perfil" ON perfiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Perfiles: Integral lee todos los perfiles" ON perfiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

CREATE POLICY "Perfiles: solo Integral actualiza roles de otros" ON perfiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

-- Nadie cambia su propio rol
CREATE POLICY "Perfiles: bloquear auto-cambio de rol" ON perfiles
  FOR UPDATE USING (
    NOT (OLD.rol IS DISTINCT FROM NEW.rol AND OLD.id = auth.uid())
  );

-- 8.2 vuelos
ALTER TABLE vuelos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vuelos: lectura pública" ON vuelos
  FOR SELECT USING (true);

CREATE POLICY "Vuelos: Operador e Integral escriben" ON vuelos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('operador','integral'))
  );

-- 8.3 asientos
ALTER TABLE asientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asientos: lectura pública" ON asientos
  FOR SELECT USING (true);

CREATE POLICY "Asientos: Operador e Integral gestionan" ON asientos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('operador','integral'))
  );

-- 8.4 reservas
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reservas: pasajero lee y gestiona SUS reservas" ON reservas
  FOR ALL USING (
    pasajero_id = auth.uid()
  );

CREATE POLICY "Reservas: Operador lee todas" ON reservas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'operador')
  );

CREATE POLICY "Reservas: Integral lee y gestiona todas" ON reservas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

-- 8.5 pagos
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pagos: pasajero lee y gestiona SUS pagos" ON pagos
  FOR ALL USING (
    pasajero_id = auth.uid()
  );

CREATE POLICY "Pagos: Integral lee todos los pagos" ON pagos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

-- Operador NO tiene acceso a pagos (sin política para operador en pagos)

-- ---------------------------------------------------------------
-- Fin del esquema
-- =============================================================================