/* navscroll.jsx — horizontal-scroll wrapper for the top category bar.
   The portal has many nav categories; on 1080p/laptop widths they overflow.
   This wraps the nav row and adds:
     • edge fade + chevron buttons that appear only when there's more to see
     • hover-to-edge auto-scroll (move the mouse toward either border to glide)
     • click chevrons to page, and vertical wheel → horizontal scroll
   Keyboard/tab order is preserved; chevrons are aria-hidden decorative helpers.
   Used by app.jsx in place of the bare <nav className="topnav desktop-nav">. */

function NavScroller({ children, className, wrapClassName }) {
  const ref = React.useRef(null);
  const velRef = React.useRef(0);
  const rafRef = React.useRef(0);
  const [ov, setOv] = React.useState({ left: false, right: false });

  const measure = React.useCallback(() => {
    const el = ref.current; if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOv({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    measure();
    const ro = ('ResizeObserver' in window) ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // native non-passive wheel so we can convert vertical scroll → horizontal
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (ro) ro.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      el.removeEventListener('wheel', onWheel);
    };
  }, [measure]);

  // auto-scroll loop driven by velRef (set on edge hover)
  React.useEffect(() => {
    const loop = () => {
      const el = ref.current, v = velRef.current;
      if (el && v) el.scrollLeft += v;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const zone = 72, max = 16; // px hot-zone, px/frame max speed
    const x = e.clientX - r.left;
    if (x < zone) velRef.current = -Math.ceil(((zone - x) / zone) * max);
    else if (x > r.width - zone) velRef.current = Math.ceil(((x - (r.width - zone)) / zone) * max);
    else velRef.current = 0;
  };
  const stop = () => { velRef.current = 0; };
  const page = (dir) => { const el = ref.current; if (el) el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.7), behavior: 'smooth' }); };

  return (
    <div className={'nav-scroller ' + (wrapClassName || '')}>
      <div className={'nav-fade left' + (ov.left ? ' show' : '')} aria-hidden="true"></div>
      <button type="button" tabIndex={-1} aria-hidden="true" className={'nav-arrow left' + (ov.left ? ' show' : '')} onClick={() => page(-1)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
      </button>
      <nav ref={ref} className={className} onMouseMove={onMove} onMouseLeave={stop}>
        {children}
      </nav>
      <div className={'nav-fade right' + (ov.right ? ' show' : '')} aria-hidden="true"></div>
      <button type="button" tabIndex={-1} aria-hidden="true" className={'nav-arrow right' + (ov.right ? ' show' : '')} onClick={() => page(1)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
      </button>
    </div>
  );
}

window.NavScroller = NavScroller;
