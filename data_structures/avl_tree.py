"""
=============================================================================
  ArbolAVLPasajeros — Árbol Binario de Búsqueda Autobalanceado (AVL)
=============================================================================

MÓDULO 2: Gestión de Pasajeros (Directorio Global)

JUSTIFICACIÓN TÉCNICA:
  Se utiliza un Árbol AVL porque la operación crítica de este módulo es
  buscar pasajeros por su documento de identidad de forma eficiente.
  A diferencia de una lista secuencial que requiere O(n) comparaciones
  para encontrar un registro, el Árbol AVL garantiza O(log n) al descartar
  la mitad de los nodos en cada nivel del árbol gracias a la propiedad de
  orden del BST y al balanceo automático por rotaciones.

  Para un directorio de 1000 pasajeros:
    - Lista secuencial: hasta 1000 comparaciones (O(n))
    - Árbol AVL: máximo ~10 comparaciones (O(log₂ 1000) ≈ 10)

  El autobalanceo garantiza que el árbol nunca degenere en una lista
  enlazada (caso peor de un BST sin balanceo), manteniendo la altura
  siempre en O(log n).

COMPLEJIDAD TEMPORAL (Big-O):
  ┌──────────────────────┬───────────────┬───────────────────────────────────┐
  │ Operación            │ Complejidad   │ Explicación                       │
  ├──────────────────────┼───────────────┼───────────────────────────────────┤
  │ insertar(doc)        │ O(log n)      │ Descenso + rotaciones O(1) c/u    │
  │ buscar(doc)          │ O(log n)      │ Descenso descartando mitades      │
  │ eliminar(doc)        │ O(log n)      │ Búsqueda + rebalanceo             │
  │ recorrido_inorden()  │ O(n)          │ Visita todos los nodos            │
  │ obtener_altura()     │ O(1)          │ Valor almacenado en cada nodo     │
  │ obtener_balance()    │ O(1)          │ Diferencia de alturas hijos       │
  └──────────────────────┴───────────────┴───────────────────────────────────┘

ROTACIONES IMPLEMENTADAS:
  1. Rotación Simple Izquierda  (caso Right-Right)
  2. Rotación Simple Derecha    (caso Left-Left)
  3. Rotación Doble Izquierda-Derecha (caso Left-Right)
  4. Rotación Doble Derecha-Izquierda (caso Right-Left)
=============================================================================
"""


class NodoAVL:
    """
    Nodo del Árbol AVL que almacena los datos de un pasajero.

    Atributos:
      - documento (str): Clave de ordenamiento (número de documento).
      - nombre (str): Nombre completo del pasajero.
      - nacionalidad (str): Nacionalidad del pasajero.
      - categoria_viajero (str): 'Estándar' o 'VIP'.
      - vuelo_asignado (str|None): Código de vuelo si tiene check-in.
      - izquierda (NodoAVL|None): Subárbol izquierdo (docs menores).
      - derecha (NodoAVL|None): Subárbol derecho (docs mayores).
      - altura (int): Altura del subárbol con raíz en este nodo.
    """
    __slots__ = ('documento', 'nombre', 'nacionalidad', 'categoria_viajero',
                 'vuelo_asignado', 'izquierda', 'derecha', 'altura')

    def __init__(self, documento: str, nombre: str, nacionalidad: str = '',
                 categoria_viajero: str = 'Estándar'):
        self.documento: str = documento
        self.nombre: str = nombre
        self.nacionalidad: str = nacionalidad
        self.categoria_viajero: str = categoria_viajero
        self.vuelo_asignado: str | None = None
        self.izquierda: 'NodoAVL | None' = None
        self.derecha: 'NodoAVL | None' = None
        # Altura inicial = 1 (nodo hoja). Se usa para calcular el factor
        # de balance = altura(izq) - altura(der). Si |balance| > 1, rotar.
        self.altura: int = 1


class ArbolAVLPasajeros:
    """
    Árbol Binario de Búsqueda Autobalanceado (AVL) para el directorio
    global de pasajeros. Clave de ordenamiento: documento de identidad.

    El árbol se mantiene balanceado tras cada inserción y eliminación
    mediante rotaciones simples y dobles, garantizando que la diferencia
    de altura entre subárboles izquierdo y derecho de cualquier nodo
    sea como máximo 1 (|factor_balance| ≤ 1).
    """

    def __init__(self):
        self._raiz: NodoAVL | None = None
        self._total_nodos: int = 0

    # ==================================================================
    #  UTILIDADES INTERNAS
    # ==================================================================

    def _altura(self, nodo: NodoAVL | None) -> int:
        """Retorna la altura de un nodo (0 si es None). O(1)."""
        return nodo.altura if nodo else 0

    def _factor_balance(self, nodo: NodoAVL | None) -> int:
        """
        Calcula el factor de balance: altura(izq) - altura(der).
        Si > 1: desbalance hacia la izquierda.
        Si < -1: desbalance hacia la derecha.
        O(1) — lectura directa de alturas almacenadas.
        """
        if not nodo:
            return 0
        return self._altura(nodo.izquierda) - self._altura(nodo.derecha)

    def _actualizar_altura(self, nodo: NodoAVL) -> None:
        """Recalcula la altura del nodo basándose en sus hijos. O(1)."""
        nodo.altura = 1 + max(self._altura(nodo.izquierda),
                              self._altura(nodo.derecha))

    # ==================================================================
    #  ROTACIONES — Cada rotación es O(1) (reasignación de punteros)
    # ==================================================================

    def _rotacion_derecha(self, z: NodoAVL) -> NodoAVL:
        """
        ROTACIÓN SIMPLE DERECHA (caso Left-Left):

        Antes:          Después:
            z               y
           / \\             / \\
          y   T4          x   z
         / \\                / \\
        x   T3            T3  T4

        Se ejecuta cuando el factor de balance de z es > 1 y el factor
        de balance de z.izquierda es ≥ 0. O(1).
        """
        y = z.izquierda          # y es el hijo izquierdo de z
        T3 = y.derecha           # T3 es el subárbol derecho de y

        # Realizar la rotación
        y.derecha = z            # z baja a la derecha de y
        z.izquierda = T3         # T3 pasa a ser hijo izquierdo de z

        # Actualizar alturas (z primero, ya que ahora es hijo de y)
        self._actualizar_altura(z)
        self._actualizar_altura(y)

        return y  # y es la nueva raíz del subárbol

    def _rotacion_izquierda(self, z: NodoAVL) -> NodoAVL:
        """
        ROTACIÓN SIMPLE IZQUIERDA (caso Right-Right):

        Antes:          Después:
          z                 y
         / \\              / \\
        T1   y            z   x
            / \\         / \\
           T2  x        T1  T2

        Se ejecuta cuando el factor de balance de z es < -1 y el factor
        de balance de z.derecha es ≤ 0. O(1).
        """
        y = z.derecha            # y es el hijo derecho de z
        T2 = y.izquierda        # T2 es el subárbol izquierdo de y

        # Realizar la rotación
        y.izquierda = z          # z baja a la izquierda de y
        z.derecha = T2           # T2 pasa a ser hijo derecho de z

        # Actualizar alturas
        self._actualizar_altura(z)
        self._actualizar_altura(y)

        return y  # y es la nueva raíz del subárbol

    # ==================================================================
    #  INSERCIÓN — O(log n)
    # ==================================================================

    def insertar(self, documento: str, nombre: str, nacionalidad: str = '',
                 categoria_viajero: str = 'Estándar') -> bool:
        """
        Inserta un nuevo pasajero en el árbol AVL.

        Complejidad: O(log n)
          - Descenso por el árbol para encontrar la posición: O(log n)
          - Rotaciones de rebalanceo (máximo 2 por inserción): O(1) c/u
          - Total: O(log n)

        Retorna True si se insertó, False si el documento ya existía.
        """
        existia = [False]
        self._raiz = self._insertar_recursivo(
            self._raiz, documento, nombre, nacionalidad, categoria_viajero, existia
        )
        if not existia[0]:
            self._total_nodos += 1
            return True
        return False

    def _insertar_recursivo(self, nodo: NodoAVL | None, documento: str,
                            nombre: str, nacionalidad: str,
                            categoria: str, existia: list) -> NodoAVL:
        """
        Inserción recursiva estándar de BST + rebalanceo AVL.

        En cada nivel del árbol se compara el documento buscado con el del
        nodo actual. Si es menor, se desciende a la izquierda (descartando
        toda la mitad derecha); si es mayor, a la derecha (descartando la
        mitad izquierda). Esto es lo que garantiza O(log n).
        """
        # --- Caso base: posición vacía encontrada, crear nodo ---
        if nodo is None:
            return NodoAVL(documento, nombre, nacionalidad, categoria)

        # --- Comparación para descender por el árbol ---
        if documento < nodo.documento:
            # Documento menor → buscar en subárbol IZQUIERDO
            # (se descartan todos los nodos del subárbol derecho)
            nodo.izquierda = self._insertar_recursivo(
                nodo.izquierda, documento, nombre, nacionalidad, categoria, existia
            )
        elif documento > nodo.documento:
            # Documento mayor → buscar en subárbol DERECHO
            # (se descartan todos los nodos del subárbol izquierdo)
            nodo.derecha = self._insertar_recursivo(
                nodo.derecha, documento, nombre, nacionalidad, categoria, existia
            )
        else:
            # Documento igual → ya existe, no insertar duplicado
            existia[0] = True
            return nodo

        # --- Actualizar altura del nodo actual ---
        self._actualizar_altura(nodo)

        # --- Calcular factor de balance para detectar desbalanceo ---
        balance = self._factor_balance(nodo)

        # --- CASO LEFT-LEFT: balance > 1 y doc insertado en izq de izq ---
        # Se resuelve con una ROTACIÓN SIMPLE DERECHA
        if balance > 1 and documento < nodo.izquierda.documento:
            return self._rotacion_derecha(nodo)

        # --- CASO RIGHT-RIGHT: balance < -1 y doc insertado en der de der ---
        # Se resuelve con una ROTACIÓN SIMPLE IZQUIERDA
        if balance < -1 and documento > nodo.derecha.documento:
            return self._rotacion_izquierda(nodo)

        # --- CASO LEFT-RIGHT: balance > 1 y doc insertado en der de izq ---
        # Se resuelve con ROTACIÓN DOBLE IZQUIERDA-DERECHA:
        #   1. Rotación izquierda sobre hijo izquierdo
        #   2. Rotación derecha sobre nodo actual
        if balance > 1 and documento > nodo.izquierda.documento:
            nodo.izquierda = self._rotacion_izquierda(nodo.izquierda)
            return self._rotacion_derecha(nodo)

        # --- CASO RIGHT-LEFT: balance < -1 y doc insertado en izq de der ---
        # Se resuelve con ROTACIÓN DOBLE DERECHA-IZQUIERDA:
        #   1. Rotación derecha sobre hijo derecho
        #   2. Rotación izquierda sobre nodo actual
        if balance < -1 and documento < nodo.derecha.documento:
            nodo.derecha = self._rotacion_derecha(nodo.derecha)
            return self._rotacion_izquierda(nodo)

        return nodo

    # ==================================================================
    #  BÚSQUEDA — O(log n) con rastreo de comparaciones
    # ==================================================================

    def buscar(self, documento: str) -> tuple[NodoAVL | None, int, int]:
        """
        Busca un pasajero por documento en el Árbol AVL.

        Retorna una tupla:
          (nodo_encontrado | None, comparaciones_realizadas, total_nodos)

        El campo 'comparaciones_realizadas' demuestra que la búsqueda
        descarta mitades en cada nivel, logrando O(log n).
        Para comparar: en una lista secuencial, se necesitarían hasta
        'total_nodos' comparaciones (O(n)).

        Complejidad: O(log n) — en cada comparación se descarta
        completamente uno de los dos subárboles (aprox. la mitad de
        los nodos restantes), reduciendo el espacio de búsqueda
        exponencialmente.
        """
        nodo = self._raiz
        comparaciones = 0

        while nodo is not None:
            comparaciones += 1  # Cada visita a un nodo = 1 comparación

            if documento == nodo.documento:
                # ¡Encontrado! Se completó en 'comparaciones' pasos
                return nodo, comparaciones, self._total_nodos
            elif documento < nodo.documento:
                # Documento buscado es MENOR → descartar todo el subárbol
                # derecho y descender a la izquierda
                nodo = nodo.izquierda
            else:
                # Documento buscado es MAYOR → descartar todo el subárbol
                # izquierdo y descender a la derecha
                nodo = nodo.derecha

        # No encontrado después de 'comparaciones' comparaciones
        return None, comparaciones, self._total_nodos

    # ==================================================================
    #  ELIMINACIÓN — O(log n)
    # ==================================================================

    def eliminar(self, documento: str) -> bool:
        """
        Elimina un pasajero del árbol AVL por su documento.

        Complejidad: O(log n) — descenso + posible búsqueda de sucesor
        inorden + rebalanceo con rotaciones O(1).
        """
        if self.buscar(documento)[0] is None:
            return False
        self._raiz = self._eliminar_recursivo(self._raiz, documento)
        self._total_nodos -= 1
        return True

    def _eliminar_recursivo(self, nodo: NodoAVL | None,
                            documento: str) -> NodoAVL | None:
        """Eliminación recursiva estándar de BST + rebalanceo AVL."""
        if nodo is None:
            return None

        # --- Fase 1: Búsqueda del nodo a eliminar (BST estándar) ---
        if documento < nodo.documento:
            nodo.izquierda = self._eliminar_recursivo(nodo.izquierda, documento)
        elif documento > nodo.documento:
            nodo.derecha = self._eliminar_recursivo(nodo.derecha, documento)
        else:
            # Nodo encontrado — 3 casos:
            # Caso 1: Nodo hoja o con un solo hijo
            if nodo.izquierda is None:
                return nodo.derecha
            elif nodo.derecha is None:
                return nodo.izquierda

            # Caso 2: Nodo con dos hijos — reemplazar con el sucesor
            # inorden (menor del subárbol derecho)
            sucesor = self._minimo(nodo.derecha)
            nodo.documento = sucesor.documento
            nodo.nombre = sucesor.nombre
            nodo.nacionalidad = sucesor.nacionalidad
            nodo.categoria_viajero = sucesor.categoria_viajero
            nodo.vuelo_asignado = sucesor.vuelo_asignado
            nodo.derecha = self._eliminar_recursivo(
                nodo.derecha, sucesor.documento
            )

        # --- Fase 2: Rebalanceo AVL ---
        if nodo is None:
            return None

        self._actualizar_altura(nodo)
        balance = self._factor_balance(nodo)

        # Left-Left
        if balance > 1 and self._factor_balance(nodo.izquierda) >= 0:
            return self._rotacion_derecha(nodo)

        # Left-Right
        if balance > 1 and self._factor_balance(nodo.izquierda) < 0:
            nodo.izquierda = self._rotacion_izquierda(nodo.izquierda)
            return self._rotacion_derecha(nodo)

        # Right-Right
        if balance < -1 and self._factor_balance(nodo.derecha) <= 0:
            return self._rotacion_izquierda(nodo)

        # Right-Left
        if balance < -1 and self._factor_balance(nodo.derecha) > 0:
            nodo.derecha = self._rotacion_derecha(nodo.derecha)
            return self._rotacion_izquierda(nodo)

        return nodo

    def _minimo(self, nodo: NodoAVL) -> NodoAVL:
        """Encuentra el nodo con el documento mínimo en un subárbol. O(log n)."""
        actual = nodo
        while actual.izquierda is not None:
            actual = actual.izquierda
        return actual

    # ==================================================================
    #  RECORRIDO INORDEN — O(n)
    # ==================================================================

    def recorrido_inorden(self) -> list[dict]:
        """
        Recorre el árbol en orden (izquierda → raíz → derecha),
        produciendo los pasajeros ordenados ascendentemente por documento.

        Complejidad: O(n) — visita cada uno de los n nodos exactamente
        una vez.
        """
        resultado = []
        self._inorden_recursivo(self._raiz, resultado)
        return resultado

    def _inorden_recursivo(self, nodo: NodoAVL | None,
                           resultado: list) -> None:
        """Recorrido inorden recursivo."""
        if nodo is None:
            return
        # 1. Recorrer subárbol izquierdo (documentos menores)
        self._inorden_recursivo(nodo.izquierda, resultado)
        # 2. Visitar nodo actual
        resultado.append({
            'documento': nodo.documento,
            'nombre': nodo.nombre,
            'nacionalidad': nodo.nacionalidad,
            'categoria_viajero': nodo.categoria_viajero,
            'vuelo_asignado': nodo.vuelo_asignado,
        })
        # 3. Recorrer subárbol derecho (documentos mayores)
        self._inorden_recursivo(nodo.derecha, resultado)

    # ==================================================================
    #  ACTUALIZACIÓN DE NODO — O(log n)
    # ==================================================================

    def actualizar_vuelo(self, documento: str, codigo_vuelo: str | None) -> bool:
        """
        Actualiza el campo vuelo_asignado de un pasajero.
        Complejidad: O(log n) — búsqueda en el árbol.
        """
        nodo, _, _ = self.buscar(documento)
        if nodo:
            nodo.vuelo_asignado = codigo_vuelo
            return True
        return False

    # ==================================================================
    #  MÉTRICAS
    # ==================================================================

    @property
    def total_nodos(self) -> int:
        return self._total_nodos

    @property
    def altura_arbol(self) -> int:
        return self._altura(self._raiz)

    def __repr__(self) -> str:
        return (f"ArbolAVLPasajeros(nodos={self._total_nodos}, "
                f"altura={self.altura_arbol})")

