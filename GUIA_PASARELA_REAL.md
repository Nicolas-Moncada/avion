# GUÍA DE INTEGRACIÓN DE PASARELAS REALES EN PRODUCCIÓN (AERO FLOW v2.2)

> **Destinatarios:** Ingenieros de Backend, Arquitectos de Seguridad y DevOps  
> **Alcance:** Sustitución de `SimuladorPagoAdapter` por Wompi, Bold o Mercado Pago en entornos de producción aeronáuticos y aeroportuarios.  
> **Estándar de Cumplimiento:** PCI-DSS Nivel SAQ A (Cero almacenamiento de PAN/CVV en servidores propios).

---

## 1. Arquitectura de Pagos Desacoplada (`ProveedorPago`)

El motor de pagos de Aero Flow implementa el patrón **Adapter / Strategy** mediante la clase base abstracta `ProveedorPago` definida en `payments/adapter.py`. Toda pasarela comercial se conecta implementando cinco métodos deterministas:

```python
class ProveedorPago(ABC):
    @abstractmethod
    def crear_intento(self, orden_dict: dict, return_url: str) -> dict:
        """Genera el token de sesión o link de pago con la pasarela bancaria."""
        pass

    @abstractmethod
    def confirmar(self, orden_id: str, payload_pasarela: dict) -> dict:
        """Verifica la respuesta síncrona o resultado tras el checkout."""
        pass

    @abstractmethod
    def consultar(self, referencia_externa: str) -> dict:
        """Consulta el estado del pago directamente en la API de la pasarela."""
        pass

    @abstractmethod
    def reembolsar(self, referencia_externa: str, monto_cop: int, motivo: str) -> dict:
        """Emite un reembolso total o parcial ante cancelaciones o colisiones."""
        pass

    @abstractmethod
    def verificar_webhook(self, headers: dict, raw_body: bytes) -> bool:
        """Valida criptográficamente la firma HMAC-SHA256 del webhook entrante."""
        pass
```

---

## 2. Paso a Paso: Integración con Wompi (Bancolombia)

Wompi es la pasarela de referencia en Colombia para transacciones de tarjetas (Visa, MasterCard, Amex) y transferencias bancarias en línea (PSE).

### 2.1 Variables de Entorno de Producción (`.env`)
Nunca escribas estas llaves en el código fuente. Inyéctalas como variables de entorno seguras:

```env
WOMPI_PUBLIC_KEY="pub_prod_xxxxxxxxxxxxxxxxxxxxxxxx"
WOMPI_PRIVATE_KEY="prv_prod_xxxxxxxxxxxxxxxxxxxxxxxx"
WOMPI_INTEGRITY_SECRET="prod_integrity_xxxxxxxxxxxxxxxxxxxxxxxx"
WOMPI_EVENT_SECRET="prod_events_xxxxxxxxxxxxxxxxxxxxxxxx"
WOMPI_API_URL="https://production.wompi.co/v1"
```

### 2.2 Implementación del Adaptador Wompi (`payments/wompi_adapter.py`)
Crea el archivo `payments/wompi_adapter.py` heredando de `ProveedorPago`:

```python
import os
import hmac
import hashlib
import requests
from payments.adapter import ProveedorPago

class WompiPagoAdapter(ProveedorPago):
    def __init__(self):
        self.public_key = os.environ.get("WOMPI_PUBLIC_KEY")
        self.private_key = os.environ.get("WOMPI_PRIVATE_KEY")
        self.integrity_secret = os.environ.get("WOMPI_INTEGRITY_SECRET")
        self.event_secret = os.environ.get("WOMPI_EVENT_SECRET")
        self.base_url = os.environ.get("WOMPI_API_URL", "https://production.wompi.co/v1")

    def _calcular_firma_integridad(self, referencia: str, monto_en_centavos: int, moneda: str) -> str:
        """
        Wompi exige la concatenación: <referencia><montoEnCentavos><moneda><integritySecret>
        hasheada con SHA-256.
        """
        cadena = f"{referencia}{monto_en_centavos}{moneda}{self.integrity_secret}"
        return hashlib.sha256(cadena.encode("utf-8")).hexdigest()

    def crear_intento(self, orden_dict: dict, return_url: str) -> dict:
        # En Wompi los montos se envían en centavos (ej. COP $250.000 = 25000000 centavos)
        monto_centavos = int(orden_dict["total_cop"]) * 100
        referencia = orden_dict["pnr"]
        firma = self._calcular_firma_integridad(referencia, monto_centavos, "COP")

        return {
            "public_key": self.public_key,
            "currency": "COP",
            "amount_in_cents": monto_centavos,
            "reference": referencia,
            "signature_integrity": firma,
            "redirect_url": return_url,
            "expiration_time": orden_dict["bloqueado_hasta"]
        }

    def verificar_webhook(self, headers: dict, raw_body: bytes) -> bool:
        """
        Wompi envía en los encabezados la cabecera 'X-Event-Checksum'.
        Se valida recalculando SHA-256 sobre las propiedades del evento + event_secret.
        """
        checksum_recibido = headers.get("X-Event-Checksum") or headers.get("x-event-checksum")
        if not checksum_recibido or not self.event_secret:
            return False

        # Validación HMAC según documentación oficial de eventos Wompi
        h = hmac.new(self.event_secret.encode("utf-8"), raw_body, hashlib.sha256)
        calculado = h.hexdigest()
        return hmac.compare_digest(calculado, checksum_recibido)

    def consultar(self, referencia_externa: str) -> dict:
        url = f"{self.base_url}/transactions/{referencia_externa}"
        resp = requests.get(url, headers={"Authorization": f"Bearer {self.private_key}"}, timeout=8)
        resp.raise_for_status()
        data = resp.json().get("data", {})
        return {
            "estado": data.get("status"), # 'APPROVED', 'DECLINED', 'VOIDED'
            "referencia": data.get("reference"),
            "monto_cop": int(data.get("amount_in_cents", 0)) // 100,
            "id_transaccion": data.get("id")
        }

    def reembolsar(self, referencia_externa: str, monto_cop: int, motivo: str) -> dict:
        url = f"{self.base_url}/transactions/{referencia_externa}/refund"
        payload = {
            "amount_in_cents": int(monto_cop) * 100,
            "reason": motivo
        }
        resp = requests.post(url, json=payload, headers={"Authorization": f"Bearer {self.private_key}"}, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def confirmar(self, orden_id: str, payload_pasarela: dict) -> dict:
        tx_id = payload_pasarela.get("transaction_id")
        return self.consultar(tx_id)
```

### 2.3 Registro en la Factoría de Pasarelas (`payments/__init__.py`)
En el archivo de inicialización de pagos, simplemente alterna el adaptador según el entorno:

```python
import os
from payments.adapter import SimuladorPagoAdapter
from payments.wompi_adapter import WompiPagoAdapter

def obtener_adaptador_pagos():
    ambiente = os.environ.get("ENVIRONMENT", "development").lower()
    if ambiente == "production":
        return WompiPagoAdapter()
    return SimuladorPagoAdapter()
```

---

## 3. Despliegue de Supabase Edge Functions

Para delegar la verificación criptográfica y el procesamiento de pagos a la infraestructura Edge sin cargar la base de datos principal:

1. **Instalar el CLI de Supabase:**
   ```bash
   npm install -g supabase
   ```
2. **Iniciar sesión y enlazar el proyecto:**
   ```bash
   supabase login
   supabase link --project-ref <tu-project-ref-de-supabase>
   ```
3. **Inyectar los Secrets de Producción en el Vault de Supabase:**
   ```bash
   supabase secrets set WOMPI_PRIVATE_KEY="prv_prod_xxxxxxxx"
   supabase secrets set WOMPI_EVENT_SECRET="prod_events_xxxxxxxx"
   supabase secrets set AEROPUERTO_CODIGO_DEFECTO="BOG"
   ```
4. **Desplegar la función `procesar-pago`:**
   ```bash
   supabase functions deploy procesar-pago --no-verify-jwt
   ```
5. **Configurar la URL del Webhook en la pasarela:**
   Apunta la URL de eventos de Wompi / Bold a:
   `https://<tu-project-ref>.supabase.co/functions/v1/procesar-pago`

---

## 4. Configuración de Webhook Seguro y Rotación de Claves

1. **Protocolo HTTPS Estricto (TLS 1.3):**
   - El endpoint de webhooks rechaza cualquier conexión en texto claro (HTTP).
2. **Idempotencia Obligatoria:**
   - La base de datos almacena el `idempotency_key` o `transaction_id` en `pagos.idempotency_key` con índice `UNIQUE`.
   - Si la pasarela reintenta el envío de un webhook (común ante picos de tráfico), el sistema retorna HTTP 200 de inmediato sin duplicar el abono en el manifiesto de pasajeros ni crear recibos gemelos.
3. **Rotación de Secrets Sin Caída (Zero Downtime):**
   - El verificador HMAC de Aero Flow soporta validación con clave primaria y clave secundaria (`WOMPI_EVENT_SECRET_OLD`).
   - Al rotar el secret en el dashboard de la pasarela, añade el nuevo secret como variable primaria y el anterior como secundaria durante 48 horas antes de retirarlo.

---

## 5. Checklist de Seguridad PCI-DSS (Nivel SAQ A)

Antes de abrir transacciones con tarjetas reales al público general, valida que todos los puntos estén marcados:

- [x] **Cero Almacenamiento de PAN / CVV:** La aplicación nunca guarda el número completo de tarjeta de crédito (PAN) de 16 dígitos ni el código de seguridad de 3 dígitos (CVV/CVC) en memoria persistente, base de datos ni archivos de log.
- [x] **Tokenización Cliente-Servidor:** La captura de datos de tarjeta se realiza mediante iframes seguros o tokens bancarios de la pasarela.
- [x] **Cálculo de Precios del Lado del Servidor:** Las tarifas en COP, los impuestos del 19% de IVA y las tasas aeroportuarias dinámicas son calculadas exclusivamente por el backend mediante la función `crear_orden`. Cualquier monto adulterado desde el navegador es descartado de forma terminante.
- [x] **Bloqueo Pesimista contra Doble Venta:** Cada butaca de la aeronave tiene un candado de concurrencia de 12 minutos respaldado por un índice único parcial en PostgreSQL.
- [x] **Protección de Webhook Tardío:** Si una confirmación bancaria llega después de que los 12 minutos han expirado y la butaca fue asignada a otro viajero, el adaptador dispara un reembolso íntegro automático (`reembolsado`), garantizando cero sobreventa física en la aeronave.
- [x] **Cabeceras de Seguridad:** CSP estricta, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Permissions-Policy` aplicadas en todas las respuestas HTTP.
