// پایگاه‌دادهٔ ساختگیِ درون‌حافظه‌ای که جای Supabase می‌نشیند (فقط برای شبیه‌سازی)
let seq = 0;
const uid = () => 'id-' + (++seq).toString(16).padStart(6, '0');
const T = { games: [], players: [], day_votes: [], night_actions: [], letters: [], events_log: [] };
let clock = 0;
const now = () => new Date(Date.UTC(2026, 0, 1) + (++clock) * 1000).toISOString();

const DEFAULTS = {
  games: () => ({ id: uid(), status: 'lobby', current_phase: null, day_number: 0, night_number: 0, hengameh_flags: {}, winner_side: null, soroush_active_until_night: null, created_at: now() }),
  players: () => ({ id: uid(), is_host: false, role_id: null, side: null, is_alive: true, state_flags: {}, joined_at: now(), eliminated_by: null, eliminated_on_day: null, eliminated_on_night: null }),
  day_votes: () => ({ id: uid(), created_at: now() }),
  night_actions: () => ({ id: uid(), extra: {}, submitted_at: now() }),
  letters: () => ({ id: uid(), is_night_letter: false, zahhak_intercepted: false, delivered: false, created_at: now() }),
  events_log: () => ({ id: uid(), payload: {}, created_at: now() }),
};
const clone = o => JSON.parse(JSON.stringify(o));
const match = (row, filters) => filters.every(([c, v]) => row[c] === v);

function exec(q) {
  const tbl = T[q.table];
  if (!tbl) return { data: null, error: { message: 'no such table ' + q.table } };
  let rows = [], err = null;
  if (q.op === 'select') {
    rows = tbl.filter(r => match(r, q.filters));
    if (q.order) rows = rows.slice().sort((a, b) => (a[q.order.col] > b[q.order.col] ? 1 : a[q.order.col] < b[q.order.col] ? -1 : 0) * (q.order.asc ? 1 : -1));
  } else if (q.op === 'insert') {
    const arr = Array.isArray(q.payload) ? q.payload : [q.payload];
    // یکتایی‌هایی که اسکیمای واقعی دارد
    for (const p of arr) {
      if (q.table === 'games' && p.code && tbl.some(g => g.code === p.code)) return { data: null, error: { message: 'duplicate code' } };
      const row = { ...DEFAULTS[q.table](), ...clone(p) };
      tbl.push(row); rows.push(row);
    }
  } else if (q.op === 'update') {
    rows = tbl.filter(r => match(r, q.filters));
    rows.forEach(r => Object.assign(r, clone(q.payload)));
  } else if (q.op === 'upsert') {
    const cols = (q.onConflict || 'id').split(',');
    const p = clone(q.payload);
    let row = tbl.find(r => cols.every(c => r[c] === p[c]));
    if (row) Object.assign(row, p);
    else { row = { ...DEFAULTS[q.table](), ...p }; tbl.push(row); }
    rows = [row];
  } else if (q.op === 'delete') {
    const del = tbl.filter(r => match(r, q.filters));
    del.forEach(r => tbl.splice(tbl.indexOf(r), 1));
    rows = del;
  }
  const wantsRows = q.op === 'select' || q.ret;
  if (!wantsRows) return { data: null, error: err };
  let data = clone(rows);
  if (q.single === 'single') {
    if (data.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    data = data[0];
  } else if (q.single === 'maybe') {
    if (data.length > 1) return { data: null, error: { message: 'multiple rows returned' } };
    data = data[0] || null;
  }
  return { data, error: err };
}

// کدِ تزریق‌شده در صفحه به‌جای کتابخانهٔ supabase-js
const CLIENT_JS = `
(function(){
  class Q {
    constructor(t){ this.q = { table:t, filters:[], order:null, op:'select', ret:false, single:null, onConflict:null }; }
    select(){ if(this.q.op !== 'select') this.q.ret = true; return this; }
    insert(p){ this.q.op='insert'; this.q.payload=p; return this; }
    update(p){ this.q.op='update'; this.q.payload=p; return this; }
    upsert(p,o){ this.q.op='upsert'; this.q.payload=p; this.q.onConflict=o&&o.onConflict; return this; }
    delete(){ this.q.op='delete'; return this; }
    eq(c,v){ this.q.filters.push([c,v]); return this; }
    order(c,o){ this.q.order={col:c,asc:!(o&&o.ascending===false)}; return this; }
    single(){ this.q.single='single'; return this; }
    maybeSingle(){ this.q.single='maybe'; return this; }
    then(res,rej){ return window.__dbcall(JSON.parse(JSON.stringify(this.q))).then(res,rej); }
  }
  window.supabase = { createClient: () => ({ from: t => new Q(t) }) };
})();
`;

module.exports = { T, exec, CLIENT_JS };
