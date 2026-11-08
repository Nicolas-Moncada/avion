"""
=============================================================================
  Database Manager — Capa de Persistencia SQLite (AERO FLOW AIRLINES)
  Precios en COP, rutas Avianca/AERO FLOW y horarios 12h AM/PM.
  Semilla limpia: 1 Vuelo Activo de Prueba con 26 Pasajeros y Pagos Registrados.
=============================================================================
"""

import sqlite3
import os
from datetime import datetime
from typing import Tuple
from data_structures.hash_map import TablaHashVuelos
from data_structures.avl_tree import ArbolAVLPasajeros
from data_structures.linked_list import ListaEnlazadaManifiesto
from data_structures.fifo_queue import ColaFIFO
from fleet_catalog import CATALOGO_AERONAVES, calcular_desglose_cop

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
                estado TEXT NOT NULL
            );
            """)

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
                FOREIGN KEY (vuelo_codigo) REFERENCES vuelos(codigo),
                FOREIGN KEY (pasajero_doc) REFERENCES pasajeros(documento)
            );
            """)

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

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS lista_espera (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vuelo_codigo TEXT NOT NULL,
                pasajero_doc TEXT NOT NULL,
                pasajero_nombre TEXT NOT NULL,
                categoria TEXT NOT NULL,
                hora_ingreso_12h TEXT NOT NULL
            );
            """)

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
            _crear_indices(cursor)
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
                tarifa_pagada=m.get('tarifa_pagada_cop', 780000.0)
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
                                    fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    estado=excluded.estado
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
                v.get('estado') or 'Check-in abierto'
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
                float(nodo_dict.get('tarifa_pagada_cop') or nodo_dict.get('tarifa_pagada') or 780000.0)
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
            cursor.execute("""
                DELETE FROM manifiesto WHERE vuelo_codigo = ? AND pasajero_doc = ?
            """, (str(vuelo_codigo).strip().upper(), str(pasajero_doc).strip()))
            cursor.execute("UPDATE pasajeros SET vuelo_asignado = NULL WHERE documento = ?", (str(pasajero_doc).strip(),))
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
            cursor.execute("DELETE FROM lista_espera WHERE pasajero_doc = ?", (doc,))
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

            cursor.execute("""
                INSERT INTO lista_espera (vuelo_codigo, pasajero_doc, pasajero_nombre, categoria, hora_ingreso_12h)
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
            cursor.execute("""
                DELETE FROM lista_espera WHERE vuelo_codigo = ? AND pasajero_doc = ?
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
                float(pago.get('monto_cop') or 1820000.0),
                pago.get('referencia_pago') or '#AF-1001-CO',
                pago.get('estado_embarque') or 'Confirmado',
                pago.get('fecha_hora_registro') or '2026-10-22 • 11:00 AM'
            ))
            conn.commit()
    finally:
        conn.close()

def obtener_pasajeros_recientes_pagos():
    init_db()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pasajeros_recientes_pagos ORDER BY id DESC")
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    finally:
        conn.close()

def actualizar_estado_embarque_pago(vuelo_id: str, documento: str, nuevo_estado: str):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = ?
                WHERE UPPER(vuelo_id) = ? AND documento = ?
            """, (nuevo_estado, str(vuelo_id).strip().upper(), str(documento).strip()))
            conn.commit()
    finally:
        conn.close()

def actualizar_todos_embarcados_vuelo(vuelo_id: str, nuevo_estado: str = 'EMBARCADO'):
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE pasajeros_recientes_pagos
                SET estado_embarque = ?
                WHERE UPPER(vuelo_id) = ?
            """, (nuevo_estado, str(vuelo_id).strip().upper()))
            conn.commit()
    finally:
        conn.close()

def obtener_documentos_embarcados_vuelo(vuelo_id: str) -> set:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT documento FROM pasajeros_recientes_pagos
            WHERE UPPER(vuelo_id) = ? AND UPPER(estado_embarque) IN ('ABORDADO', 'EMBARCADO')
        """, (str(vuelo_id).strip().upper(),))
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
    ("101829384", "Carlos Alberto Mendoza", "Colombia", "VIP", "1A", "Tarjeta Débito/Crédito Visa (•••• 4242)", 3850000.0, "08:15 AM"),
    ("102938475", "Valeria Sofía Restrepo", "Colombia", "VIP", "1B", "PSE Bancolombia Transferencia", 3850000.0, "08:20 AM"),
    # Fila 2 VIP
    ("103847561", "Andrés Felipe Gómez", "Colombia", "VIP", "2A", "Tarjeta Débito/Crédito Mastercard (•••• 8901)", 3850000.0, "08:35 AM"),
    ("104958672", "Mariana Lucía Morales", "Colombia", "VIP", "2B", "Millas AeroFlow Club (65.000 Millas)", 3850000.0, "08:45 AM"),
    # Fila 3 VIP
    ("105748392", "Juan Sebastián Herrera", "Colombia", "VIP", "3A", "Tarjeta Débito/Crédito Visa (•••• 1122)", 3850000.0, "08:50 AM"),
    ("106839201", "Elena Beatriz Rojas", "España", "Estándar", "3B", "PSE Davivienda / DaviPlata", 3850000.0, "09:00 AM"),

    # Fila 4 Economy
    ("107294810", "Mateo David Silva", "Chile", "Estándar", "4A", "Tarjeta Débito/Crédito Visa (•••• 3344)", 1820000.0, "09:05 AM"),
    ("108395019", "Gabriela Andrea Vega", "México", "Estándar", "4B", "PSE Nequi", 1820000.0, "09:10 AM"),
    ("109485720", "Rodrigo Paz Quintana", "Argentina", "Estándar", "4C", "Tarjeta Débito/Crédito Mastercard (•••• 5566)", 1820000.0, "09:15 AM"),
    ("110394857", "Diana Patricia Ramos", "Colombia", "Estándar", "4D", "PSE Nu Colombia", 1820000.0, "09:20 AM"),

    # Fila 5 Economy
    ("111849302", "Santiago Murillo Cárdenas", "Colombia", "Estándar", "5A", "Tarjeta Débito/Crédito Visa (•••• 7788)", 1820000.0, "09:25 AM"),
    ("112948571", "Camila Isabel Castillo", "Panamá", "Estándar", "5B", "PSE Banco de Bogotá", 1820000.0, "09:30 AM"),
    ("113049582", "Nicolás Eduardo Arango", "Colombia", "Estándar", "5C", "Millas AeroFlow Club (28.500 Millas)", 1820000.0, "09:35 AM"),
    ("114958673", "Isabella María Torres", "Colombia", "Estándar", "5D", "Tarjeta Débito/Crédito Visa (•••• 9900)", 1820000.0, "09:40 AM"),

    # Fila 6 Economy
    ("115849301", "Alejandro José Castro", "Perú", "Estándar", "6A", "PSE Scotiabank Colpatria", 1820000.0, "09:42 AM"),
    ("116938472", "Sofía Alejandra Vargas", "Colombia", "Estándar", "6B", "Tarjeta Débito/Crédito Mastercard (•••• 2233)", 1820000.0, "09:45 AM"),
    ("117849203", "Daniel Esteban Méndez", "Ecuador", "Estándar", "6C", "PSE BBVA Colombia", 1820000.0, "09:48 AM"),
    ("118294857", "Luciana del Pilar Rios", "Colombia", "Estándar", "6D", "Tarjeta Débito/Crédito Visa (•••• 4455)", 1820000.0, "09:50 AM"),

    # Fila 7 Economy
    ("119384756", "Felipe Ignacio Navas", "Chile", "Estándar", "7A", "PSE Dale!", 1820000.0, "09:52 AM"),
    ("120495837", "Paula Daniela Pinzón", "Colombia", "Estándar", "7B", "Tarjeta Débito/Crédito Visa (•••• 6677)", 1820000.0, "09:55 AM"),
    ("121948573", "Martín Alonso Barreto", "Uruguay", "Estándar", "7C", "PSE Lulo Bank", 1820000.0, "09:58 AM"),
    ("122839485", "Catalina María Osorio", "Colombia", "Estándar", "7D", "Tarjeta Débito/Crédito Mastercard (•••• 8899)", 1820000.0, "10:00 AM"),

    # Fila 8 Economy
    ("123847592", "Joaquín Manuel Pardo", "Colombia", "Estándar", "8A", "Millas AeroFlow Club (28.500 Millas)", 1820000.0, "10:02 AM"),
    ("124958371", "Manuela Mercedes Cruz", "Guatemala", "Estándar", "8B", "Tarjeta Débito/Crédito Visa (•••• 1010)", 1820000.0, "10:05 AM"),
    ("125839402", "Samuel David Cifuentes", "Colombia", "Estándar", "8C", "PSE Bancolombia", 1820000.0, "10:08 AM"),
    ("126485930", "Emilia Rosa Salcedo", "Colombia", "Estándar", "8D", "Tarjeta Débito/Crédito Visa (•••• 2020)", 1820000.0, "10:10 AM")
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
            cursor.execute("DELETE FROM lista_espera;")
            cursor.execute("DELETE FROM manifiesto;")
            cursor.execute("DELETE FROM pasajeros_recientes_pagos;")
            cursor.execute("DELETE FROM pasajeros;")
            cursor.execute("DELETE FROM vuelos;")
            _crear_indices(cursor)

            fecha_salida_semilla = datetime.now().date().isoformat()

            # Catálogo oficial de vuelos comerciales activos
            vuelos_base = [
                (
                    "AF1001",
                    "BOG - Bogotá El Dorado",
                    "MAD - Madrid Barajas",
                    "Airbus A319 Corporate",
                    "09h 45m",
                    8034,
                    fecha_salida_semilla,
                    "11:00 AM",
                    "05:45 AM",
                    "B-01",
                    26,
                    "Embarcando"
                ),
                (
                    "AF2020",
                    "BOG - Bogotá El Dorado",
                    "MIA - Miami International",
                    "Airbus A320neo",
                    "04h 10m",
                    2435,
                    fecha_salida_semilla,
                    "01:30 PM",
                    "05:40 PM",
                    "B-04",
                    36,
                    "Check-in abierto"
                ),
                (
                    "AF3022",
                    "BOG - Bogotá El Dorado",
                    "JFK - Nueva York John F. Kennedy",
                    "Boeing 787-8 Dreamliner",
                    "05h 50m",
                    3995,
                    fecha_salida_semilla,
                    "03:15 PM",
                    "09:05 PM",
                    "A-02",
                    36,
                    "Check-in abierto"
                ),
                (
                    "AF4055",
                    "BOG - Bogotá El Dorado",
                    "CTG - Cartagena Rafael Núñez",
                    "Airbus A320neo",
                    "01h 25m",
                    650,
                    fecha_salida_semilla,
                    "05:00 PM",
                    "06:25 PM",
                    "C-01",
                    36,
                    "Check-in abierto"
                ),
                (
                    "AF5088",
                    "BOG - Bogotá El Dorado",
                    "MEX - Ciudad de México Benito Juárez",
                    "Airbus A319 Corporate",
                    "04h 45m",
                    3160,
                    fecha_salida_semilla,
                    "07:30 PM",
                    "12:15 AM",
                    "B-06",
                    26,
                    "Check-in abierto"
                )
            ]

            cursor.executemany("""
                INSERT INTO vuelos (codigo, origen, destino, tipo_aeronave, duracion_estimada, distancia_km,
                                    fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, vuelos_base)

            # 3. Inserción atómica de los 26 Pasajeros, Asientos en Manifiesto y Pagos Recientes para AF1001
            for idx, (doc, nombre, nac, cat, asiento, metodo, monto, hora_ck) in enumerate(PASAJEROS_SEMILLA_26, start=1):
                ref_pago = f"AF-1001-{(idx * 179) % 8999 + 1000}"
                clase = "VIP" if asiento in ("1A", "1B", "2A", "2B", "3A", "3B") else "Estándar"

                cursor.execute("""
                    INSERT INTO pasajeros (documento, nombre, nacionalidad, categoria_viajero, vuelo_asignado)
                    VALUES (?, ?, ?, ?, ?)
                """, (doc, nombre, nac, cat, "AF1001"))

                cursor.execute("""
                    INSERT INTO manifiesto (vuelo_codigo, pasajero_doc, pasajero_nombre, asiento,
                                            hora_checkin_12h, categoria, clase_cabina, tarifa_pagada_cop)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, ("AF1001", doc, nombre, asiento, hora_ck, cat, clase, monto))

                cursor.execute("""
                    INSERT INTO pasajeros_recientes_pagos (
                        documento, nombre_completo, nacionalidad, categoria, vuelo_id,
                        origen_destino, asiento, metodo_pago, monto_cop, referencia_pago,
                        estado_embarque, fecha_hora_registro
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    doc,
                    nombre,
                    nac,
                    cat,
                    "AF1001",
                    "BOG ✈ MAD",
                    asiento,
                    metodo,
                    monto,
                    ref_pago,
                    "Confirmado",
                    f"{fecha_salida_semilla} • {hora_ck}"
                ))

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
    return False


# ============================================================
# CLI OPERATIVO — python database.py [--reset | --stats | --seed-si-vacia]
# ============================================================
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


