"""
=============================================================================
  Suite de Pruebas Financieras y Motor de Pagos (Fase 2) — AERO FLOW AIRLINES
  Verifica las 8 pruebas obligatorias de concurrencia, idempotencia y pagos.
=============================================================================
"""

import os
import sys
import time
import pytest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module
import database as db
import airport_config
import payments.adapter as pm_adapter
import fleet_catalog as fc


@pytest.fixture
def client():
    app_module.app.config['TESTING'] = True
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def setup_test_flight():
    """Crea un vuelo de prueba limpio para la suite de pagos."""
    codigo = "AFPAY26"
    conn = db.get_connection()
    with conn:
        conn.execute("DELETE FROM recibos WHERE orden_id IN (SELECT id FROM ordenes WHERE vuelo_codigo = ?)", (codigo,))
        conn.execute("DELETE FROM pago_eventos WHERE pago_id IN (SELECT p.id FROM pagos p JOIN ordenes o ON o.id = p.orden_id WHERE o.vuelo_codigo = ?)", (codigo,))
        conn.execute("DELETE FROM reembolsos WHERE orden_id IN (SELECT id FROM ordenes WHERE vuelo_codigo = ?)", (codigo,))
        conn.execute("DELETE FROM pagos WHERE orden_id IN (SELECT id FROM ordenes WHERE vuelo_codigo = ?)", (codigo,))
        conn.execute("DELETE FROM manifiesto WHERE vuelo_codigo = ?", (codigo,))
        conn.execute("DELETE FROM ordenes WHERE vuelo_codigo = ?", (codigo,))

    vuelo = {
        "codigo": codigo,
        "origen": "BOG - Bogotá El Dorado",
        "destino": "MIA - Miami International",
        "tipo_aeronave": "Airbus A320neo",
        "duracion_estimada": "04h 00m",
        "distancia_km": 2400,
        "fecha_salida": (date.today() + timedelta(days=10)).isoformat(),
        "hora_salida_12h": "10:00 AM",
        "hora_llegada_12h": "02:00 PM",
        "puerta": "B-04",
        "capacidad_maxima": 36,
        "estado": "Check-in abierto"
    }
    db.persistir_vuelo(vuelo)
    app_module.tabla_vuelos.insertar(codigo, vuelo)
    app_module.asegurar_estructuras_vuelo(codigo)
    return codigo


# -----------------------------------------------------------------------------
# 1. Dos usuarios reservando el mismo asiento al mismo tiempo (Concurrencia)
# -----------------------------------------------------------------------------
def test_1_dos_usuarios_reservando_mismo_asiento(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "2B"

    # Usuario 1 crea orden para 2B
    res1 = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90011",
        "nombre": "Usuario Concurrente Uno",
        "idempotency_key": "idemp_user1_seat2b"
    })
    assert res1.status_code == 201
    orden1 = res1.get_json()
    assert orden1["asiento_id"] == asiento
    assert orden1["estado"] == "pendiente"

    # Usuario 2 intenta crear orden para el mismo 2B mientras orden 1 está activa
    res2 = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90022",
        "nombre": "Usuario Concurrente Dos",
        "idempotency_key": "idemp_user2_seat2b"
    })
    assert res2.status_code == 400
    assert "reserva activa" in res2.get_json().get("error", "").lower()


# -----------------------------------------------------------------------------
# 2. Doble clic en pagar (mismo idempotency_key)
# -----------------------------------------------------------------------------
def test_2_doble_clic_en_pagar_idempotente(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "3A"
    idemp_key = "idemp_doble_clic_3a"

    res_orden = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90033",
        "nombre": "Usuario Doble Clic",
        "idempotency_key": idemp_key
    })
    assert res_orden.status_code == 201
    orden_id = res_orden.get_json()["id"]

    # 1er clic en pagar
    res_pago1 = client.post('/api/pagos/procesar', json={
        "orden_id": orden_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_idemp_key_3a"
    })
    assert res_pago1.status_code == 200
    data1 = res_pago1.get_json()
    assert data1["estado"] == "pagado"

    # 2do clic rápido con el mismo idempotency_key
    res_pago2 = client.post('/api/pagos/procesar', json={
        "orden_id": orden_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_idemp_key_3a"
    })
    assert res_pago2.status_code == 200
    data2 = res_pago2.get_json()
    assert data2["estado"] == "pagado"
    assert data2["idempotente"] is True
    # El recibo y PNR deben coincidir exactamente
    assert data1["pnr"] == data2["pnr"]


# -----------------------------------------------------------------------------
# 3. Webhook repetido (Idempotencia de webhooks)
# -----------------------------------------------------------------------------
def test_3_webhook_repetido_idempotente(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "3B"

    res_orden = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90044",
        "nombre": "Usuario Webhook",
        "idempotency_key": "idemp_webhook_3b"
    })
    orden_id = res_orden.get_json()["id"]

    webhook_payload = {
        "orden_id": orden_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "wh_unique_key_01"
    }

    # 1er webhook
    res_wh1 = client.post('/api/pagos/webhook', json=webhook_payload)
    assert res_wh1.status_code == 200
    data_wh1 = res_wh1.get_json()
    assert data_wh1["resultado"]["estado"] == "pagado"

    # 2do webhook repetido por reintento de la pasarela
    res_wh2 = client.post('/api/pagos/webhook', json=webhook_payload)
    assert res_wh2.status_code == 200
    data_wh2 = res_wh2.get_json()
    assert data_wh2["resultado"]["estado"] == "pagado"
    assert data_wh2["resultado"]["idempotente"] is True


# -----------------------------------------------------------------------------
# 4. Pago aprobado recibido después de expirar la retención
# -----------------------------------------------------------------------------
def test_4_pago_aprobado_tras_expirar_retencion_reembolso_si_ocupado(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "4A"

    # Usuario 1 crea orden pero se demora más de 12 min
    res_orden1 = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90055",
        "nombre": "Usuario Lento",
        "idempotency_key": "idemp_lento_4a"
    })
    orden1_id = res_orden1.get_json()["id"]

    # Simulamos que la retención expiró en la base de datos (bloqueado_hasta en el pasado)
    conn = db.get_connection()
    with conn:
        conn.execute("UPDATE ordenes SET bloqueado_hasta = ? WHERE id = ?", (int(time.time()) - 100, orden1_id))

    # Durante la expiración, un Usuario 2 compró exitosamente el asiento 4A
    res_orden2 = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90066",
        "nombre": "Usuario Rapido",
        "idempotency_key": "idemp_rapido_4a"
    })
    assert res_orden2.status_code == 201
    orden2_id = res_orden2.get_json()["id"]

    res_pago2 = client.post('/api/pagos/procesar', json={
        "orden_id": orden2_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_rapido_4a"
    })
    assert res_pago2.status_code == 200

    # Ahora llega la confirmación tardía del Usuario 1:
    # El servidor DEBE detectar que expiró y que el asiento ya está ocupado -> REEMBOLSO AUTOMÁTICO
    res_pago1_tardio = client.post('/api/pagos/procesar', json={
        "orden_id": orden1_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_lento_4a_tardio"
    })
    assert res_pago1_tardio.status_code == 200
    data_tardio = res_pago1_tardio.get_json()
    assert data_tardio["estado"] == "reembolsado"
    assert data_tardio["codigo_error"] == "RETENCION_EXPIRADA_ASIENTO_OCUPADO"
    assert "reembolso" in data_tardio["mensaje"].lower()


# -----------------------------------------------------------------------------
# 5. Tarifa modificada mientras el usuario está pagando (Respeta precio bloqueado)
# -----------------------------------------------------------------------------
def test_5_tarifa_modificada_respeta_precio_bloqueado(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "5A"

    res_orden = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90077",
        "nombre": "Usuario Precio Bloqueado",
        "idempotency_key": "idemp_bloqueo_5a"
    })
    assert res_orden.status_code == 201
    orden = res_orden.get_json()
    precio_bloqueado = orden["total_cop"]

    # Simular cambio de precio general de catálogo mientras el usuario escribe su tarjeta
    fc.CATALOGO_AERONAVES["Airbus A320neo"]["asientos"][0]["tarifa_base_cop"] = 9999999

    # Usuario paga: el cobro debe ser exactamente el precio bloqueado en la orden, no el nuevo
    res_pago = client.post('/api/pagos/procesar', json={
        "orden_id": orden["id"],
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_bloqueado_5a"
    })
    assert res_pago.status_code == 200
    assert res_pago.get_json()["total_cop"] == precio_bloqueado

    # Restaurar catálogo
    fc.CATALOGO_AERONAVES["Airbus A320neo"]["asientos"][0]["tarifa_base_cop"] = 2450000


# -----------------------------------------------------------------------------
# 6. Monto manipulado desde el cliente (Rechazado, servidor calcula)
# -----------------------------------------------------------------------------
def test_6_monto_manipulado_desde_cliente_ignorado_por_servidor(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "5B"

    # Atacante envía precio fraudulento de $100 COP en el payload
    res_orden = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90088",
        "nombre": "Atacante Manipulacion",
        "total_cop": 100,
        "tarifa_base_cop": 10,
        "idempotency_key": "idemp_hack_5b"
    })
    assert res_orden.status_code == 201
    orden = res_orden.get_json()

    # El servidor ignoró los campos manipulados y calculó la tarifa oficial (> 1.000.000 COP)
    assert orden["total_cop"] > 1000000
    assert orden["total_cop"] != 100


# -----------------------------------------------------------------------------
# 7. Intento de reembolso por usuario sin rol Integral (Rechazado)
# -----------------------------------------------------------------------------
def test_7_intento_reembolso_sin_rol_integral_rechazado(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "6A"

    res_orden = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90099",
        "nombre": "Usuario Intento Reembolso",
        "idempotency_key": "idemp_reembolso_6a"
    })
    orden_id = res_orden.get_json()["id"]

    client.post('/api/pagos/procesar', json={
        "orden_id": orden_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_reembolso_6a"
    })

    # Pasajero u Operador intenta reembolsar -> HTTP 403 Forbidden
    res_reembolso_pasajero = client.post('/api/pagos/reembolsar', json={
        "orden_id": orden_id,
        "motivo": "Quiero cancelar mi tiquete",
        "usuario_rol": "pasajero"
    })
    assert res_reembolso_pasajero.status_code == 403

    res_reembolso_operador = client.post('/api/pagos/reembolsar', json={
        "orden_id": orden_id,
        "motivo": "Cancelado por operador",
        "usuario_rol": "operador"
    })
    assert res_reembolso_operador.status_code == 403


# -----------------------------------------------------------------------------
# 8. Reembolso exitoso con auditoría (Rol Integral)
# -----------------------------------------------------------------------------
def test_8_reembolso_exitoso_con_auditoria(client, setup_test_flight):
    vuelo_cod = setup_test_flight
    asiento = "6B"

    res_orden = client.post('/api/pagos/orden', json={
        "vuelo_codigo": vuelo_cod,
        "asiento_id": asiento,
        "documento": "CC90100",
        "nombre": "Usuario Reembolso Ok",
        "idempotency_key": "idemp_reembolso_6b"
    })
    orden_id = res_orden.get_json()["id"]

    client.post('/api/pagos/procesar', json={
        "orden_id": orden_id,
        "numero_tarjeta": "4242 4242 4242 4242",
        "idempotency_key": "pay_reembolso_6b"
    })

    # Administrador con rol Integral ejecuta reembolso con motivo obligatorio
    res_reembolso = client.post('/api/pagos/reembolsar', json={
        "orden_id": orden_id,
        "motivo": "Fuerza mayor médica certificada",
        "usuario_rol": "integral"
    })
    assert res_reembolso.status_code == 200
    data_reembolso = res_reembolso.get_json()
    assert data_reembolso["estado"] == "reembolsado"
    assert data_reembolso["motivo"] == "Fuerza mayor médica certificada"

    # Verificar que el asiento 6B fue liberado del manifiesto
    conn = db.get_connection()
    with conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM manifiesto WHERE vuelo_codigo = ? AND asiento = ?", (vuelo_cod, asiento))
        assert cursor.fetchone() is None, "El asiento 6B debió ser liberado tras el reembolso."

        # Verificar auditoría en pago_eventos
        cursor.execute("SELECT * FROM reembolsos WHERE orden_id = ?", (orden_id,))
        reembolso_row = cursor.fetchone()
        assert reembolso_row is not None
        assert reembolso_row["motivo"] == "Fuerza mayor médica certificada"
