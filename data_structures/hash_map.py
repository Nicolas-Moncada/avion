"""
=============================================================================
  TablaHashVuelos — Diccionario / Hash Map para Administración de Vuelos
=============================================================================

MÓDULO 1: Administración de Vuelos y Tablero FIDS

JUSTIFICACIÓN TÉCNICA:
  Se utiliza un Hash Map (tabla hash) porque las operaciones centrales de
  este módulo —buscar un vuelo por su código, actualizar su estado y acceder
  a su información— deben ejecutarse en tiempo constante O(1) sin importar
  el volumen total de vuelos registrados en el sistema.

  En un entorno FIDS aeroportuario real, los agentes de servicio consultan
  y actualizan el estado de vuelos cientos de veces por minuto. Un Hash Map
  garantiza que cada una de esas operaciones tenga un costo amortizado de
  O(1), mientras que una lista secuencial requeriría O(n) por consulta.

COMPLEJIDAD TEMPORAL (Big-O):
  ┌──────────────────────┬───────────────┬───────────────────────────────────┐
  │ Operación            │ Complejidad   │ Explicación                       │
  ├──────────────────────┼───────────────┼───────────────────────────────────┤
  │ insertar(código)     │ O(1) amort.   │ Hash del código → slot directo    │
  │ buscar(código)       │ O(1) amort.   │ Acceso directo por clave hash     │
  │ actualizar_estado()  │ O(1) amort.   │ Acceso + mutación in-place        │
  │ eliminar(código)     │ O(1) amort.   │ Borrado directo por clave         │
  │ obtener_todos()      │ O(n)          │ Recorrido completo de la tabla    │
  │ contiene(código)     │ O(1) amort.   │ Lookup de existencia              │
  └──────────────────────┴───────────────┴───────────────────────────────────┘

IMPLEMENTACIÓN:
  Internamente se apoya en el dict nativo de Python, que implementa una
  tabla hash abierta con sondeo. Se encapsula para exponer una API semántica
  aeroportuaria y métricas de telemetría.
=============================================================================
"""

import time


class TablaHashVuelos:
    """
    Hash Map que almacena vuelos indexados por su código único (ej. 'AV123').

    Cada entrada almacena un diccionario con los datos del vuelo:
      {
        'codigo': str,
        'destino': str,
        'fecha_salida': str,       # 'YYYY-MM-DD'
        'hora_salida': str,        # 'HH:MM'
        'puerta': str,             # ej. 'G-12'
        'capacidad_maxima': int,
        'estado': str,             # Programado | Check-in abierto | Embarcando | ...
      }
    """

    def __init__(self):
        # ---- Tabla hash interna: dict de Python (hash table con open addressing) ----
        self._tabla: dict[str, dict] = {}
        # Contador de operaciones para telemetría
        self._ops_count: int = 0

    # ------------------------------------------------------------------
    #  INSERCIÓN — O(1) amortizado
    # ------------------------------------------------------------------
    def insertar(self, codigo: str, datos_vuelo: dict) -> bool:
        """
        Inserta un vuelo en la tabla hash.
        Si el código ya existe, retorna False sin sobrescribir.

        Complejidad: O(1) amortizado — el hash del string 'codigo' se
        calcula en tiempo proporcional a la longitud del código (constante
        acotada, ya que los códigos IATA tienen ≤10 caracteres), y la
        inserción en el dict interno es O(1) amortizado.
        """
        if codigo in self._tabla:
            return False  # Ya existe, no duplicar
        datos_vuelo['codigo'] = codigo
        self._tabla[codigo] = datos_vuelo
        self._ops_count += 1
        return True

    # ------------------------------------------------------------------
    #  BÚSQUEDA — O(1) amortizado
    # ------------------------------------------------------------------
    def buscar(self, codigo: str) -> tuple[dict | None, float]:
        """
        Busca un vuelo por su código en la tabla hash.

        Retorna (datos_vuelo, tiempo_microsegundos).
        Si no existe, retorna (None, tiempo_microsegundos).

        Complejidad: O(1) amortizado — acceso directo al slot calculado
        por la función hash. En 1 salto se obtiene el registro completo.
        """
        inicio = time.perf_counter()
        resultado = self._tabla.get(codigo, None)
        fin = time.perf_counter()
        self._ops_count += 1
        tiempo_us = (fin - inicio) * 1_000_000  # convertir a microsegundos
        return resultado, tiempo_us

    # ------------------------------------------------------------------
    #  ACTUALIZACIÓN DE ESTADO — O(1) amortizado
    # ------------------------------------------------------------------
    def actualizar_estado(self, codigo: str, nuevo_estado: str) -> bool:
        """
        Actualiza el campo 'estado' de un vuelo existente.

        Complejidad: O(1) amortizado — lookup O(1) + mutación in-place O(1).
        """
        vuelo = self._tabla.get(codigo)
        if vuelo is None:
            return False
        vuelo['estado'] = nuevo_estado
        self._ops_count += 1
        return True

    # ------------------------------------------------------------------
    #  ACTUALIZACIÓN GENERAL — O(1) amortizado
    # ------------------------------------------------------------------
    def actualizar(self, codigo: str, datos: dict) -> bool:
        """
        Actualiza múltiples campos de un vuelo existente.

        Complejidad: O(1) amortizado para el lookup + O(k) donde k es
        el número de campos a actualizar (k << n, constante pequeña).
        """
        vuelo = self._tabla.get(codigo)
        if vuelo is None:
            return False
        vuelo.update(datos)
        self._ops_count += 1
        return True

    # ------------------------------------------------------------------
    #  ELIMINACIÓN — O(1) amortizado
    # ------------------------------------------------------------------
    def eliminar(self, codigo: str) -> bool:
        """
        Elimina un vuelo de la tabla hash por su código.

        Complejidad: O(1) amortizado — borrado directo del slot hash.
        """
        if codigo in self._tabla:
            del self._tabla[codigo]
            self._ops_count += 1
            return True
        return False

    # ------------------------------------------------------------------
    #  CONTIENE — O(1) amortizado
    # ------------------------------------------------------------------
    def contiene(self, codigo: str) -> bool:
        """
        Verifica si un código de vuelo existe en la tabla.

        Complejidad: O(1) amortizado — lookup de existencia en hash table.
        """
        return codigo in self._tabla

    # ------------------------------------------------------------------
    #  OBTENER TODOS — O(n)
    # ------------------------------------------------------------------
    def obtener_todos(self) -> list[dict]:
        """
        Retorna la lista completa de vuelos almacenados.

        Complejidad: O(n) — recorrido de todos los n elementos de la tabla.
        """
        return list(self._tabla.values())

    # ------------------------------------------------------------------
    #  MÉTRICAS DE TELEMETRÍA
    # ------------------------------------------------------------------
    def metricas(self) -> dict:
        """
        Devuelve métricas de telemetría del Hash Map:
          - total_llaves: Cantidad de vuelos almacenados
          - operaciones_realizadas: Total acumulado de ops (insert/search/update/delete)
          - tipo_acceso: Confirmación de acceso directo en 1 salto
          - complejidad: Descripción Big-O
          - factor_carga: Proporción de slots usados (estimado)

        Complejidad: O(1) — lectura de contadores internos.
        """
        n = len(self._tabla)
        # Python dict redimensiona cuando el factor de carga supera ~2/3
        # Capacidad interna mínima es 8; crece por potencias de 2
        capacidad_estimada = 8
        while capacidad_estimada * 2 / 3 < n:
            capacidad_estimada *= 2

        return {
            'total_llaves': n,
            'operaciones_realizadas': self._ops_count,
            'tipo_acceso': '1 salto — O(1) amortizado',
            'complejidad_busqueda': 'O(1)',
            'complejidad_insercion': 'O(1)',
            'factor_carga': round(n / capacidad_estimada, 4) if capacidad_estimada > 0 else 0,
            'capacidad_interna_estimada': capacidad_estimada,
        }

    # ------------------------------------------------------------------
    #  REPRESENTACIÓN
    # ------------------------------------------------------------------
    def __len__(self) -> int:
        return len(self._tabla)

    def __repr__(self) -> str:
        return f"TablaHashVuelos(vuelos={len(self._tabla)}, ops={self._ops_count})"

