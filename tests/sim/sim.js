// شبیه‌ساز بازیِ کامل (ابزارِ تست؛ نیازمندِ `npm i puppeteer-core` در همین پوشه): یک گرداننده + N بازیکن، هر کدوم یک صفحهٔ واقعیِ Chrome که با DOM واقعی کار می‌کنه
// پایگاه‌داده درون‌حافظه‌ست (mockdb.js). اجرا:  node sim.js <layoutId> <seed> [maxRounds]
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { T, exec, CLIENT_JS } = require('./mockdb');

const ROOT = path.resolve(__dirname, '..', '..');   // ریشه‌ی پروژه
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LAYOUT = process.argv[2] || '12a';
const SEED = parseInt(process.argv[3] || '1', 10);
const MAX_ROUNDS = parseInt(process.argv[4] || '14', 10);
const SHOTS = path.join(require('os').tmpdir(), 'tj-sim', 'shots-' + LAYOUT + '-' + SEED);
fs.mkdirSync(SHOTS, { recursive: true });
console.log('عکس‌ها و گزارش: ' + SHOTS);

function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(SEED);
const pick = arr => arr[Math.floor(R() * arr.length)];
const chance = p => R() < p;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const issues = [];
const log = [];
function note(s) { log.push(s); console.log(s); }
function issue(where, msg, extra) { const it = { where, msg, extra }; issues.push(it); console.log('  ⚠ ISSUE [' + where + '] ' + msg + (extra ? ' :: ' + JSON.stringify(extra).slice(0, 300) : '')); }

// ---------- سرور ایستا ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});

// ---------- صفحه‌ها ----------
let browser, PORT;
const pages = {}; // name -> { page, ctx, errors }
async function newPage(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const errors = [];
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); issue(name, 'خطای جاوااسکریپت', e.message); });
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|favicon/.test(t)) { errors.push('console: ' + t); issue(name, 'console.error', t); } } });
  page.on('dialog', async d => { (pages[name].dialogs = pages[name].dialogs || []).push(d.message()); await d.accept(); });
  await page.exposeFunction('__dbcall', q => exec(q));
  await page.evaluateOnNewDocument(() => {
    const si = window.setInterval; window.setInterval = (f, ms, ...a) => si(f, ms === 2000 ? 300 : ms, ...a);
  });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.includes('unpkg.com')) return req.respond({ status: 200, contentType: 'text/javascript', body: CLIENT_JS });
    if (!u.startsWith('http://localhost:' + PORT) && !u.startsWith('data:') && !u.startsWith('blob:')) return req.abort();
    req.continue();
  });
  pages[name] = { page, ctx, errors, dialogs: [] };
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'domcontentloaded' });
  return page;
}
const P = n => pages[n].page;
async function waitFor(name, fn, arg, label, timeout = 25000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) {
    try { last = await P(name).evaluate(fn, arg); if (last) return last; } catch (e) { last = String(e).slice(0, 120); }
    await sleep(80);
  }
  const shot = path.join(SHOTS, 'timeout-' + name + '-' + Date.now() + '.png');
  try { await P(name).screenshot({ path: shot }); } catch (e) {}
  throw new Error('timeout [' + name + '] ' + label + ' last=' + JSON.stringify(last) + ' shot=' + shot);
}
const ev = (name, fn, arg) => P(name).evaluate(fn, arg);

// ---------- ابزارهای DOM ----------
const setSel = (name, id, val) => ev(name, (id, val) => { const e = document.getElementById(id); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value === val; }, [id, val].length ? { id, val } : null).catch(() => false);
async function setSelect(name, id, val) {
  return ev(name, ({ id, val }) => { const e = document.getElementById(id); if (!e) return 'noel'; e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value === val ? 'ok' : 'novalue'; }, { id, val });
}
const click = (name, sel) => ev(name, s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
const activeScreen = name => ev(name, () => (document.querySelector('.screen.active') || {}).id);

async function snap(name, tag) { try { await P(name).screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') }); } catch (e) {} }

// ---------- حالت بازی از DB (حقیقتِ مبنا) ----------
const game = () => T.games[0];
const players = () => T.players.filter(p => p.game_id === game().id);
const normals = () => players().filter(p => !p.is_host && p.role_id !== 'jamshid' && p.role_id !== 'zahhak');
const byRole = r => players().find(p => p.role_id === r);
const alive = () => players().filter(p => !p.is_host && p.is_alive);
const nameToPage = {};

function evalWin() {
  const inPlay = players().filter(p => !p.is_host);
  const j = inPlay.filter(p => p.is_alive && p.side === 'jamshidi' && p.role_id !== 'jamshid').length;
  const z = inPlay.filter(p => p.is_alive && p.side === 'zahhaki' && p.role_id !== 'zahhak').length;
  return { j, z, over: j === 0 || z === 0 };
}


async function reloadPlayer(nm, expectScreen) {
  await P(nm).reload({ waitUntil: 'domcontentloaded' });
  await waitFor(nm, e => { const a = document.querySelector('.screen.active'); return a && a.id === e; }, expectScreen, 'screen after reload ' + expectScreen, 15000)
    .catch(err => issue(nm, 'بعد از رفرش به صفحهٔ درست برنگشت', { want: expectScreen, err: String(err).slice(0, 100) }));
}

// ================= مراحل =================
async function setup() {
  const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'game-layouts.json'), 'utf8')).layouts.find(l => l.id === LAYOUT);
  const count = layout.player_count;
  await newPage('host');
  await waitFor('host', () => document.getElementById('screen-entry').classList.contains('active'), null, 'host entry');
  await ev('host', () => { document.getElementById('hostNameInput').value = 'گرداننده'; document.getElementById('createBtn').click(); });
  const code = await waitFor('host', () => { const t = document.getElementById('hostRoomCode').textContent.trim(); return /^\d{6}$/.test(t) ? t : null; }, null, 'room code');
  note('کد اتاق ' + code);
  const names = ['آرش', 'بهرام', 'پریسا', 'تهمینه', 'جمیل', 'چنگیز', 'حسین', 'خسرو', 'دارا', 'رضا', 'زهره', 'سیامک', 'شیدا', 'طوس', 'فرهاد'].slice(0, count);
  for (const n of names) {
    await newPage(n);
    nameToPage[n] = n;
    await waitFor(n, () => document.getElementById('screen-entry').classList.contains('active'), null, 'entry ' + n);
    await ev(n, ({ n, code }) => { document.getElementById('joinNameInput').value = n; document.getElementById('joinCodeInput').value = code; document.getElementById('joinBtn').click(); }, { n, code });
    await waitFor(n, () => document.getElementById('screen-player-lobby').classList.contains('active'), null, 'player lobby ' + n);
  }
  await waitFor('host', c => document.getElementById('scenarioPicker').style.display === 'block' && document.getElementById('hostPlayerCount').textContent == c, count, 'scenario picker');
  const opts = await ev('host', () => [...document.querySelectorAll('#scenarioSelect option')].map(o => o.value));
  if (!opts.includes(LAYOUT)) throw new Error('layout ' + LAYOUT + ' not in picker ' + opts);
  await setSelect('host', 'scenarioSelect', LAYOUT);
  await click('host', '#startGameBtn');
  await waitFor('host', () => document.getElementById('confirmDialog').open, null, 'confirm dialog');
  await click('host', '#acceptConfirm');
  await waitFor('host', () => document.getElementById('hostPhaseBtn').textContent.includes('شروعِ روزِ اول'), null, 'start day1 button');
  // نقش‌ها: هر بازیکن کارتش رو می‌بینه
  for (const p of players().filter(x => !x.is_host)) {
    await waitFor(p.display_name, () => document.getElementById('screen-my-role').classList.contains('active') && !!document.getElementById('roleRevealName').textContent, null, 'role screen', 15000).catch(e => issue(p.display_name, 'صفحهٔ «نقشِ تو» دیده نشد', String(e).slice(0, 100)));
    const rv = await ev(p.display_name, () => ({ img: document.getElementById('roleCardImage').getAttribute('src'), tag: document.getElementById('roleSideTag').className, name: document.getElementById('roleRevealName').textContent, desc: document.getElementById('roleRevealDesc').textContent.length, btn: document.getElementById('roleHideBtn').getAttribute('aria-pressed') }));
    if (!rv.img || !rv.img.includes('card-' + p.role_id)) issue(p.display_name, 'تصویرِ کارتِ نقش درست نیست', { role: p.role_id, img: rv.img });
    if (!rv.tag.includes(p.side)) issue(p.display_name, 'برچسبِ جناح درست نیست', { side: p.side, tag: rv.tag });
    if (!rv.name || rv.desc < 10) issue(p.display_name, 'نام/توضیحِ نقش خالی است', rv);
  }
  {
    const t = players().filter(x => !x.is_host)[0].display_name;
    await click(t, '#roleHideBtn'); await sleep(200);
    const h = await ev(t, () => ({ pressed: document.getElementById('roleHideBtn').getAttribute('aria-pressed'), src: document.getElementById('roleCardImage').getAttribute('src'), nameHidden: document.querySelector('#screen-my-role .role-copy').hidden, tagHidden: document.getElementById('roleSideTag').hidden, alt: document.getElementById('roleCardImage').alt }));
    if (h.pressed !== 'true' || !h.src.includes('role-back') || !h.nameHidden || !h.tagHidden) issue(t, 'پنهان‌کردنِ نقش درست کار نمی‌کند', h);
    if (players().some(p => p.display_name && h.alt.includes(p.display_name))) issue(t, 'alt نامِ بازیکن را لو می‌دهد', h.alt);
    await snap(t, 'role-hidden');
    await click(t, '#roleHideBtn'); await sleep(200);
    const s2 = await ev(t, () => document.getElementById('roleHideBtn').getAttribute('aria-pressed'));
    if (s2 !== 'false') issue(t, 'نشان‌دادنِ دوبارهٔ نقش کار نکرد');
    // رفرش در حینِ «نقشِ تو»: دوباره همان صفحه
    await reloadPlayer(t, 'screen-my-role');
  }
  const roles = players().filter(p => !p.is_host).map(p => p.role_id + ':' + p.side);
  note('نقش‌ها: ' + roles.join(', '));
  // درستیِ تخصیص نسبت به چیدمان
  const expect = [...layout.jamshidi_roles, ...layout.zahhaki_roles, ...layout.neutral_roles].sort().join(',');
  const got = players().filter(p => !p.is_host).map(p => p.role_id).sort().join(',');
  if (expect !== got) issue('setup', 'نقش‌های تخصیص‌یافته با چیدمان نمی‌خونه', { expect, got });
  for (const p of players().filter(x => !x.is_host)) await snap(p.display_name, 'role').catch(() => {});
}

async function expectScreens(phase) {
  // صفحه‌یِ هر بازیکن باید مناسبِ نقش و وضعیتش باشه
  await sleep(900);
  for (const p of players().filter(x => !x.is_host)) {
    const want = (!p.is_alive || p.state_flags.jailed) ? 'screen-eliminated'
      : p.role_id === 'jamshid' ? 'screen-jamshid-dash'
      : (p.role_id === 'zahhak' && phase === 'day') ? 'screen-zahhak-dash'
      : phase === 'day' ? 'screen-day-vote' : 'screen-night-wait';
    let got = await activeScreen(p.display_name);
    for (let k = 0; k < 20 && got !== want; k++) { await sleep(300); got = await activeScreen(p.display_name); }
    if (got !== want) issue(p.display_name, 'صفحه‌یِ اشتباه در ' + phase, { role: p.role_id, alive: p.is_alive, want, got });
    if (got === 'screen-eliminated') {
      const at = await ev(p.display_name, () => ({ st: document.getElementById('screen-eliminated').dataset.state, ph: document.getElementById('screen-eliminated').dataset.phase }));
      const wantSt = p.is_alive ? 'jailed' : 'eliminated';
      if (at.st !== wantSt || at.ph !== phase) issue(p.display_name, 'وضعیت/فازِ صفحهٔ بیرون‌ازبازی غلط است', { at, wantSt, phase });
    }
    if (p.is_alive && p.state_flags.jailed && got === 'screen-eliminated') {
      const tt = await ev(p.display_name, () => document.getElementById('elimTitle').textContent);
      if (!/زندانی/.test(tt)) issue(p.display_name, 'صفحهٔ زندانی عنوانِ زندان ندارد', tt);
      if (!global.SNAPPED_JAIL) { global.SNAPPED_JAIL = 1; await snap(p.display_name, 'jailed-' + phase); }
    }
    if (!p.is_alive && !global.SNAPPED_DEAD) { global.SNAPPED_DEAD = 1; await snap(p.display_name, 'eliminated-' + phase); }
  }
}

let usedSoroush = false, usedJam = false, usedAhriman = false, usedZendan = false;
async function playersVote(day) {
  const voters = normals().filter(p => p.is_alive);
  const targets = voters.map(p => p.id);
  const canVote = voters.length >= 3;
  for (const v of voters) {
    const nm = v.display_name;
    if (!canVote) {
      await waitFor(nm, () => document.getElementById('screen-day-vote').classList.contains('active') && !!document.querySelector('#dayVoteCardBody .note.block'), null, 'few-voters note', 8000).catch(e => issue(nm, 'پیامِ «بازیکنِ کم» نیامد', ''));
      continue;
    }
    await waitFor(nm, () => document.getElementById('screen-day-vote').classList.contains('active') && document.querySelectorAll('#dayVoteCardBody .player-dot').length > 0, null, 'vote screen', 15000).catch(e => issue(nm, 'صفحه‌یِ رأی نیومد', String(e).slice(0, 80)));
    const others = voters.filter(x => x.id !== v.id);
    const a = pick(others); const b = pick(others.filter(x => x.id !== a.id));
    // dead / king shouldn't be listed
    const dots = await ev(nm, () => [...document.querySelectorAll('#dayVoteCardBody .player-dot')].map(b => b.dataset.playerId));
    const bad = dots.filter(id => !others.some(o => o.id === id));
    if (bad.length) issue(nm, 'در فهرستِ رأی کسی هست که نباید باشه', bad);
    if (dots.length !== others.length) issue(nm, 'تعدادِ گزینه‌هایِ رأی', { dots: dots.length, want: others.length });
    await ev(nm, ({ a, b }) => {
      document.getElementById('dvdot_' + a).click();
      document.querySelector('#dayVoteCardBody .mode-btn[data-mode=goman]').click();
      document.getElementById('dvdot_' + b).click();
      document.getElementById('dvFinalizeBtn').click();
    }, { a: a.id, b: b.id });
    await waitFor(nm, () => !document.getElementById('dvLockedNote').hidden, null, 'vote locked', 8000).catch(e => issue(nm, 'رأی قفل نشد', ''));
  }
  // رأیِ مردگان نباید ممکن باشه — بعداً در expectScreens چک می‌شه
  const votes = T.day_votes.filter(v => v.day_number === day);
  note('  روز ' + day + ': ' + votes.length + ' رأی ثبت شد (انتظار ' + voters.length * 2 + ')');
  if (votes.length !== (canVote ? voters.length * 2 : 0)) issue('day' + day, 'تعدادِ آرا', { got: votes.length, want: voters.length * 2 });
  if (!canVote) return;
  // تابلوی آرا برای یک بازیکنِ نمونه
  const sample = voters[0].display_name;
  const board = await ev(sample, () => [...document.querySelectorAll('#voteBoardList .vb-row .vb-name')].map(e => e.textContent.replace(' (تو)', '').trim()));
  const wantNames = voters.map(p => p.display_name).sort();
  if (JSON.stringify([...board].sort()) !== JSON.stringify(wantNames)) issue(sample, 'تابلوی آرا فهرستِ اشتباه دارد', { board, wantNames });
}

async function royalPowers(day) {
  const jam = byRole('jamshid'), zah = byRole('zahhak');
  // جامِ جم
  if (!usedJam && chance(0.5)) {
    await ev(jam.display_name, () => document.getElementById('jamEJamBtn').click());
    await waitFor(jam.display_name, () => document.getElementById('powerConfirmDialog').open, null, 'jam confirm', 6000).catch(() => {});
    await click(jam.display_name, '#powerAccept');
    await waitFor(jam.display_name, () => !document.getElementById('jamEJamResult').hidden, null, 'jam result', 8000).catch(e => issue(jam.display_name, 'نتیجهٔ جامِ جم نیومد', ''));
    const shown = await ev(jam.display_name, () => [document.getElementById('jamResJ').textContent, document.getElementById('jamResZ').textContent]);
    const e = evalWin();
    if (String(e.j) !== shown[0] || String(e.z) !== shown[1]) issue('jam', 'جامِ جم عددِ اشتباه', { shown, want: [e.j, e.z] });
    usedJam = true; note('  جامِ جم: ' + shown.join('/'));
  }
  // زندان
  if (!usedZendan && chance(0.8)) {
    await ev(zah.display_name, () => document.getElementById('zahZendanBtn').click());
    await waitFor(zah.display_name, () => document.getElementById('zendanModal').open, null, 'zendan modal', 8000).catch(e => issue(zah.display_name, 'مودالِ زندان باز نشد', ''));
    const cand = await ev(zah.display_name, () => [...document.querySelectorAll('#zendanList .player-dot')].map(b => b.dataset.playerId));
    const ok = cand.every(id => { const p = players().find(x => x.id === id); return p && p.is_alive && p.role_id !== 'jamshid' && p.role_id !== 'zahhak'; });
    if (!ok) issue('zendan', 'فهرستِ زندان شاملِ ناجور', cand);
    const nightRoles = ['rostam', 'afrasiab', 'sudabeh', 'armayil', 'homan', 'zaal', 'gersivaz'];
    const withNight = normals().filter(p => p.is_alive && nightRoles.includes(p.role_id));
    const victim = pick(withNight.length && chance(0.75) ? withNight : normals().filter(p => p.is_alive));
    await ev(zah.display_name, id => { const b = document.querySelector('#zendanList .player-dot[data-player-id="' + id + '"]'); if (b) b.click(); document.getElementById('zendanConfirmBtn').click(); }, victim.id);
    await waitFor(zah.display_name, () => document.getElementById('powerConfirmDialog').open, null, 'zendan confirm', 6000).catch(() => {});
    await click(zah.display_name, '#powerAccept');
    await waitFor(zah.display_name, () => true, null, 'x').catch(() => {});
    await sleep(700);
    usedZendan = true; note('  زندان: ' + victim.display_name);
    await waitFor(victim.display_name, () => { const a = document.querySelector('.screen.active'); return a && a.id === 'screen-eliminated' && /زندانی/.test(document.getElementById('elimTitle').textContent); }, null, 'jailed screen', 8000).catch(e => issue(victim.display_name, 'صفحهٔ «زندانی شدی» نیامد', ''));
    global.JAILED = victim.id;
  }
  if (!usedAhriman && chance(0.35)) {
    await ev(zah.display_name, () => document.getElementById('zahAhrimanBtn').click());
    await waitFor(zah.display_name, () => document.getElementById('powerConfirmDialog').open, null, 'ahriman confirm', 6000).catch(() => {});
    await click(zah.display_name, '#powerAccept'); await sleep(500);
    usedAhriman = true; note('  اهریمن');
  }
  // سروش
  if (!usedSoroush && chance(0.45)) {
    await ev(jam.display_name, () => document.getElementById('jamSoroushBtn').click());
    await waitFor(jam.display_name, () => document.getElementById('powerConfirmDialog').open, null, 'soroush confirm', 6000).catch(() => {});
    await click(jam.display_name, '#powerAccept'); await sleep(900);
    usedSoroush = true; note('  سروش فرا خوانده شد');
    // چند نامه
    const writers = normals().filter(p => p.is_alive && p.role_id !== 'sohrab' && !p.state_flags.jailed);
    for (const w of writers.slice(0, 3)) {
      await waitFor(w.display_name, () => document.getElementById('soroushBar').classList.contains('show'), null, 'soroush bar', 8000).catch(e => issue(w.display_name, 'نوارِ سروش نیومد', ''));
      await ev(w.display_name, () => document.querySelector('#soroushBar button').click());
      await waitFor(w.display_name, () => document.getElementById('soroushModal').open, null, 'soroush modal', 6000).catch(() => {});
      const tos = writers.filter(x => x.id !== w.id);
      const tgt = pick(tos);
      const optionIds = await ev(w.display_name, () => [...document.querySelectorAll('#letterToPlayer option')].map(o => o.value).filter(Boolean));
      if (optionIds.some(id => !players().find(p => p.id === id).is_alive)) issue(w.display_name, 'گیرندهٔ مرده در فهرستِ نامه');
      await ev(w.display_name, id => { const s = document.getElementById('letterToPlayer'); s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); const b = document.getElementById('letterBody'); b.value = 'سلام از طرفِ یک ناشناس'; b.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('letterSendBtn').click(); }, tgt.id);
      await sleep(500);
      await ev(w.display_name, () => { const m = document.getElementById('soroushModal'); if (m.open) m.close(); });
    }
    note('  نامه‌ها: ' + T.letters.length);
  }
}

async function hostDay(day) {
  const H = 'host';
  await waitFor(H, d => document.getElementById('hostDayPanel').style.display === 'block' && document.querySelectorAll('#mahaanAccused1 option').length > 1, null, 'day panel', 15000);
  // مجلسِ مهان اجباری: بدونِ پرکردنِ مجلس نباید تصمیم باز بشه
  const aliveV = normals().filter(p => p.is_alive);
  // حالتِ تعمدی: اول همه رو خالی کن و ببین دکمه‌ها قفل می‌مونن
  await ev(H, () => ['mahaanMember1', 'mahaanMember2', 'mahaanMember3', 'mahaanAccused1', 'mahaanAccused2'].forEach(id => { const e = document.getElementById(id); e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); }));
  await sleep(200);
  if (day === 2) { await ev(H, () => document.getElementById('mahaanProblem').scrollIntoView({ block: 'center' })); await snap(H, 'mahaan-problem-d' + day); }
  const gateEmpty = await ev(H, () => ({ fin: document.getElementById('mahaanFinalAccused').disabled, kill: document.getElementById('decideKillBtn').disabled, prob: document.getElementById('mahaanProblem').textContent }));
  if (!gateEmpty.fin || !gateEmpty.kill) issue('day' + day, 'مجلس اجباری نیست: با مجلسِ خالی تصمیمِ جمشید باز است', gateEmpty);
  // مجلس: ۲ یا ۳ عضو
  const mem = [...aliveV].sort(() => R() - 0.5).slice(0, chance(0.3) ? 3 : 2);
  const accPool = [...aliveV].sort(() => R() - 0.5);
  // گاهی متهم‌ها رو عمداً از نقش‌های هنگامه‌ای بگیر
  const special = aliveV.filter(p => ['siavash', 'karen', 'sohrab', 'manijeh', 'bijan', 'esfandiar'].includes(p.role_id));
  let acc = accPool.slice(0, 2);
  if (special.length && chance(0.7)) { const s = pick(special); acc = [s, pick(aliveV.filter(p => p.id !== s.id))]; }
  // جلوگیریِ ورودیِ نامعتبر: عضو تکراری
  await setSelect(H, 'mahaanMember1', mem[0].id); await setSelect(H, 'mahaanMember2', mem[0].id);
  await sleep(150);
  const dupProb = await ev(H, () => document.getElementById('mahaanProblem').textContent);
  if (!/متفاوت/.test(dupProb)) issue('day' + day, 'عضو تکراری پذیرفته شد', dupProb);
  await setSelect(H, 'mahaanMember2', mem[1].id);
  if (mem[2]) await setSelect(H, 'mahaanMember3', mem[2].id);
  await setSelect(H, 'mahaanAccused1', acc[0].id); await setSelect(H, 'mahaanAccused2', acc[1].id);
  await sleep(250);
  const gate = await ev(H, () => ({ fin: document.getElementById('mahaanFinalAccused').disabled, opts: [...document.querySelectorAll('#mahaanFinalAccused option')].map(o => o.value).filter(Boolean), prob: document.getElementById('mahaanProblem').textContent }));
  if (gate.fin) issue('day' + day, 'با مجلسِ کامل هم متهمِ نهایی قفل است', gate);
  // فهرستِ انتخاب نباید شاملِ پادشاهان باشد
  const allOpts = await ev(H, () => [...document.querySelectorAll('#mahaanAccused1 option')].map(o => o.value).filter(Boolean));
  const kings = ['jamshid', 'zahhak'].map(r => byRole(r).id);
  if (allOpts.some(id => kings.includes(id))) issue('day' + day, 'پادشاه در فهرستِ متهم‌ها هست');
  if (allOpts.some(id => !players().find(p => p.id === id).is_alive)) issue('day' + day, 'مرده در فهرستِ متهم‌ها هست');
  return { mem, acc };
}

async function dayDecision(day, ctx) {
  const H = 'host';
  const kin = !!game().hengameh_flags.kin_e_siavash_day;
  const kills = kin ? 2 : 1;
  for (let k = 0; k < kills; k++) {
    if (evalWin().over) break;
    const pool = normals().filter(p => p.is_alive && (k === 0 ? ctx.acc.some(a => a.id === p.id) : true));
    if (k > 0) {
      // نفرِ دوم: متهم‌ها رو دوباره انتخاب کن
      const aliveV = normals().filter(p => p.is_alive);
      if (aliveV.length < 2) break;
      const two = [...aliveV].sort(() => R() - 0.5).slice(0, 2);
      await setSelect(H, 'mahaanAccused1', two[0].id); await setSelect(H, 'mahaanAccused2', two[1].id);
      ctx.acc = two;
    }
    const cand = ctx.acc.filter(a => players().find(p => p.id === a.id).is_alive);
    const target = pick(cand.length ? cand : ctx.acc);
    await setSelect(H, 'mahaanFinalAccused', target.id);
    const tp = players().find(p => p.id === target.id);
    const wantKill = chance(0.8);
    await click(H, wantKill ? '#decideKillBtn' : '#decideSpareBtn');
    await sleep(150);
    const st = await ev(H, () => ({ nosh: document.getElementById('noshdaruBox').style.display, blocked: document.getElementById('noshdaruBlocked').style.display, apply: document.getElementById('applyKillBtn').disabled, note: document.getElementById('dayResultNote').textContent }));
    // زندانی نباید قابلِ کشتن باشد
    if (wantKill && tp.state_flags.jailed) {
      if (!st.apply) issue('day' + day, 'زندانی قابلِ کشتن است', st);
      else note('  ✓ زندانی کشته نشد: ' + st.note.slice(0, 50));
      await click(H, '#decideSpareBtn'); await sleep(100);
    }
    const noshAllowed = !(tp.role_id === 'sohrab' || kin);
    if (wantKill && !tp.state_flags.jailed) {
      if (noshAllowed && st.nosh !== 'block') issue('day' + day, 'کادرِ نوشدارو باید باز باشه', st);
      if (!noshAllowed && st.nosh === 'block') issue('day' + day, 'نوشدارو نباید باز باشه (سهراب/کین)', { role: tp.role_id, kin, st });
      if (st.nosh === 'block' && chance(0.3)) await click(H, '#noshdaruCheck');
    }
    const before = tp.is_alive, hf = { ...game().hengameh_flags };
    const wasSiavash = tp.role_id === 'siavash' && !tp.state_flags.siavash_returned;
    await click(H, '#applyKillBtn');
    await sleep(900);
    const after = players().find(p => p.id === target.id);
    const noteTxt = await ev(H, () => document.getElementById('dayResultNote').textContent);
    note('  روز ' + day + ' تصمیم: ' + (wantKill ? 'بکشدش' : 'نکشدش') + ' ← ' + tp.display_name + '(' + tp.role_id + ') -> ' + (after.is_alive ? 'زنده' : 'حذف') + ' | ' + noteTxt.slice(0, 80));
    // درستیِ نتیجه
    const saved = wantKill && st.nosh === 'block' && (await ev(H, () => document.getElementById('noshdaruCheck').checked));
    const jailedBlock = wantKill && tp.state_flags.jailed;
    const shouldDie = wantKill && !saved && !jailedBlock && !wasSiavash;
    if (shouldDie && after.is_alive) issue('day' + day, 'باید حذف می‌شد ولی نشد', { role: tp.role_id });
    if (!shouldDie && !after.is_alive) issue('day' + day, 'نباید حذف می‌شد', { role: tp.role_id, wantKill, saved, jailedBlock, wasSiavash });
    if (wasSiavash && wantKill && !saved && !jailedBlock) {
      const g = game().hengameh_flags;
      if (!g.siavashan) issue('day' + day, 'هنگامهٔ سیاوشان ثبت نشد', g);
      if (!players().find(p => p.id === target.id).state_flags.siavash_returned) issue('day' + day, 'siavash_returned ثبت نشد');
    }
    if (shouldDie && tp.role_id === 'manijeh') { const bj = byRole('bijan'); if (bj && game().hengameh_flags && !tp.state_flags.bond_broken && bj.is_alive) issue('day' + day, 'بیژن باید همراهِ منیژه می‌رفت'); }
    if (shouldDie && tp.role_id === 'karen' && !game().hengameh_flags.kudeta) issue('day' + day, 'کودتا ثبت نشد');
    if (shouldDie && tp.role_id === 'sohrab' && tp.side === 'neutral' && !game().hengameh_flags.jang) issue('day' + day, 'جنگ ثبت نشد');
    if (game().status === 'ended') return;
  }
}

async function endDay(day) {
  const H = 'host';
  const wasDay4 = day === 4;
  const arj = byRole('arjasb'), esf = byRole('esfandiar');
  const expectArjDie = wasDay4 && arj && arj.is_alive && esf && esf.is_alive;
  const preJailed = players().filter(p => p.state_flags.jailed).length;
  await click(H, '#hostPhaseBtn');
  await waitFor(H, () => document.getElementById('hostNightPanel').style.display === 'block', null, 'night panel', 15000).catch(e => issue('day' + day, 'پنلِ شب باز نشد', String(e).slice(0, 80)));
  if (wasDay4 && arj) {
    const dead = !players().find(p => p.id === arj.id).is_alive;
    if (expectArjDie && !dead) issue('day4', 'ارجاسب باید پایانِ روزِ چهارم می‌مرد');
    if (!expectArjDie && arj.is_alive === false) { /* already dead */ }
    if (expectArjDie) { const others = players().filter(p => !p.is_alive && p.eliminated_by === 'esfandiar_seven_khan'); if (others.length !== 1) issue('day4', 'هفت‌خان باید فقط یک نفر را بکشد', others.map(o => o.role_id)); }
  }
  if (game().hengameh_flags.kin_e_siavash_day) issue('day' + day, 'روزِ کینِ سیاوش بعدِ پایانِ روز پاک نشد');
}

// ---------- شب ----------
const NIGHT_ORDER = ['sudabeh', 'zahhak', 'armayil', 'afrasiab', 'homan', 'rostam', 'zaal', 'gersivaz'];
async function nightPhase(night) {
  const H = 'host';
  await waitFor(H, () => document.querySelectorAll('#nightCards .night-card').length > 0 || document.getElementById('nightProgressLabel').textContent.includes('0 از 0'), null, 'night cards', 15000);
  const cards = await ev(H, () => [...document.querySelectorAll('#nightCards .night-card')].map(c => c.id.replace('ncard_', '')));
  note('  شب ' + night + ' کارت‌ها: ' + cards.join(' ← '));
  const jailedNow = players().filter(p => p.is_alive && p.state_flags.jailed);
  if (jailedNow.length) {
    const jn = await ev(H, () => ({ shown: document.getElementById('jailedNightNote').style.display, text: document.getElementById('jailedNightNote').textContent }));
    if (jn.shown !== 'block' || !jailedNow.every(j => jn.text.includes(j.display_name))) issue('night' + night, 'یادداشتِ زندانی در کنسولِ شب نیست', jn);
    jailedNow.forEach(j => { if (cards.includes(j.role_id)) issue('night' + night, 'زندانی کارتِ شب دارد', j.role_id); });
    await ev(H, () => document.getElementById('jailedNightNote').scrollIntoView({ block: 'center' })); await snap(H, 'jailed-note-n' + night);
    note('  ⛓ زندانیِ امشب: ' + jailedNow.map(j => j.display_name + '(' + j.role_id + ')').join('، '));
    global.JAILED_NIGHT = jailedNow.map(j => j.id);
  } else global.JAILED_NIGHT = [];
  // ترتیبِ بیداری: سودابه اول
  const sorted = [...cards].sort((a, b) => NIGHT_ORDER.indexOf(a) - NIGHT_ORDER.indexOf(b));
  if (JSON.stringify(sorted) !== JSON.stringify(cards)) issue('night' + night, 'ترتیبِ کارت‌هایِ شب درست نیست', { cards });
  if (cards.includes('sudabeh') && cards[0] !== 'sudabeh') issue('night' + night, 'سودابه اول نیست', cards);
  // کارتِ نقش‌هایِ زنده؛ هر کارت باید بازیکنِ زنده داشته باشد و برعکس
  const expectRoles = NIGHT_ORDER.filter(r => {
    const a = byRole(r); if (!a || !a.is_alive || a.state_flags.jailed) return false;
    if ((r === 'zahhak' || r === 'armayil') && game().hengameh_flags.zahhak_incapacitated) return false;
    if (r === 'zaal' && a.state_flags.zaal_feather_used) return false;
    if (r === 'gersivaz' && a.state_flags.gersivaz_used) return false;
    if (r === 'sudabeh' && (a.state_flags.sudabeh_charges_used || 0) >= 2) return false;
    if (r === 'rostam' && (a.state_flags.rostam_arrows_used || 0) >= 2) return false;
    return true;
  });
  if (JSON.stringify(expectRoles) !== JSON.stringify(cards)) issue('night' + night, 'کارت‌هایِ شب با نقش‌هایِ فعال نمی‌خونه', { cards, expectRoles });
  // سهراب
  const sb = await ev(H, () => document.getElementById('sohrabNightBox').style.display);
  const sohrab = byRole('sohrab');
  const sohrabShould = sohrab && sohrab.is_alive && sohrab.side === 'neutral' && night >= 3;
  if ((sb === 'block') !== !!sohrabShould) issue('night' + night, 'کارتِ سهراب', { shown: sb, should: sohrabShould });
  if (sohrabShould) {
    const side = chance(0.5) ? 'jamshidi' : 'zahhaki';
    await ev(H, () => document.getElementById('sohrabNightBox').scrollIntoView({ block: 'center' })); await snap(H, 'sohrab-wait');
    await click(H, side === 'jamshidi' ? '#sohrabJamshidiBtn' : '#sohrabZahhakiBtn');
    await waitFor(H, () => document.getElementById('confirmDialog').open, null, 'sohrab confirm', 6000).catch(() => {});
    await click(H, '#acceptConfirm'); await sleep(700);
    await snap(H, 'sohrab-done');
    const sv = await ev(H, () => ({ res: document.getElementById('sohrabNightBox').dataset.result, st: document.getElementById('sohrabStatus').textContent, dis: [document.getElementById('sohrabJamshidiBtn').disabled, document.getElementById('sohrabZahhakiBtn').disabled], sel: [...document.querySelectorAll('#sohrabNightBox .nc-btn.selected')].map(b => b.id), noteCls: document.getElementById('sohrabNote').className }));
    if (sv.res !== side || !sv.dis[0] || !sv.dis[1] || sv.sel.length !== 1 || !/ok/.test(sv.noteCls)) issue('night' + night, 'ظاهرِ کارتِ سهراب بعد از ثبت درست نیست', sv);
    if (players().find(p => p.id === sohrab.id).side !== side) issue('night' + night, 'پیوستنِ سهراب ثبت نشد');
    else note('  سهراب به ' + side + ' پیوست');
  }
  // انتخاب‌ها
  const alvN = normals().filter(p => p.is_alive);
  const aliveAll = alive();
  const sel = { };
  for (const role of cards) {
    const actor = byRole(role);
    const opts = await ev(H, r => ({ s1: [...document.querySelectorAll('#ncard_' + r + ' select[id^=nsel1_] option')].map(o => o.value).filter(Boolean), s2: [...document.querySelectorAll('#ncard_' + r + ' select[id^=nsel2_] option')].map(o => o.value).filter(Boolean), g: [...document.querySelectorAll('#ncard_' + r + ' #nguess_' + r + ' option')].map(o => o.value).filter(Boolean) }), role);
    // اعتبارِ گزینه‌ها
    [...opts.s1, ...opts.s2].forEach(id => { const p = players().find(x => x.id === id); if (!p || !p.is_alive) issue('night' + night, role + ': گزینهٔ مرده', id); if (p && p.state_flags.jailed) issue('night' + night, role + ': زندانی در فهرستِ هدف', p.role_id); if (['zahhak', 'rostam', 'homan', 'gersivaz'].includes(role) && ['jamshid', 'zahhak'].includes(p.role_id)) issue('night' + night, role + ': پادشاه در فهرستِ هدف', p.role_id); if (id === actor.id) issue('night' + night, role + ': خودش در فهرست', ''); });
    if (role === 'zahhak') {
      const nonAllies = opts.s1.filter(id => players().find(p => p.id === id).side !== 'zahhaki');
      const pool = (chance(0.85) && nonAllies.length >= 2) ? nonAllies : opts.s1;
      const a = pick(pool); const b = pick(pool.filter(x => x !== a));
      await setSelect(H, 'nsel1_zahhak', a); await setSelect(H, 'nsel2_zahhak', b); sel.zahhak = [a, b];
    } else if (role === 'armayil') {
      await sleep(150);
      const chips = await ev(H, () => [...document.querySelectorAll('#narm_choices .nc-chip')].length);
      if (sel.zahhak && chips !== 2) issue('night' + night, 'ارمایل باید دو چیپ ببیند', chips);
      if (chips && chance(0.85)) { await ev(H, () => document.querySelectorAll('#narm_choices .nc-chip')[Math.floor(Math.random() * 2)].click()); }
      else await ev(H, () => { const b = [...document.querySelectorAll('#ncard_armayil .nc-btn')][0]; if (b) b.click(); });
    } else if (role === 'homan') {
      if (chance(0.3)) { await ev(H, () => document.querySelector('#ncard_homan .nc-btn').click()); }
      else {
        const t = pick(opts.s1); const tp = players().find(p => p.id === t);
        const guess = chance(0.4) ? tp.role_id : pick(opts.g);
        await setSelect(H, 'nsel1_homan', t); await setSelect(H, 'nguess_homan', guess);
      }
    } else if (role === 'zaal') {
      await click(H, chance(0.3) ? '#ntog_yes_zaal' : '#ntog_no_zaal');
    } else {
      // sudabeh, afrasiab, rostam, gersivaz
      if (role === 'sudabeh' && process.env.FORCE === 'enchantZ') {
        const zid = byRole('zahhak').id;
        if (!opts.s1.includes(zid)) issue('night' + night, 'ضحاک در فهرستِ افسونِ سودابه نیست');
        await setSelect(H, 'nsel1_sudabeh', zid); sel.sudabeh = zid; global.ENCHZ = (global.ENCHZ || 0) + 1;
      } else if (['sudabeh', 'rostam', 'gersivaz'].includes(role) && chance(role === 'gersivaz' ? 0.85 : 0.35)) { await ev(H, r => document.querySelector('#ncard_' + r + ' .nc-btn').click(), role); }
      else {
        let t = pick(opts.s1);
        if (role === 'rostam' && chance(0.6)) { const zs = opts.s1.filter(id => players().find(p => p.id === id).side === 'zahhaki'); if (zs.length) t = pick(zs); }
        await setSelect(H, 'nsel1_' + role, t); sel[role] = t;
      }
    }
    await sleep(120);
    if (role === 'zahhak' && sel.sudabeh === byRole('zahhak').id) {
      await ev(H, () => document.getElementById('ncard_zahhak').scrollIntoView({ block: 'center' })); await snap(H, 'enchant-note-n' + night);
      const zn = await ev(H, () => document.getElementById('nans_zahhak').textContent);
      if (!/افسون شده/.test(zn)) issue('night' + night, 'یادآوریِ افسونِ ضحاک در کارتش نیست', zn);
    }
    // جوابِ فوری
    const ans = await ev(H, r => { const e = document.getElementById('nans_' + r); return e ? e.textContent.trim() : null; }, role);
    if (ans) note('    ' + role + ' پاسخِ فوری: ' + ans.replace(/\s+/g, ' ').slice(0, 90));
  }
  // همهٔ کارت‌ها ثبت/رد شده؟
  const prog = await ev(H, () => ({ label: document.getElementById('nightProgressLabel').textContent, dis: document.getElementById('nightResolveBtn').disabled }));
  if (prog.dis) {
    const states = await ev(H, () => [...document.querySelectorAll('#nightCards .night-card')].map(c => c.id + ':' + c.querySelector('.nc-status').textContent));
    issue('night' + night, 'دکمهٔ حلِ شب باز نشد', { prog, states });
    await snap(H, 'nightstuck' + night);
    // رد کردنِ همه‌ی کارت‌ها برایِ ادامه
    for (const r of cards) await ev(H, r => { const b = document.querySelector('#ncard_' + r + ' .nc-btn'); if (b) b.click(); }, r).catch(() => {});
    await sleep(300);
  }
  if (night === 3 && process.env.NORELOAD !== '1') {
    const before = await ev(H, () => [...document.querySelectorAll('#nightCards .night-card')].map(c => c.id + ':' + c.querySelector('.nc-status').textContent));
    await P(H).reload({ waitUntil: 'domcontentloaded' });
    await waitFor(H, () => document.querySelectorAll('#nightCards .night-card').length > 0 || document.getElementById('nightProgressLabel').textContent.includes('0 از 0'), null, 'night cards after reload', 15000).catch(e => issue('host', 'بعد از رفرش کارت‌هایِ شب برنگشت', String(e).slice(0, 80)));
    await sleep(800);
    const afterC = await ev(H, () => [...document.querySelectorAll('#nightCards .night-card')].map(c => c.id + ':' + c.querySelector('.nc-status').textContent));
    // کارت‌هایی که «رد شد» بودند بعد از رفرش «در انتظار» می‌شن (اکشنی ذخیره نشده)؛ ثبت‌شده‌ها باید بمونن
    if (JSON.stringify(before) !== JSON.stringify(afterC)) issue('night' + night, 'بعد از رفرشِ گرداننده وضعیتِ کارت‌ها عوض شد (ثبت‌ها/ردشده‌ها)', { before, afterC });
    else note('  (رفرشِ گرداننده در شب؛ وضعیتِ همهٔ کارت‌ها، از جمله ردشده‌ها، برگشت)');
  }
  // ذخیره‌شدنِ اکشن‌ها در DB
  const acts = T.night_actions.filter(a => a.night_number === night);
  note('  اکشن‌هایِ ثبت‌شده: ' + acts.map(a => a.action_type).join(','));
  const pre = JSON.parse(JSON.stringify(players()));
  const prevGameFlags = JSON.parse(JSON.stringify(game().hengameh_flags));
  await click(H, '#nightResolveBtn');
  await waitFor(H, () => document.getElementById('nightResultBox').style.display === 'block', null, 'night result', 15000).catch(e => issue('night' + night, 'نتیجهٔ شب نیومد', String(e).slice(0, 80)));
  await sleep(500);
  const announce = await ev(H, () => document.getElementById('nightAnnounceText').textContent);
  await ev(H, () => document.getElementById('revealResult').click());
  const resultTxt = await ev(H, () => document.getElementById('nightResultBody').innerText);
  const jamasp = await ev(H, () => document.getElementById('jamaspInfo').innerText);
  const newDead = players().filter(p => !p.is_alive && pre.find(q => q.id === p.id).is_alive);
  (global.JAILED_NIGHT || []).forEach(id => { if (newDead.some(d => d.id === id)) issue('night' + night, 'زندانی در شب کشته شد!', players().find(p => p.id === id).role_id); });
  note('  شب ' + night + ' کشته‌ها: ' + (newDead.map(d => d.display_name + '(' + d.role_id + ':' + d.eliminated_by + ')').join(', ') || '—'));
  note('    اعلام: ' + announce);
  // اعلام باید دقیقاً نامِ کشته‌ها باشد
  const annNames = newDead.map(d => d.display_name);
  if (newDead.length && !annNames.every(n => announce.includes(n))) issue('night' + night, 'اعلامِ صبح نامِ همهٔ کشته‌ها را ندارد', { announce, annNames });
  if (!newDead.length && !/کسی از بازی خارج نشد/.test(announce)) issue('night' + night, 'اعلامِ «کسی خارج نشد» نیامد', announce);
  if (newDead.some(d => ['jamshid', 'zahhak'].includes(d.role_id))) issue('night' + night, 'پادشاه در شب کشته شد!', newDead.map(d => d.role_id));
  // جاماسپ: فقط نقش، نه اسم
  if (newDead.length) { newDead.forEach(d => { if (jamasp.includes(d.display_name)) issue('night' + night, 'اطلاع جاماسپ نام دارد', jamasp); }); }
  // گرسنگیِ ضحاک
  const ng = game().hengameh_flags;
  const zahDied = newDead.some(d => d.eliminated_by === 'zahhak_night');
  note('    گرسنگی: streak=' + ng.zahhak_hungry_streak + ' incap=' + !!ng.zahhak_incapacitated + ' feed=' + zahDied);
  // سودابه و ضحاک افسون‌شده
  const enc = T.events_log.filter(e => e.day_or_night_number === night && e.payload && e.payload.type === 'zahhak_enchanted').length;
  if (enc) note('    ★ ضحاک افسون شد و گرسنه موند');
  if (sel.sudabeh && sel.sudabeh === byRole('zahhak').id) {
    if (!enc) issue('night' + night, 'رویدادِ zahhak_enchanted ثبت نشد');
    if (zahDied) issue('night' + night, 'ضحاکِ افسون‌شده کشت!');
    if (!/ضحاک افسون شد/.test(resultTxt)) issue('night' + night, 'نتیجهٔ محرمانه ضحاکِ افسون‌شده را نمی‌گوید', resultTxt.slice(0, 120));
  }
  // تحویلِ نامه‌ها
  if (T.letters.some(l => !l.delivered)) {
    const boxShown = await ev(H, () => document.getElementById('soroushNightBox').style.display);
    if (boxShown !== 'block') issue('night' + night, 'نامه‌ها هست ولی جعبهٔ تحویل پنهان است');
    else { await click(H, '#deliverLettersBtn'); await sleep(900); if (T.letters.some(l => !l.delivered)) issue('night' + night, 'نامه‌ها تحویل نشد'); }
  }
  if (night === 4 && process.env.NORELOAD !== '1' && game().status !== 'ended') {
    const snapN = JSON.stringify([players().map(p => [p.id, p.is_alive, p.state_flags]), game().hengameh_flags]);
    await P(H).reload({ waitUntil: 'domcontentloaded' });
    await waitFor(H, () => document.getElementById('hostNightPanel').style.display === 'block', null, 'host night after resolve reload', 15000).catch(() => issue('host', 'پنلِ شب بعد از رفرش برنگشت', ''));
    await sleep(1200);
    const st = await ev(H, () => ({ box: document.getElementById('nightResultBox').style.display, ann: document.getElementById('nightAnnounceText').textContent, btn: document.getElementById('nightResolveBtn').disabled, jam: document.getElementById('jamaspBox').style.display }));
    const nm = t => t.replace(/ دیشب.*/, '').split(' و ').sort().join(',');
    if (st.box !== 'block' || nm(st.ann) !== nm(announce)) issue('night' + night, 'نتیجه/اعلامِ شب بعد از رفرش برنگشت', { announce, st });
    if (!st.btn) issue('night' + night, 'بعد از رفرش دکمهٔ حلِ شب دوباره باز شد (خطرِ حلِ دوباره)', st);
    await ev(H, () => resolveNightPhase()).catch(() => {});
    await sleep(600);
    if (JSON.stringify([players().map(p => [p.id, p.is_alive, p.state_flags]), game().hengameh_flags]) !== snapN) issue('night' + night, 'حلِ دوباره‌یِ شب وضعیتِ بازی را عوض کرد');
    else note('  (رفرشِ گرداننده بعد از حلِ شب: نتیجه برگشت و حلِ دوباره بی‌اثر است)');
  }
  // پایان؟
  const w = evalWin();
  await sleep(700);
  const status = game().status;
  if (w.over && status !== 'ended') issue('night' + night, 'بازی باید تمام می‌شد ولی نشد', w);
  if (!w.over && status === 'ended') issue('night' + night, 'بازی نباید تمام می‌شد', w);
  return status === 'ended';
}

async function startNextDay(night) {
  const H = 'host';
  await click(H, '#hostPhaseBtn');
  await waitFor(H, d => document.getElementById('hostDayPanel').style.display === 'block', null, 'next day panel', 15000).catch(e => issue('night' + night, 'روزِ بعد شروع نشد', String(e).slice(0, 80)));
  await sleep(300);
  if (players().some(p => p.state_flags.jailed)) issue('night' + night, 'زندانی صبحِ روزِ بعد آزاد نشد');
}

async function finishCheck() {
  const g = game();
  note('پایانِ بازی: status=' + g.status + ' winner=' + g.winner_side);
  if (g.status !== 'ended') { note('بازی تا سقفِ دورها تمام نشد — بررسیِ صفحهٔ پایان رد شد.'); return; }
  const w = evalWin();
  const expected = w.z === 0 ? 'jamshidi' : w.j === 0 ? 'zahhaki' : null;
  if (g.winner_side !== expected) issue('end', 'برندهٔ ثبت‌شده با شمارش نمی‌خونه', { winner: g.winner_side, expected, w });
  await sleep(1500);
  for (const p of players()) {
    const nm = p.display_name; if (!pages[nm]) continue;
    const sc = await activeScreen(nm).catch(() => null);
    if (sc !== 'screen-game-over') issue(nm, 'صفحهٔ پایانِ بازی نیومد', sc);
    else {
      const title = await ev(nm, () => document.getElementById('goTitle').textContent);
      const rosterN = await ev(nm, () => document.querySelectorAll('#goRoster .roster-row, #goRoster li, #goRoster .rr').length);
      if (p.is_host === false && !title.trim()) issue(nm, 'عنوانِ پایان خالی');
    }
  }
  await snap('host', 'final'); await snap(players().find(p => !p.is_host).display_name, 'final');
}

(async () => {
  await new Promise(r => server.listen(0, r)); PORT = server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=480,900'] });
  const t0 = Date.now();
  try {
    await setup();
    await sleep(1500);
    for (const p of players().filter(x => !x.is_host)) { const sc = await activeScreen(p.display_name); if (sc !== 'screen-my-role') issue(p.display_name, 'قبل از شروعِ روزِ اول از صفحهٔ نقش رفت', sc); }
    await click('host', '#hostPhaseBtn'); // شروعِ روزِ اول
    let round = 0;
    while (round < MAX_ROUNDS) {
      round++;
      await waitFor('host', () => document.getElementById('hostDayPanel').style.display === 'block', null, 'host day', 15000);
      const day = game().day_number;
      note('===== روز ' + day + ' (زنده‌ها: ' + alive().length + ' ، زنده یاران j/z = ' + JSON.stringify(evalWin()) + ')');
      await waitFor('host', () => document.getElementById('hostDayPanel').style.display === 'block', null, 'host day', 15000);
      await expectScreens('day');
      await playersVote(day);
      if (round === 2 && process.env.NORELOAD !== '1') {
        // رفرشِ صفحه‌ی چند بازیکن و گرداننده وسطِ روز: وضعیت باید برگرده
        const vs = normals().filter(p => p.is_alive).slice(0, 2);
        for (const v of vs) {
          await reloadPlayer(v.display_name, 'screen-day-vote');
          const lockedAfter = await waitFor(v.display_name, () => !document.getElementById('dvLockedNote').hidden, null, 'locked after reload', 8000).catch(() => false);
          if (!lockedAfter) issue(v.display_name, 'بعد از رفرش رأیِ ثبت‌شده قفل برنگشت');
        }
        await P('host').reload({ waitUntil: 'domcontentloaded' });
        await waitFor('host', () => document.getElementById('hostDayPanel').style.display === 'block', null, 'host day after reload', 15000).catch(e => issue('host', 'بعد از رفرش پنلِ روز برنگشت', String(e).slice(0, 80)));
        note('  (رفرشِ گرداننده و دو بازیکن وسطِ روز انجام شد)');
      }
      await royalPowers(day);
      const ctx = await hostDay(day);
      if (round === 3 && process.env.NORELOAD !== '1') {
        const vals = () => ev('host', () => ['mahaanMember1', 'mahaanMember2', 'mahaanMember3', 'mahaanAccused1', 'mahaanAccused2'].map(id => document.getElementById(id).value));
        const before = await vals();
        await P('host').reload({ waitUntil: 'domcontentloaded' });
        await waitFor('host', () => document.getElementById('hostDayPanel').style.display === 'block' && document.querySelectorAll('#mahaanAccused1 option').length > 1, null, 'host day after reload2', 15000).catch(e => issue('host', 'پنلِ روز بعد از رفرش برنگشت', ''));
        await sleep(800);
        const after = await vals();
        if (JSON.stringify(before) !== JSON.stringify(after)) issue('day' + day, 'انتخاب‌هایِ مجلسِ مهان بعد از رفرش برنگشت', { before, after });
        else note('  (مجلسِ مهان بعد از رفرشِ گرداننده برگشت)');
      }
      await dayDecision(day, ctx);
      if (game().status === 'ended') break;
      if (round === 5 && process.env.NORELOAD !== '1') {
        const ann0 = await ev('host', () => document.getElementById('dayAnnounceText').textContent);
        const snap0 = JSON.stringify(players().map(p => [p.id, p.is_alive, p.state_flags]));
        await P('host').reload({ waitUntil: 'domcontentloaded' });
        await waitFor('host', () => document.getElementById('hostDayPanel').style.display === 'block' && document.querySelectorAll('#mahaanAccused1 option').length > 1, null, 'host day after reload3', 15000).catch(() => issue('host', 'پنلِ روز بعد از رفرش برنگشت', ''));
        await sleep(900);
        const st = await ev('host', () => ({ ann: document.getElementById('dayAnnounceText').textContent, vis: document.getElementById('dayAnnounceBox').style.display, apply: document.getElementById('applyKillBtn').disabled, kill: document.getElementById('decideKillBtn').disabled }));
        if (st.vis !== 'block' || st.ann !== ann0) issue('day' + day, 'اعلامِ روز بعد از رفرش برنگشت', { ann0, st });
        if (!st.apply || !st.kill) issue('day' + day, 'بعد از رفرش دوباره می‌شود نتیجه‌یِ روز را ثبت کرد', st);
        await ev('host', () => applyDayKill()).catch(() => {});
        await sleep(400);
        if (JSON.stringify(players().map(p => [p.id, p.is_alive, p.state_flags])) !== snap0 && !(game().hengameh_flags.kin_e_siavash_day)) issue('day' + day, 'ثبتِ دوباره‌یِ نتیجه‌یِ روز بازی را عوض کرد');
        else note('  (رفرشِ گرداننده بعد از ثبتِ نتیجه‌یِ روز: اعلام برگشت، ثبتِ دوباره قفل است)');
      }
      await endDay(day);
      await expectScreens('night');
      const ended = await nightPhase(day);
      if (ended) break;
      await startNextDay(day);
    }
    await finishCheck();
  } catch (e) {
    issue('FATAL', String(e && e.stack || e).slice(0, 600));
    try { await snap('host', 'fatal'); } catch (x) {}
  }
  if (pages.host) console.log('پیام‌هایِ alert گرداننده:', JSON.stringify((pages.host.dialogs || []).map(d => d.slice(0, 40))));
  const dt = Math.round((Date.now() - t0) / 1000);
  console.log('\n===== پایان (' + dt + 's) — issues: ' + issues.length);
  const uniq = new Map(); issues.forEach(i => { const k = i.where.replace(/\d+/g, '#') + '|' + i.msg; uniq.set(k, (uniq.get(k) || 0) + 1); });
  uniq.forEach((c, k) => console.log(' ×' + c + '  ' + k));
  fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify({ layout: LAYOUT, seed: SEED, issues, log }, null, 1));
  await browser.close(); server.close(); process.exit(0);
})();
