"""
Generador y cargador instantáneo de fotografías HD 16:10 para `destino_imagenes`
"""
import io
import os
import sys
import time
import sqlite3
from PIL import Image, ImageOps, ImageDraw, ImageFilter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "aerocore.db")

DESTINOS_DATA = [
    {
        "iata": "BOG",
        "ciudad": "Bogotá",
        "pais": "Colombia",
        "bg_colors": ((15, 23, 42), (30, 58, 138), (14, 165, 233)),
        "local_img": None
    },
    {
        "iata": "MDE",
        "ciudad": "Medellín",
        "pais": "Colombia",
        "bg_colors": ((6, 78, 59), (16, 185, 129), (5, 150, 105)),
        "local_img": None
    },
    {
        "iata": "CLO",
        "ciudad": "Cali",
        "pais": "Colombia",
        "bg_colors": ((136, 19, 55), (225, 29, 72), (244, 63, 94)),
        "local_img": None
    },
    {
        "iata": "CTG",
        "ciudad": "Cartagena",
        "pais": "Colombia",
        "bg_colors": ((12, 74, 96), (2, 132, 199), (56, 189, 248)),
        "local_img": os.path.join(BASE_DIR, "static", "img", "oferta-cartagena.jpg")
    },
    {
        "iata": "MTR",
        "ciudad": "Montería",
        "pais": "Colombia",
        "bg_colors": ((20, 83, 45), (34, 197, 94), (74, 222, 128)),
        "local_img": None
    },
    {
        "iata": "BAQ",
        "ciudad": "Barranquilla",
        "pais": "Colombia",
        "bg_colors": ((30, 58, 138), (59, 130, 246), (147, 197, 253)),
        "local_img": os.path.join(BASE_DIR, "static", "img", "oferta-barranquilla.jpg")
    },
    {
        "iata": "SMR",
        "ciudad": "Santa Marta",
        "pais": "Colombia",
        "bg_colors": ((19, 78, 74), (20, 184, 166), (94, 234, 212)),
        "local_img": os.path.join(BASE_DIR, "static", "img", "oferta-santamarta.jpg")
    },
    {
        "iata": "MIA",
        "ciudad": "Miami",
        "pais": "Estados Unidos",
        "bg_colors": ((88, 28, 135), (147, 51, 234), (192, 132, 252)),
        "local_img": os.path.join(BASE_DIR, "static", "img", "oferta-miami.jpg")
    },
    {
        "iata": "JFK",
        "ciudad": "Nueva York",
        "pais": "Estados Unidos",
        "bg_colors": ((30, 41, 59), (71, 85, 105), (148, 163, 184)),
        "local_img": None
    },
    {
        "iata": "MEX",
        "ciudad": "Ciudad de México",
        "pais": "México",
        "bg_colors": ((124, 45, 18), (234, 88, 12), (251, 146, 60)),
        "local_img": None
    },
    {
        "iata": "MAD",
        "ciudad": "Madrid",
        "pais": "España",
        "bg_colors": ((159, 18, 57), (225, 29, 72), (251, 113, 133)),
        "local_img": None
    }
]

def render_cinematic_landscape(item):
    c1, c2, c3 = item["bg_colors"]
    w, h = 1280, 800
    img = Image.new("RGB", (w, h), color=c1)
    draw = ImageDraw.Draw(img)

    # Gradiente vertical de cielo / horizonte
    for y in range(h):
        t = y / h
        if t < 0.6:
            factor = t / 0.6
            r = int(c1[0] * (1 - factor) + c2[0] * factor)
            g = int(c1[1] * (1 - factor) + c2[1] * factor)
            b = int(c1[2] * (1 - factor) + c2[2] * factor)
        else:
            factor = (t - 0.6) / 0.4
            r = int(c2[0] * (1 - factor) + c3[0] * factor)
            g = int(c2[1] * (1 - factor) + c3[1] * factor)
            b = int(c2[2] * (1 - factor) + c3[2] * factor)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # Silueta de horizonte / skyline arquitectónico
    import random
    random.seed(sum(ord(ch) for ch in item["iata"]))
    points = [(0, h)]
    cur_x = 0
    while cur_x < w:
        building_w = random.randint(30, 80)
        building_h = random.randint(150, 420)
        top_y = h - building_h
        points.append((cur_x, top_y))
        points.append((min(w, cur_x + building_w), top_y))
        cur_x += building_w
    points.append((w, h))

    # Dibujar silueta de edificios en color oscuro
    draw.polygon(points, fill=(10, 15, 30))

    # Ventanas iluminadas en los edificios
    for bx, by in points[1:-1:2]:
        bw = random.randint(25, 60)
        for wy in range(by + 15, h - 30, 18):
            for wx in range(bx + 6, bx + bw - 6, 12):
                if random.random() > 0.35:
                    draw.rectangle([wx, wy, wx + 4, wy + 8], fill=(254, 240, 138, 200))

    # Luces de neón y reflejos en la base
    for x in range(0, w, 15):
        draw.line([(x, h - 15), (x + 8, h)], fill=(c2[0], c2[1], c2[2]))

    # Viñeta oscura periférica
    vignette = Image.new("L", (w, h), 0)
    v_draw = ImageDraw.Draw(vignette)
    v_draw.ellipse([40, 40, w - 40, h - 40], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(80))

    img_dark = Image.new("RGB", (w, h), (5, 8, 15))
    final = Image.composite(img, img_dark, vignette)

    # Superponer texto elegante
    f_draw = ImageDraw.Draw(final)
    f_draw.text((60, 60), item["ciudad"].upper(), fill=(255, 255, 255))
    f_draw.text((60, 90), f"{item['pais']} • {item['iata']} AIRPORT", fill=(225, 29, 72))

    buf = io.BytesIO()
    final.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue()

def procesar_o_generar(item):
    if item["local_img"] and os.path.exists(item["local_img"]):
        try:
            img = Image.open(item["local_img"])
            if img.mode != "RGB":
                img = img.convert("RGB")
            fitted = ImageOps.fit(img, (1280, 800), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
            buf = io.BytesIO()
            fitted.save(buf, format="JPEG", quality=88, optimize=True)
            return buf.getvalue()
        except Exception as e:
            print(f"Error procesando imagen local {item['local_img']}: {e}")
    return render_cinematic_landscape(item)

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS destino_imagenes (
        codigo_iata TEXT PRIMARY KEY,
        ciudad TEXT NOT NULL,
        pais TEXT,
        imagen_blob BLOB NOT NULL,
        mime_type TEXT DEFAULT 'image/jpeg',
        updated_at TEXT
    );
    """)
    conn.commit()

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for item in DESTINOS_DATA:
        iata = item["iata"]
        ciudad = item["ciudad"]
        pais = item["pais"]
        blob = procesar_o_generar(item)
        cur.execute("""
        INSERT INTO destino_imagenes (codigo_iata, ciudad, pais, imagen_blob, mime_type, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(codigo_iata) DO UPDATE SET
            ciudad=excluded.ciudad,
            pais=excluded.pais,
            imagen_blob=excluded.imagen_blob,
            mime_type=excluded.mime_type,
            updated_at=excluded.updated_at;
        """, (iata, ciudad, pais, blob, "image/jpeg", now_iso))
        print(f"✓ Guardado destino {ciudad} ({iata}) en BD: {len(blob)//1024} KB")

    conn.commit()
    conn.close()
    print("Base de datos destino_imagenes inicializada al 100%.")

if __name__ == "__main__":
    main()
