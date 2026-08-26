// تخت جمشید — تنظیمات و توابعِ کمکیِ Supabase
// این فایل باید کنارِ فایل‌های HTML باشه و قبل از اسکریپتِ خودِ صفحه لود بشه:
//   <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
//   <script src="supabase-client.js"></script>

const SUPABASE_URL = 'https://wdzfngsszluwepgomstv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WJkEk_rRAuDHySGRZuNYWQ_TRpsk1qr';

// اگه کتابخانه‌ی Supabase از CDN لود نشده باشه (فیلتر/قطعیِ اینترنت)، بدونِ این گارد
// کلِ همین فایل همون‌جا می‌ترکه و هیچ‌کدوم از توابعِ tj* تعریف نمی‌شن — یعنی دکمه‌ها
// بی‌صدا هیچ‌کاری نمی‌کنن. با این گارد، پیغامِ روشن می‌گیریم.
if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  throw new Error(
    'کتابخانه‌ی Supabase لود نشد. اینترنت یا دسترسی به unpkg.com رو چک کن.'
  );
}

// هر درخواست حداکثر ۱۵ ثانیه؛ وگرنه وقتی بک‌اند در دسترس نباشه، UI تا ابد
// روی حالتِ «در حالِ ساخت…» گیر می‌کنه و کاربر فکر می‌کنه دکمه کار نمی‌کنه.
const TJ_TIMEOUT_MS = 15000;

function tjFetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TJ_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .catch(err => {
      if (err && err.name === 'AbortError') {
        throw new Error('سرور جواب نداد (تایم‌اوت). اتصالِ اینترنت یا آدرسِ Supabase رو چک کن.');
      }
      throw new Error('اتصال به سرور برقرار نشد. اینترنت یا آدرسِ Supabase رو چک کن.');
    })
    .finally(() => clearTimeout(timer));
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: tjFetchWithTimeout },
});

// ---------- تولیدِ کدِ اتاقِ ۶ رقمی ----------
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------- ساختِ بازیِ جدید (گرداننده) ----------
async function tjCreateGame(hostName) {
  const code = generateRoomCode();

  const { data: game, error: gameErr } = await sb
    .from('games')
    .insert({ code, status: 'lobby' })
    .select()
    .single();
  if (gameErr) throw new Error('ساختِ اتاق شکست خورد: ' + gameErr.message);

  const { data: host, error: hostErr } = await sb
    .from('players')
    .insert({ game_id: game.id, display_name: hostName, is_host: true })
    .select()
    .single();
  if (hostErr) throw new Error('ثبتِ گرداننده شکست خورد: ' + hostErr.message);

  return { game, player: host };
}

// ---------- پیوستن به بازیِ موجود با کدِ اتاق ----------
async function tjJoinGame(code, displayName) {
  const { data: game, error: gameErr } = await sb
    .from('games')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (gameErr) throw new Error('خطا در جستجوی اتاق: ' + gameErr.message);
  if (!game) throw new Error('اتاقی با این کد پیدا نشد.');
  if (game.status !== 'lobby') throw new Error('این بازی قبلاً شروع شده — نمی‌تونی الان بپیوندی.');

  const { data: player, error: playerErr } = await sb
    .from('players')
    .insert({ game_id: game.id, display_name: displayName, is_host: false })
    .select()
    .single();
  if (playerErr) throw new Error('پیوستن شکست خورد: ' + playerErr.message);

  return { game, player };
}

// ---------- گرفتنِ لیستِ زنده‌ی بازیکنانِ یک بازی ----------
async function tjListPlayers(gameId) {
  const { data, error } = await sb
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('joined_at', { ascending: true });
  if (error) throw new Error('خطا در گرفتنِ لیستِ بازیکنان: ' + error.message);
  return data;
}

// ---------- گرفتنِ وضعیتِ فعلیِ یک بازی (برای پولینگِ فازِ بازی) ----------
async function tjGetGame(gameId) {
  const { data, error } = await sb
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (error) throw new Error('خطا در گرفتنِ وضعیتِ بازی: ' + error.message);
  return data;
}

// ---------- شروعِ بازی توسط گرداننده (تغییرِ status از lobby به running) ----------
async function tjStartGame(gameId) {
  const { data, error } = await sb
    .from('games')
    .update({ status: 'running', current_phase: 'night_intro' })
    .eq('id', gameId)
    .select()
    .single();
  if (error) throw new Error('شروعِ بازی شکست خورد: ' + error.message);
  return data;
}

// ---------- تخصیصِ رندومِ نقش‌ها طبقِ یک چیدمانِ انتخاب‌شده ----------
// layout: { jamshidi_roles:[...], zahhaki_roles:[...], neutral_roles:[...] }
// players: آرایه‌ی بازیکنانِ غیرِ گرداننده (باید دقیقاً هم‌اندازه‌ی مجموعِ نقش‌های layout باشه)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function tjAssignRoles(gameId, players, layout) {
  const roleSlots = [
    ...layout.jamshidi_roles.map(r => ({ role_id: r, side: 'jamshidi' })),
    ...layout.zahhaki_roles.map(r => ({ role_id: r, side: 'zahhaki' })),
    ...layout.neutral_roles.map(r => ({ role_id: r, side: 'neutral' })),
  ];
  if (roleSlots.length !== players.length) {
    throw new Error('تعدادِ نقش‌های این سناریو (' + roleSlots.length + ') با تعدادِ بازیکنانِ فعلی (' + players.length + ') یکی نیست.');
  }
  const shuffledRoles = shuffleArray(roleSlots);
  const shuffledPlayers = shuffleArray(players);

  // هرکدوم رو جدا آپدیت می‌کنیم (Supabase bulk-upsert با شرط‌های متفاوت ساده نیست)
  for (let i = 0; i < shuffledPlayers.length; i++) {
    const { error } = await sb
      .from('players')
      .update({ role_id: shuffledRoles[i].role_id, side: shuffledRoles[i].side })
      .eq('id', shuffledPlayers[i].id);
    if (error) throw new Error('خطا در تخصیصِ نقشِ ' + shuffledPlayers[i].display_name + ': ' + error.message);
  }
}

// ---------- به‌روزرسانیِ فازِ بازی (مثلاً از role_reveal به day) ----------
async function tjUpdatePhase(gameId, updates) {
  const { data, error } = await sb
    .from('games')
    .update(updates)
    .eq('id', gameId)
    .select()
    .single();
  if (error) throw new Error('خطا در تغییرِ فازِ بازی: ' + error.message);
  return data;
}
async function tjGetPlayer(playerId) {
  const { data, error } = await sb
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single();
  if (error) throw new Error('خطا در گرفتنِ اطلاعاتِ بازیکن: ' + error.message);
  return data;
}

// ---------- به‌روزرسانیِ state_flags یک بازیکن (merge، نه overwrite کامل) ----------
async function tjUpdatePlayerFlags(playerId, patch) {
  const current = await tjGetPlayer(playerId);
  const merged = { ...(current.state_flags || {}), ...patch };
  const { data, error } = await sb
    .from('players')
    .update({ state_flags: merged })
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw new Error('خطا در به‌روزرسانیِ وضعیتِ بازیکن: ' + error.message);
  return data;
}

// ---------- شمارشِ حذف‌شده‌های هر ساید (برای جامِ جم) ----------
async function tjCountEliminated(gameId) {
  const players = await tjListPlayers(gameId);
  const jamshidiEliminated = players.filter(p => p.side === 'jamshidi' && p.role_id !== 'jamshid' && !p.is_alive).length;
  const zahhakiEliminated = players.filter(p => p.side === 'zahhaki' && p.role_id !== 'zahhak' && !p.is_alive).length;
  return { jamshidiEliminated, zahhakiEliminated };
}

// ---------- گرفتنِ آرای پیمان/گمانِ یک روز و ساختنِ جدولِ جمع‌بندی ----------
async function tjGetDayTally(gameId, dayNumber) {
  const { data: votes, error } = await sb
    .from('day_votes')
    .select('*')
    .eq('game_id', gameId)
    .eq('day_number', dayNumber);
  if (error) throw new Error('خطا در گرفتنِ آرا: ' + error.message);

  const players = await tjListPlayers(gameId);
  const tally = {};
  players.filter(p => !p.is_host).forEach(p => {
    tally[p.id] = { id: p.id, name: p.display_name, is_alive: p.is_alive, peyman: 0, goman: 0 };
  });
  (votes || []).forEach(v => {
    if (!tally[v.target_id]) return;
    if (v.vote_type === 'peyman') tally[v.target_id].peyman += 1;
    else if (v.vote_type === 'goman') tally[v.target_id].goman += 1;
  });

  const rows = Object.values(tally).filter(r => r.is_alive);
  rows.sort((a, b) => (b.peyman - a.peyman) || (b.goman - a.goman));
  const votersCount = new Set((votes || []).map(v => v.voter_id)).size;
  return { rows, votersCount };
}

// ---------- حذفِ یک بازیکن (کشته‌ی روز یا شب) ----------
async function tjEliminatePlayer(playerId, cause, dayNumber, isNight) {
  const patch = { is_alive: false, eliminated_by: cause };
  if (isNight) patch.eliminated_on_night = dayNumber;
  else patch.eliminated_on_day = dayNumber;
  const { data, error } = await sb
    .from('players')
    .update(patch)
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw new Error('خطا در حذفِ بازیکن: ' + error.message);
  return data;
}

// ---------- ثبتِ یک رویداد در تاریخچه ----------
async function tjLogEvent(gameId, num, type, payload) {
  const { error } = await sb
    .from('events_log')
    .insert({ game_id: gameId, day_or_night_number: num, type, payload: payload || {} });
  if (error) console.error('خطا در ثبتِ رویداد:', error.message);
}

// ---------- کشته‌های یک روز/شبِ مشخص (برای اطلاعِ جاماسپ و اعلامِ صبح) ----------
async function tjGetEliminatedIn(gameId, num) {
  const players = await tjListPlayers(gameId);
  return players.filter(p => !p.is_alive && (p.eliminated_on_day === num || p.eliminated_on_night === num));
}
