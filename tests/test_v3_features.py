import os
import sys
import io
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
import database as db
from PIL import Image

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_descargar_windows_exe(client):
    res = client.get('/api/descargar/windows')
    assert res.status_code == 200
    assert 'portable-executable' in res.content_type
    assert len(res.data) > 10_000_000

def test_api_destinos_list_and_image(client):
    res = client.get('/api/destinos')
    assert res.status_code == 200
    data = res.get_json()
    assert data['exito'] is True
    assert data['total'] >= 10
    
    # Check image route for BOG
    res_img = client.get('/api/destinos/BOG/imagen')
    assert res_img.status_code == 200
    assert 'image/' in res_img.content_type
    assert len(res_img.data) > 1000

def test_api_admin_crear_destino(client):
    # Sin admin: 403
    res_anon = client.post('/api/admin/destinos', data={'ciudad': 'Pereira', 'codigo_iata': 'PEI'})
    assert res_anon.status_code == 403

    # Con admin: crea destino con imagen dummy
    img = Image.new('RGB', (800, 500), (200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    buf.seek(0)

    data = {
        'ciudad': 'Pereira',
        'codigo_iata': 'PEI',
        'pais': 'Colombia',
        'imagen': (buf, 'pereira.jpg')
    }
    res_admin = client.post('/api/admin/destinos', headers={'X-User-Role': 'admin'}, data=data, content_type='multipart/form-data')
    assert res_admin.status_code == 201
    res_json = res_admin.get_json()
    assert res_json['exito'] is True
    assert res_json['codigo_iata'] == 'PEI'

    # Verificar que ahora aparece en /api/destinos
    res_list = client.get('/api/destinos')
    assert any(d['codigo_iata'] == 'PEI' for d in res_list.get_json()['destinos'])

def test_validacion_origen_destino_iguales(client):
    # Intentar crear vuelo con mismo origen y destino -> 400
    payload = {
        'codigo': 'AF9999',
        'origen': 'Bogotá (BOG)',
        'destino': 'Bogotá (BOG)',
        'tipo_aeronave': 'Airbus A320neo',
        'precio_base_cop': 85000
    }
    res = client.post('/api/admin/vuelos', headers={'X-User-Role': 'admin'}, json=payload)
    assert res.status_code == 400
    assert 'iguales' in res.get_json()['error']

def test_admin_dashboard_kpis(client):
    res = client.get('/api/admin/dashboard', headers={'X-User-Role': 'admin'})
    assert res.status_code == 200
    data = res.get_json()
    assert data['exito'] is True
    assert 'kpis' in data
    assert 'total_ingresos_cop' in data['kpis']
    assert 'ocupacion_promedio_pct' in data['kpis']

def test_admin_export_excel_bom(client):
    # Ventas CSV
    res_ventas = client.get('/api/admin/export/ventas', headers={'X-User-Role': 'admin'})
    assert res_ventas.status_code == 200
    assert res_ventas.data.startswith(b'\xef\xbb\xbf')  # UTF-8 BOM para Windows Excel

    # Manifiesto CSV
    res_manif = client.get('/api/admin/export/manifiesto/AF1001', headers={'X-User-Role': 'admin'})
    assert res_manif.status_code == 200
    assert res_manif.data.startswith(b'\xef\xbb\xbf')

def test_pnr_lookup_and_checkin_and_duplicate_scan(client):
    # Buscar una reserva real existente en aerocore.db
    conn = db.get_connection()
    row = conn.execute("SELECT codigo_pnr, pasajero_doc, vuelo_codigo FROM manifiesto WHERE codigo_pnr IS NOT NULL LIMIT 1").fetchone()
    conn.close()
    assert row is not None
    pnr = row['codigo_pnr']
    doc = row['pasajero_doc']
    vuelo = row['vuelo_codigo']

    # 1. Búsqueda por PNR
    res_pnr = client.get(f'/api/reservas/pnr/{pnr}')
    assert res_pnr.status_code == 200
    assert res_pnr.get_json()['exito'] is True

    # 2. Web Check-in
    res_checkin = client.post('/api/checkin/web', json={'pnr': pnr})
    assert res_checkin.status_code == 200
    assert 'grupo_abordaje' in res_checkin.get_json()

    # 3. Escanear en puerta
    res_scan1 = client.post('/api/embarque/escanear', headers={'X-User-Role': 'admin'}, json={
        'vuelo_codigo': vuelo,
        'tiquete_o_pnr': pnr
    })
    # Puede ser 200 si no había abordado o 409 si ya abordó
    assert res_scan1.status_code in (200, 409)

    # 4. Segundo escaneo del mismo: DEBE retornar 409 (Conflicto / Duplicado)
    res_scan2 = client.post('/api/embarque/escanear', headers={'X-User-Role': 'admin'}, json={
        'vuelo_codigo': vuelo,
        'tiquete_o_pnr': pnr
    })
    assert res_scan2.status_code == 409
    assert 'ya abordó' in res_scan2.get_json()['error'].lower() or 'duplicado' in res_scan2.get_json()['error'].lower()
