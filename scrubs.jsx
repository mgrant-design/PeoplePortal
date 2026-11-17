/* scrubs.jsx — Uniforms: employees order within their allowance; every order goes to the
   uniform approver, who approves or denies it, downloads the approved ones and marks them
   sent once the order has gone to the vendor. Orders are approval requests (/api/approvals,
   kind "uniform"); the server works out what is free. */

const _ssel = { padding: '7px 9px', borderRadius: 'var(--r-sm)', fontSize: 12.5, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', appearance: 'auto', fontFamily: 'var(--font-body)' };

function ColorSwatch({ c, active, onClick }) {
  const col = PD_UNIFORMS.COLORS[c];
  return <button onClick={onClick} title={col.name} style={{ width: 22, height: 22, borderRadius: '50%', background: col.hex, border: active ? '2px solid var(--accent-strong)' : '1.5px solid var(--line)', outline: active ? '2px solid var(--accent-soft)' : 'none', cursor: 'pointer', flex: 'none', padding: 0 }} />;
}

function ProductCard({ p, onAdd }) {
  const U = PD_UNIFORMS;
  const [fit, setFit] = useState('Women');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('black');
  const [added, setAdded] = useState(false);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '2', background: PD_UNIFORMS.COLORS[color].hex, display: 'grid', placeItems: 'center' }}>
        <Icon name="shirt" style={{ width: 34, height: 34, color: '#fff' }} />
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.2 }}>{p.name}</span>
          <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)', fontSize: 10 }}>{U.CAT_LABEL[p.cat]}</span>
        </div>
        <div className="mono" style={{ fontWeight: 700, fontSize: 14, marginTop: -2 }}>{money(U.priceFor(p, fit))} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-3)' }}>· {fit}</span></div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4, minHeight: 30 }}>{p.desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Object.keys(U.COLORS).map(c => <ColorSwatch key={c} c={c} active={c === color} onClick={() => setColor(c)} />)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={fit} onChange={e => setFit(e.target.value)} style={{ ..._ssel, flex: 1 }}>{U.FITS.map(f => <option key={f}>{f}</option>)}</select>
          <select value={size} onChange={e => setSize(e.target.value)} style={{ ..._ssel, flex: 1 }}>{U.SIZES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <button className={added ? 'btn btn-ghost' : 'btn btn-primary'} style={{ width: '100%', justifyContent: 'center', padding: '8px', fontSize: 12.5 }}
          onClick={() => { onAdd(p, fit, size, color); setAdded(true); setTimeout(() => setAdded(false), 1100); }}>
          {added ? <><Icon name="check" style={{ width: 14, height: 14 }} /> Added to cart</> : <><Icon name="plus" style={{ width: 14, height: 14 }} /> Add to cart</>}
        </button>
      </div>
    </div>
  );
}

/* what this person may order, and what is still free this year */
function EligibilityPanel({ me, el }) {
  const U = PD_UNIFORMS;
  const box = (tone, children) => <div style={{ borderRadius: 'var(--r-md)', background: tone, padding: '12px 14px', fontSize: 13, color: 'var(--ink-2)' }}>{children}</div>;
  return (
    <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)' }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{me.name}{el.type ? ' · ' + el.type : ''}</div>
      {el.reason === 'role' ? box('var(--surface-2)', 'Uniform ordering isn’t part of your role.')
        : el.reason === 'ninety' ? box('var(--warn-soft)', <>You can order from your 90th day, <b>{fmtDay(Date.parse(el.ninetyDate + 'T12:00:00'))}</b>.</>)
        : el.role === 'frontdesk' ? box('var(--surface-2)', <>Front desk staff order the <b>Full-Zip Jacket</b> only, paid by payroll deduction.</>)
        : el.reason === 'noType' ? box('var(--warn-soft)', 'No free allowance: your record has no full-time or part-time status.')
        : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ color: 'var(--ink-3)' }}>Free this year</span>
            {U.CATS.map(c => <span key={c} className="badge" style={{ background: el.remaining[c] > 0 ? 'var(--accent-soft)' : 'var(--surface-2)', color: el.remaining[c] > 0 ? 'var(--accent-strong)' : 'var(--ink-3)', fontSize: 11 }}>{U.CAT_LABEL[c]}s {el.remaining[c]}</span>)}
          </div>
        )}
    </div>
  );
}

function UniformStore({ el, onAdd }) {
  const U = PD_UNIFORMS;
  const avail = el.role === 'frontdesk' ? U.PRODUCTS.filter(p => p.cat === 'jacket') : el.role === 'clinical' ? U.PRODUCTS : [];
  const [cat, setCat] = useState('all');
  const list = avail.filter(p => cat === 'all' || p.cat === cat);
  const cats = [{ id: 'all', label: 'All' }, ...U.CATS.filter(c => avail.some(p => p.cat === c)).map(c => ({ id: c, label: U.CAT_LABEL[c] + 's' }))];
  if (!avail.length || !el.canOrder) return null;
  return (
    <div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 12 }}>Color schedule guideline: <b>Mon/Wed/Fri black</b>, <b>Tues/Thurs/Sat blue</b> · Lab: black or blue.</p>
      {cats.length > 2 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--gap)' }}>
        {cats.map(c => <button key={c.id} onClick={() => setCat(c.id)} className={cat === c.id ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12.5, padding: '7px 14px' }}>{c.label}</button>)}
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(184px,1fr))', gap: 'var(--gap)' }}>
        {list.map(p => <ProductCard key={p.id} p={p} onAdd={onAdd} />)}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 14, lineHeight: 1.5 }}>Prices vary by Women’s / Men’s fit. <b>XXL and larger sizes may carry an additional charge</b> — please inquire with HR about cost. Embroidery is included free.</div>
    </div>
  );
}

function UniformCart({ me, cart, setCart, el, prior, onSubmit, busy, err }) {
  const U = PD_UNIFORMS;
  const [logo, setLogo] = useState(() => U.logoForOffice(me.loc || me.location));
  const [embName, setEmbName] = useState(me.name);
  const [pay, setPay] = useState('payroll');
  let preview = null;
  try { preview = U.buildOrder(me, { items: cart, logo, embroideredName: embName, payMethod: pay }, prior, Date.now()); } catch (e) { preview = null; }
  const setQty = (i, d) => setCart(c => c.map((it, j) => j === i ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const remove = (i) => setCart(c => c.filter((_, j) => j !== i));
  if (!cart.length) return <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}><Icon name="bag" style={{ width: 28, height: 28, margin: '0 auto 10px', display: 'block' }} />Your cart is empty.</div>;
  const items = preview ? preview.items : [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cart.map((it, i) => {
          const a = items[i] || {};
          const p = U.PRODUCTS.find(x => x.id === it.productId);
          return (
            <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: U.COLORS[it.color].hex }}><Icon name="shirt" style={{ width: 22, height: 22, color: '#fff' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{U.CAT_LABEL[p.cat]} · {it.fit} · {it.size} · {colorName(it.color)} · {money(U.priceFor(p, it.fit))}</div>
                <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {a.companyQty > 0 && <span className="badge badge-ok" style={{ fontSize: 10.5 }}>{a.companyQty} free</span>}
                  {a.employeeQty > 0 && <span className="badge badge-warn" style={{ fontSize: 10.5 }}>{a.employeeQty} you pay</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                <button className="btn btn-quiet" style={{ padding: 5 }} onClick={() => setQty(i, -1)}>–</button>
                <span className="mono" style={{ minWidth: 18, textAlign: 'center', fontSize: 13 }}>{it.qty}</span>
                <button className="btn btn-quiet" style={{ padding: 5 }} onClick={() => setQty(i, 1)}>+</button>
                <button className="btn btn-quiet" style={{ padding: 5, color: 'var(--accent-strong)' }} onClick={() => remove(i)} title="Remove">×</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: 'var(--pad)', position: 'sticky', top: 14 }}>
        <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Review & submit</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>Logo</div>
            <select value={logo} onChange={e => setLogo(e.target.value)} style={{ ..._ssel, width: '100%', padding: '9px 11px', fontSize: 13 }}>{Object.values(U.LOGOS).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>Embroidered name</div>
            <input value={embName} onChange={e => setEmbName(e.target.value)} style={{ ..._ssel, width: '100%', padding: '9px 11px', fontSize: 13 }} />
          </label>
        </div>
        {preview && preview.employeeTotal > 0 && el.role !== 'frontdesk' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Your part is paid by</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {[['payroll', 'Payroll deduction'], ['card', 'Card']].map(([v, t]) => (
                <label key={v} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', border: '1.5px solid', borderColor: pay === v ? 'var(--accent)' : 'var(--line)', borderRadius: 'var(--r-md)', cursor: 'pointer', background: pay === v ? 'var(--accent-softer)' : 'transparent', fontSize: 13, fontWeight: 600 }}>
                  <input type="radio" name="uniformpay" checked={pay === v} onChange={() => setPay(v)} style={{ accentColor: 'var(--accent)' }} /> {t}
                </label>
              ))}
            </div>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13 }}>You pay</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>{money(preview ? preview.employeeTotal : 0)}</span>
        </div>
        {err && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 10 }}>{err}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !preview} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => onSubmit({ items: cart, logo, embroideredName: embName, payMethod: pay })}><Icon name="check" /> Submit order</button>
      </div>
    </div>
  );
}

const ORDER_STATUS = { pending: ['badge-warn', 'Waiting for approval'], approved: ['badge-prog', 'Approved'], denied: ['badge-lock', 'Denied'] };
function OrderCard({ o, children }) {
  const U = PD_UNIFORMS;
  const p = o.payload || {};
  const [st, label] = o.sent ? ['badge-ok', 'Sent'] : (ORDER_STATUS[o.status] || ['badge-todo', o.status]);
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{o.submittedName}</span>
            <span className={'badge ' + st}>{label}</span>
            <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)', fontSize: 10.5 }}>{(U.LOGOS[p.logo] || {}).name}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{p.jobTitle} · {p.office} · ordered {fmtDay(Date.parse(o.createdAt))}{o.sentAt ? ` · sent ${fmtDay(Date.parse(o.sentAt))}` : ''}</div>
        </div>
        {p.employeeTotal > 0 && <div style={{ textAlign: 'right' }}><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.payMethod === 'card' ? 'card' : 'payroll deduction'}</div><div style={{ fontWeight: 700 }}>{money(p.employeeTotal)}</div></div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {(p.items || []).map((it, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 9px', borderRadius: 99, border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: (U.COLORS[it.color] || U.COLORS.black).hex, flex: 'none' }} />
            {it.qty}× {it.name} <span style={{ color: 'var(--ink-3)' }}>({it.fit} {it.size})</span>
          </span>
        ))}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>{children}</div>}
    </div>
  );
}
function EmptyState({ msg }) { return <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--ink-3)' }}><Icon name="box" style={{ width: 26, height: 26, margin: '0 auto 10px', display: 'block' }} />{msg}</div>; }
function SentSwitch({ on, onChange, disabled }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} /> Sent
    </label>
  );
}

/* ---- main ---- */
function Scrubs({ me, access, flash }) {
  const U = PD_UNIFORMS;
  const myEmail = (me.workEmail || '').toLowerCase();
  const approver = String(((window.HR && window.HR.approvers) || {}).uniform || '').toLowerCase();
  const isApprover = myEmail === approver || access.flags.isAdmin;
  const [tab, setTab] = useState('store');
  const [cart, setCart] = useState([]);
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => Promise.all([
    fetchApprovals().then(a => setMine((a.mine || []).filter(r => r.kind === 'uniform'))),
    isApprover ? pdApi('/api/approvals', { query: { kind: 'uniform' } }).then(d => setAll(d.orders || [])) : null,
  ]).catch(e => setErr('Couldn’t load orders: ' + e.message));
  useEffect(() => { load(); const h = () => load(); window.addEventListener('pd-approvals-changed', h); return () => window.removeEventListener('pd-approvals-changed', h); }, []);

  const prior = mine.map(r => ({ status: r.status, createdAt: r.createdAt, items: (r.payload || {}).items || [] }));
  const el = U.eligibility(me, prior, Date.now());
  const run = (p, okText) => { setBusy(true); setErr(''); return p.then(() => { if (okText && flash) flash(okText); return load(); }).catch(e => { setErr(e.message); throw e; }).finally(() => setBusy(false)); };

  const addToCart = (p, fit, size, color) => setCart(c => {
    const i = c.findIndex(x => x.productId === p.id && x.fit === fit && x.size === size && x.color === color);
    return i >= 0 ? c.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x) : [...c, { productId: p.id, fit, size, color, qty: 1 }];
  });
  const submit = (order) => run(submitApproval('uniform', order), 'Order submitted.').then(() => { setCart([]); setTab('myorders'); }).catch(() => {});
  const decide = (o, decision) => run(decideApproval(o.id, decision), decision === 'approve' ? 'Order approved.' : 'Order denied.').catch(() => {});
  const markSent = (ids, sent) => run(pdApi('/api/approvals', { method: 'POST', body: { action: 'markSent', ids, sent } })).catch(() => {});

  const pending = all.filter(o => o.status === 'pending');
  const toSend = all.filter(o => o.status === 'approved' && !o.sent);
  const sent = all.filter(o => o.status === 'approved' && o.sent);
  const cartCount = cart.reduce((s, it) => s + it.qty, 0);
  const TABS = [
    { id: 'store', label: 'Shop', icon: 'grid' },
    { id: 'cart', label: 'Cart', icon: 'bag', count: cartCount },
    { id: 'myorders', label: 'My orders', icon: 'doc' },
    ...(isApprover ? [
      { id: 'approve', label: 'Pending approval', icon: 'check', count: pending.length },
      { id: 'tosend', label: 'Approved · to send', icon: 'box', count: toSend.length },
      { id: 'sent', label: 'Sent', icon: 'truck' },
    ] : []),
  ];
  const list = (l, msg, actions) => l.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{l.map(o => <OrderCard key={o.id} o={o}>{actions && actions(o)}</OrderCard>)}</div> : <EmptyState msg={msg} />;

  const content = () => {
    switch (tab) {
      case 'store': return <><EligibilityPanel me={me} el={el} /><UniformStore el={el} onAdd={addToCart} /></>;
      case 'cart': return <><EligibilityPanel me={me} el={el} /><UniformCart me={me} cart={cart} setCart={setCart} el={el} prior={prior} onSubmit={submit} busy={busy} err={err} /></>;
      case 'myorders': return list(mine.map(r => ({ ...r, submittedName: r.submittedName })), 'You haven’t ordered uniforms yet.');
      case 'approve': return list(pending, 'No orders waiting for approval.', o => <><button className="btn btn-ghost" disabled={busy} onClick={() => decide(o, 'deny')}>Deny</button><button className="btn btn-primary" disabled={busy} onClick={() => decide(o, 'approve')}><Icon name="check" /> Approve</button></>);
      case 'tosend': return (
        <div>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, flex: 1 }}><b>{toSend.length}</b> approved order{toSend.length === 1 ? '' : 's'} to send</span>
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={!toSend.length} onClick={() => downloadOrders(toSend)}><Icon name="upload" /> Download</button>
            <button className="btn btn-primary" style={{ fontSize: 12.5 }} disabled={busy || !toSend.length} onClick={() => markSent(toSend.map(o => o.id), true)}><Icon name="check" /> Mark all sent</button>
          </div>
          {list(toSend, 'No approved orders to send.', o => <SentSwitch on={false} disabled={busy} onChange={v => markSent([o.id], v)} />)}
        </div>
      );
      case 'sent': return list(sent, 'No orders marked sent yet.', o => <SentSwitch on={true} disabled={busy} onChange={v => markSent([o.id], v)} />);
      default: return null;
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Uniforms</h1>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{ border: 'none', background: 'none', padding: '10px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
            color: tab === tb.id ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb.id ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
            <Icon name={tb.icon} style={{ width: 15, height: 15 }} /> {tb.label}
            {tb.count > 0 && <span className="badge" style={{ background: 'var(--accent)', color: '#fff', fontSize: 10.5, padding: '1px 7px' }}>{tb.count}</span>}
          </button>
        ))}
      </div>
      {err && tab !== 'cart' && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{err}</div>}
      {content()}
    </div>
  );
}

Object.assign(window, { Scrubs });
