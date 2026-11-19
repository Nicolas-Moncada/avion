import sqlite3

con = sqlite3.connect('aerocore.db')

# Configuración de conexión (las mismas instrucciones que usa la aplicación)
con.execute('PRAGMA journal_mode = WAL;')
con.execute('PRAGMA synchronous = NORMAL;')
con.execute('PRAGMA busy_timeout = 30000;')
con.execute('PRAGMA foreign_keys = ON;')

print('--- Configuración ---')
for pragma in ['journal_mode', 'synchronous', 'busy_timeout', 'foreign_keys']:
    print(pragma, '=', con.execute(f'PRAGMA {pragma};').fetchone()[0])

print('\n--- Manifiesto AF1001 ---')
print('Filas:', con.execute("SELECT COUNT(*) FROM manifiesto WHERE vuelo_codigo = 'AF1001';").fetchone()[0])

print('\n--- Detalle de Pasajeros en AF1001 ---')
filas = con.execute(
    "SELECT pasajero_doc, pasajero_nombre, asiento, clase_cabina, tarifa_pagada_cop "
    "FROM manifiesto WHERE vuelo_codigo = 'AF1001' ORDER BY id ASC;"
).fetchall()
for f in filas:
    print(f)

con.close()
