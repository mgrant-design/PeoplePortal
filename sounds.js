/* sounds.js — notification sound engine + per-personality picker logic.
   All sounds are synthesized live (no files). Each font personality (data-font)
   has two locked sounds; the picker in the notifications panel maps them to
   buttons 1 & 2, with a third button that mutes for the current session only.

   Exposes window.PDSound:
     names()            -> ['Sound1','Sound2'] for the current personality
     preview(n)         -> play sound n (1|2) for the current personality (explicit audition)
     ding()             -> play the user's chosen sound, unless muted (for real notifications)
     getChoice(empId)   -> 1|2   setChoice(empId, n)
     isMuted() setMuted(b) resetMute()   (mute is session-only, reset on login) */
(function () {
  let ctx;
  const ensure = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function vol() { try { const s = localStorage.getItem('pd_sound_vol'); return s != null ? +s : 0.65; } catch (e) { return 0.65; } }

  function bus(c, opt) {
    opt = opt || {};
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opt.cutoff || 7000; lp.Q.value = 0.5;
    const out = c.createGain(); out.gain.value = (opt.level || 1) * vol() * 0.2;
    lp.connect(out).connect(c.destination); return lp;
  }
  function blip(c, m, o) {
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t0);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glideTo), t0 + (o.dur) * 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(o.gain != null ? o.gain : 0.7, t0 + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(m); osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  function noise(c, m, o) {
    const t0 = c.currentTime + (o.at || 0);
    const n = Math.max(1, Math.floor(c.sampleRate * o.dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.value = o.freq || 3000; f.Q.value = o.q || 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(o.gain || 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(m); src.start(t0); src.stop(t0 + o.dur + 0.02);
  }
  function glass(c, m, o) {
    const f = o.f, gain = o.gain != null ? o.gain : 0.5, dur = o.dur || 0.4, at = o.at || 0;
    blip(c, m, { f, at, dur, gain, attack: 0.003 });
    blip(c, m, { f: f * 2, at, dur: dur * 0.5, gain: gain * 0.18, attack: 0.003 });
    blip(c, m, { f: f * 3, at, dur: dur * 0.28, gain: gain * 0.07, attack: 0.003 });
  }
  function arp(c, m, o) {
    o.freqs.forEach((f, i) => blip(c, m, { f, type: o.type || 'sine', at: i * (o.step || 0.07), dur: i === o.freqs.length - 1 ? (o.last || 0.3) : (o.dur || 0.16), gain: o.gain != null ? o.gain : 0.55 }));
  }
  function wail(c, m, o) {
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.value = o.f;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = o.rate || 6;
    const lg = c.createGain(); lg.gain.value = o.depth || 40; lfo.connect(lg).connect(osc.detune);
    const g = c.createGain(); const dur = o.dur || 0.5;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(o.gain != null ? o.gain : 0.4, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(m); osc.start(t0); lfo.start(t0); osc.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  }

  /* ---- the locked sounds ---- */
  const S = {
    ready: (c) => { const m = bus(c, { cutoff: 7500 }); arp(c, m, { freqs: [880, 1175, 1760], step: 0.06, dur: 0.09, gain: 0.55, last: 0.24 }); },
    skip: (c) => { const m = bus(c, { cutoff: 7500 }); blip(c, m, { f: 1046, dur: 0.08, gain: 0.52 }); blip(c, m, { f: 1046, at: 0.085, dur: 0.08, gain: 0.5 }); blip(c, m, { f: 1568, at: 0.17, dur: 0.22, gain: 0.6 }); },
    swell: (c) => { const m = bus(c, { cutoff: 3800 }); blip(c, m, { f: 330, dur: 0.6, gain: 0.5, attack: 0.12 }); blip(c, m, { f: 495, dur: 0.5, gain: 0.3, attack: 0.12 }); },
    folio: (c) => { const m = bus(c, { cutoff: 6500 }); arp(c, m, { freqs: [784, 988, 1175, 1480], type: 'triangle', step: 0.045, dur: 0.34, gain: 0.5, last: 0.42 }); blip(c, m, { f: 1976, at: 0.16, dur: 0.2, gain: 0.12 }); },
    musicbox: (c) => { const m = bus(c, { cutoff: 8000 }); glass(c, m, { f: 1318, dur: 0.32, gain: 0.44 }); glass(c, m, { f: 1760, at: 0.12, dur: 0.4, gain: 0.4 }); },
    wish: (c) => { const m = bus(c, { cutoff: 8500 }); arp(c, m, { freqs: [1175, 1568, 1976], step: 0.06, dur: 0.1, gain: 0.45, last: 0.18 }); glass(c, m, { f: 2349, at: 0.14, dur: 0.3, gain: 0.16 }); },
    uplink: (c) => { const m = bus(c, { cutoff: 8500 }); noise(c, m, { at: 0, dur: 0.01, gain: 0.1, freq: 6000 }); arp(c, m, { freqs: [784, 1046, 1318, 1568], type: 'square', step: 0.06, dur: 0.07, gain: 0.3, last: 0.2 }); blip(c, m, { f: 2093, at: 0.18, dur: 0.16, gain: 0.14 }); },
    decode: (c) => { const m = bus(c, { cutoff: 8500 }); arp(c, m, { freqs: [1568, 1318, 1046, 1175], type: 'square', step: 0.055, dur: 0.07, gain: 0.3, last: 0.12 }); blip(c, m, { f: 1760, at: 0.2, dur: 0.16, gain: 0.16 }); },
    signal: (c) => { const m = bus(c, { cutoff: 6500 });[0, 0.12, 0.24].forEach(t => blip(c, m, { f: 880, at: t, dur: 0.08, gain: 0.7 })); },
    lockon: (c) => { const m = bus(c, { cutoff: 6000 }); blip(c, m, { f: 1046, dur: 0.1, gain: 0.7 }); blip(c, m, { f: 784, at: 0.09, dur: 0.26, gain: 0.8 }); blip(c, m, { f: 392, at: 0.02, dur: 0.2, gain: 0.36 }); },
    nocturne: (c) => { const m = bus(c, { cutoff: 7500 }); glass(c, m, { f: 1318, at: 0, dur: 0.3, gain: 0.42 }); glass(c, m, { f: 1047, at: 0.12, dur: 0.34, gain: 0.44 }); glass(c, m, { f: 880, at: 0.26, dur: 0.5, gain: 0.46 }); },
    candle: (c) => { const m = bus(c, { cutoff: 8000 }); glass(c, m, { f: 1568, dur: 0.4, gain: 0.4 }); wail(c, m, { f: 2350, at: 0.06, dur: 0.5, gain: 0.12, depth: 30, rate: 5 }); },
    twotone: (c) => { const m = bus(c, { cutoff: 6500 }); blip(c, m, { f: 660, dur: 0.15, gain: 0.6 }); blip(c, m, { f: 880, at: 0.085, dur: 0.26, gain: 0.68 }); },
  };

  /* personality -> [ [name, fn], [name, fn] ] */
  const MAP = {
    modern: [['Ready', S.ready], ['Skip', S.skip]],
    editorial: [['Swell', S.swell], ['Folio', S.folio]],
    sweet: [['Music box', S.musicbox], ['Wish', S.wish]],
    terminal: [['Uplink', S.uplink], ['Decode', S.decode]],
    bold: [['Signal', S.signal], ['Lock-on', S.lockon]],
    noir: [['Nocturne', S.nocturne], ['Candle', S.candle]],
  };
  const curFont = () => (document.documentElement.getAttribute('data-font') || 'modern');
  const pair = () => MAP[curFont()] || MAP.modern;

  let muted = false;   // session-only; reset on login
  const choiceKey = (empId) => 'pd_sndsel_' + (empId || 'me');

  window.PDSound = {
    names: () => pair().map(p => p[0]),
    preview: (n) => { const p = pair()[(n || 1) - 1]; if (p) p[1](ensure()); },
    getChoice: (empId) => { try { return +(localStorage.getItem(choiceKey(empId)) || 1) || 1; } catch (e) { return 1; } },
    setChoice: (empId, n) => { try { localStorage.setItem(choiceKey(empId), String(n)); } catch (e) {} },
    isMuted: () => muted,
    setMuted: (b) => { muted = !!b; },
    resetMute: () => { muted = false; },
    /* real notification ding — respects mute; caller handles the 2-min cooldown */
    ding: (empId) => { if (muted) return false; const p = pair()[window.PDSound.getChoice(empId) - 1]; if (p) p[1](ensure()); return true; },
  };
})();
