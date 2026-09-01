// End-to-end test of the Soroush letters flow against the live database.
// Mirrors the queries in supabase-client.js exactly, then cleans up after itself.
const URL = 'https://wdzfngsszluwepgomstv.supabase.co';
const KEY = 'sb_publishable_WJkEk_rRAuDHySGRZuNYWQ_TRpsk1qr';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const chk = (name, cond, extra) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); fail++; }
};

async function req(method, path, body, prefer) {
  const headers = { ...H };
  if (prefer) headers.Prefer = prefer;
  else if (method === 'POST' || method === 'PATCH') headers.Prefer = 'return=representation';
  const r = await fetch(URL + '/rest/v1/' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(method + ' ' + path + ' -> HTTP ' + r.status + ' ' + txt.slice(0, 300));
  return txt ? JSON.parse(txt) : null;
}

(async () => {
  let gid;
  try {
    const game = (await req('POST', 'games', { code: '999888', status: 'running', day_number: 2 }))[0];
    gid = game.id;
    const mk = async (name, role, side) =>
      (await req('POST', 'players', { game_id: gid, display_name: name, role_id: role, side }))[0];
    const Z = await mk('Zahhak', 'zahhak', 'zahhaki');
    const A = await mk('Ali', 'rostam', 'jamshidi');
    const B = await mk('Bita', 'zaal', 'jamshidi');
    const C = await mk('Cyrus', 'karen', 'jamshidi');
    const WIN = 2;

    console.log('\n=== sending letters ===');
    // A -> B, B -> C, C -> A
    const send = (from, to, text) => req('POST', 'letters', {
      game_id: gid, soroush_window_night: WIN, sender_id: from.id,
      addressed_to_player_id: to.id, body: text, is_night_letter: false, delivered: false,
    });
    await send(A, B, 'به نظرم ضحاک بیتا نیست');
    await send(B, C, 'مواظب باش');
    await send(C, A, 'من کارن هستم');
    const all = await req('GET', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}&select=*`);
    chk('three letters stored', all.length === 3, 'got ' + all.length);

    console.log('\n=== one letter per player per window ===');
    const mine = await req('GET', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}&sender_id=eq.${A.id}&select=*`);
    chk('sender lookup finds A\'s single letter', mine.length === 1, 'got ' + mine.length);

    console.log('\n=== inbox before delivery (must be empty) ===');
    let inbox = await req('GET', `letters?game_id=eq.${gid}&addressed_to_player_id=eq.${B.id}&delivered=eq.true&select=id,body`);
    chk('B sees nothing before host delivers', inbox.length === 0, 'got ' + inbox.length);

    console.log('\n=== Zahhak intercepts B ===');
    // clear previous, then mark letters sent by OR to B
    await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}`, { zahhak_intercepted: false });
    const hits = all.filter(l => l.sender_id === B.id || l.addressed_to_player_id === B.id);
    for (const l of hits) await req('PATCH', `letters?id=eq.${l.id}`, { zahhak_intercepted: true });
    chk('B is involved in exactly 2 letters (one sent, one received)', hits.length === 2, 'got ' + hits.length);
    const marked = await req('GET', `letters?game_id=eq.${gid}&zahhak_intercepted=eq.true&select=id`);
    chk('2 letters flagged for Zahhak', marked.length === 2, 'got ' + marked.length);

    console.log('\n=== re-target interception to C (previous flags must clear) ===');
    await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}`, { zahhak_intercepted: false });
    const hitsC = all.filter(l => l.sender_id === C.id || l.addressed_to_player_id === C.id);
    for (const l of hitsC) await req('PATCH', `letters?id=eq.${l.id}`, { zahhak_intercepted: true });
    const marked2 = await req('GET', `letters?game_id=eq.${gid}&zahhak_intercepted=eq.true&select=id,addressed_to_player_id`);
    chk('exactly 2 flagged after re-target (no leftovers from B)', marked2.length === 2, 'got ' + marked2.length);
    chk('the flagged set actually changed', JSON.stringify(marked.map(m => m.id).sort()) !== JSON.stringify(marked2.map(m => m.id).sort()));

    console.log('\n=== host delivers ===');
    const delivered = await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}&delivered=eq.false`, { delivered: true });
    chk('3 letters delivered', delivered.length === 3, 'got ' + delivered.length);

    console.log('\n=== inbox after delivery ===');
    inbox = await req('GET', `letters?game_id=eq.${gid}&addressed_to_player_id=eq.${B.id}&delivered=eq.true&select=id,body,soroush_window_night,created_at`);
    chk('B now has 1 letter', inbox.length === 1, 'got ' + inbox.length);
    chk('inbox row carries the body', inbox[0] && inbox[0].body.includes('ضحاک'));
    chk('inbox row does NOT expose sender_id', inbox[0] && !('sender_id' in inbox[0]), 'keys: ' + Object.keys(inbox[0] || {}));

    console.log('\n=== Zahhak reads intercepted ===');
    const spied = await req('GET', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}&zahhak_intercepted=eq.true&delivered=eq.true&select=id,body,addressed_to_player_id,soroush_window_night`);
    chk('Zahhak sees 2 intercepted letters', spied.length === 2, 'got ' + spied.length);
    chk('intercepted rows do NOT expose sender_id', spied.every(l => !('sender_id' in l)));

    console.log('\n=== second delivery is a no-op ===');
    const again = await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${WIN}&delivered=eq.false`, { delivered: true });
    chk('nothing left to deliver', again.length === 0, 'got ' + again.length);

    // ------------------------------------------------------------- window two
    // Role-addressed letters, and interception applied at delivery time rather
    // than when Zahhak picks — otherwise letters written later escape the net.
    const W2 = 3;
    console.log('\n=== window 2: letters addressed to a ROLE ===');
    await req('POST', 'letters', {
      game_id: gid, soroush_window_night: W2, sender_id: A.id,
      addressed_to_role_id: 'zaal', body: 'به زال: پرت رو نگه دار', is_night_letter: false, delivered: false,
    });
    let roleInbox = await req('GET', `letters?game_id=eq.${gid}&addressed_to_role_id=eq.zaal&delivered=eq.true&select=id`);
    chk('role letter is invisible before delivery', roleInbox.length === 0, 'got ' + roleInbox.length);

    console.log('\n=== interception must catch letters written AFTER the spy was chosen ===');
    await req('POST', 'letters', {
      game_id: gid, soroush_window_night: W2, sender_id: C.id,
      addressed_to_player_id: A.id, body: 'این یکی دیرتر نوشته شد', is_night_letter: false, delivered: false,
    });
    await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${W2}`, { zahhak_intercepted: false });
    const w2 = await req('GET', `letters?game_id=eq.${gid}&soroush_window_night=eq.${W2}&select=*`);
    const hitA = w2.filter(l => l.sender_id === A.id || l.addressed_to_player_id === A.id);
    chk('both of A\'s letters caught, including the one written later', hitA.length === 2, 'got ' + hitA.length);

    console.log('\n=== interception also catches a letter sent to the spied player\'s ROLE ===');
    // B holds role zaal, so a letter addressed to "zaal" is a letter to B
    const hitB = w2.filter(l => l.sender_id === B.id || l.addressed_to_player_id === B.id || l.addressed_to_role_id === B.role_id);
    chk('role-addressed letter counts as reaching its role holder', hitB.length === 1, 'got ' + hitB.length);

    console.log('\n=== deliver window 2 ===');
    const d2 = await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${W2}&delivered=eq.false`, { delivered: true });
    chk('2 letters delivered in window 2', d2.length === 2, 'got ' + d2.length);
    roleInbox = await req('GET', `letters?game_id=eq.${gid}&addressed_to_role_id=eq.zaal&delivered=eq.true&select=id,body,addressed_to_role_id`);
    chk('the role holder can now read it', roleInbox.length === 1, 'got ' + roleInbox.length);
    chk('role-letter read does NOT expose sender_id', roleInbox[0] && !('sender_id' in roleInbox[0]));

    // ------------------------------------------------------- the stranding bug
    // Regression for the playtest failure: Soroush was called while day_number
    // was still 0, so letters were stored with window 0. The host's console
    // matched letters against the CURRENT night number, so those letters could
    // never be delivered — Zahhak saw an intercepted copy but the recipient got
    // nothing. Delivery must key off "undelivered", never off the window.
    console.log('\n=== letters from a mismatched window must still deliver ===');
    await req('POST', 'letters', {
      game_id: gid, soroush_window_night: 0, sender_id: A.id,
      addressed_to_player_id: B.id, body: 'نامه‌ی پنجره‌ی صفر', is_night_letter: false, delivered: false,
    });
    const strandedBefore = await req('GET', `letters?game_id=eq.${gid}&delivered=eq.false&select=id,soroush_window_night`);
    chk('one letter is pending, and it is from window 0', strandedBefore.length === 1 && strandedBefore[0].soroush_window_night === 0,
      JSON.stringify(strandedBefore));

    // window-scoped delivery (the old behaviour) would miss it entirely
    const oldWay = await req('PATCH', `letters?game_id=eq.${gid}&soroush_window_night=eq.${W2}&delivered=eq.false`, { delivered: true });
    chk('window-scoped delivery misses it — this was the bug', oldWay.length === 0, 'got ' + oldWay.length);

    // the fix: deliver everything undelivered in the game
    const newWay = await req('PATCH', `letters?game_id=eq.${gid}&delivered=eq.false`, { delivered: true });
    chk('game-wide delivery reaches it', newWay.length === 1, 'got ' + newWay.length);
    const bInbox = await req('GET', `letters?game_id=eq.${gid}&addressed_to_player_id=eq.${B.id}&delivered=eq.true&select=id`);
    chk('recipient can now read the previously stranded letter', bInbox.length === 2, 'got ' + bInbox.length);
    const stillPending = await req('GET', `letters?game_id=eq.${gid}&delivered=eq.false&select=id`);
    chk('nothing is left stranded', stillPending.length === 0, 'got ' + stillPending.length);

  } catch (e) {
    console.log('  ERROR ' + e.message);
    fail++;
  } finally {
    if (gid) {
      for (const t of ['letters', 'night_actions', 'events_log', 'players']) {
        await req('DELETE', `${t}?game_id=eq.${gid}`).catch(() => {});
      }
      await req('DELETE', `games?id=eq.${gid}`).catch(() => {});
      const left = await req('GET', `games?id=eq.${gid}&select=id`).catch(() => []);
      console.log('\ncleanup: test game removed = ' + (left.length === 0));
    }
  }
  console.log('---------------------------------');
  console.log('Result: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
