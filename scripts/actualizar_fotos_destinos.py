"""
Script para descargar, normalizar y verificar las fotografías HD de destinos.
Procesa cada imagen a 1280x800 en formato WebP (calidad 90, method 6),
calcula su hash SHA-256 asegurando cero duplicados y actualiza aerocore.db.
"""
import io
import time
import hashlib
import sqlite3
import urllib.request
from PIL import Image, ImageOps

DESTINOS = [
    {
        "iata": "BOG",
        "ciudad": "Bogotá",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/29/View_of_Bogota_from_the_church_of_Monserrate.jpg"
    },
    {
        "iata": "MDE",
        "ciudad": "Medellín",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/93/El_poblado%2C_Medell%C3%ADn.jpg"
    },
    {
        "iata": "CLO",
        "ciudad": "Cali",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/3/38/Iglesia_La_Ermita_Cali.JPG"
    },
    {
        "iata": "CTG",
        "ciudad": "Cartagena",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a3/Torre_del_Reloj_-_Cartagena_de_Indias.jpg"
    },
    {
        "iata": "MTR",
        "ciudad": "Montería",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/27/RondaDelSinuIluminadaPorElec.JPG"
    },
    {
        "iata": "BAQ",
        "ciudad": "Barranquilla",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/aa/PuentePumarejoBAQ2020.jpg"
    },
    {
        "iata": "SMR",
        "ciudad": "Santa Marta",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/b/b2/Cabo_de_San_Juan_-_Parque_Nacional_Natural_El_Tayrona.jpg"
    },
    {
        "iata": "MIA",
        "ciudad": "Miami",
        "pais": "Estados Unidos",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/9e/Miami_waterfront_skyline_%28Unsplash%29.jpg"
    },
    {
        "iata": "JFK",
        "ciudad": "Nueva York",
        "pais": "Estados Unidos",
        "url": "https://upload.wikimedia.org/wikipedia/commons/c/cf/Brooklyn_Bridge%2C_New_York_City%2C_New_York%2C_at_sunset_-_20170625.jpg"
    },
    {
        "iata": "MEX",
        "ciudad": "Ciudad de México",
        "pais": "México",
        "url": "https://upload.wikimedia.org/wikipedia/commons/7/76/Atardecer_En_Bellas_Artes_Horizontal_%28128312025%29.jpeg"
    },
    {
        "iata": "MAD",
        "ciudad": "Madrid",
        "pais": "España",
        "url": "https://upload.wikimedia.org/wikipedia/commons/5/5e/Madrid_Gran_Via_Metropolis_%2828895522813%29.jpg"
    },
    {
        "iata": "LHR",
        "ciudad": "Londres",
        "pais": "Reino Unido",
        "url": "https://upload.wikimedia.org/wikipedia/commons/b/b2/London_MMB_%C2%BB051_River_Thames.jpg"
    },
    {
        "iata": "SCL",
        "ciudad": "Santiago",
        "pais": "Chile",
        "url": "https://upload.wikimedia.org/wikipedia/commons/5/5c/Santiago_de_Chile%2C_Desde_Cerro_San_Crist%C3%B3bal_%28cropped_panorama%29.jpg"
    },
    {
        "iata": "PEI",
        "ciudad": "Pereira",
        "pais": "Colombia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/7/71/El_Viaducto%2C_Pereira%2C_Colombia.jpg"
    }
]

def descargar_y_procesar(item):
    headers = {"User-Agent": "AeroFlowMediaBot/2.0 (info@aeroflow.com; academic travel app)"}
    print(f"Descargando {item['iata']} ({item['ciudad']}) desde {item['url']}...")
    req = urllib.request.Request(item["url"], headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw_bytes = resp.read()

    # Validar con Pillow
    orig_img = Image.open(io.BytesIO(raw_bytes))
    orig_img.verify()
    orig_w, orig_h = orig_img.size
    print(f"  -> Original: {orig_w}x{orig_h}, {len(raw_bytes)} bytes")
    assert orig_w >= 1000, f"Ancho insuficiente para {item['iata']}: {orig_w}px"
    assert orig_w > orig_h, f"La imagen debe ser horizontal para {item['iata']}: {orig_w}x{orig_h}"

    # Reabrir para procesamiento (tras verify es necesario reabrir)
    img = Image.open(io.BytesIO(raw_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")

    # Recorte inteligente al centro 16:10 (1280x800)
    cropped = ImageOps.fit(img, (1280, 800), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))

    out_buf = io.BytesIO()
    cropped.save(out_buf, format="WEBP", quality=90, method=6)
    webp_data = out_buf.getvalue()

    sha256_hash = hashlib.sha256(webp_data).hexdigest()
    print(f"  -> Procesado WebP: 1280x800, {len(webp_data)/1024:.1f} KB, SHA-256: {sha256_hash[:16]}")
    return webp_data, sha256_hash

def main():
    con = sqlite3.connect("aerocore.db")
    cur = con.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS destino_imagenes (
            codigo_iata TEXT PRIMARY KEY,
            ciudad TEXT NOT NULL,
            pais TEXT,
            imagen_blob BLOB,
            mime_type TEXT DEFAULT 'image/jpeg',
            updated_at TEXT
        );
    """)

    procesados = []
    hashes = set()

    for item in DESTINOS:
        webp_bytes, h = descargar_y_procesar(item)
        assert h not in hashes, f"FATAL: Hash repetido para {item['iata']}! {h}"
        hashes.add(h)
        procesados.append({
            "iata": item["iata"],
            "ciudad": item["ciudad"],
            "pais": item["pais"],
            "bytes": webp_bytes,
            "hash": h,
            "size_kb": len(webp_bytes) / 1024
        })

    # Assert estricto de cero duplicados
    assert len(hashes) == len(DESTINOS), f"Se detectaron duplicados: {len(hashes)} vs {len(DESTINOS)}"
    print("\n[OK] Validación SHA-256 superada: 0 imágenes duplicadas.")

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for p in procesados:
        cur.execute("""
            INSERT INTO destino_imagenes (codigo_iata, ciudad, pais, imagen_blob, mime_type, updated_at)
            VALUES (?, ?, ?, ?, 'image/webp', ?)
            ON CONFLICT(codigo_iata) DO UPDATE SET
                ciudad = excluded.ciudad,
                pais = excluded.pais,
                imagen_blob = excluded.imagen_blob,
                mime_type = excluded.mime_type,
                updated_at = excluded.updated_at;
        """, (p["iata"], p["ciudad"], p["pais"], p["bytes"], now_iso))

    con.commit()
    con.close()
    print(f"[OK] Base de datos actualizada con los 14 destinos a las {now_iso}.")

if __name__ == "__main__":
    main()
