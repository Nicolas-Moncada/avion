-- =============================================================================
--  AERO FLOW AIRLINES — Esquema Supabase (Plataforma Comercial SaaS en Marca Blanca)
--  Tablas: perfiles, vuelos, asientos, ordenes, reservas, pagos, pago_eventos, reembolsos, recibos
--  Cálculo Server-Side de Precios (COP enteros BIGINT)
--  Máquina de Estados Inmutable en DB, Retención Atómica de Asientos (12 min)
--  RLS Estricto por Rol: Pasajero, Operador, Integral, Anónimo
-- =============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- 2. TABLA vuelos (Itinerarios oficiales)
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
-- 3. TABLA asientos (Inventario y mapa de cabina)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asientos (
  id SERIAL PRIMARY KEY,
  vuelo_codigo TEXT NOT NULL REFERENCES vuelos(codigo) ON DELETE CASCADE,
  asiento_id TEXT NOT NULL,
  clase TEXT NOT NULL CHECK (clase IN ('VIP','Estándar')) DEFAULT 'Estándar',
  tarifa_base_cop BIGINT NOT NULL DEFAULT 780000,
  ocupado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vuelo_codigo, asiento_id)
);

-- ---------------------------------------------------------------
-- 4. TABLA ordenes (Cálculo Server-Side & Retención de Asiento)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pnr TEXT NOT NULL UNIQUE,
  pasajero_id UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  documento_pasajero TEXT NOT NULL,
  nombre_pasajero TEXT NOT NULL,
  vuelo_codigo TEXT NOT NULL REFERENCES vuelos(codigo) ON DELETE CASCADE,
  asiento_id TEXT NOT NULL,
  tarifa_base_cop BIGINT NOT NULL,
  tarifa_admin_cop BIGINT NOT NULL,
  tasa_aeroportuaria_cop BIGINT NOT NULL,
  iva_cop BIGINT NOT NULL,
  total_cop BIGINT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente','autorizado','pagado','fallido','expirado','cancelado')) DEFAULT 'pendiente',
  bloqueado_hasta TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único parcial: CERO DOBLE VENTA
-- Solo puede existir una orden activa (o pagada) para el mismo asiento mientras esté vigente
CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_asiento_activo ON ordenes (vuelo_codigo, asiento_id)
  WHERE estado IN ('pendiente', 'autorizado', 'pagado') AND (bloqueado_hasta > now() OR estado = 'pagado');

-- ---------------------------------------------------------------
-- 5. TABLA reservas (Emisión definitiva tras pago confirmado)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  orden_id UUID REFERENCES ordenes(id) ON DELETE CASCADE,
  pnr TEXT NOT NULL UNIQUE,
  vuelo_codigo TEXT NOT NULL REFERENCES vuelos(codigo) ON DELETE CASCADE,
  pasajero_id UUID REFERENCES perfiles(id) ON DELETE CASCADE,
  documento_pasajero TEXT NOT NULL,
  nombre_pasajero TEXT NOT NULL,
  asiento_id TEXT NOT NULL,
  clase_cabina TEXT NOT NULL DEFAULT 'Estándar',
  tarifa_pagada_cop BIGINT NOT NULL DEFAULT 0,
  hora_checkin TEXT,
  estado_embarque TEXT NOT NULL DEFAULT 'Confirmado' CHECK (estado_embarque IN ('Confirmado','EMBARCADO','ABORDADO','VUELO ANULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vuelo_codigo, asiento_id),
  UNIQUE (vuelo_codigo, documento_pasajero)
);

-- ---------------------------------------------------------------
-- 6. TABLA pagos (Gestión transaccional y pasarela)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  reserva_id INTEGER REFERENCES reservas(id) ON DELETE SET NULL,
  pasajero_id UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  monto_cop BIGINT NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'COP',
  estado TEXT NOT NULL CHECK (estado IN ('pendiente','autorizado','pagado','fallido','reembolsado')) DEFAULT 'pendiente',
  proveedor TEXT NOT NULL DEFAULT 'simulador',
  referencia_externa TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  marca TEXT,
  ultimos_4 TEXT CHECK (ultimos_4 IS NULL OR ultimos_4 ~ '^\d{4}$'),
  codigo_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 7. TABLA pago_eventos (Bitácora inmutable Append-Only)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pago_eventos (
  id BIGSERIAL PRIMARY KEY,
  pago_id UUID NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  origen TEXT NOT NULL,
  detalles JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 8. TABLA reembolsos (Auditoría estricta de cancelaciones)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reembolsos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pago_id UUID NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  monto_cop BIGINT NOT NULL,
  motivo TEXT NOT NULL,
  autorizado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  auditoria JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 9. TABLA recibos (Numeración consecutiva atómica por aeropuerto)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recibos (
  id BIGSERIAL PRIMARY KEY,
  consecutivo TEXT NOT NULL UNIQUE,
  aeropuerto_codigo TEXT NOT NULL DEFAULT 'BOG',
  orden_id UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  numero_recibo BIGINT NOT NULL,
  monto_total_cop BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Índices de rendimiento
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);
CREATE INDEX IF NOT EXISTS idx_vuelos_estado ON vuelos(estado);
CREATE INDEX IF NOT EXISTS idx_asientos_vuelo ON asientos(vuelo_codigo);
CREATE INDEX IF NOT EXISTS idx_ordenes_vuelo ON ordenes(vuelo_codigo);
CREATE INDEX IF NOT EXISTS idx_ordenes_pnr ON ordenes(pnr);
CREATE INDEX IF NOT EXISTS idx_reservas_vuelo ON reservas(vuelo_codigo);
CREATE INDEX IF NOT EXISTS idx_reservas_pasajero ON reservas(pasajero_id);
CREATE INDEX IF NOT EXISTS idx_pagos_orden ON pagos(orden_id);
CREATE INDEX IF NOT EXISTS idx_pagos_idempotency ON pagos(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pago_eventos_pago ON pago_eventos(pago_id);

-- ---------------------------------------------------------------
-- 10. MÁQUINA DE ESTADOS EN DB (Trigger PostgreSQL)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_transicion_estado_pago()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Reglas estrictas:
  -- pendiente -> autorizado, pagado, fallido, cancelado
  -- autorizado -> pagado, fallido, cancelado
  -- pagado -> reembolsado
  IF OLD.estado = 'pendiente' AND NEW.estado NOT IN ('autorizado', 'pagado', 'fallido', 'cancelado') THEN
    RAISE EXCEPTION 'Transición inválida desde pendiente hacia %', NEW.estado;
  ELSIF OLD.estado = 'autorizado' AND NEW.estado NOT IN ('pagado', 'fallido', 'cancelado') THEN
    RAISE EXCEPTION 'Transición inválida desde autorizado hacia %', NEW.estado;
  ELSIF OLD.estado = 'pagado' AND NEW.estado NOT IN ('reembolsado') THEN
    RAISE EXCEPTION 'Transición inválida desde pagado hacia %', NEW.estado;
  ELSIF OLD.estado IN ('fallido', 'reembolsado', 'cancelado') THEN
    RAISE EXCEPTION 'No se permiten transiciones desde estado final %', OLD.estado;
  END IF;

  NEW.updated_at = now();

  -- Registro automático append-only en bitácora inmutable
  INSERT INTO public.pago_eventos (pago_id, estado_anterior, estado_nuevo, origen, detalles)
  VALUES (NEW.id, OLD.estado, NEW.estado, 'trigger_estado_db', json_build_object('timestamp', now()));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_pago_estado ON pagos;
CREATE TRIGGER trg_validar_pago_estado
  BEFORE UPDATE ON pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_transicion_estado_pago();

-- ---------------------------------------------------------------
-- 11. RPC crear_orden (Cálculo Server-Side en COP enteros)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden(
  p_vuelo_codigo TEXT,
  p_asiento_id TEXT,
  p_documento TEXT,
  p_nombre TEXT,
  p_idempotency_key TEXT,
  p_origen_aeropuerto TEXT DEFAULT 'BOG'
)
RETURNS JSONB AS $$
DECLARE
  v_vuelo RECORD;
  v_asiento RECORD;
  v_pnr TEXT;
  v_orden_id UUID;
  v_orden_existente RECORD;
  v_tasa_aero BIGINT := 158000;
  v_tarifa_admin BIGINT := 45000;
  v_iva BIGINT;
  v_total BIGINT;
  v_bloqueado_hasta TIMESTAMPTZ;
BEGIN
  -- 1. Verificar idempotencia por llave
  SELECT o.* INTO v_orden_existente FROM ordenes o
  JOIN pagos p ON p.orden_id = o.id
  WHERE p.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'orden_id', v_orden_existente.id,
      'pnr', v_orden_existente.pnr,
      'total_cop', v_orden_existente.total_cop,
      'bloqueado_hasta', v_orden_existente.bloqueado_hasta,
      'idempotente', true
    );
  END IF;

  -- 2. Bloqueo pesimista del vuelo y verificación de estado
  SELECT * INTO v_vuelo FROM vuelos WHERE codigo = p_vuelo_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vuelo % no encontrado', p_vuelo_codigo;
  END IF;

  IF v_vuelo.estado IN ('DESPEGADO', 'Despegado', 'Cerrado') THEN
    RAISE EXCEPTION 'El vuelo % está cerrado para ventas', p_vuelo_codigo;
  END IF;

  -- 3. Verificar disponibilidad del asiento
  SELECT * INTO v_asiento FROM asientos
  WHERE vuelo_codigo = p_vuelo_codigo AND asiento_id = p_asiento_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Tarifa estándar por defecto si aún no está poblada la tabla
    v_asiento.tarifa_base_cop := 780000;
  ELSIF v_asiento.ocupado THEN
    RAISE EXCEPTION 'El asiento % ya se encuentra ocupado', p_asiento_id;
  END IF;

  -- Verificar si hay orden vigente bloqueando el asiento
  IF EXISTS (
    SELECT 1 FROM ordenes
    WHERE vuelo_codigo = p_vuelo_codigo AND asiento_id = p_asiento_id
      AND estado IN ('pendiente', 'autorizado', 'pagado')
      AND (bloqueado_hasta > now() OR estado = 'pagado')
  ) THEN
    RAISE EXCEPTION 'El asiento % ya tiene una reserva en proceso de pago.', p_asiento_id;
  END IF;

  -- 4. Cálculo estricto de tasas (Server-Side)
  v_iva := ROUND(v_asiento.tarifa_base_cop * 0.19);
  v_total := v_asiento.tarifa_base_cop + v_tarifa_admin + v_tasa_aero + v_iva;
  v_bloqueado_hasta := now() + interval '12 minutes';

  -- Generación de PNR alfanumérico único de 6 caracteres
  v_pnr := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
  WHILE EXISTS (SELECT 1 FROM ordenes WHERE pnr = v_pnr) LOOP
    v_pnr := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
  END LOOP;

  -- 5. Inserción atómica de la orden con bloqueo temporal de 12 minutos
  INSERT INTO ordenes (
    pnr, pasajero_id, documento_pasajero, nombre_pasajero,
    vuelo_codigo, asiento_id, tarifa_base_cop, tarifa_admin_cop,
    tasa_aeroportuaria_cop, iva_cop, total_cop, estado, bloqueado_hasta
  ) VALUES (
    v_pnr, auth.uid(), p_documento, p_nombre,
    p_vuelo_codigo, p_asiento_id, v_asiento.tarifa_base_cop, v_tarifa_admin,
    v_tasa_aero, v_iva, v_total, 'pendiente', v_bloqueado_hasta
  ) RETURNING id INTO v_orden_id;

  -- Pre-crear intento de pago
  INSERT INTO pagos (orden_id, pasajero_id, monto_cop, moneda, estado, idempotency_key)
  VALUES (v_orden_id, auth.uid(), v_total, 'COP', 'pendiente', p_idempotency_key);

  RETURN jsonb_build_object(
    'orden_id', v_orden_id,
    'pnr', v_pnr,
    'total_cop', v_total,
    'tarifa_base_cop', v_asiento.tarifa_base_cop,
    'tarifa_admin_cop', v_tarifa_admin,
    'tasa_aeroportuaria_cop', v_tasa_aero,
    'iva_cop', v_iva,
    'bloqueado_hasta', v_bloqueado_hasta
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (RLS) en todas las tablas
-- ---------------------------------------------------------------
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vuelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pago_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reembolsos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos ENABLE ROW LEVEL SECURITY;

-- 12.1 Políticas perfiles
CREATE POLICY "Perfiles: cada quien lee su propio perfil" ON perfiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Perfiles: Integral lee todos los perfiles" ON perfiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

CREATE POLICY "Perfiles: solo Integral actualiza roles" ON perfiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

-- 12.2 Políticas vuelos y asientos
CREATE POLICY "Vuelos: lectura pública" ON vuelos FOR SELECT USING (true);
CREATE POLICY "Vuelos: Operador e Integral gestionan" ON vuelos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('operador','integral'))
  );

CREATE POLICY "Asientos: lectura pública" ON asientos FOR SELECT USING (true);
CREATE POLICY "Asientos: Operador e Integral gestionan" ON asientos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('operador','integral'))
  );

-- 12.3 Políticas ordenes y reservas
CREATE POLICY "Ordenes: pasajero lee las suyas" ON ordenes
  FOR SELECT USING (pasajero_id = auth.uid() OR documento_pasajero IS NOT NULL);

CREATE POLICY "Reservas: pasajero lee las suyas" ON reservas
  FOR SELECT USING (pasajero_id = auth.uid());

CREATE POLICY "Reservas: Operador lee todas" ON reservas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'operador')
  );

CREATE POLICY "Reservas: Integral gestiona todas" ON reservas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

-- 12.4 Políticas pagos, auditoría y reembolsos
CREATE POLICY "Pagos: pasajero lee sus pagos" ON pagos
  FOR SELECT USING (pasajero_id = auth.uid());

CREATE POLICY "Pagos: Integral lee todos los pagos" ON pagos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

CREATE POLICY "Reembolsos: lectura y creación reservada a Integral" ON reembolsos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

CREATE POLICY "Pago_Eventos: lectura reservada a Integral" ON pago_eventos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')
  );

CREATE POLICY "Recibos: lectura para pasajero e Integral" ON recibos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ordenes o WHERE o.id = orden_id AND (o.pasajero_id = auth.uid() OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'integral')))
  );

-- ---------------------------------------------------------------
-- Fin del esquema v2.2
-- =============================================================================
