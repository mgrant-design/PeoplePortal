/* uniform-rules.js — who may order uniforms, what is free, and what an order holds. Shared
   by the Uniforms page and the server (copied into api/_shared by npm run sync and the
   deploy), so the server works out the allowance and the prices itself.
   Full-time staff get 2 tops, 2 pants, 2 undershirts and 1 jacket a year; part-time 1 of
   each; the year starts every April 1. Front desk staff order only a jacket, paid by payroll
   deduction. Nobody orders before their 90th day. With no full-time or part-time on the
   record (and for per diem, still open), nothing is free for now. */
(function () {
  const CATS = ['top', 'pant', 'layer', 'jacket'];
  const CAT_LABEL = { top: 'Top', pant: 'Pant', layer: 'Undershirt', jacket: 'Jacket' };
  const FITS = ['Women', 'Men'];
  const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  const COLORS = { black: { name: 'Black', hex: '#23262b' }, blue: { name: 'Royal Blue', hex: '#2f4fb0' } };
  const LOGOS = {
    pure:   { id: 'pure',   name: 'Pure Dental',                offices: ['manorville', 'wading river'] },
    fes:    { id: 'fes',    name: 'Four Ever Smile',            offices: ['hauppauge', 'garden city'] },
    fesspa: { id: 'fesspa', name: 'Four Ever Smile Dental Spa', offices: ['totowa', 'new jersey'] },
  };
  /* prices are per fit; they mirror the staff order form */
  const PRODUCTS = [
    { id: 'top', name: 'Modern-Fit V-Neck Top', cat: 'top', price: { Women: 11.5, Men: 16.5 }, desc: 'Logo and embroidered name included.' },
    { id: 'pant_s', name: 'Straight-Leg Scrub Pant', cat: 'pant', price: { Women: 17.5, Men: 16.5 }, desc: 'Regular, petite, or tall length.' },
    { id: 'pant_j', name: 'Jogger Scrub Pant', cat: 'pant', price: { Women: 14, Men: 18.5 }, desc: 'Comfort waistband and cuffed ankle.' },
    { id: 'layer', name: 'Long-Sleeve Undershirt', cat: 'layer', price: { Women: 10, Men: 19.5 }, desc: 'Worn under your scrub top.' },
    { id: 'jacket', name: 'Full-Zip Jacket', cat: 'jacket', price: { Women: 23, Men: 23 }, desc: 'Full-zip warm-up. Logo and name included.' },
  ];
  const ALLOWANCE = { 'Full-time': { top: 2, pant: 2, layer: 2, jacket: 1 }, 'Part-time': { top: 1, pant: 1, layer: 1, jacket: 1 } };
  const NONE = { top: 0, pant: 0, layer: 0, jacket: 0 };

  const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };
  const dayAtOffices = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isoOf = (s) => { const t = String(s || '').trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; return ''; };

  /* 'clinical' (doctors, assistants, hygienists, lab), 'frontdesk', or 'none' */
  function uniformRole(emp) {
    const s = (((emp && emp.jobTitle) || '') + ' ' + ((emp && emp.department) || '')).toLowerCase();
    if (/front desk|reception|treatment coordinator/.test(s)) return 'frontdesk';
    if (/lab|hygien|dent|dds|dmd|doctor|endodont|orthodont|periodont|surgeon|assist|clinical/.test(s)) return 'clinical';
    return 'none';
  }
  const logoForOffice = (loc) => { const l = String(loc || '').toLowerCase(); for (const k in LOGOS) if (LOGOS[k].offices.some(o => l.includes(o))) return k; return 'pure'; };
  /* the first day (YYYY-MM-DD) of the allowance year a moment falls in */
  function cycleStart(ms) { const day = dayAtOffices(ms); const y = Number(day.slice(0, 4)); return day >= `${y}-04-01` ? `${y}-04-01` : `${y - 1}-04-01`; }
  const priceFor = (p, fit) => (p.price[fit] != null ? p.price[fit] : p.price.Women);

  /* what this person may order now: { role, canOrder, reason, ninetyDate, caps, used, remaining }.
     reason is 'role' (no uniforms in their role), 'ninety' (before day 90), 'noType' (nothing
     free: no full-time or part-time on record), or '' */
  function eligibility(emp, priorOrders, now) {
    const role = uniformRole(emp);
    const start = isoOf(emp && emp.startDate);
    const ninetyDate = start ? addDays(start, 90) : '';
    const today = dayAtOffices(now);
    const caps = role === 'clinical' ? (ALLOWANCE[emp.employmentType] || NONE) : NONE;
    const from = cycleStart(now);
    const used = { ...NONE };
    (priorOrders || []).filter(o => o.status !== 'denied' && dayAtOffices(Date.parse(o.createdAt)) >= from)
      .forEach(o => (o.items || []).forEach(it => { if (it.cat in used) used[it.cat] += it.companyQty || 0; }));
    const remaining = {}; CATS.forEach(c => { remaining[c] = Math.max(0, caps[c] - used[c]); });
    const reason = role === 'none' ? 'role' : (ninetyDate && today < ninetyDate) ? 'ninety' : (role === 'clinical' && !ALLOWANCE[emp.employmentType]) ? 'noType' : '';
    return { role, canOrder: reason !== 'role' && reason !== 'ninety', reason, ninetyDate, caps, used, remaining, type: emp.employmentType || '' };
  }

  /* checks an order and works out each item from the catalog: what is free (companyQty) and
     what the employee pays (employeeQty). Throws an error with a status for anything wrong. */
  function buildOrder(emp, input, priorOrders, now) {
    const el = eligibility(emp, priorOrders, now);
    if (el.reason === 'role') throw fail(403, 'Uniform ordering isn’t part of your role');
    if (el.reason === 'ninety') throw fail(403, `Uniforms can be ordered from your 90th day, ${el.ninetyDate}`);
    const raw = Array.isArray(input && input.items) ? input.items : [];
    if (!raw.length || raw.length > 40) throw fail(400, 'Add at least one item');
    const left = { ...el.remaining };
    const items = raw.map(r => {
      const p = PRODUCTS.find(x => x.id === (r && r.productId));
      const qty = Number(r && r.qty);
      if (!p || !FITS.includes(r.fit) || !SIZES.includes(r.size) || !COLORS[r.color] || !Number.isInteger(qty) || qty < 1 || qty > 20) throw fail(400, 'An item in the order isn’t in the catalog');
      if (el.role === 'frontdesk' && p.cat !== 'jacket') throw fail(400, 'Front desk staff order only the jacket');
      const companyQty = Math.min(qty, left[p.cat]); left[p.cat] -= companyQty;
      return { productId: p.id, name: p.name, cat: p.cat, fit: r.fit, size: r.size, color: r.color, qty, price: priceFor(p, r.fit), companyQty, employeeQty: qty - companyQty };
    });
    const employeeTotal = Math.round(items.reduce((s, it) => s + it.employeeQty * it.price, 0) * 100) / 100;
    const payMethod = el.role === 'frontdesk' ? 'payroll' : (input.payMethod === 'card' ? 'card' : 'payroll');
    return {
      items, employeeTotal, payMethod: employeeTotal > 0 ? payMethod : null,
      logo: LOGOS[input.logo] ? input.logo : logoForOffice(emp.location),
      embroideredName: String((input && input.embroideredName) || '').trim().slice(0, 60) || `${emp.first || ''} ${emp.last || ''}`.trim(),
      office: emp.location || '', jobTitle: emp.jobTitle || '',
    };
  }

  const api = { CATS, CAT_LABEL, FITS, SIZES, COLORS, LOGOS, PRODUCTS, ALLOWANCE, uniformRole, logoForOffice, cycleStart, priceFor, eligibility, buildOrder, dayAtOffices };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PD_UNIFORMS = api;
})();
