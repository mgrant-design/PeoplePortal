/* scrubs.jsx — Staff Scrub Orders UI (storefront, eligibility, cart, ops pipeline, analytics).
   Logic/data live in scrubs-data.jsx. */

const _ssel = { padding: '7px 9px', borderRadius: 'var(--r-sm)', fontSize: 12.5, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', appearance: 'auto', fontFamily: 'var(--font-body)' };

function ColorSwatch({ c, active, onClick }) {
  return <button onClick={onClick} title={scol(c).name} style={{ width: 22, height: 22, borderRadius: '50%', background: scol(c).hex, border: active ? '2px solid var(--accent-strong)' : '1.5px solid var(--line)', outline: active ? '2px solid var(--accent-soft)' : 'none', cursor: 'pointer', flex: 'none', padding: 0 }} />;
}

function ProductCard({ p, onAdd }) {
  const [fit, setFit] = useState('Women');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('black');
  const [added, setAdded] = useState(false);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '1', background: 'var(--surface-2)', position: 'relative', display: 'grid', placeItems: 'center', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{CAT_LABEL[p.cat]}s</div>
          <div style={{ fontSize: 9.5, marginTop: 3, letterSpacing: '.04em' }}>PRODUCT PHOTO COMING SOON</div>
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.2 }}>{p.name}</span>
          <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)', fontSize: 10 }}>{CAT_LABEL[p.cat]}</span>
        </div>
        <div className="mono" style={{ fontWeight: 700, fontSize: 14, marginTop: -2 }}>{money(priceFor(p, fit))} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-3)' }}>· {fit}</span></div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4, minHeight: 30 }}>{p.desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Object.keys(SCRUB_COLORS).map(c => <ColorSwatch key={c} c={c} active={c === color} onClick={() => setColor(c)} />)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={fit} onChange={e => setFit(e.target.value)} style={{ ..._ssel, flex: 1 }}>{FITS.map(f => <option key={f}>{f}</option>)}</select>
          <select value={size} onChange={e => setSize(e.target.value)} style={{ ..._ssel, flex: 1 }}>{SCRUB_SIZES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <button className={added ? 'btn btn-ghost' : 'btn btn-primary'} style={{ width: '100%', justifyContent: 'center', padding: '8px', fontSize: 12.5 }}
          onClick={() => { onAdd(p, fit, size, color); setAdded(true); setTimeout(() => setAdded(false), 1100); }}>
          {added ? <><Icon name="check" style={{ width: 14, height: 14 }} /> Added to cart</> : <><Icon name="plus" style={{ width: 14, height: 14 }} /> Add to cart</>}
        </button>
      </div>
    </div>
  );
}

function EligibilityPanel({ me, elig, remaining, acc, onReview }) {
  const clinical = CLINICAL.includes(acc);
  return (
    <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 6 }}>Viewing as</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{me.name} · {ACCESS_LABEL[acc]}{clinical ? ' · ' + (elig.type === 'FT' ? 'Full time' : 'Part time') : ''}</div>
      {acc === 'frontdesk' ? (
        <div style={{ borderRadius: 'var(--r-md)', background: 'var(--surface-2)', padding: '12px 14px', fontSize: 13, color: 'var(--ink-2)' }}>
          Front desk staff may order a <b>Full-Zip Jacket</b> only. It requires <b>manager approval</b> and is paid via <b>payroll deduction</b> — no company allowance applies.
        </div>
      ) : !clinical ? (
        <div style={{ borderRadius: 'var(--r-md)', background: 'var(--surface-2)', padding: '12px 14px', fontSize: 13, color: 'var(--ink-2)' }}>
          Scrub ordering isn’t part of your role. If you think this is a mistake, request a review below.
        </div>
      ) : !elig.ninetyOk ? (
        <div style={{ borderRadius: 'var(--r-md)', background: 'var(--warn-soft)', padding: '12px 14px', fontSize: 13, color: 'oklch(0.45 0.12 60)' }}>
          <b>Not yet eligible for company-paid scrubs.</b> New employees qualify after 90 days — you’re eligible on <b>{fmtDate(elig.ninetyDate)}</b>. You can still order now at your own expense.
        </div>
      ) : (
        <>
          <span className="badge badge-ok" style={{ fontSize: 10.5 }}><Icon name="check" /> Company-paid eligibility checked</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13, marginTop: 12 }}>
            <span style={{ color: 'var(--ink-3)' }}>Last company-paid order</span><b>{fmtDate(elig.lastCo)}</b>
            <span style={{ color: 'var(--ink-3)' }}>Next eligible date</span><b>{elig.eligibleNow ? 'Eligible now' : fmtDate(elig.nextEligible)}</b>
            <span style={{ color: 'var(--ink-3)' }}>Remaining allowance <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(reflects cart)</span></span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(remaining).map(([c, n]) => <span key={c} className="badge" style={{ background: n > 0 ? 'var(--accent-soft)' : 'var(--surface-2)', color: n > 0 ? 'var(--accent-strong)' : 'var(--ink-3)', fontSize: 11 }}>{CAT_LABEL[c]}s {n}</span>)}</span>
          </div>
        </>
      )}
      <button className="btn btn-quiet" style={{ fontSize: 11.5, padding: '5px 0', marginTop: 8 }} onClick={onReview}>If this looks wrong, request an eligibility review →</button>
    </div>
  );
}

/* ---- store ---- */
function ScrubStore({ me, onAdd, onReset }) {
  const acc = scrubAccess(me);
  const avail = acc === 'frontdesk' ? SCRUB_PRODUCTS.filter(p => p.cat === 'jacket') : CLINICAL.includes(acc) ? SCRUB_PRODUCTS : [];
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const list = avail.filter(p => (cat === 'all' || p.cat === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const catIds = ['top', 'pant', 'layer', 'jacket'].filter(c => avail.some(p => p.cat === c));
  const cats = [{ id: 'all', label: 'All' }, ...catIds.map(c => ({ id: c, label: CAT_LABEL[c] + 's' }))];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 20 }}>Shop Scrubs</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 4 }}>Color schedule guideline: <b>Mon/Wed/Fri black</b>, <b>Tues/Thurs/Sat blue</b> · Lab: black or blue.</p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onReset}><Icon name="refresh" /> Reset demo</button>
      </div>
      {!avail.length ? (
        <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--ink-3)' }}><Icon name="shirt" style={{ width: 28, height: 28, margin: '0 auto 10px', display: 'block' }} />Scrub ordering isn’t part of your role.</div>
      ) : (
        <>
          {acc === 'frontdesk' && <div className="card" style={{ padding: '11px 15px', marginBottom: 'var(--gap)', background: 'var(--accent-softer)', fontSize: 12.5, color: 'var(--ink-2)' }}><Icon name="bell" style={{ width: 14, height: 14, verticalAlign: '-2px', color: 'var(--accent-strong)' }} /> Front desk may order a <b>Full-Zip Jacket</b> only — manager approval required, paid via payroll deduction.</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--gap)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {cats.map(c => <button key={c.id} onClick={() => setCat(c.id)} className={cat === c.id ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12.5, padding: '7px 14px' }}>{c.label}</button>)}
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ..._ssel, minWidth: 200, padding: '9px 12px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(184px,1fr))', gap: 'var(--gap)' }}>
            {list.map(p => <ProductCard key={p.id} p={p} onAdd={onAdd} />)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 14, lineHeight: 1.5 }}>Prices vary by Women’s / Men’s fit. <b>XXL and larger sizes may carry an additional charge</b> — please inquire with HR about cost. Embroidery is included free.</div>
        </>
      )}
    </div>
  );
}

/* ---- cart ---- */
function ScrubCart({ me, cart, setCart, elig, caps, acc, onSubmit }) {
  const forcePayroll = acc === 'frontdesk';
  const [logo, setLogo] = useState(() => logoForOffice(me.loc));
  const [embName, setEmbName] = useState(me.name);
  const [pay, setPay] = useState('payroll');
  const effCaps = caps || { top: 0, pant: 0, layer: 0, jacket: 0 };
  const allocated = allocate(cart, effCaps);
  const empTotal = allocated.reduce((s, it) => s + it.employeeQty * it.price, 0);
  const setQty = (i, d) => setCart(c => c.map((it, j) => j === i ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const remove = (i) => setCart(c => c.filter((_, j) => j !== i));
  const catTotals = {}; cart.forEach(it => catTotals[it.cat] = (catTotals[it.cat] || 0) + it.qty);

  if (!cart.length) return <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}><Icon name="bag" style={{ width: 28, height: 28, margin: '0 auto 10px', display: 'block' }} />Your cart is empty. Add scrubs from the Store.</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {allocated.map((it, i) => (
          <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: scol(it.color).hex }}><Icon name="shirt" style={{ width: 22, height: 22, color: '#fff' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{CAT_LABEL[it.cat]} · {it.fit} · {it.size} · {scol(it.color).name} · {money(it.price)}</div>
              <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {it.companyQty > 0 && <span className="badge badge-ok" style={{ fontSize: 10.5 }}>{it.companyQty} company-paid</span>}
                {it.employeeQty > 0 && <span className="badge badge-warn" style={{ fontSize: 10.5 }}>{it.employeeQty} employee-paid</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
              <button className="btn btn-quiet" style={{ padding: 5 }} onClick={() => setQty(i, -1)}>–</button>
              <span className="mono" style={{ minWidth: 18, textAlign: 'center', fontSize: 13 }}>{it.qty}</span>
              <button className="btn btn-quiet" style={{ padding: 5 }} onClick={() => setQty(i, 1)}>+</button>
              <button className="btn btn-quiet" style={{ padding: 5, color: 'var(--accent-strong)' }} onClick={() => remove(i)} title="Remove">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 'var(--pad)', position: 'sticky', top: 14 }}>
        <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Review & submit</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>Logo</div>
            <select value={logo} onChange={e => setLogo(e.target.value)} style={{ ..._ssel, width: '100%', padding: '9px 11px', fontSize: 13 }}>{Object.values(SCRUB_LOGOS).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>Embroidered name <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(included free)</span></div>
            <input value={embName} onChange={e => setEmbName(e.target.value)} style={{ ..._ssel, width: '100%', padding: '9px 11px', fontSize: 13 }} />
          </label>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {['top', 'pant', 'layer', 'jacket'].map(c => {
            const total = catTotals[c] || 0; if (!total) return null;
            const cap = effCaps[c] || 0; const comp = Math.min(total, cap); const emp = total - comp;
            return <div key={c} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{CAT_LABEL[c]}s ×{total}</span><span className="mono" style={{ color: emp > 0 ? 'oklch(0.55 0.13 60)' : 'var(--ink-3)' }}>{comp} covered{emp > 0 ? ` · ${emp} on you` : ''}</span></div>;
          })}
        </div>

        {empTotal > 0 && forcePayroll && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
            <b>Payroll deduction.</b> Front desk jackets are deducted from an upcoming paycheck, pending manager approval.
          </div>
        )}
        {empTotal > 0 && !forcePayroll && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>How would you like to pay your portion?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[['payroll', 'Payroll deduction', 'Taken from an upcoming paycheck'], ['card', 'Pay now', 'Charge a card at checkout']].map(([v, t, d]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', border: '1.5px solid', borderColor: pay === v ? 'var(--accent)' : 'var(--line)', borderRadius: 'var(--r-md)', cursor: 'pointer', background: pay === v ? 'var(--accent-softer)' : 'transparent' }}>
                  <input type="radio" name="scrubpay" checked={pay === v} onChange={() => setPay(v)} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
                  <div><div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d}</div></div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13 }}>You pay</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>{money(empTotal)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>{forcePayroll ? 'Front desk jackets are employee-paid via payroll deduction, pending manager approval.' : !elig.ninetyOk ? 'Company-paid allowance starts after your 90-day mark.' : 'Company covers everything within your remaining allowance.'}</div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => onSubmit(allocated, empTotal, logo, embName, empTotal > 0 ? (forcePayroll ? 'payroll' : pay) : null)}><Icon name="check" /> Submit for approval</button>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, textAlign: 'center' }}>Goes to your manager for approval, then to CID Resources.</div>
      </div>
    </div>
  );
}

/* ---- shared order card ---- */
const SCRUB_STATUS = {
  pending_approval: ['badge-warn', 'Pending approval'], approved: ['badge-prog', 'Approved'],
  submitted: ['badge-prog', 'Submitted to CID'], received: ['badge-prog', 'Received'],
  delivered: ['badge-ok', 'Delivered'], denied: ['badge-lock', 'Denied'],
};
function OrderCard({ o, children, showMeta }) {
  const [st, label] = SCRUB_STATUS[o.status] || ['badge-todo', o.status];
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{o.requester}</span>
            <span className={'badge ' + st}>{label}</span>
            <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)', fontSize: 10.5 }}>{SCRUB_LOGOS[o.logo].name}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{o.jobTitle} · {o.loc} · ordered {fmtDate(o.ts)}</div>
        </div>
        {o.employeeTotal > 0 && <div style={{ textAlign: 'right' }}><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{o.payMethod === 'card' ? 'paid by card' : 'payroll deduction'}</div><div style={{ fontWeight: 700 }}>{money(o.employeeTotal)}</div></div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {o.items.map((it, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 9px', borderRadius: 99, border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: scol(it.color).hex, flex: 'none' }} />
            {it.qty}× {it.name} <span style={{ color: 'var(--ink-3)' }}>({it.fit} {it.size})</span>
          </span>
        ))}
      </div>
      {showMeta && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
          <span>Est. pickup: <b style={{ color: 'var(--ink-2)' }}>{fmtDate(o.estPickup)}</b></span>
          <span>Received: <b style={{ color: 'var(--ink-2)' }}>{fmtDate(o.receivedDate)}</b></span>
          <span>Delivered: <b style={{ color: 'var(--ink-2)' }}>{fmtDate(o.deliveredDate)}</b></span>
          {o.invoice && <span>Invoice: <b style={{ color: 'var(--ink-2)' }}>{o.invoice}</b> → accounting</span>}
          {o.notified && <span style={{ color: 'oklch(0.45 0.12 155)' }}>✓ staff notified via chat</span>}
        </div>
      )}
      {children && <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>{children}</div>}
    </div>
  );
}
function EmptyState({ msg }) { return <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--ink-3)' }}><Icon name="box" style={{ width: 26, height: 26, margin: '0 auto 10px', display: 'block' }} />{msg}</div>; }
function InvoiceUpload({ onUpload }) {
  return <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: 12.5 }}><Icon name="upload" /> Upload invoice<input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) onUpload(f.name); e.target.value = ''; }} /></label>;
}
function LimitModal({ info, onClose }) {
  const c = CAT_LABEL[info.cat].toLowerCase();
  const msg = info.frontdesk
    ? `Front-desk jackets aren’t company-paid — this jacket will be billed to you via payroll deduction, pending manager approval.`
    : (!info.clinical)
      ? `This item is at your own expense.`
      : (!info.ninety)
        ? `You’re not yet at your 90-day mark, so this ${c} is at your own expense for now.`
        : `You’ve reached your company-paid allowance for ${c}s. Any additional ${c}s are at your own expense — payroll deduction or pay now at checkout.`;
  return (
    <div className="fade-in" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', background: 'oklch(0.2 0.04 240 / 0.45)', backdropFilter: 'blur(3px)', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', background: 'var(--surface)', borderRadius: 18, boxShadow: 'var(--shadow-lg)', padding: 26, textAlign: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--warn-soft)', color: 'oklch(0.55 0.13 60)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><Icon name="bell" style={{ width: 22, height: 22 }} /></div>
        <h3 style={{ fontSize: 17 }}>Heads up</h3>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{msg}</p>
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/* ---- analytics ---- */
function Analytics({ orders }) {
  const live = orders.filter(o => o.status !== 'denied');
  const empSpend = live.reduce((s, o) => s + (o.employeeTotal || 0), 0);
  const compSpend = live.reduce((s, o) => s + o.items.reduce((a, it) => a + it.companyQty * it.price, 0), 0);
  const byOffice = {}; live.forEach(o => { byOffice[o.loc] = (byOffice[o.loc] || 0) + o.items.reduce((a, it) => a + it.qty * it.price, 0); });
  const byStatus = {}; orders.forEach(o => byStatus[o.status] = (byStatus[o.status] || 0) + 1);
  const invoices = live.filter(o => o.invoice);
  const maxOff = Math.max(1, ...Object.values(byOffice));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--gap)' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>COMPANY SPEND</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28 }}>{money(compSpend)}</div></div>
        <div className="card" style={{ padding: 'var(--pad)' }}><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>EMPLOYEE-PAID</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28 }}>{money(empSpend)}</div></div>
        <div className="card" style={{ padding: 'var(--pad)' }}><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>ORDERS</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28 }}>{live.length}</div></div>
        <div className="card" style={{ padding: 'var(--pad)' }}><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>INVOICES → ACCT</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28 }}>{invoices.length}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--gap)' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 14 }}>Spend by office</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(byOffice).sort((a, b) => b[1] - a[1]).map(([loc, v]) => (
              <div key={loc}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{loc}</span><span className="mono" style={{ color: 'var(--ink-3)' }}>{money(v)}</span></div><div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${v / maxOff * 100}%`, background: 'var(--accent)' }} /></div></div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 14 }}>Invoices to accounting</h3>
          {invoices.length === 0 ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No invoices uploaded yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invoices.map(o => <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}><Icon name="doc" style={{ width: 15, height: 15, color: 'var(--accent-strong)' }} /><span style={{ flex: 1 }}>{o.invoice}</span><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{o.requester.split(' ')[0]} · {o.loc}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- main ---- */
function Scrubs({ me, access, flash }) {
  const role = (window.scrubsRole)(me, access);
  const [tab, setTab] = useState('store');
  const [cart, setCart] = useState(loadCart);
  const [orders, setOrders] = useState(seedScrubOrders);

  const upCart = (fn) => setCart(c => { const n = typeof fn === 'function' ? fn(c) : fn; saveCart(n); return n; });
  const upOrders = (fn) => setOrders(o => { const n = typeof fn === 'function' ? fn(o) : fn; saveOrders(n); return n; });

  const acc = scrubAccess(me);
  const isClinical = CLINICAL.includes(acc);
  const myOrders = orders.filter(o => o.requesterId === me.id);
  const elig = useMemo(() => eligibility(me, myOrders), [me, orders]);
  const baseCaps = (acc === 'frontdesk' || !isClinical || !elig.ninetyOk) ? { top: 0, pant: 0, layer: 0, jacket: 0 } : elig.remaining;
  const cartByCat = {}; cart.forEach(it => cartByCat[it.cat] = (cartByCat[it.cat] || 0) + it.qty);
  const liveRemaining = {}; ['top', 'pant', 'layer', 'jacket'].forEach(k => { liveRemaining[k] = Math.max(0, (baseCaps[k] || 0) - Math.min(cartByCat[k] || 0, baseCaps[k] || 0)); });
  const [limitWarn, setLimitWarn] = useState(null);
  const byStatus = (s) => orders.filter(o => o.status === s);

  const addToCart = (p, fit, size, color) => {
    const before = cart.filter(x => x.cat === p.cat).reduce((s, x) => s + x.qty, 0);
    if (before === (baseCaps[p.cat] || 0)) setLimitWarn({ cat: p.cat, frontdesk: acc === 'frontdesk', ninety: elig.ninetyOk, clinical: isClinical });
    upCart(c => {
      const i = c.findIndex(x => x.productId === p.id && x.fit === fit && x.size === size && x.color === color);
      if (i >= 0) return c.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { productId: p.id, name: p.name, cat: p.cat, price: priceFor(p, fit), fit, size, color, qty: 1 }];
    });
  };
  const submit = (items, empTotal, logo, embName, payMethod) => {
    const order = { id: 'so' + Date.now(), requesterId: me.id, requester: me.name, jobTitle: me.jobTitle, loc: me.loc, logo, embroideredName: embName, ts: Date.now(), items, employeeTotal: empTotal, payMethod, status: 'pending_approval' };
    upOrders(o => [order, ...o]); upCart([]); setTab('myorders'); flash && flash('Order submitted for approval');
  };
  const patch = (id, fields, msg) => { upOrders(o => o.map(x => x.id === id ? { ...x, ...fields } : x)); if (msg) flash && flash(msg); };
  const resetDemo = () => { try { localStorage.removeItem('pd_scrubs_orders_v2'); localStorage.removeItem('pd_scrubs_cart_v2'); } catch (e) {} setCart([]); setOrders(seedScrubOrders()); flash && flash('Demo reset'); setTab('store'); };

  const cartCount = cart.reduce((s, it) => s + it.qty, 0);
  const TABS = [
    { id: 'store', label: 'Shop Products', icon: 'grid', roles: ['staff', 'ops', 'finance', 'admin'] },
    { id: 'myorders', label: 'My Orders', icon: 'doc', roles: ['staff', 'ops', 'finance', 'admin'] },
    { id: 'cart', label: 'Cart', icon: 'bag', roles: ['staff', 'ops', 'finance', 'admin'] },
    { id: 'approve', label: 'Pending Approval', icon: 'check', roles: ['ops', 'admin'] },
    { id: 'submit', label: 'Approved · To Submit', icon: 'box', roles: ['ops', 'admin'] },
    { id: 'outstanding', label: 'Outstanding', icon: 'truck', roles: ['ops', 'admin'] },
    { id: 'received', label: 'Received', icon: 'box', roles: ['ops', 'admin'] },
    { id: 'delivered', label: 'Delivered', icon: 'check', roles: ['ops', 'admin'] },
    { id: 'analytics', label: 'Analytics', icon: 'grid', roles: ['ops', 'finance', 'admin'] },
  ].filter(t => t.roles.includes(role));

  const content = () => {
    switch (tab) {
      case 'store': return <><EligibilityPanel me={me} elig={elig} remaining={liveRemaining} acc={acc} onReview={() => flash && flash('Eligibility review requested — HR will follow up')} /><ScrubStore me={me} onAdd={addToCart} onReset={resetDemo} /></>;
      case 'cart': return <><EligibilityPanel me={me} elig={elig} remaining={liveRemaining} acc={acc} onReview={() => flash && flash('Eligibility review requested — HR will follow up')} /><ScrubCart me={me} cart={cart} setCart={upCart} elig={elig} caps={baseCaps} acc={acc} onSubmit={submit} /></>;
      case 'myorders': return myOrders.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{myOrders.map(o => <OrderCard key={o.id} o={o} showMeta />)}</div> : <EmptyState msg="You haven't placed any scrub orders yet." />;
      case 'approve': { const l = byStatus('pending_approval'); return l.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{l.map(o => <OrderCard key={o.id} o={o}><button className="btn btn-ghost" onClick={() => patch(o.id, { status: 'denied' }, 'Order denied')}>Deny</button><button className="btn btn-primary" onClick={() => patch(o.id, { status: 'approved', estPickup: Date.now() + 14 * 864e5 }, 'Order approved')}><Icon name="check" /> Approve</button></OrderCard>)}</div> : <EmptyState msg="No orders waiting on approval." />; }
      case 'submit': { const l = byStatus('approved'); return (<div><div className="card" style={{ padding: '12px 16px', marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><span style={{ fontSize: 13.5, flex: 1 }}><b>{l.length}</b> approved order(s) ready for CID Resources.</span><button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={!l.length} onClick={() => printOrders(l)}><Icon name="doc" /> Print batch form</button><button className="btn btn-primary" style={{ fontSize: 12.5 }} disabled={!l.length} onClick={() => { downloadCSV(l); upOrders(o => o.map(x => x.status === 'approved' ? { ...x, status: 'submitted' } : x)); flash && flash('Batch exported & submitted to CID Resources'); }}><Icon name="box" /> Export CSV & submit batch</button></div>{l.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{l.map(o => <OrderCard key={o.id} o={o} showMeta><button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => printOrders([o])}><Icon name="doc" /> Print form</button><button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => downloadCSV([o])}><Icon name="upload" /> CSV</button><button className="btn btn-primary" onClick={() => patch(o.id, { status: 'submitted' }, 'Submitted to CID Resources')}>Mark submitted</button></OrderCard>)}</div> : <EmptyState msg="No approved orders awaiting submission." />}</div>); }
      case 'outstanding': { const l = byStatus('submitted'); return l.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{l.map(o => <OrderCard key={o.id} o={o} showMeta><InvoiceUpload onUpload={n => patch(o.id, { invoice: n }, 'Invoice sent to accounting')} /><button className="btn btn-primary" onClick={() => patch(o.id, { status: 'received', receivedDate: Date.now() }, 'Marked received')}><Icon name="truck" /> Mark received</button></OrderCard>)}</div> : <EmptyState msg="No outstanding vendor orders." />; }
      case 'received': { const l = byStatus('received'); return l.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{l.map(o => <OrderCard key={o.id} o={o} showMeta><InvoiceUpload onUpload={n => patch(o.id, { invoice: n }, 'Invoice sent to accounting')} /><button className="btn btn-primary" onClick={() => patch(o.id, { status: 'delivered', deliveredDate: Date.now(), notified: true }, `${o.requester.split(' ')[0]} notified via chat — order delivered`)}><Icon name="check" /> Mark delivered & notify</button></OrderCard>)}</div> : <EmptyState msg="No received orders awaiting delivery." />; }
      case 'delivered': { const l = byStatus('delivered'); return l.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{l.map(o => <OrderCard key={o.id} o={o} showMeta />)}</div> : <EmptyState msg="No delivered orders yet." />; }
      case 'analytics': return <Analytics orders={orders} />;
      default: return null;
    }
  };

  return (
    <div className="fade-in">
      {limitWarn && <LimitModal info={limitWarn} onClose={() => setLimitWarn(null)} />}
      <div className="card" style={{ padding: 'clamp(18px,3vw,26px)', marginBottom: 'var(--gap)', background: 'var(--accent-softer)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 540 }}>
            <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Staff Scrub Orders</h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>Choose your scrub pieces, pick your logo and embroidery, then review what the company covers before submitting your order.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setTab('store')}><Icon name="grid" /> Shop products</button>
              <button className="btn btn-ghost" onClick={() => setTab('cart')}><Icon name="bag" /> View cart{cartCount > 0 ? ` (${cartCount})` : ''}</button>
            </div>
          </div>
          <div style={{ width: 76, height: 76, borderRadius: '50%', border: '1.5px solid var(--line)', display: 'grid', placeItems: 'center', background: 'var(--surface)', flex: 'none' }}><Icon name="shirt" style={{ width: 34, height: 34, color: 'var(--accent-strong)' }} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{ border: 'none', background: 'none', padding: '10px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
            color: tab === tb.id ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb.id ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
            <Icon name={tb.icon} style={{ width: 15, height: 15 }} /> {tb.label}
            {tb.id === 'cart' && cartCount > 0 && <span className="badge" style={{ background: 'var(--accent)', color: '#fff', fontSize: 10.5, padding: '1px 7px' }}>{cartCount}</span>}
            {tb.id === 'approve' && byStatus('pending_approval').length > 0 && <span className="badge badge-warn" style={{ fontSize: 10.5, padding: '1px 7px' }}>{byStatus('pending_approval').length}</span>}
          </button>
        ))}
      </div>

      {content()}
    </div>
  );
}

Object.assign(window, { Scrubs });
