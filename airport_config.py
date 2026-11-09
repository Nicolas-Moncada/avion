"""
=============================================================================
  Airport White-Label Configuration Manager — AERO FLOW AIRLINES
  Carga dinámica de especificaciones por aeropuerto (airports/<codigo>/airport.json).
=============================================================================
"""

import os
import json
import logging
from typing import Dict, Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AIRPORTS_DIR = os.path.join(BASE_DIR, "airports")

_AIRPORT_CACHE: Dict[str, Dict[str, Any]] = {}


def obtener_config_aeropuerto(codigo_iata: str = "BOG") -> Dict[str, Any]:
    """
    Obtiene la configuración oficial del aeropuerto desde su archivo JSON.
    Si el aeropuerto no existe, retorna la configuración base de BOG (El Dorado).
    """
    codigo = (codigo_iata or "BOG").strip().upper()
    if codigo in _AIRPORT_CACHE:
        return _AIRPORT_CACHE[codigo]

    ruta = os.path.join(AIRPORTS_DIR, codigo, "airport.json")
    if not os.path.exists(ruta):
        ruta = os.path.join(AIRPORTS_DIR, "BOG", "airport.json")

    try:
        with open(ruta, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            _AIRPORT_CACHE[codigo] = cfg
            return cfg
    except Exception as e:
        logging.error(f"[AirportConfig] Error cargando configuración de {codigo}: {e}")
        fallback = {
            "codigo": "BOG",
            "nombre": "Aeropuerto Internacional El Dorado",
            "ciudad": "Bogotá",
            "pais": "Colombia",
            "moneda": "COP",
            "timezone": "America/Bogota",
            "tasas": {
                "tasa_aeroportuaria_cop": 158000,
                "tarifa_admin_cop": 45000,
                "iva_porcentaje": 19
            },
            "branding": {
                "nombre_comercial": "Aero Flow Airlines",
                "color_acento": "#E11D48",
                "color_acento_hover": "#BE123C",
                "color_superficie": "#0F172A",
                "logo_url": "/icons/icon-192.png",
                "tiempo_retencion_minutos": 12
            }
        }
        _AIRPORT_CACHE[codigo] = fallback
        return fallback


def calcular_precio_servidor(
    tarifa_base_cop: int,
    origen_iata: str = "BOG",
    descuento_porcentaje: int = 0
) -> Dict[str, int]:
    """
    Cálculo 100% server-side de tarifas, tasas e impuestos en Pesos Colombianos (COP) enteros.
    El cliente NUNCA envía precios ni determina tasas.
    """
    cfg = obtener_config_aeropuerto(origen_iata)
    tasas = cfg.get("tasas", {})
    tasa_aero = int(tasas.get("tasa_aeroportuaria_cop", 158000))
    tarifa_admin = int(tasas.get("tarifa_admin_cop", 45000))
    iva_pct = int(tasas.get("iva_porcentaje", 19))

    tarifa_base = int(round(float(tarifa_base_cop)))
    if tarifa_base < 0:
        raise ValueError("La tarifa base no puede ser negativa.")

    descuento = int(descuento_porcentaje or 0)
    if descuento < 0 or descuento > 100:
        raise ValueError("El descuento debe estar entre 0% y 100%.")

    if descuento > 0:
        monto_descuento = int(round(tarifa_base * descuento / 100))
        tarifa_aplicada = max(0, tarifa_base - monto_descuento)
    else:
        monto_descuento = 0
        tarifa_aplicada = tarifa_base

    iva = int(round(tarifa_aplicada * iva_pct / 100))
    total = int(tarifa_aplicada + tarifa_admin + iva + tasa_aero)

    return {
        "tarifa_base_cop": tarifa_base,
        "descuento_porcentaje": descuento,
        "descuento_cop": monto_descuento,
        "tarifa_aplicada_cop": tarifa_aplicada,
        "tarifa_admin_cop": tarifa_admin,
        "iva_cop": iva,
        "tasa_aeroportuaria_cop": tasa_aero,
        "total_cop": total
    }
