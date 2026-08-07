<div dir="rtl">

# معماری فنی — تخت جمشید (نسخه‌ی وب)

## ۱. تصمیمات پایه

- **بک‌اند:** Supabase (Postgres + REST/Realtime رایگان) — بدون سرور اختصاصی.
- **فرانت‌اند:** یک اپ وب واحد (مثلاً React) روی Vercel/Netlify (رایگان) — هم برای بازیکن، هم برای گرداننده (با یک فلگ `is_host`).
- **همگام‌سازی:** بدون نیاز به push آنی. بازیکن‌ها هر چند ثانیه (polling) یا با فعال‌کردن اختیاریِ Supabase Realtime (که رایگانه و اگه بعداً خواستیم، ارتقاء ساده‌ست) وضعیت‌شون رو می‌گیرن. گرداننده اکشن‌هاشو ثبت می‌کنه؛ فقط وقتی گرداننده «اعلامِ نتیجه» رو می‌زنه، نتیجه برای بازیکن‌ها قابل‌دیدن می‌شه.
- **مدل کلیدی:** هیچ محاسبه‌ی خودکارِ فوری روی هر اکشن انجام نمی‌شه؛ همه‌ی اکشن‌های یک «دور» (شب/روز/سروش) جمع می‌شن و با زدنِ دکمه‌ی «پایانِ دور» توسط گرداننده، یک‌جا resolve و ثبت می‌شن (طبق بخش ۱۰ سندِ قوانین).

## ۲. مدل داده (جداول اصلی)

**games**
`id, code (کد اتاق ۶ رقمی), status (lobby/running/ended), current_phase, day_number, winner_side, created_at`

**players**
`id, game_id, display_name, is_host (اهورا مزدا), role_id, is_alive, joined_at, immune_flags (jsonb — مثل بیژن/رستمِ زره)`

**roles** (جدول مرجع ثابت، نه دیتابیسی پویا)
`id, name_fa, side (jamshidi/zahhaki/neutral), night_action_type, one_time_ability (bool), description`

**night_actions** (لاگِ خامِ همه‌ی اکشن‌های یک شب، قبل از resolve)
`id, game_id, night_number, actor_player_id, action_type (kill_pick/save/inquiry/enchant/...)، target_player_id, extra (jsonb), submitted_at`

**day_votes**
`id, game_id, day_number, voter_id, target_id, vote_type (peyman/goman)`

**letters**
`id, game_id, sent_on_soroush_number, sender_id (nullable برای نامه‌ی شب چون گیرنده فقط نقشو می‌بینه), addressed_to_player_id (nullable), addressed_to_role_id (nullable), body, delivered (bool), zahhak_intercepted (bool)`

**events_log** (تاریخچه‌ی نهاییِ اعلام‌شده — برای جاماسپ، برای گرداننده، برای resolve نمایشی)
`id, game_id, day_or_night_number, type (death/hengameh/statement), payload (jsonb)`

## ۳. state machine کلی بازی

```
LOBBY
  → NIGHT_INTRO (شب معارفه: نمایش نقش‌ها به هم بر اساس جدول شناخت اولیه)
  → DAY (صحبت + رأی پیمان/گمان)
  → RESOLUTION_CHOICE (جمشید: مجلس‌مهان | مشورت | انتخاب مستقیم | هیچ‌کدام)
  → NIMROOZ (خواب نیم‌روزی: کیکاووس + نوشدارو)
  → NIGHT (اکشن‌های شبانه به ترتیب: ضحاک → ارمایل → ضحاکیان → ایرانیان؛ گرسیوز هر لحظه)
  → NIGHT_RESOLVE (موتور resolve، خروجی: کشته‌های شب + رویدادهای فعال‌شده)
  → (برگشت به DAY، مگر شرط پایان بازی برقرار بشه)
  → GAME_OVER
```
هنگامه‌ها (قیام/کودتا/سیاوشان/جنگ) به‌عنوان **فلگ‌های وضعیتِ بازی** (نه فازهای جدا) پیاده می‌شن که روی همین چرخه سوار می‌شن و رفتار برخی مراحل رو تغییر می‌دن (مثلاً NIMROOZ وقتی کودتا فعاله، رأی‌گیریِ رستم/زال/جاماسپ رو هم داره).

## ۴. موتور Resolve شب (خلاصه‌ی رویکرد)

ورودی: همه‌ی رکوردهای `night_actions` همون شب.
پردازش:
1. اول افکت‌های «غیرفعال‌کننده» اعمال می‌شن (افسونِ سودابه) — هر اکشنی که هدفش شخصِ افسون‌شده باشه باطل می‌شه.
2. بعد افکت‌های «مصونیت» چک می‌شن (زره‌ی رستم، پرِ سیمرغِ زال، نامیراییِ بیژن).
3. بعد انتخاب ضحاک + نجاتِ ارمایل حل می‌شه.
4. بعد کشتن‌های مستقیمِ نقش‌ها (هومان، تیرِ رستم، گرسیوز) با توجه به نتایجِ بالا اعمال می‌شن.
5. خروجیِ نهایی (لیستِ کشته‌ها + رویدادهای تریگرشده مثل قیام/کودتا) در `events_log` ثبت و برای گرداننده نمایش داده می‌شه تا با یک دکمه «اعلامِ صبح» برای بازیکن‌ها آزاد بشه.

</div>
