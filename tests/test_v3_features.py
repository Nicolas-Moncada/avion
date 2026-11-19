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

def test_descargar_android_apk(client):
    res = client.get('/api/descargar/android')
    assert res.status_code == 200
    assert 'android.package-archive' in res.content_type
    assert len(res.data) > 1_000_000

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
    res_anon = client.post('/api/admin/destinos', data={'ciudad': 'Test City', 'codigo_iata': 'TST'})
    assert res_anon.status_code == 403

    # Con admin: crea destino con imagen dummy
    img = Image.new('RGB', (800, 500), (200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    buf.seek(0)

    data = {
        'ciudad': 'Test City',
        'codigo_iata': 'TST',
        'pais': 'Colombia',
        'imagen': (buf, 'test.jpg')
    }
    res_admin = client.post('/api/admin/destinos', headers={'X-User-Role': 'admin'}, data=data, content_type='multipart/form-data')
    assert res_admin.status_code == 201
    res_json = res_admin.get_json()
    assert res_json['exito'] is True
    assert res_json['codigo_iata'] == 'TST'

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

def test_api_mis_reservas_isolation(client):
    # 1. Pasajero nuevo sin documento: NUNCA debe ver reservas de otros
    res_nuevo = client.get('/api/mis-reservas')
    assert res_nuevo.status_code == 200
    data_nuevo = res_nuevo.get_json()
    assert data_nuevo['exito'] is True
    assert data_nuevo['total'] == 0
    assert len(data_nuevo['reservas']) == 0

    # 2. Pasajero específico (Gabriel Restrepo 20200201): debe ver ÚNICAMENTE sus propios vuelos
    res_gabriel = client.get('/api/mis-reservas?documento=20200201')
    assert res_gabriel.status_code == 200
    data_gabriel = res_gabriel.get_json()
    assert data_gabriel['exito'] is True
    assert data_gabriel['total'] >= 1
    for r in data_gabriel['reservas']:
        assert r['pasajero_doc'] == '20200201' or '20200201' in str(r['pasajero_doc'])
        assert 'Gabriel Restrepo' in r['pasajero_nombre']

    # 3. Pasajero nuevo con cédula inexistente (ej. 999888777): 0 vuelos ajenos
    res_inexistente = client.get('/api/mis-reservas?documento=999888777')
    assert res_inexistente.status_code == 200
    data_inex = res_inexistente.get_json()
    assert data_inex['exito'] is True
    assert data_inex['total'] == 0

def test_destinos_hd_images_unique_sha256(client):
    import sqlite3, hashlib, io
    from PIL import Image

    con = sqlite3.connect('aerocore.db')
    cur = con.cursor()
    rows = cur.execute('SELECT codigo_iata, ciudad, imagen_blob, mime_type, updated_at FROM destino_imagenes').fetchall()
    con.close()

    assert len(rows) >= 12, f"Se esperaban al menos 12 destinos en la BD, encontrados: {len(rows)}"
    hashes = set()
    for iata, ciudad, blob, mime, updated_at in rows:
        assert blob is not None and len(blob) > 10000, f"Imagen vacía o muy pequeña para {iata}"
        h = hashlib.sha256(blob).hexdigest()
        assert h not in hashes, f"DUPLICADO DETECTADO: {iata} ({ciudad}) tiene el mismo hash que otro destino!"
        hashes.add(h)

        # Validar dimensiones y formato WebP
        im = Image.open(io.BytesIO(blob))
        assert im.size == (1280, 800), f"Resolución incorrecta para {iata}: {im.size}"
        assert im.format == 'WEBP', f"Formato incorrecto para {iata}: {im.format}"

        # Probar endpoint HTTP
        resp = client.get(f'/api/destinos/{iata}/imagen')
        assert resp.status_code == 200
        assert resp.mimetype == 'image/webp' or 'webp' in resp.content_type

def test_international_routes_coherence(client):
    res = client.get('/api/vuelos')
    assert res.status_code == 200
    vuelos = res.get_json().get('vuelos', [])

    # Verificar LHR
    vuelo_lhr = next((v for v in vuelos if 'LHR' in str(v.get('destino', '')).upper()), None)
    if vuelo_lhr:
        assert vuelo_lhr['precio_base_cop'] >= 2000000, f"Tarifa irreal para LHR: {vuelo_lhr['precio_base_cop']}"
        assert '787' in vuelo_lhr['tipo_aeronave'] or '350' in vuelo_lhr['tipo_aeronave'], f"Aeronave de corto alcance para LHR: {vuelo_lhr['tipo_aeronave']}"
        assert 'api/destinos/LHR/imagen' in vuelo_lhr['imagen_url']

    # Verificar SCL
    vuelo_scl = next((v for v in vuelos if 'SCL' in str(v.get('destino', '')).upper()), None)
    if vuelo_scl:
        assert vuelo_scl['precio_base_cop'] >= 1000000, f"Tarifa irreal para SCL: {vuelo_scl['precio_base_cop']}"
        assert 'api/destinos/SCL/imagen' in vuelo_scl['imagen_url']
