-- حذف اتاق‌های بازیِ قدیمی از Supabase (تخت جمشید)
-- سیاست حریم خصوصی می‌گوید داده‌ی هر اتاق «پس از حداکثر ۳۰ روز» پاک می‌شود. این اسکریپت همین را انجام می‌دهد.
-- جدول‌هایِ players، night_actions، day_votes، letters و events_log با `on delete cascade` به games وصل‌اند،
-- پس حذفِ یک ردیفِ games همه‌یِ داده‌یِ آن اتاق را پاک می‌کند.
--
-- چطور اجرا کنیم (Supabase Dashboard → SQL Editor):
--   ۱) اول فقط «پیش‌نمایش» را اجرا کن و ببین چه چیزی پاک می‌شود.
--   ۲) بعد «حذف یک‌باره» را اجرا کن.
--   ۳) برای اجرای خودکارِ هر شب، افزونه‌یِ pg_cron را فعال کن (Database → Extensions → pg_cron) و بخشِ «زمان‌بندی» را اجرا کن.

-- ── ۱) پیش‌نمایش: اتاق‌هایی که قدیمی‌تر از ۳۰ روزند ──
select count(*) as old_rooms, min(created_at) as oldest
from games
where created_at < now() - interval '30 days';

-- ── ۲) حذف یک‌باره (آنچه در پیش‌نمایش دیدی پاک می‌شود) ──
-- delete from games where created_at < now() - interval '30 days';

-- ── ۳) زمان‌بندی: هر شب ساعت ۰۳:۰۰ UTC ──
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'tj-cleanup-old-rooms',
--   '0 3 * * *',
--   $$ delete from games where created_at < now() - interval '30 days' $$
-- );
--
-- برای دیدنِ زمان‌بندی‌ها:   select * from cron.job;
-- برای برداشتنش:             select cron.unschedule('tj-cleanup-old-rooms');
