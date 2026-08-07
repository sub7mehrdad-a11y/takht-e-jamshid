/**
 * تخت جمشید — موتور Resolve شب
 * -----------------------------------------------------------
 * این تابع همه‌ی night_actions یک شب رو می‌گیره و خروجی نهایی
 * (کشته‌ها + رویدادهای فعال‌شده) رو حساب می‌کنه.
 *
 * جای اجرا: کلاینتِ گرداننده (host) — چون سرور اختصاصی نداریم و
 * مدل اعتماد بازی بر پایه‌ی گرداننده‌ی انسانیه، این تابع توی مرورگرِ
 * گرداننده اجرا می‌شه و فقط نتیجه‌ی نهایی در Supabase ذخیره می‌شه.
 *
 * ورودی‌ها:
 *   players: آرایه‌ی { id, role_id, side, is_alive, state_flags }
 *   actions: آرایه‌ی night_actions همون شب { actor_player_id, action_type, target_player_id, target_player_id_2, extra }
 *   gameState: { hengameh_flags, night_number, ... }
 *
 * خروجی:
 *   { deaths: [{playerId, cause}], events: [...], updatedPlayers, updatedGameState }
 */

function findPlayer(players, id) {
  return players.find(p => p.id === id) || null;
}

function actionOf(actions, actorId, type) {
  return actions.find(a => a.actor_player_id === actorId && a.action_type === type) || null;
}

export function resolveNight(players, actions, gameState) {
  // یک کپیِ قابل‌تغییر از بازیکن‌ها می‌سازیم تا اصل داده دست‌نخورده بمونه
  const state = players.map(p => ({ ...p, state_flags: { ...p.state_flags } }));
  const events = [];
  const deaths = new Map(); // playerId -> cause

  const alive = id => {
    const p = findPlayer(state, id);
    return p && p.is_alive && !deaths.has(id);
  };

  const kill = (playerId, cause) => {
    if (!playerId || deaths.has(playerId)) return;
    const p = findPlayer(state, playerId);
    if (!p || !p.is_alive) return;

    // --- مصونیتِ بیژن: تا وقتی منیژه زنده‌ست، بیژن فقط با رأیِ روزِ جمشید حذف می‌شه ---
    if (p.role_id === 'bijan') {
      const manijeh = state.find(x => x.role_id === 'manijeh');
      const manijehAlive = manijeh && manijeh.is_alive && !deaths.has(manijeh.id);
      if (manijehAlive && cause !== 'jamshid_day_vote') {
        events.push({ type: 'immune', playerId, reason: 'bijan_protected_by_manijeh' });
        return; // نمی‌میره
      }
    }

    deaths.set(playerId, cause);
  };

  // ============================================================
  // مرحله‌ی ۱: اعمالِ افسونِ سودابه — همیشه اول، چون قابلیتِ بقیه رو باطل می‌کنه
  // ============================================================
  const enchantedPlayerIds = new Set();
  const sudabeh = state.find(p => p.role_id === 'sudabeh' && p.is_alive);
  if (sudabeh) {
    const enchantAction = actionOf(actions, sudabeh.id, 'enchant');
    if (enchantAction && enchantAction.target_player_id) {
      const target = findPlayer(state, enchantAction.target_player_id);
      const immuneToEnchant = target && ['kaveh', 'fereydun', 'siavash', 'armayil'].includes(target.role_id);
      if (target && !immuneToEnchant) {
        enchantedPlayerIds.add(target.id);
        events.push({ type: 'enchanted', playerId: target.id });
        // اگه هدف بیژن یا منیژه بود، پیوندشون رو می‌شکنیم (اثر دائمی)
        if (target.role_id === 'bijan' || target.role_id === 'manijeh') {
          target.state_flags.bond_broken = true;
          events.push({ type: 'bond_broken', playerId: target.id });
        }
      }
    }
  }
  const isEnchanted = id => enchantedPlayerIds.has(id);

  // ============================================================
  // مرحله‌ی ۲: زالِ پرِ سیمرغ — اگه استفاده شده، همه‌ی کشته‌های ضحاک این شب باطل می‌شه
  // ============================================================
  let zaalBlockActive = false;
  const zaal = state.find(p => p.role_id === 'zaal' && p.is_alive);
  if (zaal && !isEnchanted(zaal.id)) {
    const blockAction = actionOf(actions, zaal.id, 'block_all_kills');
    if (blockAction && !zaal.state_flags.zaal_feather_used) {
      zaalBlockActive = true;
      zaal.state_flags.zaal_feather_used = true;
      events.push({ type: 'zaal_feather_burned' });
    }
  }

  // ============================================================
  // مرحله‌ی ۳: انتخابِ ضحاک + نجاتِ ارمایل
  // ============================================================
  const zahhak = state.find(p => p.role_id === 'zahhak');
  const zahhakAction = zahhak ? actionOf(actions, zahhak.id, 'kill_pick_two') : null;
  let zahhakVictimId = null;
  let zahhakFedTonight = false;

  if (zahhakAction && !zaalBlockActive) {
    const t1 = zahhakAction.target_player_id;
    const t2 = zahhakAction.target_player_id_2;
    const targets = [t1, t2].filter(Boolean);

    const p1 = findPlayer(state, t1);
    const p2 = findPlayer(state, t2);

    // اگه اشتباهاً یکی از یارانِ خودش (ضحاکی) رو انتخاب کرده باشه => هیچ‌کس نمی‌میره
    const pickedOwnAlly = targets.some(id => {
      const p = findPlayer(state, id);
      return p && p.side === 'zahhaki';
    });

    const armayil = state.find(p => p.role_id === 'armayil');
    const armayilAmongTargets = armayil && targets.includes(armayil.id);

    if (pickedOwnAlly) {
      events.push({ type: 'zahhak_misfire' });
      // گرسنه می‌مونه
    } else if (armayilAmongTargets) {
      // هر دو کشته می‌شن
      targets.forEach(id => kill(id, 'zahhak_night'));
      zahhakFedTonight = deaths.has(t1) || deaths.has(t2);
    } else {
      const armayilAction = armayil && !isEnchanted(armayil.id) ? actionOf(actions, armayil.id, 'save_one_of_two') : null;
      const savedId = armayilAction ? armayilAction.target_player_id : null;
      const victimId = targets.find(id => id !== savedId) || targets[0];
      zahhakVictimId = victimId;
      kill(victimId, 'zahhak_night');
      zahhakFedTonight = deaths.has(victimId);
    }
  }

  // پیگیریِ گرسنگیِ پیاپی برای هنگامه‌ی ناتوانیِ ضحاک
  const updatedGameState = { ...gameState };
  if (zahhak) {
    const prevHungryStreak = gameState.zahhak_hungry_streak || 0;
    updatedGameState.zahhak_hungry_streak = zahhakFedTonight ? 0 : prevHungryStreak + 1;
    if (updatedGameState.zahhak_hungry_streak >= 2 && !gameState.hengameh_flags?.zahhak_incapacitated) {
      updatedGameState.hengameh_flags = { ...(gameState.hengameh_flags || {}), zahhak_incapacitated: true };
      events.push({ type: 'hengameh_start', name: 'zahhak_incapacitated' });
    }
  }

  // ============================================================
  // مرحله‌ی ۴: هومان — حدسِ نقش
  // ============================================================
  const homan = state.find(p => p.role_id === 'homan' && p.is_alive);
  if (homan && !isEnchanted(homan.id)) {
    const guessAction = actionOf(actions, homan.id, 'guess_kill_or_copy');
    if (guessAction) {
      const target = findPlayer(state, guessAction.target_player_id);
      const guessedRoleId = guessAction.extra?.guessed_role_id;
      if (target && target.role_id === guessedRoleId) {
        if (target.side === 'jamshidi' && target.role_id !== 'armayil') {
          kill(target.id, 'homan_guess');
        } else if (target.side === 'zahhaki') {
          homan.state_flags.copied_role_id = target.role_id;
          events.push({ type: 'homan_copied_ability', copiedFrom: target.role_id });
        }
      }
    }
  }

  // ============================================================
  // مرحله‌ی ۵: افراسیاب — استعلام (فقط اطلاعات، تاثیری روی مرگ‌ومیر نداره)
  // ============================================================
  const afrasiab = state.find(p => p.role_id === 'afrasiab' && p.is_alive);
  if (afrasiab && !isEnchanted(afrasiab.id)) {
    const inquiryAction = actionOf(actions, afrasiab.id, 'inquiry');
    if (inquiryAction) {
      const target = findPlayer(state, inquiryAction.target_player_id);
      if (target) {
        events.push({ type: 'inquiry_result', forPlayerId: afrasiab.id, targetId: target.id, isZahhaki: target.side === 'zahhaki' });
      }
    }
  }

  // ============================================================
  // مرحله‌ی ۶: رستم — تیرِ حدسی
  // ============================================================
  const rostam = state.find(p => p.role_id === 'rostam' && p.is_alive);
  if (rostam && !isEnchanted(rostam.id)) {
    const shootAction = actionOf(actions, rostam.id, 'guess_shoot');
    if (shootAction) {
      const target = findPlayer(state, shootAction.target_player_id);
      if (target && target.side === 'zahhaki') {
        kill(target.id, 'rostam_arrow');
      } else if (target) {
        // اشتباه زده: زره از دست می‌ره یا خودش می‌میره
        if (!rostam.state_flags.rostam_armor_used) {
          rostam.state_flags.rostam_armor_used = true;
          events.push({ type: 'rostam_lost_armor' });
        } else {
          kill(rostam.id, 'rostam_self_miss');
        }
      }
    }
  }

  // ============================================================
  // مرحله‌ی ۷: مصونیتِ زره‌ی رستم در برابرِ کشتنِ مستقیمِ ضحاک
  //   (اگه رستم همون شب هدفِ ضحاک هم بوده باشه)
  // ============================================================
  if (rostam && deaths.get(rostam.id) === 'zahhak_night' && !rostam.state_flags.rostam_armor_used) {
    rostam.state_flags.rostam_armor_used = true;
    deaths.delete(rostam.id);
    events.push({ type: 'rostam_armor_absorbed_zahhak_kill' });
  }

  // ============================================================
  // مرحله‌ی ۸: گرسیوز — فداکاریِ خودخواسته (هر لحظه، خارج از نوبت)
  //   توجه: توی UI این به‌محضِ اعلامِ گرسیوز ثبت می‌شه؛ اینجا صرفاً resolve می‌کنیم.
  // ============================================================
  const gersivaz = state.find(p => p.role_id === 'gersivaz' && p.is_alive);
  if (gersivaz) {
    const sacrificeAction = actionOf(actions, gersivaz.id, 'self_sacrifice');
    if (sacrificeAction && !gersivaz.state_flags.gersivaz_used) {
      const attempts = sacrificeAction.extra?.attempted_targets || [sacrificeAction.target_player_id];
      let successTargetId = null;
      for (const tId of attempts) {
        const t = findPlayer(state, tId);
        if (t && t.side !== 'zahhaki') { successTargetId = tId; break; }
      }
      gersivaz.state_flags.gersivaz_used = true;
      if (successTargetId) {
        kill(gersivaz.id, 'gersivaz_self');
        kill(successTargetId, 'gersivaz');
        events.push({ type: 'gersivaz_sacrifice', targetId: successTargetId });
      } else {
        events.push({ type: 'gersivaz_failed_both_zahhaki' });
      }
    }
  }

  // ============================================================
  // مرحله‌ی ۹: تریگرهای هنگامه بر اساسِ کشته‌های نهاییِ این شب
  // ============================================================
  const finalDeaths = Array.from(deaths.entries()).map(([playerId, cause]) => ({ playerId, cause }));

  finalDeaths.forEach(({ playerId, cause }) => {
    const p = findPlayer(state, playerId);
    if (!p) return;

    // کارن به‌دستِ ضحاک => هنگامه‌ی قیام (اگه کاوه زنده باشه)
    if (p.role_id === 'karen' && cause === 'zahhak_night') {
      const kaveh = state.find(x => x.role_id === 'kaveh');
      if (kaveh && kaveh.is_alive) {
        updatedGameState.hengameh_flags = { ...(updatedGameState.hengameh_flags || {}), qiam: true };
        events.push({ type: 'hengameh_start', name: 'qiam' });
      }
    }

    // سیاوش به‌دستِ ضحاک، بعد از هنگامه‌ی سیاوشان => روزِ کینِ سیاوش
    if (p.role_id === 'siavash' && cause === 'zahhak_night' && gameState.hengameh_flags?.siavashan) {
      updatedGameState.hengameh_flags = { ...(updatedGameState.hengameh_flags || {}), kin_e_siavash_day: true };
      events.push({ type: 'hengameh_start', name: 'kin_e_siavash' });
    }
  });

  // اعمالِ نهاییِ حذف روی state
  finalDeaths.forEach(({ playerId, cause }) => {
    const p = findPlayer(state, playerId);
    if (p) {
      p.is_alive = false;
      p.eliminated_by = cause;
      p.eliminated_on_night = gameState.night_number;
    }
  });

  return {
    deaths: finalDeaths,
    events,
    updatedPlayers: state,
    updatedGameState,
  };
}
