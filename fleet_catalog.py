"""
=============================================================================
  Catálogo de Flota y Configuración de Cabinas AERO FLOW AIRLINES
  7 Modelos Oficiales de Flota (Capacidades desde 12 hasta 100 asientos)
  Precios en Pesos Colombianos ($ COP) y simetría geométrica estricta.
=============================================================================
"""

def _generar_asientos(filas_vip: int, filas_eco: int, tarifa_vip: int, tarifa_eco: int):
    """
    Genera butacas simétricas y ordenadas:
    - Cabina VIP: 2 butacas por fila (Col A ventana izq, Col B ventana der)
    - Cabina Economy: 4 butacas por fila (A ventana, B pasillo, C pasillo, D ventana)
    """
    asientos = []
    # 1. Cabina VIP (2 por fila)
    for f in range(1, filas_vip + 1):
        asientos.append({
            "id": f"{f}A", "fila": f, "col": "A", "lado": "izq",
            "clase": "VIP", "tarifa_base_cop": tarifa_vip,
            "tipo_asiento": "Insignia VIP Suite Ventana"
        })
        asientos.append({
            "id": f"{f}B", "fila": f, "col": "B", "lado": "der",
            "clase": "VIP", "tarifa_base_cop": tarifa_vip,
            "tipo_asiento": "Insignia VIP Suite Ventana"
        })

    # 2. Cabina Economy (4 por fila: 2 a la izquierda, 2 a la derecha)
    fila_inicio_eco = filas_vip + 1
    for f in range(fila_inicio_eco, fila_inicio_eco + filas_eco):
        asientos.append({
            "id": f"{f}A", "fila": f, "col": "A", "lado": "izq",
            "clase": "Estándar", "tarifa_base_cop": tarifa_eco,
            "tipo_asiento": "Economy Ventana"
        })
        asientos.append({
            "id": f"{f}B", "fila": f, "col": "B", "lado": "izq",
            "clase": "Estándar", "tarifa_base_cop": tarifa_eco,
            "tipo_asiento": "Economy Pasillo"
        })
        asientos.append({
            "id": f"{f}C", "fila": f, "col": "C", "lado": "der",
            "clase": "Estándar", "tarifa_base_cop": tarifa_eco,
            "tipo_asiento": "Economy Pasillo"
        })
        asientos.append({
            "id": f"{f}D", "fila": f, "col": "D", "lado": "der",
            "clase": "Estándar", "tarifa_base_cop": tarifa_eco,
            "tipo_asiento": "Economy Ventana"
        })

    return asientos

CATALOGO_AERONAVES = {
    # 1. Embraer Praetor 600 Regional: 12 asientos (4 VIP / 8 Economy)
    "Embraer Praetor 600 Regional": {
        "tipo": "Jet Ejecutivo Regional VIP",
        "categoria": "regional",
        "capacidad": 12,
        "ancho_fuselaje": 190,
        "largo_fuselaje": 540,
        "asientos": _generar_asientos(filas_vip=2, filas_eco=2, tarifa_vip=1950000, tarifa_eco=680000)
    },

    # 2. Airbus A319 Corporate: 26 asientos (6 VIP / 20 Economy — Modelo del Vuelo Inicial de Prueba)
    "Airbus A319 Corporate": {
        "tipo": "Aeronave Comercial Corporate de Medio Alcance",
        "categoria": "commercial",
        "capacidad": 26,
        "ancho_fuselaje": 230,
        "largo_fuselaje": 680,
        "asientos": _generar_asientos(filas_vip=3, filas_eco=5, tarifa_vip=2250000, tarifa_eco=790000)
    },

    # 3. Airbus A320neo: 36 asientos (8 VIP / 28 Economy)
    "Airbus A320neo": {
        "tipo": "Aeronave Comercial de Pasillo Único de Alta Eficiencia",
        "categoria": "commercial",
        "capacidad": 36,
        "ancho_fuselaje": 240,
        "largo_fuselaje": 760,
        "asientos": _generar_asientos(filas_vip=4, filas_eco=7, tarifa_vip=2450000, tarifa_eco=850000)
    },

    # 4. Boeing 737 MAX 8: 48 asientos (8 VIP / 40 Economy)
    "Boeing 737 MAX 8": {
        "tipo": "Aeronave Comercial de Nueva Generación Transcontinental",
        "categoria": "commercial",
        "capacidad": 48,
        "ancho_fuselaje": 240,
        "largo_fuselaje": 840,
        "asientos": _generar_asientos(filas_vip=4, filas_eco=10, tarifa_vip=2600000, tarifa_eco=890000)
    },

    # 5. Boeing 787-9 Dreamliner: 64 asientos (12 VIP / 52 Economy)
    "Boeing 787-9 Dreamliner": {
        "tipo": "Wide-Body Transoceánico de Largo Alcance",
        "categoria": "widebody",
        "capacidad": 64,
        "ancho_fuselaje": 270,
        "largo_fuselaje": 980,
        "asientos": _generar_asientos(filas_vip=6, filas_eco=13, tarifa_vip=3800000, tarifa_eco=1250000)
    },

    # 6. Airbus A350-900 XWB: 80 asientos (16 VIP / 64 Economy)
    "Airbus A350-900 XWB": {
        "tipo": "Aeronave de Fuselaje Extra Ancho para Rutas Intercontinentales",
        "categoria": "widebody",
        "capacidad": 80,
        "ancho_fuselaje": 280,
        "largo_fuselaje": 1120,
        "asientos": _generar_asientos(filas_vip=8, filas_eco=16, tarifa_vip=4200000, tarifa_eco=1450000)
    },

    # 7. Boeing 777-300ER Flagship: 100 asientos (20 VIP / 80 Economy)
    "Boeing 777-300ER Flagship": {
        "tipo": "Buque Insignia Transcontinental de Máxima Capacidad",
        "categoria": "flagship",
        "capacidad": 100,
        "ancho_fuselaje": 290,
        "largo_fuselaje": 1280,
        "asientos": _generar_asientos(filas_vip=10, filas_eco=20, tarifa_vip=4900000, tarifa_eco=1650000)
    }
}

# Alias de compatibilidad hacia atrás
CATALOGO_AERONAVES["Embraer Praetor 600"] = CATALOGO_AERONAVES["Embraer Praetor 600 Regional"]

def obtener_configuracion_aeronave(tipo_aeronave: str) -> dict:
    if not tipo_aeronave:
        return CATALOGO_AERONAVES["Airbus A319 Corporate"]
    return CATALOGO_AERONAVES.get(tipo_aeronave, CATALOGO_AERONAVES["Airbus A319 Corporate"])

def calcular_desglose_cop(
    tarifa_base_cop: int,
    tasa_aeroportuaria_cop: int = 158000,
    tarifa_admin_cop: int = 45000,
    descuento_porcentaje: int = 0
) -> dict:
    """
    Calcula el desglose financiero exacto en Pesos Colombianos (COP) utilizando
    únicamente enteros exactos (int / BIGINT) sin tipos de coma flotante.
    Valida que los descuentos no superen el 100% ni sean negativos.
    """
    tarifa_base = int(round(float(tarifa_base_cop)))
    if tarifa_base < 0:
        raise ValueError("La tarifa base no puede ser negativa.")

    descuento_pct = int(descuento_porcentaje or 0)
    if descuento_pct < 0 or descuento_pct > 100:
        raise ValueError("El porcentaje de descuento debe estar entre 0% y 100%.")

    if descuento_pct > 0:
        monto_descuento = int(round(tarifa_base * descuento_pct / 100))
        tarifa_aplicada = max(0, tarifa_base - monto_descuento)
    else:
        monto_descuento = 0
        tarifa_aplicada = tarifa_base

    tarifa_admin = int(tarifa_admin_cop if tarifa_admin_cop is not None else 45000)
    tasa_aeroportuaria = int(tasa_aeroportuaria_cop if tasa_aeroportuaria_cop is not None else 158000)
    iva_19 = int(round(tarifa_aplicada * 0.19))
    total = int(tarifa_aplicada + tarifa_admin + iva_19 + tasa_aeroportuaria)

    return {
        "tarifa_base_cop": tarifa_base,
        "descuento_porcentaje": descuento_pct,
        "descuento_cop": monto_descuento,
        "tarifa_aplicada_cop": tarifa_aplicada,
        "tarifa_admin_cop": tarifa_admin,
        "iva_cop": iva_19,
        "tasa_aeroportuaria_cop": tasa_aeroportuaria,
        "total_cop": total
    }
