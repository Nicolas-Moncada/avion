import io
import json
import urllib.request
import urllib.error
from PIL import Image

BASE_URL = "http://127.0.0.1:5000"

def upload_multipart(url, file_bytes, filename, role="admin"):
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(url, data=body)
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("X-User-Role", role)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode()
        print("HTTP Error response body:", err_msg)
        raise
    except urllib.error.URLError:
        # Fallback a test_client de Flask en memoria si el servidor en vivo no está activo
        from app import app
        with app.test_client() as client:
            resp = client.post(
                "/api/admin/upload-imagen",
                data={"file": (io.BytesIO(file_bytes), filename)},
                headers={"X-User-Role": role},
                content_type="multipart/form-data",
            )
            if resp.status_code >= 400:
                raise urllib.error.HTTPError(url, resp.status_code, resp.get_data(as_text=True), {}, None)
            return resp.get_json()

def test_image_scaler_unit():
    print("1. Probando escalador universal con imagen gigante de 3840x2160 (4K Ultra-Wide)...")
    img_4k = Image.new("RGBA", (3840, 2160), color=(30, 64, 175, 255))
    buf = io.BytesIO()
    img_4k.save(buf, format="PNG")
    raw_4k = buf.getvalue()

    res = upload_multipart(f"{BASE_URL}/api/admin/upload-imagen", raw_4k, "test_4k.png", role="admin")
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

    res_sq = upload_multipart(f"{BASE_URL}/api/admin/upload-imagen", raw_sq, "test_square.jpg", role="admin")
    assert res_sq["ancho"] == 1280
    assert res_sq["alto"] == 800
    print(f"✓ Éxito: Imagen cuadrada recortada limpiamente y adaptada a 16:10: {res_sq['peso_kb']} KB")

    print("\n3. Probando seguridad de rol: Pasajero no debe poder subir imágenes...")
    try:
        upload_multipart(f"{BASE_URL}/api/admin/upload-imagen", raw_sq, "test_unauth.jpg", role="pasajero")
        assert False, "Debería fallar con HTTP 403"
    except urllib.error.HTTPError as e:
        assert e.code == 403, f"Esperado 403, recibido {e.code}"
        print("✓ Seguridad verificada: Acceso no autorizado bloqueado correctamente con HTTP 403")

if __name__ == "__main__":
    test_image_scaler_unit()
    print("\nTODAS LAS PRUEBAS DEL ESCALADOR UNIVERSAL DE IMÁGENES PASARON EXITOSAMENTE.")
