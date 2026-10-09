# اپ اندروید «تخت جمشید» (Capacitor)

پوسته‌ی اندروید؛ همان `index.html` و فایل‌های بازی را داخل خودِ اپ می‌گذارد (`www/`) و داده را از Supabase می‌خواند.
iOS: نسخه‌ی PWA (نصب از Safari ← Share ← Add to Home Screen) از همان فایل‌های وب‌اند، بدون Mac.

## ساخت APK (ویندوز)
ابزارها (نصب‌شده در `E:\tools`، خارج از مخزن): JDK 21، Android SDK (platform 36، build-tools 36).

```powershell
# مسیر پروژه فارسی است و gradlew.bat با آن کار نمی‌کند؛ یک درایو ASCII بساز:
subst T: "E:\مهرداد\بزرگمهر\تخت جمشید\app"
$env:JAVA_HOME='E:\tools\jdk21'; $env:ANDROID_HOME='E:\tools\android-sdk'
# build-www و cap sync را از مسیر واقعیِ app اجرا کن (نه از T: — ریشه‌ی مخزن را اشتباه می‌گیرد)؛ فقط Gradle از T: اجرا شود:
cd "E:\مهرداد\بزرگمهر\تخت جمشید\app"; node build-www.js; npx cap sync android
cd T:\android
.\gradlew.bat assembleRelease --no-daemon   # امضادار (به keystore.properties نیاز دارد)
.\gradlew.bat assembleDebug --no-daemon     # آزمایشی (امضای debug)
# خروجی: android\app\build\outputs\apk\{release,debug}\
```

- `build-www.js` فایل‌های اجرایی را از ریشه‌ی مخزن به `www/` کپی می‌کند (assets از `git ls-files` + فایل‌های ردیابی‌نشده‌یِ `assets/vendor`؛ بقیه‌یِ فایل‌های ردیابی‌نشده داخل اپ نمی‌روند).
- اگر اینترنت از پراکسی/VPN می‌گذرد، Gradle باید پراکسی را بداند: `~/.gradle/gradle.properties` (`systemProp.https.proxyHost/Port`).
- بار اول ≈ ۲۰ دقیقه (دانلود وابستگی‌ها)؛ دفعه‌های بعد چند دقیقه. برای هر نسخه‌یِ جدید `versionCode` را در `android/app/build.gradle` بالا ببر.
- `appId = com.takhtjamshid.game` در `capacitor.config.json` و `build.gradle` — **قبل از انتشار در بازار** نهایی کن (بعد از انتشار قابل تغییر نیست).

## امضای انتشار — مهم
- `android/takht-release.jks` + `android/keystore.properties` (حاویِ رمز) ساخته شده‌اند و در `.gitignore` هستند، یعنی **در GitHub نیستند**.
- **از هر دو فایل یک نسخه‌یِ پشتیبان در جایِ امن بگیر.** اگر گم شوند، نسخه‌یِ بعدیِ اپ روی نصبِ قبلی نصب نمی‌شود (اندروید امضایِ متفاوت را رد می‌کند).
- گواهی: `CN=Takht-e-Jamshid, O=Bozorgmehr Games, C=IR`، RSA 2048، ۱۰٬۰۰۰ روز.

## ویژگی‌هایِ اپ
- دکمه‌یِ «بازگشت» پنجره‌یِ QR/لایت‌باکس را می‌بندد و در غیرِ این صورت می‌پرسد «خارج می‌شوی؟» (`@capacitor/app`).
- اسکنِ QRِ اتاق (دوربینِ وب + `assets/vendor/jsQR.js`، بدونِ پلاگینِ Google/ML Kit؛ پس بدونِ Play Services هم کار می‌کند) و نمایشِ QR برایِ گرداننده (`assets/vendor/qrcode.js`). محتویِ QR همان کدِ ۶ رقمی است. لینکِ `?code=123456` هم کد را پر می‌کند. هر سه در وب/PWA هم کار می‌کنند.
- فقط عمودی؛ مجوزِ `CAMERA` (اختیاری، `required=false`).

## کارهایِ باقی‌مانده
- تست روی گوشی‌هایِ واقعی (اسکنِ QR با دوربینِ واقعی، back، خروج و بازگشت به بازی)، آیکنِ نهایی، AAB برایِ فروشگاه‌ها، شمارهٔ نسخه/به‌روزرسانی.
