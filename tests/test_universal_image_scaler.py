import io
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as app_module


def test_image_scaler_unit():
    client = app_module.app.test_client()

    print("1. Probando escalador universal con imagen gigante de 3840x2160 (4K Ultra-Wide)...")
    img_4k = Image.new("RGBA", (3840, 2160), color=(30, 64, 175, 255))
    buf = io.BytesIO()
    img_4k.save(buf, format="PNG")
    raw_4k = buf.getvalue()

    resp = client.post(
        "/api/admin/upload-imagen",
        data={"file": (io.BytesIO(raw_4k), "test_4k.png")},
        content_type="multipart/form-data",
        headers={"X-User-Role": "admin"}
    )
    assert resp.status_code == 200, f"Status code esperado 200, recibido {resp.status_code}"
    res = resp.get_json()
    print("Respuesta endpoint:", res)
    assert res["exito"] is True
    assert res["ancho"] == 1280
    assert res["alto"] == 800
    assert (res["ancho"] / res["alto"]) == (16 / 10), "Aspect ratio debe ser exactamente 16:10"
    print(f"✓ Éxito: Imagen 4K adaptada a {res['ancho']}x{res['alto']} (16:10) con peso ligero: {res['peso_kb']} KB")

    print("\n2. Probando con imagen cuadrada de 1000x1000 (1:1)...")
    img_sq = Image.new("RGB", (1000, 1000), color=(225, 29, 72))
    buf_sq = io.BytesIO()
    img_sq.save(buf_sq, format="JPEG")
    raw_sq = buf_sq.getvalue()

    resp_sq = client.post(
        "/api/admin/upload-imagen",
        data={"file": (io.BytesIO(raw_sq), "test_square.jpg")},
        content_type="multipart/form-data",
        headers={"X-User-Role": "admin"}
    )
    assert resp_sq.status_code == 200
    res_sq = resp_sq.get_json()
    assert res_sq["ancho"] == 1280
    assert res_sq["alto"] == 800
    print(f"✓ Éxito: Imagen cuadrada recortada limpiamente y adaptada a 16:10: {res_sq['peso_kb']} KB")

    print("\n3. Probando seguridad de rol: Pasajero no debe poder subir imágenes...")
    resp_unauth = client.post(
        "/api/admin/upload-imagen",
        data={"file": (io.BytesIO(raw_sq), "test_unauth.jpg")},
        content_type="multipart/form-data",
        headers={"X-User-Role": "pasajero"}
    )
    assert resp_unauth.status_code == 403, f"Esperado 403, recibido {resp_unauth.status_code}"
    print("✓ Seguridad verificada: Acceso no autorizado bloqueado correctamente con HTTP 403")


if __name__ == "__main__":
    test_image_scaler_unit()
    print("\nTODAS LAS PRUEBAS DEL ESCALADOR UNIVERSAL DE IMÁGENES PASARON EXITOSAMENTE.")
