"""
=============================================================================
  Suite de Pruebas REST — AERO FLOW AIRLINES
  Ejecutar:  python -m unittest discover -s tests -v
  Usa una base de datos temporal (AEROFLOW_DB_PATH) para no tocar la operación.
=============================================================================
"""

import os
import sys
import json
import tempfile
import unittest

# La base de datos temporal DEBE declararse antes de importar la app,
# porque config.py lee las variables de entorno en el arranque.
_TMP_DIR = tempfile.mkdtemp(prefix="aeroflow-tests-")
os.environ["AEROFLOW_DB_PATH"] = os.path.join(_TMP_DIR, "aeroflow-test.db")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module  # noqa: E402
import database as db  # noqa: E402


class AeroFlowAPITestCase(unittest.TestCase):
    """Pruebas de integración del router REST con las estructuras en memoria."""

    @classmethod
    def setUpClass(cls):
        # Semilla limpia y repoblada una sola vez para toda la suite.
        db.reiniciar_semilla_limpia()
        app_module.app.config["TESTING"] = True
        cls.client = app_module.app.test_client()

    # --------------------------------------------------------------- Utilidades
    def get(self, path):
        resp = self.client.get(path)
        return resp.status_code, resp.get_json(silent=True)

    def post(self, path, body=None):
        resp = self.client.post(path, data=json.dumps(body or {}), content_type="application/json")
        return resp.status_code, resp.get_json(silent=True)

    # --------------------------------------------------------------------- Salud
    def test_01_health(self):
        status, data = self.get("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")
        self.assertIn("version", data)

    def test_02_vuelos_semilla(self):
        status, data = self.get("/api/vuelos")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(data["total"], 1)
        codigos = [v["codigo"] for v in data["todos_admin"]]
        self.assertIn("AF1001", codigos)

    # -------------------------------------------------------- Creación de vuelos
    def test_03_crear_vuelo_valido(self):
        status, data = self.post("/api/vuelos", {
            "codigo": "AF2040",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "MIA - Miami International",
            "tipo_aeronave": "Boeing 787 Dreamliner VIP",
            "fecha_salida": "2027-01-15",
            "hora_salida_12h": "07:30 AM",
            "puerta": "C-07",
            "distancia_km": 2420,
        })
        self.assertEqual(status, 201, data)
        self.assertEqual(data["vuelo"]["codigo"], "AF2040")
        # Hora de llegada calculada automáticamente si no se envía
        self.assertTrue(data["vuelo"]["hora_llegada_12h"])

    def test_04_crear_vuelo_duplicado_409(self):
        status, data = self.post("/api/vuelos", {
            "codigo": "AF2040",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "MIA - Miami International",
            "tipo_aeronave": "Boeing 787 Dreamliner VIP",
            "fecha_salida": "2027-01-15",
            "hora_salida_12h": "07:30 AM",
            "puerta": "C-07",
        })
        self.assertEqual(status, 409)

    def test_05_crear_vuelo_invalido_400(self):
        for codigo in ("", "af abc", "A<X9", "9"):
            status, data = self.post("/api/vuelos", {
                "codigo": codigo,
                "origen": "BOG",
                "destino": "MAD",
                "tipo_aeronave": "Airbus A320neo",
                "fecha_salida": "2027-01-15",
                "hora_salida_12h": "07:30 AM",
                "puerta": "C-07",
            })
            self.assertEqual(status, 400, codigo)

    def test_06_crear_vuelo_mismo_origen_400(self):
        status, data = self.post("/api/vuelos", {
            "codigo": "AF9000",
            "origen": "BOG",
            "destino": "BOG",
            "tipo_aeronave": "Airbus A320neo",
            "fecha_salida": "2027-01-15",
            "hora_salida_12h": "07:30 AM",
            "puerta": "C-07",
        })
        self.assertEqual(status, 400)

    # ---------------------------------------------------------- Alta de pasajeros
    def test_07_registrar_pasajero_valido(self):
        status, data = self.post("/api/pasajeros", {
            "documento": "7770001",
            "nombre": "Ana María Rodríguez",
            "nacionalidad": "Colombia",
            "categoria_viajero": "VIP",
        })
        self.assertEqual(status, 201, data)

    def test_08_registrar_pasajero_duplicado_409(self):
        status, _ = self.post("/api/pasajeros", {
            "documento": "7770001",
            "nombre": "Ana María Rodríguez",
        })
        self.assertEqual(status, 409)

    def test_09_registrar_pasajero_invalido_400(self):
        status, _ = self.post("/api/pasajeros", {"documento": "7770002", "nombre": "<script>alert(1)</script>"})
        self.assertEqual(status, 400)
        status, _ = self.post("/api/pasajeros", {"documento": "55", "nombre": "Corto"})  # doc de 2 chars
        self.assertEqual(status, 400)
        status, _ = self.post("/api/pasajeros", {"documento": "7770003", "nombre": "", "categoria_viajero": "Oro"})
        self.assertEqual(status, 400)

    # ------------------------------------------------------------------ Check-in
    def test_10_checkin_confirmado(self):
        self.post("/api/pasajeros", {"documento": "8880001", "nombre": "Camilo Pérez"})
        status, data = self.post("/api/checkin", {
            "codigo_vuelo": "AF2040",
            "documento": "8880001",
            "asiento": "2A",
            "metodo_pago": "Tarjeta Débito/Crédito Visa/Mastercard",
        })
        self.assertIn(status, (200, 201), data)
        self.assertEqual(data["asiento"], "2A")

    def test_11_checkin_duplicado_mismo_vuelo_400(self):
        status, _ = self.post("/api/checkin", {
            "codigo_vuelo": "AF2040",
            "documento": "8880001",
            "asiento": "2B",
        })
        self.assertEqual(status, 400)

    def test_12_checkin_otro_vuelo_activo_409(self):
        self.post("/api/vuelos", {
            "codigo": "AF2041",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "CUN - Cancún",
            "tipo_aeronave": "Airbus A320neo",
            "fecha_salida": "2027-01-16",
            "hora_salida_12h": "09:30 AM",
            "puerta": "D-02",
        })
        status, data = self.post("/api/checkin", {
            "codigo_vuelo": "AF2041",
            "documento": "8880001",  # ya tiene tiquete en AF2040
            "asiento": "3A",
        })
        self.assertEqual(status, 409, data)

    # ------------------------------------------------------- Standby FIFO / ascenso
    def test_13_standby_y_ascenso_por_cancelacion(self):
        # AF1001 viene al 100% (26/26) por diseño de la semilla
        self.post("/api/pasajeros", {"documento": "9990001", "nombre": "Valentina Gómez"})
        status, data = self.post("/api/checkin", {
            "codigo_vuelo": "AF1001",
            "documento": "9990001",
        })
        self.assertEqual(status, 200, data)
        self.assertEqual(data["accion"], "STANDBY_ASIGNADO")
        self.assertEqual(data["posicion_standby"], 1)

        # Cancelar un asiento de la semilla debe ascender al pasajero standby
        status, data = self.post("/api/checkin/cancelar", {
            "codigo_vuelo": "AF1001",
            "documento": "101829384",  # Carlos Mendoza, semilla 1A
        })
        self.assertEqual(status, 200, data)
        self.assertEqual(data.get("ascenso_standby", {}).get("pasajero_doc"), "9990001")

    # -------------------------------------------------------------- Errores REST
    def test_14_api_404_json(self):
        status, data = self.get("/api/vuelos-no-existe")
        self.assertEqual(status, 404)
        self.assertIn("error", data)

    def test_15_buscar_pasajero_inexistente_404(self):
        status, _ = self.get("/api/pasajeros/buscar/1234599999")
        self.assertEqual(status, 404)

    def test_16_body_oversize_413(self):
        resp = self.client.post(
            "/api/vuelos",
            data=json.dumps({"codigo": "AF1024", "blob": "x" * (17 * 1024 * 1024)}),
            content_type="application/json",
        )
        self.assertIn(resp.status_code, (400, 413))

    # -------------------------------------------------- Control Operativo Completo
    def test_17_eliminar_pasajero_libera_recursos(self):
        # Crear pasajero con boleto
        self.post("/api/pasajeros", {
            "documento": "5550001",
            "nombre": "Esteban Morales",
            "categoria_viajero": "VIP",
        })
        status, checkin_data = self.post("/api/checkin", {
            "codigo_vuelo": "AF2040",
            "documento": "5550001",
            "asiento": "1B",
        })
        self.assertIn(status, (200, 201))

        # Eliminarlo de la base de datos y memoria
        status, del_data = self.post("/api/pasajero/eliminar/5550001")
        self.assertEqual(status, 200)
        self.assertTrue(del_data["exito"])

        # Verificar que el pasajero ya no existe en el Árbol AVL
        status, _ = self.get("/api/pasajeros/buscar/5550001")
        self.assertEqual(status, 404)

    def test_18_abordar_individual_siguiente(self):
        # Iniciar embarque en vuelo AF1001 o AF2040
        status, data = self.post("/api/embarque/AF1001/iniciar")
        self.assertIn(status, (200, 400))  # Puede estar ya iniciado o completado

        # Abordar siguiente pasajero 1 a 1
        status, step_data = self.post("/api/embarque/AF1001/abordar-siguiente")
        self.assertEqual(status, 200)
        self.assertIn("progreso", step_data)

    def test_19_cancelar_embarque(self):
        status, data = self.post("/api/embarque/AF1001/cancelar")
        self.assertEqual(status, 200)
        self.assertTrue(data["exito"])
        self.assertEqual(data["estado_vuelo"], "Check-in abierto")

    def test_20_cancelar_vuelo_operador(self):
        self.post("/api/vuelos", {
            "codigo": "AF7777",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "MDE - Medellín",
            "tipo_aeronave": "Airbus A320neo",
            "fecha_salida": "2027-02-01",
            "hora_salida_12h": "10:00 AM",
            "puerta": "A-01",
        })
        status, data = self.post("/api/vuelo/cancelar/AF7777")
        self.assertEqual(status, 200)
        self.assertTrue(data["exito"])
        self.assertIn("CANCELADO", data["estado"])

    def test_21_expirar_vuelo_timeout(self):
        self.post("/api/vuelos", {
            "codigo": "AF8888",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "CTG - Cartagena",
            "tipo_aeronave": "Airbus A320neo",
            "fecha_salida": "2027-02-02",
            "hora_salida_12h": "11:00 AM",
            "puerta": "B-02",
        })
        status, data = self.post("/api/vuelos/AF8888/expirar-y-reemplazar")
        self.assertEqual(status, 200)
        self.assertTrue(data["cancelado_timeout"])
        self.assertEqual(data["estado"], "CANCELADO / EXPIRADO")

    def test_22_cancelar_reserva_y_persistencia_completa(self):
        # Crear pasajero nuevo y asignarlo a AF2040
        self.post("/api/pasajeros", {"documento": "7770001", "nombre": "Lucía Fernanda Ruiz"})
        status, res_chk = self.post("/api/checkin", {
            "codigo_vuelo": "AF2040",
            "documento": "7770001",
            "asiento": "3B",
            "metodo_pago": "PSE",
        })
        self.assertIn(status, (200, 201), res_chk)

        # Cancelar reserva con prefijo CC- para validar normalización y persistencia
        status, res_can = self.post("/api/checkin/cancelar", {
            "codigo_vuelo": "AF2040",
            "documento": "CC-7770001",
        })
        self.assertEqual(status, 200, res_can)
        self.assertTrue(res_can["exito"])

        # Verificar SQLite: eliminado de manifiesto, vuelo_asignado NULL y pago CANCELADO
        conn = db.get_connection()
        try:
            m_row = conn.execute(
                "SELECT * FROM manifiesto WHERE vuelo_codigo = 'AF2040' AND pasajero_doc = '7770001'"
            ).fetchone()
            p_row = conn.execute(
                "SELECT vuelo_asignado FROM pasajeros WHERE documento = '7770001'"
            ).fetchone()
            pago_row = conn.execute(
                "SELECT estado_embarque FROM pasajeros_recientes_pagos WHERE vuelo_id = 'AF2040' AND documento = '7770001' ORDER BY id DESC LIMIT 1"
            ).fetchone()
            self.assertIsNone(m_row)
            self.assertIsNone(p_row["vuelo_asignado"])
            self.assertEqual(pago_row["estado_embarque"], "CANCELADO")
        finally:
            conn.close()

        # Verificar memoria AVL y Lista Enlazada
        nodo_avl, _, _ = app_module.arbol_pasajeros.buscar("7770001")
        self.assertIsNone(nodo_avl.vuelo_asignado)
        self.assertIsNone(app_module.manifiestos["AF2040"].buscar("7770001"))

    def test_23_rechaza_cancelar_abordado(self):
        self.post("/api/pasajeros", {"documento": "7770002", "nombre": "Jorge Luis Navarro"})
        self.post("/api/checkin", {
            "codigo_vuelo": "AF2040",
            "documento": "7770002",
            "asiento": "4A",
        })
        self.post("/api/embarque/AF2040/abordar-pasajero", {
            "documento": "7770002",
            "nombre": "Jorge Luis Navarro",
            "asiento": "4A",
        })
        status, err = self.post("/api/checkin/cancelar", {
            "codigo_vuelo": "AF2040",
            "documento": "7770002",
        })
        self.assertEqual(status, 400, err)
        self.assertIn("abordó", err["error"].lower())

    def test_24_permiso_pasajero_no_puede_cancelar_tercero(self):
        # Pasajero "Carlos Mendoza" intenta cancelar reserva de "Juan Sebastián Herrera" (105748392) en AF1001
        resp = self.client.post(
            "/api/checkin/cancelar",
            data=json.dumps({"codigo_vuelo": "AF1001", "documento": "105748392"}),
            content_type="application/json",
            headers={"X-User-Role": "pasajero", "X-User-Name": "Carlos Mendoza"},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("propias reservas", resp.get_json()["error"].lower())

    def test_25_cancelar_elimina_de_cola_abordaje_en_memoria(self):
        # Iniciar embarque en AF2040 para poblar la ColaFIFO de abordaje en memoria
        self.post("/api/pasajeros", {"documento": "7770003", "nombre": "Sofía Valentina Gil"})
        self.post("/api/checkin", {
            "codigo_vuelo": "AF2040",
            "documento": "7770003",
            "asiento": "5A",
        })
        st_ini, _ = self.post("/api/embarque/AF2040/iniciar")
        self.assertEqual(st_ini, 200)
        self.assertTrue(app_module.colas_embarque["AF2040"].contiene("7770003"))

        version_antes = app_module.state_version
        resp = self.client.post(
            "/api/checkin/cancelar",
            data=json.dumps({"codigo_vuelo": "AF2040", "documento": "7770003"}),
            content_type="application/json",
            headers={"X-User-Role": "admin"},
        )
        self.assertEqual(resp.status_code, 200, resp.get_json())
        self.assertFalse(app_module.colas_embarque["AF2040"].contiene("7770003"))
        self.assertIsNone(app_module.manifiestos["AF2040"].buscar("7770003"))
        self.assertGreaterEqual(app_module.state_version, version_antes)

    def test_26_vuelo_comercial_fecha_caducada_auto_vigente_en_checkin(self):
        vuelo_2025, _ = app_module.tabla_vuelos.buscar("AF2025")
        self.assertIsNotNone(vuelo_2025)
        vuelo_2025["fecha_salida"] = "2020-01-01"
        vuelo_2025["estado"] = "Check-in abierto"

        status, data = self.post("/api/checkin", {
            "codigo_vuelo": "AF2025",
            "documento": "7770004",
            "nombre_nuevo": "Andrea Juliana Torres",
            "asiento": "6A",
            "metodo_pago": "Tarjeta",
        })
        self.assertIn(status, (200, 201), data)
        self.assertEqual(data["asiento"], "6A")
        self.assertGreaterEqual(vuelo_2025["fecha_salida"], app_module.hoy_iso())

    def test_27_pasajeros_recientes_excluye_cancelados(self):
        status, res_can = self.post("/api/checkin/cancelar", {
            "codigo_vuelo": "AF2025",
            "documento": "7770004",
        })
        self.assertEqual(status, 200, res_can)

        st_get, data_rec = self.get("/api/pasajeros-recientes")
        self.assertEqual(st_get, 200)
        docs_activos = [(r["vuelo_id"], r["documento"]) for r in data_rec.get("registros", [])]
        self.assertNotIn(("AF2025", "7770004"), docs_activos)

    def test_28_abordar_bloqueado_para_pasajero_403(self):
        resp1 = self.client.post(
            "/api/embarque/AF1001/abordar-pasajero",
            data=json.dumps({"documento": "102938475", "nombre": "Valeria", "asiento": "1B"}),
            content_type="application/json",
            headers={"X-User-Role": "pasajero"},
        )
        self.assertEqual(resp1.status_code, 403)

        resp2 = self.client.post(
            "/api/embarque/AF1001/abordar-siguiente",
            headers={"X-User-Role": "pasajero"},
        )
        self.assertEqual(resp2.status_code, 403)

    def test_29_mantenimiento_diario_purga_vencidos_y_genera_vuelos(self):
        from datetime import date, timedelta
        ayer = (date.today() - timedelta(days=1)).isoformat()

        # Insertar un vuelo vencido directamente en SQLite y memoria
        vuelo_viejo = {
            "codigo": "AFOLD99",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "CTG - Cartagena",
            "tipo_aeronave": "Airbus A319 Corporate",
            "duracion_estimada": "01h 20m",
            "distancia_km": 650,
            "fecha_salida": ayer,
            "hora_salida_12h": "06:00 AM",
            "hora_llegada_12h": "07:20 AM",
            "puerta": "A-09",
            "capacidad_maxima": 26,
            "estado": "Check-in abierto",
        }
        db.persistir_vuelo(vuelo_viejo)
        app_module.tabla_vuelos.insertar("AFOLD99", vuelo_viejo)

        # Ejecutar mantenimiento diario (mismo hook que corre al iniciar y en GET /api/vuelos)
        app_module.ejecutar_mantenimiento_diario_en_memoria()

        # Verificar que AFOLD99 fue purgado de memoria y SQLite
        v_mem, _ = app_module.tabla_vuelos.buscar("AFOLD99")
        self.assertIsNone(v_mem)
        conn = db.get_connection()
        try:
            row = conn.execute("SELECT 1 FROM vuelos WHERE codigo = 'AFOLD99'").fetchone()
            self.assertIsNone(row)
        finally:
            conn.close()

    def test_30_mapa_avion_consistente_con_checkin(self):
        # Probar Airbus A319 Corporate y Boeing 787-8 Dreamliner contra /api/avion/<cod>/mapa
        self.post("/api/vuelos", {
            "codigo": "AF319T",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "MDE - Medellín",
            "tipo_aeronave": "Airbus A319 Corporate",
            "fecha_salida": "2027-03-01",
            "hora_salida_12h": "10:00 AM",
            "puerta": "B-02",
        })
        st_m, mapa_data = self.get("/api/avion/AF319T/mapa")
        self.assertEqual(st_m, 200)
        asientos = mapa_data["configuracion_aeronave"]["asientos"]
        self.assertEqual(len(asientos), 26)
        ultimo_asiento = asientos[-1]["id"]  # Ej: 8D (el último asiento válido del A319)

        st_c, chk_data = self.post("/api/checkin", {
            "codigo_vuelo": "AF319T",
            "documento": "7770099",
            "nombre_nuevo": "Camila Andrea Gómez",
            "asiento": ultimo_asiento,
            "metodo_pago": "Tarjeta",
        })
        self.assertIn(st_c, (200, 201), chk_data)
        self.assertEqual(chk_data["asiento"], ultimo_asiento)

    def test_31_abordar_pasajero_especifico_y_estado_persistido(self):
        # Crear vuelo y dos pasajeros en el manifiesto
        self.post("/api/vuelos", {
            "codigo": "AF991F",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "CTG - Cartagena",
            "tipo_aeronave": "Airbus A320neo",
            "fecha_salida": "2027-03-02",
            "hora_salida_12h": "09:00 AM",
            "puerta": "B-04",
        })
        for idx, (doc, nom, asi) in enumerate([
            ("888001", "Primer VIP", "1A"),
            ("888002", "Segundo VIP", "1B"),
        ]):
            st_c, data_c = self.post("/api/checkin", {
                "codigo_vuelo": "AF991F",
                "documento": doc,
                "nombre_nuevo": nom,
                "categoria": "VIP",
                "asiento": asi,
                "metodo_pago": "Tarjeta",
            })
            self.assertIn(st_c, (200, 201), data_c)

        # Abordar primero y segundo pasajero vía /abordar-pasajero
        for doc, nom, asi in [("888001", "Primer VIP", "1A"), ("888002", "Segundo VIP", "1B")]:
            resp = self.client.post(
                "/api/embarque/AF991F/abordar-pasajero",
                data=json.dumps({"documento": doc, "nombre": nom, "asiento": asi}),
                content_type="application/json",
                headers={"X-User-Role": "admin"},
            )
            st_b, data_b = resp.status_code, resp.get_json(silent=True)
            self.assertEqual(st_b, 200, data_b)
            self.assertTrue(data_b.get("abordado"))
            self.assertEqual(data_b.get("estado_embarque"), "ABORDADO")

        # Verificar que /api/pasajeros-recientes refleja ABORDADO en ambos
        st_r, rec = self.get("/api/pasajeros-recientes")
        self.assertEqual(st_r, 200)
        estados = {
            r["documento"]: r["estado_embarque"]
            for r in rec["registros"]
            if r["vuelo_id"] == "AF991F"
        }
        self.assertEqual(estados.get("888001"), "ABORDADO")
        self.assertEqual(estados.get("888002"), "ABORDADO")

    def test_32_despegue_atomico_100_porciento_y_siguiente_vuelo(self):
        # Crear vuelo con 2 pasajeros para validar transición atómica al 100% -> DESPEGADO
        self.post("/api/vuelos", {
            "codigo": "AF992D",
            "origen": "BOG - Bogotá El Dorado",
            "destino": "SMR - Santa Marta",
            "tipo_aeronave": "Airbus A320neo",
            "fecha_salida": "2027-03-03",
            "hora_salida_12h": "11:00 AM",
            "puerta": "C-02",
        })
        for doc, nom, asi in [("889001", "Pasajero Uno", "1A"), ("889002", "Pasajero Dos", "1B")]:
            st_c, data_c = self.post("/api/checkin", {
                "codigo_vuelo": "AF992D",
                "documento": doc,
                "nombre_nuevo": nom,
                "categoria": "VIP",
                "asiento": asi,
                "metodo_pago": "Tarjeta",
            })
            self.assertIn(st_c, (200, 201), data_c)

        # Primer pasajero: aún NO despega
        resp1 = self.client.post(
            "/api/embarque/AF992D/abordar-pasajero",
            data=json.dumps({"documento": "889001", "nombre": "Pasajero Uno", "asiento": "1A"}),
            content_type="application/json",
            headers={"X-User-Role": "admin"},
        )
        d1 = resp1.get_json(silent=True)
        self.assertEqual(resp1.status_code, 200)
        self.assertFalse(d1.get("vuelo_despegado"))

        # Segundo (último) pasajero: alcanza 100% -> DESPEGADO atómico y sugiere siguiente vuelo
        resp2 = self.client.post(
            "/api/embarque/AF992D/abordar-pasajero",
            data=json.dumps({"documento": "889002", "nombre": "Pasajero Dos", "asiento": "1B"}),
            content_type="application/json",
            headers={"X-User-Role": "admin"},
        )
        d2 = resp2.get_json(silent=True)
        self.assertEqual(resp2.status_code, 200)
        self.assertTrue(d2.get("vuelo_despegado"))
        self.assertEqual(d2.get("estado_vuelo"), "DESPEGADO")
        self.assertTrue(d2.get("siguiente_vuelo_disponible"))
        self.assertNotEqual(d2.get("siguiente_vuelo_disponible"), "AF992D")

        # Verificar SQLite: vuelo DESPEGADO y manifiesto + pagos en ABORDADO
        conn = db.get_connection()
        try:
            v_row = conn.execute("SELECT estado FROM vuelos WHERE codigo = 'AF992D'").fetchone()
            m_rows = conn.execute("SELECT estado_embarque FROM manifiesto WHERE vuelo_codigo = 'AF992D'").fetchall()
            self.assertIsNotNone(v_row)
            self.assertEqual(v_row[0], "DESPEGADO")
            self.assertEqual([r[0] for r in m_rows], ["ABORDADO", "ABORDADO"])
        finally:
            conn.close()

        # Verificar que intentar reiniciar embarque sobre vuelo DESPEGADO devuelve 400
        resp_ini = self.client.post("/api/embarque/AF992D/iniciar", headers={"X-User-Role": "admin"})
        self.assertEqual(resp_ini.status_code, 400)
        self.assertTrue(resp_ini.get_json(silent=True).get("vuelo_despegado"))

        # Verificar que /api/vuelos separa AF992D en despegados y fuera de vuelos activos
        _, lv = self.get("/api/vuelos")
        activos_cods = [v["codigo"] for v in lv["vuelos"]]
        despegados_cods = [v["codigo"] for v in lv["despegados"]]
        self.assertNotIn("AF992D", activos_cods)
        self.assertIn("AF992D", despegados_cods)

    def test_33_saneamiento_y_consistencia_manifiesto(self):
        # 1. Crear vuelo inconsistente en SQLite (manifiesto sin registro en pasajeros_recientes_pagos)
        conn = db.get_connection()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO vuelos (codigo, origen, destino, tipo_aeronave, duracion_estimada,
                                        distancia_km, fecha_salida, hora_salida_12h, hora_llegada_12h,
                                        puerta, capacidad_maxima, estado)
                    VALUES ('AFBAD1', 'BOG', 'CLO', 'Airbus A320neo', '01h 00m', 300,
                            ?, '10:00 AM', '11:00 AM', 'B-09', 36, 'Check-in abierto')
                    """,
                    (app_module.hoy_iso(),),
                )
                conn.execute(
                    "INSERT OR REPLACE INTO pasajeros (documento, nombre, nacionalidad, categoria_viajero, vuelo_asignado) VALUES ('99112233', 'Huérfano Test', 'Colombia', 'Estándar', 'AFBAD1')"
                )
                conn.execute(
                    """
                    INSERT INTO manifiesto (vuelo_codigo, pasajero_doc, pasajero_nombre, asiento,
                                            hora_checkin_12h, categoria, clase_cabina, tarifa_pagada_cop)
                    VALUES ('AFBAD1', '99112233', 'Huérfano Test', '5A', '10:00 AM', 'Estándar', 'Estándar', 280000)
                    """
                )
        finally:
            conn.close()

        res_san = db.sanear_vuelos_inconsistentes(purgar_despegados=False)
        self.assertIn("AFBAD1", res_san["codigos_eliminados"])

        conn = db.get_connection()
        try:
            v_bad = conn.execute("SELECT 1 FROM vuelos WHERE codigo = 'AFBAD1'").fetchone()
            p_asig = conn.execute("SELECT vuelo_asignado FROM pasajeros WHERE documento = '99112233'").fetchone()
            self.assertIsNone(v_bad)
            self.assertIsNone(p_asig[0])
        finally:
            conn.close()

        # 2. Verificar consistencia 1:1 de /api/vuelos vs /api/vuelos/<cod>/manifiesto en semilla de hoy
        st_m, data_m = self.get("/api/vuelos/AF2025/manifiesto")
        self.assertEqual(st_m, 200)
        self.assertEqual(data_m["total"], len(data_m["pasajeros"]))
        self.assertGreaterEqual(data_m["total"], 4)


if __name__ == "__main__":
    unittest.main(verbosity=2)
