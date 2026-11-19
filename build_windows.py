"""
=============================================================================
  AERO FLOW AIRLINES — Script de Compilación Oficial para Windows (.exe)
  Genera el ejecutable nativo en dist/AeroFlowAirlines.exe
=============================================================================
"""
import os
import sys
import subprocess
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist")
BUILD_DIR = os.path.join(BASE_DIR, "build")

SPEC_CONTENT = """# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['desktop_launcher.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('templates', 'templates'),
        ('static', 'static'),
        ('data_structures', 'data_structures'),
        ('payments', 'payments'),
        ('airports', 'airports'),
        ('icons', 'icons'),
    ],
    hiddenimports=[
        'flask',
        'PIL',
        'PIL.Image',
        'PIL.ImageOps',
        'PIL.ImageFilter',
        'werkzeug',
        'werkzeug.security',
        'sqlite3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'PyQt5', 'PyQt6', 'matplotlib'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='AeroFlowAirlines',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icons/app_icon.ico' if os.path.exists('icons/app_icon.ico') else None,
)
"""

def main():
    print("=" * 60)
    print("  ✈️  COMPILADOR WINDOWS (.EXE) — AERO FLOW AIRLINES  ✈️")
    print("=" * 60)

    spec_file = os.path.join(BASE_DIR, "AeroFlowAirlines.spec")
    with open(spec_file, "w", encoding="utf-8") as f:
        f.write(SPEC_CONTENT)
    print("✓ Archivo de especificación PyInstaller generado: AeroFlowAirlines.spec")

    os.makedirs(DIST_DIR, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        spec_file,
        "--clean",
        "-y"
    ]

    print("Iniciando compilación con PyInstaller...")
    try:
        res = subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error durante la compilación: {e}")
        sys.exit(1)

    exe_path = os.path.join(DIST_DIR, "AeroFlowAirlines.exe")
    if os.path.exists(exe_path):
        size_mb = os.path.getsize(exe_path) / (1024 * 1024)
        print("=" * 60)
        print(f"✓ COMPILACIÓN EXITOSA:")
        print(f"  Ruta: {exe_path}")
        print(f"  Tamaño: {size_mb:.2f} MB")
        print("=" * 60)
    else:
        print(f"ADVERTENCIA: No se encontró el archivo ejecutable en {exe_path}")

if __name__ == "__main__":
    main()
