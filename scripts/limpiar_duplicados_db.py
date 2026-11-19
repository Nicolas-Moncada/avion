import sqlite3

def limpiar_bd():
    conn = sqlite3.connect("aerocore.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Encontrar usuarios de prueba sintéticos
    cursor.execute("""
        SELECT id, nombre, email, documento FROM usuarios
        WHERE email LIKE 'juan.valdez.%@aeroflow.com'
           OR email LIKE '%@test.com'
           OR email LIKE 'test%@%'
    """)
    usuarios_borrar = [dict(r) for r in cursor.fetchall()]
    print(f"Usuarios de prueba a eliminar ({len(usuarios_borrar)}):")
    for u in usuarios_borrar:
        print(f"  - {u['id']}: {u['nombre']} ({u['email']})")

    # 2. Encontrar reservas de prueba asociadas a estos usuarios o a Juan Valdez
    cursor.execute("""
        SELECT id, vuelo_codigo, pasajero_doc, pasajero_nombre, codigo_pnr, asiento FROM manifiesto
        WHERE pasajero_nombre LIKE '%Valdez%'
           OR pasajero_doc LIKE '109%'
    """)
    manifiesto_borrar = [dict(r) for r in cursor.fetchall()]
    print(f"\nReservas huérfanas en manifiesto a eliminar ({len(manifiesto_borrar)}):")
    for m in manifiesto_borrar:
        print(f"  - ID {m['id']}: {m['pasajero_nombre']} ({m['codigo_pnr']} - Silla {m['asiento']})")

    # 3. Eliminar reservas en manifiesto, pasajeros_recientes_pagos y ordenes
    cursor.execute("""
        DELETE FROM manifiesto
        WHERE pasajero_nombre LIKE '%Valdez%'
           OR pasajero_doc LIKE '109%'
    """)
    cursor.execute("""
        DELETE FROM pasajeros_recientes_pagos
        WHERE nombre_completo LIKE '%Valdez%'
           OR documento LIKE '109%'
    """)
    cursor.execute("""
        DELETE FROM pasajeros
        WHERE nombre LIKE '%Valdez%'
           OR documento LIKE '109%'
    """)
    cursor.execute("""
        DELETE FROM ordenes
        WHERE nombre_pasajero LIKE '%Valdez%'
           OR documento_pasajero LIKE '109%'
    """)

    # 4. Eliminar usuarios sintéticos
    cursor.execute("""
        DELETE FROM usuarios
        WHERE email LIKE 'juan.valdez.%@aeroflow.com'
           OR email LIKE '%@test.com'
           OR email LIKE 'test%@%'
    """)

    conn.commit()

    # 5. Listar usuarios y reservas restantes
    cursor.execute("SELECT id, nombre, email, documento, rol FROM usuarios ORDER BY creado_en DESC")
    restantes = [dict(r) for r in cursor.fetchall()]
    print(f"\nUsuarios oficiales restantes ({len(restantes)}):")
    for u in restantes:
        print(f"  - {u['id']} | {u['nombre']} | {u['email']} | Doc: {u['documento']} | Rol: {u['rol']}")

    cursor.execute("SELECT COUNT(*) FROM manifiesto")
    total_manifiesto = cursor.fetchone()[0]
    print(f"\nTotal reservas reales en manifiesto: {total_manifiesto}")

    conn.close()

if __name__ == "__main__":
    limpiar_bd()
