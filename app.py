"""
=============================================================================
  AERO FLOW AIRLINES — Backend REST Service
  Integración con 4 estructuras de datos, COP y checkout estilo Avianca.
=============================================================================
"""

import os
import time
import logging
import threading
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, g, send_from_directory
import config
import database as db
import validation
from data_structures.linked_list import ListaEnlazadaManifiesto
from data_structures.fifo_queue import ColaFIFO
from fleet_catalog import CATALOGO_AERONAVES, obtener_configuracion_aeronave, calcular_desglose_cop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
app = Flask(
    __name__,
    template_folder=os.path.join(config.BUNDLE_DIR, 'templates'),
    static_folder=os.path.join(config.BUNDLE_DIR, 'static')
)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['MAX_CONTENT_LENGTH'] = config.MAX_BODY_BYTES
# Conservar tildes y emojis en respuestas JSON
app.json.ensure_ascii = False

# Inicializar Base de Datos (y semilla opcional por env)
if config.AUTO_RESET_ON_START:
    db.reiniciar_semilla_limpia()
db.verificar_y_poblar_semilla()

# Hidratación de estructuras en memoria
(
    tabla_vuelos,
    arbol_pasajeros,
    manifiestos,
    colas_standby,
    colas_embarque
) = db.hydratar_memoria()

state_version = int(time.time() * 1000)
_server_start_epoch = time.time()

# Mutex global: serializa TODAS las escrituras (POST/DELETE) para evitar
# condiciones de carrera entre hilos del WSGI sobre memoria + SQLite.
ESTADO_MUTEX = threading.RLock()

def bump_state():
    global state_version
    state_version = int(time.time() * 1000)

def asegurar_estructuras_vuelo(codigo: str):
    if codigo not in manifiestos:
        manifiestos[codigo] = ListaEnlazadaManifiesto()
    if codigo not in colas_standby:
        colas_standby[codigo] = ColaFIFO()
    if codigo not in colas_embarque:
        colas_embarque[codigo] = ColaFIFO()

def resolver_codigo_vuelo(codigo: str) -> str:
    if not codigo:
        return ""
    cod_upper = str(codigo).strip().upper()
    if tabla_vuelos.contiene(cod_upper):
        return cod_upper
    # Fallback / Alias transparente para AF9901 hacia el vuelo semilla activo (AF1001)
    if cod_upper in ("AF9901", "AF1001"):
        if tabla_vuelos.contiene("AF1001"):
            return "AF1001"
        todos = tabla_vuelos.obtener_todos()
        for v in todos:
            if v.get("codigo") == "AF1001":
                return "AF1001"
        if todos:
            return todos[0]["codigo"]
    return cod_upper

def ahora_12h():
    return datetime.now().strftime('%I:%M:%S %p')

def formatear_cop(valor):
    try:
        return f"$ {int(valor):,} COP".replace(',', '.')
    except Exception:
        return f"$ {valor} COP"

def hoy_iso():
    return datetime.now().date().isoformat()

def sumar_duracion(hora_12h: str, duracion_str: str) -> str:
    """Suma a una hora 12h una duración tipo '09h 45m' y devuelve hora 12h."""
    try:
        referencia = datetime.strptime(hora_12h.split(' (+')[0].strip(), '%I:%M %p')
        partes = duracion_str.replace('h', '').replace('m', '').split()
        total_min = int(partes[0]) * 60 + (int(partes[1]) if len(partes) > 1 else 0)
        llegada = (referencia + timedelta(minutes=total_min))
        texto = llegada.strftime('%I:%M %p').lstrip('0')
        return texto
    except Exception:
        return hora_12h

def _error_json_400(mensaje: str):
    return jsonify({'error': mensaje}), 400

@app.errorhandler(validation.ValidationError)
def manejar_validacion(e):
    return jsonify({'error': e.mensaje}), 400

@app.errorhandler(404)
def manejar_404(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Recurso no encontrado. Verifica el código o la ruta.'}), 404
    return render_template('index.html'), 200

@app.errorhandler(405)
def manejar_405(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Método no permitido para este recurso.'}), 405
    return e

@app.errorhandler(500)
def manejar_500(e):
    import traceback
    traceback.print_exc()
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Error interno temporal. Intenta nuevamente.'}), 500
    return e

@app.errorhandler(413)
def manejar_413(e):
    return jsonify({'error': 'El cuerpo de la petición es demasiado grande.'}), 413

# --------------------------------------------------------------- Concurrencia
@app.before_request
def _serializar_escrituras():
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        g._aeroflow_write_lock = True
        ESTADO_MUTEX.acquire()

@app.teardown_request
def _liberar_escrituras(exception):
    if getattr(g, '_aeroflow_write_lock', False):
        g._aeroflow_write_lock = False
        ESTADO_MUTEX.release()

# ------------------------------------------------------- Encabezados de seguridad
@app.after_request
def aplicar_head_seguridad(respuesta):
    respuesta.headers.setdefault('X-Content-Type-Options', 'nosniff')
    respuesta.headers.setdefault('X-Frame-Options', 'DENY')
    respuesta.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    respuesta.headers.setdefault(
        'Permissions-Policy', 'geolocation=(), microphone=(), camera=()'
    )
    respuesta.headers.setdefault(
        'Content-Security-Policy',
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' https:; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    )
    return respuesta

# ------------------------------------------------------------------ Telemedida
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'app': config.APP_NAME,
        'version': config.VERSION,
        'uptime_segundos': round(time.time() - _server_start_epoch, 1),
        'estado_memoria': {
            'vuelos_hashmap': len(tabla_vuelos),
            'pasajeros_avl': arbol_pasajeros.total_nodos,
        },
    })

# =====================================================================
# DESTINOS OFICIALES Y MODELOS PARA REEMPLAZO DINÁMICO DE VUELOS
# =====================================================================
DESTINOS_OFICIALES = [
    ("BOG - Bogotá El Dorado", 0),
    ("MDE - Medellín José María Córdova", 230),
    ("CLO - Cali Alfonso Bonilla Aragón", 300),
    ("CTG - Cartagena Rafael Núñez", 650),
    ("BAQ - Barranquilla Ernesto Cortissoz", 700),
    ("SMR - Santa Marta Simón Bolívar", 740),
    ("ADZ - San Andrés Gustavo Rojas Pinilla", 1200),
    ("MIA - Miami International", 2435),
    ("JFK - Nueva York John F. Kennedy", 3995),
    ("MAD - Madrid Barajas", 8034),
    ("BCN - Barcelona El Prat", 8500),
    ("LHR - Londres Heathrow", 8502),
    ("CDG - París Charles de Gaulle", 8630),
    ("EZE - Buenos Aires Ezeiza", 4660),
    ("SCL - Santiago de Chile", 4250),
    ("GRU - São Paulo Guarulhos", 4320),
    ("MEX - Ciudad de México Benito Juárez", 3160),
    ("CUN - Cancún International", 2260),
    ("PTY - Ciudad de Panamá Tocumen", 760)
]

MODELOS_FLOTA = [
    "Embraer Praetor 600 Regional",
    "Airbus A319 Corporate",
    "Airbus A320neo",
    "Boeing 737 MAX 8",
    "Boeing 787-9 Dreamliner",
    "Airbus A350-900 XWB",
    "Boeing 777-300ER Flagship"
]

vuelos_reemplazados = set()

def generar_reemplazo_vuelo_interno(codigo_anterior):
    import random
    codigo_anterior = str(codigo_anterior).upper()
    if codigo_anterior in vuelos_reemplazados:
        return None
    vuelos_reemplazados.add(codigo_anterior)

    intentos = 0
    nuevo_cod = f"AF{random.randint(1000, 9999)}"
    while tabla_vuelos.contiene(nuevo_cod) and intentos < 100:
        nuevo_cod = f"AF{random.randint(1000, 9999)}"
        intentos += 1
    if tabla_vuelos.contiene(nuevo_cod):
        nuevo_cod = f"AF{int(time.time() * 1000) % 9000 + 1000}"

    destinos_pool = [d for d in DESTINOS_OFICIALES if d[0] != "BOG - Bogotá El Dorado"]
    dest_elegido, dist = random.choice(destinos_pool)
    modelo_elegido = random.choice(MODELOS_FLOTA)
    config_aero = obtener_configuracion_aeronave(modelo_elegido)

    puertas = ["A-02", "A-05", "B-03", "B-08", "C-01", "C-04", "VIP-01", "G-06"]
    puerta_elegida = random.choice(puertas)
    horas = ["08:15 AM", "10:45 AM", "01:30 PM", "03:15 PM", "05:40 PM", "08:20 PM", "11:15 PM"]
    hora_salida = random.choice(horas)

    dur_h = max(1, dist // 800)
    dur_m = (dist % 800) // 15
    duracion_str = f"{dur_h:02d}h {dur_m:02d}m"

    nuevo_vuelo = {
        "codigo": nuevo_cod,
        "origen": "BOG - Bogotá El Dorado",
        "destino": dest_elegido,
        "tipo_aeronave": modelo_elegido,
        "duracion_estimada": duracion_str,
        "distancia_km": dist,
        "fecha_salida": hoy_iso(),
        "hora_salida_12h": hora_salida,
        "hora_llegada_12h": sumar_duracion(hora_salida, duracion_str),
        "puerta": puerta_elegida,
        "capacidad_maxima": config_aero['capacidad'],
        "estado": "Check-in abierto"
    }

    db.persistir_vuelo(nuevo_vuelo)
    tabla_vuelos.insertar(nuevo_cod, nuevo_vuelo)
    asegurar_estructuras_vuelo(nuevo_cod)
    bump_state()
    return nuevo_vuelo

# =====================================================================
# RUTAS DE INTERFAZ & TELEMETRÍA GLOBAL & PWA ASSETS
# =====================================================================
@app.route('/manifest.webmanifest')
def serve_manifest():
    response = send_from_directory(config.BUNDLE_DIR, 'manifest.webmanifest')
    response.headers['Content-Type'] = 'application/manifest+json; charset=utf-8'
    return response

@app.route('/sw.js')
def serve_sw():
    response = send_from_directory(config.BUNDLE_DIR, 'sw.js')
    response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/offline.html')
def serve_offline():
    return send_from_directory(config.BUNDLE_DIR, 'offline.html')

@app.route('/icons/<path:filename>')
def serve_icons(filename):
    return send_from_directory(os.path.join(config.BUNDLE_DIR, 'icons'), filename)

@app.route('/vendor/<path:filename>')
def serve_vendor(filename):
    return send_from_directory(os.path.join(config.BUNDLE_DIR, 'vendor'), filename)

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(config.BUNDLE_DIR, 'assets'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(config.BUNDLE_DIR, 'js'), filename)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/sync-state')
def sync_state():
    total_manifiesto = sum(m.tamano for m in manifiestos.values())
    total_standby = sum(q.tamano for q in colas_standby.values())
    return jsonify({
        'version': state_version,
        'server_time_12h': ahora_12h(),
        'telemetria_global': {
            'vuelos_hashmap': len(tabla_vuelos),
            'pasajeros_avl': arbol_pasajeros.total_nodos,
            'altura_avl': arbol_pasajeros.altura_arbol,
            'total_confirmados': total_manifiesto,
            'total_standby': total_standby
        }
    })

@app.route('/api/flota/catalogo')
def catalogo_flota():
    return jsonify(CATALOGO_AERONAVES)

# =====================================================================
# MÓDULO 1: VUELOS Y TABLERO FIDS (Hash Map O(1))
# =====================================================================
@app.route('/api/vuelos', methods=['GET'])
def listar_vuelos():
    vuelos_raw = tabla_vuelos.obtener_todos()
    en_curso = []
    proximos = []
    despegados = []
    cancelados = []
    todos_admin = []

    for v in vuelos_raw:
        codigo = v['codigo']
        asegurar_estructuras_vuelo(codigo)
        ocupacion = manifiestos[codigo].tamano
        standby_count = colas_standby[codigo].tamano
        embarcados_count = colas_embarque[codigo].tamano

        estado_v = str(v.get('estado', 'Programado'))
        es_cancelado = 'CANCELADO' in estado_v
        es_archivado = 'ARCHIVADO' in estado_v
        es_despachado = estado_v in ['DESPEGADO', 'Despegado', 'Cerrado']
        fecha_v = str(v.get('fecha_salida', '')).split(' ')[0]
        es_pasado = bool(fecha_v and fecha_v < hoy_iso())

        # Temporizador en segundos según estado
        countdown = 720
        if estado_v == 'Embarcando':
            countdown = 300
        elif estado_v == 'Última llamada':
            countdown = 120
        elif es_despachado or es_cancelado or es_archivado or es_pasado:
            countdown = 0

        vuelo_info = {
            **v,
            'ocupacion': ocupacion,
            'standby_count': standby_count,
            'embarcados_count': embarcados_count,
            'countdown_segundos': countdown,
            'lleno': ocupacion >= v['capacidad_maxima'],
            'activo': not (es_cancelado or es_archivado or es_despachado or es_pasado),
            'es_pasado': es_pasado,
            'cancelado': es_cancelado,
            'archivado': es_archivado
        }

        todos_admin.append(vuelo_info)

        if es_despachado:
            despegados.append(vuelo_info)
        elif es_cancelado:
            cancelados.append(vuelo_info)
            proximos.append(vuelo_info)
        elif estado_v in ['Embarcando', 'Última llamada']:
            en_curso.append(vuelo_info)
        elif not es_archivado:
            proximos.append(vuelo_info)

    return jsonify({
        'en_curso': en_curso,
        'proximos': proximos,
        'despegados': despegados,
        'cancelados': cancelados,
        'todos_admin': todos_admin,
        'total': len(vuelos_raw),
        'telemetria': tabla_vuelos.metricas()
    })

@app.route('/api/vuelos', methods=['POST'])
def crear_vuelo():
    try:
        datos = validation.validar_vuelo(request.get_json(silent=True) or {})
    except validation.ValidationError as erro:
        return _error_json_400(erro.mensaje)

    codigo = datos['codigo']
    if tabla_vuelos.contiene(codigo):
        return jsonify({'error': f'El vuelo {codigo} ya se encuentra registrado en el Hash Map'}), 409

    config_aero = obtener_configuracion_aeronave(datos['tipo_aeronave'])

    vuelo_dict = {
        'codigo': codigo,
        'origen': datos['origen'],
        'destino': datos['destino'],
        'tipo_aeronave': datos['tipo_aeronave'],
        'duracion_estimada': datos['duracion_estimada'],
        'distancia_km': datos['distancia_km'],
        'fecha_salida': datos['fecha_salida'],
        'hora_salida_12h': datos['hora_salida_12h'],
        'hora_llegada_12h': datos['hora_llegada_12h'] or sumar_duracion(
            datos['hora_salida_12h'], datos['duracion_estimada']
        ),
        'puerta': datos['puerta'],
        'capacidad_maxima': config_aero['capacidad'],
        'estado': datos['estado']
    }

    tabla_vuelos.insertar(codigo, vuelo_dict)
    asegurar_estructuras_vuelo(codigo)
    db.persistir_vuelo(vuelo_dict)
    bump_state()
    app.logger.info("Vuelo %s programado (%s ➔ %s)", codigo, datos['origen'], datos['destino'])

    return jsonify({
        'mensaje': f'Vuelo {codigo} programado exitosamente en Hash Map O(1)',
        'vuelo': vuelo_dict,
        'telemetria': tabla_vuelos.metricas()
    }), 201

@app.route('/api/vuelos/buscar/<codigo>', methods=['GET'])
def buscar_vuelo_hash(codigo):
    codigo_req = str(codigo).strip().upper()
    codigo_target = resolver_codigo_vuelo(codigo_req)
    vuelo, tiempo_us = tabla_vuelos.buscar(codigo_target)
    if not vuelo:
        return jsonify({
            'encontrado': False,
            'mensaje': f'Vuelo {codigo_req} no existe en Hash Map',
            'tiempo_us': round(tiempo_us, 2)
        }), 404

    asegurar_estructuras_vuelo(codigo_target)
    return jsonify({
        'encontrado': True,
        'vuelo': vuelo,
        'ocupacion': manifiestos[codigo_target].tamano,
        'standby_count': colas_standby[codigo_target].tamano,
        'tiempo_us': round(tiempo_us, 2),
        'complejidad': 'O(1) amortizado - 1 salto en Hash Map',
        'telemetria': tabla_vuelos.metricas()
    })

# =====================================================================
# MÓDULO 2: PASAJEROS (Árbol AVL O(log n))
# =====================================================================
@app.route('/api/pasajeros', methods=['GET'])
def listar_pasajeros():
    pasajeros = arbol_pasajeros.recorrido_inorden()
    return jsonify({
        'pasajeros': pasajeros,
        'total': arbol_pasajeros.total_nodos,
        'altura_arbol': arbol_pasajeros.altura_arbol,
        'complejidad_busqueda': 'O(log n)'
    })

@app.route('/api/pasajeros', methods=['POST'])
def registrar_pasajero():
    try:
        datos = validation.validar_pasajero(request.get_json(silent=True) or {})
    except validation.ValidationError as erro:
        return _error_json_400(erro.mensaje)

    documento = datos['documento']
    nombre = datos['nombre']
    nacionalidad = datos['nacionalidad']
    categoria_viajero = datos['categoria_viajero']

    exito = arbol_pasajeros.insertar(documento, nombre, nacionalidad, categoria_viajero)
    if not exito:
        return jsonify({'error': f'El pasajero con documento {documento} ya existe en el Árbol AVL'}), 409

    p_dict = {
        'documento': documento,
        'nombre': nombre,
        'nacionalidad': nacionalidad,
        'categoria_viajero': categoria_viajero,
        'vuelo_asignado': None
    }
    db.persistir_pasajero(p_dict)
    bump_state()

    return jsonify({
        'mensaje': f'Pasajero {nombre} registrado en Árbol AVL con complejidad O(log n)',
        'pasajero': p_dict,
        'total_pasajeros': arbol_pasajeros.total_nodos,
        'altura_arbol': arbol_pasajeros.altura_arbol
    }), 201

@app.route('/api/pasajeros/buscar/<documento>', methods=['GET'])
def buscar_pasajero_avl(documento):
    documento = str(documento).strip()
    nodo, comparaciones, total = arbol_pasajeros.buscar(documento)

    if not nodo:
        return jsonify({
            'encontrado': False,
            'mensaje': f'Documento {documento} no encontrado en el Árbol AVL',
            'comparaciones': comparaciones,
            'total_registros': total
        }), 404

    ahorro_comparaciones = max(0, total - comparaciones)

    return jsonify({
        'encontrado': True,
        'pasajero': {
            'documento': nodo.documento,
            'nombre': nodo.nombre,
            'nacionalidad': nodo.nacionalidad,
            'categoria_viajero': nodo.categoria_viajero,
            'vuelo_asignado': nodo.vuelo_asignado
        },
        'comparaciones_avl': comparaciones,
        'comparaciones_peor_caso_lineal': total,
        'ahorro_comparaciones': ahorro_comparaciones,
        'rastro': f'Encontrado en {comparaciones} comparaciones de {total} registros en Árbol AVL (Nivel ~{comparaciones})',
        'complejidad': 'O(log n)'
    })

@app.route('/api/pasajeros/<documento>', methods=['DELETE'])
@app.route('/api/pasajero/eliminar/<documento>', methods=['POST', 'DELETE'])
def eliminar_pasajero_endpoint(documento):
    doc = str(documento).strip()
    if not doc:
        return jsonify({'error': 'Documento de pasajero requerido'}), 400

    nodo_p, _, _ = arbol_pasajeros.buscar(doc)
    nombre_pasajero = nodo_p.nombre if nodo_p else f"Pasajero {doc}"

    # 1. Eliminar en base de datos de manera atómica
    vuelo_cod, asiento_liberado = db.eliminar_pasajero_total(doc)

    # 2. Eliminar de Árbol AVL
    eliminado_avl = arbol_pasajeros.eliminar(doc)

    ascenso_info = None
    # 3. Liberar de estructuras de vuelo si estaba asignado a uno
    if vuelo_cod:
        vuelo_cod = resolver_codigo_vuelo(vuelo_cod)
        asegurar_estructuras_vuelo(vuelo_cod)
        lista = manifiestos[vuelo_cod]
        standby = colas_standby[vuelo_cod]
        cola_emb = colas_embarque[vuelo_cod]

        # Eliminar de manifiesto enlazado
        nodo_m = lista.eliminar(doc)
        if nodo_m:
            asiento_liberado = nodo_m.asiento
        # Eliminar de cola de embarque si estaba ahí
        cola_emb.eliminar(doc)
        # Eliminar de standby si estaba ahí
        standby.eliminar(doc)

        # Si liberó un asiento y hay pasajeros en Standby, promover al primero
        if asiento_liberado and not standby.esta_vacia():
            siguiente = standby.desencolar()
            if siguiente:
                db.eliminar_standby_persistido(vuelo_cod, siguiente.pasajero_doc)
                clase_ascenso = 'VIP' if asiento_liberado in ('1A', '1B', '2A', '2B', '3A', '3B') else 'Estándar'
                tarifa_ascenso = 3850000 if clase_ascenso == 'VIP' else 1820000

                arbol_pasajeros.actualizar_vuelo(siguiente.pasajero_doc, vuelo_cod)
                lista.insertar_al_final(
                    pasajero_doc=siguiente.pasajero_doc,
                    pasajero_nombre=siguiente.pasajero_nombre,
                    asiento=asiento_liberado,
                    hora_checkin=ahora_12h(),
                    categoria=siguiente.categoria,
                    clase_cabina=clase_ascenso,
                    tarifa_pagada=tarifa_ascenso
                )
                db.persistir_checkin(vuelo_cod, {
                    'pasajero_doc': siguiente.pasajero_doc,
                    'pasajero_nombre': siguiente.pasajero_nombre,
                    'asiento': asiento_liberado,
                    'hora_checkin_12h': ahora_12h(),
                    'categoria': siguiente.categoria,
                    'clase_cabina': clase_ascenso,
                    'tarifa_pagada_cop': tarifa_ascenso
                })
                ascenso_info = {
                    'pasajero_doc': siguiente.pasajero_doc,
                    'pasajero_nombre': siguiente.pasajero_nombre,
                    'asiento_asignado': asiento_liberado
                }

    bump_state()

    return jsonify({
        'exito': True,
        'mensaje': f'Pasajero {nombre_pasajero} (Doc: {doc}) eliminado exitosamente.',
        'documento': doc,
        'nombre': nombre_pasajero,
        'ascenso_standby': ascenso_info,
        'total_pasajeros': arbol_pasajeros.total_nodos,
        'altura_arbol': arbol_pasajeros.altura_arbol
    }), 200

# =====================================================================
# MÓDULO 3: COMPRA DE BOLETO, MAPA VECTORIAL DE AVIÓN Y CHECK-IN
# =====================================================================
@app.route('/api/avion/<codigo>/mapa', methods=['GET'])
def obtener_mapa_avion(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    asegurar_estructuras_vuelo(codigo)
    lista = manifiestos[codigo]
    standby = colas_standby[codigo]

    tipo_aero = vuelo.get('tipo_aeronave', 'Airbus A320neo')
    config_aero = obtener_configuracion_aeronave(tipo_aero)

    confirmados = lista.obtener_todos()
    ocupados_map = {p['asiento']: p for p in confirmados}

    asientos_procesados = []
    for s in config_aero['asientos']:
        s_id = s['id']
        esta_ocupado = s_id in ocupados_map
        p_info = ocupados_map.get(s_id)
        desglose = calcular_desglose_cop(s['tarifa_base_cop'])
        asientos_procesados.append({
            **s,
            'tarifa_base_formato_cop': formatear_cop(s['tarifa_base_cop']),
            'desglose_financiero': {
                'tarifa_base': formatear_cop(desglose['tarifa_base_cop']),
                'tarifa_admin': formatear_cop(desglose['tarifa_admin_cop']),
                'iva_19': formatear_cop(desglose['iva_cop']),
                'tasa_aeroportuaria': formatear_cop(desglose['tasa_aeroportuaria_cop']),
                'total_a_pagar': formatear_cop(desglose['total_cop']),
                'total_numerico': desglose['total_cop']
            },
            'ocupado': esta_ocupado,
            'pasajero': {
                'documento': p_info['pasajero_doc'],
                'nombre': p_info['pasajero_nombre'],
                'categoria': p_info['categoria'],
                'hora_checkin': p_info['hora_checkin']
            } if esta_ocupado else None
        })

    return jsonify({
        'vuelo': vuelo,
        'configuracion_aeronave': {
            'tipo': config_aero['tipo'],
            'categoria': config_aero['categoria'],
            'capacidad': config_aero['capacidad'],
            'ancho_fuselaje': config_aero['ancho_fuselaje'],
            'largo_fuselaje': config_aero['largo_fuselaje'],
            'asientos': asientos_procesados
        },
        'ocupacion': lista.tamano,
        'capacidad_maxima': vuelo['capacidad_maxima'],
        'lleno': lista.tamano >= vuelo['capacidad_maxima'],
        'manifiesto_cadena': lista.representacion_cadena(),
        'standby_cola': standby.obtener_todos(),
        'standby_tamano': standby.tamano
    })

@app.route('/api/checkin', methods=['POST'])
def emitir_boleto_checkin():
    try:
        datos = validation.validar_checkin(request.get_json(silent=True) or {})
    except validation.ValidationError as erro:
        return _error_json_400(erro.mensaje)

    data = request.get_json(silent=True) or {}
    codigo_vuelo = resolver_codigo_vuelo(datos['codigo_vuelo'])
    documento = datos['documento']
    nombre_nuevo = datos['nombre_nuevo']
    metodo_pago = datos['metodo_pago']
    asiento_solicitado = str(data.get('asiento', '')).strip().upper()

    vuelo, _ = tabla_vuelos.buscar(codigo_vuelo)
    if not vuelo:
        return jsonify({'error': f'Vuelo {codigo_vuelo} no existe'}), 404

    if vuelo.get('estado') in ['DESPEGADO', 'Despegado', 'Cerrado']:
        return jsonify({'error': f'El vuelo {codigo_vuelo} ya ha despegado o se encuentra cerrado para ventas'}), 400

    fecha_vuelo = str(vuelo.get('fecha_salida', '')).split(' ')[0]
    if fecha_vuelo and fecha_vuelo < hoy_iso():
        return jsonify({'error': f'El vuelo {codigo_vuelo} corresponde a una fecha pasada ({fecha_vuelo}) y no admite reservas.'}), 400

    nodo_p, _, _ = arbol_pasajeros.buscar(documento)
    if not nodo_p:
        if nombre_nuevo:
            cat = data.get('categoria', 'Estándar')
            arbol_pasajeros.insertar(documento, nombre_nuevo, 'Colombia', cat)
            db.persistir_pasajero({
                'documento': documento,
                'nombre': nombre_nuevo,
                'nacionalidad': 'Colombia',
                'categoria_viajero': cat,
                'vuelo_asignado': None
            })
            nodo_p, _, _ = arbol_pasajeros.buscar(documento)
        else:
            return jsonify({'error': f'Pasajero con documento {documento} no existe en el Árbol AVL. Ingrese su nombre para registrarlo.'}), 404

    asegurar_estructuras_vuelo(codigo_vuelo)
    lista = manifiestos[codigo_vuelo]
    standby = colas_standby[codigo_vuelo]

    # REGLA DE NEGOCIO: un tiquete activo por pasajero.
    # Si ya tiene asiento confirmado en otro vuelo NO despegado ni cancelado,
    # se exige cancelar allá primero (consistencia AVL + manifiestos).
    vuelo_previo_codigo = getattr(nodo_p, 'vuelo_asignado', None)
    if vuelo_previo_codigo and vuelo_previo_codigo != codigo_vuelo:
        vuelo_previo, _ = tabla_vuelos.buscar(vuelo_previo_codigo)
        if vuelo_previo:
            estado_previo = str(vuelo_previo.get('estado', ''))
            sigue_activo = (
                'CANCELADO' not in estado_previo.upper()
                and estado_previo not in ('DESPEGADO', 'Despegado', 'Cerrado', 'ARCHIVADO')
            )
            if sigue_activo:
                return jsonify({
                    'error': (
                        f'El pasajero {nodo_p.nombre} ya tiene un tiquete confirmado en el vuelo '
                        f'{vuelo_previo_codigo}. Debe cancelar ese check-in antes de comprar en {codigo_vuelo}.'
                    )
                }), 409

    if lista.buscar(documento) is not None:
        return jsonify({'error': f'El pasajero ya tiene tiquete confirmado en el vuelo {codigo_vuelo}'}), 400

    if standby.contiene(documento):
        return jsonify({'error': f'El pasajero ya está en la lista de espera (Standby FIFO) de este vuelo'}), 400

    capacidad = vuelo['capacidad_maxima']
    ahora = ahora_12h()

    # --- LÓGICA DE SOBREVENTA (STANDBY FIFO) ---
    if lista.tamano >= capacidad:
        nodo_cola, pos = standby.encolar(
            pasajero_doc=nodo_p.documento,
            pasajero_nombre=nodo_p.nombre,
            categoria=nodo_p.categoria_viajero,
            hora_ingreso=ahora
        )
        db.persistir_standby(codigo_vuelo, {
            'pasajero_doc': nodo_p.documento,
            'pasajero_nombre': nodo_p.nombre,
            'categoria': nodo_p.categoria_viajero,
            'hora_ingreso_12h': ahora
        })
        bump_state()

        return jsonify({
            'accion': 'STANDBY_ASIGNADO',
            'mensaje': f'Vuelo al 100% ({lista.tamano}/{capacidad}). Pasajero {nodo_p.nombre} registrado en Standby FIFO posición #{pos}.',
            'posicion_standby': pos,
            'vuelo': codigo_vuelo,
            'pasajero_doc': nodo_p.documento,
            'pasajero_nombre': nodo_p.nombre
        }), 200

    # Determinación y validación de asiento en catálogo
    config_aero = obtener_configuracion_aeronave(vuelo.get('tipo_aeronave', 'Airbus A320neo'))
    asientos_ocupados = {p['asiento'] for p in lista.obtener_todos()}

    asiento_final = None
    clase_cabina = 'Estándar'
    tarifa_base_cop = 780000

    if asiento_solicitado:
        if asiento_solicitado in asientos_ocupados:
            return jsonify({'error': f'El asiento {asiento_solicitado} ya está ocupado en la aeronave'}), 400
        asiento_info = next((s for s in config_aero['asientos'] if s['id'] == asiento_solicitado), None)
        if not asiento_info:
            return jsonify({'error': f'El asiento {asiento_solicitado} no existe en este modelo'}), 400
        asiento_final = asiento_solicitado
        clase_cabina = asiento_info['clase']
        tarifa_base_cop = asiento_info['tarifa_base_cop']
    else:
        for s in config_aero['asientos']:
            if s['id'] not in asientos_ocupados:
                asiento_final = s['id']
                clase_cabina = s['clase']
                tarifa_base_cop = s['tarifa_base_cop']
                break

    desglose = calcular_desglose_cop(tarifa_base_cop)

    # Inserción en Lista Enlazada Manifiesto O(1)
    lista.insertar_al_final(
        pasajero_doc=nodo_p.documento,
        pasajero_nombre=nodo_p.nombre,
        asiento=asiento_final,
        hora_checkin=ahora,
        categoria=nodo_p.categoria_viajero,
        clase_cabina=clase_cabina,
        tarifa_pagada=desglose['total_cop']
    )

    arbol_pasajeros.actualizar_vuelo(documento, codigo_vuelo)
    db.persistir_checkin(codigo_vuelo, {
        'pasajero_doc': nodo_p.documento,
        'pasajero_nombre': nodo_p.nombre,
        'asiento': asiento_final,
        'hora_checkin_12h': ahora,
        'categoria': nodo_p.categoria_viajero,
        'clase_cabina': clase_cabina,
        'tarifa_pagada_cop': desglose['total_cop']
    })

    ref_pago = data.get('referencia_pago') or f"AF-{codigo_vuelo}-{(int(time.time() * 1000)) % 8999 + 1000}"
    db.persistir_pago_reciente({
        'documento': nodo_p.documento,
        'nombre_completo': nodo_p.nombre,
        'nacionalidad': nodo_p.nacionalidad,
        'categoria': nodo_p.categoria_viajero,
        'vuelo_id': codigo_vuelo,
        'origen_destino': f"{vuelo['origen'].split('-')[0].strip()} ✈ {vuelo['destino'].split('-')[0].strip()}",
        'asiento': asiento_final,
        'metodo_pago': metodo_pago or 'Tarjeta Débito/Crédito Visa/Mastercard',
        'monto_cop': desglose['total_cop'],
        'referencia_pago': ref_pago,
        'estado_embarque': 'Confirmado',
        'fecha_hora_registro': f"{vuelo.get('fecha_salida', '2026-10-22')} • {ahora}"
    })

    bump_state()

    return jsonify({
        'accion': 'CHECKIN_CONFIRMADO',
        'mensaje': f'¡Tiquete emitido con éxito para {nodo_p.nombre}! Asiento asignado: {asiento_final} ({clase_cabina})',
        'asiento': asiento_final,
        'clase_cabina': clase_cabina,
        'total_cop': formatear_cop(desglose['total_cop']),
        'hora_checkin': ahora,
        'cadena_nodos': lista.representacion_cadena(),
        'ocupacion': f"{lista.tamano}/{capacidad}"
    }), 201

@app.route('/api/checkin/cancelar', methods=['POST'])
def cancelar_checkin():
    data = request.get_json(silent=True) or {}
    _codigo_bruto = str(data.get('codigo_vuelo', '')).strip().upper()
    documento = str(data.get('documento', '')).strip()

    if not _codigo_bruto or not documento:
        return jsonify({'error': 'Código de vuelo y documento son obligatorios'}), 400
    if not validation._RE_DOCUMENTO.match(documento):
        return jsonify({'error': 'El documento del pasajero no es válido.'}), 400

    codigo_vuelo = resolver_codigo_vuelo(_codigo_bruto)

    vuelo, _ = tabla_vuelos.buscar(codigo_vuelo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    asegurar_estructuras_vuelo(codigo_vuelo)
    lista = manifiestos[codigo_vuelo]
    standby = colas_standby[codigo_vuelo]

    nodo_eliminado = lista.eliminar(documento)
    if not nodo_eliminado:
        return jsonify({'error': f'Pasajero {documento} no se encuentra en el manifiesto'}), 404

    asiento_liberado = nodo_eliminado.asiento
    clase_liberada = nodo_eliminado.clase_cabina
    tarifa_liberada = nodo_eliminado.tarifa_pagada

    arbol_pasajeros.actualizar_vuelo(documento, None)
    db.eliminar_checkin_persistido(codigo_vuelo, documento)

    ascenso_info = None

    # TRIGGER CRÍTICO: Reasignación automática de asiento desde Cola FIFO Standby
    if not standby.esta_vacia():
        primer_standby = standby.desencolar()
        db.eliminar_standby_persistido(codigo_vuelo, primer_standby.pasajero_doc)

        ahora = ahora_12h()
        lista.insertar_al_final(
            pasajero_doc=primer_standby.pasajero_doc,
            pasajero_nombre=primer_standby.pasajero_nombre,
            asiento=asiento_liberado,
            hora_checkin=ahora,
            categoria=primer_standby.categoria,
            clase_cabina=clase_liberada,
            tarifa_pagada=tarifa_liberada
        )
        arbol_pasajeros.actualizar_vuelo(primer_standby.pasajero_doc, codigo_vuelo)
        db.persistir_checkin(codigo_vuelo, {
            'pasajero_doc': primer_standby.pasajero_doc,
            'pasajero_nombre': primer_standby.pasajero_nombre,
            'asiento': asiento_liberado,
            'hora_checkin_12h': ahora,
            'categoria': primer_standby.categoria,
            'clase_cabina': clase_liberada,
            'tarifa_pagada_cop': tarifa_liberada
        })

        db.persistir_pago_reciente({
            'documento': primer_standby.pasajero_doc,
            'nombre_completo': primer_standby.pasajero_nombre,
            'nacionalidad': 'Colombia',
            'categoria': primer_standby.categoria,
            'vuelo_id': codigo_vuelo,
            'origen_destino': f"{vuelo['origen'].split('-')[0].strip()} ✈ {vuelo['destino'].split('-')[0].strip()}",
            'asiento': asiento_liberado,
            'metodo_pago': 'Asignación Automática Lista Prioritaria',
            'monto_cop': tarifa_liberada,
            'referencia_pago': f"AF-{codigo_vuelo}-{(int(time.time() * 1000)) % 8999 + 1000}",
            'estado_embarque': 'Confirmado',
            'fecha_hora_registro': f"{vuelo.get('fecha_salida', '2026-10-22')} • {ahora}"
        })

        ascenso_info = {
            'pasajero_doc': primer_standby.pasajero_doc,
            'pasajero_nombre': primer_standby.pasajero_nombre,
            'asiento_asignado': asiento_liberado,
            'clase_cabina': clase_liberada,
            'mensaje': f'¡Ascenso Automático FIFO! {primer_standby.pasajero_nombre} salió de Standby y obtuvo el asiento {asiento_liberado} ({clase_liberada}).'
        }

    bump_state()

    return jsonify({
        'mensaje': f'Tiquete cancelado para {nodo_eliminado.pasajero_nombre}. Asiento {asiento_liberado} liberado.',
        'nodo_eliminado': {
            'documento': nodo_eliminado.pasajero_doc,
            'nombre': nodo_eliminado.pasajero_nombre,
            'asiento': asiento_liberado
        },
        'ascenso_standby': ascenso_info,
        'ocupacion': f"{lista.tamano}/{vuelo['capacidad_maxima']}",
        'cadena_nodos': lista.representacion_cadena()
    })

# =====================================================================
# MÓDULO 4: PUERTA DE EMBARQUE & BOARDING PASS
# =====================================================================
@app.route('/api/embarque/<codigo>/iniciar', methods=['POST'])
def iniciar_proceso_embarque(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    if vuelo.get('estado') in ['DESPEGADO', 'Despegado', 'Cerrado']:
        return jsonify({'error': 'El vuelo ya ha sido despachado y la puerta se encuentra cerrada'}), 400

    asegurar_estructuras_vuelo(codigo)
    lista = manifiestos[codigo]
    cola_emb = colas_embarque[codigo]

    if lista.tamano == 0:
        return jsonify({'error': 'No hay pasajeros confirmados para iniciar el embarque'}), 400

    # Los pasajeros que ya abordaron NO deben re-encolarse si el embarque
    # se reinicia a mitad del proceso (persistido en tabla embarque).
    ya_a_bordo = db.obtener_documentos_embarcados_vuelo(codigo)

    tabla_vuelos.actualizar_estado(codigo, 'Embarcando')
    vuelo['estado'] = 'Embarcando'
    db.persistir_vuelo(vuelo)

    while not cola_emb.esta_vacia():
        cola_emb.desencolar()

    # Priorizar categoría VIP primero, seguido del orden de registro FIFO
    pendientes = [p for p in lista.obtener_todos() if p['pasajero_doc'] not in ya_a_bordo]
    pendientes.sort(key=lambda x: (0 if str(x.get('categoria', '')).strip().upper() == 'VIP' else 1))

    for p in pendientes:
        cola_emb.encolar(
            pasajero_doc=p['pasajero_doc'],
            pasajero_nombre=p['pasajero_nombre'],
            categoria=p['categoria'],
            hora_ingreso=p['hora_checkin']
        )

    if cola_emb.esta_vacia():
        return jsonify({
            'mensaje': f'Todos los pasajeros del vuelo {codigo} ya se encuentran a bordo.',
            'completado': True,
            'total_por_abordar': 0,
            'cola_embarque': [],
            'estado_vuelo': vuelo['estado']
        })

    bump_state()

    return jsonify({
        'mensaje': f'Embarque iniciado para el vuelo {codigo}. Estado cambiado a Embarcando.',
        'total_por_abordar': cola_emb.tamano,
        'cola_embarque': cola_emb.obtener_todos(),
        'estado_vuelo': 'Embarcando'
    })

@app.route('/api/embarque/<codigo>/abordar-siguiente', methods=['POST'])
def abordar_siguiente(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    asegurar_estructuras_vuelo(codigo)
    cola_emb = colas_embarque[codigo]
    lista = manifiestos[codigo]
    total_confirmados = lista.tamano

    if total_confirmados == 0:
        return jsonify({
            'completado': False,
            'despachado': False,
            'mensaje': f'El vuelo {codigo} no tiene pasajeros asignados en sala de espera.',
            'progreso': {
                'abordados': 0,
                'total': 0,
                'porcentaje': 0
            }
        }), 200

    if vuelo.get('estado') in ['DESPEGADO', 'Despegado', 'Cerrado']:
        return jsonify({
            'completado': True,
            'despachado': True,
            'mensaje': f'El vuelo {codigo} ya ha despegado y la puerta está cerrada.',
            'progreso': {
                'abordados': total_confirmados,
                'total': total_confirmados,
                'porcentaje': 100
            }
        })

    # Si la cola está vacía, verificar si faltan pasajeros por abordar en el manifiesto
    if cola_emb.esta_vacia():
        ya_abordados = db.obtener_documentos_embarcados_vuelo(codigo)
        if len(ya_abordados) < total_confirmados and vuelo.get('estado') not in ['DESPEGADO', 'Despegado', 'Cerrado']:
            pendientes = [p for p in lista.obtener_todos() if p['pasajero_doc'] not in ya_abordados]
            # Priorizar categoría VIP primero, seguido del orden de registro FIFO
            pendientes.sort(key=lambda x: (0 if str(x.get('categoria', '')).strip().upper() == 'VIP' else 1))
            for p in pendientes:
                cola_emb.encolar(
                    pasajero_doc=p['pasajero_doc'],
                    pasajero_nombre=p['pasajero_nombre'],
                    categoria=p['categoria'],
                    hora_ingreso=p['hora_checkin']
                )
            if vuelo.get('estado') != 'Embarcando':
                tabla_vuelos.actualizar_estado(codigo, 'Embarcando')
                vuelo['estado'] = 'Embarcando'
                db.persistir_vuelo(vuelo)
        elif len(ya_abordados) >= total_confirmados:
            return jsonify({
                'completado': True,
                'despachado': True,
                'mensaje': f'Todos los pasajeros del vuelo {codigo} ya han abordado.',
                'progreso': {
                    'abordados': total_confirmados,
                    'total': total_confirmados,
                    'porcentaje': 100
                }
            }), 200

    if cola_emb.esta_vacia():
        tabla_vuelos.actualizar_estado(codigo, 'DESPEGADO')
        vuelo['estado'] = 'DESPEGADO'
        db.persistir_vuelo(vuelo)
        db.actualizar_todos_embarcados_vuelo(codigo, 'ABORDADO')
        nuevo_vuelo = generar_reemplazo_vuelo_interno(codigo)
        bump_state()
        return jsonify({
            'completado': True,
            'despachado': True,
            'mensaje': f'Todos los pasajeros confirmados han completado el abordaje. Vuelo {codigo} DESPEGADO.',
            'nuevo_vuelo': nuevo_vuelo['codigo'] if nuevo_vuelo else None,
            'progreso': {
                'abordados': total_confirmados,
                'total': total_confirmados,
                'porcentaje': 100
            }
        })

    pasajero_nodo = cola_emb.desencolar()

    asiento = 'TBD'
    clase_cabina = 'Estándar'
    tarifa_pagada = 780000
    p_manifiesto = lista.buscar(pasajero_nodo.pasajero_doc)
    if p_manifiesto:
        asiento = p_manifiesto.asiento
        clase_cabina = p_manifiesto.clase_cabina
        tarifa_pagada = p_manifiesto.tarifa_pagada

    restantes = cola_emb.tamano
    abordados = total_confirmados - restantes
    porcentaje = round((abordados / total_confirmados) * 100) if total_confirmados > 0 else 100

    nuevo_vuelo_cod = None
    if restantes == 0:
        tabla_vuelos.actualizar_estado(codigo, 'DESPEGADO')
        vuelo['estado'] = 'DESPEGADO'
        db.persistir_vuelo(vuelo)
        db.actualizar_todos_embarcados_vuelo(codigo, 'ABORDADO')
        nuevo = generar_reemplazo_vuelo_interno(codigo)
        if nuevo:
            nuevo_vuelo_cod = nuevo['codigo']
    elif restantes == 1:
        tabla_vuelos.actualizar_estado(codigo, 'Última llamada')
        vuelo['estado'] = 'Última llamada'
        db.persistir_vuelo(vuelo)

    # Actualizar estado de embarque en tabla persistente de pagos recientes a ABORDADO
    db.actualizar_estado_embarque_pago(codigo, pasajero_nodo.pasajero_doc, 'ABORDADO')

    bump_state()

    boarding_pass = {
        'vuelo_codigo': codigo,
        'origen': vuelo.get('origen', 'BOG - Bogotá'),
        'destino': vuelo.get('destino', 'MAD - Madrid'),
        'tipo_aeronave': vuelo.get('tipo_aeronave', 'Airbus A320neo'),
        'duracion': vuelo.get('duracion_estimada', '09h 50m'),
        'distancia_km': vuelo.get('distancia_km', 8034),
        'puerta': vuelo['puerta'],
        'hora_salida_12h': vuelo['hora_salida_12h'],
        'hora_llegada_12h': vuelo.get('hora_llegada_12h', '11:45 PM'),
        'fecha_salida': vuelo['fecha_salida'],
        'pasajero_doc': pasajero_nodo.pasajero_doc,
        'pasajero_nombre': pasajero_nodo.pasajero_nombre,
        'categoria': pasajero_nodo.categoria,
        'clase_cabina': clase_cabina,
        'tarifa_formateada': formatear_cop(tarifa_pagada),
        'asiento': asiento,
        'secuencia_fifo': abordados,
        'hora_abordaje_12h': ahora_12h(),
        'progreso_porcentaje': porcentaje,
        'restantes': restantes
    }

    return jsonify({
        'completado': restantes == 0,
        'despachado': restantes == 0,
        'nuevo_vuelo': nuevo_vuelo_cod,
        'boarding_pass': boarding_pass,
        'pasajero_abordado': {
            'documento': pasajero_nodo.pasajero_doc,
            'nombre': pasajero_nodo.pasajero_nombre,
            'asiento': asiento,
            'clase_cabina': clase_cabina,
            'categoria': pasajero_nodo.categoria,
            'estado': 'ABORDADO'
        },
        'progreso': {
            'abordados': abordados,
            'total': total_confirmados,
            'porcentaje': porcentaje
        }
    })

@app.route('/api/embarque/<codigo>/abordar-individual', methods=['POST'])
def abordar_individual(codigo):
    return abordar_siguiente(codigo)

@app.route('/api/embarque/<codigo>/cancelar', methods=['POST'])
def cancelar_proceso_embarque(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    asegurar_estructuras_vuelo(codigo)
    cola_emb = colas_embarque[codigo]

    # 1. Vaciar cola de abordaje
    while not cola_emb.esta_vacia():
        cola_emb.desencolar()

    # 2. Revertir estado del vuelo a 'Check-in abierto'
    tabla_vuelos.actualizar_estado(codigo, 'Check-in abierto')
    vuelo['estado'] = 'Check-in abierto'
    db.persistir_vuelo(vuelo)

    # 3. Revertir estado de los pasajeros en pagos recientes a 'Confirmado'
    db.actualizar_todos_embarcados_vuelo(codigo, 'Confirmado')

    bump_state()

    return jsonify({
        'exito': True,
        'mensaje': f'Operación de embarque para el vuelo {codigo} cancelada y revertida a Check-in abierto.',
        'codigo': codigo,
        'estado_vuelo': 'Check-in abierto'
    }), 200

@app.route('/api/pasajeros-recientes', methods=['GET'])
def listar_pasajeros_recientes():
    registros = db.obtener_pasajeros_recientes_pagos()
    return jsonify({
        'total': len(registros),
        'registros': registros
    })

@app.route('/api/vuelo/cancelar/<codigo>', methods=['POST', 'DELETE'])
@app.route('/api/vuelos/<codigo>/cancelar', methods=['POST', 'DELETE'])
def cancelar_vuelo_endpoint(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    nuevo_estado = 'CANCELADO / ANULADO POR OPERADOR'
    tabla_vuelos.actualizar_estado(codigo, nuevo_estado)
    vuelo['estado'] = nuevo_estado

    # Persistir en SQLite y liberar asignación de pasajeros
    db.anular_o_cancelar_vuelo(codigo, nuevo_estado, liberar_pasajeros=True)

    # Vaciar colas y liberar recursos en memoria
    asegurar_estructuras_vuelo(codigo)
    manifiestos[codigo] = ListaEnlazadaManifiesto()
    while not colas_embarque[codigo].esta_vacia():
        colas_embarque[codigo].desencolar()
    while not colas_standby[codigo].esta_vacia():
        colas_standby[codigo].desencolar()

    # Liberar asignación en el árbol AVL de pasajeros
    for p_dict in arbol_pasajeros.recorrido_inorden():
        if p_dict.get('vuelo_asignado') == codigo:
            arbol_pasajeros.actualizar_vuelo(p_dict['documento'], None)

    bump_state()

    return jsonify({
        'exito': True,
        'mensaje': f'Vuelo {codigo} cancelado y anulado por el operador. Cabina y recursos liberados.',
        'codigo': codigo,
        'estado': nuevo_estado
    }), 200

@app.route('/api/vuelo/reactivar/<codigo>', methods=['POST'])
@app.route('/api/vuelos/<codigo>/reactivar', methods=['POST'])
def reactivar_vuelo_endpoint(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    nuevo_estado = 'Check-in abierto'
    tabla_vuelos.actualizar_estado(codigo, nuevo_estado)
    vuelo['estado'] = nuevo_estado
    db.reactivar_vuelo_operativo(codigo, nuevo_estado)

    bump_state()

    return jsonify({
        'exito': True,
        'mensaje': f'Vuelo {codigo} reactivado a Check-in abierto.',
        'codigo': codigo,
        'estado': nuevo_estado
    }), 200

@app.route('/api/vuelo/archivar/<codigo>', methods=['POST'])
@app.route('/api/vuelos/<codigo>/archivar', methods=['POST'])
def archivar_vuelo_endpoint(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    nuevo_estado = 'ARCHIVADO'
    tabla_vuelos.actualizar_estado(codigo, nuevo_estado)
    vuelo['estado'] = nuevo_estado
    db.archivar_vuelo_operativo(codigo)

    bump_state()

    return jsonify({
        'exito': True,
        'mensaje': f'Vuelo {codigo} archivado y retirado de la consola activa.',
        'codigo': codigo,
        'estado': nuevo_estado
    }), 200

@app.route('/api/vuelos/<codigo>/expirar-y-reemplazar', methods=['POST'])
def expirar_y_reemplazar_vuelo(codigo):
    codigo = resolver_codigo_vuelo(codigo)
    vuelo, _ = tabla_vuelos.buscar(codigo)
    if not vuelo:
        return jsonify({'error': 'Vuelo no encontrado'}), 404

    # Protección de vuelos base de demostración: AF1001 y flota inicial no se cancelan por timeout
    VUELOS_BASE_PROTEGIDOS = {'AF1001', 'AF2020', 'AF2040', 'AF3022', 'AF4055', 'AF5088'}
    if codigo in VUELOS_BASE_PROTEGIDOS:
        return jsonify({
            'exito': True,
            'mensaje': f'El vuelo base {codigo} se mantiene activo en rampa por política operacional.',
            'vuelo_protegido': codigo
        }), 200

    asegurar_estructuras_vuelo(codigo)
    total_confirmados = manifiestos[codigo].tamano
    restantes = colas_embarque[codigo].tamano
    estado_actual = vuelo.get('estado', '')

    # Regla de Negocio: Solo vuelos adicionales creados que superen inactividad
    if estado_actual not in ['DESPEGADO', 'Despegado'] and (estado_actual == 'Check-in abierto' or restantes > 0 or total_confirmados == 0):
        nuevo_estado = 'CANCELADO / EXPIRADO'
        tabla_vuelos.actualizar_estado(codigo, nuevo_estado)
        vuelo['estado'] = nuevo_estado
        db.anular_o_cancelar_vuelo(codigo, nuevo_estado, liberar_pasajeros=True)

        manifiestos[codigo] = ListaEnlazadaManifiesto()
        while not colas_embarque[codigo].esta_vacia():
            colas_embarque[codigo].desencolar()
        while not colas_standby[codigo].esta_vacia():
            colas_standby[codigo].desencolar()

        for p_dict in arbol_pasajeros.recorrido_inorden():
            if p_dict.get('vuelo_asignado') == codigo:
                arbol_pasajeros.actualizar_vuelo(p_dict['documento'], None)

        bump_state()

        return jsonify({
            'exito': True,
            'cancelado_timeout': True,
            'mensaje': f'Vuelo {codigo} CANCELADO / EXPIRADO por superar tiempo límite sin sellado de embarque.',
            'vuelo_expirado': codigo,
            'estado': nuevo_estado,
            'nuevo_vuelo': None
        }), 200

    # 1. Marcar vuelo previo como DESPEGADO
    tabla_vuelos.actualizar_estado(codigo, 'DESPEGADO')
    vuelo['estado'] = 'DESPEGADO'
    db.persistir_vuelo(vuelo)
    db.actualizar_todos_embarcados_vuelo(codigo, 'EMBARCADO')

    # 2. Generar nuevo vuelo de reemplazo
    nuevo_vuelo = generar_reemplazo_vuelo_interno(codigo)
    bump_state()

    return jsonify({
        'exito': True,
        'mensaje': f'Vuelo {codigo} retirado por rampa (DESPEGADO). Nuevo vuelo {nuevo_vuelo["codigo"] if nuevo_vuelo else ""} programado con éxito.',
        'vuelo_expirado': codigo,
        'nuevo_vuelo': nuevo_vuelo
    })

if __name__ == '__main__':
    print(f"[OK] {config.APP_NAME} v{config.VERSION} — http://{config.HOST}:{config.PORT}")
    print(f"     Base de datos: {config.DB_PATH}")
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
