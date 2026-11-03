/* بانکِ بزرگمهر — کلاینتِ تخت جمشید.
   حساب و کیفِ دریک روی سرورِ واژو است و بینِ همه‌ی بازی‌هایِ بزرگمهر مشترک (WebSocket + RPC روی /ws؛ همان پروتکلِ واژو).
   تخت جمشید فقط از راهِ این فایل با بانک حرف می‌زند؛ هیچ موجودی‌ای سمتِ مشتری تعیین نمی‌شود. */
(function () {
  'use strict';
  const PROTOCOL = 2;                                           // باید با server/room.js ی واژو یکی باشد
  const cfg = { url: (window.TJ_BANK_URL || 'https://vazho.bozorgmehr-game.ir').replace(/\/$/, '') };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('tj_bank_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tj_bank_' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('tj_bank_' + k); } catch (e) {} },
  };
  let pid = LS.get('pid', null);
  if (!pid) { pid = 'tj' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); LS.set('pid', pid); }

  let ws = null, ready = null, idleTimer = null, seq = 0; const pending = new Map(), listeners = new Set();
  let me = LS.get('me', null);                                  // {username,name,balance} — نمایشِ فوریِ آخرین وضعیت
  const emit = () => listeners.forEach(f => { try { f(me); } catch (e) {} });
  const setMe = m => { me = m; if (m) LS.set('me', m); else LS.del('me'); emit(); };
  const brief = acct => acct ? { username: acct.username, name: acct.name, balance: acct.wallet ? acct.wallet.balance : (me && me.balance) || 0, canClaim: !!(acct.wallet && acct.wallet.canClaim), daily: acct.wallet ? acct.wallet.amount : 0, streak: acct.wallet ? acct.wallet.streak : 0 } : null;

  const wsUrl = () => cfg.url.replace(/^http/, 'ws') + '/ws';
  function connect() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      let settled = false, sock;
      try { sock = new WebSocket(wsUrl()); } catch (e) { ready = null; return reject(new Error('net')); }
      ws = sock;
      const fail = setTimeout(() => { if (!settled) { settled = true; try { sock.close(); } catch (e) {} ready = null; reject(new Error('net')); } }, 10000);
      sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', v: PROTOCOL, pid, name: (me && me.name) || '', feat: [], token: LS.get('token', '') || undefined }));
      sock.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'hi') {
          if (LS.get('token', '') && !m.me) { LS.del('token'); setMe(null); }          // نشستِ منقضی
          else if (m.me) setMe(brief(m.me));
          if (!settled) { settled = true; clearTimeout(fail); resolve(); }
        } else if (m.t === 'rpc') { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); m.ok ? p.res(m.d) : p.rej(Object.assign(new Error(m.msg || 'خطا'), { code: m.code })); } }
        else if (m.t === 'wallet' && me) { setMe({ ...me, balance: m.balance }); }
        else if (m.t === 'err' && m.fatal && !settled) { settled = true; clearTimeout(fail); ready = null; reject(Object.assign(new Error(m.msg || 'خطا'), { code: 'fatal' })); }
      };
      sock.onerror = () => {};
      sock.onclose = () => { if (ws === sock) { ws = null; ready = null; } pending.forEach(p => { clearTimeout(p.t); p.rej(Object.assign(new Error('اتصال به بانک قطع شد؛ دوباره تلاش کن'), { code: 'net' })); }); pending.clear(); if (!settled) { settled = true; clearTimeout(fail); reject(new Error('net')); } };
    });
    return ready;
  }
  const bumpIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { try { ws && ws.close(); } catch (e) {} ws = null; ready = null; }, 30000); };
  async function rpc(op, a) {
    try { await connect(); } catch (e) { throw Object.assign(new Error('اتصال به بانک برقرار نشد؛ اینترنت را بررسی کن'), { code: 'net' }); }
    bumpIdle();
    return new Promise((res, rej) => {
      const id = ++seq, t = setTimeout(() => { pending.delete(id); rej(Object.assign(new Error('بانک پاسخ نداد؛ دوباره تلاش کن'), { code: 'net' })); }, 15000);
      pending.set(id, { res, rej, t });
      try { ws.send(JSON.stringify({ t: 'rpc', id, op, a: a || {} })); } catch (e) { pending.delete(id); clearTimeout(t); rej(Object.assign(new Error('اتصال به بانک برقرار نشد'), { code: 'net' })); }
    });
  }
  const afterAuth = d => { LS.set('token', d.token); setMe(brief(d.me)); return d; };

  window.TJBank = {
    config: cfg,
    isLoggedIn: () => !!LS.get('token', ''),
    cached: () => me,
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    async login(username, password) { return afterAuth(await rpc('login', { username, password })); },
    async register(username, password, name) { return afterAuth(await rpc('register', { username, password, profile: { name: name || '' } })); },
    async recover(username, code, password) { return afterAuth(await rpc('recover', { username, code, password })); },
    async logout() { const t = LS.get('token', ''); try { if (t) await rpc('logout', { token: t }); } catch (e) {} LS.del('token'); setMe(null); },
    async deleteAccount(password) { await rpc('delete', { password }); LS.del('token'); setMe(null); },
    async refresh() { if (!LS.get('token', '')) return null; const d = await rpc('me'); setMe(brief(d.me)); return me; },
    async history() { return (await rpc('history')).history || []; },
    async daily() { const d = await rpc('daily'); setMe(brief(d.me)); return d; },
    /* بازی‌هایِ بیرونی (تخت جمشید) */
    async extJoin(gid, playerId) { const d = await rpc('extJoin', { game: 'takht', gid, pid: playerId }); if (me && d.balance != null) setMe({ ...me, balance: d.balance }); return d; },
    async extSettle(gid) { const d = await rpc('extSettle', { game: 'takht', gid }); if (me && d.balance != null) setMe({ ...me, balance: d.balance }); return d; },
    async extStatus(gid) { return rpc('extStatus', { game: 'takht', gid }); },
  };
})();
