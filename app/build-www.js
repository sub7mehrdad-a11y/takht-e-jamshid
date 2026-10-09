// فایل‌هایِ اجراییِ بازی را از ریشه‌یِ مخزن به app/www کپی می‌کند (همان مجموعه‌ای که Dockerfile هم برمی‌دارد).
// assets را از روی `git ls-files` برمی‌دارد تا فایل‌هایِ ردیابی‌نشده (پیش‌نویس‌ها/PSD/PNGهایِ سنگین) داخلِ اپ نرود.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'www');
const TOP = ['index.html', 'supabase-client.js', 'resolveNight.js']; // manifest و sw.js مخصوصِ وب‌اند

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copy = rel => {
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dst);
};

TOP.forEach(copy);
const ls = (...args) => execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z', ...args], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
const tracked = [...new Set([
  ...ls('assets'),
  // کتابخانه‌هایِ vendor حتی اگر هنوز commit نشده باشند (git ردیابی نمی‌کند ولی ignore هم نیست) داخلِ اپ بروند
  ...ls('-o', '--exclude-standard', 'assets/vendor'),
])]
  // دفترچه‌یِ قوانین و پوشه‌یِ rulebook فقط برایِ وب‌اند؛ اپ از داخلِ خودِ بازی راهنما دارد
  .filter(f => !f.startsWith('assets/rulebook/'));
tracked.forEach(copy);

let bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : bytes += fs.statSync(p).size; } })(OUT);
console.log('www: ' + (TOP.length + tracked.length) + ' فایل، ' + (bytes / 1048576).toFixed(1) + ' مگابایت');
