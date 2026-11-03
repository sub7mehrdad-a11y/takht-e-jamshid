"""ساختِ همه‌یِ آیکن‌ها و لوگوهایِ اپ از روی assets/brand/takht-logo.webp (لوگویِ تخت جمشید؛ مربعِ گوشه‌گرد روی زمینه‌یِ سیاه).

    python tools/make-icons.py

خروجی‌ها (همه از همان یک فایل):
  assets/pwa/        آیکنِ PWA/آیفون/favicon (+ maskable)
  app/android/…/res  آیکنِ اندروید (قدیمی، گرد، تطبیقی) + اسپلش
  گوگل-پلی/گرافیک/icon-512.png
گوشه‌هایِ سیاهِ لوگو با «پرکردنِ نرم از رنگِ همسایه» پر می‌شوند تا آیکنِ تمام‌صفحه (full-bleed) بدونِ گوشه‌یِ سیاه داشته باشیم. """
import glob
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
P = lambda *a: os.path.join(ROOT, *a)

# هندسه‌یِ لوگو (اندازه‌گیری‌شده روی فایلِ ۱۲۵۴×۱۲۵۴): مربعِ گوشه‌گرد از ≈۳۵ تا ≈۱۲۲۰؛ یک خطِ نازکِ روشن روی لبه‌اش هست
BOX = (38, 34, 1218, 1214)          # برشِ مربعیِ داخلِ لبه (۱۱۸۰ پیکسل)
RADIUS = 270                         # شعاعِ گوشه (برازش‌شده روی مرزِ واقعیِ لوگو؛ خطای ≈۳ پیکسل)
EDGE = (33, 28, 1221, 1222)


def fill_corners(img):
    """سیاهیِ بیرونِ مستطیلِ گوشه‌گرد را با رنگِ همسایه‌ها (نرمالایز-کانولوشن چندمقیاسی) پر می‌کند."""
    w, h = img.size
    inner = Image.new('L', (w, h), 0)
    l, t, r, b = EDGE; m = 14                                            # ۱۴ پیکسل داخل‌تر: خطِ لبه و ضدِ‌دندانه کنار برود
    ImageDraw.Draw(inner).rounded_rectangle((l + m, t + m, r - m, b - m), radius=RADIUS - m, fill=255)
    arr = np.asarray(img).astype(np.float32); valid = (np.asarray(inner) > 127).astype(np.float32)
    out = arr.copy(); remain = 1 - valid
    for rad in (6, 18, 50, 120):                                          # از ریز به درشت؛ هر مقیاس فقط جاهایِ هنوز خالی را پر می‌کند
        num = cv2.GaussianBlur(arr * valid[..., None], (0, 0), rad); den = cv2.GaussianBlur(valid, (0, 0), rad)
        est = num / np.maximum(den, 1e-4)[..., None]; ok = (den > 0.08).astype(np.float32)
        take = ((remain > 0) & (ok > 0))[..., None]; out = np.where(take, est, out); remain = remain * (1 - ok)
    res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    return res.crop(BOX)


def save_png(im, path, mode='RGB'):
    os.makedirs(os.path.dirname(path), exist_ok=True); im.convert(mode).save(path, optimize=True)


def padded(full, size, frac, bg=(0, 0, 0), alpha=False):
    """لوگو با نسبتِ frac از اندازه، وسطِ بومِ size×size (برایِ maskable/تطبیقی)."""
    canvas = Image.new('RGBA' if alpha else 'RGB', (size, size), (0, 0, 0, 0) if alpha else bg)
    s = int(size * frac); lg = full.resize((s, s), Image.LANCZOS)
    canvas.paste(lg, ((size - s) // 2, (size - s) // 2)); return canvas


def main():
    import sys; sys.stdout.reconfigure(encoding='utf-8')
    src = Image.open(P('assets', 'brand', 'takht-logo.webp')).convert('RGB')
    full = fill_corners(src)                                              # ۱۱۸۰×۱۱۸۰، بدونِ گوشه‌یِ سیاه
    rs = lambda n: full.resize((n, n), Image.LANCZOS)

    # PWA / آیفون
    save_png(rs(512), P('assets', 'pwa', 'icon-512.png')); save_png(rs(192), P('assets', 'pwa', 'icon-192.png'))
    save_png(rs(180), P('assets', 'pwa', 'apple-touch-icon.png')); save_png(rs(48), P('assets', 'pwa', 'favicon-48.png'))
    save_png(padded(full, 512, 0.80), P('assets', 'pwa', 'icon-maskable-512.png'))

    # گوگل پلی
    save_png(rs(512), P('گوگل-پلی', 'گرافیک', 'icon-512.png'), 'RGBA')

    # اندروید
    res = P('app', 'android', 'app', 'src', 'main', 'res')
    for d, (ic, fg) in {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}.items():
        save_png(rs(ic), os.path.join(res, f'mipmap-{d}', 'ic_launcher.png'))
        m = Image.new('L', (ic * 4, ic * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, ic * 4 - 1, ic * 4 - 1), fill=255); m = m.resize((ic, ic), Image.LANCZOS)
        rnd = Image.new('RGBA', (ic, ic), (0, 0, 0, 0)); rnd.paste(rs(ic), (0, 0), m); save_png(rnd, os.path.join(res, f'mipmap-{d}', 'ic_launcher_round.png'), 'RGBA')
        save_png(padded(full, fg, 0.62, alpha=True), os.path.join(res, f'mipmap-{d}', 'ic_launcher_foreground.png'), 'RGBA')
    with open(os.path.join(res, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>')
    for p in glob.glob(os.path.join(res, 'drawable*', 'splash.png')):        # اسپلش: زمینه‌یِ سیاه + لوگو (نیمِ ضلعِ کوتاه‌تر)
        w, h = Image.open(p).size; s = int(min(w, h) * 0.5)
        sp = Image.new('RGB', (w, h), (0, 0, 0)); sp.paste(full.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2)); sp.save(p, optimize=True)
    print('آیکن‌ها ساخته شد از', P('assets', 'brand', 'takht-logo.webp'))


if __name__ == '__main__':
    main()
