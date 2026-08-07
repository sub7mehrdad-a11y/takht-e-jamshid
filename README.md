<div dir="rtl">

# راهنمای راه‌اندازی — تخت جمشید (وب‌اپ)

## گام ۱ — ساختِ ریپازیتوری در گیت‌هاب
1. یه ریپازیتوریِ خالیِ جدید بساز (مثلاً `takht-e-jamshid`).
2. فایل‌های این پروژه رو توش بذار (schema.sql، فایل‌های html، resolveNight.js، و بقیه).

## گام ۲ — ساختِ پروژه در Supabase (رایگان)
1. برو به [supabase.com](https://supabase.com) → ثبت‌نام (با گیت‌هابت راحت‌تره) → دکمه‌ی **«New Project»**.
2. سازمان رو انتخاب/بساز، یه اسم بده (مثلاً `takht-e-jamshid`)، یه **رمزِ دیتابیسِ قوی** بساز و یه‌جای امن نگهش دار، نزدیک‌ترین ریجن رو انتخاب کن.
3. «Create new project» → حدودِ ۱-۲ دقیقه صبر کن.
4. برو به تبِ **SQL Editor** → محتوای `schema.sql` رو پیست کن → Run.
5. برو به **Table Editor** و مطمئن شو این ۷ جدول ساخته شدن: `games`, `players`, `roles`, `night_actions`, `day_votes`, `letters`, `events_log`.
6. برو به **Project Settings → API Keys** (یا دکمه‌ی «Connect» بالای داشبورد) و این دو مقدار رو یادداشت کن:
   - **Project URL** (چیزی شبیهِ `https://xxxxx.supabase.co`)
   - **Publishable key** (رشته‌ای که با `sb_publishable_...` شروع می‌شه — معادلِ همون «anon key»ی قدیمیه، امنه که تو کدِ فرانت‌اند باشه)

⚠️ کلیدِ **Secret** (که با `sb_secret_...` شروع می‌شه) هیچ‌وقت نباید تو کدِ فرانت‌اند باشه — فقط برای سمتِ سرور/امنه که فعلاً نداریم.

## گام ۳ — قدم بعدی
وقتی این دو گام تموم شد، URL و Publishable key رو بده تا فرانت‌اند رو بهش وصل کنیم و پروتوتایپ‌ها رو به یه اپِ واحدِ واقعی تبدیل کنیم.

---

## گام ۴ — ساختارِ نهاییِ ریپو و دیپلوی (رایگان)

### چیدمانِ فایل‌ها تو ریپو
فقط **دو فایل** برای اجرا شدنِ واقعیِ بازی لازمن؛ بقیه فقط برای مرجع/مستندسازی‌ان. این چیدمان رو پیشنهاد می‌کنم:

```
takht-e-jamshid/
  index.html              ← فایلِ اصلیِ اجرایی (همون lobby-live.html)
  supabase-client.js      ← باید دقیقاً کنارِ index.html باشه

  docs/
    takht-e-jamshid-spec.md
    takht-e-jamshid-architecture.md
    takht-e-jamshid-roles-data.json
    game-layouts.json
    schema.sql

  prototypes/
    resolveNight.js
    day-vote-prototype.html
    host-night-console-prototype.html
    host-dashboard-prototype.html
    morning-result-prototype.html
    soroush-letters-prototype.html
    lobby-and-role-reveal-prototype.html
```

**نکته‌ی مهم:** `index.html` و `supabase-client.js` باید تو یه پوشه (ریشه‌ی ریپو) کنارِ هم باشن، وگرنه اتصال به Supabase کار نمی‌کنه.

### دیپلویِ رایگان با Vercel
1. برو به **[vercel.com](https://vercel.com)** → ثبت‌نام با همون حسابِ گیت‌هابت.
2. «Add New… → Project» → ریپوی `takht-e-jamshid` رو انتخاب کن.
3. چون هیچ فریمورک/بیلدی نداریم، تنظیمات رو دست نزن (Framework Preset: **Other**، Build Command: خالی، Output Directory: خالی/ریشه) و مستقیم **Deploy** بزن.
4. بعد از چند ثانیه، یه آدرسِ عمومی می‌گیری (چیزی مثلِ `takht-e-jamshid.vercel.app`) — همینو به بازیکن‌ها بده، از رو گوشیِ خودشون (اندروید یا آیفون، فرقی نداره) باز می‌کنن.

از این به بعد، هر بارِ که فایل‌های `index.html` یا `supabase-client.js` رو تو گیت‌هاب آپدیت کنی، Vercel خودکار دوباره دیپلویش می‌کنه.

</div>
