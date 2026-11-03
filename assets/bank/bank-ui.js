/* بانکِ بزرگمهر — رابطِ تخت جمشید: کارتِ صفحه‌یِ اول، صفحه‌یِ بانک (ورود/ساختِ حساب/موجودی/تاریخچه/بازی‌هایِ بزرگمهر)،
   کارتِ «شرکت با دریک» در لابیِ بازیکن، و کارتِ نتیجه در پایانِ بازی. همه‌ی متنِ کاربر با textContent گذاشته می‌شود.
   ظاهر: بسته‌یِ طراحیِ takht-jamshid-bank-pack (کلاس‌هایِ bk-، شناسه‌هایِ ثابتِ #bk…). */
(function () {
  'use strict';
  const Bank = window.TJBank; if (!Bank) return;
  const fa = n => Number(n || 0).toLocaleString('fa-IR');
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  };
  const coin = (cls, size) => h('img', { class: cls || '', src: 'assets/bank/darik-96.webp', alt: '', 'aria-hidden': 'true', width: size, height: size });
  const SITE = 'https://bozorgmehr-game.ir';
  const GAMES = [
    { id: 'takht', name: 'تخت جمشید', desc: 'بازی نقش مخفی بر پایه‌یِ شاهنامه', img: 'assets/bank/bozorgmehr-logo.webp', here: true },
    { id: 'vazho', name: 'واژو', desc: 'بازیِ کارتیِ واژه‌سازیِ فارسی', img: 'assets/bank/vazho-logo.webp', web: 'https://vazho.bozorgmehr-game.ir/', apk: SITE + '/downloads/vazho.apk' },
  ];
  const TX = { welcome: 'هدیه‌یِ شروع', daily: 'پاداشِ روزانه', botwin: 'بردِ بازی با ربات', entry: 'ورودیه‌یِ بازیِ آنلاینِ واژو', reward: 'جایزه‌یِ بازیِ آنلاینِ واژو',
    'takht-entry': 'ورودیه‌یِ تخت جمشید', 'takht-win': 'سهمِ استخرِ تخت جمشید', 'takht-bonus': 'پاداشِ بازیِ خوب (تخت جمشید)', 'takht-refund': 'بازپرداختِ ورودیه‌یِ تخت جمشید' };
  const TXI = { welcome: '✦', daily: '☀', botwin: '♞', entry: '◉', reward: '♛', 'takht-entry': '◉', 'takht-win': '♛', 'takht-bonus': '✓', 'takht-refund': '↺' };
  const whoNode = u => { if (!u) return ''; const at = h('bdi', { dir: 'ltr', text: '@' + u.username }); return u.name && u.name !== u.username ? h('span', {}, u.name + ' ', at) : at; };
  const ENTRY = 5;
  const SUB_OUT = 'یک حساب، دریک‌هایِ همه‌یِ بازی‌هایِ بزرگمهر؛ با بازی کردن دریک بگیر.';

  let screen, tab = 'login', busy = false, justRegistered = null, prevScreen = 'screen-entry', histLoaded = false, netDown = false;

  /* ---------- کارتِ صفحه‌یِ اول ---------- */
  let entryBtn, entryBal, entrySub, entryArr;
  function injectEntry() {
    const footer = document.querySelector('#screen-entry .tj-footer'); if (!footer || document.getElementById('bkEntry')) return;
    entryBal = h('span', { class: 'chip', hidden: true });
    entryArr = h('span', { class: 'arr', 'aria-hidden': 'true', text: '‹' });
    entrySub = h('small', { text: SUB_OUT });
    entryBtn = h('button', { class: 'bk-open', type: 'button', id: 'bankEntryBtn', onclick: () => open() }, coin('', 48), h('span', { class: 't' }, h('b', { text: 'بانک بزرگمهر' }), entrySub), entryBal, entryArr);
    footer.parentNode.insertBefore(h('section', { id: 'bkEntry', 'aria-label': 'بانک بزرگمهر' }, entryBtn), footer);
    paintEntry();
  }
  function paintEntry() {
    if (!entryBal) return; const m = Bank.cached(), on = Bank.isLoggedIn() && m;
    entryBal.hidden = !on; entryArr.hidden = !!on; if (on) entryBal.textContent = fa(m.balance) + ' دریک';
    entrySub.textContent = on ? 'سلام ' + (m.name || m.username) + '؛ موجودیِ دریکِ همه‌یِ بازی‌هایِ بزرگمهر' : SUB_OUT;
  }

  /* ---------- صفحه‌یِ بانک ---------- */
  let elAuth, elAcct, elErr, elBal, elWho, elDaily, elHist, elForm, elRec, elDel, elNet, elSkel;
  const rule = (ic, t, d) => h('div', { class: 'bk-rule' }, h('span', { class: 'bk-ric', 'aria-hidden': 'true', text: ic }), h('p', {}, h('b', { text: t }), d));
  function injectScreen() {
    if (document.getElementById('screen-bank')) return;
    elErr = h('p', { class: 'bk-err', role: 'alert', 'aria-live': 'polite' });
    elForm = h('div');
    elAuth = h('section', { class: 'bk-card', id: 'bkAuth' },
      h('div', { class: 'bk-intro' }, coin('', 60), h('div', {}, h('h2', { text: 'ورود به بانک بزرگمهر' }), h('p', { class: 'bk-muted', text: 'یک حساب برایِ همه‌یِ بازی‌هایِ بزرگمهر. اگر در واژو حساب داری، با همان نام‌کاربری و گذرواژه وارد شو؛ دریک‌هایت همین‌جا هم هست.' }))),
      h('div', { class: 'bk-tabs', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', id: 'bkTabLogin', onclick: () => setTab('login'), text: 'ورود' }),
        h('button', { type: 'button', role: 'tab', id: 'bkTabReg', onclick: () => setTab('register'), text: 'ساختنِ حساب' })),
      elForm, elErr);
    elBal = h('b', { text: '۰' }); elWho = h('p', { class: 'bk-who', id: 'bkWho' }); elDaily = h('section', { class: 'bk-card bk-daily' }); elHist = h('ul', { class: 'bk-hist' });
    elDel = h('div', { class: 'bk-card', id: 'bkDelete' }, h('button', { class: 'bk-link dng', type: 'button', id: 'bkDelOpen', text: 'حذفِ حساب', onclick: openDelete }));
    elNet = h('div', { class: 'bk-net', role: 'alert', hidden: true }, h('span', { 'aria-hidden': 'true', text: '!' }), h('b', { text: 'به بانک وصل نشدیم' }), h('small', { text: 'اینترنت را بررسی کن و دوباره تلاش کن. موجودیِ نشان‌داده‌شده ممکن است قدیمی باشد.' }),
      h('button', { class: 'bk-btn sec', type: 'button', text: 'تلاشِ دوباره', onclick: () => refreshNow() }));
    elSkel = h('div', { class: 'bk-card bk-skel', hidden: true, 'aria-busy': 'true', 'aria-label': 'در حال بارگذاری' }, h('i'), h('i'), h('i'));
    elAcct = h('section', { id: 'bkAccount', hidden: true },
      h('div', { class: 'bk-card' }, h('div', { class: 'bk-bal' }, coin('', 78), h('div', {}, h('small', { text: 'موجودیِ شما' }), elBal, h('small', { text: 'دریک' }))), elWho),
      elDaily,
      h('div', { class: 'bk-card' }, h('h2', { text: 'تراکنش‌هایِ اخیر' }), elHist),
      h('button', { class: 'bk-btn sec', type: 'button', id: 'bkLogout', text: 'خروج از حساب', onclick: async () => { await Bank.logout(); histLoaded = false; netDown = false; render(); } }),
      elDel);
    elRec = h('section', { class: 'bk-card', id: 'bkRecovery', hidden: true });
    const how = h('section', { class: 'bk-card', id: 'bkHow' }, h('h2', { text: 'چطور دریک می‌گیرم؟' }),
      h('div', { class: 'bk-rules' },
        rule(fa(ENTRY), 'ورودیه ' + fa(ENTRY) + ' دریک', 'استخر بینِ برنده‌هایِ دارایِ حساب تقسیم می‌شود.'),
        rule('◎', 'پاداشِ بازیِ خوب', 'شناسایی، تیر، نجات و نفوذ؛ حداکثر ۳ دریک در هر بازی.'),
        rule('۶', 'سقفِ روزانه', 'حداکثر ۶ دریکِ پاداشِ عملکرد در روز.'),
        rule('✦', 'موجودیِ مشترک', 'دریک در تخت جمشید، واژو و بازی‌هایِ بعدی یکی است.')),
      h('ul', { class: 'bk-ways' },
        h('li', { text: 'ورود با حساب فقط وقتی است که خودت «شرکت با دریک» را بزنی؛ بازیِ بدونِ حساب مثلِ قبل رایگان است.' }),
        h('li', { text: 'اگر برنده‌یِ دارایِ حساب نبود، ورودیه‌ها برمی‌گردد.' }),
        h('li', { text: 'پاداشِ بازیِ خوب در بازی‌هایِ ۱۰ نفره به بالاست: گمانِ درست روی ضحاکی‌ها، تیرِ درست، نجاتِ درست، و برایِ ضحاکیان نفوذ و جلبِ اعتمادِ یارانِ جمشید.' }),
        h('li', { text: 'پاداشِ روزانه و ماموریت‌هایِ دیگر را در واژو هم می‌گیری.' })));
    const games = h('section', { class: 'bk-card', id: 'bkGames' }, h('h2', { text: 'بازی‌هایِ گروه بزرگمهر' }), h('div', { class: 'bk-games' },
      GAMES.map(g => h('div', { class: 'bk-game' }, h('img', { src: g.img, alt: 'نشانِ ' + g.name, width: 56, height: 56 }),
        h('div', {}, h('h3', { text: g.name }), h('p', { text: g.desc }),
          h('div', { class: 'row' }, g.here ? h('span', { class: 'bk-tag', text: 'همین بازی' }) : [
            h('a', { href: g.web, target: '_blank', rel: 'noopener', text: 'بازیِ تحت وب ↗' }), h('a', { href: g.apk, target: '_blank', rel: 'noopener', text: 'دانلودِ اندروید ↗' })])))),
      h('div', { class: 'bk-game' }, h('img', { src: 'assets/bank/bozorgmehr-logo.webp', alt: 'نشانِ گروه بزرگمهر', width: 56, height: 56 }), h('div', {}, h('h3', { text: 'گروه بازی‌سازیِ بزرگمهر' }), h('p', { text: 'بازی‌هایِ تازه می‌آید و دریک در همه‌شان یکی است.' }), h('div', { class: 'row' }, h('a', { href: SITE, target: '_blank', rel: 'noopener', text: 'سایتِ بزرگمهر ↗' }))))));
    screen = h('div', { class: 'screen', id: 'screen-bank', 'aria-label': 'بانک بزرگمهر' },
      h('div', { class: 'bk' },
        h('header', { class: 'bk-top' }, h('button', { class: 'bk-back', type: 'button', 'aria-label': 'بازگشت', text: '→', onclick: close }), h('h1', { text: 'بانک بزرگمهر' }), h('img', { class: 'bk-logo', src: 'assets/bank/bozorgmehr-logo.webp', alt: 'نشانِ بزرگمهر' })),
        h('div', { class: 'bk-hero', 'aria-hidden': 'true' }),
        h('div', { class: 'bk-body' }, elNet, elSkel, elAuth, elRec, elAcct, how, games)));
    const host = document.getElementById('screen-guide');
    (host ? host.parentNode : document.body).appendChild(screen);
  }
  function setErr(m) { if (elErr) { elErr.textContent = m || ''; } }
  function setTab(t) { tab = t; setErr(''); renderAuth(); }
  function field(id, label, props, hint) { return [h('label', { for: id, text: label }), h('input', { id, ...props }), hint ? h('p', { class: 'bk-hint', text: hint }) : null]; }
  function passField(label, autocomplete, hint) {
    const inp = h('input', { id: 'bkPass', type: 'password', dir: 'ltr', autocomplete, maxlength: '100' });
    const eye = h('button', { class: 'bk-eye', type: 'button', 'aria-label': 'نمایش یا پنهان‌کردنِ گذرواژه', text: '◉', onclick: () => { inp.type = inp.type === 'password' ? 'text' : 'password'; } });
    return [h('label', { for: 'bkPass', text: label }), h('div', { class: 'bk-passwrap' }, eye, inp), hint ? h('p', { class: 'bk-hint', text: hint }) : null];
  }
  function renderAuth() {
    const login = tab === 'login', reg = tab === 'register', rec = tab === 'recover';
    document.getElementById('bkTabLogin').setAttribute('aria-selected', String(login || rec));
    document.getElementById('bkTabReg').setAttribute('aria-selected', String(reg));
    const submit = h('button', { class: 'bk-btn', type: 'submit', id: 'bkSubmit', text: login ? 'ورود به بانک' : reg ? 'ساختنِ حساب' : 'تنظیمِ گذرواژه‌یِ تازه' });
    const f = h('form', { novalidate: true, onsubmit: ev => { ev.preventDefault(); submitAuth(); } },
      reg ? field('bkName', 'نامِ نمایشی (اختیاری)', { type: 'text', maxlength: '20', autocomplete: 'nickname' }) : null,
      field('bkUser', 'نام‌کاربری', { type: 'text', dir: 'ltr', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20' }, reg || rec ? '۳ تا ۲۰ حرفِ انگلیسی، رقم یا _' : null),
      rec ? field('bkCode', 'کدِ بازیابی', { type: 'text', dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' }, '۱۲ نویسه؛ هنگامِ ساختنِ حساب نشانت داده شد.') : null,
      passField(rec ? 'گذرواژه‌یِ تازه' : 'گذرواژه', login ? 'current-password' : 'new-password', login ? null : 'حداقل ۸ نویسه'),
      submit,
      login ? h('button', { class: 'bk-link', type: 'button', text: 'گذرواژه‌ام را فراموش کرده‌ام', onclick: () => setTab('recover') }) : h('button', { class: 'bk-link', type: 'button', text: 'بازگشت به ورود', onclick: () => setTab('login') }));
    elForm.replaceChildren(f);
  }
  async function submitAuth() {
    if (busy) return; setErr('');
    const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const user = v('bkUser').toLowerCase(), pass = document.getElementById('bkPass').value;
    if (!user || !pass) return setErr('نام‌کاربری و گذرواژه را بنویس.');
    busy = true; const btn = document.getElementById('bkSubmit'); btn.disabled = true;
    try {
      let d;
      if (tab === 'login') d = await Bank.login(user, pass);
      else if (tab === 'register') d = await Bank.register(user, pass, v('bkName'));
      else { const code = v('bkCode'); if (!code) { setErr('کدِ بازیابی را بنویس.'); return; } d = await Bank.recover(user, code, pass); }
      justRegistered = d.recovery || null; histLoaded = false; tab = 'login'; netDown = false;
      render(); onAccountChanged();
    } catch (e) { setErr(e.message || 'خطا'); }
    finally { busy = false; const b = document.getElementById('bkSubmit'); if (b) b.disabled = false; }
  }
  function renderRecovery() {
    if (!justRegistered) { elRec.hidden = true; return; }
    elRec.hidden = false;
    elRec.replaceChildren(h('div', { class: 'bk-seal', 'aria-hidden': 'true', text: '✦' }), h('h2', { text: 'کدِ بازیابیِ حسابت' }), h('p', { class: 'bk-muted', text: 'این کد را همین حالا جایی بنویس یا عکس بگیر. اگر گذرواژه را فراموش کنی، فقط با این کد می‌شود حساب را برگرداند و دوباره نشان داده نمی‌شود.' }),
      h('div', { class: 'bk-code', id: 'bkRecCode', text: justRegistered }),
      h('div', { class: 'bk-two' },
        h('button', { class: 'bk-btn sec', type: 'button', text: 'کپی', onclick: async ev => { try { await navigator.clipboard.writeText(justRegistered); ev.target.textContent = 'کپی شد ✓'; } catch (e) { ev.target.textContent = 'کد را دستی کپی کن'; } } }),
        h('button', { class: 'bk-btn', type: 'button', id: 'bkRecDone', text: 'کد را ذخیره کردم', onclick: () => { justRegistered = null; renderRecovery(); } })));
  }
  function renderAccount() {
    const m = Bank.cached(); if (!m) return;
    elBal.textContent = fa(m.balance); elWho.replaceChildren(whoNode(m));
    if (m.canClaim) {
      elDaily.className = 'bk-card bk-daily';
      elDaily.replaceChildren(h('div', { class: 't' }, h('b', { text: 'پاداشِ روزانه' }), h('small', { text: 'امروز آماده است' })),
        h('button', { class: 'bk-btn', type: 'button', id: 'bkDailyBtn', text: 'دریافت +' + fa(m.daily) + ' دریک', onclick: async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'در حال دریافت…'; try { await Bank.daily(); setErr(''); histLoaded = false; render(); loadHist(); } catch (e) { b.disabled = false; b.textContent = e.message || 'خطا'; } } }));
    } else {
      elDaily.className = 'bk-card bk-daily done';
      elDaily.replaceChildren(h('div', { class: 't' }, h('b', { text: 'پاداشِ روزانه' }), h('small', { text: 'پاداشِ امروز را گرفته‌ای؛ فردا دوباره بیا.' })), h('span', { class: 'tick', 'aria-hidden': 'true', text: '✓' }));
    }
  }
  function openDelete() {
    const err = h('p', { class: 'bk-err', role: 'alert' });
    const pw = h('input', { id: 'bkDelPass', type: 'password', dir: 'ltr', autocomplete: 'current-password', maxlength: '100' });
    const go = h('button', { class: 'bk-btn danger', type: 'button', id: 'bkDelGo', text: 'حذفِ دائمیِ حساب و دریک‌ها', onclick: async () => {
      if (!pw.value) { err.textContent = 'گذرواژه را بنویس.'; return; }
      go.disabled = true; err.textContent = '';
      try { await Bank.deleteAccount(pw.value); histLoaded = false; render(); } catch (e) { err.textContent = e.message || 'خطا'; go.disabled = false; }
    } });
    elDel.replaceChildren(h('h2', { text: 'حذفِ دائمیِ حساب' }), h('p', { text: 'حسابِ بانک بزرگمهر برایِ همه‌یِ بازی‌ها (تخت جمشید و واژو) و همه‌یِ دریک‌هایت برایِ همیشه پاک می‌شود و برگشت‌پذیر نیست. برایِ تأیید گذرواژه را بنویس.' }),
      h('label', { for: 'bkDelPass', text: 'گذرواژه' }), pw, err, h('div', { class: 'bk-two' }, go, h('button', { class: 'bk-btn sec', type: 'button', text: 'منصرف شدم', onclick: closeDelete })));
  }
  function closeDelete() { elDel.replaceChildren(h('button', { class: 'bk-link dng', type: 'button', id: 'bkDelOpen', text: 'حذفِ حساب', onclick: openDelete })); }
  async function loadHist() {
    if (histLoaded || !Bank.isLoggedIn()) return; histLoaded = true;
    try {
      const list = await Bank.history(); elHist.replaceChildren();
      if (!list.length) { elHist.append(h('li', { class: 'bk-muted', text: 'هنوز تراکنشی نداری.' })); return; }
      list.slice(0, 12).forEach(x => elHist.append(h('li', {}, h('span', {}, h('i', { 'aria-hidden': 'true', text: TXI[x.why] || '•' }), h('span', { class: 'tx', text: TX[x.why] || 'تراکنش' })), h('span', { class: x.d >= 0 ? 'pos' : 'neg', text: (x.d >= 0 ? '+' : '−') + fa(Math.abs(x.d)) }))));
    } catch (e) { histLoaded = false; elHist.replaceChildren(h('li', { class: 'bk-muted', text: 'تاریخچه بارگذاری نشد.' })); }
  }
  function render() {
    if (!screen) return; const logged = Bank.isLoggedIn(), on = logged && Bank.cached();
    elAuth.hidden = !!logged; elAcct.hidden = !on; elSkel.hidden = !(logged && !on); elNet.hidden = !(logged && netDown);
    if (!logged) renderAuth(); else if (on) { renderAccount(); loadHist(); if (elDel && !document.getElementById('bkDelPass')) closeDelete(); }
    renderRecovery(); paintEntry();
  }
  function refreshNow() {
    if (!Bank.isLoggedIn()) return Promise.resolve();
    return Bank.refresh().then(() => { netDown = false; render(); }).catch(() => { netDown = true; render(); });
  }
  function open() {
    injectScreen(); const cur = document.querySelector('.screen.active'); prevScreen = cur && cur.id !== 'screen-bank' ? cur.id : prevScreen;
    render(); window.go('screen-bank'); window.scrollTo(0, 0);
    refreshNow();
  }
  function close() { window.go(prevScreen || 'screen-entry'); }

  /* ---------- کارتِ لابیِ بازیکن ---------- */
  const joined = new Map();                     // gid → true | false (از extStatus)
  let lobbyCard = null, lobbyGid = null, lobbyMsg = '', lobbyBusy = false, statusBusy = false;
  const lsJoined = gid => { try { return localStorage.getItem('tj_bank_g_' + gid) === '1'; } catch (e) { return false; } };
  const lsSetJoined = gid => { try { localStorage.setItem('tj_bank_g_' + gid, '1'); } catch (e) {} };
  function ensureLobbyCard() {
    if (lobbyCard && lobbyCard.isConnected) return lobbyCard;
    const body = document.getElementById('playerLobbyBody'); if (!body) return null;
    lobbyCard = h('section', { class: 'bk-inline', id: 'bkLobby', 'aria-label': 'بازی با دریک' });
    const hint = document.getElementById('playerWaitHint'); body.insertBefore(lobbyCard, hint || null); return lobbyCard;
  }
  async function refreshStatus(gid) {
    if (statusBusy || !Bank.isLoggedIn()) return; statusBusy = true;
    try { const s = await Bank.extStatus(gid); joined.set(gid, !!s.joined); if (s.joined) lsSetJoined(gid); } catch (e) { /* بعداً */ } finally { statusBusy = false; paintLobby(); }
  }
  function paintLobby() {
    const card = ensureLobbyCard(); if (!card || !lobbyGid) return;
    const m = Bank.cached(), on = Bank.isLoggedIn() && m, gid = lobbyGid, isIn = joined.get(gid) || lsJoined(gid);
    card.classList.toggle('is-in', !!(on && isIn));
    const kids = [h('h3', {}, coin('', 30), 'بازی با دریک')];
    if (!on) {
      kids.push(h('p', { text: 'با حسابِ بانک بزرگمهر ' + fa(ENTRY) + ' دریک بگذار؛ تیمِ برنده همه‌یِ دریک‌ها را می‌برد و بازیِ خوب پاداش دارد.' }), h('button', { class: 'bk-b sec', type: 'button', text: 'ورود یا ساختنِ حساب', onclick: () => open() }), h('p', { class: 'bk-s', text: 'بدونِ حساب هم می‌توانی بازی کنی؛ فقط دریک نمی‌گیری.' }));
    } else if (isIn) {
      kids.push(h('p', { class: 'bk-ok' }, '✓ با حسابِ ', whoNode(m), ' در این بازی شرکت داری (' + fa(ENTRY) + ' دریک گذاشتی).'), h('p', { class: 'bk-s', text: 'پایانِ بازی نتیجه و پاداشت همین‌جا نشان داده می‌شود.' }));
    } else {
      const poor = m.balance < ENTRY;
      kids.push(h('p', {}, 'حسابِ ', whoNode(m), ' · موجودی: ' + fa(m.balance) + ' دریک'), h('p', { class: 'bk-s', text: 'ورودیه ' + fa(ENTRY) + ' دریک؛ تیمِ برنده همه‌یِ ورودیه‌ها را بینِ خودش تقسیم می‌کند.' }),
        h('button', { class: 'bk-b', type: 'button', id: 'bkJoinBtn', disabled: poor || lobbyBusy, text: poor ? 'دریکِ کافی نداری' : (lobbyBusy ? '…' : 'شرکت با ' + fa(ENTRY) + ' دریک'), onclick: joinWithBank }));
    }
    kids.push(h('p', { class: 'bk-e', role: 'alert', text: lobbyMsg }));
    card.replaceChildren(...kids);
  }
  async function joinWithBank() {
    if (lobbyBusy || !lobbyGid || !lobbyPid) return; lobbyBusy = true; lobbyMsg = ''; paintLobby();
    try { await Bank.extJoin(lobbyGid, lobbyPid); joined.set(lobbyGid, true); lsSetJoined(lobbyGid); }
    catch (e) { lobbyMsg = e.message || 'خطا'; }
    finally { lobbyBusy = false; paintLobby(); paintEntry(); }
  }
  let lobbyPid = null, lastLobbyAuth = null;
  function lobbyTick(game, player) {
    if (!game || !player || player.is_host) return;
    if (game.status !== 'lobby') { if (lobbyCard && lobbyCard.isConnected) lobbyCard.remove(); return; }
    lobbyGid = game.id; lobbyPid = player.id;
    const auth = Bank.isLoggedIn() ? 'in' : 'out';
    if (!lobbyCard || !lobbyCard.isConnected || lastLobbyAuth !== auth) { lastLobbyAuth = auth; paintLobby(); if (auth === 'in' && !joined.has(lobbyGid)) refreshStatus(lobbyGid); }
  }
  function onJoined() { joined.clear(); lobbyMsg = ''; lastLobbyAuth = null; if (lobbyCard) { lobbyCard.remove(); lobbyCard = null; } }
  function onAccountChanged() { lastLobbyAuth = null; joined.clear(); if (lobbyGid && Bank.isLoggedIn()) refreshStatus(lobbyGid); }

  /* ---------- پایانِ بازی ---------- */
  let resultCard = null, settleTries = 0;
  function ensureResultCard() {
    const c = document.querySelector('#screen-game-over .content'); if (!c) return null;
    if (!resultCard || !resultCard.isConnected) { resultCard = h('section', { class: 'bk-inline', id: 'bkResult', hidden: true, 'aria-live': 'polite' }); c.insertBefore(resultCard, c.firstChild); }
    return resultCard;
  }
  const PART = { ident: 'شناساییِ درست', infil: 'نفوذ و جلبِ اعتماد', shot: 'تیرِ درست', save: 'نجاتِ درست' };
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fa(Math.abs(n));
  const setTone = (c, tone) => { c.classList.remove('is-win', 'is-bad'); if (tone) c.classList.add(tone); };
  function showResult(r) {
    const c = ensureResultCard(); if (!c) return; c.hidden = false; setTone(c, null);
    const kids = [h('h3', {}, coin('', 30), 'بانک بزرگمهر')];
    if (r.status === 'open') { kids.push(h('p', {}, coin('bk-spin', 22), ' در حالِ تسویه‌یِ حساب…')); }
    else if (r.status === 'refunded') { kids.push(h('p', { text: 'این بازی تسویه نشد و ' + fa(r.paid) + ' دریکِ ورودیه به حسابت برگشت.' })); }
    else {
      const rows = [['ورودیه', r.refund ? '۰' : '−' + fa(r.paid), r.refund ? '' : 'neg', r.refund ? ' (برگشت داده شد)' : '']];
      if (!r.refund) rows.push(['سهمِ استخر (' + fa(r.pot) + ' دریک بینِ برنده‌ها)', (r.pool ? '+' : '') + fa(r.pool), r.pool ? 'pos' : '']);
      if (r.bonusParts) Object.keys(PART).forEach(k => { if (r.bonusParts[k]) rows.push([PART[k], '+' + fa(r.bonusParts[k]), 'pos']); });
      if (r.bonus < (r.bonusParts ? r.bonusParts.total : 0)) rows.push(['سقفِ روزانه‌یِ پاداش اعمال شد', '+' + fa(r.bonus) + ' دریافت', 'pos']);
      setTone(c, r.refund ? null : (r.win ? 'is-win' : 'is-bad'));
      kids.push(h('p', { class: r.win ? 'bk-ok' : '', text: r.refund ? 'برنده‌یِ دارایِ حساب نبود؛ ورودیه‌ها برگشت.' : (r.win ? 'تیمِ شما برد! سهمت از استخر به حسابت آمد.' : 'تیمِ شما نبرد؛ ورودیه از دست رفت.') }),
        h('ul', {}, rows.map(([a, b, cls, sfx]) => h('li', {}, h('span', { text: a }), h('span', { class: 'num ' + cls, text: b + (sfx || '') })))
          .concat(h('li', { class: 'net' }, h('span', { text: 'خالصِ این بازی (دریک)' }), h('span', { class: 'num ' + (r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''), text: signed(r.net) })))),
        h('p', { class: 'bk-s', text: 'موجودیِ تازه: ' + fa(r.balance) + ' دریک' }));
    }
    c.replaceChildren(...kids);
  }
  async function onGameOver(game, player) {
    if (!game || !player || player.is_host || !Bank.isLoggedIn()) return;
    const known = joined.get(game.id) || lsJoined(game.id);
    const c = ensureResultCard();
    try {
      if (!known) { const s = await Bank.extStatus(game.id); if (!s.joined) return; }
      if (c) { c.hidden = false; setTone(c, null); c.replaceChildren(h('h3', {}, coin('', 30), 'بانک بزرگمهر'), h('p', {}, coin('bk-spin', 22), ' در حالِ تسویه‌یِ حساب…')); }
      const r = await Bank.extSettle(game.id); showResult(r);
      if (r.status === 'open' && settleTries++ < 6) setTimeout(() => onGameOver(game, player), 5000);
    } catch (e) {
      if (!c) return; c.hidden = false; setTone(c, 'is-bad');
      c.replaceChildren(h('h3', {}, coin('', 30), 'بانک بزرگمهر'), h('p', { text: e.message || 'تسویه ممکن نشد' }), h('button', { class: 'bk-b sec', type: 'button', text: 'تلاشِ دوباره', onclick: () => onGameOver(game, player) }), h('p', { class: 'bk-s', text: 'اگر الان نشد، خودکار تسویه می‌شود و در بانک می‌بینی.' }));
    }
  }

  /* ---------- راه‌اندازی ---------- */
  function init() {
    injectEntry(); injectScreen();
    Bank.onChange(() => { paintEntry(); if (screen && screen.classList.contains('active')) render(); if (lobbyCard && lobbyCard.isConnected) paintLobby(); });
    if (Bank.isLoggedIn()) Bank.refresh().then(paintEntry).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.TJBankUI = { open, close, onJoined, lobbyTick, onGameOver };
  window.tjCloseBank = () => { if (screen && screen.classList.contains('active')) { close(); return true; } return false; };
})();
