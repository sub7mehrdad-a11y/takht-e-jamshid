// آزمونِ رابطِ بانکِ بزرگمهر با Chrome واقعی + سرورِ واقعیِ واژو (حساب، دریک): ثبت‌نام، کدِ بازیابی، پاداشِ روزانه، خروج/ورود، بازیابی، ماندگاری.
// اجرا:  node tests/sim/bank-ui.js   (نیازمندِ مخزنِ ../واژو در کنارِ این پروژه)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { createServer } = require(path.resolve(ROOT, '..', 'واژو', 'server', 'server.js'));
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tj-bank-ui'); fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const t = (n, c, x) => { c ? pass++ : (fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };

(async () => {
  const web = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
  await new Promise(r => web.listen(0, r)); const WP = web.address().port;
  const bank = createServer({ dataDir: null, extFetch: async () => null }); await new Promise(r => bank.server.listen(0, r)); const BP = bank.server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage(); await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument(u => { window.TJ_BANK_URL = u; }, 'http://localhost:' + BP);
  const url = `http://localhost:${WP}/index.html`;
  const ev = (fn, a) => page.evaluate(fn, a);
  const waitF = (fn, a, ms = 12000) => page.waitForFunction(fn, { timeout: ms }, a);
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const type = async (id, v) => { await ev(i => { const e = document.getElementById(i); e.value = ''; }, id); await page.type('#' + id, v); };

  await page.goto(url, { waitUntil: 'load' }); await waitF(() => document.getElementById('screen-entry').classList.contains('active'));
  // ۱) کارتِ صفحه‌یِ اول
  t('کارتِ بانک پایینِ صفحه‌یِ اول هست', await ev(() => { const b = document.getElementById('bankEntryBtn'); const f = document.querySelector('#screen-entry .tj-footer'); return !!b && !!f && (b.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }));
  t('بدونِ حساب، موجودی نشان داده نمی‌شود', await ev(() => document.querySelector('#bankEntryBtn .chip').hidden));
  await ev(() => document.getElementById('bkEntry').scrollIntoView({ block: 'center' })); await sleep(300); await shot('01-entry-bank-card');
  await ev(() => document.getElementById('bankEntryBtn').click());
  await waitF(() => document.getElementById('screen-bank').classList.contains('active'));
  t('صفحه‌یِ بانک باز شد و فرمِ ورود دیده می‌شود', await ev(() => !document.getElementById('bkAuth').hidden && document.getElementById('bkAccount').hidden && !!document.getElementById('bkUser')));
  t('بازی‌هایِ بزرگمهر: لینکِ وب و APKِ واژو', await ev(() => { const a = [...document.querySelectorAll('#bkGames a')].map(x => x.getAttribute('href')); return a.includes('https://vazho.bozorgmehr-game.ir/') && a.includes('https://bozorgmehr-game.ir/downloads/vazho.apk'); }));
  t('لوگوی واژو و بزرگمهر بارگذاری می‌شود', await ev(async () => { const imgs = [...document.querySelectorAll('#screen-bank .bk-game img')]; await Promise.all(imgs.map(i => i.decode().catch(() => {}))); return imgs.length >= 3 && imgs.every(i => i.naturalWidth > 0); }));
  await shot('02-bank-logged-out');
  // ۲) ثبت‌نام: گذرواژه‌یِ کوتاه ← خطا؛ درست ← کدِ بازیابی
  await ev(() => document.getElementById('bkTabReg').click()); await waitF(() => document.getElementById('bkName'));
  await type('bkName', 'تست‌کننده'); await type('bkUser', 'Tester_One'); await type('bkPass', 'abc');
  await ev(() => document.getElementById('bkSubmit').click()); await waitF(() => document.querySelector('#bkAuth .bk-err').textContent.length > 3);
  t('گذرواژه‌یِ کوتاه با پیامِ فارسی رد می‌شود', /۸/.test(await ev(() => document.querySelector('#bkAuth .bk-err').textContent)));
  await type('bkPass', 'password-1234'); await ev(() => document.getElementById('bkSubmit').click());
  await waitF(() => !document.getElementById('bkRecovery').hidden);
  const rec = await ev(() => document.getElementById('bkRecCode').textContent);
  t('کدِ بازیابیِ ۱۲ نویسه‌ای نمایش داده می‌شود', /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rec), rec);
  t('نام‌کاربری کوچک‌حرف شد و حساب باز است', await ev(() => !document.getElementById('bkAccount').hidden && /tester_one/.test(document.getElementById('bkWho').textContent || document.querySelector('#bkAccount .bk-muted').textContent)));
  await shot('03-bank-recovery-code');
  await ev(() => document.getElementById('bkRecDone').click());
  t('پس از «ذخیره کردم» کدِ بازیابی پنهان می‌شود', await ev(() => document.getElementById('bkRecovery').hidden));
  const start = await ev(() => TJBank.cached().balance); t('هدیه‌یِ شروع در موجودی هست', start > 0, start);
  t('موجودی با عددِ فارسی نمایش داده می‌شود', (await ev(() => document.querySelector('#bkAccount .bk-bal b').textContent)) === Number(start).toLocaleString('fa-IR'));
  // ۳) پاداشِ روزانه
  await waitF(() => document.getElementById('bkDailyBtn')); const dtxt = await ev(() => document.getElementById('bkDailyBtn').textContent);
  await ev(() => document.getElementById('bkDailyBtn').click()); await waitF(() => !document.getElementById('bkDailyBtn'));
  t('پاداشِ روزانه موجودی را زیاد کرد و دکمه رفت', (await ev(() => TJBank.cached().balance)) > start, dtxt);
  await waitF(() => document.querySelectorAll('#bkAccount .bk-hist li').length >= 2);
  t('تاریخچه: هدیه و پاداشِ روزانه با برچسبِ فارسی', await ev(() => { const x = [...document.querySelectorAll('#bkAccount .bk-hist li .tx')].map(e => e.textContent); return x.includes('هدیه‌یِ شروع') && x.includes('پاداشِ روزانه'); }));
  await shot('04-bank-account');
  // ۴) ماندگاری: بارگذاریِ دوباره
  await page.reload({ waitUntil: 'load' }); await waitF(() => document.getElementById('screen-entry').classList.contains('active'));
  await waitF(() => !document.querySelector('#bankEntryBtn .chip').hidden);
  t('بعد از ریلود هنوز واردی و موجودی روی کارتِ اول است', /دریک/.test(await ev(() => document.querySelector('#bankEntryBtn .chip').textContent)));
  // ۵) خروج، ورودِ غلط، ورودِ درست
  await ev(() => document.getElementById('bankEntryBtn').click()); await waitF(() => document.getElementById('screen-bank').classList.contains('active'));
  await ev(() => document.getElementById('bkLogout').click()); await waitF(() => !document.getElementById('bkAuth').hidden);
  t('بعد از خروج موجودیِ کارتِ اول پنهان است', await ev(() => document.querySelector('#bankEntryBtn .chip').hidden));
  await type('bkUser', 'tester_one'); await type('bkPass', 'wrong-password'); await ev(() => document.getElementById('bkSubmit').click());
  await waitF(() => document.querySelector('#bkAuth .bk-err').textContent.length > 3);
  t('ورودِ غلط پیامِ فارسی می‌دهد', /درست نیست/.test(await ev(() => document.querySelector('#bkAuth .bk-err').textContent)));
  await type('bkPass', 'password-1234'); await ev(() => document.getElementById('bkSubmit').click()); await waitF(() => !document.getElementById('bkAccount').hidden);
  t('ورودِ درست کار کرد', await ev(() => TJBank.isLoggedIn()));
  // ۶) فراموشیِ گذرواژه با کدِ بازیابی
  await ev(() => document.getElementById('bkLogout').click()); await waitF(() => !document.getElementById('bkAuth').hidden);
  await ev(() => [...document.querySelectorAll('#bkAuth .bk-link')].find(b => /فراموش/.test(b.textContent)).click()); await waitF(() => document.getElementById('bkCode'));
  await type('bkUser', 'tester_one'); await type('bkCode', rec.toLowerCase()); await type('bkPass', 'brand-new-pass-9'); await ev(() => document.getElementById('bkSubmit').click());
  await waitF(() => !document.getElementById('bkAccount').hidden, null, 15000).catch(() => {});
  t('بازیابی با کد گذرواژه‌یِ تازه گذاشت و وارد کرد', await ev(() => TJBank.isLoggedIn()));
  await ev(() => document.getElementById('bkRecDone') && document.getElementById('bkRecDone').click());
  // ۷) حذفِ حساب: گذرواژه‌یِ غلط رد، درست ← حساب پاک و ورودِ بعدی ناموفق
  await ev(() => document.getElementById('bkDelOpen').click()); await waitF(() => document.getElementById('bkDelPass'));
  await type('bkDelPass', 'not-my-password'); await ev(() => document.getElementById('bkDelGo').click());
  await waitF(() => document.querySelector('#bkDelete .bk-err').textContent.length > 3);
  t('حذفِ حساب با گذرواژه‌یِ غلط رد می‌شود', (await ev(() => TJBank.isLoggedIn())) === true);
  await type('bkDelPass', 'brand-new-pass-9'); await ev(() => document.getElementById('bkDelGo').click());
  await waitF(() => !document.getElementById('bkAuth').hidden, null, 15000);
  t('حذفِ حساب با گذرواژه‌یِ درست: خارج شد و از سرور پاک شد', !(await ev(() => TJBank.isLoggedIn())) && !bank.store.byName.has('tester_one'));
  await type('bkUser', 'tester_one'); await type('bkPass', 'brand-new-pass-9'); await ev(() => document.getElementById('bkSubmit').click());
  await waitF(() => document.querySelector('#bkAuth .bk-err').textContent.length > 3);
  t('ورود به حسابِ حذف‌شده ممکن نیست', /درست نیست/.test(await ev(() => document.querySelector('#bkAuth .bk-err').textContent)));
  // ۸) دکمه‌یِ بازگشتِ بانک
  await ev(() => document.querySelector('#screen-bank .bk-back').click());
  t('بازگشت از بانک به صفحه‌یِ اول', await ev(() => document.getElementById('screen-entry').classList.contains('active')));
  t('بدونِ خطایِ جاوااسکریپت/کنسول', errs.length === 0, errs);
  await browser.close(); web.close(); await bank.close();
  console.log(`bank-ui: ${pass} پاس، ${fail} شکست — عکس‌ها: ${SHOTS}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
