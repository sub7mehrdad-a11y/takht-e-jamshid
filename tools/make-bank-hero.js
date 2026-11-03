// تصویرِ سرِ صفحه‌یِ «بانک بزرگمهر» (۱۰۸۰×۵۴۰): پس‌زمینه‌یِ محوِ لوگویِ بازی + انبوهِ سکه‌هایِ دریک. اجرا: node tools/make-bank-hero.js
const path = require('path'), fs = require('fs'), os = require('os');
const puppeteer = require(path.resolve(__dirname, '..', 'tests', 'sim', 'node_modules', 'puppeteer-core'));
const G = path.resolve(__dirname, '..');
const u = p => 'file:///' + encodeURI(path.join(G, p).replace(/\\/g, '/'));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// [x, y, اندازه، چرخش] — سکه‌ها از عقب به جلو
const COINS = [[300, 392, 150, -14], [770, 398, 140, 12], [150, 440, 110, 8], [930, 446, 112, -10], [440, 420, 170, 6], [640, 424, 160, -8], [540, 462, 190, 0], [380, 478, 120, 18], [700, 482, 124, -16]];
const html = `<meta charset=utf-8><style>
*{margin:0;box-sizing:border-box}
body{width:1080px;height:540px;position:relative;overflow:hidden;background:#100b07}
.bg{position:absolute;inset:-40px;background:url('${u('assets/brand/takht-logo.webp')}') 50% 30%/1300px auto no-repeat;filter:blur(18px) brightness(.5) saturate(1.25)}
.glow{position:absolute;inset:0;background:radial-gradient(ellipse 55% 70% at 50% 8%,rgba(255,214,120,.5),transparent 70%),linear-gradient(to bottom,rgba(16,11,7,.15),rgba(16,11,7,.55) 70%,#1b1209)}
.c{position:absolute;filter:drop-shadow(0 10px 14px rgba(0,0,0,.65))}
.sparkle{position:absolute;width:6px;height:6px;border-radius:50%;background:#ffe9a8;box-shadow:0 0 14px 5px rgba(255,214,120,.8)}
</style><div class=bg></div><div class=glow></div>
${[[210, 120], [860, 90], [470, 60], [640, 170], [120, 250], [980, 260]].map(([x, y]) => `<i class=sparkle style="left:${x}px;top:${y}px"></i>`).join('')}
${COINS.map(([x, y, s, r]) => `<img class=c src="${u('assets/bank/darik-180.webp')}" style="left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;transform:rotate(${r}deg)">`).join('')}`;
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 1080, height: 540, deviceScaleFactor: 1 });
  const f = path.join(os.tmpdir(), 'tj-bank-hero.html'); fs.writeFileSync(f, html);
  await pg.goto('file:///' + encodeURI(f.replace(/\\/g, '/')), { waitUntil: 'load' });
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.decode()))); await new Promise(r => setTimeout(r, 400));
  const out = path.join(G, 'assets', 'bank', 'bank-hero.webp');
  await pg.screenshot({ path: out, type: 'webp', quality: 82 }); await b.close(); console.log('ساخته شد:', out, fs.statSync(out).size); process.exit(0);
})();
