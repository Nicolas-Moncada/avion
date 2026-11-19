import sqlite3

con = sqlite3.connect("aerocore.db")
cur = con.cursor()

# Actualizar imagen_url para todos los vuelos segun su IATA
vuelos = cur.execute("SELECT codigo, destino FROM vuelos").fetchall()
for cod, dest in vuelos:
    iata = dest[:3].strip().upper()
    img_url = f"/api/destinos/{iata}/imagen"
    cur.execute("UPDATE vuelos SET imagen_url = ? WHERE codigo = ?", (img_url, cod))

# Actualizar LHR con tarifa internacional realista y aeronave transatlántica
cur.execute("""
    UPDATE vuelos
    SET precio_base_cop = 2850000,
        tipo_aeronave = 'Boeing 787-8 Dreamliner',
        duracion_estimada = '10h 33m',
        categoria = 'internacional',
        tag_destacado = 'Transatlántico',
        imagen_url = '/api/destinos/LHR/imagen'
    WHERE codigo = 'AF9689' OR destino LIKE 'LHR%';
""")

# Actualizar SCL con tarifa internacional realista y aeronave adecuada
cur.execute("""
    UPDATE vuelos
    SET precio_base_cop = 1150000,
        tipo_aeronave = 'Boeing 787-8 Dreamliner',
        duracion_estimada = '05h 16m',
        categoria = 'internacional',
        tag_destacado = 'Directo',
        imagen_url = '/api/destinos/SCL/imagen'
    WHERE codigo = 'AF7854' OR destino LIKE 'SCL%';
""")

con.commit()
print("Vuelos en BD actualizados correctamente:")
for r in cur.execute("SELECT codigo, destino, tipo_aeronave, duracion_estimada, precio_base_cop, imagen_url FROM vuelos").fetchall():
    print(" ", r)
con.close()
