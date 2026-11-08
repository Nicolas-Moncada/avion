"""
=============================================================================
  Payment Adapter Interface & State Machine — AERO FLOW AIRLINES
  Máquina de estados estricta, Idempotencia, Retención de asiento y Simulación.
=============================================================================
"""

import hmac
import hashlib
import time
import uuid
import logging
from typing import Dict, Any, Optional, Tuple

# Estados válidos de la máquina de estados de órdenes y pagos
ESTADOS_VALIDOS = {"pendiente", "autorizado", "pagado", "fallido", "expirado", "reembolsado", "cancelado"}

# Transiciones estrictamente permitidas por la máquina de estados
TRANSICIONES_PERMITIDAS = {
    "pendiente": {"autorizado", "pagado", "fallido", "expirado", "cancelado"},
    "autorizado": {"pagado", "fallido", "expirado", "cancelado"},
    "pagado": {"reembolsado"},
    "fallido": set(),
    "expirado": {"reembolsado"},  # Permite reembolso automático si un webhook tardío fue pagado
    "reembolsado": set(),
    "cancelado": set()
}


class TransicionInvalidaError(Exception):
    """Excepción lanzada cuando una transición de estado viola la máquina de estados."""
    def __init__(self, estado_actual: str, nuevo_estado: str):
        mensaje = f"Transición ilegal de estado: no se permite cambiar de '{estado_actual}' a '{nuevo_estado}'."
        super().__init__(mensaje)
        self.estado_actual = estado_actual
        self.nuevo_estado = nuevo_estado


def validar_transicion_estado(estado_actual: str, nuevo_estado: str) -> bool:
    """Valida la transición según las reglas estrictas de la máquina de estados."""
    estado_act = str(estado_actual).strip().lower()
    nuevo_est = str(nuevo_estado).strip().lower()

    if estado_act == nuevo_est:
        return True  # Idempotente

    permitidos = TRANSICIONES_PERMITIDAS.get(estado_act, set())
    if nuevo_est not in permitidos:
        raise TransicionInvalidaError(estado_act, nuevo_est)
    return True


class ProveedorPago:
    """Interfaz base para adaptadores de pasarela de pago."""
    def crear_intento(self, orden: Dict[str, Any], idempotency_key: str) -> Dict[str, Any]:
        raise NotImplementedError

    def confirmar(self, referencia_externa: str, datos_pago: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def consultar(self, referencia_externa: str) -> Dict[str, Any]:
        raise NotImplementedError

    def reembolsar(self, referencia_externa: str, monto_cop: int, motivo: str) -> Dict[str, Any]:
        raise NotImplementedError

    def verificar_webhook(self, payload: bytes, signature: str, secret: str) -> bool:
        raise NotImplementedError


class SimuladorPagoAdapter(ProveedorPago):
    """
    Adaptador de simulación determinista para pruebas automatizadas y modo offline.
    Soporta tarjetas de prueba (aprobado, rechazado, pendiente), idempotencia y firmas HMAC.
    """
    def __init__(self, webhook_secret: str = "whsec_aeroflow_simulated_key_2026"):
        self.webhook_secret = webhook_secret
        self._transacciones: Dict[str, Dict[str, Any]] = {}
        self._idempotency_map: Dict[str, str] = {}  # idempotency_key -> transaccion_id

    def crear_intento(self, orden: Dict[str, Any], idempotency_key: str) -> Dict[str, Any]:
        """Crea un intento de pago con llave de idempotencia única."""
        key = str(idempotency_key).strip()
        if key in self._idempotency_map:
            tx_id = self._idempotency_map[key]
            logging.info(f"[PagoSimulado] Intento idempotente detectado para key={key}. Retornando tx={tx_id}")
            return self._transacciones[tx_id]

        tx_id = f"tx_sim_{uuid.uuid4().hex[:12]}"
        intento = {
            "id": tx_id,
            "orden_id": orden.get("id"),
            "monto_cop": int(orden.get("total_cop", 0)),
            "moneda": "COP",
            "estado": "pendiente",
            "proveedor": "simulador",
            "referencia_externa": f"ref_ext_{tx_id}",
            "idempotency_key": key,
            "created_at": int(time.time())
        }
        self._transacciones[tx_id] = intento
        self._idempotency_map[key] = tx_id
        return intento

    def confirmar(self, referencia_externa: str, datos_pago: Dict[str, Any]) -> Dict[str, Any]:
        """
        Confirma o procesa el cobro simulado evaluando el número de tarjeta:
        - Termina en 4242 o 5555 -> Aprobado
        - Termina en 0002 -> Rechazado por fondos insuficientes
        - Termina en 0003 -> Pendiente de verificación antifraude
        """
        tx = next((t for t in self._transacciones.values() if t["referencia_externa"] == referencia_externa), None)
        if not tx:
            # Crear registro al vuelo si no fue pre-creado
            tx_id = f"tx_sim_{uuid.uuid4().hex[:12]}"
            tx = {
                "id": tx_id,
                "orden_id": datos_pago.get("orden_id"),
                "monto_cop": int(datos_pago.get("monto_cop", 0)),
                "moneda": "COP",
                "estado": "pendiente",
                "proveedor": "simulador",
                "referencia_externa": referencia_externa,
                "idempotency_key": datos_pago.get("idempotency_key", str(uuid.uuid4())),
                "created_at": int(time.time())
            }
            self._transacciones[tx_id] = tx

        pan = str(datos_pago.get("numero_tarjeta", "")).replace(" ", "").replace("-", "")
        ultimos_4 = pan[-4:] if len(pan) >= 4 else "4242"
        marca = "Visa" if pan.startswith("4") else ("Mastercard" if pan.startswith("5") else "Tarjeta")

        estado_actual = tx["estado"]
        if ultimos_4 == "0002":
            nuevo_estado = "fallido"
            codigo_error = "FONDOS_INSUFICIENTES"
            mensaje = "Transacción declinada por la entidad emisora (fondos insuficientes)."
        elif ultimos_4 == "0003":
            nuevo_estado = "pendiente"
            codigo_error = "EN_REVISION"
            mensaje = "Transacción en análisis de seguridad antifraude."
        else:
            nuevo_estado = "pagado"
            codigo_error = None
            mensaje = "Transacción aprobada satisfactoriamente."

        validar_transicion_estado(estado_actual, nuevo_estado)

        tx["estado"] = nuevo_estado
        tx["marca"] = marca
        tx["ultimos_4"] = ultimos_4
        tx["codigo_error"] = codigo_error
        tx["mensaje"] = mensaje
        tx["updated_at"] = int(time.time())

        return tx

    def consultar(self, referencia_externa: str) -> Optional[Dict[str, Any]]:
        """Consulta el estado actual de una transacción."""
        return next((t for t in self._transacciones.values() if t["referencia_externa"] == referencia_externa), None)

    def reembolsar(self, referencia_externa: str, monto_cop: int, motivo: str) -> Dict[str, Any]:
        """Ejecuta un reembolso total o parcial con auditoría estricta."""
        tx = self.consultar(referencia_externa)
        if not tx:
            raise ValueError(f"No existe transacción con referencia {referencia_externa}")

        if not motivo or not str(motivo).strip():
            raise ValueError("El motivo del reembolso es obligatorio para auditoría.")

        monto = int(monto_cop)
        if monto <= 0 or monto > tx["monto_cop"]:
            raise ValueError(f"El monto a reembolsar ({monto}) debe ser mayor a 0 y menor o igual al pagado ({tx['monto_cop']}).")

        validar_transicion_estado(tx["estado"], "reembolsado")

        reembolso_id = f"ref_{uuid.uuid4().hex[:12]}"
        reembolso_registro = {
            "reembolso_id": reembolso_id,
            "transaccion_id": tx["id"],
            "referencia_externa": referencia_externa,
            "monto_reembolsado_cop": monto,
            "motivo": str(motivo).strip(),
            "estado": "reembolsado",
            "timestamp": int(time.time())
        }

        tx["estado"] = "reembolsado"
        tx["reembolso"] = reembolso_registro
        tx["updated_at"] = int(time.time())

        return reembolso_registro

    def verificar_webhook(self, payload: bytes, signature: str, secret: Optional[str] = None) -> bool:
        """Verifica la firma criptográfica HMAC-SHA256 de un webhook entrante."""
        clave = (secret or self.webhook_secret).encode("utf-8")
        firma_esperada = hmac.new(clave, payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(firma_esperada, signature)
