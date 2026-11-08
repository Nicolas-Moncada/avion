"""
=============================================================================
  AERO FLOW AIRLINES — Desktop Application Launcher (.exe)
  Inicia el servidor aeronáutico embebido y abre la interfaz de escritorio
  en ventana nativa independiente de alta definición (sin barra de navegador).
=============================================================================
"""

import os
import sys
import time
import socket
import threading
import subprocess
import webbrowser
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Determinar si el puerto está disponible
def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def find_available_port(default_port: int = 5000) -> int:
    if not is_port_in_use(default_port):
        return default_port
    for p in range(5001, 5050):
        if not is_port_in_use(p):
            return p
    return default_port

def launch_desktop_window(url: str):
    """
    Abre la aplicación en una ventana nativa independiente de escritorio
    utilizando Microsoft Edge o Google Chrome en modo App (sin barra de direcciones).
    """
    edge_candidates = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    chrome_candidates = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ]

    browser_exe = None
    for candidate in edge_candidates + chrome_candidates:
        if candidate and os.path.exists(candidate):
            browser_exe = candidate
            break

    if browser_exe:
        logging.info(f"Abriendo ventana de escritorio nativa con: {browser_exe}")
        proc = subprocess.Popen([
            browser_exe,
            f"--app={url}",
            "--window-size=1280,850",
            "--window-position=100,50"
        ])
        return proc
    else:
        logging.info("Navegador en modo app no encontrado. Abriendo navegador predeterminado...")
        webbrowser.open(url)
        return None

def main():
    print("=" * 65)
    print("      ✈️  AERO FLOW AIRLINES — SISTEMA AERONÁUTICO DESKTOP  ✈️")
    print("=" * 65)
    print("Iniciando servicios locales y base de datos...")

    # Importar app después de configurar sys.path
    from app import app
    import config

    port = 5000
    # Si el puerto 5000 ya está ocupado por otra instancia, buscar uno libre
    if is_port_in_use(port):
        port = find_available_port(5001)

    url = f"http://127.0.0.1:{port}"

    def run_server():
        try:
            app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
        except Exception as e:
            logging.error(f"Error en servidor Flask: {e}")

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Esperar hasta que el servidor responda
    max_wait = 15
    start_time = time.time()
    server_ready = False
    while time.time() - start_time < max_wait:
        if is_port_in_use(port):
            server_ready = True
            break
        time.sleep(0.3)

    if not server_ready:
        print("[ERROR] El servidor no respondió a tiempo.")
        sys.exit(1)

    print(f"[OK] Plataforma lista en: {url}")
    print("Abriendo ventana de la aplicación...")

    app_process = launch_desktop_window(url)

    if app_process:
        # Esperar a que el usuario cierre la ventana de la app
        try:
            app_process.wait()
            print("Ventana de Aero Flow cerrada. Finalizando servicios.")
        except KeyboardInterrupt:
            pass
    else:
        print("Presiona Ctrl+C en esta consola para detener Aero Flow.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    sys.exit(0)

if __name__ == '__main__':
    main()

