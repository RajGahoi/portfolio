/* 水墨, the ink-wash landscape behind the middle of the page. A long hand
   scroll painted once, in pale ink on the dark: distant ranges in soft washes,
   a pine on a rock, bamboo, cranes and mist, kept to the margins so the text
   stays clean. Two layers drift slower than the page (parallax), so the
   landscape passes as you read. The season changes repaint it with a fade. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'inkwash';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const RATES = [0.08, 0.18];
  let vw = 0, vh = 0, docH = 0, layers = [], prev = null, fade = 0, raf = 0, last = 0;

  const rng = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noise = r => { const L = Array.from({ length: 256 }, r); return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return L[i & 255] + (L[(i + 1) & 255] - L[i & 255]) * u; }; };
  const ink = a => `rgba(236, 228, 210, ${a.toFixed(3)})`;

  function range(g, x0, x1, base, height, r, a) {
    const n = noise(r), top = [];
    for (let x = x0; x <= x1; x += 4) {
      const t = (x - x0) / (x1 - x0), env = Math.sin(t * Math.PI) ** 0.7;
      top.push([x, base - env * height * (0.55 + 0.45 * (n(x / 140) * 0.7 + n(x / 50) * 0.3))]);
    }
    const peak = Math.min(...top.map(p => p[1]));
    const gr = g.createLinearGradient(0, peak, 0, base + height * 0.2);
    gr.addColorStop(0, ink(a)); gr.addColorStop(0.45, ink(a * 0.5)); gr.addColorStop(1, ink(0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x0, base + height * 0.2);
    top.forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(x1, base + height * 0.2); g.closePath(); g.fill();
    // the dry-brush ridge line
    g.strokeStyle = ink(a * 1.4); g.lineWidth = 1.2;
    g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
  function pine(g, x, y, s, a, r) {
    g.strokeStyle = ink(a * 1.3); g.lineCap = 'round';
    g.lineWidth = 5 * s; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 20 * s, y - 50 * s, x - 30 * s, y - 90 * s, x + 10 * s, y - 140 * s); g.stroke();
    g.lineWidth = 2.5 * s;
    [[-60, -100, -70], [50, -80, 60], [-40, -130, -45], [30, -120, 40]].forEach(([dx, dy, ex]) => {
      g.beginPath(); g.moveTo(x + dx * 0.15 * s, y + dy * s); g.quadraticCurveTo(x + dx * 0.6 * s, y + (dy - 10) * s, x + ex * s, y + (dy + 6) * s); g.stroke();
    });
    g.fillStyle = ink(a);
    [[-70, -98, 40], [60, -78, 34], [-46, -128, 30], [40, -120, 28], [8, -146, 26]].forEach(([dx, dy, rr]) => {
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + (dx + (r() - 0.5) * 16) * s, y + (dy + (r() - 0.5) * 6) * s, rr * s * (0.7 + r() * 0.4), rr * 0.32 * s, 0, 0, Math.PI * 2); g.fill(); }
    });
    // and the rock it grows from
    g.fillStyle = ink(a * 0.9);
    g.beginPath(); g.moveTo(x - 70 * s, y + 30 * s); g.quadraticCurveTo(x - 40 * s, y - 10 * s, x, y - 4 * s); g.quadraticCurveTo(x + 50 * s, y, x + 80 * s, y + 30 * s); g.closePath(); g.fill();
  }
  function bamboo(g, x, y, hgt, a, r) {
    g.lineCap = 'butt';
    for (let k = 0; k < 5; k++) {
      const bx = x + k * 18 + (r() - 0.5) * 8, lean = (r() - 0.5) * 0.08, hh = hgt * (0.7 + r() * 0.3);
      g.strokeStyle = ink(a * (0.8 + r() * 0.5)); g.lineWidth = 4 + r() * 2;
      for (let s = 0; s < hh; s += 46 + r() * 10) { g.beginPath(); g.moveTo(bx + s * lean, y - s); g.lineTo(bx + (s + 42) * lean, y - s - 42); g.stroke(); }
      g.fillStyle = ink(a * 0.9);
      for (let l = 0; l < 6; l++) {
        const ly = y - hh * (0.4 + r() * 0.6), lx = bx + (y - ly) * lean, dir = r() < 0.5 ? -1 : 1;
        g.beginPath(); g.ellipse(lx + dir * 16, ly + 4, 18, 3, dir * 0.4, 0, Math.PI * 2); g.fill();
      }
    }
  }
  function cranes(g, x, y, a) {
    g.strokeStyle = ink(a * 1.6); g.lineWidth = 1.4; g.lineCap = 'round';
    [[0, 0, 1], [40, 14, 0.8], [76, 6, 0.7]].forEach(([dx, dy, s]) => {
      g.beginPath(); g.moveTo(x + dx - 16 * s, y + dy - 6 * s); g.quadraticCurveTo(x + dx - 6 * s, y + dy - 2 * s, x + dx, y + dy);
      g.quadraticCurveTo(x + dx + 6 * s, y + dy - 2 * s, x + dx + 16 * s, y + dy - 8 * s); g.stroke();
    });
  }
  function mist(g, y, a, r) {
    g.save(); g.filter = 'blur(28px)';
    for (let i = 0; i < 5; i++) { g.fillStyle = ink(a); g.beginPath(); g.ellipse(r() * vw, y + (r() - 0.5) * 60, vw * (0.15 + r() * 0.2), 22 + r() * 18, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  function paint(rate, seed) {
    const H = Math.ceil(vh + Math.max(0, docH - vh) * rate) + 200;
    const c = document.createElement('canvas'); c.width = vw; c.height = H;
    const g = c.getContext('2d'), r = rng(seed);
    const side = i => (i % 2 ? vw * (0.78 + r() * 0.12) : vw * (0.04 + r() * 0.12));
    const far = rate < 0.1;
    let i = 0;
    for (let y = vh * 1.1; y < H; y += (far ? 900 : 700) + r() * 300, i++) {
      if (far) {
        const x = side(i), span = vw * (0.3 + r() * 0.25);
        range(g, x - span / 2, x + span / 2, y, 160 + r() * 140, r, 0.1);
        range(g, x - span * 0.3, x + span * 0.55, y + 40, 90 + r() * 60, r, 0.07);
        mist(g, y + 30, 0.06, r);
      } else {
        const pick = i % 3, x = side(i + 1);
        if (pick === 0) pine(g, x, y, 0.8 + r() * 0.4, 0.095, r);
        else if (pick === 1) bamboo(g, x - 40, y, 260 + r() * 120, 0.085, r);
        else cranes(g, x, y - 120, 0.1);
        if (window.SEASON && pick !== 2) {
          const k = window.SEASON.info().kind;
          if (k === 'leaf' || k === 'petal') for (let n = 0; n < 9; n++) {
            const p = window.SEASON.particle.spawn(k, vw, H); p.x = x + (r() - 0.5) * 200; p.y = y - r() * 200; p.flip = 0;
            g.globalAlpha = 0.3; window.SEASON.particle.draw(g, p); g.globalAlpha = 1;
          }
        }
      }
    }
    return c;
  }

  function build() {
    vw = window.innerWidth; vh = window.innerHeight;
    docH = document.documentElement.scrollHeight;
    canvas.width = vw; canvas.height = vh;
    layers = RATES.map((rate, i) => ({ rate, c: paint(rate, 11 + i * 17) }));
  }

  function draw() {
    raf = 0;
    const now = performance.now(), dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const y = reduce ? 0 : window.scrollY;
    ctx.clearRect(0, 0, vw, vh);
    const put = (ls, a) => { ctx.globalAlpha = a; ls.forEach(l => ctx.drawImage(l.c, 0, -y * l.rate)); };
    put(layers, 1 - fade);
    if (prev && fade > 0) { put(prev, fade); fade = Math.max(0, fade - dt / 1.4); if (fade > 0) raf = requestAnimationFrame(draw); else { prev = null; last = 0; } }
    ctx.globalAlpha = 1;
    // keep the reading column clear: the landscape lives in the margins
    ctx.globalCompositeOperation = 'destination-out';
    const m = ctx.createLinearGradient(0, 0, vw, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.2, 'rgba(0,0,0,0.55)'); m.addColorStop(0.5, 'rgba(0,0,0,0.8)'); m.addColorStop(0.8, 'rgba(0,0,0,0.55)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = m; ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over';
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(draw); };

  const start = () => { build(); wake(); };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  window.addEventListener('scroll', wake, { passive: true });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(window.innerWidth - vw) > 2 || Math.abs(document.documentElement.scrollHeight - docH) > 400) { build(); wake(); } }, 250); });
  if (window.SEASON) window.SEASON.on(() => { if (!layers.length) return; prev = layers; fade = 1; last = 0; layers = RATES.map((rate, i) => ({ rate, c: paint(rate, 11 + i * 17) })); wake(); });
})();
