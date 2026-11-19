"""
=============================================================================
AERO FLOW AIRLINES — Semilla de 2 Vuelos al 100% de Capacidad (Idempotente)
Configura y llena al 100% de ocupación real:
1. Vuelo Nacional: AF4055 (Bogotá -> Cartagena) - 36 asientos (Airbus A320neo)
2. Vuelo Internacional: AF2020 (Bogotá -> Miami) - 36 asientos (Airbus A320neo)

Ambos vuelos quedan en estado 'Embarcando', con fecha vigente (hoy + 1 día),
puerta asignada y 0% de pasajeros abordados (todos en 'Check-in Realizado').
=============================================================================
"""
import os
import sys
import sqlite3
import random
import string
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "aerocore.db")

NOMBRES_POOL = [
    "Alejandro Gómez", "Valentina Rodríguez", "Mateo Restrepo", "Camila Morales",
    "Sebastián Herrera", "Mariana Vargas", "Santiago Castro", "Daniela Cárdenas",
    "Nicolás Torres", "Luciana Pérez", "Samuel Jiménez", "Sofía Ríos",
    "Gabriel Giraldo", "Isabella Molina", "Andrés Sánchez", "Gabriela Gutiérrez",
    "Felipe Ramírez", "Juliana Ospina", "David Navarro", "Paula Duque",
    "Esteban Londoño", "Valeria Bedoya", "Julián Cardona", "Manuela Valencia",
    "Camilo Mejía", "Catalina Montoya", "Diego Jaramillo", "Carolina Henao",
    "Juan Pablo Zapata", "Natalia Correa", "Tomás Rendón", "Laura Ochoa",
    "Lucas Vélez", "Andrea Quintero", "Simón Tamayo", "Sara Echeverri"
]

NOMBRES_POOL_INT = [
    "Michael Brown", "Emma Wilson", "Alexander Smith", "Olivia Davis",
    "Daniel Johnson", "Sophia Miller", "William Taylor", "Ava Anderson",
    "James Thomas", "Mia Martinez", "Benjamin White", "Charlotte Harris",
    "Lucas Clark", "Amelia Lewis", "Henry Robinson", "Harper Walker",
    "Alexander Hall", "Evelyn Allen", "Sebastian Young", "Abigail King",
    "Matthew Wright", "Emily Scott", "Samuel Green", "Elizabeth Baker",
    "David Adams", "Sofia Nelson", "Joseph Carter", "Avery Mitchell",
    "Carter Perez", "Ella Roberts", "Luke Turner", "Scarlett Phillips",
    "Gabriel Campbell", "Chloe Parker", "Anthony Evans", "Victoria Edwards"
]

# 36 Asientos del Airbus A320neo (8 VIP + 28 Economy)
ASIENTOS_A320 = [
    # 8 VIP (Filas 1 a 4)
    {"asiento": "1A", "fila": 1, "col": "A", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "1B", "fila": 1, "col": "B", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "2A", "fila": 2, "col": "A", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "2B", "fila": 2, "col": "B", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "3A", "fila": 3, "col": "A", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "3B", "fila": 3, "col": "B", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "4A", "fila": 4, "col": "A", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    {"asiento": "4B", "fila": 4, "col": "B", "clase": "VIP", "cat": "VIP", "grupo": "Grupo 1 Prioritario"},
    # 28 Economy (Filas 5 a 11)
    {"asiento": "5A", "fila": 5, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "5B", "fila": 5, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "5C", "fila": 5, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "5D", "fila": 5, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "6A", "fila": 6, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "6B", "fila": 6, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "6C", "fila": 6, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "6D", "fila": 6, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "7A", "fila": 7, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "7B", "fila": 7, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "7C", "fila": 7, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "7D", "fila": 7, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "8A", "fila": 8, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "8B", "fila": 8, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "8C", "fila": 8, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "8D", "fila": 8, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "9A", "fila": 9, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "9B", "fila": 9, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "9C", "fila": 9, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "9D", "fila": 9, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "10A", "fila": 10, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "10B", "fila": 10, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "10C", "fila": 10, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "10D", "fila": 10, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "11A", "fila": 11, "col": "A", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
    {"asiento": "11B", "fila": 11, "col": "B", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "11C", "fila": 11, "col": "C", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 3 Pasillo"},
    {"asiento": "11D", "fila": 11, "col": "D", "clase": "Estándar", "cat": "Estándar", "grupo": "Grupo 2 Ventana"},
]


def generar_pnr_unico(usados: set) -> str:
    chars = string.ascii_uppercase + "23456789"
    while True:
        pnr = "AF" + "".join(random.choices(chars, k=4))
        if pnr not in usados:
            usados.add(pnr)
            return pnr


def seed_vuelos_completos():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # 1. Purgar bloqueos de asientos vencidos y usuarios de prueba residuales
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='bloqueos_asientos'")
        if cursor.fetchone():
            cursor.execute("DELETE FROM bloqueos_asientos")

        # Limpiar usuarios sintéticos viejos
        cursor.execute("""
            DELETE FROM usuarios
            WHERE email LIKE 'juan.valdez.%'
               OR email LIKE '%@test.com'
               OR email LIKE 'test.delete.%'
               OR email LIKE 'e2e.test.%'
        """)

        # Actualizar categorías coherentes (Londres y Santiago a 'ciudad', no 'playa')
        cursor.execute("UPDATE vuelos SET categoria = 'ciudad' WHERE codigo IN ('AF9689', 'AF7854')")

        fecha_vigente = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        vuelos_config = [
            {
                "codigo": "AF4055",
                "origen": "BOG - Bogotá El Dorado",
                "destino": "CTG - Cartagena Rafael Núñez",
                "tipo_aeronave": "Airbus A320neo",
                "duracion_estimada": "01h 25m",
                "distancia_km": 650,
                "fecha_salida": fecha_vigente,
                "hora_salida_12h": "05:00 PM",
                "hora_llegada_12h": "06:25 PM",
                "puerta": "C-01",
                "capacidad_maxima": 36,
                "estado": "Embarcando",
                "imagen_url": "/api/destinos/CTG/imagen",
                "precio_base_cop": 115000,
                "categoria": "playa",
                "tag_destacado": "Playa favorita (100% Ocupado)"
            },
            {
                "codigo": "AF2020",
                "origen": "BOG - Bogotá El Dorado",
                "destino": "MIA - Miami International",
                "tipo_aeronave": "Airbus A320neo",
                "duracion_estimada": "04h 10m",
                "distancia_km": 2435,
                "fecha_salida": fecha_vigente,
                "hora_salida_12h": "01:30 PM",
                "hora_llegada_12h": "05:40 PM",
                "puerta": "B-04",
                "capacidad_maxima": 36,
                "estado": "Embarcando",
                "imagen_url": "/api/destinos/MIA/imagen",
                "precio_base_cop": 890000,
                "categoria": "playa",
                "tag_destacado": "Internacional (100% Ocupado)"
            }
        ]

        pnrs_usados = set()
        cursor.execute("SELECT codigo_pnr FROM manifiesto WHERE codigo_pnr IS NOT NULL")
        for r in cursor.fetchall():
            if r[0]:
                pnrs_usados.add(r[0])

        for v in vuelos_config:
            cod = v["codigo"]
            # Upsert del vuelo
            cursor.execute("""
                INSERT INTO vuelos (
                    codigo, origen, destino, tipo_aeronave, duracion_estimada, distancia_km,
                    fecha_salida, hora_salida_12h, hora_llegada_12h, puerta, capacidad_maxima, estado,
                    imagen_url, precio_base_cop, categoria, tag_destacado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(codigo) DO UPDATE SET
                    origen=excluded.origen,
                    destino=excluded.destino,
                    tipo_aeronave=excluded.tipo_aeronave,
                    fecha_salida=excluded.fecha_salida,
                    hora_salida_12h=excluded.hora_salida_12h,
                    hora_llegada_12h=excluded.hora_llegada_12h,
                    puerta=excluded.puerta,
                    capacidad_maxima=excluded.capacidad_maxima,
                    estado='Embarcando',
                    precio_base_cop=excluded.precio_base_cop,
                    categoria=excluded.categoria,
                    tag_destacado=excluded.tag_destacado
            """, (
                v["codigo"], v["origen"], v["destino"], v["tipo_aeronave"], v["duracion_estimada"], v["distancia_km"],
                v["fecha_salida"], v["hora_salida_12h"], v["hora_llegada_12h"], v["puerta"], v["capacidad_maxima"], v["estado"],
                v["imagen_url"], v["precio_base_cop"], v["categoria"], v["tag_destacado"]
            ))

            # Limpiar manifiesto y registros previos de este vuelo para garantizar 100% idempotencia
            cursor.execute("DELETE FROM manifiesto WHERE vuelo_codigo = ?", (cod,))
            cursor.execute("DELETE FROM cola_standby WHERE vuelo_codigo = ?", (cod,))
            cursor.execute("DELETE FROM pasajeros_recientes_pagos WHERE vuelo_id = ?", (cod,))

            # Seleccionar pool de nombres
            nombres = NOMBRES_POOL if cod == "AF4055" else NOMBRES_POOL_INT
            doc_base = 1030000000 if cod == "AF4055" else 1040000000

            for idx, seat in enumerate(ASIENTOS_A320):
                doc_pax = str(doc_base + idx + 1)
                nombre_pax = nombres[idx % len(nombres)]
                pnr = generar_pnr_unico(pnrs_usados)
                es_vip = (seat["clase"] == "VIP")
                tarifa_base = 2450000 if es_vip else v["precio_base_cop"]
                tarifa_total = tarifa_base + (158000 + 45000 + int(tarifa_base * 0.19))
                usuario_id = None
                pax_email = None

                # Si es el primer asiento de AF4055 (1A VIP), vincular a Carlos Mendoza (usr-pax-001)
                if cod == "AF4055" and seat["asiento"] == "1A":
                    doc_pax = "101829384"
                    nombre_pax = "Carlos Mendoza"
                    usuario_id = "usr-pax-001"
                    pax_email = "pasajero@aeroflow.com"
                elif cod == "AF4055" and seat["asiento"] == "1B":
                    doc_pax = "20200201"
                    nombre_pax = "Gabriel Restrepo Mejía"

                # 1. Pasajeros
                cursor.execute("""
                    INSERT INTO pasajeros (documento, nombre, nacionalidad, categoria_viajero, vuelo_asignado)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(documento) DO UPDATE SET
                        nombre=excluded.nombre,
                        vuelo_asignado=excluded.vuelo_asignado
                """, (doc_pax, nombre_pax, "Colombiana" if cod == "AF4055" else "Extranjera", seat["cat"], cod))

                # 2. Manifiesto
                cursor.execute("""
                    INSERT INTO manifiesto (
                        vuelo_codigo, pasajero_doc, pasajero_nombre, asiento,
                        hora_checkin_12h, categoria, clase_cabina, tarifa_pagada_cop,
                        estado_embarque, estado_tiquete, codigo_pnr, grupo_abordaje,
                        usuario_id, pasajero_email
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Check-in Realizado', 'Confirmado', ?, ?, ?, ?)
                """, (
                    cod, doc_pax, nombre_pax, seat["asiento"],
                    "07:30 AM", seat["cat"], seat["clase"], tarifa_total,
                    pnr, seat["grupo"], usuario_id, pax_email
                ))

                # 3. Bitácora de pagos
                cursor.execute("""
                    INSERT INTO pasajeros_recientes_pagos (
                        documento, nombre_completo, nacionalidad, categoria,
                        vuelo_id, origen_destino, asiento,
                        metodo_pago, monto_cop, referencia_pago,
                        estado_embarque, fecha_hora_registro
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Tarjeta de Crédito', ?, ?, 'Check-in Realizado', ?)
                """, (
                    doc_pax, nombre_pax, "Colombiana" if cod == "AF4055" else "Extranjera", seat["cat"],
                    cod, f"{v['origen']} -> {v['destino']}", seat["asiento"],
                    tarifa_total, pnr, f"{fecha_vigente} 07:30 AM"
                ))

                # 4. Ordenes
                iva = int(tarifa_base * 0.19)
                orden_id = f"ord_{idx}_{pnr}"
                ahora_ts = int(datetime.now().timestamp())
                cursor.execute("""
                    INSERT INTO ordenes (
                        id, pnr, vuelo_codigo, documento_pasajero, nombre_pasajero,
                        asiento_id, tarifa_base_cop, tarifa_admin_cop, tasa_aeroportuaria_cop,
                        iva_cop, total_cop, estado, bloqueado_hasta, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 45000, 158000, ?, ?, 'PAGADO', ?, ?, ?)
                    ON CONFLICT(pnr) DO UPDATE SET
                        estado='PAGADO'
                """, (
                    orden_id, pnr, cod, doc_pax, nombre_pax,
                    seat["asiento"], tarifa_base, iva, tarifa_total,
                    ahora_ts + 7200, ahora_ts, ahora_ts
                ))

            print(f"[OK] Vuelo {cod} ({v['origen']} -> {v['destino']}): 36 asientos al 100% de capacidad sembrados.")

        conn.commit()
        print("\n=== SEMILLA DE 2 AVIONES AL 100% COMPLETADA EXITOSAMENTE ===")
        return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Error al sembrar vuelos llenos: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    seed_vuelos_completos()
