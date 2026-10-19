/* 夕暮れの村, the dusk village. The hero (and the last screen of the footer)
   is a painting done in code: sky, moon, Fuji, a pagoda on the ridge, a torii
   in the cedars, a village with its lights on and a string of festival lanterns.
   Everything comes from a fixed seed, so it is the same village on every visit.
   Static layers are painted once into offscreen canvases and composited with
   parallax (cursor and scroll); only the sky life, mist, lanterns, birds and the
   falling things are drawn per frame. The season (season.js) repaints it all. */
(() => {
  const SEASON = window.SEASON;
  if (!SEASON) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = SEASON.particle, A = SEASON.hexA;

  /* ---------------- palettes: traditional colours at dusk ---------------- */
  const PAL = {
    spring: {
      sky: ['#151a3b', '#30346a', '#6f5690', '#cc87a2', '#f3c1b2'], glow: '#ffcdb8', rim: '#ffd6c8',
      far: '#675b8f', mid: '#413b6d', near: '#29254d', fg: '#120f25', mist: '#e6b8cc',
      fol: ['#f2b6c8', '#e79db5', '#fbd3df', '#d98aa6'], moon: { x: 0.72, y: 0.15, r: 0.022, full: false, c: '#fff2ea' },
      stars: 0.55, cap: 0.3, light: '#ffc98a',
    },
    summer: {
      sky: ['#07112b', '#0f264b', '#1f4a76', '#4985a3', '#9ccac3'], glow: '#c6f0e0', rim: '#bfe8e2',
      far: '#2b4f70', mid: '#1b3754', near: '#11273d', fg: '#06101c', mist: '#9cc8d2',
      fol: ['#2f6b5a', '#245a4c', '#3b7a63'], moon: { x: 0.72, y: 0.14, r: 0.02, full: false, c: '#f4f7e4' },
      stars: 1, cap: 0.12, light: '#ffd27a',
    },
    autumn: {
      sky: ['#12142f', '#2a2854', '#5b3d6c', '#b45d66', '#eea36c'], glow: '#ffbe85', rim: '#ffc596',
      far: '#5a4b79', mid: '#3a305b', near: '#251e41', fg: '#0f0c1f', mist: '#e6aaa0',
      fol: ['#d2502e', '#e06a34', '#b23b2b', '#e39a3a', '#c4452a'], moon: { x: 0.7, y: 0.17, r: 0.04, full: true, c: '#ffe0ab' },
      stars: 0.5, cap: 0.26, light: '#ffc46b',
    },
    winter: {
      sky: ['#091022', '#16213d', '#2b3c5f', '#5c749a', '#aabcd6'], glow: '#dfeaff', rim: '#dce8fa',
      far: '#5b6d92', mid: '#37476b', near: '#24304b', fg: '#0f1525', mist: '#c8d6ec',
      fol: ['#e9eff8', '#d3deec'], moon: { x: 0.71, y: 0.15, r: 0.03, full: true, c: '#f2f5ff' },
      stars: 0.9, cap: 0.42, light: '#ffcf86', snow: true,
    },
  };

  /* ---------------- small maths ---------------- */
  const rng = seed => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noise = seed => {
    const r = rng(seed), L = Array.from({ length: 256 }, r);
    return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = L[i & 255], b = L[(i + 1) & 255]; return a + (b - a) * u; };
  };
  const fbm = (n, x, o = 4) => { let s = 0, a = 1, f = 1, t = 0; for (let k = 0; k < o; k++) { s += a * n(x * f + k * 17.3); t += a; a *= 0.5; f *= 2.1; } return s / t; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

  /* ---------------- the clock: the sky follows the time in Jaipur ---------------- */
  // dawn 5 to 7, a hazy day 7 to 16, dusk 16 to 20, night after that. ?t=dawn|day|dusk|night previews one.
  const hourIST = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date())) % 24;
  const timeOfDay = () => {
    const forced = new URLSearchParams(location.search).get('t');
    if (['dawn', 'day', 'dusk', 'night'].includes(forced)) return forced;
    const hr = hourIST();
    return hr >= 5 && hr < 7 ? 'dawn' : hr >= 7 && hr < 16 ? 'day' : hr >= 16 && hr < 20 ? 'dusk' : 'night';
  };
  // the palettes above are dusk; the other times are drawn from them
  function tune(p, tod) {
    if (tod === 'dusk') return p;
    const q = { ...p, moon: { ...p.moon } };
    const toward = (keys, col, k) => keys.forEach(key => { q[key] = mix(p[key], col, k); });
    if (tod === 'night') {
      q.sky = p.sky.map((c, i) => mix(c, '#04050d', [0.3, 0.38, 0.5, 0.62, 0.66][i]));
      q.glow = mix(p.glow, '#33405f', 0.65); q.mist = mix(p.mist, '#3a4260', 0.55); q.rim = mix(p.rim, p.moon.c, 0.6);
      toward(['far', 'mid', 'near', 'fg'], '#05060e', 0.22);
      q.stars = p.stars * 1.6 + 0.35;
      const hr = hourIST(); q.lit = hr >= 0 && hr < 5 ? 0.2 : 0.5; // the village goes to bed
    } else if (tod === 'dawn') {
      q.sky = ['#1a2043', '#3c3e74', '#9a7296', '#f0a38a', '#ffdab2'];
      q.glow = '#ffd3a2'; q.rim = '#ffd9b8'; q.mist = mix(p.mist, '#f3c9c0', 0.4);
      q.stars = 0.25; q.lit = 0.35;
    } else {
      q.sky = ['#2b4068', '#41608c', '#7190b4', '#a8bfd3', '#d6e1e6'];
      q.glow = '#fff2d8'; q.rim = '#f4f1ea'; q.mist = '#dce5ec';
      toward(['far'], '#93a7c3', 0.5); toward(['mid'], '#62779b', 0.38); toward(['near'], '#3f4d6c', 0.3); toward(['fg'], '#1d2537', 0.25);
      q.stars = 0; q.lit = 0.04; q.day = true;
    }
    q.tod = tod;
    return q;
  }

  /* ---------------- one scene ---------------- */
  function makeScene(canvas, opts) {
    const host = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const M = 48; // margin painted around every layer, for parallax
    let WL = 0, moonX = 0, floats = [], reeds = [], viaY = 0, train = null, trainT = 1.5, chimneys = [], smoke = [], w = 0, h = 0, dpr = 1, ldpr = 1, nLayer = 0, pal, L = {}, stars = [], parts = [], flock = null, meteor = null, rope = null;
    let time = 0, last = 0, raf = 0, visible = true, booted = false, tempo = 1;
    let mx = 0, my = 0, tx = 0, ty = 0, wind = 0, px = -1, py = -1, pt = 0, fade = null, tod = timeOfDay();
    if (!opts.end) document.documentElement.dataset.tod = tod;

    // Offscreen canvases are made once and repainted in place: Safari caps total
    // canvas memory, and a fresh set per season change used to run it out.
    const pool = {};
    function surface(key, W, H) {
      let c = pool[key];
      if (!c) c = pool[key] = document.createElement('canvas');
      W = Math.max(1, Math.ceil(W)); H = Math.max(1, Math.ceil(H));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
      g.clearRect(0, 0, W, H);
      return { c, g };
    }
    function layer() {
      const l = surface(`layer${nLayer++}`, (w + 2 * M) * ldpr, (h + 2 * M) * ldpr);
      l.g.setTransform(ldpr, 0, 0, ldpr, M * ldpr, M * ldpr);
      return l;
    }

    // a filled ridge line with a hazy top, a lit rim and the function that traces it
    function ridge(g, seed, base, amp, period, col, haze, rimA) {
      const n = noise(seed), f = x => base - (fbm(n, x / period) - 0.5) * 2 * amp;
      let top = Infinity;
      g.beginPath(); g.moveTo(-M, h + M);
      for (let x = -M; x <= w + M; x += 3) { const y = f(x); top = Math.min(top, y); g.lineTo(x, y); }
      g.lineTo(w + M, h + M); g.closePath();
      const gr = g.createLinearGradient(0, top, 0, base + amp * 1.5);
      gr.addColorStop(0, mix(col, haze, 0.22)); gr.addColorStop(1, col);
      g.fillStyle = gr; g.fill();
      if (rimA) {
        g.beginPath();
        for (let x = -M; x <= w + M; x += 3) (x === -M ? g.moveTo(x, f(x)) : g.lineTo(x, f(x)));
        g.strokeStyle = A(pal.rim, rimA); g.lineWidth = 1; g.stroke();
      }
      return f;
    }

    function mistBand(g, y, height, alpha, seed) {
      const r = rng(seed);
      g.save();
      g.filter = `blur(${Math.round(height * 0.35)}px)`;
      for (let i = 0; i < 14; i++) {
        const x = r() * (w + 2 * M) - M, rw = (0.2 + r() * 0.35) * w, rh = height * (0.4 + r() * 0.6);
        g.fillStyle = A(pal.mist, alpha * (opts.end ? 0.45 : 1) * (0.5 + r() * 0.5));
        g.beginPath(); g.ellipse(x, y + (r() - 0.5) * height * 0.6, rw, rh / 2, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    // curved temple-style roof; returns the path so snow can be clipped to it
    function roof(g, cx, y, rw, rh, col, curl = 1) {
      const p = new Path2D();
      p.moveTo(cx - rw, y - rh * 0.22 * curl);
      p.quadraticCurveTo(cx - rw * 0.55, y + rh * 0.3, cx, y + rh * 0.26);
      p.quadraticCurveTo(cx + rw * 0.55, y + rh * 0.3, cx + rw, y - rh * 0.22 * curl);
      p.quadraticCurveTo(cx + rw * 0.55, y - rh * 0.3, cx + rw * 0.24, y - rh);
      p.lineTo(cx - rw * 0.24, y - rh);
      p.quadraticCurveTo(cx - rw * 0.55, y - rh * 0.3, cx - rw, y - rh * 0.22 * curl);
      g.fillStyle = col; g.fill(p);
      if (pal.snow) {
        g.save(); g.clip(p);
        g.fillStyle = mix(col, '#e6eef9', 0.55); g.fillRect(cx - rw, y - rh, rw * 2, rh * 0.55);
        g.restore();
      }
      return p;
    }

    function pagoda(g, x, by, s, col) {
      const u = s / 7.4;
      let y = by;
      g.fillStyle = col;
      g.fillRect(x - u * 1.7, y - u * 0.4, u * 3.4, u * 0.4); y -= u * 0.4;
      for (let i = 0; i < 5; i++) {
        const k = 1 - i * 0.1;
        g.fillStyle = col;
        g.fillRect(x - u * 0.62 * k, y - u * 0.66, u * 1.24 * k, u * 0.7); y -= u * 0.6;
        roof(g, x, y, u * 2.05 * k, u * 0.5, col, 1.4);
        g.strokeStyle = A(pal.rim, 0.16); g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x - u * 0.5 * k, y - u * 0.5); g.lineTo(x + u * 0.5 * k, y - u * 0.5); g.stroke();
        y -= u * 0.46;
      }
      g.fillStyle = col;
      g.fillRect(x - u * 0.05, y - u * 1.7, u * 0.1, u * 1.75);
      for (let i = 0; i < 7; i++) g.fillRect(x - u * 0.15, y - u * 0.35 - i * u * 0.18, u * 0.3, u * 0.05);
    }

    function torii(g, x, by, s, col) {
      const u = s / 10, sp = u * 3.3, pw = u * 0.72;
      g.fillStyle = col;
      for (const d of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + d * (sp + u * 0.25) - pw / 2, by); g.lineTo(x + d * (sp + u * 0.25) + pw / 2, by);
        g.lineTo(x + d * sp + pw / 2 * 0.85, by - u * 8.9); g.lineTo(x + d * sp - pw / 2 * 0.85, by - u * 8.9); g.closePath(); g.fill();
      }
      g.fillRect(x - sp - u * 1.4, by - u * 7.2, (sp + u * 1.4) * 2, u * 0.55);
      g.fillRect(x - u * 0.28, by - u * 8.6, u * 0.56, u * 1.4);
      g.fillRect(x - sp - u * 1.9, by - u * 9.1, (sp + u * 1.9) * 2, u * 0.5);
      const kw = sp + u * 2.9, ky = by - u * 9.2;
      g.beginPath();
      g.moveTo(x - kw, ky - u * 1.1);
      g.quadraticCurveTo(x - kw * 0.45, ky + u * 0.05, x, ky);
      g.quadraticCurveTo(x + kw * 0.45, ky + u * 0.05, x + kw, ky - u * 1.1);
      g.lineTo(x + kw + u * 0.15, ky - u * 1.7);
      g.quadraticCurveTo(x + kw * 0.45, ky - u * 0.75, x, ky - u * 0.8);
      g.quadraticCurveTo(x - kw * 0.45, ky - u * 0.75, x - kw - u * 0.15, ky - u * 1.7);
      g.closePath(); g.fill();
      if (pal.snow) { g.fillStyle = mix(col, '#e6eef9', 0.6); g.fillRect(x - kw * 0.8, ky - u * 0.95, kw * 1.6, u * 0.22); }
    }

    function sugi(g, x, by, ht, col) {
      const wd = ht * 0.26, n = 7, R = [], Lf = [];
      for (let i = 1; i <= n; i++) {
        const t = i / n, yy = by - ht + ht * t * 0.92;
        R.push([x + wd * t * 0.55, yy], [x + wd * t * 0.3, yy + ht * 0.035]);
        Lf.unshift([x - wd * t * 0.3, yy + ht * 0.035], [x - wd * t * 0.55, yy]);
      }
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x, by - ht);
      R.concat(Lf).forEach(([a, b]) => g.lineTo(a, b));
      g.closePath(); g.fill();
      g.fillRect(x - ht * 0.02, by - ht * 0.1, ht * 0.04, ht * 0.1);
      if (pal.snow) { g.fillStyle = A('#e6eef9', 0.35); for (let i = 1; i < n; i += 2) g.fillRect(x - wd * (i / n) * 0.4, by - ht + ht * (i / n) * 0.92 - 1, wd * (i / n) * 0.8, 1.4); }
    }

    function canopy(g, x, by, r, col, rnd) {
      g.fillStyle = col;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 1.6, by - r * 0.8 - rnd() * r * 0.9, r * (0.45 + rnd() * 0.4), 0, Math.PI * 2); g.fill(); }
      g.fillRect(x - r * 0.06, by - r * 0.6, r * 0.12, r * 0.6);
    }

    // seasonal blossom/leaf clusters as fine dots, so they read as foliage and not blobs
    function bloom(g, cx, cy, rad, amount, dim, rnd) {
      for (let i = 0; i < amount; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
        const c = pal.fol[(rnd() * pal.fol.length) | 0];
        g.fillStyle = A(mix(c, pal.fg, dim + rnd() * 0.25), 0.9);
        g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, 0.8 + rnd() * 2.2 * Math.max(0.6, rad / 40), 0, Math.PI * 2); g.fill();
      }
    }

    function house(g, x, gy, hw, hh, rnd, scale) {
      const wall = mix(pal.fg, pal.near, 0.35), rf = mix(pal.fg, pal.near, 0.12);
      g.fillStyle = wall; g.fillRect(x, gy - hh, hw, hh + 6);
      const p = roof(g, x + hw / 2, gy - hh, hw * 0.64, hh * 0.62, rf, 0.55);
      g.save(); g.strokeStyle = A(pal.rim, 0.22); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x + hw / 2 - hw * 0.15, gy - hh - hh * 0.62); g.lineTo(x + hw / 2 + hw * 0.15, gy - hh - hh * 0.62); g.stroke(); g.restore();
      if (rnd() < (pal.lit ?? 0.68)) {
        const n = 1 + ((rnd() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const ww = hw * 0.2, wh = hh * 0.44, wx = x + hw * (0.15 + i * 0.42 + rnd() * 0.08), wy = gy - hh * 0.8;
          g.save(); g.globalCompositeOperation = 'lighter';
          const gl = g.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, ww * 3.2);
          gl.addColorStop(0, A(pal.light, 0.32)); gl.addColorStop(1, A(pal.light, 0));
          g.fillStyle = gl; g.fillRect(wx - ww * 3, wy - ww * 3, ww * 7, ww * 7); g.restore();
          g.fillStyle = mix(pal.light, '#fff4dc', 0.2 + rnd() * 0.2); g.fillRect(wx, wy, ww, wh);
          g.strokeStyle = A(wall, 0.85); g.lineWidth = Math.max(0.6, 0.8 * scale);
          g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
        }
      }
      return p;
    }

    function pole(g, x, gy, top, col) {
      g.fillStyle = col;
      const s = (gy - top) / 100;
      g.fillRect(x - 2.2 * s, top, 4.4 * s, gy - top + 4);
      g.fillRect(x - 16 * s, top + 8 * s, 32 * s, 2.4 * s);
      g.fillRect(x - 12 * s, top + 17 * s, 24 * s, 2 * s);
      g.fillRect(x + 3 * s, top + 26 * s, 7 * s, 9 * s); // transformer
    }
    const wire = (g, x1, y1, x2, y2, sag, col, lw) => {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag * 2, x2, y2); g.stroke();
    };

    /* ---------- compose: paint every static layer for this size + season ---------- */
    function compose() {
      pal = tune(PAL[SEASON.get()], opts.end ? 'night' : tod);
      if (opts.river) pal = { ...pal, lit: 0.8 }; // the last scene: everyone is home
      nLayer = 0;
      const end = opts.end, wide = w > h, S = Math.min(w, h * 1.5) / 1000;
      const H = h * (end ? (opts.river ? 0.5 : 0.56) : wide ? 0.64 : 0.6);
      WL = opts.river ? h * 0.7 : 0;
      const R = rng(opts.seed || 7);

      // sky
      const sky = layer(), s = sky.g;
      const stops = end ? [pal.sky[0], pal.sky[0], pal.sky[1], mix(pal.sky[2], pal.sky[1], 0.4), mix(pal.sky[3], pal.sky[2], 0.55)] : pal.sky;
      const gr = s.createLinearGradient(0, -M, 0, H + h * 0.06);
      [0, 0.32, 0.6, 0.84, 1].forEach((t, i) => gr.addColorStop(t, stops[i]));
      s.fillStyle = gr; s.fillRect(-M, -M, w + 2 * M, h + 2 * M);
      const gx = w * (end ? 0.6 : 0.62);
      const glow = s.createRadialGradient(gx, H, 0, gx, H, Math.max(w, h) * 0.7);
      glow.addColorStop(0, A(pal.glow, end ? 0.16 : 0.36)); glow.addColorStop(1, A(pal.glow, 0));
      s.fillStyle = glow; s.fillRect(-M, -M, w + 2 * M, h + 2 * M);
      if (opts.river || (pal.tod === 'night' && wide)) {
        // the Milky Way: a soft band, dark dust lanes along it, and dense star dust
        const mw = rng(301), ax = opts.river ? -w * 0.05 : w * 0.36, ay = H * 0.95, bx = w * 1.05, by = h * 0.02;
        const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux, ang = Math.atan2(uy, ux);
        const gauss = () => (mw() + mw() + mw() - 1.5) / 1.5;
        // on the hero it lives in the top-right sky only, fading out well before the headline
        const keep = x => opts.river ? 1 : Math.max(0, Math.min(1, (x - w * 0.64) / (w * 0.18)));
        s.save(); s.filter = `blur(${Math.round(h * 0.03)}px)`;
        for (let i = 0; i < 46; i++) {
          const t = mw(), off = gauss() * h * 0.07, x = ax + ux * len * t + nx * off, y = ay + uy * len * t + ny * off;
          s.fillStyle = A(i % 5 ? '#c7c1e6' : '#e8cfc0', (0.045 + mw() * 0.05) * keep(x));
          s.beginPath(); s.ellipse(x, y, h * (0.07 + mw() * 0.09), h * (0.025 + mw() * 0.03), ang, 0, Math.PI * 2); s.fill();
        }
        for (let i = 0; i < 16; i++) {
          const t = 0.15 + mw() * 0.7, off = gauss() * h * 0.015, x = ax + ux * len * t + nx * off, y = ay + uy * len * t + ny * off;
          s.fillStyle = A(pal.sky[0], (0.3 + mw() * 0.2) * keep(x));
          s.beginPath(); s.ellipse(x, y, h * (0.03 + mw() * 0.05), h * (0.006 + mw() * 0.01), ang + (mw() - 0.5) * 0.3, 0, Math.PI * 2); s.fill();
        }
        s.restore();
        for (let i = 0; i < w * 1.4; i++) {
          const t = mw(), off = gauss() * h * 0.06, x = ax + ux * len * t + nx * off, y = ay + uy * len * t + ny * off;
          if (y > H) continue;
          const sz = 0.4 + mw() * mw() * 1.2;
          const k = keep(x); if (!k) continue;
          s.fillStyle = `rgba(255, 250, 240, ${((0.12 + mw() * 0.5) * k).toFixed(3)})`; s.fillRect(x, y, sz, sz);
        }
      }
      // moon
      const mo = pal.moon, mr = Math.max(9, mo.r * Math.min(w * 1.1, h * 1.6)), mX = w * (end ? 0.16 : wide ? mo.x : 0.56), mY = h * (end ? 0.2 : wide ? mo.y : 0.12);
      moonX = mX;
      const halo = s.createRadialGradient(mX, mY, mr * 0.8, mX, mY, mr * 7);
      halo.addColorStop(0, A(mo.c, 0.22)); halo.addColorStop(1, A(mo.c, 0));
      if (!pal.day) { s.fillStyle = halo; s.beginPath(); s.arc(mX, mY, mr * 7, 0, Math.PI * 2); s.fill(); }
      const ring = s.createRadialGradient(mX, mY, mr * 1.02, mX, mY, mr * 1.65);
      ring.addColorStop(0, A(mo.c, 0.18)); ring.addColorStop(1, A(mo.c, 0));
      if (!pal.day) { s.fillStyle = ring; s.beginPath(); s.arc(mX, mY, mr * 1.65, 0, Math.PI * 2); s.fill(); }
      const { c: mc, g: m } = surface('moon', mr * 2.4 * ldpr, mr * 2.4 * ldpr); m.scale(ldpr, ldpr);
      const mcx = mr * 1.2, mcy = mr * 1.2, mrn = rng(97), sea = mix(mo.c, '#5e5668', 0.42);
      // the disc, darker toward the limb
      const disc = m.createRadialGradient(mcx - mr * 0.3, mcy - mr * 0.3, mr * 0.05, mcx, mcy, mr);
      disc.addColorStop(0, mix(mo.c, '#ffffff', 0.4)); disc.addColorStop(0.65, mo.c); disc.addColorStop(1, mix(mo.c, '#6d6070', 0.32));
      m.fillStyle = disc; m.beginPath(); m.arc(mcx, mcy, mr, 0, Math.PI * 2); m.fill();
      m.save(); m.beginPath(); m.arc(mcx, mcy, mr, 0, Math.PI * 2); m.clip();
      // the maria, roughly where they sit on the near side: Imbrium, Serenitatis, Tranquillitatis, Procellarum, Nubium...
      [[-0.32, -0.3, 0.34, 0.8], [0.2, -0.36, 0.2, 0.9], [0.4, -0.04, 0.24, 0.75], [-0.58, 0.08, 0.3, 0.6], [0.02, 0.02, 0.16, 0.6], [-0.16, 0.44, 0.22, 0.65], [0.34, 0.34, 0.13, 0.55], [0.62, -0.32, 0.1, 0.6]].forEach(([x, y, r, a]) => {
        for (let k = 0; k < 4; k++) { // a few offset blobs each, so the edges are ragged
          const bx = mcx + (x + (mrn() - 0.5) * r * 0.7) * mr, by = mcy + (y + (mrn() - 0.5) * r * 0.7) * mr, rr = r * (0.55 + mrn() * 0.5) * mr;
          const g2 = m.createRadialGradient(bx, by, 0, bx, by, rr);
          g2.addColorStop(0, A(sea, 0.34 * a)); g2.addColorStop(0.6, A(sea, 0.22 * a)); g2.addColorStop(1, A(sea, 0));
          m.fillStyle = g2; m.beginPath(); m.arc(bx, by, rr, 0, Math.PI * 2); m.fill();
        }
      });
      // craters, lit from the upper left: shadowed rim up there, bright rim below
      for (let i = 0; i < 18; i++) {
        const ang = mrn() * Math.PI * 2, d = Math.sqrt(mrn()) * 0.86, cr = (0.025 + mrn() * mrn() * 0.08) * mr;
        const x = mcx + Math.cos(ang) * d * mr, y = mcy + Math.sin(ang) * d * mr;
        m.fillStyle = A(sea, 0.16); m.beginPath(); m.arc(x, y, cr, 0, Math.PI * 2); m.fill();
        m.lineWidth = Math.max(0.5, cr * 0.28);
        m.strokeStyle = A('#ffffff', 0.32); m.beginPath(); m.arc(x, y, cr, 0.1 * Math.PI, 0.9 * Math.PI); m.stroke();
        m.strokeStyle = A(sea, 0.4); m.beginPath(); m.arc(x, y, cr, 1.15 * Math.PI, 1.85 * Math.PI); m.stroke();
      }
      // Tycho and its rays
      const tyX = mcx - 0.12 * mr, tyY = mcy + 0.62 * mr;
      m.strokeStyle = A('#ffffff', 0.09); m.lineWidth = Math.max(0.6, mr * 0.018);
      for (let i = 0; i < 9; i++) { const ang = mrn() * Math.PI * 2, l = (0.4 + mrn() * 0.7) * mr; m.beginPath(); m.moveTo(tyX, tyY); m.lineTo(tyX + Math.cos(ang) * l, tyY + Math.sin(ang) * l); m.stroke(); }
      m.fillStyle = A('#ffffff', 0.55); m.beginPath(); m.arc(tyX, tyY, mr * 0.035, 0, Math.PI * 2); m.fill();
      // regolith grain
      for (let i = 0; i < mr * 10; i++) {
        const ang = mrn() * Math.PI * 2, d = Math.sqrt(mrn()) * mr;
        m.fillStyle = A(mrn() < 0.5 ? '#ffffff' : sea, 0.05); m.fillRect(mcx + Math.cos(ang) * d, mcy + Math.sin(ang) * d, 0.8, 0.8);
      }
      m.restore();
      if (!mo.full) {
        // a crescent, with earthshine still faintly lighting the rest of the disc
        m.globalCompositeOperation = 'destination-out'; m.fillStyle = 'rgba(0,0,0,0.86)';
        m.beginPath(); m.arc(mcx + mr * 0.45, mcy - mr * 0.18, mr * 0.92, 0, Math.PI * 2); m.fill();
        m.globalCompositeOperation = 'source-over';
      }
      s.globalAlpha = pal.day ? 0.22 : 1; // a pale daytime moon
      s.drawImage(mc, mX - mr * 1.2, mY - mr * 1.2, mr * 2.4, mr * 2.4);
      s.globalAlpha = 1;
      // a few wisps of cloud across it, silver on the edge that faces the moon
      s.save(); s.filter = `blur(${Math.max(1.5, mr * 0.06).toFixed(1)}px)`;
      const wisp = mix(stops[1], stops[2], 0.4);
      [[-0.9, 0.55, 2.6, 0.16], [0.35, 0.85, 2.2, 0.12], [-0.25, -0.98, 1.6, 0.08]].forEach(([dx, dy, rw, rh]) => {
        const cx2 = mX + dx * mr, cy2 = mY + dy * mr;
        s.fillStyle = A(wisp, 0.55); s.beginPath(); s.ellipse(cx2, cy2, rw * mr, rh * mr, -0.06, 0, Math.PI * 2); s.fill();
        s.fillStyle = A(mo.c, 0.24); s.beginPath(); s.ellipse(cx2, cy2 - Math.sign(dy) * rh * mr * 0.55, rw * mr * 0.85, rh * mr * 0.4, -0.06, 0, Math.PI * 2); s.fill();
      });
      s.restore();
      L.sky = sky;

      stars = [];
      const nStars = Math.round((w * H) / 5200 * pal.stars * (end ? 1.6 : 1));
      for (let i = 0; i < nStars; i++) {
        const y = Math.pow(R(), 1.6) * H * 0.85;
        stars.push({ x: R() * w, y, r: 0.35 + R() * 0.9, a: (1 - y / H) * (0.4 + R() * 0.6), tw: 0.5 + R() * 2.5, ph: R() * 6 });
      }

      // far range, and Fuji above it
      const far = layer(), f = far.g;
      const fx = w * (end ? 0.82 : wide ? 0.62 : 0.66), peak = H - Math.min(h * (end ? 0.2 : 0.3), w * (end ? 0.12 : wide ? 0.24 : 0.42)), base = H + h * 0.02;
      if (opts.fuji !== false) {
        const half = (base - peak) * 2.35, fh = base - peak, fn = noise(5), fr = rng(13), fp = new Path2D();
        const prof = u => peak + fh * (1 - Math.pow(1 - Math.max(Math.abs(u), 0.04), 2.5));
        fp.moveTo(fx - half - 4, base + 4);
        for (let u = -1; u <= 1.0001; u += 0.006) {
          // the crater rim: a small notch either side of the flat summit
          const notch = Math.abs(u) < 0.045 ? Math.max(0, 1.6 - Math.abs(Math.abs(u) - 0.022) * 90) : 0;
          fp.lineTo(fx + u * half, prof(u) + notch + (fn(u * 30) - 0.5) * 2.5);
        }
        fp.lineTo(fx + half + 4, base + 4); fp.closePath();
        const fg = f.createLinearGradient(0, peak, 0, base);
        fg.addColorStop(0, mix(pal.far, pal.mist, 0.18)); fg.addColorStop(1, pal.far);
        f.fillStyle = fg; f.fill(fp);
        f.save(); f.clip(fp);
        // the face turned away from the sunset sits in shadow
        const sh = f.createLinearGradient(fx - half * 0.15, 0, fx + half * 0.9, 0);
        sh.addColorStop(0, A(pal.near, 0)); sh.addColorStop(1, A(pal.near, 0.45));
        f.fillStyle = sh; f.fillRect(fx - half, peak - 10, half * 2, fh + 20);
        // ravines: each follows the slope down from the summit
        const xf = t => 1 - Math.pow(1 - t, 1 / 2.5), gullies = [];
        for (let i = 0; i < 34; i++) {
          const u = (i / 33) * 1.9 - 0.95 + (fr() - 0.5) * 0.04;
          if (Math.abs(u) < 0.06) continue;
          const pts = [], tEnd = 0.45 + fr() * 0.55, wob = noise(200 + i);
          for (let t = 0.03; t <= tEnd; t += 0.02) pts.push([fx + Math.sign(u) * Math.abs(u) * xf(t) * half + (wob(t * 6) - 0.5) * 3, peak + fh * (0.082 + t * 0.918)]);
          gullies.push(pts);
        }
        const line = pts => { f.beginPath(); pts.forEach(([x, y], k) => (k ? f.lineTo(x, y) : f.moveTo(x, y))); f.stroke(); };
        f.lineCap = 'round';
        f.strokeStyle = A(mix(pal.far, '#05040c', 0.45), 0.28);
        gullies.forEach(g => { f.lineWidth = 0.6 + fr() * 0.9; line(g); });
        // the snow cap
        const capY = peak + fh * pal.cap, cap = new Path2D(), cn = noise(9);
        cap.moveTo(fx - half, peak - 10);
        for (let x = fx - half; x <= fx + half; x += 2) {
          const u = (x - fx) / half;
          cap.lineTo(x, capY + Math.pow(Math.abs(Math.sin(u * 23)), 3) * fh * 0.09 * cn(u * 9) - Math.abs(u) * 4);
        }
        cap.lineTo(fx + half, peak - 10); cap.closePath();
        const cg = f.createLinearGradient(fx - half * 0.3, 0, fx + half * 0.3, 0);
        cg.addColorStop(0, mix(pal.far, '#f6f2ff', 0.58)); cg.addColorStop(1, mix(pal.far, '#f6f2ff', 0.3));
        f.fillStyle = cg; f.fill(cap);
        // in the snow the ravines read as bright ridges with a shadow beside each
        f.save(); f.clip(cap);
        gullies.forEach(g => {
          f.lineWidth = 1.1;
          f.strokeStyle = A(mix(pal.far, '#05040c', 0.3), 0.3); line(g.map(([x, y]) => [x + 1.2, y]));
          f.strokeStyle = A('#ffffff', 0.35); line(g);
        });
        f.globalAlpha = 0.6; f.fillStyle = sh; f.fillRect(fx - half, peak - 10, half * 2, fh + 20); f.globalAlpha = 1;
        f.restore();
        // snow fingers running down the ravines below the cap line
        gullies.forEach(g => {
          if (fr() < 0.35) return;
          const start = g.findIndex(([, y]) => y > capY - 2);
          if (start < 0) return;
          const len = 2 + ((fr() * 6) | 0);
          for (let k = 0; k < len && start + k + 1 < g.length; k++) {
            f.strokeStyle = A(mix(pal.far, '#f6f2ff', 0.5), 0.55 * (1 - k / len)); f.lineWidth = 2.2 * (1 - k / len) + 0.4;
            f.beginPath(); f.moveTo(...g[start + k]); f.lineTo(...g[start + k + 1]); f.stroke();
          }
        });
        // the forest at its feet, a darker band of tiny treetops
        const fb = base - fh * 0.1, tn = noise(17);
        f.fillStyle = mix(pal.far, pal.near, 0.55);
        f.beginPath(); f.moveTo(fx - half, base + 4);
        for (let x = fx - half; x <= fx + half; x += 3) f.lineTo(x, fb + (tn(x / 40) - 0.5) * fh * 0.06 - fr() * 2);
        f.lineTo(fx + half, base + 4); f.closePath(); f.fill();
        f.restore();
        // a lit edge on the sunset side
        f.beginPath();
        for (let u = -1; u <= 0.02; u += 0.01) (u === -1 ? f.moveTo(fx + u * half, prof(u)) : f.lineTo(fx + u * half, prof(u)));
        f.strokeStyle = A(pal.rim, 0.35); f.lineWidth = 1.2; f.stroke();
        // and a belt of cloud around the lower slopes
        f.save(); f.filter = `blur(${Math.max(2, fh * 0.025).toFixed(1)}px)`;
        const belt = peak + fh * 0.6, br = rng(29);
        for (let i = 0; i < 9; i++) {
          const x = fx + (br() * 1.5 - 0.7) * half * 0.8, ew = half * (0.12 + br() * 0.16), eh = fh * (0.025 + br() * 0.03), y = belt + (br() - 0.5) * fh * 0.06;
          f.fillStyle = A(pal.mist, 0.22 + br() * 0.18); f.beginPath(); f.ellipse(x, y, ew, eh, 0, 0, Math.PI * 2); f.fill();
          f.fillStyle = A(pal.rim, 0.12); f.beginPath(); f.ellipse(x - ew * 0.1, y - eh * 0.6, ew * 0.8, eh * 0.4, 0, 0, Math.PI * 2); f.fill();
        }
        f.restore();
      }
      ridge(f, 11, H - h * 0.005, h * 0.05, 340, pal.far, pal.mist, 0.12);
      mistBand(f, H + h * 0.01, h * 0.08, 0.32, 3);
      L.far = far;

      // mid ridge: foliage, a temple and its pagoda
      const mid = layer(), g = mid.g;
      const mf = ridge(g, 23, H + h * 0.045, h * 0.04, 240, pal.mid, pal.mist, 0.1);
      const mr2 = rng(31);
      for (let x = -M; x < w + M; x += 7 + mr2() * 10) canopy(g, x, mf(x) + 3, (6 + mr2() * 9) * Math.max(0.7, S * 1.1), mix(pal.mid, pal.fol[(mr2() * pal.fol.length) | 0], 0.16 + mr2() * 0.16), mr2);
      if (opts.pagoda !== false) {
        const pX = w * (end ? 0.3 : wide ? 0.86 : 0.84), pS = Math.min(h * 0.24, Math.max(w * 0.17, 90));
        const tc = mix(pal.mid, pal.fg, 0.35);
        roof(g, pX - pS * 0.42, mf(pX - pS * 0.42) - pS * 0.1, pS * 0.32, pS * 0.12, tc, 1.2);
        g.fillStyle = tc; g.fillRect(pX - pS * 0.62, mf(pX - pS * 0.42) - pS * 0.1, pS * 0.4, pS * 0.12);
        pagoda(g, pX, mf(pX) + 4, pS, tc);
      }
      mistBand(g, H + h * 0.07, h * 0.06, 0.22, 4);
      L.mid = mid;

      // near hill: cedars, maples and the torii
      const near = layer(), n = near.g;
      const nf = ridge(n, 37, H + h * (end ? 0.14 : 0.12), h * 0.035, 200, pal.near, pal.mist, 0.08);
      const nr = rng(41);
      const toriiX = w * (end ? 0.66 : wide ? 0.5 : 0.3);
      for (let x = -M; x < w + M; x += 5 + nr() * 9) {
        if (Math.abs(x - toriiX) < Math.max(40, w * 0.05)) continue;
        if (nr() < 0.72) sugi(n, x, nf(x) + 4, (22 + nr() * 34) * Math.max(0.75, S * 1.2), mix(pal.near, pal.fg, 0.25 + nr() * 0.2));
        else { const rr = (7 + nr() * 7) * Math.max(0.75, S * 1.2); canopy(n, x, nf(x) + 4, rr, mix(pal.near, pal.fg, 0.2), nr); bloom(n, x, nf(x) - rr * 1.2, rr * 1.1, 40, 0.5, nr); }
      }
      const tS = Math.max(34, h * (end ? 0.13 : 0.085));
      torii(n, toriiX, nf(toriiX) + 3, tS, mix('#d4553b', pal.near, end ? 0.35 : 0.42));
      // stone steps down from the torii
      n.fillStyle = A(pal.rim, 0.05);
      for (let i = 0; i < 6; i++) n.fillRect(toriiX - tS * (0.25 + i * 0.06), nf(toriiX) + 6 + i * tS * 0.07, tS * (0.5 + i * 0.12), 1.2);
      // a low viaduct across the village, for the little local train (hero only)
      viaY = 0;
      if (!opts.end && wide) {
        viaY = h * (wide ? 0.805 : 0.79);
        const vc = mix(pal.near, pal.fg, 0.45), vs = Math.max(0.75, S * 1.2);
        n.fillStyle = vc;
        for (let x = -M; x < w + M; x += 74 * vs) {
          n.fillRect(x, viaY, 7 * vs, h * 0.06);
          n.beginPath(); n.moveTo(x + 7 * vs, viaY + 10 * vs); n.quadraticCurveTo(x + 40 * vs, viaY + 2 * vs, x + 74 * vs, viaY + 10 * vs);
          n.lineTo(x + 74 * vs, viaY + 5 * vs); n.lineTo(x + 7 * vs, viaY + 5 * vs); n.closePath(); n.fill();
        }
        n.fillRect(-M, viaY - 1, w + 2 * M, 5 * vs);
        n.fillStyle = A(pal.rim, 0.32); n.fillRect(-M, viaY - 1, w + 2 * M, 1.2);
        // catenary poles along the line
        n.fillStyle = vc;
        for (let x = -M + 30; x < w + M; x += 190 * vs) { n.fillRect(x, viaY - 30 * vs, 2 * vs, 30 * vs); n.fillRect(x - 6 * vs, viaY - 30 * vs, 14 * vs, 1.6 * vs); }
        n.strokeStyle = A(vc, 0.8); n.lineWidth = 0.8; n.beginPath(); n.moveTo(-M, viaY - 27 * vs); n.lineTo(w + M, viaY - 27 * vs); n.stroke();
      }
      L.near = near;

      // foreground: the village, poles, wires and lanterns
      const fgL = layer(), v = fgL.g, vr = rng(53);
      const gy = h * 0.93, gn = noise(61);
      const ground = opts.river ? x => WL + 2 + (gn(x / 160) - 0.5) * 3 : x => gy - (gn(x / 160) - 0.5) * h * 0.04;
      const homes = [];
      const rows = opts.river ? [[0, 0.5, WL - h * 0.04], [1, 0.62, WL + 1]] : [[0, 0.72, h * 0.84], [1, 1, h * 0.95]];
      for (const [row, sc, y0] of rows) {
        let x = -M - vr() * 40;
        while (x < w + M) {
          const hw = (70 + vr() * 70) * sc * Math.max(0.6, S * 1.1), hh = (26 + vr() * 18) * sc * Math.max(0.6, S * 1.1);
          if (vr() < (row ? 0.82 : 0.9)) { const hy = y0 + (vr() - 0.5) * h * 0.02; house(v, x, hy, hw, hh, vr, sc); homes.push({ x, gy: hy, hw, hh, row }); }
          else { const rr = 16 * sc * Math.max(0.7, S); canopy(v, x + hw / 2, y0, rr, mix(pal.fg, pal.near, 0.2), vr); bloom(v, x + hw / 2, y0 - rr * 1.3, rr * 1.3, 70, 0.35, vr); }
          x += hw * (0.9 + vr() * 0.5);
        }
      }
      v.beginPath(); v.moveTo(-M, h + M);
      for (let x = -M; x <= w + M; x += 6) v.lineTo(x, ground(x));
      v.lineTo(w + M, h + M); v.closePath();
      v.fillStyle = pal.snow ? mix(pal.fg, '#c6d3e8', 0.12) : pal.fg; v.fill();

      if (opts.river) {
        // a street of paper lanterns along the bank
        const ls = Math.max(0.7, S * 1.1);
        for (let x = 18 + vr() * 30; x < w; x += 40 + vr() * 34) {
          const ph = 11 * ls, ly = WL - 1 - ph - 2;
          v.fillStyle = pal.fg; v.fillRect(x - 0.8, ly, 1.6, ph + 2);
          v.save(); v.globalCompositeOperation = 'lighter';
          const gl = v.createRadialGradient(x, ly, 0, x, ly, 14 * ls); gl.addColorStop(0, A(pal.light, 0.5)); gl.addColorStop(1, A(pal.light, 0));
          v.fillStyle = gl; v.fillRect(x - 14 * ls, ly - 14 * ls, 28 * ls, 28 * ls); v.restore();
          v.fillStyle = mix(pal.light, '#ffffff', 0.3); v.beginPath(); v.ellipse(x, ly - 2 * ls, 2.3 * ls, 3.1 * ls, 0, 0, Math.PI * 2); v.fill();
        }
        // a vermilion taikobashi, arched over the water
        const b0 = w * (wide ? 0.42 : 0.3), b1 = w * (wide ? 0.6 : 0.72), bh = h * 0.08, by = WL + 1, bc = mix('#c8432e', pal.fg, 0.32);
        const at = (t, lift) => { const cx = (b0 + b1) / 2, cy = by - bh * 2; return [(1 - t) ** 2 * b0 + 2 * (1 - t) * t * cx + t * t * b1, (1 - t) ** 2 * (by - lift) + 2 * (1 - t) * t * (cy - lift) + t * t * (by - lift)]; };
        const curve = lift => { v.beginPath(); for (let t = 0; t <= 1.0001; t += 0.02) { const [x, y] = at(t, lift); t ? v.lineTo(x, y) : v.moveTo(x, y); } v.stroke(); };
        v.lineCap = 'round';
        v.strokeStyle = mix(bc, '#000000', 0.4); v.lineWidth = 1.4;
        for (const t of [0.22, 0.38, 0.62, 0.78]) { const [x, y] = at(t, 0); v.beginPath(); v.moveTo(x, y); v.lineTo(x, by); v.stroke(); }
        v.strokeStyle = mix(bc, '#000000', 0.35); v.lineWidth = 7; curve(-2);
        v.strokeStyle = bc; v.lineWidth = 4; curve(0);
        v.lineWidth = 1.8; curve(13);
        v.lineWidth = 1.3;
        for (let t = 0; t <= 1.0001; t += 0.1) { const [x, y] = at(t, 0), [, y2] = at(t, 13); v.beginPath(); v.moveTo(x, y); v.lineTo(x, y2); v.stroke(); }
        v.fillStyle = mix('#d8b56a', pal.fg, 0.3); // giboshi, the onion-shaped caps on the end posts
        for (const t of [0, 1]) { const [x, y] = at(t, 13); v.beginPath(); v.arc(x, y - 2, 2.6, 0, Math.PI * 2); v.fill(); v.fillRect(x - 0.5, y - 7, 1, 4); }
        // things that move on the water, and the near bank
        floats = Array.from({ length: wide ? 12 : 7 }, () => ({ x: vr() * w, d: vr(), ph: vr() * 6 }));
        reeds = [];
        for (let x = -10; x < w + 10; x += 14 + vr() * 50) if (vr() < 0.55) reeds.push({ x, n: 4 + ((vr() * 7) | 0), hgt: (18 + vr() * 26) * Math.max(0.7, S * 1.2), cat: vr() < 0.4 });
      }

      rope = null;
      if (opts.poles !== false && (wide || w > 700)) {
        const x1 = w * (wide ? 0.63 : 0.5), x2 = w * (wide ? 0.97 : 1.02), t1 = h * 0.46, t2 = h * 0.4;
        const pc = mix(pal.fg, pal.near, 0.1), wc = A(mix(pal.fg, pal.near, 0.3), 0.9);
        pole(v, x1, gy, t1, pc); pole(v, x2, gy, t2, pc);
        const sp = (gy - t2) / 100;
        for (const [d, k] of [[8, 0], [17, 1], [8, 2]]) {
          const o = k === 2 ? 14 : 0;
          wire(v, x1 + (k === 1 ? 10 : -14) * sp, t1 + (d + o) * sp, x2 + (k === 1 ? 10 : -14) * sp, t2 + (d + o) * sp, h * 0.03, wc, 1);
          wire(v, x2 + (k === 1 ? 10 : -14) * sp, t2 + (d + o) * sp, w + M + 40, t2 + (d + o + 30) * sp, h * 0.02, wc, 1);
        }
        rope = { x1, y1: t1 + 42 * sp, x2, y2: t2 + 46 * sp, sag: h * 0.035, n: wide ? 5 : 4, s: Math.max(0.65, S * 1.15) };
        wire(v, rope.x1, rope.y1, rope.x2, rope.y2, rope.sag, A(mix(pal.fg, pal.near, 0.4), 0.95), 1.3);
      }

      // a framing branch from the top right, in season
      if (opts.branch !== false) {
        const bx = w + 6, bc = mix(pal.fg, pal.near, 0.08), br = rng(71), u = Math.max(wide ? 0.65 : 0.5, Math.min(1.25, w / 1100));
        v.strokeStyle = bc; v.lineCap = 'round';
        const limb = (x, y, ang, len, wd, depth) => {
          const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
          v.lineWidth = wd; v.beginPath(); v.moveTo(x, y);
          v.quadraticCurveTo((x + x2) / 2 + (br() - 0.5) * len * 0.3, (y + y2) / 2 + (br() - 0.5) * len * 0.3, x2, y2); v.stroke();
          if (depth > 0) { limb(x2, y2, ang + 0.5 + br() * 0.3, len * 0.62, wd * 0.6, depth - 1); limb(x2, y2, ang - 0.35 - br() * 0.3, len * 0.7, wd * 0.62, depth - 1); }
          else if (pal.snow) { v.fillStyle = A('#e6eef9', 0.5); v.beginPath(); v.arc(x2, y2 - 1, wd * 1.6, Math.PI, 0); v.fill(); }
          else bloom(v, x2, y2, (pal === PAL.summer ? 22 : 18) * u, pal === PAL.summer ? 90 : 70, 0.22, br);
        };
        limb(bx, h * 0.02, Math.PI * 0.86, 150 * u, 9 * u, 3);
        limb(bx, h * 0.16, Math.PI * 0.92, 95 * u, 6 * u, 2);
      }
      // two chimneys on the back row, away from the words on the left
      chimneys = [];
      if (!opts.end) {
        const back = homes.filter(o => o.row === 0 && o.x > w * 0.42 && o.x < w * 0.95);
        [...new Set([back[1], back[back.length - 2]])].filter(Boolean).forEach(o => {
          const cx = o.x + o.hw * 0.68, top = o.gy - o.hh - o.hh * 0.5;
          v.fillStyle = mix(pal.fg, pal.near, 0.18); v.fillRect(cx - 3, top - 6, 6, 12);
          chimneys.push({ x: cx, y: top - 7, t: Math.random() });
        });
      }
      L.fg = fgL;

      // two drifting mist bands, painted twice as wide so they can wrap
      L.mist = [0, 1].map(k => {
        const mh = h * (k ? 0.12 : 0.1), { c, g: mg } = surface(`mist${k}`, w * 2 * ldpr, mh * 2 * ldpr);
        mg.scale(ldpr, ldpr); mg.filter = `blur(${Math.round(mh * 0.3)}px)`;
        const r = rng(80 + k);
        for (let i = 0; i < 9; i++) {
          const x = r() * w, ew = (0.12 + r() * 0.2) * w, eh = mh * (0.3 + r() * 0.4);
          mg.fillStyle = A(pal.mist, (k ? 0.16 : 0.2) * (opts.end ? 0.5 : 1) * (0.5 + r() * 0.5));
          for (const o of [0, w]) { mg.beginPath(); mg.ellipse(x + o, mh, ew, eh, 0, 0, Math.PI * 2); mg.fill(); }
        }
        return { c, y: (k ? H + h * 0.13 : H + h * 0.05) - mh, w: w * 2, h: mh * 2, v: k ? 9 : 5 };
      });
    }

    /* ---------- live layers ---------- */
    function drawLanterns(ox, oy) {
      if (!rope) return;
      const { x1, y1, x2, y2, sag, n, s } = rope;
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const x = x1 + (x2 - x1) * t + ox, y = y1 + (y2 - y1) * t + sag * 4 * t * (1 - t) * 0.5 + oy;
        const ang = Math.sin(time * 0.9 * tempo + i * 1.7) * 0.06 * tempo + wind * 0.0004;
        const bw = 13 * s, bh = 17 * s, red = i % 3 !== 1;
        const body = red ? '#c9432c' : '#efe0c2';
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.strokeStyle = 'rgba(10,8,16,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6 * s); ctx.stroke();
        const cy = 6 * s + bh / 2;
        ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createRadialGradient(0, cy, 0, 0, cy, bw * 2.6);
        gl.addColorStop(0, A(red ? '#ff8a4a' : pal.light, pal.day ? 0.06 : 0.28)); gl.addColorStop(1, A(pal.light, 0));
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, cy, bw * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        const bg = ctx.createRadialGradient(0, cy, 0, 0, cy, bw * 0.75);
        bg.addColorStop(0, mix(body, '#fff1c8', 0.55)); bg.addColorStop(1, body);
        ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, cy, bw / 2, bh / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(40,10,10,0.22)'; ctx.lineWidth = 0.7;
        for (const k of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.ellipse(0, cy + k * bh, bw / 2 * Math.sqrt(1 - 4 * k * k), bh * 0.04, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#16100e';
        ctx.fillRect(-bw * 0.3, cy - bh / 2 - 1, bw * 0.6, bh * 0.12); ctx.fillRect(-bw * 0.3, cy + bh / 2 - bh * 0.1, bw * 0.6, bh * 0.12);
        ctx.restore();
      }
    }

    function drawSky(oy) {
      for (const st of stars) {
        const a = st.a * (0.55 + 0.45 * Math.sin(time * st.tw + st.ph));
        ctx.fillStyle = `rgba(255,248,232,${a.toFixed(3)})`;
        ctx.fillRect(st.x - st.r / 2, st.y + oy - st.r / 2, st.r, st.r);
      }
      if (!meteor && pal.stars > 0.3 && Math.random() < 0.0016) meteor = { x: w * (0.3 + Math.random() * 0.6), y: h * Math.random() * 0.25, t: 0 };
      if (meteor) {
        meteor.t += 1 / 60;
        const k = meteor.t / 0.9, x = meteor.x - k * 220, y = meteor.y + k * 90 + oy;
        const gr = ctx.createLinearGradient(x, y, x + 70, y - 29);
        gr.addColorStop(0, `rgba(255,248,232,${(0.8 * (1 - k)).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,248,232,0)');
        ctx.strokeStyle = gr; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 70, y - 29); ctx.stroke();
        if (k >= 1) meteor = null;
      }
    }

    function drawBirds(dt, oy) {
      if (!flock && Math.random() < 0.0025 && !opts.end) {
        const n = 4 + ((Math.random() * 4) | 0);
        flock = { x: w + 40, y: h * (0.18 + Math.random() * 0.16), v: 32 + Math.random() * 18, m: Array.from({ length: n }, (_, i) => ({ dx: i * 16 + Math.random() * 8, dy: Math.abs(i - n / 2) * 7 + Math.random() * 6, ph: Math.random() * 6 })) };
      }
      if (!flock) return;
      flock.x -= flock.v * dt;
      ctx.strokeStyle = A(pal.fg, 0.85); ctx.lineWidth = 1.2;
      for (const b of flock.m) {
        const x = flock.x + b.dx, y = flock.y + b.dy + oy, f = Math.sin(time * 7 + b.ph) * 2.6, s = 4.5;
        ctx.beginPath(); ctx.moveTo(x - s, y - f); ctx.quadraticCurveTo(x - s * 0.4, y - 1, x, y + 0.6); ctx.quadraticCurveTo(x + s * 0.4, y - 1, x + s, y - f); ctx.stroke();
      }
      if (flock.x < -200) flock = null;
    }

    function syncParts() {
      const kind = SEASON.info().kind;
      const per = { petal: 1 / 22000, leaf: 1 / 30000, firefly: 1 / 24000, snow: 1 / 7000 }[kind];
      const n = Math.round(w * h * per * (opts.end ? 0.7 : 1));
      parts = parts.filter(p => p.kind === kind);
      while (parts.length < n) parts.push(P.spawn(kind, w, h, { anywhere: true }));
      parts.length = Math.min(parts.length, n);
      parts.target = n;
    }

    function drawParts(dt, front) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if ((p.depth > 0.62) !== front) continue;
        if (dt) {
          if (px > 0) { const dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy; if (d2 < 6400) { const k = (1 - d2 / 6400) * 60 * dt; p.x += dx * k * 0.05; p.y += dy * k * 0.03; } }
          if (!P.step(p, dt, w, h, wind * (0.4 + p.depth))) parts[i] = P.spawn(p.kind, w, h);
        }
        P.draw(ctx, parts[i]);
      }
    }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now; time += dt;
      render(dt);
      raf = requestAnimationFrame(frame);
    }

    // The river: everything above the waterline, mirrored and rippled, a road of
    // moonlight, floating lanterns drifting downstream (toro nagashi), a boat,
    // and the near bank with reeds and a stone lantern.
    function drawRiver(dt) {
      const depth = h - WL, src = Math.min(WL, depth), water = mix(pal.sky[1], '#02030a', 0.55);
      const { c: rc, g: rg } = surface('refl', w * dpr, src * dpr);
      rg.setTransform(1, 0, 0, -1, 0, src * dpr);
      rg.drawImage(canvas, 0, Math.round((WL - src) * dpr), Math.round(w * dpr), Math.round(src * dpr), 0, 0, w * dpr, src * dpr);
      ctx.fillStyle = water; ctx.fillRect(0, WL, w, depth);
      for (let y = 0; y < src; y += 2) {
        const k = y / src, off = Math.sin(time * 1.5 + y * 0.13) * (0.5 + k * 3.2) + Math.sin(time * 0.6 + y * 0.035) * k * 2.4;
        ctx.drawImage(rc, 0, y * dpr, w * dpr, 2 * dpr, off, WL + y, w, 2.2);
      }
      const tint = ctx.createLinearGradient(0, WL, 0, h);
      tint.addColorStop(0, A(water, 0.42)); tint.addColorStop(1, A(water, 0.86));
      ctx.fillStyle = tint; ctx.fillRect(0, WL, w, depth);
      ctx.fillStyle = A(pal.rim, 0.12); ctx.fillRect(0, WL, w, 1);
      // the road of moonlight
      const mc = pal.moon.c;
      for (let i = 0; i < 46; i++) {
        const k = i / 46, y = WL + 3 + Math.pow(k, 1.25) * depth * 0.95, spread = 6 + k * 46;
        const a = Math.pow(0.5 + 0.5 * Math.sin(time * 2.6 + i * 7.31), 3) * 0.55 * (1 - k * 0.55);
        if (a < 0.03) continue;
        const x = moonX + Math.sin(i * 12.9898 + time * 0.7) * spread, len = 3 + k * 16;
        ctx.fillStyle = A(mc, a); ctx.fillRect(x - len / 2, y, len, 1 + k);
      }
      // small breaks of light on the current
      for (let i = 0; i < 18; i++) {
        const y = WL + ((i * 37.7) % depth), x = ((i * 191.3 + time * (8 + (i % 5) * 3)) % (w + 60)) - 30;
        ctx.fillStyle = A(pal.rim, 0.06 + 0.05 * Math.sin(time * 2 + i)); ctx.fillRect(x, y, 10 + (i % 4) * 6, 1);
      }
      // toro nagashi
      floats.sort((a, b) => a.d - b.d).forEach(f => {
        const sp = 5 + f.d * 11, s = 4.5 + f.d * 7;
        f.x += sp * dt; if (f.x > w + 30) f.x = -30;
        const y = WL + depth * (0.1 + f.d * 0.66) + Math.sin(time * 1.3 + f.ph) * 0.8;
        const st = ctx.createLinearGradient(0, y, 0, y + s * 3.4);
        st.addColorStop(0, A(pal.light, 0.4)); st.addColorStop(1, A(pal.light, 0));
        ctx.fillStyle = st; ctx.fillRect(f.x - s * 0.4 + Math.sin(time * 2 + f.ph) * 0.6, y, s * 0.8, s * 3.4);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createRadialGradient(f.x, y - s * 0.7, 0, f.x, y - s * 0.7, s * 3);
        gl.addColorStop(0, A(pal.light, 0.35)); gl.addColorStop(1, A(pal.light, 0));
        ctx.fillStyle = gl; ctx.fillRect(f.x - s * 3, y - s * 3.7, s * 6, s * 6);
        ctx.restore();
        ctx.fillStyle = '#20150d'; ctx.fillRect(f.x - s * 0.72, y - s * 0.28, s * 1.44, s * 0.32);
        const pg = ctx.createLinearGradient(0, y - s * 1.3, 0, y - s * 0.28);
        pg.addColorStop(0, mix(pal.light, '#fff6e0', 0.55)); pg.addColorStop(1, pal.light);
        ctx.fillStyle = pg; ctx.fillRect(f.x - s * 0.55, y - s * 1.3, s * 1.1, s * 1.02);
        ctx.fillStyle = '#20150d'; ctx.fillRect(f.x - s * 0.62, y - s * 1.36, s * 1.24, s * 0.12); ctx.fillRect(f.x - s * 0.05, y - s * 1.3, s * 0.1, s);
      });
      // a boat, poled slowly across, with a lantern at the bow
      const bs = Math.max(0.7, Math.min(1.3, w / 1100)), bx = w * (w > h ? 0.8 : 0.72) + Math.sin(time * 0.08) * 26, byy = WL + depth * 0.5 + Math.sin(time * 0.9) * 0.8;
      ctx.save(); ctx.translate(bx, byy); ctx.scale(bs, bs);
      ctx.fillStyle = 'rgba(3, 3, 8, 0.45)'; ctx.beginPath(); ctx.ellipse(0, 7, 34, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#07070d';
      ctx.beginPath(); ctx.moveTo(-36, -6); ctx.quadraticCurveTo(-30, 6, -18, 6); ctx.lineTo(22, 6); ctx.quadraticCurveTo(32, 4, 38, -9); ctx.lineTo(30, -3); ctx.lineTo(-30, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-14, -12); ctx.quadraticCurveTo(-3, -17, 8, -12); ctx.lineTo(8, -2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-26, -3); ctx.lineTo(-25, -15); ctx.lineTo(-21, -15); ctx.lineTo(-21, -3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-30, -15); ctx.lineTo(-23, -21); ctx.lineTo(-16, -15); ctx.fill();
      ctx.strokeStyle = '#07070d'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-22, -12); ctx.lineTo(-44, 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, -5); ctx.lineTo(33, -24); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createRadialGradient(33, -22, 0, 33, -22, 16);
      lg.addColorStop(0, A(pal.light, 0.6)); lg.addColorStop(1, A(pal.light, 0));
      ctx.fillStyle = lg; ctx.fillRect(17, -38, 32, 32);
      ctx.fillStyle = A(pal.light, 0.25); ctx.fillRect(31, 6, 4, 18);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = mix(pal.light, '#fff4dc', 0.3); ctx.beginPath(); ctx.ellipse(33, -21, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // the near bank, its reeds, and a stone lantern
      const nb = h - depth * 0.14;
      ctx.fillStyle = '#05060b';
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, nb + Math.sin(x * 0.013) * 4 + Math.sin(x * 0.041) * 2);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#06070c'; ctx.lineCap = 'round';
      reeds.forEach(r => {
        for (let i = 0; i < r.n; i++) {
          const x0 = r.x + i * 2.4, y0 = nb + 4, hh = r.hgt * (0.6 + ((i * 37) % 10) / 25), sw = Math.sin(time * 1.1 + r.x * 0.05 + i * 0.7) * 3 + (i - r.n / 2) * 1.4;
          ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + sw * 0.3, y0 - hh * 0.6, x0 + sw, y0 - hh); ctx.stroke();
          if (r.cat && i % 3 === 0) { ctx.fillStyle = '#06070c'; ctx.beginPath(); ctx.ellipse(x0 + sw, y0 - hh - 3, 1.6, 4, sw * 0.03, 0, Math.PI * 2); ctx.fill(); }
        }
      });
      const tx0 = w * 0.9, ts = Math.max(0.8, Math.min(1.4, w / 1000)), tb = nb + 2;
      ctx.save(); ctx.translate(tx0, tb); ctx.scale(ts, ts);
      ctx.fillStyle = '#0b0c12';
      ctx.fillRect(-9, -6, 18, 6); ctx.fillRect(-4, -26, 8, 20); ctx.fillRect(-10, -30, 20, 4); ctx.fillRect(-7, -42, 14, 12);
      ctx.beginPath(); ctx.moveTo(-14, -42); ctx.lineTo(0, -52); ctx.lineTo(14, -42); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -54, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createRadialGradient(0, -36, 0, 0, -36, 26); sg.addColorStop(0, A(pal.light, 0.45)); sg.addColorStop(1, A(pal.light, 0));
      ctx.fillStyle = sg; ctx.fillRect(-26, -62, 52, 52);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = mix(pal.light, '#ffe9bf', 0.3); ctx.fillRect(-3.5, -40, 7, 7);
      ctx.restore();
    }

    // A three-car local train along the viaduct every fifteen seconds or so, windows lit.
    function drawTrain(dt, ox, oy) {
      if (!viaY) return;
      trainT -= dt;
      if (!train && trainT <= 0) train = { x: w + 60, v: 78 + Math.random() * 26 };
      if (!train) return;
      train.x -= train.v * dt;
      const s = Math.max(0.75, Math.min(1.3, w / 1100)), carL = 128 * s, carH = 17 * s, gap = 5 * s, y = viaY + oy - 1, lit = pal.lit ?? 0.68;
      for (let i = 0; i < 3; i++) {
        const x0 = train.x + ox + i * (carL + gap);
        ctx.fillStyle = '#0c0b16';
        ctx.beginPath(); ctx.moveTo(x0 + (i ? 0 : 10 * s), y - carH); ctx.lineTo(x0 + carL, y - carH); ctx.lineTo(x0 + carL, y); ctx.lineTo(x0, y); ctx.lineTo(x0, y - carH + (i ? 0 : 8 * s)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = A(pal.rim, 0.25); ctx.fillRect(x0 + (i ? 0 : 10 * s), y - carH, carL - (i ? 0 : 10 * s), 1);
        for (let k = 0; k < 9; k++) {
          const wx = x0 + 14 * s + k * 12.4 * s, wy = y - carH + 4.5 * s;
          ctx.fillStyle = A(mix(pal.light, '#fff4dc', 0.25), 0.25 + 0.7 * Math.min(1, lit + 0.2));
          ctx.fillRect(wx, wy, 8 * s, 6 * s);
        }
        if (i === 0) { // pantograph
          ctx.strokeStyle = '#0c0b16'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0 + 40 * s, y - carH); ctx.lineTo(x0 + 48 * s, y - carH - 9 * s); ctx.lineTo(x0 + 56 * s, y - carH); ctx.stroke();
        }
      }
      // the lit windows throw a little light, and the headlight a lot
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const len = 3 * carL + 2 * gap, gx = train.x + ox + len / 2;
      const gl = ctx.createRadialGradient(gx, y - carH / 2, 0, gx, y - carH / 2, len * 0.7);
      gl.addColorStop(0, A(pal.light, 0.12 * (lit + 0.3))); gl.addColorStop(1, A(pal.light, 0));
      ctx.fillStyle = gl; ctx.fillRect(gx - len, y - carH * 3, len * 2, carH * 5);
      const hx = train.x + ox + 2 * s, hl = ctx.createLinearGradient(hx, 0, hx - 160 * s, 0);
      hl.addColorStop(0, A('#fff2cc', 0.45)); hl.addColorStop(1, A('#fff2cc', 0));
      ctx.fillStyle = hl; ctx.beginPath(); ctx.moveTo(hx, y - carH * 0.55); ctx.lineTo(hx - 160 * s, y - carH * 1.6); ctx.lineTo(hx - 160 * s, y + carH * 0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (train.x + 3 * (carL + gap) < -80) { train = null; trainT = 13 + Math.random() * 4; }
    }

    // Smoke from two chimneys: soft puffs that rise, widen, lean with the breeze and fade.
    function drawSmoke(dt, ox, oy) {
      if (!chimneys.length) return;
      chimneys.forEach(c => {
        c.t -= dt;
        if (c.t <= 0) { c.t = 0.3 + Math.random() * 0.2; smoke.push({ x: c.x, y: c.y, r: 3, age: 0, ph: Math.random() * 6 }); }
      });
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        if (dt) { p.age += dt; p.y -= 12 * dt; p.x += (6 + wind * 0.04 + Math.sin(time * 0.8 + p.ph) * 3) * dt; p.r += 4.2 * dt; }
        if (p.age > 7) { smoke.splice(i, 1); continue; }
        const a = 0.42 * Math.min(1, p.age * 2) * (1 - p.age / 7) ** 1.5;
        const g = ctx.createRadialGradient(p.x + ox, p.y + oy, 0, p.x + ox, p.y + oy, p.r);
        const sc0 = mix(pal.mist, '#eef0f6', 0.45); g.addColorStop(0, A(sc0, a)); g.addColorStop(1, A(sc0, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function render(dt) {
      if (!Number.isFinite(tx + ty + mx + my + wind)) tx = ty = mx = my = wind = 0;
      tx += (mx - tx) * Math.min(1, dt * 2.2); ty += (my - ty) * Math.min(1, dt * 2.2);
      wind *= Math.pow(0.35, dt);
      const top = canvas.getBoundingClientRect().top, sc = opts.river ? 0 : Math.max(0, -top), vy = opts.river ? 0 : 10;
      const put = (lay, depth, k) => ctx.drawImage(lay.c, 0, 0, lay.c.width, lay.c.height, -M - tx * depth * 22, -M - ty * depth * vy + sc * k, w + 2 * M, h + 2 * M);
      ctx.fillStyle = pal.sky[0];
      ctx.fillRect(0, 0, w, h);
      put(L.sky, 0.05, 0.6);
      drawSky(sc * 0.6);
      put(L.far, 0.15, 0.5);
      drawBirds(dt, sc * 0.45);
      put(L.mid, 0.3, 0.38);
      const m0 = L.mist[0], m1 = L.mist[1];
      ctx.drawImage(m0.c, -((time * m0.v) % (m0.w / 2)) - tx * 8, m0.y + sc * 0.3, m0.w, m0.h);
      put(L.near, 0.5, 0.25);
      drawTrain(dt, -tx * 0.5 * 22, -ty * 0.5 * vy + sc * 0.25);
      ctx.drawImage(m1.c, -((time * m1.v) % (m1.w / 2)) - tx * 14, m1.y + sc * 0.18, m1.w, m1.h);
      drawParts(dt, false);
      put(L.fg, 0.9, 0.08);
      drawSmoke(dt, -tx * 0.9 * 22, -ty * 0.9 * vy + sc * 0.08);
      drawLanterns(-tx * 0.9 * 22, -ty * 0.9 * 10 + sc * 0.08);
      if (opts.river) drawRiver(dt);
      drawParts(dt, true);
      if (fade) {
        fade.a -= dt * 0.75; // a slow dissolve, not a cut
        if (fade.a <= 0) fade = null;
        else { ctx.globalAlpha = fade.a; ctx.drawImage(fade.c, 0, 0, w, h); ctx.globalAlpha = 1; }
      }
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      w = r.width; h = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      ldpr = Math.min(dpr, Math.sqrt(3.2e6 / ((w + 2 * M) * (h + 2 * M)))); // keep each layer near 3 megapixels
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      compose();
      syncParts();
      return true;
    }

    function start() { if (booted && !raf && !reduce && visible) { last = 0; raf = requestAnimationFrame(frame); } }
    const still = () => { render(0); };

    host.addEventListener('pointermove', e => {
      if (!booted || !w || !h) return; // before the first layout there is no size to divide by
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
      if (px > 0 && now - pt < 120) wind = Math.max(-260, Math.min(260, wind + ((x - px) / Math.max(8, now - pt)) * 40));
      px = x; py = y; pt = now;
      mx = x / w * 2 - 1; my = y / h * 2 - 1;
    }, { passive: true });
    host.addEventListener('pointerleave', () => { px = py = -1; mx = my = 0; });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const r = canvas.getBoundingClientRect();
        if (Math.abs(r.width - w) < 2 && Math.abs(r.height - h) < 120) return; // mobile URL bar: keep the painting
        if (resize() && reduce) still();
      }, 160);
    });

    const repaint = () => {
      if (!booted) return;
      if (!reduce) {
        const { c, g } = surface('fade', canvas.width, canvas.height);
        g.drawImage(canvas, 0, 0);
        fade = { c, a: 1 };
      }
      compose(); syncParts();
      if (reduce) still();
    };
    SEASON.on(repaint);
    if (!opts.end) setInterval(() => { const t = timeOfDay(); if (t !== tod) { tod = t; document.documentElement.dataset.tod = t; repaint(); } }, 60000);

    // the painting uses no web fonts, so it does not wait for them
    const boot = () => { if (!resize()) { requestAnimationFrame(boot); return; } booted = true; still(); start(); };
    boot();
    return { tempo(v) { tempo = Math.max(0.5, Math.min(3, v || 1)); } };
  }

  const hero = document.getElementById('scene');
  const heroScene = hero ? makeScene(hero, { seed: 7 }) : null;
  const tail = document.getElementById('scene-end');
  if (tail) makeScene(tail, { end: true, seed: 19, poles: false, branch: false, river: true });
  // extras.js calls this while Spotify says I'm listening: the lanterns sway a little more
  window.FIELD = { tempo(v) { if (heroScene) heroScene.tempo(v); } };

  /* ---------------- the hanging scroll: unrolls, then hangs like one ---------------- */
  // Page scroll sets how far it has unrolled and the paper eases after it. Once
  // open it is a damped pendulum on its nail: a breeze keeps it alive, scrolling
  // and a cursor sweeping across it push it, and the bottom rod can be grabbed
  // and flung. The paper is cloth, so its bottom trails the swing a little.
  // print.js waits for the "unrolled" event before it presses the portrait.
  (function kakejiku() {
    const fig = document.querySelector('.portrait.scroll');
    const paper = fig && fig.querySelector('.scroll__paper'), rod = fig && fig.querySelector('.scroll__end');
    if (!fig || !paper) return;
    const open = () => { fig.classList.add('is-unrolled'); fig.dispatchEvent(new CustomEvent('unrolled')); };
    if (reduce) { open(); return; }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let u = 0, uT = 0, th = 0, om = 0, raf = 0, last = 0, time = 0, hpx = 0;
    let onScreen = false, landed = false, drag = null, sv = 0, lastY = window.scrollY, hx = -1, ht = 0;
    const measure = () => { hpx = paper.offsetHeight; fig.style.setProperty('--hpx', `${hpx}px`); };

    function tick(now) {
      raf = 0;
      const dt = Math.min(0.033, (now - (last || now)) / 1000); last = now; time += dt;
      u += (uT - u) * Math.min(1, dt * 7);
      if (Math.abs(uT - u) < 0.002) u = uT;
      if (u > 0.995 && !landed) { landed = true; om += 0.26; open(); }
      if (u < 0.5) landed = false;

      if (drag) {
        const prev = th;
        th += (drag.th - th) * Math.min(1, dt * 16);
        om = (th - prev) / Math.max(dt, 1 / 240);
      } else {
        // a shorter (still rolled) scroll swings faster, like a shorter pendulum
        const k = 13 * (1.5 - 0.5 * u);
        const breeze = (Math.sin(time * 0.61) + 0.6 * Math.sin(time * 1.43 + 1.3)) * 0.035;
        om += (-k * Math.sin(th) - 1.15 * om + breeze + sv * 0.0013) * dt;
        th += om * dt;
      }
      sv *= Math.pow(0.03, dt);
      th = clamp(th, -0.7, 0.7);
      const lag = clamp(-om * 10, -18, 18) * u;
      fig.style.transform = `rotate(${th.toFixed(4)}rad)`;
      fig.style.setProperty('--u', u.toFixed(4));
      fig.style.setProperty('--lag', `${lag.toFixed(2)}px`);
      fig.style.setProperty('--skew', `${Math.atan2(lag, Math.max(1, hpx)).toFixed(4)}rad`);
      if (onScreen || drag || u !== uT || Math.abs(om) > 0.003) raf = requestAnimationFrame(tick); else last = 0;
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

    const aim = () => {
      const top = fig.getBoundingClientRect().top, vh = window.innerHeight;
      const t = clamp((vh * 0.95 - top) / (vh * 0.55), 0, 1);
      uT = t * t * (3 - 2 * t);
      const y = window.scrollY;
      sv = clamp(sv + (y - lastY), -400, 400); lastY = y;
      wake();
    };

    // a cursor sweeping across the paper gives it a nudge
    fig.addEventListener('pointermove', e => {
      if (drag || e.pointerType !== 'mouse' || e.target.closest('.quant')) { hx = -1; return; }
      const now = performance.now();
      if (hx >= 0 && now - ht < 80) om = clamp(om - clamp((e.clientX - hx) / Math.max(4, now - ht), -3, 3) * 0.05, -2.5, 2.5);
      hx = e.clientX; ht = now; wake();
    });
    fig.addEventListener('pointerleave', () => { hx = -1; });

    // grab the bottom rod and swing it
    if (rod) {
      const pivot = () => { const r = fig.getBoundingClientRect(); return [r.left + r.width / 2, r.top - 30 * Math.cos(th)]; };
      const follow = e => { const [px, py] = drag.p; drag.th = clamp(-Math.atan2(e.clientX - px, Math.max(40, e.clientY - py)), -0.7, 0.7); };
      rod.addEventListener('pointerdown', e => {
        if (u < 0.95) return;
        e.preventDefault();
        rod.setPointerCapture(e.pointerId);
        drag = { p: pivot(), th };
        rod.classList.add('is-held');
        follow(e); wake();
      });
      rod.addEventListener('pointermove', e => { if (drag) follow(e); });
      const drop = () => { if (!drag) return; drag = null; rod.classList.remove('is-held'); wake(); };
      rod.addEventListener('pointerup', drop);
      rod.addEventListener('pointercancel', drop);
    }

    measure();
    fig.style.setProperty('--u', '0');
    new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; if (onScreen) wake(); }, { rootMargin: '120px 0px' }).observe(fig);
    aim();
    window.addEventListener('scroll', aim, { passive: true });
    window.addEventListener('resize', () => { measure(); aim(); }, { passive: true });
  })();

  /* ---------------- the rest of the page: a few things still falling ---------------- */
  // Sparse, behind nothing interactive, and asleep while either painting is on screen.
  (function drift() {
    if (reduce) return;
    const c = document.createElement('canvas');
    c.className = 'drift'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    const g = c.getContext('2d');
    let W = 0, Hh = 0, items = [], raf = 0, last = 0, onScreen = new Set(), wind = 0, lastY = window.scrollY;
    const size = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; Hh = window.innerHeight;
      c.width = Math.round(W * d); c.height = Math.round(Hh * d); g.setTransform(d, 0, 0, d, 0, 0);
    };
    const target = () => { const k = SEASON.info().kind; return Math.round({ petal: 9, leaf: 7, firefly: 0, snow: 26 }[k] * Math.min(1.4, W / 1200 + 0.3)); };
    const loop = now => {
      raf = 0;
      const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      const kind = SEASON.info().kind, quiet = onScreen.size > 0;
      g.clearRect(0, 0, W, Hh);
      if (quiet) { items = []; return; }
      wind *= Math.pow(0.3, dt);
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        if (!P.step(p, dt, W, Hh, wind)) { items.splice(i, 1); continue; }
        P.draw(g, p, 0.75);
      }
      if (items.length < target() && Math.random() < dt * 1.5) items.push(P.spawn(kind, W, Hh));
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };
    size();
    window.addEventListener('resize', size, { passive: true });
    window.addEventListener('scroll', () => { const y = window.scrollY; wind = Math.max(-90, Math.min(90, wind + (lastY - y) * 0.4)); lastY = y; }, { passive: true });
    document.addEventListener('visibilitychange', wake);
    SEASON.on(wake); // the ones already falling finish; new ones are the new season
    const io = new IntersectionObserver(es => { es.forEach(e => (e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target))); if (!onScreen.size) wake(); });
    [hero, tail].forEach(el => el && io.observe(el));
    wake();
  })();
})();
