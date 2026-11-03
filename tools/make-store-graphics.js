// بنرِ گوگل پلی (۱۰۲۴×۵۰۰) با لوگویِ جدید + عنوان. اجرا: node tools/make-store-graphics.js   (نیازمندِ tests/sim/node_modules و Chrome)
const path = require('path'), fs = require('fs'), os = require('os');
const puppeteer = require(path.resolve(__dirname, '..', 'tests', 'sim', 'node_modules', 'puppeteer-core'));
const G = path.resolve(__dirname, '..');
const u = p => 'file:///' + encodeURI(path.join(G, p).replace(/\\/g, '/'));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const html = `<meta charset=utf-8><style>
@font-face{font-family:V;src:url('${u('assets/vendor/fonts/vazirmatn-900.ttf')}');font-weight:900}
@font-face{font-family:V;src:url('${u('assets/vendor/fonts/vazirmatn-500.ttf')}');font-weight:500}
*{margin:0;box-sizing:border-box}
body{width:1024px;height:500px;position:relative;overflow:hidden;font-family:V;background:#000}
.bg{position:absolute;inset:0;background:url('${u('assets/brand/takht-logo.webp')}') 50% 38%/1500px auto no-repeat;filter:blur(26px) brightness(.55) saturate(1.2);transform:scale(1.15)}
.v{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(0,0,0,.75) 55%,rgba(0,0,0,.2))}
.logo{position:absolute;right:46px;top:30px;width:440px;height:440px;border-radius:70px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.7),0 0 0 2px rgba(227,184,90,.55)}
.logo img{width:100%;height:100%;object-fit:cover;object-position:50% 50%;transform:scale(1.0)}
h1{position:absolute;left:0;width:500px;top:140px;text-align:center;white-space:nowrap;font-weight:900;font-size:92px;line-height:1.2;color:#f0c969;text-shadow:0 4px 16px rgba(0,0,0,.9)}
p{position:absolute;left:0;width:500px;top:262px;text-align:center;white-space:nowrap;font-weight:500;font-size:27px;color:#f1e3c3;text-shadow:0 2px 10px rgba(0,0,0,.9)}
.chip{position:absolute;left:70px;width:360px;top:360px;text-align:center;padding:10px 0;border:1.5px solid #c9972f;border-radius:999px;background:rgba(27,18,9,.65);color:#e3b85a;font-weight:900;font-size:27px}
</style><div class=bg></div><div class=v></div><div class=logo><img src="${u('assets/brand/takht-logo.webp')}" style="width:116%;height:116%;margin:-8% 0 0 -8%;max-width:none"></div>
<h1>تخت جمشید</h1><p>بازی نقش مخفی بر پایه‌ی شاهنامه</p><div class=chip>با بانک بزرگمهر دریک ببر</div>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
  const f = path.join(os.tmpdir(), 'tj-feature.html'); fs.writeFileSync(f, html);
  await pg.goto('file:///' + encodeURI(f.replace(/\\/g, '/')), { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 900));
  const out = path.join(G, 'گوگل-پلی', 'گرافیک', 'feature-graphic-1024x500.png');
  await pg.screenshot({ path: out }); await b.close(); console.log('ساخته شد:', out); process.exit(0);
})();
