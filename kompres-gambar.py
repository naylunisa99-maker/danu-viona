"""
Kompres semua foto di folder images/ (nama file TIDAK berubah).
Foto asli disalin dulu ke images_asli/ sebagai cadangan.

Cara pakai (di folder proyek, tempat ada folder images):
    pip install pillow
    python kompres-gambar.py
"""
import os, shutil
from PIL import Image, ImageOps

SRC = "images"
BACKUP = "images_asli"
MAX_SIDE = 1400      # sisi terpanjang (px), cukup tajam untuk layar HP
QUALITY = 78

os.makedirs(BACKUP, exist_ok=True)
total_before = total_after = 0

for name in sorted(os.listdir(SRC)):
    path = os.path.join(SRC, name)
    ext = os.path.splitext(name)[1].lower()
    if ext not in (".jpg", ".jpeg"):
        continue

    before = os.path.getsize(path)
    backup_path = os.path.join(BACKUP, name)
    if not os.path.exists(backup_path):
        shutil.copy2(path, backup_path)

    img = Image.open(backup_path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    tmp = path + ".tmp"
    img.save(tmp, "JPEG", quality=QUALITY, optimize=True, progressive=True)

    after = os.path.getsize(tmp)
    if after < before:
        os.replace(tmp, path)
    else:
        os.remove(tmp)
        after = before

    total_before += before
    total_after += after
    print(f"{name:25s} {before/1024:8.0f} KB -> {after/1024:6.0f} KB")

print(f"\nTotal: {total_before/1048576:.1f} MB -> {total_after/1048576:.1f} MB")