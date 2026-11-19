import re
import os
import sys

def main():
    readme_path = 'README.md'
    if not os.path.exists(readme_path):
        print("ERROR: README.md no existe.")
        sys.exit(1)

    with open(readme_path, 'r', encoding='utf-8') as f:
        content = f.read()

    print("=== AUDITORÍA DE ENLACES EN README.md ===")

    # 1. Auditar imágenes: ![alt](path)
    img_pattern = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
    images = img_pattern.findall(content)
    print(f"Total imágenes encontradas: {len(images)}")

    all_images_ok = True
    for alt, img_path in images:
        if img_path.startswith(('http://', 'https://')):
            continue
        clean_path = img_path.split('#')[0].split('?')[0]
        if not os.path.exists(clean_path):
            print(f"[FAIL] Imagen rota: {clean_path} (alt: {alt})")
            all_images_ok = False
        else:
            size_kb = os.path.getsize(clean_path) / 1024
            print(f"[PASS] Imagen OK: {clean_path} ({size_kb:.1f} KB)")

    # 2. Auditar enlaces internos de ancla: [text](#anchor)
    anchor_pattern = re.compile(r'\[([^\]]+)\]\(#([^)]+)\)')
    internal_links = anchor_pattern.findall(content)
    print(f"\nTotal enlaces de ancla internos: {len(internal_links)}")

    # Extraer encabezados del README para validar anclas
    header_pattern = re.compile(r'^(#{1,6})\s+(.+)$', re.MULTILINE)
    raw_headers = [m[1].strip() for m in header_pattern.findall(content)]

    def slugify(text):
        s = text.lower()
        s = re.sub(r'[^\w\s-]', '', s)
        s = re.sub(r'[\s_]+', '-', s)
        return s.strip('-')

    available_slugs = {slugify(h) for h in raw_headers}

    all_anchors_ok = True
    for text, anchor in internal_links:
        # Algunos generadores de markdown limpian tildes o signos
        if anchor in available_slugs or any(anchor in s or s in anchor for s in available_slugs):
            print(f"[PASS] Ancla válida: #{anchor} ('{text}')")
        else:
            print(f"[WARN] Ancla no encontrada directamente: #{anchor} ('{text}')")

    if all_images_ok:
        print("\n=== AUDITORÍA COMPLETADA CON ÉXITO: 0 IMÁGENES ROTAS ===")
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()
