/* 音, the sound of the place. Off until you ask for it, and there are no audio
   files: everything is synthesised live with Web Audio.
   On top: an original score, written for this page (a slow D minor theme in the
   spirit of anime OST ballads, not a copy of any of them). Piano alone first,
   then strings and a soft taiko; on the second pass the koto takes the melody.
   Underneath: the village. Wind is filtered noise, the wind chime is a few
   inharmonic sines, and each season adds its own creature: a stream in spring,
   evening cicadas in summer, bell crickets in autumn, a temple bell in winter. */
(() => {
  const btns = [...document.querySelectorAll('[data-sound]')];
  if (!btns.length || !(window.AudioContext || window.webkitAudioContext)) { btns.forEach(b => { b.hidden = true; }); return; }

  let ac = null, master = null, verb = null, wind = null, on = false, timers = [], seasonNodes = [], score = null;
  const SEASON = window.SEASON;
  const R = Math.random;

  function noiseBuffer(sec, brown) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = R() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5; } else d[i] = white;
    }
    return b;
  }

  // a temple hall: decaying noise as an impulse response
  function hall(sec) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const v = ac.createConvolver(); v.buffer = b; return v;
  }

  function setup() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    verb = hall(3.2);
    const wet = ac.createGain(); wet.gain.value = 0.35;
    verb.connect(wet); wet.connect(master);

    // wind: brown noise, low-passed, breathing on a slow LFO
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(6, true); src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = wind = ac.createGain(); g.gain.value = 0.09;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = ac.createOscillator(), lg2 = ac.createGain();
    lfo2.frequency.value = 0.045; lg2.gain.value = 260; lfo2.connect(lg2); lg2.connect(lp.frequency);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start(); lfo2.start();
  }

  /* ---------------- instruments ---------------- */
  const kotoCache = new Map();
  function koto(freq, when, vel = 0.5) {
    let buf = kotoCache.get(freq);
    if (!buf) {
      const sr = ac.sampleRate, n = Math.round(sr / freq), len = sr * 3.5;
      buf = ac.createBuffer(1, len, sr);
      const d = buf.getChannelData(0), ring = new Float32Array(n);
      for (let i = 0; i < n; i++) ring[i] = R() * 2 - 1;
      let p = 0;
      for (let i = 0; i < len; i++) {
        const nx = (p + 1) % n, v = ring[p];
        ring[p] = 0.4985 * (v + ring[nx]);
        d[i] = v * (i < 40 ? i / 40 : 1);
        p = nx;
      }
      kotoCache.set(freq, buf);
    }
    const s = ac.createBufferSource(); s.buffer = buf;
    const g = ac.createGain(); g.gain.value = vel * 0.26;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    s.connect(f); f.connect(g); g.connect(master); g.connect(verb);
    s.start(when);
  }

  function chime(when) {
    const base = 1700 + R() * 900;
    [[1, 0.06], [2.76, 0.025], [5.4, 0.012]].forEach(([k, a]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = base * k; o.type = 'sine';
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(a, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 2.8 / Math.sqrt(k));
      o.connect(g); g.connect(master); g.connect(verb); o.start(when); o.stop(when + 3);
    });
  }

  function bell(when) {
    const f = 98 + R() * 8;
    [[1, 0.12, 9], [2.02, 0.06, 6], [2.74, 0.04, 5], [4.1, 0.02, 3], [5.4, 0.012, 2]].forEach(([k, a, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f * k;
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(a, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + d);
      o.connect(g); g.connect(master); g.connect(verb); o.start(when); o.stop(when + d + 0.1);
    });
  }

  // bell cricket: a 4.3 kHz tone gated into short trills
  function suzumushi(when) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 4200 + R() * 300; g.gain.value = 0;
    const pulses = 6 + ((R() * 6) | 0);
    for (let i = 0; i < pulses; i++) {
      const t = when + i * 0.045;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.008); g.gain.linearRampToValueAtTime(0, t + 0.03);
    }
    o.connect(g); g.connect(master); o.start(when); o.stop(when + pulses * 0.045 + 0.1);
  }

  // higurashi, the evening cicada: a falling "kana-kana-kana"
  function higurashi(when) {
    const o = ac.createOscillator(), g = ac.createGain(), am = ac.createOscillator(), ag = ac.createGain();
    o.frequency.setValueAtTime(4600, when); o.frequency.exponentialRampToValueAtTime(3500, when + 3.2);
    am.frequency.setValueAtTime(9, when); am.frequency.linearRampToValueAtTime(6, when + 3.2);
    const pulse = ac.createGain(); pulse.gain.value = 0.5;
    ag.gain.value = 0.5; am.connect(ag); ag.connect(pulse.gain);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.014, when + 0.3); g.gain.linearRampToValueAtTime(0, when + 3.4);
    o.connect(pulse); pulse.connect(g); g.connect(master); g.connect(verb);
    o.start(when); am.start(when); o.stop(when + 3.5); am.stop(when + 3.5);
  }

  function stream() {
    const s = ac.createBufferSource(); s.buffer = noiseBuffer(4, false); s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
    const g = ac.createGain(); g.gain.value = 0.025;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 2.7; lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(); lfo.start();
    return [s, lfo];
  }

  /* ---------------- the score ---------------- */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // Piano: stretched, decaying partials with a little detune between strings and a
  // hammer click, rendered once per pitch into a buffer and then just played back.
  const pianoCache = new Map();
  function pianoBuf(m) {
    let b = pianoCache.get(m);
    if (b) return b;
    const f = mtof(m), sr = ac.sampleRate, len = Math.round(sr * 4.5);
    b = ac.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    for (let n = 1; n <= 7; n++) {
      const fn = f * n * Math.sqrt(1 + 0.00035 * n * n);
      if (fn > sr / 2.4) break;
      const amp = Math.pow(n, -1.4), tau = (2.8 * Math.pow(220 / f, 0.3)) / Math.pow(n, 0.8);
      for (const [k, a] of [[1, 1], [1.0007, 0.45]]) {
        const w = (2 * Math.PI * fn * k) / sr, ph = R() * 6.28, decay = Math.exp(-1 / (sr * tau));
        let e = amp * a;
        for (let i = 0; i < len; i++) { d[i] += e * Math.sin(w * i + ph); e *= decay; }
      }
    }
    const click = Math.round(sr * 0.012);
    for (let i = 0; i < click; i++) d[i] += (R() * 2 - 1) * 0.05 * (1 - i / click);
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] *= (0.5 / peak) * Math.min(1, i / (sr * 0.003));
    pianoCache.set(m, b);
    return b;
  }
  function piano(m, when, dur, vel) {
    const s = ac.createBufferSource(), g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    s.buffer = pianoBuf(m);
    const peak = vel * 0.26;
    g.gain.setValueAtTime(peak, when); g.gain.setValueAtTime(peak, when + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);
    s.connect(g);
    if (p) { p.pan.value = Math.max(-0.5, Math.min(0.5, (m - 62) / 40)); g.connect(p); p.connect(master); p.connect(verb); }
    else { g.connect(master); g.connect(verb); }
    s.start(when); s.stop(when + dur + 0.6);
  }

  // Strings: detuned saws through a soft low-pass, slow bow in and out.
  function pad(notes, when, dur, level) {
    const lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.018 * level, when + 1.1);
    g.gain.setValueAtTime(0.018 * level, when + dur - 0.2); g.gain.linearRampToValueAtTime(0, when + dur + 1.3);
    lp.connect(g); g.connect(master); g.connect(verb);
    notes.forEach(m => [-7, 7].forEach(c => {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = mtof(m); o.detune.value = c + (R() - 0.5) * 4;
      o.connect(lp); o.start(when); o.stop(when + dur + 1.4);
    }));
  }

  // a single, far-off taiko
  function taiko(when) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(78, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.35);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.32, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
    o.connect(g); g.connect(master); g.connect(verb); o.start(when); o.stop(when + 1.5);
  }

  // Original material: sixteen bars in D minor at 63 bpm, as [bar, beat, midi, beats].
  const BEAT = 60 / 63, BAR = BEAT * 4;
  const CH = {
    Dm: [50, 57, 62, 65, 69], Bb: [46, 53, 58, 62, 65], Bbm7: [46, 53, 57, 62, 65], Gm7: [43, 50, 53, 58, 62],
    Gm: [43, 50, 55, 58, 62], A: [45, 52, 57, 61, 64], As: [45, 52, 57, 62, 64], C: [48, 55, 60, 64, 67], Am: [45, 52, 57, 60, 64],
  };
  const PROG = ['Dm', 'Bbm7', 'Gm7', 'A', 'Dm', 'Bb', 'C', 'A', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'Bb', 'As', 'A'];
  const MEL = [
    [0, 1, 69, 1], [0, 2, 74, 1], [0, 3, 76, 1],
    [1, 0, 77, 2.5], [1, 2.5, 76, 0.5], [1, 3, 74, 1],
    [2, 0, 74, 1.5], [2, 1.5, 70, 0.5], [2, 2, 72, 1], [2, 3, 74, 1],
    [3, 0, 76, 2], [3, 2, 73, 2],
    [4, 0, 69, 1], [4, 1, 74, 1], [4, 2, 77, 1], [4, 3, 81, 1],
    [5, 0, 79, 1.5], [5, 1.5, 77, 0.5], [5, 2, 74, 2],
    [6, 0, 76, 1], [6, 1, 79, 1], [6, 2, 77, 1], [6, 3, 76, 1],
    [7, 0, 76, 3],
    [8, 0, 74, 1], [8, 1, 77, 1], [8, 2, 82, 2],
    [9, 0, 81, 1.5], [9, 1.5, 79, 0.5], [9, 2, 76, 2],
    [10, 0, 72, 1], [10, 1, 76, 1], [10, 2, 81, 1.5], [10, 3.5, 79, 0.5],
    [11, 0, 77, 1], [11, 1, 76, 1], [11, 2, 74, 2],
    [12, 0, 70, 1], [12, 1, 74, 1], [12, 2, 79, 1], [12, 3, 77, 1],
    [13, 0, 77, 1.5], [13, 1.5, 76, 0.5], [13, 2, 74, 1], [13, 3, 72, 1],
    [14, 0, 74, 2], [14, 2, 76, 2],
    [15, 0, 73, 3], [15, 3, 69, 1],
  ];
  const ARP = [0, 1, 2, 3, 4, 3, 2, 1];
  const human = () => (R() - 0.5) * 0.016;

  function scheduleBar(k, t) {
    const pass = Math.floor(k / 16) % 2, bar = k % 16, chord = CH[PROG[bar]], swell = bar >= 8;
    ARP.forEach((ix, j) => piano(chord[ix], t + (j * BEAT) / 2 + human(), BEAT * 0.95, j === 0 ? 0.42 : 0.24));
    MEL.filter(n => n[0] === bar).forEach(([, beat, m, dur]) => {
      const at = t + beat * BEAT + human();
      if (pass === 0) piano(m, at, dur * BEAT, 0.6);
      else { koto(mtof(m), at, 0.7); if (dur >= 1.5) koto(mtof(m), at + BEAT * 0.75, 0.3); piano(m + 12, at, dur * BEAT, 0.16); }
    });
    if (swell || pass === 1) pad([chord[0] - 12, chord[1], chord[3], chord[4]], t, BAR, swell ? 1 : 0.55);
    if (swell && (bar === 8 || bar === 12)) taiko(t);
  }

  function runScore() {
    if (!on || !score) return;
    while (score.t0 + score.next * BAR < ac.currentTime + 1.6) { scheduleBar(score.next, score.t0 + score.next * BAR); score.next++; }
    timers.push(setTimeout(runScore, 300));
  }

  /* ---------------- scheduling ---------------- */
  const every = (min, max, fn) => {
    let id;
    const tick = () => { if (!on) return; fn(ac.currentTime + 0.05); id = setTimeout(tick, (min + R() * (max - min)) * 1000); timers.push(id); };
    id = setTimeout(tick, (min * 0.4 + R() * min) * 1000); timers.push(id);
  };

  function seasonLayer(s) {
    seasonNodes.forEach(n => { try { n.stop(); } catch (_) {} });
    seasonNodes = [];
    if (s === 'spring') seasonNodes = stream();
  }

  function startAll() {
    score = { t0: ac.currentTime + 0.8, next: 0 };
    runScore();
    every(10, 22, chime);
    every(0.6, 2.2, t => { if (SEASON.get() === 'autumn') suzumushi(t); });
    every(9, 18, t => { if (SEASON.get() === 'summer') higurashi(t); });
    every(18, 34, t => { if (SEASON.get() === 'winter' || R() < 0.25) bell(t); });
    seasonLayer(SEASON.get());
  }

  function set(next) {
    on = next;
    btns.forEach(b => { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); });
    if (on) {
      if (!ac) setup();
      ac.resume();
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(0.9, ac.currentTime, 0.8);
      startAll();
    } else if (ac) {
      timers.forEach(clearTimeout); timers = []; score = null;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(0, ac.currentTime, 0.3);
      setTimeout(() => { if (!on) { seasonLayer(null); ac.suspend(); } }, 1500);
    }
  }

  btns.forEach(b => b.addEventListener('click', () => set(!on)));
  SEASON.on(s => { if (on) { seasonLayer(s); chime(ac.currentTime + 0.05); } });
  document.addEventListener('visibilitychange', () => { if (ac && on) (document.hidden ? ac.suspend() : ac.resume()); });
  window.AMBIENCE = { toggle: () => set(!on), isOn: () => on };
})();
