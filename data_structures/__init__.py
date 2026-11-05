"""
AERO-CORE FIDS — Módulo de Estructuras de Datos en Memoria
==========================================================
Exporta las 4 estructuras de datos obligatorias del proyecto:
  1. TablaHashVuelos      → Diccionario / Hash Map  (Módulo 1)
  2. ArbolAVLPasajeros    → Árbol AVL               (Módulo 2)
  3. ListaEnlazadaManifiesto → Lista Enlazada        (Módulo 3)
  4. ColaFIFO             → Cola FIFO                (Módulo 4)
"""

from .hash_map import TablaHashVuelos
from .avl_tree import ArbolAVLPasajeros, NodoAVL
from .linked_list import ListaEnlazadaManifiesto, NodoManifiesto
from .fifo_queue import ColaFIFO, NodoCola

