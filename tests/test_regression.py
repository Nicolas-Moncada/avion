"""
=============================================================================
  Suite de Pruebas Automatizadas de Regresión — AERO FLOW AIRLINES
  Verifica la resolución del 100% de hallazgos Críticos, Altos y Medios (Fase 1)
=============================================================================
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import date, timedelta
import app as app_module
import fleet_catalog as fc
import validation as val
import database as db


@pytest.fixture
def client():
    app_module.app.config['TESTING'] = True
    with app_module.app.test_client() as c:
        yield c


# -----------------------------------------------------------------------------
# AUD-01 & AUD-03: Precios Enteros en COP y Validación de Descuentos
# -----------------------------------------------------------------------------
def test_calcular_desglose_cop_enteros_estrictos():
    """Valida que todos los desgloses en COP retornen tipos int estrictos sin flotantes."""
    desglose = fc.calcular_desglose_cop(780000)
    for clave, valor in desglose.items():
        assert isinstance(valor, int), f"El campo {clave} no es entero: {type(valor)} ({valor})"

    assert desglose["tarifa_base_cop"] == 780000
    assert desglose["tarifa_admin_cop"] == 45000
    assert desglose["tasa_aeroportuaria_cop"] == 158000
    assert desglose["iva_cop"] == int(round(780000 * 0.19))
    assert desglose["total_cop"] == 780000 + 45000 + desglose["iva_cop"] + 158000


def test_calcular_desglose_descuento_fuera_de_rango():
    """Valida que descuentos negativos o superiores al 100% sean rechazados."""
    with pytest.raises(ValueError, match="descuento"):
        fc.calcular_desglose_cop(780000, descuento_porcentaje=-10)

    with pytest.raises(ValueError, match="descuento"):
        fc.calcular_desglose_cop(780000, descuento_porcentaje=105)


def test_calcular_desglose_descuento_valido():
    """Valida el cálculo de descuento válido entre 0% y 100%."""
    desglose = fc.calcular_desglose_cop(1000000, descuento_porcentaje=20)
    assert desglose["descuento_cop"] == 200000
    assert desglose["tarifa_aplicada_cop"] == 800000
    assert isinstance(desglose["total_cop"], int)


def test_validar_precio_entero_cop():
    """Valida que la función de validación monetaria rechace flotantes y negativos."""
    assert val.validar_precio_entero_cop(150000) == 150000
    assert val.validar_precio_entero_cop("200000") == 200000

    with pytest.raises(val.ValidationError, match="decimales"):
        val.validar_precio_entero_cop(1500.75)

    with pytest.raises(val.ValidationError, match="negativo"):
        val.validar_precio_entero_cop(-5000)


def test_validar_descuento_limites():
    """Valida que la validación de descuento rechace valores fuera de [0, 100]."""
    assert val.validar_descuento(0) == 0
    assert val.validar_descuento(50) == 50
    assert val.validar_descuento(100) == 100

    with pytest.raises(val.ValidationError, match="0% y 100%"):
        val.validar_descuento(-5)

    with pytest.raises(val.ValidationError, match="0% y 100%"):
        val.validar_descuento(101)


# -----------------------------------------------------------------------------
# AUD-04 & AUD-08: Zonas Horarias, Fechas Pasadas y Filtro de Ofertas
# -----------------------------------------------------------------------------
def test_validar_vuelo_rechaza_fecha_pasada():
    """Valida que la creación de un vuelo con fecha de ayer sea rechazada."""
    ayer = (date.today() - timedelta(days=1)).isoformat()
    payload = {
        "codigo": "AF7777",
        "origen": "BOG - Bogotá El Dorado",
        "destino": "MDE - Medellín José María Córdova",
        "tipo_aeronave": "Airbus A320neo",
        "duracion_estimada": "00h 50m",
        "distancia_km": 230,
        "fecha_salida": ayer,
        "hora_salida_12h": "10:00 AM",
        "puerta": "B-02",
        "estado": "Check-in abierto"
    }
    with pytest.raises(val.ValidationError, match="pasado"):
        val.validar_vuelo(payload)


def test_checkin_rechaza_vuelo_fecha_pasada(client):
    """Valida que intentar comprar un tiquete en un vuelo con fecha expirada sea rechazado."""
    ayer = (date.today() - timedelta(days=1)).isoformat()
    codigo_pasado = "AFPAST1"
    vuelo_pasado = {
        "codigo": codigo_pasado,
        "origen": "BOG - Bogotá",
        "destino": "CLO - Cali",
        "tipo_aeronave": "Airbus A320neo",
        "duracion_estimada": "01h 00m",
        "distancia_km": 300,
        "fecha_salida": ayer,
        "hora_salida_12h": "09:00 AM",
        "hora_llegada_12h": "10:00 AM",
        "puerta": "A-01",
        "capacidad_maxima": 36,
        "estado": "Check-in abierto"
    }
    app_module.tabla_vuelos.insertar(codigo_pasado, vuelo_pasado)
    app_module.asegurar_estructuras_vuelo(codigo_pasado)

    res = client.post('/api/checkin', json={
        "codigo_vuelo": codigo_pasado,
        "documento": "CC99887766",
        "nombre_nuevo": "Pasajero Prueba Expirado",
        "asiento": "5A"
    })
    assert res.status_code == 400
    assert "fecha pasada" in res.get_json().get("error", "").lower()


def test_listar_vuelos_marca_es_pasado(client):
    """Valida que la lista de vuelos identifique con bandera es_pasado a vuelos viejos."""
    ayer = (date.today() - timedelta(days=2)).isoformat()
    codigo_viejo = "AFVIEJO"
    app_module.tabla_vuelos.insertar(codigo_viejo, {
        "codigo": codigo_viejo,
        "origen": "BOG",
        "destino": "MIA",
        "tipo_aeronave": "Airbus A320neo",
        "duracion_estimada": "04h 00m",
        "distancia_km": 2400,
        "fecha_salida": ayer,
        "hora_salida_12h": "11:00 AM",
        "puerta": "B-03",
        "capacidad_maxima": 36,
        "estado": "Check-in abierto"
    })
    res = client.get('/api/vuelos')
    assert res.status_code == 200
    data = res.get_json()
    vuelo_encontrado = next((v for v in data.get("todos_admin", []) if v["codigo"] == codigo_viejo), None)
    assert vuelo_encontrado is not None
    assert vuelo_encontrado["es_pasado"] is True
    assert vuelo_encontrado["activo"] is False


# -----------------------------------------------------------------------------
# AUD-02: Doble Venta y Validación de Asientos
# -----------------------------------------------------------------------------
def test_checkin_rechaza_asiento_ocupado(client):
    """Valida que intentar reservar un asiento ya ocupado sea rechazado con HTTP 400."""
    codigo_test = "AFTESTSEAT"
    vuelo_test = {
        "codigo": codigo_test,
        "origen": "BOG - Bogotá El Dorado",
        "destino": "MIA - Miami International",
        "tipo_aeronave": "Airbus A320neo",
        "duracion_estimada": "04h 00m",
        "distancia_km": 2400,
        "fecha_salida": (date.today() + timedelta(days=5)).isoformat(),
        "hora_salida_12h": "10:00 AM",
        "hora_llegada_12h": "02:00 PM",
        "puerta": "B-01",
        "capacidad_maxima": 36,
        "estado": "Check-in abierto"
    }
    db.persistir_vuelo(vuelo_test)
    app_module.tabla_vuelos.insertar(codigo_test, vuelo_test)
    app_module.asegurar_estructuras_vuelo(codigo_test)

    # 1er pasajero reserva 1A con éxito (HTTP 201 Created)
    res1 = client.post('/api/checkin', json={
        "codigo_vuelo": codigo_test,
        "documento": "CC88800011",
        "nombre_nuevo": "Primer Pasajero Alfa",
        "asiento": "1A"
    })
    assert res1.status_code == 201

    # 2do pasajero intenta reservar el mismo asiento 1A -> Rechazado con 400
    res2 = client.post('/api/checkin', json={
        "codigo_vuelo": codigo_test,
        "documento": "CC88800022",
        "nombre_nuevo": "Segundo Pasajero Beta",
        "asiento": "1A"
    })
    assert res2.status_code == 400
    assert "ya está ocupado" in res2.get_json().get("error", "")


def test_checkin_asiento_formato_invalido():
    """Valida que un identificador de asiento con sintaxis ilegal sea rechazado por el validador."""
    with pytest.raises(val.ValidationError, match="asiento no es válido"):
        val.validar_checkin({
            "codigo_vuelo": "AF1001",
            "documento": "12345678",
            "asiento_id": "ASIENTO_INVALIDO_999"
        })
