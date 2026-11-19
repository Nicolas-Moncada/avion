import sqlite3
import requests

def main():
    conn = sqlite3.connect('aerocore.db')
    c = conn.cursor()

    c.execute("PRAGMA table_info(destino_imagenes)")
    cols = [f"{r[1]} ({r[2]})" for r in c.fetchall()]
    print('Columnas en destino_imagenes:', cols)

    c.execute("SELECT codigo_iata, ciudad, LENGTH(imagen_blob), mime_type, updated_at FROM destino_imagenes")
    img_rows = c.fetchall()
    print(f'\nTotal en destino_imagenes ({len(img_rows)}):')
    for row in sorted(img_rows):
        print(f"  {row[0]}: {row[1]} | {row[2]} bytes | {row[3]} | {row[4]}")

    c.execute("SELECT codigo, origen, destino, imagen_url FROM vuelos")
    vuelos = c.fetchall()
    print(f'\nVuelos en BD ({len(vuelos)}):')
    for v in vuelos:
        print(f"  {v[0]}: {v[1]} -> {v[2]} | imagen_url={v[3]}")

    print('\nProbando endpoints HTTP...')
    for row in sorted(img_rows):
        iata = row[0]
        url = f'http://127.0.0.1:5000/api/destinos/{iata}/imagen'
        try:
            r = requests.get(url, timeout=3)
            print(f"  {iata}: status={r.status_code}, length={len(r.content)}, type={r.headers.get('content-type')}")
        except Exception as e:
            print(f"  {iata}: ERROR {e}")

if __name__ == '__main__':
    main()
