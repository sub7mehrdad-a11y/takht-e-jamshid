"""ساخت «بسته‌ی انتشار» (برای سایت/کاربران) در پوشه‌ی بسته-انتشار/ (در .gitignore؛ هر بار از نو ساخته می‌شود).

    python tools/build-release-bundle.py

۱-اندروید   ← آخرین APK از نسخه-اندروید/ + راهنمای نصب
۲-وب        ← takht-web.zip (نسخه‌ی تحت مرورگر، آماده‌ی آپلود/دیپلوی) + لینک‌های مستقیم
۳-آیفون     ← راهنمای نصب آیفون (HTML مستقل و چاپی؛ همان صفحه‌ای که روی سایتِ بازی هم هست)
"""
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'بسته-انتشار'
APK_DIR = ROOT / 'نسخه-اندروید'
DOMAIN = 'takht.bozorgmehr-game.ir'
WEB_TOP = ['index.html', 'supabase-client.js', 'resolveNight.js', 'sw.js', 'manifest.webmanifest',
           'Dockerfile', 'nginx.conf', 'liara.json']


def git_files(*args):
    out = subprocess.run(['git', '-c', 'core.quotepath=off', 'ls-files', '-z', *args], cwd=ROOT,
                         check=True, capture_output=True).stdout.decode('utf-8')
    return [f for f in out.split('\0') if f]


def version_key(p):
    return tuple(int(x) for x in re.findall(r'\d+', p.stem.split('-v')[-1]))


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    apks = sorted(APK_DIR.glob('takht-e-jamshid-v*.apk'), key=version_key)
    if not apks:
        sys.exit('APK پیدا نشد: ' + str(APK_DIR))
    apk = apks[-1]
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / '1-اندروید').mkdir(parents=True)
    (OUT / '2-وب').mkdir()
    (OUT / '3-آیفون').mkdir()

    # ۱) اندروید
    shutil.copy2(apk, OUT / '1-اندروید' / apk.name)
    if (APK_DIR / 'راهنما.txt').exists():
        shutil.copy2(APK_DIR / 'راهنما.txt', OUT / '1-اندروید' / 'راهنما.txt')

    # ۲) وب: فایل‌های اجرایی (ردیابی‌شده + راهنمای آیفون که شاید هنوز commit نشده) → zip
    files = WEB_TOP + git_files('assets') + git_files('-o', '--exclude-standard', 'assets/guide')
    files = list(dict.fromkeys(files))
    zpath = OUT / '2-وب' / 'takht-web.zip'
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in files:
            src = ROOT / f
            if not src.exists():
                sys.exit('فایل نیست: ' + f)
            z.write(src, f)
    (OUT / '2-وب' / 'لینک-مستقیم.txt').write_text(f"""بازی تخت جمشید — نسخه‌ی تحت مرورگر (بدون نصب)

آدرس بازی:
  https://{DOMAIN}/

لینک دعوت با کدِ اتاق (کد خودکار پر می‌شود؛ ۶ رقم):
  https://{DOMAIN}/?code=123456

صفحه‌ی راهنمای نصب آیفون (روی همان سایتِ بازی):
  https://{DOMAIN}/assets/guide/iphone.html

دکمه برای سایت:
  <a href="https://{DOMAIN}/" target="_blank" rel="noopener">بازی تحت وب</a>

نکته‌ها
- آدرس‌ها بعد از دیپلویِ سایت فعال می‌شوند (فعلاً DNS ندارد).
- بازی روی HTTPS باید باشد (دوربینِ اسکنِ QR و نصبِ آیفون فقط با HTTPS کار می‌کنند).
- هر کس فقط مرورگر دارد (اندروید/آیفون/کامپیوتر) همین آدرس را باز می‌کند؛ لازم نیست چیزی نصب کند.
- takht-web.zip همان فایل‌هایِ بازی است (index.html، supabase-client.js، resolveNight.js، sw.js، manifest، assets)
  + Dockerfile/nginx.conf/liara.json برایِ دیپلویِ مستقل. اگر سایتِ اصلی (nginx چنددامنه‌ای) بازی را از مخزن می‌چیند، به این zip نیازی نیست.
- بازی فقط به Supabase وصل می‌شود؛ فایل‌هایِ ایستا روی هر هاستِ HTTPS کار می‌کنند.
""", encoding='utf-8')

    # ۳) آیفون
    shutil.copy2(ROOT / 'assets' / 'guide' / 'iphone.html', OUT / '3-آیفون' / 'راهنمای-نصب-آیفون.html')

    (OUT / 'README.md').write_text(f"""# بسته‌ی انتشار — تخت جمشید ({apk.stem.split('-v')[-1]})

| پوشه | چیست | به چه کسی می‌دهی |
|---|---|---|
| `1-اندروید/` | `{apk.name}` (آخرین نسخه) + راهنمای نصب | دارندگان اندروید (دانلود مستقیم) |
| `2-وب/` | `takht-web.zip` (نسخه‌ی تحت مرورگر) + `لینک-مستقیم.txt` | همه (بدون نصب) — لینک را روی سایت بگذار |
| `3-آیفون/` | `راهنمای-نصب-آیفون.html` | دارندگان آیفون/آیپد (نصب از Safari، بدون اپ‌استور) |

آدرس بازی: https://{DOMAIN}/ — راهنمای آیفون روی خودِ سایتِ بازی هم هست: https://{DOMAIN}/assets/guide/iphone.html

این پوشه با `python tools/build-release-bundle.py` دوباره ساخته می‌شود و در git نیست (منبعِ اصلی همه‌چیز در مخزن است).
""", encoding='utf-8')

    mb = lambda p: p.stat().st_size / 1e6
    print(f'APK: {apk.name} ({mb(apk):.1f}MB)')
    print(f'zip وب: {len(files)} فایل ({mb(zpath):.1f}MB)')
    print('ساخته شد:', OUT)


if __name__ == '__main__':
    main()
