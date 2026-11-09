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


if __name__ == "__main__":
    unittest.main(verbosity=2)
