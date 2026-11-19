"""
=============================================================================
  Database Manager — Capa de Persistencia SQLite (AERO FLOW AIRLINES)
  Precios en COP, rutas Avianca/AERO FLOW y horarios 12h AM/PM.
  Semilla limpia: 1 Vuelo Activo de Prueba con 26 Pasajeros y Pagos Registrados.
=============================================================================
"""

import sqlite3
import os
import sys
import uuid
import time
import json
from datetime import datetime, timedelta
from typing import Tuple, Dict, Any, Optional
from data_structures.hash_map import TablaHashVuelos
from data_structures.avl_tree import ArbolAVLPasajeros
from data_structures.linked_list import ListaEnlazadaManifiesto
from data_structures.fifo_queue import ColaFIFO
from fleet_catalog import obtener_configuracion_aeronave
import airport_config
import payments.adapter as pm_adapter

try:
    from werkzeug.security import generate_password_hash, check_password_hash
except ImportError:
    import hashlib
    def generate_password_hash(p: str) -> str:
        return "sha256$" + hashlib.sha256(p.encode("utf-8")).hexdigest()
    def check_password_hash(p_hash: str, p: str) -> bool:
        if p_hash.startswith("sha256$"):
            return p_hash == ("sha256$" + hashlib.sha256(p.encode("utf-8")).hexdigest())
        return p_hash == p

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.abspath(
    os.getenv('AEROFLOW_DB_PATH') or os.path.join(BASE_DIR, 'aerocore.db')
)

def get_connection():
    connection = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL;")
    connection.execute("PRAGMA synchronous=NORMAL;")
    connection.execute("PRAGMA busy_timeout=30000;")
    connection.execute("PRAGMA foreign_keys=ON;")
    return connection

def intentar_conexion_mysql() -> str:
    """
    Verifica compatibilidad con motor MySQL (XAMPP InnoDB).
    Si MySQL no se encuentra activo o no hay controladores disponibles,
    procede de forma silenciosa y confiable con SQLite WAL (aerocore.db).
    """
    for driver in ('pymysql', 'mysql.connector'):
        try:
            mod = __import__(driver)
            break
        except ImportError:
            pass
    return "sqlite"

def _crear_indices(cursor):
    """Crea índices de rendimiento e integridad (idempotente).

    Antes de crear los índices únicos depura posibles duplicados
    heredados conservando siempre el registro más antiguo.
    """
    cursor.execute("""
        DELETE FROM manifiesto WHERE id NOT IN (
            SELECT MIN(id) FROM manifiesto GROUP BY vuelo_codigo, pasajero_doc
        );
    """)
    cursor.execute("""
        DELETE FROM manifiesto WHERE id NOT IN (
            SELECT MIN(id) FROM manifiesto GROUP BY vuelo_codigo, asiento
        );
    """)
    cursor.execute("""
        DELETE FROM cola_standby WHERE id NOT IN (
            SELECT MIN(id) FROM cola_standby GROUP BY vuelo_codigo, pasajero_doc
        );
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_manifiesto_vuelo_pasajero
        ON manifiesto(vuelo_codigo, pasajero_doc);
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_manifiesto_asiento
        ON manifiesto(vuelo_codigo, asiento);
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_standby_vuelo_pasajero
        ON cola_standby(vuelo_codigo, pasajero_doc);
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_manifiesto_pasajero ON manifiesto(pasajero_doc);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_vuelo ON pasajeros_recientes_pagos(vuelo_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_documento ON pasajeros_recientes_pagos(documento);")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_pnr ON ordenes(pnr);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ordenes_asiento ON ordenes(vuelo_codigo, asiento_id);")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_idempotency ON pagos(idempotency_key);")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_recibos_consecutivo ON recibos(consecutivo);")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);")


def _sembrar_usuarios_demo(cursor):
    """Siembra los usuarios maestros por defecto si no existen."""
    usuarios_base = [
        ("usr-adm-001", "Administrador General", "admin@aeroflow.com", "Admin123", "admin"),
        ("usr-pax-001", "Carlos Mendoza", "pasajero@aeroflow.com", "Pasajero123", "pasajero"),
        ("usr-int-001", "Administrador Integral", "integral@aeroflow.com", "Integral123", "admin"),
    ]
    for uid, nombre, email, password, rol in usuarios_base:
        cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email.lower(),))
        if not cursor.fetchone():
            p_hash = generate_password_hash(password)
            cursor.execute(
                "INSERT INTO usuarios (id, nombre, email, password_hash, rol) VALUES (?, ?, ?, ?, ?)",
                (uid, nombre, email.lower(), p_hash, rol)
            )


_in_init_db = False


def init_db():
    global _in_init_db
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS vuelos (
                codigo TEXT PRIMARY KEY,
                origen TEXT NOT NULL,
                destino TEXT NOT NULL,
                tipo_aeronave TEXT NOT NULL,
                duracion_estimada TEXT NOT NULL,
                distancia_km INTEGER NOT NULL,
                fecha_salida TEXT NOT NULL,
                hora_salida_12h TEXT NOT NULL,
                hora_llegada_12h TEXT NOT NULL,
                puerta TEXT NOT NULL,
                capacidad_maxima INTEGER NOT NULL,
                estado TEXT NOT NULL,
                imagen_url TEXT DEFAULT '',
                precio_base_cop INTEGER DEFAULT 82000,
                categoria TEXT DEFAULT 'ciudad',
                tag_destacado TEXT DEFAULT ''
            );
            """)

            cursor.execute("PRAGMA table_info(vuelos)")
            cols_vuelos = {row[1] for row in cursor.fetchall()}
            if "imagen_url" not in cols_vuelos:
                cursor.execute("ALTER TABLE vuelos ADD COLUMN imagen_url TEXT DEFAULT ''")
            if "precio_base_cop" not in cols_vuelos:
                cursor.execute("ALTER TABLE vuelos ADD COLUMN precio_base_cop INTEGER DEFAULT 82000")
            if "categoria" not in cols_vuelos:
                cursor.execute("ALTER TABLE vuelos ADD COLUMN categoria TEXT DEFAULT 'ciudad'")
            if "tag_destacado" not in cols_vuelos:
                cursor.execute("ALTER TABLE vuelos ADD COLUMN tag_destacado TEXT DEFAULT ''")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pasajeros (
                documento TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                nacionalidad TEXT NOT NULL,
                categoria_viajero TEXT NOT NULL,
                vuelo_asignado TEXT
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS manifiesto (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vuelo_codigo TEXT NOT NULL,
                pasajero_doc TEXT NOT NULL,
                pasajero_nombre TEXT NOT NULL,
                asiento TEXT NOT NULL,
                hora_checkin_12h TEXT NOT NULL,
                categoria TEXT NOT NULL,
                clase_cabina TEXT NOT NULL,
                tarifa_pagada_cop REAL NOT NULL,
                estado_embarque TEXT DEFAULT 'Confirmado',
                FOREIGN KEY (vuelo_codigo) REFERENCES vuelos(codigo),
                FOREIGN KEY (pasajero_doc) REFERENCES pasajeros(documento)
            );
            """)
            cursor.execute("PRAGMA table_info(manifiesto);")
            cols_manifiesto = {row[1] for row in cursor.fetchall()}
            if "estado_embarque" not in cols_manifiesto:
                cursor.execute("ALTER TABLE manifiesto ADD COLUMN estado_embarque TEXT DEFAULT 'Confirmado'")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS cola_standby (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vuelo_codigo TEXT NOT NULL,
                pasajero_doc TEXT NOT NULL,
                pasajero_nombre TEXT NOT NULL,
                categoria TEXT NOT NULL,
                hora_ingreso_12h TEXT NOT NULL,
                FOREIGN KEY (vuelo_codigo) REFERENCES vuelos(codigo),
                FOREIGN KEY (pasajero_doc) REFERENCES pasajeros(documento)
            );
            """)

            # Migración/limpieza: purgar tabla residual antigua 'lista_espera' si existe
            cursor.execute("DROP TABLE IF EXISTS lista_espera;")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pasajeros_recientes_pagos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documento TEXT NOT NULL,
                nombre_completo TEXT NOT NULL,
                nacionalidad TEXT NOT NULL,
                categoria TEXT NOT NULL,
                vuelo_id TEXT NOT NULL,
                origen_destino TEXT NOT NULL,
                asiento TEXT NOT NULL,
                metodo_pago TEXT NOT NULL,
                monto_cop REAL NOT NULL,
                referencia_pago TEXT NOT NULL,
                estado_embarque TEXT NOT NULL,
                fecha_hora_registro TEXT NOT NULL
            );
            """)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS ordenes (
                id TEXT PRIMARY KEY,
                pnr TEXT NOT NULL UNIQUE,
                vuelo_codigo TEXT NOT NULL,
                asiento_id TEXT NOT NULL,
                documento_pasajero TEXT NOT NULL,
                nombre_pasajero TEXT NOT NULL,
                tarifa_base_cop INTEGER NOT NULL,
                tarifa_admin_cop INTEGER NOT NULL,
                tasa_aeroportuaria_cop INTEGER NOT NULL,
                iva_cop INTEGER NOT NULL,
                total_cop INTEGER NOT NULL,
                estado TEXT NOT NULL DEFAULT 'pendiente',
                bloqueado_hasta INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pagos (
                id TEXT PRIMARY KEY,
                orden_id TEXT NOT NULL,
                monto_cop INTEGER NOT NULL,
                moneda TEXT NOT NULL DEFAULT 'COP',
                estado TEXT NOT NULL DEFAULT 'pendiente',
                proveedor TEXT NOT NULL DEFAULT 'simulador',
                referencia_externa TEXT,
                idempotency_key TEXT NOT NULL UNIQUE,
                marca TEXT,
                ultimos_4 TEXT,
                codigo_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (orden_id) REFERENCES ordenes(id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pago_eventos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pago_id TEXT NOT NULL,
                estado_anterior TEXT,
                estado_nuevo TEXT NOT NULL,
                origen TEXT NOT NULL,
                detalles TEXT,
                created_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS reembolsos (
                id TEXT PRIMARY KEY,
                pago_id TEXT NOT NULL,
                orden_id TEXT NOT NULL,
                monto_cop INTEGER NOT NULL,
                motivo TEXT NOT NULL,
                autorizado_por TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS recibos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutivo TEXT NOT NULL UNIQUE,
                aeropuerto_codigo TEXT NOT NULL,
                orden_id TEXT NOT NULL,
                pnr TEXT NOT NULL,
                monto_total_cop INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'pasajero',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
            _sembrar_usuarios_demo(cursor)
            _crear_indices(cursor)

            # Sincronizar registros huérfanos en pasajeros_recientes_pagos que ya fueron eliminados de manifiesto
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = 'CANCELADO'
                WHERE UPPER(estado_embarque) NOT IN ('CANCELADO', 'EN ESPERA (STANDBY)')
                  AND NOT EXISTS (
                      SELECT 1 FROM manifiesto m
                      WHERE UPPER(m.vuelo_codigo) = UPPER(pasajeros_recientes_pagos.vuelo_id)
                        AND m.pasajero_doc = pasajeros_recientes_pagos.documento
                  )
                  AND EXISTS (
                      SELECT 1 FROM vuelos v
                      WHERE UPPER(v.codigo) = UPPER(pasajeros_recientes_pagos.vuelo_id)
                        AND v.estado NOT IN ('DESPEGADO', 'Despegado', 'Cerrado')
                  )
            """)
    finally:
        conn.close()

    # Auto-seeding inteligente: si la BD está vacía o con todos los vuelos cancelados/expirados
    if not _in_init_db:
        _in_init_db = True
        try:
            if _base_de_datos_vacia():
                reiniciar_semilla_limpia()
        finally:
            _in_init_db = False

def hydratar_memoria() -> Tuple[TablaHashVuelos, ArbolAVLPasajeros, dict[str, ListaEnlazadaManifiesto], dict[str, ColaFIFO], dict[str, ColaFIFO]]:
    init_db()
    tabla_vuelos = TablaHashVuelos()
    arbol_pasajeros = ArbolAVLPasajeros()
    manifiestos: dict[str, ListaEnlazadaManifiesto] = {}
    colas_standby: dict[str, ColaFIFO] = {}
    colas_embarque: dict[str, ColaFIFO] = {}

    conn = get_connection()
    cursor = conn.cursor()

    # 1. Cargar Vuelos en Hash Map
    cursor.execute("SELECT * FROM vuelos")
    for row in cursor.fetchall():
        v = dict(row)
        c = v['codigo']
        tabla_vuelos.insertar(c, v)
        manifiestos[c] = ListaEnlazadaManifiesto()
        colas_standby[c] = ColaFIFO()
        colas_embarque[c] = ColaFIFO()

    # 2. Cargar Pasajeros en AVL
    cursor.execute("SELECT * FROM pasajeros")
    for row in cursor.fetchall():
        p = dict(row)
        arbol_pasajeros.insertar(
            documento=p['documento'],
            nombre=p['nombre'],
            nacionalidad=p['nacionalidad'],
            categoria_viajero=p['categoria_viajero']
        )
        if p.get('vuelo_asignado'):
            arbol_pasajeros.actualizar_vuelo(p['documento'], p['vuelo_asignado'])

    # 3. Cargar Manifiestos en Lista Enlazada
    cursor.execute("SELECT * FROM manifiesto ORDER BY id ASC")
    for row in cursor.fetchall():
        m = dict(row)
        v_cod = m['vuelo_codigo']
        if v_cod in manifiestos:
            manifiestos[v_cod].insertar_al_final(
                pasajero_doc=m['pasajero_doc'],
                pasajero_nombre=m['pasajero_nombre'],
                asiento=m['asiento'],
                hora_checkin=m['hora_checkin_12h'],
                categoria=m['categoria'],
                clase_cabina=m.get('clase_cabina', 'Estándar'),
                tarifa_pagada=int(round(float(m.get('tarifa_pagada_cop', 780000))))
            )

    # 4. Cargar Colas Standby FIFO
    cursor.execute("SELECT * FROM cola_standby ORDER BY id ASC")
    for row in cursor.fetchall():
        s = dict(row)
        v_cod = s['vuelo_codigo']
        if v_cod in colas_standby:
            colas_standby[v_cod].encolar(
                pasajero_doc=s['pasajero_doc'],
                pasajero_nombre=s['pasajero_nombre'],
                categoria=s['categoria'],
                hora_ingreso=s['hora_ingreso_12h']
            )

    conn.close()
    return tabla_vuelos, arbol_pasajeros, manifiestos, colas_standby, colas_embarque

def persistir_vuelo(v: dict):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO vuelos (codigo, origen, destino, tipo_aeronave, duracion_estimada, distancia_km,
                                    fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima, estado,
                                    imagen_url, precio_base_cop, categoria, tag_destacado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(codigo) DO UPDATE SET
                    origen=excluded.origen,
                    destino=excluded.destino,
                    tipo_aeronave=excluded.tipo_aeronave,
                    duracion_estimada=excluded.duracion_estimada,
                    distancia_km=excluded.distancia_km,
                    fecha_salida=excluded.fecha_salida,
                    hora_salida_12h=excluded.hora_salida_12h,
                    hora_llegada_12h=excluded.hora_llegada_12h,
                    puerta=excluded.puerta,
                    capacidad_maxima=excluded.capacidad_maxima,
                    estado=excluded.estado,
                    imagen_url=coalesce(nullif(excluded.imagen_url, ''), vuelos.imagen_url),
                    precio_base_cop=coalesce(nullif(excluded.precio_base_cop, 0), vuelos.precio_base_cop),
                    categoria=coalesce(nullif(excluded.categoria, ''), vuelos.categoria),
                    tag_destacado=coalesce(nullif(excluded.tag_destacado, ''), vuelos.tag_destacado)
            """, (
                str(v['codigo']).strip().upper(),
                v.get('origen') or 'BOG - Bogotá El Dorado',
                str(v['destino']).strip(),
                v.get('tipo_aeronave') or 'Airbus A319 Corporate',
                v.get('duracion_estimada') or '09h 45m',
                int(v.get('distancia_km') or 8034),
                v.get('fecha_salida') or '2026-10-22',
                v.get('hora_salida_12h') or '11:00 AM',
                v.get('hora_llegada_12h') or '05:45 AM',
                v.get('puerta') or 'B-01',
                int(v.get('capacidad_maxima') or 26),
                v.get('estado') or 'Check-in abierto',
                v.get('imagen_url') or '',
                int(v.get('precio_base_cop') or 82000),
                v.get('categoria') or 'ciudad',
                v.get('tag_destacado') or ''
            ))
            conn.commit()
    finally:
        conn.close()

def persistir_pasajero(p: dict):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO pasajeros (documento, nombre, nacionalidad, categoria_viajero, vuelo_asignado)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(documento) DO UPDATE SET
                    nombre=excluded.nombre,
                    nacionalidad=excluded.nacionalidad,
                    categoria_viajero=excluded.categoria_viajero,
                    vuelo_asignado=excluded.vuelo_asignado
            """, (
                str(p['documento']).strip(),
                str(p['nombre']).strip(),
                p.get('nacionalidad') or 'Colombia',
                p.get('categoria_viajero') or 'Estándar',
                p.get('vuelo_asignado') or None
            ))
            conn.commit()
    finally:
        conn.close()

def persistir_checkin(vuelo_codigo: str, nodo_dict: dict):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO manifiesto (vuelo_codigo, pasajero_doc, pasajero_nombre, asiento,
                                        hora_checkin_12h, categoria, clase_cabina, tarifa_pagada_cop)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(vuelo_codigo).strip().upper(),
                str(nodo_dict['pasajero_doc']).strip(),
                str(nodo_dict['pasajero_nombre']).strip(),
                str(nodo_dict['asiento']).strip(),
                nodo_dict.get('hora_checkin_12h') or nodo_dict.get('hora_checkin') or '12:00 PM',
                nodo_dict.get('categoria') or 'Estándar',
                nodo_dict.get('clase_cabina') or 'Estándar',
                int(round(float(nodo_dict.get('tarifa_pagada_cop') or nodo_dict.get('tarifa_pagada') or 780000)))
            ))
            cursor.execute("UPDATE pasajeros SET vuelo_asignado = ? WHERE documento = ?", (
                str(vuelo_codigo).strip().upper(),
                str(nodo_dict['pasajero_doc']).strip()
            ))
            conn.commit()
    finally:
        conn.close()

def eliminar_checkin_persistido(vuelo_codigo: str, pasajero_doc: str):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            v_cod = str(vuelo_codigo).strip().upper()
            p_doc = str(pasajero_doc).strip()
            cursor.execute("""
                DELETE FROM manifiesto WHERE UPPER(vuelo_codigo) = ? AND pasajero_doc = ?
            """, (v_cod, p_doc))
            cursor.execute("UPDATE pasajeros SET vuelo_asignado = NULL WHERE documento = ?", (p_doc,))
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = 'CANCELADO'
                WHERE UPPER(vuelo_id) = ? AND documento = ?
            """, (v_cod, p_doc))
            conn.commit()
    finally:
        conn.close()

def eliminar_pasajero_total(documento: str):
    """
    Elimina por completo a un pasajero de la base de datos de forma atómica:
    1. Si tiene asiento asignado en manifiesto, lo elimina de manifiesto.
    2. Si está en cola_standby o lista_espera, lo elimina.
    3. Elimina sus registros de pasajeros_recientes_pagos.
    4. Elimina de la tabla pasajeros.
    Retorna el código de vuelo asignado si lo tenía y el asiento liberado.
    """
    conn = get_connection()
    vuelo_asignado = None
    asiento_asignado = None
    try:
        with conn:
            cursor = conn.cursor()
            doc = str(documento).strip()

            cursor.execute("SELECT vuelo_asignado FROM pasajeros WHERE documento = ?", (doc,))
            row = cursor.fetchone()
            if row and row['vuelo_asignado']:
                vuelo_asignado = row['vuelo_asignado']

            cursor.execute("SELECT vuelo_codigo, asiento FROM manifiesto WHERE pasajero_doc = ?", (doc,))
            m_row = cursor.fetchone()
            if m_row:
                vuelo_asignado = vuelo_asignado or m_row['vuelo_codigo']
                asiento_asignado = m_row['asiento']

            cursor.execute("DELETE FROM manifiesto WHERE pasajero_doc = ?", (doc,))
            cursor.execute("DELETE FROM cola_standby WHERE pasajero_doc = ?", (doc,))
            cursor.execute("DELETE FROM pasajeros_recientes_pagos WHERE documento = ?", (doc,))
            cursor.execute("DELETE FROM pasajeros WHERE documento = ?", (doc,))

            conn.commit()
            return vuelo_asignado, asiento_asignado
    finally:
        conn.close()

def persistir_standby(vuelo_codigo: str, nodo_dict: dict):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            v_cod = str(vuelo_codigo).strip().upper()
            p_doc = str(nodo_dict['pasajero_doc']).strip()
            p_nom = str(nodo_dict['pasajero_nombre']).strip()
            p_cat = nodo_dict.get('categoria') or 'Estándar'
            p_hora = nodo_dict.get('hora_ingreso_12h') or nodo_dict.get('hora_ingreso') or '12:00 PM'

            cursor.execute("""
                INSERT INTO cola_standby (vuelo_codigo, pasajero_doc, pasajero_nombre, categoria, hora_ingreso_12h)
                VALUES (?, ?, ?, ?, ?)
            """, (v_cod, p_doc, p_nom, p_cat, p_hora))
            conn.commit()
    finally:
        conn.close()

def eliminar_standby_persistido(vuelo_codigo: str, pasajero_doc: str):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            v_cod = str(vuelo_codigo).strip().upper()
            p_doc = str(pasajero_doc).strip()
            cursor.execute("""
                DELETE FROM cola_standby WHERE vuelo_codigo = ? AND pasajero_doc = ?
            """, (v_cod, p_doc))
            conn.commit()
    finally:
        conn.close()

# --- TABLA PERSISTENTE DE PAGOS Y EMBARQUE RECIENTES ---
def persistir_pago_reciente(pago: dict):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO pasajeros_recientes_pagos (
                    documento, nombre_completo, nacionalidad, categoria, vuelo_id,
                    origen_destino, asiento, metodo_pago, monto_cop, referencia_pago,
                    estado_embarque, fecha_hora_registro
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(pago['documento']).strip(),
                str(pago['nombre_completo']).strip(),
                pago.get('nacionalidad') or 'Colombia',
                pago.get('categoria') or 'Estándar',
                str(pago['vuelo_id']).strip().upper(),
                pago.get('origen_destino') or 'BOG ✈ MAD',
                pago.get('asiento') or 'N/A',
                pago.get('metodo_pago') or 'Tarjeta Débito/Crédito Visa/Mastercard',
                int(round(float(pago.get('monto_cop') or 1820000))),
                pago.get('referencia_pago') or '#AF-1001-CO',
                pago.get('estado_embarque') or 'Confirmado',
                pago.get('fecha_hora_registro') or '2026-10-22 • 11:00 AM'
            ))
            conn.commit()
    finally:
        conn.close()

def obtener_pasajeros_recientes_pagos(incluir_cancelados: bool = False):
    init_db()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        if incluir_cancelados:
            cursor.execute("SELECT * FROM pasajeros_recientes_pagos ORDER BY id DESC")
        else:
            cursor.execute(
                "SELECT * FROM pasajeros_recientes_pagos "
                "WHERE UPPER(COALESCE(estado_embarque, '')) != 'CANCELADO' "
                "ORDER BY id DESC"
            )
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    finally:
        conn.close()

def actualizar_estado_embarque_pago(vuelo_id: str, documento: str, nuevo_estado: str):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod_upper = str(vuelo_id).strip().upper()
            doc_str = str(documento).strip()
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = ?
                WHERE UPPER(vuelo_id) = ? AND documento = ?
            """, (nuevo_estado, cod_upper, doc_str))
            cursor.execute("""
                UPDATE manifiesto
                SET estado_embarque = ?
                WHERE UPPER(vuelo_codigo) = ? AND pasajero_doc = ?
            """, (nuevo_estado, cod_upper, doc_str))
            conn.commit()
    finally:
        conn.close()

def actualizar_vuelo_admin(codigo: str, datos: dict):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            campos = []
            valores = []
            cols_permitidas = (
                'origen', 'destino', 'tipo_aeronave', 'capacidad_maxima',
                'imagen_url', 'precio_base_cop', 'categoria', 'tag_destacado',
                'fecha_salida', 'hora_salida_12h', 'hora_llegada_12h', 'puerta', 'estado'
            )
            for col in cols_permitidas:
                if col in datos:
                    campos.append(f"{col} = ?")
                    valores.append(datos[col])
            if campos:
                valores.append(str(codigo).strip().upper())
                cursor.execute(f"UPDATE vuelos SET {', '.join(campos)} WHERE UPPER(codigo) = ?", valores)
                conn.commit()
    finally:
        conn.close()

def eliminar_vuelo_definitivo(codigo: str):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod = str(codigo).strip().upper()
            cursor.execute("DELETE FROM cola_standby WHERE UPPER(vuelo_codigo) = ?", (cod,))
            cursor.execute("DELETE FROM manifiesto WHERE UPPER(vuelo_codigo) = ?", (cod,))
            cursor.execute("DELETE FROM ordenes WHERE UPPER(vuelo_codigo) = ?", (cod,))
            cursor.execute("DELETE FROM vuelos WHERE UPPER(codigo) = ?", (cod,))
            conn.commit()
    finally:
        conn.close()

def actualizar_todos_embarcados_vuelo(vuelo_id: str, nuevo_estado: str = 'ABORDADO'):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod_upper = str(vuelo_id).strip().upper()
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = ?
                WHERE UPPER(vuelo_id) = ?
                  AND UPPER(COALESCE(estado_embarque, '')) != 'CANCELADO'
            """, (nuevo_estado, cod_upper))
            cursor.execute("""
                UPDATE manifiesto
                SET estado_embarque = ?
                WHERE UPPER(vuelo_codigo) = ?
            """, (nuevo_estado, cod_upper))
            conn.commit()
    finally:
        conn.close()

def marcar_vuelo_despegado(vuelo_codigo: str):
    """Persiste atómicamente el estado DESPEGADO del vuelo y de sus pasajeros en SQLite."""
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod_upper = str(vuelo_codigo).strip().upper()
            cursor.execute(
                "UPDATE vuelos SET estado = 'DESPEGADO' WHERE UPPER(codigo) = ?",
                (cod_upper,),
            )
            cursor.execute("""
                UPDATE manifiesto
                SET estado_embarque = 'ABORDADO'
                WHERE UPPER(vuelo_codigo) = ?
            """, (cod_upper,))
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = 'ABORDADO'
                WHERE UPPER(vuelo_id) = ?
                  AND UPPER(COALESCE(estado_embarque, '')) != 'CANCELADO'
            """, (cod_upper,))
            conn.commit()
    finally:
        conn.close()

def obtener_documentos_embarcados_vuelo(vuelo_id: str) -> set:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cod_upper = str(vuelo_id).strip().upper()
        cursor.execute("""
            SELECT documento FROM pasajeros_recientes_pagos
            WHERE UPPER(vuelo_id) = ? AND UPPER(COALESCE(estado_embarque, '')) IN ('ABORDADO', 'EMBARCADO')
            UNION
            SELECT pasajero_doc FROM manifiesto
            WHERE UPPER(vuelo_codigo) = ? AND UPPER(COALESCE(estado_embarque, '')) IN ('ABORDADO', 'EMBARCADO')
        """, (cod_upper, cod_upper))
        rows = cursor.fetchall()
        return {str(r[0]).strip() for r in rows}
    finally:
        conn.close()

def anular_o_cancelar_vuelo(codigo: str, motivo: str = 'CANCELADO / ANULADO POR OPERADOR', liberar_pasajeros: bool = True):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod = str(codigo).strip().upper()
            cursor.execute("""
                UPDATE vuelos
                SET estado = ?
                WHERE codigo = ?
            """, (motivo, cod))
            if liberar_pasajeros:
                cursor.execute("""
                    UPDATE pasajeros
                    SET vuelo_asignado = NULL
                    WHERE vuelo_asignado = ?
                """, (cod,))
                cursor.execute("""
                    DELETE FROM manifiesto
                    WHERE vuelo_codigo = ?
                """, (cod,))
                cursor.execute("""
                    DELETE FROM cola_standby
                    WHERE vuelo_codigo = ?
                """, (cod,))
                cursor.execute("""
                    UPDATE pasajeros_recientes_pagos
                    SET estado_embarque = 'VUELO ANULADO'
                    WHERE vuelo_id = ?
                """, (cod,))
            conn.commit()
    finally:
        conn.close()

def reactivar_vuelo_operativo(codigo: str, nuevo_estado: str = 'Check-in abierto'):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod = str(codigo).strip().upper()
            cursor.execute("""
                UPDATE vuelos
                SET estado = ?
                WHERE codigo = ?
            """, (nuevo_estado, cod))
            conn.commit()
    finally:
        conn.close()

def archivar_vuelo_operativo(codigo: str):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cod = str(codigo).strip().upper()
            cursor.execute("""
                UPDATE vuelos
                SET estado = 'ARCHIVADO'
                WHERE codigo = ?
            """, (cod,))
            conn.commit()
    finally:
        conn.close()
# 26 Pasajeros Oficiales de Semilla (Exactamente 26 Asientos para Airbus A319 Corporate)
# 6 VIP en Asientos 1A a 3B (5 de categoría VIP exclusiva, 1 estándar)
# 20 Estándar en Asientos 4A a 8D
PASAJEROS_SEMILLA_26 = [
    # Fila 1 VIP
    ("101829384", "Carlos Alberto Mendoza", "Colombia", "VIP", "1A", "Tarjeta Débito/Crédito Visa (•••• 4242)", 3850000, "08:15 AM"),
    ("102938475", "Valeria Sofía Restrepo", "Colombia", "VIP", "1B", "PSE Bancolombia Transferencia", 3850000, "08:20 AM"),
    # Fila 2 VIP
    ("103847561", "Andrés Felipe Gómez", "Colombia", "VIP", "2A", "Tarjeta Débito/Crédito Mastercard (•••• 8901)", 3850000, "08:35 AM"),
    ("104958672", "Mariana Lucía Morales", "Colombia", "VIP", "2B", "Millas AeroFlow Club (65.000 Millas)", 3850000, "08:45 AM"),
    # Fila 3 VIP
    ("105748392", "Juan Sebastián Herrera", "Colombia", "VIP", "3A", "Tarjeta Débito/Crédito Visa (•••• 1122)", 3850000, "08:50 AM"),
    ("106839201", "Elena Beatriz Rojas", "España", "Estándar", "3B", "PSE Davivienda / DaviPlata", 3850000, "09:00 AM"),

    # Fila 4 Economy
    ("107294810", "Mateo David Silva", "Chile", "Estándar", "4A", "Tarjeta Débito/Crédito Visa (•••• 3344)", 1820000, "09:05 AM"),
    ("108395019", "Gabriela Andrea Vega", "México", "Estándar", "4B", "PSE Nequi", 1820000, "09:10 AM"),
    ("109485720", "Rodrigo Paz Quintana", "Argentina", "Estándar", "4C", "Tarjeta Débito/Crédito Mastercard (•••• 5566)", 1820000, "09:15 AM"),
    ("110394857", "Diana Patricia Ramos", "Colombia", "Estándar", "4D", "PSE Nu Colombia", 1820000, "09:20 AM"),

    # Fila 5 Economy
    ("111849302", "Santiago Murillo Cárdenas", "Colombia", "Estándar", "5A", "Tarjeta Débito/Crédito Visa (•••• 7788)", 1820000, "09:25 AM"),
    ("112948571", "Camila Isabel Castillo", "Panamá", "Estándar", "5B", "PSE Banco de Bogotá", 1820000, "09:30 AM"),
    ("113049582", "Nicolás Eduardo Arango", "Colombia", "Estándar", "5C", "Millas AeroFlow Club (28.500 Millas)", 1820000, "09:35 AM"),
    ("114958673", "Isabella María Torres", "Colombia", "Estándar", "5D", "Tarjeta Débito/Crédito Visa (•••• 9900)", 1820000, "09:40 AM"),

    # Fila 6 Economy
    ("115849301", "Alejandro José Castro", "Perú", "Estándar", "6A", "PSE Scotiabank Colpatria", 1820000, "09:42 AM"),
    ("116938472", "Sofía Alejandra Vargas", "Colombia", "Estándar", "6B", "Tarjeta Débito/Crédito Mastercard (•••• 2233)", 1820000, "09:45 AM"),
    ("117849203", "Daniel Esteban Méndez", "Ecuador", "Estándar", "6C", "PSE BBVA Colombia", 1820000, "09:48 AM"),
    ("118294857", "Luciana del Pilar Rios", "Colombia", "Estándar", "6D", "Tarjeta Débito/Crédito Visa (•••• 4455)", 1820000, "09:50 AM"),

    # Fila 7 Economy
    ("119384756", "Felipe Ignacio Navas", "Chile", "Estándar", "7A", "PSE Dale!", 1820000, "09:52 AM"),
    ("120495837", "Paula Daniela Pinzón", "Colombia", "Estándar", "7B", "Tarjeta Débito/Crédito Visa (•••• 6677)", 1820000, "09:55 AM"),
    ("121948573", "Martín Alonso Barreto", "Uruguay", "Estándar", "7C", "PSE Lulo Bank", 1820000, "09:58 AM"),
    ("122839485", "Catalina María Osorio", "Colombia", "Estándar", "7D", "Tarjeta Débito/Crédito Mastercard (•••• 8899)", 1820000, "10:00 AM"),

    # Fila 8 Economy
    ("123847592", "Joaquín Manuel Pardo", "Colombia", "Estándar", "8A", "Millas AeroFlow Club (28.500 Millas)", 1820000, "10:02 AM"),
    ("124958371", "Manuela Mercedes Cruz", "Guatemala", "Estándar", "8B", "Tarjeta Débito/Crédito Visa (•••• 1010)", 1820000, "10:05 AM"),
    ("125839402", "Samuel David Cifuentes", "Colombia", "Estándar", "8C", "PSE Bancolombia", 1820000, "10:08 AM"),
    ("126485930", "Emilia Rosa Salcedo", "Colombia", "Estándar", "8D", "Tarjeta Débito/Crédito Visa (•••• 2020)", 1820000, "10:10 AM")
]

def reiniciar_semilla_limpia():
    """
    Restaura la base de datos a su semilla oficial completa y activa:
    1. Vuelo AF1001 (BOG ➔ MAD) con 26 Asientos y 26 Pasajeros con Tiquete y Pago (Embarcando / Rampa).
    2. Vuelos comerciales base activos:
       - AF2020 (BOG ➔ MIA) Airbus A320neo (Puerta B-04)
       - AF3022 (BOG ➔ JFK) Boeing 787-8 Dreamliner (Puerta A-02)
       - AF4055 (BOG ➔ CTG) Airbus A320neo (Puerta C-01)
       - AF5088 (BOG ➔ MEX) Airbus A319 Corporate (Puerta B-06)
    Persistencia atómica total con SQLite WAL.
    """
    init_db()
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            # 1. Limpieza Total (Flush de todas las tablas operativas)
            cursor.execute("DELETE FROM cola_standby;")
            cursor.execute("DELETE FROM manifiesto;")
            cursor.execute("DELETE FROM pasajeros_recientes_pagos;")
            cursor.execute("DELETE FROM pasajeros;")
            cursor.execute("DELETE FROM vuelos;")
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS ordenes (
                id TEXT PRIMARY KEY,
                pnr TEXT NOT NULL UNIQUE,
                vuelo_codigo TEXT NOT NULL,
                asiento_id TEXT NOT NULL,
                documento_pasajero TEXT NOT NULL,
                nombre_pasajero TEXT NOT NULL,
                tarifa_base_cop INTEGER NOT NULL,
                tarifa_admin_cop INTEGER NOT NULL,
                tasa_aeroportuaria_cop INTEGER NOT NULL,
                iva_cop INTEGER NOT NULL,
                total_cop INTEGER NOT NULL,
                estado TEXT NOT NULL DEFAULT 'pendiente',
                bloqueado_hasta INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pagos (
                id TEXT PRIMARY KEY,
                orden_id TEXT NOT NULL,
                monto_cop INTEGER NOT NULL,
                moneda TEXT NOT NULL DEFAULT 'COP',
                estado TEXT NOT NULL DEFAULT 'pendiente',
                proveedor TEXT NOT NULL DEFAULT 'simulador',
                referencia_externa TEXT,
                idempotency_key TEXT NOT NULL UNIQUE,
                marca TEXT,
                ultimos_4 TEXT,
                codigo_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (orden_id) REFERENCES ordenes(id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pago_eventos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pago_id TEXT NOT NULL,
                estado_anterior TEXT,
                estado_nuevo TEXT NOT NULL,
                origen TEXT NOT NULL,
                detalles TEXT,
                created_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS reembolsos (
                id TEXT PRIMARY KEY,
                pago_id TEXT NOT NULL,
                orden_id TEXT NOT NULL,
                monto_cop INTEGER NOT NULL,
                motivo TEXT NOT NULL,
                autorizado_por TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS recibos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutivo TEXT NOT NULL UNIQUE,
                aeropuerto_codigo TEXT NOT NULL,
                orden_id TEXT NOT NULL,
                pnr TEXT NOT NULL,
                monto_total_cop INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'pasajero',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
            _sembrar_usuarios_demo(cursor)
            _crear_indices(cursor)

            fecha_hoy_semilla = datetime.now().date().isoformat()
            fecha_manana_semilla = (datetime.now().date() + timedelta(days=1)).isoformat()

            # Catálogo oficial de vuelos comerciales activos con fotografías y precios (HOY y MAÑANA)
            vuelos_base = [
                (
                    "AF1001",
                    "BOG - Bogotá El Dorado",
                    "MAD - Madrid Barajas",
                    "Airbus A319 Corporate",
                    "09h 45m",
                    8034,
                    fecha_hoy_semilla,
                    "11:00 AM",
                    "05:45 AM",
                    "B-01",
                    26,
                    "Check-in abierto",
                    "/static/img/oferta-medellin.jpg",
                    2850000,
                    "ciudad",
                    "Transatlántico"
                ),
                (
                    "AF2022",
                    "BOG - Bogotá El Dorado",
                    "CLO - Cali Alfonso Bonilla Aragón",
                    "Airbus A320neo",
                    "01h 05m",
                    300,
                    fecha_hoy_semilla,
                    "08:30 AM",
                    "09:35 AM",
                    "B-03",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-cali.jpg",
                    71810,
                    "nocturna",
                    "Recomendado para ti"
                ),
                (
                    "AF2024",
                    "BOG - Bogotá El Dorado",
                    "MTR - Montería Los Garzones",
                    "Airbus A320neo",
                    "01h 15m",
                    490,
                    fecha_manana_semilla,
                    "09:40 AM",
                    "10:55 AM",
                    "C-02",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-monteria.jpg",
                    75970,
                    "naturaleza",
                    "Vuelo directo"
                ),
                (
                    "AF2025",
                    "BOG - Bogotá El Dorado",
                    "MDE - Medellín José María Córdova",
                    "Airbus A320neo",
                    "00h 55m",
                    240,
                    fecha_hoy_semilla,
                    "07:15 AM",
                    "08:10 AM",
                    "B-02",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-medellin.jpg",
                    82010,
                    "ciudad",
                    "Mejor precio"
                ),
                (
                    "AF4055",
                    "BOG - Bogotá El Dorado",
                    "CTG - Cartagena Rafael Núñez",
                    "Airbus A320neo",
                    "01h 25m",
                    650,
                    fecha_hoy_semilla,
                    "05:00 PM",
                    "06:25 PM",
                    "C-01",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-cartagena.jpg",
                    115000,
                    "playa",
                    "Playa favorita"
                ),
                (
                    "AF2030",
                    "BOG - Bogotá El Dorado",
                    "SMR - Santa Marta Simón Bolívar",
                    "Airbus A320neo",
                    "01h 30m",
                    735,
                    fecha_manana_semilla,
                    "11:20 AM",
                    "12:50 PM",
                    "C-03",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-santamarta.jpg",
                    108500,
                    "playa",
                    "Reserva anticipada"
                ),
                (
                    "AF2028",
                    "BOG - Bogotá El Dorado",
                    "BAQ - Barranquilla Ernesto Cortissoz",
                    "Airbus A320neo",
                    "01h 25m",
                    705,
                    fecha_manana_semilla,
                    "02:15 PM",
                    "03:40 PM",
                    "B-05",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-barranquilla.jpg",
                    98000,
                    "playa",
                    "Vuelo directo"
                ),
                (
                    "AF2020",
                    "BOG - Bogotá El Dorado",
                    "MIA - Miami International",
                    "Airbus A320neo",
                    "04h 10m",
                    2435,
                    fecha_hoy_semilla,
                    "01:30 PM",
                    "05:40 PM",
                    "B-04",
                    36,
                    "Check-in abierto",
                    "/static/img/oferta-miami.jpg",
                    890000,
                    "playa",
                    "Internacional"
                ),
                (
                    "AF3022",
                    "BOG - Bogotá El Dorado",
                    "JFK - Nueva York John F. Kennedy",
                    "Boeing 787-8 Dreamliner",
                    "05h 50m",
                    3995,
                    fecha_manana_semilla,
                    "03:15 PM",
                    "09:05 PM",
                    "A-02",
                    64,
                    "Check-in abierto",
                    "/static/img/oferta-medellin.jpg",
                    1250000,
                    "ciudad",
                    "Nueva York"
                ),
                (
                    "AF5088",
                    "BOG - Bogotá El Dorado",
                    "MEX - Ciudad de México Benito Juárez",
                    "Airbus A319 Corporate",
                    "04h 45m",
                    3160,
                    fecha_manana_semilla,
                    "07:30 PM",
                    "12:15 AM",
                    "B-06",
                    26,
                    "Check-in abierto",
                    "/static/img/oferta-cali.jpg",
                    980000,
                    "ciudad",
                    "Directo"
                )
            ]

            cursor.executemany("""
                INSERT INTO vuelos (codigo, origen, destino, tipo_aeronave, duracion_estimada, distancia_km,
                                    fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima, estado,
                                    imagen_url, precio_base_cop, categoria, tag_destacado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, vuelos_base)

            def _insertar_pasajero_semilla_completo(
                vuelo_cod, tipo_aero, origen_dest, fecha_v,
                doc, nombre, nac, cat, asiento, metodo, monto, hora_ck, ref_pago
            ):
                asientos_validos = {
                    s["id"]: s for s in obtener_configuracion_aeronave(tipo_aero)["asientos"]
                }
                if asiento not in asientos_validos:
                    raise ValueError(f"Asiento semilla inválido {asiento} para {tipo_aero}")
                clase = "VIP" if asientos_validos[asiento]["clase"].upper().startswith("VIP") else "Estándar"

                cursor.execute("""
                    INSERT OR REPLACE INTO pasajeros (documento, nombre, nacionalidad, categoria_viajero, vuelo_asignado)
                    VALUES (?, ?, ?, ?, ?)
                """, (doc, nombre, nac, cat, vuelo_cod))

                cursor.execute("""
                    INSERT INTO manifiesto (vuelo_codigo, pasajero_doc, pasajero_nombre, asiento,
                                            hora_checkin_12h, categoria, clase_cabina, tarifa_pagada_cop, estado_embarque)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Confirmado')
                """, (vuelo_cod, doc, nombre, asiento, hora_ck, cat, clase, monto))

                cursor.execute("""
                    INSERT INTO pasajeros_recientes_pagos (
                        documento, nombre_completo, nacionalidad, categoria, vuelo_id,
                        origen_destino, asiento, metodo_pago, monto_cop, referencia_pago,
                        estado_embarque, fecha_hora_registro
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmado', ?)
                """, (
                    doc, nombre, nac, cat, vuelo_cod,
                    origen_dest, asiento, metodo, monto, ref_pago,
                    f"{fecha_v} • {hora_ck}"
                ))

            # 3. Inserción atómica de los 26 Pasajeros para AF1001 (HOY)
            for idx, (doc, nombre, nac, cat, asiento, metodo, monto, hora_ck) in enumerate(PASAJEROS_SEMILLA_26, start=1):
                ref_pago = f"AF-1001-{(idx * 179) % 8999 + 1000}"
                _insertar_pasajero_semilla_completo(
                    "AF1001", "Airbus A319 Corporate", "BOG ✈ MAD", fecha_hoy_semilla,
                    doc, nombre, nac, cat, asiento, metodo, monto, hora_ck, ref_pago
                )

            # 4. Pasajeros consistentes pre-cargados en rutas troncales de HOY (listos para abordar)
            pasajeros_rutas_hoy = [
                ("AF2025", "Airbus A320neo", "BOG -> MDE", [
                    ("20100101", "Santiago Morales Ruiz", "Colombia", "VIP", "1A", "Tarjeta Bancaria", 331500, "06:40 AM"),
                    ("20100102", "Valeria Castaño Gómez", "Colombia", "VIP", "1B", "PSE Bancolombia", 331500, "06:45 AM"),
                    ("20100103", "Andrés Felipe Ospina", "Colombia", "Estándar", "5A", "Nequi / QR", 288454, "06:50 AM"),
                    ("20100104", "Mariana Duque Salazar", "Colombia", "Estándar", "5B", "Tarjeta Bancaria", 288454, "06:55 AM"),
                ]),
                ("AF4055", "Airbus A320neo", "BOG -> CTG", [
                    ("20200201", "Gabriel Restrepo Mejía", "Colombia", "VIP", "1A", "Tarjeta Bancaria", 365000, "04:10 PM"),
                    ("20200202", "Camila Vargas Patiño", "Colombia", "VIP", "1B", "PSE Bancolombia", 365000, "04:15 PM"),
                    ("20200203", "Nicolás Herrera Vélez", "Colombia", "Estándar", "5A", "Tarjeta Bancaria", 310000, "04:20 PM"),
                    ("20200204", "Sofía Castro Londoño", "Colombia", "Estándar", "5B", "Nequi / QR", 310000, "04:25 PM"),
                ]),
                ("AF2020", "Airbus A320neo", "BOG -> MIA", [
                    ("20400401", "Alejandro Mendoza León", "Colombia", "VIP", "1A", "Tarjeta Bancaria", 1120000, "12:30 PM"),
                    ("20400402", "Laura Daniela Nieto", "Colombia", "VIP", "1B", "PSE Bancolombia", 1120000, "12:35 PM"),
                    ("20400403", "Tomás Arango Quintero", "Colombia", "Estándar", "5A", "Tarjeta Bancaria", 890000, "12:40 PM"),
                ]),
                ("AF2022", "Airbus A320neo", "BOG -> CLO", [
                    ("20300301", "Isabella Torres Bermúdez", "Colombia", "VIP", "1A", "Tarjeta Bancaria", 295000, "07:40 AM"),
                    ("20300302", "Sebastián Cárdenas Gil", "Colombia", "VIP", "1B", "Nequi / QR", 295000, "07:45 AM"),
                    ("20300303", "Paula Andrea Méndez", "Colombia", "Estándar", "5A", "PSE Bancolombia", 252000, "07:50 AM"),
                ]),
            ]
            for v_cod, t_aero, od_str, pax_list in pasajeros_rutas_hoy:
                for idx_p, (doc, nom, nac, cat, asi, met, mnt, hck) in enumerate(pax_list, start=1):
                    _insertar_pasajero_semilla_completo(
                        v_cod, t_aero, od_str, fecha_hoy_semilla,
                        doc, nom, nac, cat, asi, met, mnt, hck,
                        f"AF-{v_cod[2:]}-{1100 + idx_p}"
                    )

            conn.commit()
    finally:
        conn.close()

def _base_de_datos_vacia() -> bool:
    """
    Detecta si la base de datos necesita re-seeding:
    - Tablas vacías (vuelos=0, pasajeros=0 o manifiesto=0)
    - Todos los vuelos están en estado terminal (CANCELADO, EXPIRADO, ARCHIVADO)
    - El vuelo demo AF1001 está en estado terminal (DESPEGADO/Cerrado) Y
      no hay ningún otro vuelo activo con pasajeros embarcados (semilla consumida)
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM vuelos;")
        vuelos = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM pasajeros;")
        pasajeros = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM manifiesto;")
        manifiesto = cursor.fetchone()[0]
        if vuelos == 0 or pasajeros == 0 or manifiesto == 0:
            return True
        # Verificar si todos los vuelos están en estado terminal
        cursor.execute("""
            SELECT COUNT(*) FROM vuelos
            WHERE estado NOT LIKE '%CANCELADO%'
              AND estado NOT LIKE '%EXPIRADO%'
              AND estado NOT IN ('DESPEGADO', 'Despegado', 'Cerrado', 'ARCHIVADO')
        """)
        activos = cursor.fetchone()[0]
        if activos == 0:
            return True
        # Detectar caso especial: solo quedan vuelos base "vacíos" sin pasajeros embarcados
        # (AF1001 fue consumido y los demás vuelos no tienen check-in aun)
        cursor.execute("""
            SELECT COUNT(*) FROM vuelos v
            WHERE v.estado NOT LIKE '%CANCELADO%'
              AND v.estado NOT LIKE '%EXPIRADO%'
              AND v.estado NOT IN ('DESPEGADO', 'Despegado', 'Cerrado', 'ARCHIVADO')
              AND EXISTS (SELECT 1 FROM manifiesto m WHERE m.vuelo_codigo = v.codigo)
        """)
        activos_con_pasajeros = cursor.fetchone()[0]
        # Si AF1001 está en estado terminal y no hay ningún vuelo activo con manifiesto → re-seed
        cursor.execute("SELECT estado FROM vuelos WHERE codigo = 'AF1001'")
        af1001 = cursor.fetchone()
        if af1001:
            estado_af1001 = af1001[0]
            es_terminal = any(t in estado_af1001.upper() for t in ('DESPEGADO', 'CANCELADO', 'EXPIRADO', 'ARCHIVADO', 'CERRADO'))
            if es_terminal and activos_con_pasajeros == 0:
                return True
        return False
    finally:
        conn.close()


def sanear_vuelos_inconsistentes(purgar_despegados: bool = False) -> Dict[str, Any]:
    """
    Rutina de saneamiento integral sobre aerocore.db:
    - Detecta y purga vuelos con fecha pasada (< hoy), estados terminales opcionales,
      o manifiestos inconsistentes (pasajeros en manifiesto sin registro completo en
      pasajeros / pasajeros_recientes_pagos, o asientos fuera del catálogo de la aeronave).
    - Limpia vuelo_asignado en pasajeros y elimina registros huérfanos.
    """
    hoy_str = datetime.now().date().isoformat()
    codigos_eliminados = []

    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT codigo, tipo_aeronave, fecha_salida, estado FROM vuelos")
            vuelos_rows = [dict(r) for r in cursor.fetchall()]

            for v in vuelos_rows:
                cod = str(v["codigo"]).strip().upper()
                fecha_v = str(v.get("fecha_salida") or "").split(" ")[0].strip()
                estado_u = str(v.get("estado") or "").strip().upper()
                es_terminal = (
                    estado_u in ("DESPEGADO", "CERRADO", "ARCHIVADO")
                    or "CANCELADO" in estado_u
                    or "EXPIRADO" in estado_u
                )

                purgar = False
                if fecha_v and fecha_v < hoy_str:
                    purgar = True
                elif purgar_despegados and es_terminal:
                    purgar = True
                else:
                    asientos_validos = {
                        s["id"] for s in obtener_configuracion_aeronave(v.get("tipo_aeronave", "Airbus A320neo"))["asientos"]
                    }
                    cursor.execute(
                        "SELECT pasajero_doc, asiento FROM manifiesto WHERE UPPER(vuelo_codigo) = ?",
                        (cod,),
                    )
                    manif_rows = cursor.fetchall()
                    docs_manif = {str(r[0]).strip() for r in manif_rows}

                    for doc_m, asi_m in manif_rows:
                        doc_m = str(doc_m).strip()
                        asi_m = str(asi_m).strip().upper()
                        if asi_m not in asientos_validos:
                            purgar = True
                            break
                        pax_ok = cursor.execute(
                            "SELECT 1 FROM pasajeros WHERE documento = ?",
                            (doc_m,),
                        ).fetchone()
                        pago_ok = cursor.execute(
                            """
                            SELECT 1 FROM pasajeros_recientes_pagos
                            WHERE UPPER(vuelo_id) = ? AND documento = ?
                              AND UPPER(COALESCE(estado_embarque, '')) != 'CANCELADO'
                            """,
                            (cod, doc_m),
                        ).fetchone()
                        if not pax_ok or not pago_ok:
                            purgar = True
                            break

                    if not purgar:
                        cursor.execute(
                            """
                            SELECT documento FROM pasajeros_recientes_pagos
                            WHERE UPPER(vuelo_id) = ?
                              AND UPPER(COALESCE(estado_embarque, '')) NOT IN ('CANCELADO', 'EN ESPERA (STANDBY)')
                            """,
                            (cod,),
                        )
                        for (doc_p,) in cursor.fetchall():
                            if str(doc_p).strip() not in docs_manif:
                                purgar = True
                                break

                if purgar:
                    cursor.execute("DELETE FROM manifiesto WHERE UPPER(vuelo_codigo) = ?", (cod,))
                    cursor.execute("DELETE FROM cola_standby WHERE UPPER(vuelo_codigo) = ?", (cod,))
                    cursor.execute("DELETE FROM pasajeros_recientes_pagos WHERE UPPER(vuelo_id) = ?", (cod,))
                    cursor.execute(
                        "DELETE FROM pagos WHERE orden_id IN (SELECT id FROM ordenes WHERE UPPER(vuelo_codigo) = ?)",
                        (cod,),
                    )
                    cursor.execute("DELETE FROM ordenes WHERE UPPER(vuelo_codigo) = ?", (cod,))
                    cursor.execute(
                        "UPDATE pasajeros SET vuelo_asignado = NULL WHERE UPPER(COALESCE(vuelo_asignado, '')) = ?",
                        (cod,),
                    )
                    cursor.execute("DELETE FROM vuelos WHERE UPPER(codigo) = ?", (cod,))
                    codigos_eliminados.append(cod)

            # Purga de huérfanos residuales sin vuelo padre o sin asiento en manifiesto
            cursor.execute("DELETE FROM manifiesto WHERE UPPER(vuelo_codigo) NOT IN (SELECT UPPER(codigo) FROM vuelos)")
            cursor.execute("DELETE FROM cola_standby WHERE UPPER(vuelo_codigo) NOT IN (SELECT UPPER(codigo) FROM vuelos)")
            cursor.execute("DELETE FROM pasajeros_recientes_pagos WHERE UPPER(vuelo_id) NOT IN (SELECT UPPER(codigo) FROM vuelos)")
            cursor.execute(
                """
                UPDATE pasajeros SET vuelo_asignado = NULL
                WHERE vuelo_asignado IS NOT NULL
                  AND (
                    UPPER(vuelo_asignado) NOT IN (SELECT UPPER(codigo) FROM vuelos)
                    OR NOT EXISTS (
                      SELECT 1 FROM manifiesto m
                      WHERE m.pasajero_doc = pasajeros.documento
                        AND UPPER(m.vuelo_codigo) = UPPER(pasajeros.vuelo_asignado)
                    )
                  )
                """
            )
            conn.commit()
    finally:
        conn.close()

    return {"codigos_eliminados": codigos_eliminados}


def mantenimiento_diario_vuelos() -> Dict[str, Any]:
    """
    Rutina diaria de mantenimiento aeronáutico:
    1. Purga de vuelos vencidos (fecha_salida < hoy) o con manifiestos inconsistentes en SQLite
       junto con sus registros huérfanos en manifiesto, cola_standby, pasajeros y pagos.
    2. Sincroniza capacidad_maxima de vuelos vigentes contra el catálogo oficial
       para evitar desajustes en el mapa de asientos.
    3. Verifica que existan al menos 6 vuelos activos para hoy y mañana; de lo
       contrario genera e inserta vuelos comerciales nuevos con rutas troncales.
    """
    hoy = datetime.now().date()
    hoy_str = hoy.isoformat()
    manana_str = (hoy + timedelta(days=1)).isoformat()

    saneamiento = sanear_vuelos_inconsistentes(purgar_despegados=False)
    codigos_eliminados = list(saneamiento.get("codigos_eliminados", []))
    vuelos_creados = []
    vuelos_sincronizados = []

    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()

            # 2. Sincronizar capacidad_maxima de vuelos existentes con el catálogo oficial
            cursor.execute("SELECT codigo, tipo_aeronave, capacidad_maxima FROM vuelos")
            for row in cursor.fetchall():
                cod = str(row["codigo"]).strip().upper()
                tipo = row["tipo_aeronave"]
                cap_catalogo = int(obtener_configuracion_aeronave(tipo)["capacidad"])
                if int(row["capacidad_maxima"] or 0) != cap_catalogo:
                    cursor.execute(
                        "UPDATE vuelos SET capacidad_maxima = ? WHERE UPPER(codigo) = ?",
                        (cap_catalogo, cod),
                    )
                    vuelos_sincronizados.append({"codigo": cod, "capacidad_maxima": cap_catalogo})

            # 3. Contar vuelos activos disponibles para hoy y mañana (o fechas futuras)
            cursor.execute("""
                SELECT codigo, origen, destino, fecha_salida FROM vuelos
                WHERE fecha_salida >= ?
                  AND estado NOT LIKE '%CANCELADO%'
                  AND estado NOT LIKE '%EXPIRADO%'
                  AND estado NOT IN ('DESPEGADO', 'Despegado', 'Cerrado', 'ARCHIVADO')
            """, (hoy_str,))
            activos_rows = cursor.fetchall()
            codigos_existentes = {str(r["codigo"]).strip().upper() for r in activos_rows}

            if len(activos_rows) < 6:
                plantillas_diarias = [
                    {
                        "codigo_prefijo": "AF2025",
                        "origen": "BOG - Bogotá El Dorado",
                        "destino": "MDE - Medellín José María Córdova",
                        "tipo_aeronave": "Airbus A320neo",
                        "duracion_estimada": "00h 55m",
                        "distancia_km": 240,
                        "fecha_salida": hoy_str,
                        "hora_salida_12h": "07:15 AM",
                        "hora_llegada_12h": "08:10 AM",
                        "puerta": "B-02",
                        "imagen_url": "/static/img/oferta-medellin.jpg",
                        "precio_base_cop": 82010,
                        "categoria": "ciudad",
                        "tag_destacado": "Mejor precio",
                    },
                    {
                        "codigo_prefijo": "AF4055",
                        "origen": "BOG - Bogotá El Dorado",
                        "destino": "CTG - Cartagena Rafael Núñez",
                        "tipo_aeronave": "Airbus A320neo",
                        "duracion_estimada": "01h 25m",
                        "distancia_km": 650,
                        "fecha_salida": hoy_str,
                        "hora_salida_12h": "05:00 PM",
                        "hora_llegada_12h": "06:25 PM",
                        "puerta": "C-01",
                        "imagen_url": "/static/img/oferta-cartagena.jpg",
                        "precio_base_cop": 89900,
                        "categoria": "playa",
                        "tag_destacado": "Más vendido",
                    },
                    {
                        "codigo_prefijo": "AF1001",
                        "origen": "BOG - Bogotá El Dorado",
                        "destino": "MAD - Madrid Barajas",
                        "tipo_aeronave": "Airbus A319 Corporate",
                        "duracion_estimada": "09h 45m",
                        "distancia_km": 8034,
                        "fecha_salida": manana_str,
                        "hora_salida_12h": "11:00 AM",
                        "hora_llegada_12h": "05:45 AM",
                        "puerta": "B-01",
                        "imagen_url": "/static/img/oferta-medellin.jpg",
                        "precio_base_cop": 2850000,
                        "categoria": "ciudad",
                        "tag_destacado": "Transatlántico",
                    },
                    {
                        "codigo_prefijo": "AF2020",
                        "origen": "BOG - Bogotá El Dorado",
                        "destino": "MIA - Miami International",
                        "tipo_aeronave": "Boeing 737 MAX 8",
                        "duracion_estimada": "03h 55m",
                        "distancia_km": 2435,
                        "fecha_salida": manana_str,
                        "hora_salida_12h": "09:15 AM",
                        "hora_llegada_12h": "01:10 PM",
                        "puerta": "A-04",
                        "imagen_url": "/static/img/oferta-miami.jpg",
                        "precio_base_cop": 1150000,
                        "categoria": "playa",
                        "tag_destacado": "Internacional",
                    },
                    {
                        "codigo_prefijo": "AF2022",
                        "origen": "BOG - Bogotá El Dorado",
                        "destino": "CLO - Cali Alfonso Bonilla Aragón",
                        "tipo_aeronave": "Airbus A320neo",
                        "duracion_estimada": "01h 05m",
                        "distancia_km": 300,
                        "fecha_salida": hoy_str,
                        "hora_salida_12h": "08:30 AM",
                        "hora_llegada_12h": "09:35 AM",
                        "puerta": "B-03",
                        "imagen_url": "/static/img/oferta-cali.jpg",
                        "precio_base_cop": 71810,
                        "categoria": "nocturna",
                        "tag_destacado": "Recomendado para ti",
                    },
                    {
                        "codigo_prefijo": "AF2030",
                        "origen": "BOG - Bogotá El Dorado",
                        "destino": "SMR - Santa Marta Simón Bolívar",
                        "tipo_aeronave": "Airbus A320neo",
                        "duracion_estimada": "01h 20m",
                        "distancia_km": 725,
                        "fecha_salida": manana_str,
                        "hora_salida_12h": "02:30 PM",
                        "hora_llegada_12h": "03:50 PM",
                        "puerta": "C-04",
                        "imagen_url": "/static/img/oferta-santamarta.jpg",
                        "precio_base_cop": 84500,
                        "categoria": "playa",
                        "tag_destacado": "Caribe",
                    },
                ]

                cursor.execute("SELECT codigo FROM vuelos")
                todos_codigos_bd = {str(r[0]).strip().upper() for r in cursor.fetchall()}
                total_activos = len(activos_rows)

                for plantilla in plantillas_diarias:
                    if total_activos >= 6 and plantilla["codigo_prefijo"] in codigos_existentes:
                        continue
                    cod_nuevo = plantilla["codigo_prefijo"]
                    if cod_nuevo in todos_codigos_bd:
                        # Si ese código ya existe como terminal, generar variante diaria
                        if cod_nuevo in codigos_existentes:
                            continue
                        sufijo = hoy.strftime("%d")
                        cod_nuevo = f"{plantilla['codigo_prefijo'][:4]}{sufijo}"
                        idx_extra = 1
                        while cod_nuevo in todos_codigos_bd:
                            cod_nuevo = f"AF{hoy.strftime('%m%d')}{idx_extra}"
                            idx_extra += 1

                    cap = int(obtener_configuracion_aeronave(plantilla["tipo_aeronave"])["capacidad"])
                    vuelo_nuevo = {
                        "codigo": cod_nuevo,
                        "origen": plantilla["origen"],
                        "destino": plantilla["destino"],
                        "tipo_aeronave": plantilla["tipo_aeronave"],
                        "duracion_estimada": plantilla["duracion_estimada"],
                        "distancia_km": plantilla["distancia_km"],
                        "fecha_salida": plantilla["fecha_salida"],
                        "hora_salida_12h": plantilla["hora_salida_12h"],
                        "hora_llegada_12h": plantilla["hora_llegada_12h"],
                        "puerta": plantilla["puerta"],
                        "capacidad_maxima": cap,
                        "estado": "Check-in abierto",
                        "imagen_url": plantilla["imagen_url"],
                        "precio_base_cop": plantilla["precio_base_cop"],
                        "categoria": plantilla["categoria"],
                        "tag_destacado": plantilla["tag_destacado"],
                    }
                    cursor.execute("""
                        INSERT INTO vuelos (
                            codigo, origen, destino, tipo_aeronave, duracion_estimada, distancia_km,
                            fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima,
                            estado, imagen_url, precio_base_cop, categoria, tag_destacado
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        vuelo_nuevo["codigo"], vuelo_nuevo["origen"], vuelo_nuevo["destino"],
                        vuelo_nuevo["tipo_aeronave"], vuelo_nuevo["duracion_estimada"],
                        vuelo_nuevo["distancia_km"], vuelo_nuevo["fecha_salida"],
                        vuelo_nuevo["hora_salida_12h"], vuelo_nuevo["hora_llegada_12h"],
                        vuelo_nuevo["puerta"], vuelo_nuevo["capacidad_maxima"],
                        vuelo_nuevo["estado"], vuelo_nuevo["imagen_url"],
                        vuelo_nuevo["precio_base_cop"], vuelo_nuevo["categoria"],
                        vuelo_nuevo["tag_destacado"],
                    ))
                    todos_codigos_bd.add(cod_nuevo)
                    codigos_existentes.add(cod_nuevo)
                    vuelos_creados.append(vuelo_nuevo)
                    total_activos += 1

            conn.commit()
    finally:
        conn.close()

    return {
        "codigos_eliminados": codigos_eliminados,
        "vuelos_creados": vuelos_creados,
        "vuelos_sincronizados": vuelos_sincronizados,
    }


def verificar_y_poblar_semilla(reset: bool = False) -> bool:
    """
    Pobla la semilla solo cuando la base de datos está vacía.
    Los datos del operador ya NUNCA se borran al reiniciar el servidor:
    para restaurar la demo limpia existen las dos vías oficiales:
      - CLI:  python database.py --reset
      - Env:  AEROFLOW_AUTO_RESET_ON_START=1  (temporal, solo en arranque)
    Retorna True cuando la base de datos fue restaurada.
    """
    init_db()
    if reset or _base_de_datos_vacia():
        reiniciar_semilla_limpia()
        return True
    mantenimiento_diario_vuelos()
    return False


# ============================================================
# CLI OPERATIVO — python database.py [--reset | --stats | --seed-si-vacia]
# ============================================================
# =====================================================================
# MOTOR TRANSACCIONAL DE PAGOS, ÓRDENES Y RETENCIÓN ATÓMICA DE ASIENTOS
# =====================================================================
_simulador_pagos = pm_adapter.SimuladorPagoAdapter()


def crear_orden_atomic(
    vuelo_codigo: str,
    asiento_id: str,
    documento: str,
    nombre: str,
    idempotency_key: str,
    origen_iata: str = "BOG"
) -> Dict[str, Any]:
    """
    Cálculo 100% server-side de tarifas en COP enteros y reserva atómica de asiento
    con bloqueo temporal de 12 minutos. Cero doble venta garantizada.
    """
    v_cod = str(vuelo_codigo).strip().upper()
    a_id = str(asiento_id).strip().upper()
    doc = str(documento).strip()
    nom = str(nombre).strip()
    key = str(idempotency_key).strip()
    ahora = int(time.time())

    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()

            # 1. Idempotencia: si ya existe pago con esta llave, retornar la orden existente
            cursor.execute("""
                SELECT o.* FROM ordenes o
                JOIN pagos p ON p.orden_id = o.id
                WHERE p.idempotency_key = ?
            """, (key,))
            row_existente = cursor.fetchone()
            if row_existente:
                return {
                    "id": row_existente["id"],
                    "pnr": row_existente["pnr"],
                    "vuelo_codigo": row_existente["vuelo_codigo"],
                    "asiento_id": row_existente["asiento_id"],
                    "total_cop": row_existente["total_cop"],
                    "estado": row_existente["estado"],
                    "bloqueado_hasta": row_existente["bloqueado_hasta"],
                    "idempotente": True
                }

            # 2. Verificar que el vuelo exista y esté abierto
            cursor.execute("SELECT * FROM vuelos WHERE codigo = ?", (v_cod,))
            vuelo = cursor.fetchone()
            if not vuelo:
                raise ValueError(f"El vuelo {v_cod} no existe.")

            estado_v = str(vuelo["estado"])
            if estado_v in ("DESPEGADO", "Despegado", "Cerrado"):
                raise ValueError(f"El vuelo {v_cod} se encuentra cerrado para ventas.")

            # 3. Verificar si el asiento ya está ocupado definitivamente en el manifiesto
            cursor.execute("SELECT 1 FROM manifiesto WHERE vuelo_codigo = ? AND asiento = ?", (v_cod, a_id))
            if cursor.fetchone():
                raise ValueError(f"El asiento {a_id} ya se encuentra ocupado en la aeronave.")

            # 4. Verificar si hay otra orden activa reteniendo este asiento
            cursor.execute("""
                SELECT 1 FROM ordenes
                WHERE vuelo_codigo = ? AND asiento_id = ?
                  AND estado IN ('pendiente', 'autorizado', 'pagado')
                  AND (bloqueado_hasta > ? OR estado = 'pagado')
            """, (v_cod, a_id, ahora))
            if cursor.fetchone():
                raise ValueError(f"El asiento {a_id} tiene una reserva activa en proceso de pago.")

            # 5. Cálculo server-side del precio base según modelo de aeronave y tasas de airport.json
            tipo_aero = vuelo["tipo_aeronave"]
            cfg_aero = obtener_configuracion_aeronave(tipo_aero)
            asiento_cat = next((s for s in cfg_aero["asientos"] if s["id"] == a_id), None)
            tarifa_base = int(asiento_cat["tarifa_base_cop"]) if asiento_cat else 780000

            desglose = airport_config.calcular_precio_servidor(
                tarifa_base_cop=tarifa_base,
                origen_iata=origen_iata
            )

            # Generar PNR único de 6 caracteres
            pnr = uuid.uuid4().hex[:6].upper()
            cursor.execute("SELECT 1 FROM ordenes WHERE pnr = ?", (pnr,))
            while cursor.fetchone():
                pnr = uuid.uuid4().hex[:6].upper()
                cursor.execute("SELECT 1 FROM ordenes WHERE pnr = ?", (pnr,))

            orden_id = f"ord_{uuid.uuid4().hex[:12]}"
            bloqueado_hasta = ahora + (12 * 60)  # 12 minutos de retención

            cursor.execute("""
                INSERT INTO ordenes (
                    id, pnr, vuelo_codigo, asiento_id, documento_pasajero, nombre_pasajero,
                    tarifa_base_cop, tarifa_admin_cop, tasa_aeroportuaria_cop, iva_cop, total_cop,
                    estado, bloqueado_hasta, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)
            """, (
                orden_id, pnr, v_cod, a_id, doc, nom,
                desglose["tarifa_base_cop"], desglose["tarifa_admin_cop"],
                desglose["tasa_aeroportuaria_cop"], desglose["iva_cop"],
                desglose["total_cop"], bloqueado_hasta, ahora, ahora
            ))

            # Pre-crear intento de pago vinculado a la orden
            pago_id = f"pay_{uuid.uuid4().hex[:12]}"
            cursor.execute("""
                INSERT INTO pagos (
                    id, orden_id, monto_cop, moneda, estado, proveedor, idempotency_key, created_at, updated_at
                ) VALUES (?, ?, ?, 'COP', 'pendiente', 'simulador', ?, ?, ?)
            """, (pago_id, orden_id, desglose["total_cop"], key, ahora, ahora))

            conn.commit()

            return {
                "id": orden_id,
                "pnr": pnr,
                "vuelo_codigo": v_cod,
                "asiento_id": a_id,
                "documento_pasajero": doc,
                "nombre_pasajero": nom,
                "total_cop": desglose["total_cop"],
                "desglose": desglose,
                "estado": "pendiente",
                "bloqueado_hasta": bloqueado_hasta,
                "idempotente": False
            }
    finally:
        conn.close()


def procesar_pago_atomic(
    orden_id: str,
    numero_tarjeta: str,
    idempotency_key: str,
    metodo_pago: str = "Tarjeta Débito/Crédito"
) -> Dict[str, Any]:
    """
    Procesa el pago con la máquina de estados, valida idempotencia, retención de asiento
    y genera boleto y recibo consecutivos.
    """
    ahora = int(time.time())
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()

            # 1. Cargar orden
            cursor.execute("SELECT * FROM ordenes WHERE id = ?", (orden_id,))
            orden = cursor.fetchone()
            if not orden:
                raise ValueError("Orden no encontrada.")

            # 2. Si ya fue pagada, responder idempotentemente
            if orden["estado"] == "pagado":
                cursor.execute("SELECT * FROM recibos WHERE orden_id = ?", (orden_id,))
                rec = cursor.fetchone()
                return {
                    "estado": "pagado",
                    "pnr": orden["pnr"],
                    "orden_id": orden_id,
                    "total_cop": orden["total_cop"],
                    "consecutivo_recibo": rec["consecutivo"] if rec else None,
                    "idempotente": True,
                    "mensaje": "El pago de esta orden ya fue procesado anteriormente."
                }

            # Validar transición en la máquina de estados
            pm_adapter.validar_transicion_estado(orden["estado"], "pagado")

            # 3. Invocar adaptador de pago
            ref_ext = f"ref_sim_{uuid.uuid4().hex[:10]}"
            resultado_pago = _simulador_pagos.confirmar(
                referencia_externa=ref_ext,
                datos_pago={
                    "orden_id": orden_id,
                    "monto_cop": orden["total_cop"],
                    "numero_tarjeta": numero_tarjeta,
                    "idempotency_key": idempotency_key
                }
            )

            if resultado_pago["estado"] != "pagado":
                # Pago declinado o pendiente
                cursor.execute("UPDATE ordenes SET estado = ?, updated_at = ? WHERE id = ?",
                               (resultado_pago["estado"], ahora, orden_id))
                cursor.execute("""
                    UPDATE pagos SET estado = ?, codigo_error = ?, referencia_externa = ?, updated_at = ?
                    WHERE orden_id = ?
                """, (resultado_pago["estado"], resultado_pago.get("codigo_error"), ref_ext, ahora, orden_id))
                conn.commit()
                return {
                    "estado": resultado_pago["estado"],
                    "codigo_error": resultado_pago.get("codigo_error"),
                    "mensaje": resultado_pago.get("mensaje")
                }

            # 4. Caso Especial: El pago fue aprobado, pero ¿ya venció la retención de 12 min?
            if ahora > orden["bloqueado_hasta"]:
                # Verificar si el asiento fue tomado por otro cliente
                cursor.execute("""
                    SELECT 1 FROM manifiesto WHERE vuelo_codigo = ? AND asiento = ?
                """, (orden["vuelo_codigo"], orden["asiento_id"]))
                if cursor.fetchone():
                    # ASIENTO OCUPADO -> REEMBOLSO AUTOMÁTICO INMEDIATO (CERO DOBLE VENTA)
                    cursor.execute("UPDATE ordenes SET estado = 'expirado', updated_at = ? WHERE id = ?", (ahora, orden_id))
                    cursor.execute("""
                        UPDATE pagos SET estado = 'reembolsado', codigo_error = 'RETENCION_EXPIRADA_ASIENTO_OCUPADO',
                                         referencia_externa = ?, updated_at = ?
                        WHERE orden_id = ?
                    """, (ref_ext, ahora, orden_id))

                    ref_id = f"ref_auto_{uuid.uuid4().hex[:8]}"
                    cursor.execute("""
                        INSERT INTO reembolsos (id, pago_id, orden_id, monto_cop, motivo, autorizado_por, created_at)
                        VALUES (?, ?, ?, ?, 'Reembolso automático: pago recibido posterior a la expiración de la retención y asiento ocupado.', 'SISTEMA_AUTO', ?)
                    """, (ref_id, resultado_pago["id"], orden_id, orden["total_cop"], ahora))

                    cursor.execute("""
                        INSERT INTO pago_eventos (pago_id, estado_anterior, estado_nuevo, origen, detalles, created_at)
                        VALUES (?, 'pagado', 'reembolsado', 'auto_expiracion_asiento_ocupado', '{"motivo": "asiento reocupado"}', ?)
                    """, (resultado_pago["id"], ahora))

                    conn.commit()
                    return {
                        "estado": "reembolsado",
                        "codigo_error": "RETENCION_EXPIRADA_ASIENTO_OCUPADO",
                        "mensaje": "La retención de 12 minutos expiró y el asiento fue ocupado. Se generó un reembolso automático integral."
                    }

            # 5. Éxito: Confirmar orden y persistir boleto
            cursor.execute("UPDATE ordenes SET estado = 'pagado', updated_at = ? WHERE id = ?", (ahora, orden_id))
            cursor.execute("""
                UPDATE pagos SET estado = 'pagado', marca = ?, ultimos_4 = ?, referencia_externa = ?, updated_at = ?
                WHERE orden_id = ?
            """, (resultado_pago["marca"], resultado_pago["ultimos_4"], ref_ext, ahora, orden_id))

            # Bitácora inmutable append-only
            cursor.execute("""
                INSERT INTO pago_eventos (pago_id, estado_anterior, estado_nuevo, origen, detalles, created_at)
                VALUES (?, 'pendiente', 'pagado', 'procesar_pago_atomic', '{"metodo": "tarjeta"}', ?)
            """, (resultado_pago["id"], ahora))

            # Consecutivo atómico de recibo
            cursor.execute("SELECT COUNT(*) FROM recibos")
            consecutivo_num = cursor.fetchone()[0] + 1
            consecutivo = f"REC-BOG-{consecutivo_num:06d}"
            cursor.execute("""
                INSERT INTO recibos (consecutivo, aeropuerto_codigo, orden_id, pnr, monto_total_cop, created_at)
                VALUES (?, 'BOG', ?, ?, ?, ?)
            """, (consecutivo, orden_id, orden["pnr"], orden["total_cop"], ahora))

            # Asegurar pasajero en la tabla pasajeros para satisfacer la clave foránea
            cursor.execute("""
                INSERT OR IGNORE INTO pasajeros (documento, nombre, nacionalidad, categoria_viajero, vuelo_asignado)
                VALUES (?, ?, 'Colombia', 'Estándar', ?)
            """, (orden["documento_pasajero"], orden["nombre_pasajero"], orden["vuelo_codigo"]))
            cursor.execute("UPDATE pasajeros SET vuelo_asignado = ? WHERE documento = ?",
                           (orden["vuelo_codigo"], orden["documento_pasajero"]))

            # Persistir en manifiesto
            cursor.execute("""
                INSERT INTO manifiesto (
                    vuelo_codigo, pasajero_doc, pasajero_nombre, asiento,
                    hora_checkin_12h, categoria, clase_cabina, tarifa_pagada_cop
                ) VALUES (?, ?, ?, ?, ?, 'Estándar', 'Estándar', ?)
            """, (
                orden["vuelo_codigo"], orden["documento_pasajero"], orden["nombre_pasajero"],
                orden["asiento_id"], datetime.now().strftime('%I:%M %p'), orden["total_cop"]
            ))

            # Registrar en bitácora histórica de pagos
            cursor.execute("""
                INSERT INTO pasajeros_recientes_pagos (
                    documento, nombre_completo, nacionalidad, categoria, vuelo_id,
                    origen_destino, asiento, metodo_pago, monto_cop, referencia_pago,
                    estado_embarque, fecha_hora_registro
                ) VALUES (?, ?, 'Colombia', 'Estándar', ?, 'BOG - Salida', ?, ?, ?, ?, 'Confirmado', ?)
            """, (
                orden["documento_pasajero"], orden["nombre_pasajero"], orden["vuelo_codigo"],
                orden["asiento_id"], f"{metodo_pago} (•••• {resultado_pago['ultimos_4']})",
                orden["total_cop"], orden["pnr"], datetime.now().strftime('%Y-%m-%d • %I:%M %p')
            ))

            conn.commit()

            return {
                "estado": "pagado",
                "pnr": orden["pnr"],
                "orden_id": orden_id,
                "vuelo_codigo": orden["vuelo_codigo"],
                "asiento_id": orden["asiento_id"],
                "pasajero_nombre": orden["nombre_pasajero"],
                "documento": orden["documento_pasajero"],
                "total_cop": orden["total_cop"],
                "marca_tarjeta": resultado_pago["marca"],
                "ultimos_4": resultado_pago["ultimos_4"],
                "consecutivo_recibo": consecutivo,
                "mensaje": "¡Pago confirmado y tiquete emitido exitosamente!"
            }
    finally:
        conn.close()


def reembolsar_orden_atomic(orden_id: str, motivo: str, usuario_rol: str) -> Dict[str, Any]:
    """
    Ejecuta un reembolso autorizado exclusivamente por un usuario con rol 'integral'.
    Actualiza la máquina de estados, audita la transacción y libera el asiento.
    """
    if str(usuario_rol).strip().lower() != "integral":
        raise PermissionError("Acceso denegado: Únicamente los administradores con rol Integral pueden autorizar reembolsos.")

    if not motivo or not str(motivo).strip():
        raise ValueError("El motivo del reembolso es obligatorio para auditoría contable.")

    ahora = int(time.time())
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM ordenes WHERE id = ?", (orden_id,))
            orden = cursor.fetchone()
            if not orden:
                raise ValueError("Orden no encontrada.")

            pm_adapter.validar_transicion_estado(orden["estado"], "reembolsado")

            cursor.execute("SELECT * FROM pagos WHERE orden_id = ?", (orden_id,))
            pago = cursor.fetchone()
            pago_id = pago["id"] if pago else f"pay_{uuid.uuid4().hex[:8]}"

            # Actualizar orden y pago
            cursor.execute("UPDATE ordenes SET estado = 'cancelado', updated_at = ? WHERE id = ?", (ahora, orden_id))
            cursor.execute("UPDATE pagos SET estado = 'reembolsado', updated_at = ? WHERE orden_id = ?", (ahora, orden_id))

            # Liberar asiento del manifiesto
            cursor.execute("DELETE FROM manifiesto WHERE vuelo_codigo = ? AND asiento = ?",
                           (orden["vuelo_codigo"], orden["asiento_id"]))

            # Insertar registro de reembolso
            ref_id = f"ref_{uuid.uuid4().hex[:10]}"
            cursor.execute("""
                INSERT INTO reembolsos (id, pago_id, orden_id, monto_cop, motivo, autorizado_por, created_at)
                VALUES (?, ?, ?, ?, ?, 'integral_admin', ?)
            """, (ref_id, pago_id, orden_id, orden["total_cop"], str(motivo).strip(), ahora))

            # Bitácora inmutable
            cursor.execute("""
                INSERT INTO pago_eventos (pago_id, estado_anterior, estado_nuevo, origen, detalles, created_at)
                VALUES (?, 'pagado', 'reembolsado', 'admin_integral', ?, ?)
            """, (pago_id, json.dumps({"motivo": motivo, "autorizado_por": "integral"}), ahora))

            conn.commit()

            return {
                "reembolso_id": ref_id,
                "orden_id": orden_id,
                "monto_reembolsado_cop": orden["total_cop"],
                "estado": "reembolsado",
                "motivo": motivo,
                "mensaje": "Reembolso procesado exitosamente y asiento liberado."
            }
    finally:
        conn.close()


def obtener_recibo_atomic(orden_id: str) -> Optional[Dict[str, Any]]:
    """Recupera la información completa de facturación y recibo consecutivo de una orden."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.consecutivo, r.aeropuerto_codigo, r.monto_total_cop, r.created_at,
                   o.pnr, o.vuelo_codigo, o.asiento_id, o.documento_pasajero, o.nombre_pasajero,
                   o.tarifa_base_cop, o.tarifa_admin_cop, o.tasa_aeroportuaria_cop, o.iva_cop,
                   p.marca, p.ultimos_4, p.proveedor
            FROM recibos r
            JOIN ordenes o ON o.id = r.orden_id
            LEFT JOIN pagos p ON p.orden_id = o.id
            WHERE r.orden_id = ?
        """, (orden_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def obtener_reporte_conciliacion_atomic() -> Dict[str, Any]:
    """Compara pagos aprobados contra reservas en manifiesto y alerta sobre cualquier discrepancia."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*), COALESCE(SUM(monto_cop), 0) FROM pagos WHERE estado = 'pagado'")
        total_pagos, monto_pagos = cursor.fetchone()

        cursor.execute("SELECT COUNT(*), COALESCE(SUM(tarifa_pagada_cop), 0) FROM manifiesto")
        total_manifiesto, monto_manifiesto = cursor.fetchone()

        cursor.execute("SELECT COUNT(*), COALESCE(SUM(monto_cop), 0) FROM reembolsos")
        total_reembolsos, monto_reembolsos = cursor.fetchone()

        discrepancia = (total_pagos - total_reembolsos) != total_manifiesto

        return {
            "total_transacciones_pagadas": total_pagos,
            "monto_total_pagado_cop": monto_pagos,
            "total_asientos_confirmados": total_manifiesto,
            "monto_total_manifiesto_cop": monto_manifiesto,
            "total_reembolsos": total_reembolsos,
            "monto_total_reembolsos_cop": monto_reembolsos,
            "conciliado": not discrepancia,
            "alerta_discrepancia": discrepancia
        }
    finally:
        conn.close()


# =============================================================================
# GESTIÓN Y PERSISTENCIA DE USUARIOS Y AUTENTICACIÓN
# =============================================================================

def registrar_nuevo_usuario(nombre: str, email: str, password: str, rol: str = "pasajero") -> Dict[str, Any]:
    """Registra un nuevo usuario en la base de datos con validación y hashing seguro."""
    email_clean = email.strip().lower()
    nombre_clean = nombre.strip()

    if not email_clean or not password or not nombre_clean:
        return {"exito": False, "error": "Todos los campos (nombre, correo y contraseña) son obligatorios."}

    if len(password) < 6:
        return {"exito": False, "error": "La contraseña debe tener al menos 6 caracteres."}

    init_db()
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email_clean,))
            if cursor.fetchone():
                return {"exito": False, "error": "El correo electrónico ya se encuentra registrado."}

            user_id = f"usr-pax-{uuid.uuid4().hex[:8]}"
            p_hash = generate_password_hash(password)
            cursor.execute(
                "INSERT INTO usuarios (id, nombre, email, password_hash, rol) VALUES (?, ?, ?, ?, ?)",
                (user_id, nombre_clean, email_clean, p_hash, rol)
            )
            return {
                "exito": True,
                "usuario": {
                    "id": user_id,
                    "nombre": nombre_clean,
                    "email": email_clean,
                    "rol": rol
                }
            }
    finally:
        conn.close()


def autenticar_usuario_bd(email: str, password: str, rol_solicitado: str = None) -> Dict[str, Any]:
    """Valida credenciales de usuario contra la base de datos SQLite/MySQL."""
    init_db()
    email_clean = email.strip().lower()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, nombre, email, password_hash, rol FROM usuarios WHERE email = ?", (email_clean,))
        row = cursor.fetchone()
        if not row:
            return {"exito": False, "error": "Credenciales inválidas. Verifica tu correo y contraseña."}

        if not check_password_hash(row["password_hash"], password):
            return {"exito": False, "error": "Contraseña incorrecta."}

        rol_usuario = "admin" if row["rol"] in ("admin", "integral") else row["rol"]
        if rol_solicitado and rol_solicitado != "pasajero":
            rol_sol_norm = "admin" if rol_solicitado in ("admin", "integral") else rol_solicitado
            if rol_sol_norm != rol_usuario:
                return {"exito": False, "error": f"Acceso denegado: El usuario no tiene rol {rol_solicitado}."}

        return {
            "exito": True,
            "usuario": {
                "id": row["id"],
                "nombre": row["nombre"],
                "email": row["email"],
                "rol": rol_usuario
            }
        }
    finally:
        conn.close()


def listar_usuarios_registrados() -> list:
    """Devuelve la lista de usuarios registrados para auditoría y visualización."""
    init_db()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, nombre, email, rol, creado_en FROM usuarios ORDER BY creado_en DESC")
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def _cli() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Utilidades oficiales de la base de datos AERO FLOW AIRLINES."
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Restaura la semilla limpia oficial (1 vuelo AF1001 + 26 pasajeros y pagos).",
    )
    parser.add_argument(
        "--seed-si-vacia", action="store_true",
        help="Pobla la semilla solo si la base de datos está totalmente vacía.",
    )
    parser.add_argument("--stats", action="store_true", help="Muestra conteos operativos.")
    args = parser.parse_args()

    if args.reset:
        reiniciar_semilla_limpia()
        print("[OK] Semilla limpia restaurada (reinicia el servidor para refrescar la memoria).")
    elif args.seed_si_vacia:
        hubo_semilla = verificar_y_poblar_semilla()
        print("[OK] Semilla poblada." if hubo_semilla else "[INFO] La base de datos ya contiene operación; no se alteró.")
    else:
        if not args.stats:
            print("[INFO] Sin acción solicitada. Usa --reset, --seed-si-vacia u --stats.")

    init_db()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        stats = {}
        for tabla in ("vuelos", "pasajeros", "manifiesto", "cola_standby", "pasajeros_recientes_pagos"):
            cursor.execute(f"SELECT COUNT(*) FROM {tabla};")
            stats[tabla] = cursor.fetchone()[0]
    finally:
        conn.close()

    print(f"[DB] Base de datos: {DB_PATH}")
    print("[STATS] Conteo por tabla:", stats)


if __name__ == "__main__":
    _cli()


