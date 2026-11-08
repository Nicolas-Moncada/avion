"""
=============================================================================
  Suite de Seguridad y Control de Acceso por Rol (FASE 5)
  Verifica que las funciones reservadas de Operador e Integral no puedan ser
  invocadas por usuarios con rol Pasajero o Anónimo (HTTP 401/403).
=============================================================================
"""

import os
import sys
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module
import database as db

@pytest.fixture(scope="module")
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c

def test_anonimo_consulta_catalogo_publico_permitido(client):
    """Rol Anónimo: Debe poder consultar el catálogo de vuelos sin autenticación."""
    resp = client.get("/api/vuelos")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "vuelos" in data or "todos_admin" in data

def test_anonimo_reembolso_rechazado_403(client):
    """Rol Anónimo: Intento de reembolso sin rol es rechazado con HTTP 403."""
    resp = client.post("/api/pagos/reembolsar", json={
        "orden_id": "ORD-TEST-001",
        "motivo": "Fraude intentado"
    })
    assert resp.status_code == 403

def test_pasajero_reembolso_rechazado_403(client):
    """Rol Pasajero: Intento de reembolso por cliente es rechazado con HTTP 403."""
    resp = client.post("/api/pagos/reembolsar", json={
        "orden_id": "ORD-TEST-001",
        "motivo": "Cancelación de viaje",
        "usuario_rol": "pasajero"
    })
    assert resp.status_code == 403

def test_operador_reembolso_rechazado_403(client):
    """Rol Operador: Operador de rampa/torre no tiene privilegios contables (HTTP 403)."""
    resp = client.post("/api/pagos/reembolsar", json={
        "orden_id": "ORD-TEST-001",
        "motivo": "Solicitud operativa",
        "usuario_rol": "operador"
    })
    assert resp.status_code == 403

def test_pasajero_cancelar_vuelo_rechazado_403(client):
    """Rol Pasajero: No puede cancelar vuelos del itinerario comercial (HTTP 403)."""
    resp = client.post("/api/vuelos/AF1001/cancelar", headers={
        "X-User-Role": "pasajero"
    })
    assert resp.status_code == 403

def test_anonimo_cancelar_vuelo_rechazado_403(client):
    """Rol Anónimo: No puede cancelar vuelos (HTTP 403)."""
    resp = client.post("/api/vuelos/AF1001/cancelar", headers={
        "X-User-Role": "anonimo"
    })
    assert resp.status_code == 403

def test_pasajero_conciliacion_financiera_rechazada_403(client):
    """Rol Pasajero: Intento de ver balance contable rechazado con HTTP 403."""
    resp = client.get("/api/pagos/conciliacion", headers={
        "X-User-Role": "pasajero"
    })
    assert resp.status_code == 403

def test_operador_conciliacion_financiera_rechazada_403(client):
    """Rol Operador: No autorizado para ver balance contable (HTTP 403)."""
    resp = client.get("/api/pagos/conciliacion", headers={
        "X-User-Role": "operador"
    })
    assert resp.status_code == 403

def test_integral_conciliacion_financiera_autorizada_200(client):
    """Rol Integral: Administrador financiero puede consultar conciliación (HTTP 200)."""
    resp = client.get("/api/pagos/conciliacion", headers={
        "X-User-Role": "integral"
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert "monto_total_pagado_cop" in data or "conciliado" in data
