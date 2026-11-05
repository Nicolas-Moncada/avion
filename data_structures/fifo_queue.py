"""
=============================================================================
  ColaFIFO — Cola First-In, First-Out para Embarque y Standby (12h AM/PM)
=============================================================================
"""

from datetime import datetime

class NodoCola:
    __slots__ = ('pasajero_doc', 'pasajero_nombre', 'categoria',
                 'hora_ingreso', 'siguiente')

    def __init__(self, pasajero_doc: str, pasajero_nombre: str,
                 categoria: str = 'Estándar', hora_ingreso: str = None):
        self.pasajero_doc: str = pasajero_doc
        self.pasajero_nombre: str = pasajero_nombre
        self.categoria: str = categoria
        self.hora_ingreso: str = hora_ingreso or datetime.now().strftime('%I:%M:%S %p')
        self.siguiente: 'NodoCola | None' = None

class ColaFIFO:
    def __init__(self):
        self._frente: NodoCola | None = None
        self._final: NodoCola | None = None
        self._tamano: int = 0

    def encolar(self, pasajero_doc: str, pasajero_nombre: str,
                categoria: str = 'Estándar',
                hora_ingreso: str = None) -> tuple[NodoCola, int]:
        nuevo = NodoCola(pasajero_doc, pasajero_nombre, categoria, hora_ingreso)

        if self._final is None:
            self._frente = nuevo
            self._final = nuevo
        else:
            self._final.siguiente = nuevo
            self._final = nuevo

        self._tamano += 1
        return nuevo, self._tamano

    def desencolar(self) -> NodoCola | None:
        if self._frente is None:
            return None

        nodo_saliente = self._frente
        self._frente = self._frente.siguiente

        if self._frente is None:
            self._final = None

        nodo_saliente.siguiente = None
        self._tamano -= 1
        return nodo_saliente

    def ver_frente(self) -> NodoCola | None:
        return self._frente

    def esta_vacia(self) -> bool:
        return self._frente is None

    @property
    def tamano(self) -> int:
        return self._tamano

    def contiene(self, pasajero_doc: str) -> bool:
        actual = self._frente
        while actual:
            if actual.pasajero_doc == pasajero_doc:
                return True
            actual = actual.siguiente
        return False

    def eliminar(self, pasajero_doc: str) -> NodoCola | None:
        actual = self._frente
        anterior = None
        while actual:
            if actual.pasajero_doc == pasajero_doc:
                if anterior is None:
                    self._frente = actual.siguiente
                else:
                    anterior.siguiente = actual.siguiente
                if actual == self._final:
                    self._final = anterior
                actual.siguiente = None
                self._tamano -= 1
                return actual
            anterior = actual
            actual = actual.siguiente
        return None

    def obtener_todos(self) -> list[dict]:
        resultado = []
        actual = self._frente
        posicion = 1
        while actual is not None:
            resultado.append({
                'posicion': posicion,
                'pasajero_doc': actual.pasajero_doc,
                'pasajero_nombre': actual.pasajero_nombre,
                'categoria': actual.categoria,
                'hora_ingreso': actual.hora_ingreso,
            })
            actual = actual.siguiente
            posicion += 1
        return resultado

    def representacion(self) -> str:
        if self.esta_vacia():
            return "FRENTE -> (vacía) -> FINAL"

        partes = ["FRENTE"]
        actual = self._frente
        while actual:
            partes.append(f"[{actual.pasajero_doc}]")
            actual = actual.siguiente
        partes.append("FINAL")
        return " -> ".join(partes)

    def __len__(self) -> int:
        return self._tamano

    def __repr__(self) -> str:
        return f"ColaFIFO(tamano={self._tamano})"
