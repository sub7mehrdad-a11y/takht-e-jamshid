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

// ============================================================================
//                       سروش (مکانیزمِ نامه‌نگاری)
// ============================================================================
// «پنجره‌ی سروش» با شماره‌ی روزِ فعال‌شدن شناخته می‌شه (ستونِ soroush_window_night)
// و تا پایانِ شبِ همون روز باز می‌مونه — طبقِ بخشِ ۷ سند.
//
// حریمِ خصوصی: sender_id در دیتابیس ذخیره می‌شه (برای لاگِ گرداننده) ولی هیچ‌وقت
// به گیرنده نشون داده نمی‌شه؛ نامه‌ها بی‌نامن.

// ---------- بازکردنِ پنجره‌ی سروش ----------
async function tjActivateSoroush(gameId, dayNumber) {
  const { data, error } = await sb
    .from('games')
    .update({ soroush_active_until_night: dayNumber })
    .eq('id', gameId)
    .select()
    .single();
  if (error) throw new Error('خطا در فراخوانیِ سروش: ' + error.message);
  return data;
}

// ---------- فرستادنِ نامه ----------
async function tjSendLetter(gameId, windowNight, senderId, toPlayerId, body) {
  const { data, error } = await sb
    .from('letters')
    .insert({
      game_id: gameId,
      soroush_window_night: windowNight,
      sender_id: senderId,
      addressed_to_player_id: toPlayerId,
      body,
      is_night_letter: false,
      delivered: false,
    })
    .select()
    .single();
  if (error) throw new Error('خطا در فرستادنِ نامه: ' + error.message);
  return data;
}

// ---------- نامه‌هایی که خودم توی این پنجره فرستادم (برای محدودیتِ یک نامه) ----------
async function tjMySentLetters(gameId, windowNight, senderId) {
  const { data, error } = await sb
    .from('letters')
    .select('*')
    .eq('game_id', gameId)
    .eq('soroush_window_night', windowNight)
    .eq('sender_id', senderId);
  if (error) throw new Error('خطا در خواندنِ نامه‌های فرستاده‌شده: ' + error.message);
  return data || [];
}

// ---------- صندوقِ ورودیِ من: فقط نامه‌های تحویل‌شده، بدونِ نامِ فرستنده ----------
async function tjMyInbox(gameId, playerId) {
  const { data, error } = await sb
    .from('letters')
    .select('id, body, soroush_window_night, created_at')  // sender_id عمداً انتخاب نمی‌شه
    .eq('game_id', gameId)
    .eq('addressed_to_player_id', playerId)
    .eq('delivered', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error('خطا در خواندنِ نامه‌ها: ' + error.message);
  return data || [];
}

// ---------- همه‌ی نامه‌های یک پنجره (برای گرداننده) ----------
async function tjGetLetters(gameId, windowNight) {
  const { data, error } = await sb
    .from('letters')
    .select('*')
    .eq('game_id', gameId)
    .eq('soroush_window_night', windowNight)
    .order('created_at', { ascending: true });
  if (error) throw new Error('خطا در خواندنِ نامه‌ها: ' + error.message);
  return data || [];
}

// ---------- شنودِ ضحاک: نامه‌های یک نفر، چه فرستاده چه گرفته ----------
async function tjInterceptLetters(gameId, windowNight, spiedPlayerId) {
  // اول پاک‌کردنِ شنودِ قبلی، چون ممکنه گرداننده فردِ دیگه‌ای رو انتخاب کنه
  const { error: clearErr } = await sb
    .from('letters')
    .update({ zahhak_intercepted: false })
    .eq('game_id', gameId)
    .eq('soroush_window_night', windowNight);
  if (clearErr) throw new Error('خطا در پاک‌کردنِ شنودِ قبلی: ' + clearErr.message);

  if (!spiedPlayerId) return 0;

  const all = await tjGetLetters(gameId, windowNight);
  const hit = all.filter(l => l.sender_id === spiedPlayerId || l.addressed_to_player_id === spiedPlayerId);
  for (const l of hit) {
    const { error } = await sb.from('letters').update({ zahhak_intercepted: true }).eq('id', l.id);
    if (error) throw new Error('خطا در ثبتِ شنود: ' + error.message);
  }
  return hit.length;
}

// ---------- نامه‌های شنودشده (برای ضحاک) — باز هم بدونِ نامِ فرستنده ----------
async function tjInterceptedLetters(gameId, windowNight) {
  const { data, error } = await sb
    .from('letters')
    .select('id, body, addressed_to_player_id, soroush_window_night')
    .eq('game_id', gameId)
    .eq('soroush_window_night', windowNight)
    .eq('zahhak_intercepted', true)
    .eq('delivered', true);
  if (error) throw new Error('خطا در خواندنِ نامه‌های شنودشده: ' + error.message);
  return data || [];
}

// ---------- تحویلِ نامه‌ها در پایانِ شب ----------
async function tjDeliverLetters(gameId, windowNight) {
  const { data, error } = await sb
    .from('letters')
    .update({ delivered: true })
    .eq('game_id', gameId)
    .eq('soroush_window_night', windowNight)
    .eq('delivered', false)
    .select();
  if (error) throw new Error('خطا در تحویلِ نامه‌ها: ' + error.message);
  return (data || []).length;
}

// ============================================================================
//                            فازِ شب
// ============================================================================
// نکته‌ی شماره‌گذاری: بقیه‌ی اپ شبِ N رو با همون day_number ثبت می‌کنه (ستونِ
// جداگانه‌ی night_number در جدولِ games استفاده نمی‌شه). اینجا هم همون قرارداد
// رعایت شده تا tjGetEliminatedIn و اطلاعاتِ جاماسپ درست کار کنن.

// ---------- ثبتِ یک اکشنِ شبانه (قابلِ اصلاح تا قبل از resolve) ----------
async function tjSubmitNightAction(gameId, nightNumber, actorId, actionType, targetId, targetId2, extra) {
  const row = {
    game_id: gameId,
    night_number: nightNumber,
    actor_player_id: actorId,
    action_type: actionType,
    target_player_id: targetId || null,
    target_player_id_2: targetId2 || null,
    extra: extra || {},
  };
  // اسکیما روی (game_id, night_number, actor_player_id, action_type) یکتاست،
  // پس اگه گرداننده انتخابش رو عوض کنه رکوردِ قبلی جایگزین می‌شه نه تکراری.
  const { data, error } = await sb
    .from('night_actions')
    .upsert(row, { onConflict: 'game_id,night_number,actor_player_id,action_type' })
    .select()
    .single();
  if (error) throw new Error('خطا در ثبتِ اکشنِ شب: ' + error.message);
  return data;
}

// ---------- حذفِ یک اکشنِ شبانه (وقتی گرداننده «رد شو» می‌زنه) ----------
async function tjDeleteNightAction(gameId, nightNumber, actorId, actionType) {
  const { error } = await sb
    .from('night_actions')
    .delete()
    .eq('game_id', gameId)
    .eq('night_number', nightNumber)
    .eq('actor_player_id', actorId)
    .eq('action_type', actionType);
  if (error) throw new Error('خطا در حذفِ اکشنِ شب: ' + error.message);
}

// ---------- خواندنِ همه‌ی اکشن‌های خامِ یک شب ----------
async function tjGetNightActions(gameId, nightNumber) {
  const { data, error } = await sb
    .from('night_actions')
    .select('*')
    .eq('game_id', gameId)
    .eq('night_number', nightNumber);
  if (error) throw new Error('خطا در خواندنِ اکشن‌های شب: ' + error.message);
  return data || [];
}

// ---------- ذخیره‌سازیِ نتیجه‌ی resolve ----------
// خروجیِ resolveNight() رو می‌گیره و به‌صورت ماندگار می‌نویسه: کشته‌ها، فلگ‌های
// تغییرکرده‌ی بازیکن‌ها، وضعیتِ بازی، و لاگِ رویدادها.
async function tjApplyNightResolve(gameId, nightNumber, originalPlayers, result) {
  // ۱) کشته‌ها
  for (const d of result.deaths) {
    await tjEliminatePlayer(d.playerId, d.cause, nightNumber, true);
    await tjLogEvent(gameId, nightNumber, 'death', { playerId: d.playerId, cause: d.cause });
  }

  // ۲) فلگ‌های بازیکن‌ها — فقط اونایی که واقعاً عوض شدن
  for (const updated of result.updatedPlayers) {
    const before = originalPlayers.find(p => p.id === updated.id);
    if (!before) continue;
    const a = JSON.stringify(before.state_flags || {});
    const b = JSON.stringify(updated.state_flags || {});
    if (a !== b) {
      const { error } = await sb
        .from('players')
        .update({ state_flags: updated.state_flags })
        .eq('id', updated.id);
      if (error) throw new Error('خطا در ذخیره‌ی وضعیتِ بازیکن: ' + error.message);
    }
  }

  // ۳) وضعیتِ بازی. ستونی برای zahhak_hungry_streak نداریم، پس داخلِ همون
  //    hengameh_flags نگهش می‌داریم تا نیازی به مهاجرتِ اسکیما نباشه.
  const flags = {
    ...(result.updatedGameState.hengameh_flags || {}),
    zahhak_hungry_streak: result.updatedGameState.zahhak_hungry_streak || 0,
  };
  const { error: gErr } = await sb.from('games').update({ hengameh_flags: flags }).eq('id', gameId);
  if (gErr) throw new Error('خطا در ذخیره‌ی وضعیتِ بازی: ' + gErr.message);

  // ۴) رویدادهای غیرمرگ (افسون، هنگامه، استعلام و…)
  for (const e of result.events) {
    await tjLogEvent(gameId, nightNumber, e.type === 'hengameh_start' ? 'hengameh_start' : 'statement', e);
  }
}
