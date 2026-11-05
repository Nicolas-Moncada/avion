"""
Pruebas unitarias de las 4 estructuras de datos y endpoints
"""
import unittest
from data_structures.hash_map import TablaHashVuelos
from data_structures.avl_tree import ArbolAVLPasajeros
from data_structures.linked_list import ListaEnlazadaManifiesto
from data_structures.fifo_queue import ColaFIFO

class TestDataStructures(unittest.TestCase):
    def test_hash_map(self):
        th = TablaHashVuelos()
        self.assertTrue(th.insertar("AV100", {"destino": "BOG", "capacidad_maxima": 100, "estado": "Programado"}))
        self.assertFalse(th.insertar("AV100", {"destino": "BOG"})) # Duplicado
        v, t = th.buscar("AV100")
        self.assertIsNotNone(v)
        self.assertEqual(v["destino"], "BOG")
        self.assertTrue(t >= 0)
        self.assertTrue(th.actualizar_estado("AV100", "Embarcando"))
        self.assertEqual(th.buscar("AV100")[0]["estado"], "Embarcando")
        self.assertTrue(th.contiene("AV100"))
        self.assertFalse(th.contiene("NOEXISTE"))

    def test_avl_tree(self):
        avl = ArbolAVLPasajeros()
        docs = ["50", "20", "80", "10", "30", "70", "90", "25"]
        for d in docs:
            self.assertTrue(avl.insertar(d, f"Persona {d}", "Colombia", "Estándar"))
        
        self.assertEqual(avl.total_nodos, len(docs))
        
        # Búsqueda
        nodo, comps, total = avl.buscar("25")
        self.assertIsNotNone(nodo)
        self.assertEqual(nodo.documento, "25")
        self.assertTrue(comps <= avl.altura_arbol + 1)
        
        # In-order debe estar ordenado
        inorder = avl.recorrido_inorden()
        inorder_docs = [p["documento"] for p in inorder]
        self.assertEqual(inorder_docs, sorted(docs))

    def test_linked_list(self):
        ll = ListaEnlazadaManifiesto()
        ll.insertar_al_final("101", "Ana", "1A")
        ll.insertar_al_final("102", "Beto", "1B")
        ll.insertar_al_final("103", "Carlos", "2A")
        self.assertEqual(ll.tamano, 3)
        self.assertIn("Doc: 101", ll.representacion_cadena())

        eliminado = ll.eliminar("102")
        self.assertIsNotNone(eliminado)
        self.assertEqual(eliminado.pasajero_nombre, "Beto")
        self.assertEqual(ll.tamano, 2)
        self.assertIsNone(ll.buscar("102"))

    def test_fifo_queue(self):
        q = ColaFIFO()
        q.encolar("DOC1", "Pasajero 1")
        q.encolar("DOC2", "Pasajero 2")
        self.assertEqual(q.tamano, 2)
        self.assertEqual(q.ver_frente().pasajero_doc, "DOC1")
        
        primero = q.desencolar()
        self.assertEqual(primero.pasajero_doc, "DOC1")
        self.assertEqual(q.tamano, 1)
        
        segundo = q.desencolar()
        self.assertEqual(segundo.pasajero_doc, "DOC2")
        self.assertTrue(q.esta_vacia())

if __name__ == '__main__':
    unittest.main()

