/* login.jsx — sign-in. Google Workspace accounts only (company domains).
   "Continue with Google" opens Google's real account chooser; the returned account is
   domain-checked and matched to the roster. No email/password, no demo bypass in the product.
   Configure window.PD_AUTH.googleClientId (in the page) to enable it. */

function Login({ onLogin }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const gbtnRef = useRef(null);
  const GOOGLE_CLIENT_ID = (window.PD_AUTH && window.PD_AUTH.googleClientId) || '';

  const onGoogle = (resp) => {
    try {
      const part = resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(decodeURIComponent(escape(window.atob(part))));
      const email = (payload.email || '').toLowerCase();
      setErr('');
      if (!isCompanyEmail(email)) { setErr('Use your company Google account (' + COMPANY_DOMAINS.map(d => '@' + d).join(' / ') + ').'); return; }
      const emp = findByEmail(email);
      if (!emp) { setErr('No account found for ' + email + '. Contact HR.'); return; }
      if (emp.status === 'Terminated') { setErr('This account is inactive. Contact HR.'); return; }
      setBusy(true);
      saveSession(emp);
      setTimeout(() => onLogin(emp), 150);
    } catch (e) { setErr('Google sign-in failed. Please try again.'); }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    const init = () => {
      if (cancelled || !(window.google && window.google.accounts && window.google.accounts.id)) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogle, hd: 'puredental.com', auto_select: false });
      if (gbtnRef.current) {
        gbtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(gbtnRef.current, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width: 300 });
      }
    };
    if (window.google && window.google.accounts) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = init;
      document.head.appendChild(s);
    }
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20,
      background: 'radial-gradient(120% 90% at 50% -10%, var(--accent-softer), var(--bg) 60%)' }}>
      <div className="fade-in" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--accent), var(--accent-strong))', color: '#fff', boxShadow: 'var(--shadow-md)' }}>
            <svg viewBox="0 0 20 20" width="26" height="26" fill="currentColor"><path d={ICON.tooth} /></svg>
          </div>
          <h1 style={{ fontSize: 25 }}>Pure Dental</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>People Portal · Sign in to continue</p>
        </div>

        <div className="card" style={{ padding: 'clamp(20px,5vw,28px)', boxShadow: 'var(--shadow-lg)' }}>
          {GOOGLE_CLIENT_ID ? (
            <>
              <div ref={gbtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
              {busy && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}><span className="spin" style={{ width: 18, height: 18, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'block' }} /></div>}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '6px 4px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Google sign-in not configured</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>Add your Google OAuth Client ID to <code>PD_AUTH.googleClientId</code> in the page config, and add this site to the project’s Authorized JavaScript origins.</div>
            </div>
          )}

          {err && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="bell" style={{ width: 14, height: 14 }} /> {err}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink-3)' }}>
            <Icon name="lock" style={{ width: 15, height: 15, color: 'var(--accent)', flex: 'none' }} />
            Protected sign-in · company Google accounts only · domain-restricted.
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Login });
