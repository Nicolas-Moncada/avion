"""
=============================================================================
  ListaEnlazadaManifiesto — Lista Enlazada Dinámica para Check-in
=============================================================================
"""

from datetime import datetime

class NodoManifiesto:
    __slots__ = ('pasajero_doc', 'pasajero_nombre', 'asiento',
                 'hora_checkin', 'categoria', 'clase_cabina', 'tarifa_pagada', 'siguiente')

    def __init__(self, pasajero_doc: str, pasajero_nombre: str,
                 asiento: str, hora_checkin: str = None,
                 categoria: str = 'Estándar', clase_cabina: str = 'Estándar',
                 tarifa_pagada: float = 500.0):
        self.pasajero_doc: str = pasajero_doc
        self.pasajero_nombre: str = pasajero_nombre
        self.asiento: str = asiento
        self.hora_checkin: str = hora_checkin or datetime.now().strftime('%I:%M:%S %p')
        self.categoria: str = categoria
        self.clase_cabina: str = clase_cabina
        self.tarifa_pagada: float = tarifa_pagada
        self.siguiente: 'NodoManifiesto | None' = None

class ListaEnlazadaManifiesto:
    def __init__(self):
        self._cabeza: NodoManifiesto | None = None
        self._cola: NodoManifiesto | None = None
        self._tamano: int = 0

    def insertar_al_final(self, pasajero_doc: str, pasajero_nombre: str,
                          asiento: str, hora_checkin: str = None,
                          categoria: str = 'Estándar', clase_cabina: str = 'Estándar',
                          tarifa_pagada: float = 500.0) -> NodoManifiesto:
        nuevo_nodo = NodoManifiesto(
            pasajero_doc, pasajero_nombre, asiento, hora_checkin, categoria, clase_cabina, tarifa_pagada
        )

        if self._cabeza is None:
            self._cabeza = nuevo_nodo
            self._cola = nuevo_nodo
        else:
            self._cola.siguiente = nuevo_nodo
            self._cola = nuevo_nodo

        self._tamano += 1
        return nuevo_nodo

    def eliminar(self, pasajero_doc: str) -> NodoManifiesto | None:
        actual = self._cabeza
        anterior = None

        while actual is not None:
            if actual.pasajero_doc == pasajero_doc:
                if anterior is None:
                    self._cabeza = actual.siguiente
                else:
                    anterior.siguiente = actual.siguiente

                if actual == self._cola:
                    self._cola = anterior

                actual.siguiente = None
                self._tamano -= 1
                return actual

            anterior = actual
            actual = actual.siguiente

        return None

    def buscar(self, pasajero_doc: str) -> NodoManifiesto | None:
        actual = self._cabeza
        while actual is not None:
            if actual.pasajero_doc == pasajero_doc:
                return actual
            actual = actual.siguiente
        return None

    def buscar_por_asiento(self, asiento: str) -> NodoManifiesto | None:
        actual = self._cabeza
        while actual is not None:
            if actual.asiento == asiento:
                return actual
            actual = actual.siguiente
        return None

    def obtener_todos(self) -> list[dict]:
        resultado = []
        actual = self._cabeza
        posicion = 0
        while actual is not None:
            resultado.append({
                'posicion': posicion,
                'pasajero_doc': actual.pasajero_doc,
                'pasajero_nombre': actual.pasajero_nombre,
                'asiento': actual.asiento,
                'hora_checkin': actual.hora_checkin,
                'categoria': actual.categoria,
                'clase_cabina': actual.clase_cabina,
                'tarifa_pagada': actual.tarifa_pagada
            })
            actual = actual.siguiente
            posicion += 1
        return resultado

    def representacion_cadena(self) -> str:
        if self._cabeza is None:
            return "[HEAD] -> NULL"

        partes = ["[HEAD]"]
        actual = self._cabeza
        while actual is not None:
            partes.append(f"[{actual.asiento} | Doc: {actual.pasajero_doc}]")
            actual = actual.siguiente
        partes.append("NULL")

        return " -> ".join(partes)

    @property
    def tamano(self) -> int:
        return self._tamano

    def esta_vacia(self) -> bool:
        return self._cabeza is None

    @property
    def cabeza(self) -> NodoManifiesto | None:
        return self._cabeza

    def __len__(self) -> int:
        return self._tamano

    def __repr__(self) -> str:
        return f"ListaEnlazadaManifiesto(tamano={self._tamano})"
