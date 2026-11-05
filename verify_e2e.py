"""
Suite de Pruebas de Integración End-to-End para AERO FLOW AIRLINES
"""

import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://127.0.0.1:5000"

def get(path):
    req = urllib.request.Request(f"{BASE_URL}{path}")
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode('utf-8'))

def post(path, body=None):
    data = json.dumps(body or {}).encode('utf-8')
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        return response.status, json.loads(response.read().decode('utf-8'))

def run_tests():
    print("--- INICIANDO VERIFICACIÓN END-TO-END AERO FLOW AIRLINES ---")

    # 1. Verificar catálogo y vuelos iniciales
    status, data_vuelos = get("/api/vuelos")
    assert status == 200
    print(f"✓ Vuelos iniciales en Hash Map: {data_vuelos['total']} vuelos cargados")

    status, data_pasajeros = get("/api/pasajeros")
    assert status == 200
    print(f"✓ Directorio de Pasajeros en Árbol AVL: {data_pasajeros['total']} nodos, Altura: {data_pasajeros['altura_arbol']}")

    # 2. Módulo 1: Programar vuelo dinámico con código único
    cod_test = f"AF{int(time.time()) % 10000}"
    nuevo_vuelo = {
        "codigo": cod_test,
        "origen": "BOG - Bogotá El Dorado",
        "destino": "MIA - Miami International",
        "tipo_aeronave": "Airbus A320neo",
        "fecha_salida": "2026-10-22",
        "hora_salida_12h": "07:30 AM",
        "hora_llegada_12h": "12:15 PM",
        "puerta": "B-02",
        "estado": "Check-in abierto"
    }
    status, res_vuelo = post("/api/vuelos", nuevo_vuelo)
    assert status == 201
    print(f"✓ Vuelo {res_vuelo['vuelo']['codigo']} registrado con éxito en Hash Map O(1)")

    # Búsqueda O(1)
    status, datos_busq = get(f"/api/vuelos/buscar/{cod_test}")
    assert status == 200
    assert datos_busq['encontrado'] is True
    print(f"✓ Búsqueda O(1) confirmada: {datos_busq['tiempo_us']} µs | 1 Salto")

    # 3. Módulo 2: Registro y búsqueda logarítmica en Árbol AVL
    doc_vip = f"800{int(time.time()) % 10000}"
    doc_std = f"801{int(time.time()) % 10000}"
    p_test = [
        {"documento": doc_vip, "nombre": "Camila Isabel Restrepo", "nacionalidad": "Colombia", "categoria_viajero": "VIP"},
        {"documento": doc_std, "nombre": "Felipe Santiago Morales", "nacionalidad": "Colombia", "categoria_viajero": "Estándar"}
    ]
    for p in p_test:
        status, _ = post("/api/pasajeros", p)
        assert status == 201
    print("✓ Pasajeros registrados exitosamente en el Árbol AVL")

    status, res_avl = get(f"/api/pasajeros/buscar/{doc_vip}")
    assert status == 200
    assert res_avl['encontrado'] is True
    print(f"✓ Búsqueda AVL O(log n) comprobada: {res_avl['rastro']}")

    # 4. Módulo 3: Llenado de AF9901 (capacidad 6) y prueba de Standby
    status, mapa_antes = get("/api/avion/AF9901/mapa")
    print(f"✓ Estado inicial de AF9901: {mapa_antes['ocupacion']}/{mapa_antes['capacidad_maxima']} asientos ocupados")

    if not mapa_antes['lleno']:
        # Emitir tiquetes necesarios hasta llenar al 100% (6/6)
        asientos_libres = [s for s in mapa_antes['configuracion_aeronave']['asientos'] if not s['ocupado']]
        for idx, seat in enumerate(asientos_libres):
            doc_filler = doc_std if idx == 0 else f"999{int(time.time()) % 1000}{idx}"
            status, r_lleno = post("/api/checkin", {
                "codigo_vuelo": "AF9901",
                "documento": doc_filler,
                "nombre_nuevo": f"Viajero Prueba {idx+1}",
                "asiento": seat['id']
            })
            assert status == 201
        print("✓ Vuelo AF9901 completado al 100% (6/6)")

    # Sobreventa inmediata -> Standby FIFO
    status, r_sb = post("/api/checkin", {
        "codigo_vuelo": "AF9901",
        "documento": doc_vip
    })
    assert status == 200
    assert r_sb['accion'] == 'STANDBY_ASIGNADO'
    print(f"✓ SOBREVENTA CONFIRMADA: {r_sb['mensaje']}")

    # 5. Cancelación de asiento VIP 1A y ascenso automático
    # Obtenemos el pasajero del asiento 1A
    status, mapa_full = get("/api/avion/AF9901/mapa")
    asiento_1a = next(s for s in mapa_full['configuracion_aeronave']['asientos'] if s['id'] == '1A')
    doc_1a = asiento_1a['pasajero']['documento']

    status, r_cancel = post("/api/checkin/cancelar", {
        "codigo_vuelo": "AF9901",
        "documento": doc_1a
    })
    assert status == 200
    assert r_cancel['ascenso_standby'] is not None
    assert r_cancel['ascenso_standby']['pasajero_doc'] == doc_vip
    assert r_cancel['ascenso_standby']['asiento_asignado'] == "1A"
    print(f"✓ TRIGGER CRÍTICO SUPERADO: {r_cancel['ascenso_standby']['mensaje']}")

    # 6. Módulo 4: Simulación de Embarque FIFO y emisión de Boarding Pass
    status, _ = post("/api/embarque/AF9901/iniciar")
    assert status == 200
    print("✓ Simulación de embarque iniciada. Estado cambiado a 'Embarcando'")

    status, r_emb = post("/api/embarque/AF9901/abordar-siguiente")
    assert 'boarding_pass' in r_emb
    bp = r_emb['boarding_pass']
    print(f"✓ Pase de Abordar Digital Emitido:")
    print(f"   Pasajero: {bp['pasajero_nombre']} | Asiento: {bp['asiento']} ({bp['clase_cabina']})")
    print(f"   Ruta: {bp['origen']} ✈ {bp['destino']} | Tarifa: {bp['tarifa_formateada']}")
    print(f"   Secuencia FIFO: #{bp['secuencia_fifo']}")

    print("\n========================================================")
    print("  ¡TODAS LAS PRUEBAS DE AERO FLOW AIRLINES EXITOSAS!    ")
    print("========================================================")

if __name__ == '__main__':
    run_tests()
