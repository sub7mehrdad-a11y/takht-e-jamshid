// تخت جمشید — تنظیمات و توابعِ کمکیِ Supabase
// این فایل باید کنارِ فایل‌های HTML باشه و قبل از اسکریپتِ خودِ صفحه لود بشه:
//   <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
//   <script src="supabase-client.js"></script>

const SUPABASE_URL = 'https://wdzfngsszluwepgomstv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WJkEk_rRAuDHySGRZuNYWQ_TRpsk1qr';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
