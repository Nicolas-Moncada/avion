"""
=============================================================================
  Validación de Entradas — AERO FLOW AIRLINES
  Toda la validación devuelve mensajes claros en español y nunca expone
  detalles internos. `ValidationError` se traduce a HTTP 400 en el router.
=============================================================================
"""

import re
from datetime import datetime, date, timedelta
from typing import Any, Dict, Optional

# --------------------------------------------------------------------- Excepción
class ValidationError(Exception):
    """Error de validación de datos de entrada (se responde HTTP 400)."""

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


# ------------------------------------------------------------ Expresiones y sets
_RE_CODIGO_VUELO = re.compile(r"^[A-Z0-9]{3,10}$")
_RE_DOCUMENTO = re.compile(r"^[A-Za-z0-9.\-]{3,40}$")
_RE_NOMBRE = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ().'\- ]{2,120}$")
_RE_NOMBRE_CORTO = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ().'\- ]{2,60}$")
_RE_PUERTA = re.compile(r"^[A-Z0-9]{1,4}(?:-[A-Z0-9]{1,4})?$")
_RE_HORA_12H = re.compile(r"^[01]?\d:[0-5]\d\s*(?:AM|PM)(?:\s*\(\+1\))?$", re.IGNORECASE)
_RE_FECHA_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_RE_DURACION = re.compile(r"^\d{1,2}h\s+\d{2}m$")

ESTADOS_ACTIVOS_VALIDOS: frozenset = frozenset(
    {"Programado", "Check-in abierto", "Embarcando", "Última llamada"}
)

CATEGORIAS_VALIDAS: frozenset = frozenset({"VIP", "Estándar"})


# ----------------------------------------------------------------------- Helpers
def _limpiar(valor: Any) -> str:
    return "" if valor is None else str(valor).strip()


def _require(condicion: bool, mensaje: str) -> None:
    if not condicion:
        raise ValidationError(mensaje)


# --------------------------------------------------------------------- Vuelos
def validar_vuelo(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normaliza y valida el payload de creación de vuelos."""
    data = data if isinstance(data, dict) else {}

    codigo = _limpiar(data.get("codigo")).upper()
    _require(bool(codigo), "El código de vuelo es obligatorio.")
    _require(
        bool(_RE_CODIGO_VUELO.match(codigo)),
        "El código de vuelo debe tener entre 3 y 10 caracteres alfanuméricos sin espacios (ej. AF2040).",
    )

    origen = _limpiar(data.get("origen"))
    destino = _limpiar(data.get("destino"))
    _require(bool(origen), "El origen es obligatorio.")
    _require(bool(destino), "El destino es obligatorio.")
    _require(len(origen) <= 120, "El origen debe tener menos de 120 caracteres.")
    _require(len(destino) <= 120, "El destino debe tener menos de 120 caracteres.")
    _require(origen.upper() != destino.upper(), "El origen y el destino no pueden ser iguales.")

    tipo_aeronave = _limpiar(data.get("tipo_aeronave"))
    _require(bool(tipo_aeronave), "El modelo de aeronave es obligatorio.")
    _require(len(tipo_aeronave) <= 80, "El modelo de aeronave debe tener menos de 80 caracteres.")

    fecha_salida = _limpiar(data.get("fecha_salida")).split(" ")[0]
    _require(bool(_RE_FECHA_ISO.match(fecha_salida)), "La fecha de salida debe tener formato AAAA-MM-DD.")
    try:
        fecha_parseada = datetime.strptime(fecha_salida, "%Y-%m-%d").date()
    except ValueError as e:
        raise ValidationError("La fecha de salida no es una fecha válida.") from e
    _require(
        fecha_parseada >= date.today() - timedelta(days=730),
        "La fecha de salida no puede ser anterior a dos años en el pasado.",
    )

    hora_salida = _limpiar(data.get("hora_salida_12h"))
    _require(bool(_RE_HORA_12H.match(hora_salida)), "La hora de salida debe estar en formato 12h, ej. 11:00 AM.")
    hora_llegada = _limpiar(data.get("hora_llegada_12h"))
    if hora_llegada:
        _require(bool(_RE_HORA_12H.match(hora_llegada)), "La hora de llegada debe estar en formato 12h, ej. 05:45 PM.")

    puerta = _limpiar(data.get("puerta")).upper()
    _require(bool(_RE_PUERTA.match(puerta)), "El código de puerta debe tener formato B-01, A-05, VIP-01, etc.")

    estado = _limpiar(data.get("estado")) or "Check-in abierto"
    _require(
        estado in ESTADOS_ACTIVOS_VALIDOS,
        f"El estado del vuelo debe ser uno de: {', '.join(sorted(ESTADOS_ACTIVOS_VALIDOS))}.",
    )

    distancia_raw = data.get("distancia_km", 4500)
    try:
        distancia_km = int(float(distancia_raw))
    except (TypeError, ValueError) as e:
        raise ValidationError("La distancia debe ser un número entero en kilómetros.") from e
    _require(0 < distancia_km < 50000, "La distancia debe estar entre 1 y 50.000 km.")

    duracion_estimada = _limpiar(data.get("duracion_estimada")) or "06h 00m"
    _require(
        bool(_RE_DURACION.match(duracion_estimada)),
        "La duración estimada debe tener formato 09h 45m.",
    )

    return {
        "codigo": codigo,
        "origen": origen,
        "destino": destino,
        "tipo_aeronave": tipo_aeronave,
        "duracion_estimada": duracion_estimada,
        "distancia_km": distancia_km,
        "fecha_salida": fecha_salida,
        "hora_salida_12h": hora_salida,
        "hora_llegada_12h": hora_llegada or None,
        "puerta": puerta,
        "estado": estado,
    }


# ------------------------------------------------------------------ Pasajeros
def validar_pasajero(data: Dict[str, Any]) -> Dict[str, str]:
    """Normaliza y valida el payload de registro de pasajeros."""
    data = data if isinstance(data, dict) else {}

    documento = _limpiar(data.get("documento"))
    _require(bool(documento), "El documento de identidad es obligatorio.")
    _require(
        bool(_RE_DOCUMENTO.match(documento)),
        "El documento debe tener entre 3 y 40 caracteres (letras, números, punto o guion).",
    )

    nombre = _limpiar(data.get("nombre"))
    _require(bool(nombre), "El nombre completo es obligatorio.")
    _require(
        bool(_RE_NOMBRE.match(nombre)),
        "El nombre solo admite letras, espacios, acentos, punto, apóstrofe o guion (2 a 120 caracteres).",
    )

    nacionalidad = _limpiar(data.get("nacionalidad")) or "Colombia"
    _require(
        bool(_RE_NOMBRE_CORTO.match(nacionalidad)),
        "La nacionalidad admite solo letras y espacios (hasta 60 caracteres).",
    )

    categoria = _limpiar(data.get("categoria_viajero")) or "Estándar"
    _require(categoria in CATEGORIAS_VALIDAS, 'La categoría de viajero solo puede ser "VIP" o "Estándar".')

    return {
        "documento": documento,
        "nombre": nombre,
        "nacionalidad": nacionalidad,
        "categoria_viajero": categoria,
    }


# ------------------------------------------------------------------ Check-in
def validar_checkin(data: Dict[str, Any]) -> Dict[str, str]:
    """Valida el payload de emisión/cancelación de boleto."""
    data = data if isinstance(data, dict) else {}

    codigo_vuelo = _limpiar(data.get("codigo_vuelo")).upper()
    _require(bool(codigo_vuelo), "El código de vuelo es obligatorio.")
    _require(bool(_RE_CODIGO_VUELO.match(codigo_vuelo)), "El código de vuelo no es válido.")

    documento = _limpiar(data.get("documento"))
    _require(bool(_RE_DOCUMENTO.match(documento)), "El documento del pasajero no es válido.")

    metodo_pago = _limpiar(data.get("metodo_pago"))
    if metodo_pago:
        _require(len(metodo_pago) <= 80, "El método de pago no puede exceder 80 caracteres.")

    nombre_nuevo = _limpiar(data.get("nombre_nuevo"))
    if nombre_nuevo:
        _require(
            bool(_RE_NOMBRE_CORTO.match(nombre_nuevo)),
            "El nombre del pasajero nuevo admite solo letras, espacios, acentos, punto, apóstrofe o guion.",
        )

    return {
        "codigo_vuelo": codigo_vuelo,
        "documento": documento,
        "metodo_pago": metodo_pago,
        "nombre_nuevo": nombre_nuevo,
    }
