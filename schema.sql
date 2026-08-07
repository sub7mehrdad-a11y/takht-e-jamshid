-- تخت جمشید — اسکیمای دیتابیس Supabase (Postgres)
-- ترتیب اجرا: این فایل رو مستقیم توی Supabase SQL Editor پیست و اجرا کن.

create extension if not exists "uuid-ossp";

-- ============ بازی‌ها ============
create table games (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,               -- کد ۶ رقمیِ اتاق برای join
  status text not null default 'lobby',    -- lobby | night_intro | day | resolution_choice | nimrooz | night | night_resolve | ended
  current_phase text,
  day_number int not null default 0,
  night_number int not null default 0,
  winner_side text,                        -- jamshidi | zahhaki | null
  hengameh_flags jsonb not null default '{}'::jsonb,  -- {qiam:bool, kudeta:bool, siavashan:bool, jang:bool, zahhak_incapacitated:bool}
  jamshid_power_transferred_to text,       -- برای هنگامه‌ی کودتا: player_id فریدون یا null
  soroush_active_until_night int,          -- شماره‌ی شبی که پنجره‌ی سروش تا اون فعاله
  created_at timestamptz not null default now()
);

-- ============ بازیکن‌ها ============
create table players (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  display_name text not null,
  is_host boolean not null default false,  -- توجه: is_host=true یعنی اهورامزدا/گرداننده؛ این فرد هرگز role_id نمی‌گیره و جزو حدنصابِ حداقل‌بازیکن (۱۰ نفر) حساب نمی‌شه.
  role_id text,                            -- ارجاع به کاتالوگِ ثابتِ نقش‌ها (roles-data.json) — همیشه null برای is_host=true
  side text,                               -- jamshidi | zahhaki | neutral  (سهراب تا پیوستن null/neutral)
  is_alive boolean not null default true,
  eliminated_by text,                      -- 'zahhak_night' | 'jamshid_day' | 'gersivaz' | 'homan' | 'rostam' | ...
  eliminated_on_night int,
  eliminated_on_day int,
  state_flags jsonb not null default '{}'::jsonb,
  -- مثال state_flags: { "rostam_armor_used": false, "sudabeh_charges_used": 0,
  --   "gersivaz_used": false, "zaal_feather_used": false, "keykavous_noshdaru_used": false,
  --   "jam_e_jam_used": false, "soroush_called": false, "qiam_joined_night": null,
  --   "sohrab_joined_side": null, "enchanted_this_night": false }
  joined_at timestamptz not null default now()
);

-- ============ کاتالوگ نقش‌ها (رفرنس، نه پویا) ============
-- این جدول فقط برای join راحت‌تر و نمایش در UI؛ منطق اصلی از roles-data.json در کد میاد.
create table roles (
  id text primary key,
  name_fa text not null,
  side text not null,                      -- jamshidi | zahhaki | neutral
  data jsonb not null                      -- کل آبجکت نقش از roles-data.json
);

-- ============ اکشن‌های خامِ شب (قبل از resolve) ============
create table night_actions (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  night_number int not null,
  actor_player_id uuid not null references players(id),
  action_type text not null,               -- kill_pick_two | save_one_of_two | inquiry | enchant | guess_kill_or_copy | guess_shoot | block_all_kills | self_sacrifice | qiam_recruit
  target_player_id uuid references players(id),
  target_player_id_2 uuid references players(id),  -- برای kill_pick_two ضحاک
  extra jsonb default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (game_id, night_number, actor_player_id, action_type)
);

-- ============ رأی‌های روز ============
create table day_votes (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  day_number int not null,
  voter_id uuid not null references players(id),
  target_id uuid not null references players(id),
  vote_type text not null,                 -- peyman | goman
  created_at timestamptz not null default now()
);

-- ============ نامه‌ها (مکانیزم سروش) ============
create table letters (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  soroush_window_night int not null,       -- کدوم پنجره‌ی سروش
  sender_id uuid references players(id),
  addressed_to_player_id uuid references players(id),  -- نامه‌ی روز
  addressed_to_role_id text,                            -- نامه‌ی شب (خطاب به نقش)
  body text not null,
  is_night_letter boolean not null default false,
  zahhak_intercepted boolean not null default false,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ لاگ نهاییِ رویدادها (برای جاماسپ، تاریخچه، نمایش گرداننده) ============
create table events_log (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  day_or_night_number int,
  type text not null,                      -- death | hengameh_start | statement | game_over
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============ ایندکس‌های پرکاربرد ============
create index idx_players_game on players(game_id);
create index idx_night_actions_game_night on night_actions(game_id, night_number);
create index idx_events_log_game on events_log(game_id);
create index idx_letters_game on letters(game_id);

-- ============ RLS (Row Level Security) — حداقلی برای شروع ============
-- توجه: چون گرداننده و بازیکن‌ها هیچ‌کدوم login رسمی (auth) ندارن (join با کدِ اتاق)،
-- برای نسخه‌ی اول می‌تونیم RLS رو غیرفعال نگه داریم و امنیت رو با "کدِ اتاق تصادفی + جدولِ session token"
-- در لایه‌ی اپلیکیشن مدیریت کنیم. وقتی به فاز production رسیدیم، این بخش رو تکمیل می‌کنیم.
alter table games enable row level security;
alter table players enable row level security;
create policy "public read games" on games for select using (true);
create policy "public read players" on players for select using (true);
-- نوشتن (insert/update) رو فعلاً از طریق anon key با policy باز می‌ذاریم؛ در production باید محدودتر بشه.
create policy "public write games" on games for all using (true);
create policy "public write players" on players for all using (true);
