// تست‌های موتورِ حلِ شب. اجرا:  node tests/resolveNight.test.js
// resolveNight.js عمداً ESM نیست (index.html با <script src> لودش می‌کنه)،
// پس اینجا هم با eval سراسری می‌خونیمش نه require.
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'resolveNight.js'), 'utf8'));

const P = (id, role, side, flags = {}) => ({ id, display_name: id, role_id: role, side, is_alive: true, state_flags: flags });
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); fail++; }
}
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
};
const deaths = r => r.deaths.map(d => d.playerId).sort();
const gs = (o = {}) => ({ night_number: 1, hengameh_flags: {}, zahhak_hungry_streak: 0, ...o });

console.log('\n=== Zahhak & Armayil ===');
t('Armayil saves one of two; the other dies', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('a', 'armayil', 'jamshidi'), P('x', 'rostam', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [
    { actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'x', target_player_id_2: 'y' },
    { actor_player_id: 'a', action_type: 'save_one_of_two', target_player_id: 'x' },
  ], gs());
  eq(deaths(r), ['y']);
});
t('Armayil among the two targets => both die', () => {
  // filler must not be Rostam: his armor would absorb the kill (spec line 84)
  const ps = [P('z', 'zahhak', 'zahhaki'), P('a', 'armayil', 'jamshidi'), P('x', 'karen', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'a', target_player_id_2: 'x' }], gs());
  eq(deaths(r), ['a', 'x']);
});
t('Zahhak picks own ally => nobody dies (misfire)', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('af', 'afrasiab', 'zahhaki'), P('x', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'af', target_player_id_2: 'x' }], gs());
  eq(deaths(r), []);
  eq(r.events.some(e => e.type === 'zahhak_misfire'), true, 'misfire event');
});

console.log('\n=== Zaal & Sudabeh ===');
t('Zaal feather cancels all Zahhak kills', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('zl', 'zaal', 'jamshidi'), P('x', 'rostam', 'jamshidi'), P('y', 'karen', 'jamshidi')];
  const r = resolveNight(ps, [
    { actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'x', target_player_id_2: 'y' },
    { actor_player_id: 'zl', action_type: 'block_all_kills' },
  ], gs());
  eq(deaths(r), []);
  eq(r.updatedPlayers.find(p => p.id === 'zl').state_flags.zaal_feather_used, true, 'feather burned');
});
t('Armayil is immune to enchant, so his save still works (spec line 69)', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('s', 'sudabeh', 'zahhaki'), P('a', 'armayil', 'jamshidi'), P('x', 'karen', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [
    { actor_player_id: 's', action_type: 'enchant', target_player_id: 'a' },
    { actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'x', target_player_id_2: 'y' },
    { actor_player_id: 'a', action_type: 'save_one_of_two', target_player_id: 'x' },
  ], gs());
  eq(r.events.some(e => e.type === 'enchanted'), false, 'armayil must not be enchantable');
  eq(deaths(r), ['y'], 'saved x, so y dies');
});
['kaveh', 'fereydun', 'siavash', 'armayil'].forEach(role => {
  t(role + ' is immune to Sudabeh enchant (spec line 69)', () => {
    const ps = [P('s', 'sudabeh', 'zahhaki'), P('k', role, 'jamshidi')];
    const r = resolveNight(ps, [{ actor_player_id: 's', action_type: 'enchant', target_player_id: 'k' }], gs());
    eq(r.events.some(e => e.type === 'enchanted'), false, role + ' must not be enchanted');
  });
});
t('enchant DOES nullify a non-immune role (Homan) — spec line 155 worked example', () => {
  // Sudabeh enchants Homan; Homan guesses Rostam correctly => Rostam must NOT die
  const ps = [P('s', 'sudabeh', 'zahhaki'), P('h', 'homan', 'zahhaki'), P('r', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [
    { actor_player_id: 's', action_type: 'enchant', target_player_id: 'h' },
    { actor_player_id: 'h', action_type: 'guess_kill_or_copy', target_player_id: 'r', extra: { guessed_role_id: 'rostam' } },
  ], gs());
  eq(deaths(r), [], 'enchanted Homan must not kill');
});
t('enchanting Bijan breaks the Bijan-Manijeh bond (spec line 69)', () => {
  const ps = [P('s', 'sudabeh', 'zahhaki'), P('b', 'bijan', 'jamshidi'), P('m', 'manijeh', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 's', action_type: 'enchant', target_player_id: 'b' }], gs());
  eq(r.updatedPlayers.find(p => p.id === 'b').state_flags.bond_broken, true);
});

console.log('\n=== Rostam & Homan ===');
t('Rostam arrow hits a Zahhaki => kills', () => {
  const ps = [P('r', 'rostam', 'jamshidi'), P('af', 'afrasiab', 'zahhaki')];
  const r = resolveNight(ps, [{ actor_player_id: 'r', action_type: 'guess_shoot', target_player_id: 'af' }], gs());
  eq(deaths(r), ['af']);
});
t('Rostam misses => loses armor, nobody dies', () => {
  const ps = [P('r', 'rostam', 'jamshidi'), P('zl', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'r', action_type: 'guess_shoot', target_player_id: 'zl' }], gs());
  eq(deaths(r), []);
  eq(r.updatedPlayers.find(p => p.id === 'r').state_flags.rostam_armor_used, true);
});
t('Rostam misses with armor already gone => Rostam dies', () => {
  const ps = [P('r', 'rostam', 'jamshidi', { rostam_armor_used: true }), P('zl', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'r', action_type: 'guess_shoot', target_player_id: 'zl' }], gs());
  eq(deaths(r), ['r']);
});
t('Rostam armor absorbs a Zahhak kill', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('r', 'rostam', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'r', target_player_id_2: 'y' }], gs());
  eq(deaths(r), []);
  eq(r.events.some(e => e.type === 'rostam_armor_absorbed_zahhak_kill'), true);
});
t('Homan correct guess on a Jamshidi => kills', () => {
  const ps = [P('h', 'homan', 'zahhaki'), P('r', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'h', action_type: 'guess_kill_or_copy', target_player_id: 'r', extra: { guessed_role_id: 'rostam' } }], gs());
  eq(deaths(r), ['r']);
});
t('Homan wrong guess => no effect', () => {
  const ps = [P('h', 'homan', 'zahhaki'), P('r', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'h', action_type: 'guess_kill_or_copy', target_player_id: 'r', extra: { guessed_role_id: 'zaal' } }], gs());
  eq(deaths(r), []);
});

console.log('\n=== Bijan & Manijeh ===');
t('Bijan immune while Manijeh is alive', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('b', 'bijan', 'jamshidi'), P('m', 'manijeh', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'b', target_player_id_2: 'y' }], gs());
  eq(deaths(r), []);
});

console.log('\n=== Hengameh triggers ===');
t('Karen killed with Kaveh alive => qiam', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('k', 'karen', 'jamshidi'), P('kv', 'kaveh', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'k', target_player_id_2: 'y' }], gs());
  eq(deaths(r), ['k']);
  eq(r.updatedGameState.hengameh_flags.qiam, true);
});
t('Two hungry nights in a row => zahhak incapacitated', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('af', 'afrasiab', 'zahhaki'), P('x', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'af', target_player_id_2: 'x' }], gs({ zahhak_hungry_streak: 1 }));
  eq(r.updatedGameState.zahhak_hungry_streak, 2);
  eq(r.updatedGameState.hengameh_flags.zahhak_incapacitated, true);
});
t('Successful feed resets hunger streak', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('x', 'rostam', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'x', target_player_id_2: 'y' }], gs({ zahhak_hungry_streak: 1 }));
  eq(r.updatedGameState.zahhak_hungry_streak, 0);
});

console.log('\n=== Gersivaz ===');
t('Gersivaz sacrifice on a Jamshidi => both die', () => {
  const ps = [P('g', 'gersivaz', 'zahhaki'), P('r', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [{ actor_player_id: 'g', action_type: 'self_sacrifice', target_player_id: 'r' }], gs());
  eq(deaths(r), ['g', 'r']);
});
t('Gersivaz targeting a Zahhaki => no deaths', () => {
  const ps = [P('g', 'gersivaz', 'zahhaki'), P('af', 'afrasiab', 'zahhaki')];
  const r = resolveNight(ps, [{ actor_player_id: 'g', action_type: 'self_sacrifice', target_player_id: 'af' }], gs());
  eq(deaths(r), []);
});

console.log('\n=== Sudabeh charge limit (spec section 5: twice per game) ===');
t('first enchant spends charge 1', () => {
  const ps = [P('s', 'sudabeh', 'zahhaki'), P('h', 'homan', 'zahhaki')];
  const r = resolveNight(ps, [{ actor_player_id: 's', action_type: 'enchant', target_player_id: 'h' }], gs());
  eq(r.updatedPlayers.find(p => p.id === 's').state_flags.sudabeh_charges_used, 1);
  eq(r.events.some(e => e.type === 'enchanted'), true);
});
t('second enchant spends charge 2 and still works', () => {
  const ps = [P('s', 'sudabeh', 'zahhaki', { sudabeh_charges_used: 1 }), P('h', 'homan', 'zahhaki')];
  const r = resolveNight(ps, [{ actor_player_id: 's', action_type: 'enchant', target_player_id: 'h' }], gs());
  eq(r.updatedPlayers.find(p => p.id === 's').state_flags.sudabeh_charges_used, 2);
  eq(r.events.some(e => e.type === 'enchanted'), true);
});
t('third enchant is refused and charges do not grow past 2', () => {
  const ps = [P('s', 'sudabeh', 'zahhaki', { sudabeh_charges_used: 2 }), P('h', 'homan', 'zahhaki'), P('r', 'rostam', 'jamshidi')];
  const r = resolveNight(ps, [
    { actor_player_id: 's', action_type: 'enchant', target_player_id: 'h' },
    { actor_player_id: 'h', action_type: 'guess_kill_or_copy', target_player_id: 'r', extra: { guessed_role_id: 'rostam' } },
  ], gs());
  eq(r.updatedPlayers.find(p => p.id === 's').state_flags.sudabeh_charges_used, 2, 'must stay at 2');
  eq(r.events.some(e => e.type === 'enchanted'), false, 'no enchant once the ability is spent');
  eq(deaths(r), ['r'], 'Homan is therefore NOT blocked and his correct guess kills');
});

console.log('\n=== Win condition (spec section 1) ===');
// mirrors tjEvaluateWin in supabase-client.js
const W = (players) => {
  const inPlay = players.filter(p => !p.is_host);
  const j = inPlay.filter(p => p.is_alive && p.side === 'jamshidi' && p.role_id !== 'jamshid').length;
  const z = inPlay.filter(p => p.is_alive && p.side === 'zahhaki' && p.role_id !== 'zahhak').length;
  let winner = null;
  if (z === 0) winner = 'jamshidi'; else if (j === 0) winner = 'zahhaki';
  return { winner, over: winner !== null, jamshidiAlive: j, zahhakiAlive: z };
};
const dead = p => ({ ...p, is_alive: false });
t('game continues while both sides still have allies', () => {
  eq(W([P('j', 'jamshid', 'jamshidi'), P('z', 'zahhak', 'zahhaki'), P('r', 'rostam', 'jamshidi'), P('af', 'afrasiab', 'zahhaki')]).over, false);
});
t('all Zahhaki allies dead => Jamshidi wins (Zahhak himself never counts)', () => {
  eq(W([P('j', 'jamshid', 'jamshidi'), P('z', 'zahhak', 'zahhaki'), P('r', 'rostam', 'jamshidi'), dead(P('af', 'afrasiab', 'zahhaki'))]).winner, 'jamshidi');
});
t('all Jamshidi allies dead => Zahhaki wins (Jamshid himself never counts)', () => {
  eq(W([P('j', 'jamshid', 'jamshidi'), P('z', 'zahhak', 'zahhaki'), dead(P('r', 'rostam', 'jamshidi')), P('af', 'afrasiab', 'zahhaki')]).winner, 'zahhaki');
});
t('Armayil counts as Jamshidi for the win check (spec line 78)', () => {
  const w = W([P('j', 'jamshid', 'jamshidi'), P('z', 'zahhak', 'zahhaki'), P('a', 'armayil', 'jamshidi'), P('af', 'afrasiab', 'zahhaki')]);
  eq(w.jamshidiAlive, 1, 'Armayil keeps the Jamshidi side alive');
  eq(w.over, false);
});
t('neutral Sohrab counts for neither side', () => {
  const w = W([P('j', 'jamshid', 'jamshidi'), P('z', 'zahhak', 'zahhaki'), P('so', 'sohrab', 'neutral'), P('af', 'afrasiab', 'zahhaki')]);
  eq(w.jamshidiAlive, 0);
  eq(w.winner, 'zahhaki', 'a lone neutral Sohrab must not keep Jamshidi alive');
});
t('the host is never counted', () => {
  const host = { ...P('h', null, 'jamshidi'), is_host: true };
  eq(W([host, P('j', 'jamshid', 'jamshidi'), P('z', 'zahhak', 'zahhaki'), P('af', 'afrasiab', 'zahhaki')]).winner, 'zahhaki');
});

console.log('\n=== Input purity ===');
t('input players array is not mutated', () => {
  const ps = [P('z', 'zahhak', 'zahhaki'), P('x', 'rostam', 'jamshidi'), P('y', 'zaal', 'jamshidi')];
  resolveNight(ps, [{ actor_player_id: 'z', action_type: 'kill_pick_two', target_player_id: 'x', target_player_id_2: 'y' }], gs());
  eq(ps.every(p => p.is_alive), true, 'original array mutated!');
});

console.log('\n---------------------------------');
console.log('Result: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
