/* scrubs.jsx — Staff Scrub Orders for Pure Dental / Four Ever Smile.
   Storefront + eligibility engine (90-day gate, annual April reset) + ops pipeline
   (approve → batch to CID Resources → receive → deliver) + invoices + analytics.
   NOTE: catalog/prices below mirror the staff Google order form — swap in exact SKUs when finalized. */

/* ---- brands / logos by office ---- */
const SCRUB_LOGOS = {
  pure:   { id: 'pure',   name: 'Pure Dental',                  offices: ['manorville', 'wading river'] },
  fes:    { id: 'fes',    name: 'Four Ever Smile',              offices: ['hauppauge', 'garden city'] },
  fesspa: { id: 'fesspa', name: 'Four Ever Smile Dental Spa',   offices: ['totowa', 'new jersey'] },
};
function logoForOffice(loc) {
  const l = (loc || '').toLowerCase();
  for (const k in SCRUB_LOGOS) if (SCRUB_LOGOS[k].offices.some(o => l.includes(o))) return k;
  return 'pure';
}

/* ---- scrub access tiers ---- */
function scrubAccess(me) {
  const s = ((me.jobTitle || '') + ' ' + (me.department || '')).toLowerCase();
  if (/lab/.test(s)) return 'lab';
  if (/hygien/.test(s)) return 'hygienist';
  if (/front desk|reception|treatment coordinator/.test(s)) return 'frontdesk';
  if (/dent|dds|dmd|doctor|endodont|orthodont|periodont|surgeon/.test(s)) return 'doctor';
  if (/assist|clinical/.test(s)) return 'assistant';
  return 'other';
}
const CLINICAL = ['doctor', 'assistant', 'hygienist', 'lab'];
const ACCESS_LABEL = { doctor: 'Doctor', assistant: 'Dental Assistant', hygienist: 'Hygienist', lab: 'Lab Staff', frontdesk: 'Front Desk', other: 'Staff' };
function provType(me) { return scrubAccess(me); }

/* ---- colors (per clinical color schedule) ---- */
const SCRUB_COLORS = { black: { name: 'Black', hex: '#23262b' }, blue: { name: 'Royal Blue', hex: '#2f4fb0' } };
function scol(c) { return SCRUB_COLORS[c] || SCRUB_COLORS.black; }
const FITS = ['Women', 'Men'];
const SCRUB_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

/* ---- catalog. price is per-fit; jackets flat. XXL+ may carry an upcharge (inquire). ---- */
const CAT_LABEL = { top: 'Top', pant: 'Pant', layer: 'Layer', jacket: 'Jacket' };
const SCRUB_PRODUCTS = [
  { id: 'top', name: 'Modern-Fit V-Neck Top', cat: 'top', price: { Women: 11.5, Men: 16.5 }, desc: 'Logo and embroidered name included.' },
  { id: 'pant_s', name: 'Straight-Leg Scrub Pant', cat: 'pant', price: { Women: 17.5, Men: 16.5 }, desc: 'Regular, petite, or tall length.' },
  { id: 'pant_j', name: 'Jogger Scrub Pant', cat: 'pant', price: { Women: 14, Men: 18.5 }, desc: 'Comfort waistband and cuffed ankle.' },
  { id: 'layer', name: 'Long-Sleeve Undershirt', cat: 'layer', price: { Women: 10, Men: 19.5 }, desc: 'Worn under your scrub top.' },
  { id: 'jacket', name: 'Full-Zip Jacket', cat: 'jacket', price: { Women: 23, Men: 23 }, desc: 'Full-zip warm-up. Logo + name included.' },
];
function priceFor(p, fit) { return (p.price && typeof p.price === 'object') ? (p.price[fit] != null ? p.price[fit] : p.price.Women) : p.price; }

const ALLOWANCE = {
  FT: { top: 2, pant: 2, layer: 2, jacket: 1 },
  PT: { top: 1, pant: 1, layer: 1, jacket: 1 },
};

/* ---- persistence ---- */
/* NO BACKEND. Scrub cart + orders have no /api endpoint yet — in-memory only, gone
   on reload. No localStorage, no seed orders. */
let _scrubCart = [];
let _scrubOrders = [];
const loadCart = () => _scrubCart;
const saveCart = (c) => { _scrubCart = c || []; };
const loadOrders = () => _scrubOrders;
const saveOrders = (o) => { _scrubOrders = o || []; };

const money = (n) => '$' + (n || 0).toFixed(2);
function pDate(s) { if (!s) return null; s = String(s).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); } const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[1] - 1, +m[2]); } return null; }
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—';

/* ---- eligibility engine ---- */
function aprilCycleStart(d) { const y = d.getFullYear(); const apr = new Date(y, 3, 1); return d >= apr ? apr : new Date(y - 1, 3, 1); }
function ftpt(me) { return (typeof empType === 'function') ? empType(me) : 'FT'; }
function eligibility(me, myOrders) {
  const now = new Date();
  const caps = ALLOWANCE[ftpt(me)] || ALLOWANCE.FT;
  const start = pDate(me.startDate);
  const ninetyDate = start ? new Date(start.getTime() + 90 * 864e5) : null;
  const ninetyOk = !ninetyDate || now >= ninetyDate;
  const cycleStart = aprilCycleStart(now).getTime();
  const cycleOrders = (myOrders || []).filter(o => o.status !== 'denied' && o.ts >= cycleStart);
  const usedCo = { top: 0, pant: 0, layer: 0, jacket: 0 };
  cycleOrders.forEach(o => o.items.forEach(it => { usedCo[it.cat] = (usedCo[it.cat] || 0) + (it.companyQty || 0); }));
  const remaining = {}; let anyRemaining = false;
  for (const k in caps) { remaining[k] = Math.max(0, caps[k] - usedCo[k]); if (remaining[k] > 0) anyRemaining = true; }
  const coOrders = (myOrders || []).filter(o => o.status !== 'denied' && o.items.some(it => (it.companyQty || 0) > 0));
  const lastCo = coOrders.length ? Math.max(...coOrders.map(o => o.ts)) : null;
  const nextApril = (now >= new Date(now.getFullYear(), 3, 1)) ? new Date(now.getFullYear() + 1, 3, 1) : new Date(now.getFullYear(), 3, 1);
  const eligibleNow = ninetyOk && anyRemaining;
  const nextEligible = !ninetyOk ? ninetyDate.getTime() : (anyRemaining ? null : nextApril.getTime());
  return { caps, remaining, anyRemaining, ninetyOk, ninetyDate: ninetyDate && ninetyDate.getTime(), lastCo, eligibleNow, nextEligible, type: ftpt(me) };
}

/* allocate company- vs employee-paid units against effective caps (remaining allowance) */
function allocate(items, caps) {
  const used = {};
  return items.map(it => {
    const cap = caps[it.cat] || 0; const before = used[it.cat] || 0;
    const companyQty = Math.max(0, Math.min(it.qty, cap - before));
    used[it.cat] = before + it.qty;
    return { ...it, companyQty, employeeQty: it.qty - companyQty };
  });
}

/* ---- orders: start empty; real orders come from actual scrub requests ---- */
function seedScrubOrders() {
  return loadOrders() || [];
}

/* ---- vendor export helpers ---- */
function orderRows(o) {
  return o.items.map(it => [o.id, o.requester, o.loc, SCRUB_LOGOS[o.logo].name, o.embroideredName, CAT_LABEL[it.cat], it.name, it.fit, it.size, scol(it.color).name, it.qty, money(it.price)]);
}
function downloadCSV(orders) {
  const head = ['Order', 'Staff', 'Office', 'Logo', 'Embroidered name', 'Category', 'Item', 'Fit', 'Size', 'Color', 'Qty', 'Unit price'];
  const rows = [head, ...orders.flatMap(orderRows)].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  try { const b = new Blob([rows], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'CID-Resources-order-batch.csv'; a.click(); } catch (e) {}
}
function printOrders(orders) {
  const w = window.open('', '_blank'); if (!w) return;
  const block = orders.map(o => `
    <div style="page-break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:16px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between"><b>${o.requester}</b><span>${SCRUB_LOGOS[o.logo].name}</span></div>
      <div style="color:#555;font-size:13px;margin:2px 0 10px">${o.jobTitle} · ${o.loc} · Embroidered: ${o.embroideredName} · Order ${o.id}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="text-align:left;border-bottom:1px solid #ddd"><th>Item</th><th>Cat</th><th>Fit</th><th>Size</th><th>Color</th><th>Qty</th></tr>
        ${o.items.map(it => `<tr><td>${it.name}</td><td>${CAT_LABEL[it.cat]}</td><td>${it.fit}</td><td>${it.size}</td><td>${scol(it.color).name}</td><td>${it.qty}</td></tr>`).join('')}
      </table>
    </div>`).join('');
  w.document.write(`<html><head><title>CID Resources — Order Form</title></head><body style="font-family:system-ui,sans-serif;padding:28px;color:#1a1a1a">
    <h2 style="margin:0 0 4px">CID Resources — Scrub Order Form</h2>
    <div style="color:#666;margin-bottom:18px">Pure Dental / Four Ever Smile · ${orders.length} order(s) · ${new Date().toLocaleDateString()}</div>
    ${block}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

Object.assign(window, { scrubsRole: (me, a) => a.flags.isAdmin ? 'admin' : a.flags.isManager ? 'ops' : (a.flags.isAccounting || a.flags.isHR) ? 'finance' : 'staff' });
