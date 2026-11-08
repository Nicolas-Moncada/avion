"""
=============================================================================
  Configuración Central — AERO FLOW AIRLINES
  Toda la configuración runtime se controla por variables de entorno:
  - AEROFLOW_DB_PATH            Ruta absoluta/relativa de la base SQLite.
  - AEROFLOW_HOST               Interfaz de escucha (por defecto loopback).
  - AEROFLOW_PORT               Puerto HTTP (por defecto 5000).
  - AEROFLOW_DEBUG              1 | true | yes  para consola enriquecida.
  - AEROFLOW_AUTO_RESET_ON_START 1 para restaurar la semilla en cada arranque.
  - AEROFLOW_MAX_BODY_BYTES     Límite de tamaño de cuerpo (1 MB por omisión).
=============================================================================
"""

import os
import sys

if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    BASE_DIR = BUNDLE_DIR

APP_NAME = "AERO FLOW AIRLINES"
VERSION = "2.1.0"

_AFFIRMATIVES = {"1", "true", "yes", "si", "sí", "on"}


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in _AFFIRMATIVES


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None or raw == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


# ---------------------------------------------------------------- Persistencia
DB_PATH = os.path.abspath(
    os.getenv("AEROFLOW_DB_PATH") or os.path.join(BASE_DIR, "aerocore.db")
)

# ---------------------------------------------------------------------- Server
HOST = (os.getenv("AEROFLOW_HOST") or "127.0.0.1").strip()
PORT = _env_int("AEROFLOW_PORT", 5000)
DEBUG = _env_bool("AEROFLOW_DEBUG", False)

# Por defecto la app NO destruye datos al reiniciar.
# Cuando se necesite el comportamiento antiguo (demo con datos de fábrica):
#   AEROFLOW_AUTO_RESET_ON_START=1 python app.py
AUTO_RESET_ON_START = _env_bool("AEROFLOW_AUTO_RESET_ON_START", False)

MAX_BODY_BYTES = _env_int("AEROFLOW_MAX_BODY_BYTES", 1024 * 1024)

YOUTUBE_LASER_NOTE = None  # reservado para futuras integraciones
