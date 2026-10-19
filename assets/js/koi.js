/* 鯉, a garden stream across the whole width of Contact. Each koi is a
   flexible spine: the head steers (wander along the stream, stay off the banks,
   give the others room, chase food, drift toward a still cursor) and every
   segment follows the one before it, so the body bends and the tail flows.
   Patterns are the traditional varieties. The stream has a pebbled bed and
   moving caustics, a gentle current, lily pads and whatever the season drops;
   the banks have stones, grasses, a yatsuhashi plank bridge with irises,
   stepping stones, a snow-viewing lantern and a bamboo spout.
   Tap the water to feed them. */
(() => {
  const fig = document.querySelector('[data-pond]');
  const canvas = fig && fig.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const R = Math.random;

  // body colour, then patches as [from, to] along the body (0 head, 1 tail), side offset, width
  const VARIETIES = [
    { name: 'kohaku', base: '#fbf6ec', patches: [[0.04, 0.22, 0.1, 0.9, '#ec4a26'], [0.32, 0.55, -0.25, 0.85, '#ec4a26'], [0.62, 0.74, 0.3, 0.6, '#ec4a26']] },
    { name: 'sanke', base: '#f3ece0', patches: [[0.06, 0.3, -0.1, 0.9, '#d3402a'], [0.42, 0.6, 0.2, 0.8, '#d3402a'], [0.35, 0.42, -0.5, 0.35, '#1d1b20'], [0.66, 0.72, 0.45, 0.3, '#1d1b20']] },
    { name: 'showa', base: '#1f1c21', patches: [[0.02, 0.18, 0, 0.9, '#d44a2c'], [0.3, 0.48, 0.3, 0.7, '#f1ebdf'], [0.5, 0.64, -0.3, 0.75, '#d44a2c'], [0.7, 0.8, 0.2, 0.5, '#f1ebdf']] },
    { name: 'ogon', base: '#f2b63e', patches: [], metal: true },
    { name: 'tancho', base: '#f6f1e8', patches: [[0.04, 0.1, 0, 0.55, '#d63b28']] },
    { name: 'asagi', base: '#8197ae', patches: [[0.1, 0.7, 0.85, 0.5, '#e2712f'], [0.1, 0.7, -0.85, 0.5, '#e2712f']], scales: true },
    { name: 'yamabuki', base: '#ffd45a', patches: [], metal: true },
  ];

  let w = 0, h = 0, dpr = 1, raf = 0, visible = false, last = 0, time = 0, built = false;
  let koi = [], food = [], ripples = [], pads = [], floaters = [], glints = [];
  let bed = null, caustic = null, rim = null, spoutAt = 0, streaks = [], oldRim = null, rimFade = 0, oldFloaters = [];
  // the stream: a centre line that meanders, and a half-width that breathes
  const cy = x => h * 0.5 + Math.sin(x * 0.0042 + 0.6) * h * 0.12 + Math.sin(x * 0.011 + 2) * h * 0.035;
  const hw = x => h * (0.25 + 0.05 * Math.sin(x * 0.0063 + 1));
  const CURRENT = 9;
  const mouse = { x: -1, y: -1, still: 0, on: false };

  /* ---------------- static paintings ---------------- */
  function makeCaustic(S) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    const pts = Array.from({ length: 22 }, () => [R() * S, R() * S]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        const dd = (x - px - ox) ** 2 + (y - py - oy) ** 2;
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const v = Math.max(0, 1 - (Math.sqrt(d2) - Math.sqrt(d1)) / 7) ** 3 * (0.55 + 0.45 * Math.sin(x * 0.07 + y * 0.05)), o = (y * S + x) * 4;
      d[o] = 200; d[o + 1] = 240; d[o + 2] = 235; d[o + 3] = v * 255;
    }
    g.putImageData(img, 0, 0);
    const soft = document.createElement('canvas'); soft.width = soft.height = S;
    const sg = soft.getContext('2d'); sg.filter = 'blur(1.2px)'; sg.drawImage(c, 0, 0);
    return soft;
  }

  function paintBed() {
    const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = '#2b7472'; g.fillRect(0, 0, w, h);
    // deeper, darker water down the middle of the channel
    g.save(); g.filter = `blur(${Math.round(h * 0.06)}px)`;
    g.strokeStyle = '#17505a'; g.lineWidth = h * 0.24; g.lineCap = 'round';
    g.beginPath(); for (let x = -40; x <= w + 40; x += 10) (x === -40 ? g.moveTo(x, cy(x)) : g.lineTo(x, cy(x))); g.stroke();
    g.restore();
    for (let i = 0; i < w * h / 150; i++) {
      const x = R() * w, y = R() * h, r = 1 + R() * 3.2;
      g.fillStyle = R() < 0.5 ? `rgba(14, 44, 46, ${0.22 + R() * 0.25})` : `rgba(190, 215, 190, ${0.1 + R() * 0.12})`;
      g.beginPath(); g.ellipse(x, y, r * 1.3, r, R() * 3, 0, TAU); g.fill();
    }
    return c;
  }

  // Everything that is not water: banks, stones, grasses, the bridge, the lantern, the spout.
  function paintGarden() {
    const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const season = window.SEASON ? window.SEASON.get() : 'autumn', snow = season === 'winter';
    const edgeN = x => Math.sin(x * 0.05) * 2 + Math.sin(x * 0.13) * 1.5;
    const water = new Path2D();
    water.moveTo(-20, cy(-20) - hw(-20));
    for (let x = -20; x <= w + 20; x += 6) water.lineTo(x, cy(x) - hw(x) + edgeN(x));
    for (let x = w + 20; x >= -20; x -= 6) water.lineTo(x, cy(x) + hw(x) + edgeN(x + 40));
    water.closePath();
    // the ground: moss and soil
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1e2d1c'); gr.addColorStop(0.5, '#2c4127'); gr.addColorStop(1, '#1d2b1a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 90; i++) {
      const x = R() * w, y = R() * h;
      g.fillStyle = R() < 0.65 ? `rgba(110, 150, 70, ${0.14 + R() * 0.24})` : `rgba(14, 18, 10, ${0.2 + R() * 0.25})`;
      g.fillRect(x, y, 1 + R() * 2, 1 + R() * 2);
    }
    if (snow) for (let i = 0; i < w * h / 600; i++) { g.fillStyle = `rgba(225, 233, 245, ${0.15 + R() * 0.35})`; g.beginPath(); g.ellipse(R() * w, R() * h, 3 + R() * 10, 2 + R() * 4, 0, 0, TAU); g.fill(); }
    // cut the stream out, then darken the wet lip of each bank
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fill(water); g.restore();
    g.save(); g.clip(water); g.restore();
    g.save(); g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(5, 8, 6, 0.75)'; g.lineWidth = 9; g.stroke(water); g.restore();
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fill(water); g.restore();

    const stone = (x, y, r, flat) => {
      g.save(); g.fillStyle = 'rgba(0, 0, 0, 0.45)'; g.filter = 'blur(4px)';
      g.beginPath(); g.ellipse(x + 3, y + 5, r * 1.2, r * (flat ? 0.6 : 0.9), 0, 0, TAU); g.fill(); g.restore();
      const p = new Path2D(), n = 12, j = Array.from({ length: n }, () => 0.85 + R() * 0.25);
      for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, rr = r * j[i % n], px = x + Math.cos(a) * rr * 1.25, py = y + Math.sin(a) * rr * (flat ? 0.6 : 0.95); i ? p.lineTo(px, py) : p.moveTo(px, py); }
      const t = 0.8 + R() * 0.35, sg = g.createLinearGradient(x - r, y - r, x + r, y + r);
      sg.addColorStop(0, `rgb(${125 * t | 0}, ${126 * t | 0}, ${120 * t | 0})`); sg.addColorStop(1, '#262a2b');
      g.fillStyle = sg; g.fill(p);
      g.save(); g.clip(p);
      g.fillStyle = 'rgba(255, 255, 255, 0.06)';
      for (let i = 0; i < 24; i++) { g.beginPath(); g.arc(x + (R() - 0.5) * r * 2, y + (R() - 0.5) * r * 2, R() * 1.4, 0, TAU); g.fill(); }
      g.fillStyle = snow ? 'rgba(232, 238, 248, 0.85)' : 'rgba(92, 128, 64, 0.6)';
      g.beginPath(); g.ellipse(x - r * 0.2, y - r * (flat ? 0.3 : 0.55), r * 0.8, r * 0.3, -0.15, 0, TAU); g.fill();
      g.restore();
    };
    const blades = (x, y, n, len, col) => {
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.1, l = len * (0.5 + R() * 0.6);
        g.strokeStyle = col[(R() * col.length) | 0]; g.lineWidth = 1 + R() * 0.8;
        g.beginPath(); g.moveTo(x + (R() - 0.5) * 6, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.4, y + Math.sin(a) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    };
    const grass = { spring: ['#6a9e48', '#86b858', '#4f8038'], summer: ['#4f8f40', '#6cab4c', '#3b7334'], autumn: ['#a89a48', '#c49a4a', '#7f8a3c', '#b8743a'], winter: ['#62766a', '#8a978e', '#aab4ae'] }[season];
    const scale = Math.max(0.7, Math.min(1.3, h / 300));
    // stones and grasses along both banks
    for (let x = -10; x < w + 20; x += (26 + R() * 46) * scale) {
      for (const side of [-1, 1]) {
        if (R() < 0.55) stone(x + R() * 10, cy(x) + side * (hw(x) + 3) + (R() - 0.5) * 6, (7 + R() * 9) * scale, false);
        if (R() < 0.7) blades(x + R() * 20, cy(x) + side * (hw(x) + 18 + R() * 24), 6 + (R() * 8 | 0), 16 * scale, grass);
      }
    }
    // ground cover in the season: petals, fallen maple leaves, or nothing but snow
    const kind = window.SEASON ? window.SEASON.info().kind : 'leaf';
    if (kind === 'petal' || kind === 'leaf') {
      for (let i = 0; i < w / 14; i++) {
        const x = R() * w, side = R() < 0.5 ? -1 : 1, y = cy(x) + side * (hw(x) + 10 + R() * (h * 0.22));
        const p = window.SEASON.particle.spawn(kind, w, h); p.x = x; p.y = y; p.flip = 0; p.size *= 0.8;
        g.save(); g.globalAlpha = 0.75; window.SEASON.particle.draw(g, p); g.restore();
      }
    }
    // stepping stones across the stream
    const sx = w * 0.74;
    for (let i = 0; i < 5; i++) {
      const t = i / 4, x = sx + (t - 0.5) * 30 * scale, y = cy(x) - hw(x) * 0.9 + t * hw(x) * 1.8;
      stone(x, y, (11 + R() * 3) * scale, true);
    }
    // a yatsuhashi: zigzag planks over the water, with irises growing beside it
    const yx = w * 0.24, pw = 13 * scale;
    const segs = [[yx - 40 * scale, cy(yx) - hw(yx) - 8], [yx + 10 * scale, cy(yx) - hw(yx) * 0.3], [yx - 30 * scale, cy(yx) + hw(yx) * 0.35], [yx + 20 * scale, cy(yx) + hw(yx) + 8]];
    if (season === 'spring' || season === 'summer') {
      for (let i = 0; i < 9; i++) {
        const ix = yx + (R() - 0.5) * 120 * scale, iy = cy(ix) + (R() < 0.5 ? -1 : 1) * (hw(ix) * (0.6 + R() * 0.3));
        g.strokeStyle = '#3c6a32'; g.lineWidth = 1.6;
        for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 0.5; g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix + Math.cos(a) * 18 * scale, iy + Math.sin(a) * 18 * scale); g.stroke(); }
        g.fillStyle = '#6b4fb0'; g.beginPath(); g.ellipse(ix + 2, iy - 17 * scale, 3.4 * scale, 2.2 * scale, 0.4, 0, TAU); g.fill();
        g.fillStyle = '#8f75d0'; g.beginPath(); g.ellipse(ix - 1, iy - 19 * scale, 2.6 * scale, 1.6 * scale, -0.5, 0, TAU); g.fill();
        g.fillStyle = '#e8c45a'; g.fillRect(ix, iy - 18 * scale, 1.2, 1.2);
      }
    }
    for (let i = 0; i < segs.length - 1; i++) {
      const [x0, y0] = segs[i], [x1, y1] = segs[i + 1], len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
      g.save(); g.translate(x0, y0); g.rotate(a);
      g.fillStyle = 'rgba(0, 0, 0, 0.4)'; g.fillRect(4, pw * 0.2, len, pw);
      const wg = g.createLinearGradient(0, -pw / 2, 0, pw / 2);
      wg.addColorStop(0, '#8a6a46'); wg.addColorStop(1, '#5e4630');
      g.fillStyle = wg; g.fillRect(0, -pw / 2, len, pw);
      g.strokeStyle = 'rgba(30, 20, 10, 0.55)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
      for (let k = 6; k < len; k += 9) { g.strokeStyle = 'rgba(60, 40, 20, 0.25)'; g.beginPath(); g.moveTo(k, -pw / 2); g.lineTo(k, pw / 2); g.stroke(); }
      if (snow) { g.fillStyle = 'rgba(232, 238, 248, 0.8)'; g.fillRect(0, -pw / 2, len, pw * 0.4); }
      g.restore();
      g.fillStyle = '#2a1e14'; g.beginPath(); g.arc(x1, y1, 2.4 * scale, 0, TAU); g.fill();
    }
    // a yukimi-doro, the snow-viewing lantern, on the near bank
    const lx = w * 0.53, ly = cy(lx) + hw(lx) + 46 * scale, ls = scale * 0.9;
    g.save(); g.translate(lx, ly); g.scale(ls, ls);
    g.fillStyle = 'rgba(0, 0, 0, 0.45)'; g.beginPath(); g.ellipse(4, 4, 30, 8, 0, 0, TAU); g.fill();
    g.fillStyle = '#4c5150';
    [[-18, 0], [-6, 4], [8, 2], [18, -2]].forEach(([dx, dy]) => g.fillRect(dx - 2, -16 + dy, 4, 16));
    g.fillRect(-12, -24, 24, 9); g.fillStyle = '#ffd88a'; g.fillRect(-7, -23, 14, 6);
    g.fillStyle = '#5a5f5d'; g.beginPath(); g.moveTo(-30, -24); g.quadraticCurveTo(0, -42, 30, -24); g.quadraticCurveTo(0, -30, -30, -24); g.fill();
    g.beginPath(); g.arc(0, -37, 3.5, 0, TAU); g.fill();
    if (snow) { g.fillStyle = 'rgba(235, 240, 250, 0.9)'; g.beginPath(); g.moveTo(-26, -27); g.quadraticCurveTo(0, -42, 26, -27); g.quadraticCurveTo(0, -34, -26, -27); g.fill(); }
    g.globalCompositeOperation = 'lighter';
    const lg = g.createRadialGradient(0, -20, 0, 0, -20, 46); lg.addColorStop(0, 'rgba(255, 200, 120, 0.4)'); lg.addColorStop(1, 'rgba(255, 200, 120, 0)');
    g.fillStyle = lg; g.fillRect(-46, -66, 92, 92);
    g.restore();
    // kakei, the bamboo spout, reaching over the far bank
    const bx = w * 0.9, by0 = cy(bx) - hw(bx) - 30 * scale, ex = bx - 34 * scale, ey = cy(bx) - hw(bx) + 4;
    g.lineCap = 'round';
    g.strokeStyle = '#3f5a2a'; g.lineWidth = 9 * scale; g.beginPath(); g.moveTo(bx, by0); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = '#7c9a4a'; g.lineWidth = 6 * scale; g.beginPath(); g.moveTo(bx, by0); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = 'rgba(220, 240, 180, 0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx, by0 - 2); g.lineTo(ex, ey - 2); g.stroke();
    spoutAt = { x: ex - 2, y: ey + 2, land: { x: ex - 8 * scale, y: ey + 24 * scale } };
    return c;
  }

  /* ---------------- the koi ---------------- */
  function makeKoi(v, i) {
    const L = h * (0.15 + R() * 0.08), n = 16, seg = L / n;
    const x = w * (0.05 + R() * 0.9), y = cy(x) + (R() - 0.5) * hw(x), a = R() < 0.5 ? 0 : Math.PI;
    return {
      v, L, n, seg, a, speed: 18 + R() * 10, phase: R() * TAU, wander: a, depth: 0.72 + R() * 0.28, gulp: 0, id: i,
      pts: Array.from({ length: n + 1 }, (_, k) => [x - Math.cos(a) * seg * k, y - Math.sin(a) * seg * k]),
    };
  }
  const width = (k, t) => k.L * 0.12 * (t < 0.14 ? 0.72 + (t / 0.14) * 0.28 : Math.max(0.16, Math.pow(1 - (t - 0.14) / 0.86, 0.85)));

  function steer(k, dt) {
    const [hx, hy] = k.pts[0];
    let tx = Math.cos(k.wander), ty = Math.sin(k.wander), urgency = 0;
    k.wander += (R() - 0.5) * dt * 1.6;
    // food first
    let best = null, bd = 1e9;
    for (const f of food) { const d = Math.hypot(f.x - hx, f.y - hy); if (d < bd && d < Math.max(w, h) * 0.7) { bd = d; best = f; } }
    if (best) { tx = (best.x - hx) / bd; ty = (best.y - hy) / bd; urgency = 1; if (bd < 7 + k.L * 0.05) { best.eaten = true; k.gulp = 1; ripples.push({ x: best.x, y: best.y, r: 2, a: 0.5, v: 26 }); } }
    else if (mouse.on && mouse.still > 0.6) {
      const d = Math.hypot(mouse.x - hx, mouse.y - hy);
      if (d < 220 && d > 34) { tx += ((mouse.x - hx) / d) * 1.2; ty += ((mouse.y - hy) / d) * 1.2; urgency = 0.15; }
    }
    // stay in the channel, and mostly swim along it rather than across
    const off = hy - cy(hx), lim = hw(hx) * 0.5;
    if (Math.abs(off) > lim) ty -= Math.sign(off) * ((Math.abs(off) - lim) / (hw(hx) * 0.25)) * 2.4;
    ty *= 0.75;
    // and give the others room
    for (const o of koi) {
      if (o === k) continue;
      const dx = hx - o.pts[3][0], dy = hy - o.pts[3][1], d = Math.hypot(dx, dy);
      if (d < k.L * 0.9 && d > 0) { tx += (dx / d) * 0.8; ty += (dy / d) * 0.8; }
    }
    const want = Math.atan2(ty, tx);
    let da = want - k.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    const turn = (1.1 + urgency * 2.2) * dt;
    k.a += Math.max(-turn, Math.min(turn, da));
    if (Math.abs(da) > 1.2 && !urgency) k.wander = want;
    const target = 16 + urgency * 46 + (k.gulp > 0 ? -10 : 0);
    k.speed += (target - k.speed) * Math.min(1, dt * 1.5);
    k.gulp = Math.max(0, k.gulp - dt * 2);
    // the head swims, the body follows: a little lateral swing makes the undulation
    k.phase += dt * (3 + k.speed * 0.12);
    const swing = Math.sin(k.phase) * 0.32 * Math.min(1, k.speed / 30);
    const dir = k.a + swing;
    k.pts[0][0] += Math.cos(dir) * k.speed * dt + CURRENT * 0.4 * dt;
    k.pts[0][1] += Math.sin(dir) * k.speed * dt;
    // the stream runs off both edges: a koi that swims out comes back in on the other side
    const wrap = k.pts[0][0] > w + k.L * 1.6 ? -(w + k.L * 3) : k.pts[0][0] < -k.L * 1.6 ? w + k.L * 3 : 0;
    if (wrap) k.pts.forEach(p => { p[0] += wrap; });
    for (let i = 1; i <= k.n; i++) {
      const p = k.pts[i], q = k.pts[i - 1], dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy) || 1;
      p[0] = q[0] + (dx / d) * k.seg; p[1] = q[1] + (dy / d) * k.seg;
    }
  }

  function bodyPath(k) {
    const L = [], Rt = [];
    for (let i = 0; i <= k.n; i++) {
      const p = k.pts[i], q = k.pts[Math.min(k.n, i + 1)], o = k.pts[Math.max(0, i - 1)];
      const ang = Math.atan2(o[1] - q[1], o[0] - q[0]), wd = width(k, i / k.n);
      const nx = -Math.sin(ang) * wd, ny = Math.cos(ang) * wd;
      L.push([p[0] + nx, p[1] + ny]); Rt.push([p[0] - nx, p[1] - ny]);
    }
    const head = k.pts[0], a0 = Math.atan2(head[1] - k.pts[1][1], head[0] - k.pts[1][0]);
    const path = new Path2D();
    path.moveTo(head[0] + Math.cos(a0) * k.seg * 0.9, head[1] + Math.sin(a0) * k.seg * 0.9);
    const side = arr => arr.forEach(([x, y], i) => {
      const nx2 = arr[Math.min(arr.length - 1, i + 1)];
      path.quadraticCurveTo(x, y, (x + nx2[0]) / 2, (y + nx2[1]) / 2);
    });
    side(L);
    const tail = k.pts[k.n];
    path.lineTo(tail[0], tail[1]);
    side(Rt.slice().reverse());
    path.closePath();
    return path;
  }

  function drawKoi(k) {
    const P = k.pts, v = k.v, n = k.n;
    const ang = i => Math.atan2(P[i][1] - P[Math.min(n, i + 1)][1], P[i][0] - P[Math.min(n, i + 1)][0]);
    ctx.save();
    ctx.globalAlpha = 0.84 + k.depth * 0.16;
    // tail fin: two lobes trailing the last segment, swaying with it
    const tp = P[n], ta = ang(n - 1) + Math.PI, sway = Math.sin(k.phase - 1.4) * 0.35, fl = k.L * 0.3;
    ctx.fillStyle = v.metal ? 'rgba(240, 200, 110, 0.55)' : 'rgba(246, 238, 226, 0.5)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; ctx.lineWidth = 0.6;
    [-1, 1].forEach(sd => {
      const a = ta + sway + sd * 0.42, mx = tp[0] + Math.cos(a) * fl, my = tp[1] + Math.sin(a) * fl;
      ctx.beginPath(); ctx.moveTo(tp[0], tp[1]);
      ctx.quadraticCurveTo(tp[0] + Math.cos(ta + sway + sd * 0.15) * fl * 0.8, tp[1] + Math.sin(ta + sway + sd * 0.15) * fl * 0.8, mx, my);
      ctx.quadraticCurveTo(tp[0] + Math.cos(ta + sway + sd * 0.7) * fl * 0.5, tp[1] + Math.sin(ta + sway + sd * 0.7) * fl * 0.5, tp[0], tp[1]);
      ctx.fill(); ctx.stroke();
    });
    // pectoral fins
    const pi = 3, pp = P[pi], pa = ang(pi), flap = Math.sin(k.phase * 1.3) * 0.4;
    ctx.fillStyle = v.metal ? 'rgba(240, 200, 110, 0.5)' : 'rgba(246, 238, 226, 0.45)';
    [-1, 1].forEach(sd => {
      const a = pa + Math.PI + sd * (1.05 + flap * sd), r = k.L * 0.16;
      ctx.beginPath(); ctx.ellipse(pp[0] + Math.cos(a) * r * 0.7, pp[1] + Math.sin(a) * r * 0.7, r, r * 0.42, a, 0, TAU); ctx.fill();
    });
    // body
    const body = bodyPath(k);
    ctx.fillStyle = v.base; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    for (const [t0, t1, sideOff, wsc, col] of v.patches) {
      ctx.fillStyle = col;
      for (let i = Math.floor(t0 * n); i <= Math.ceil(t1 * n) && i <= n; i++) {
        const p = P[i], a = ang(i), wd = width(k, i / n);
        const ox = -Math.sin(a) * wd * sideOff, oy = Math.cos(a) * wd * sideOff;
        ctx.beginPath(); ctx.arc(p[0] + ox, p[1] + oy, wd * wsc, 0, TAU); ctx.fill();
      }
    }
    if (v.scales) { // asagi: a net of darker scale edges along the back
      ctx.strokeStyle = 'rgba(40, 55, 75, 0.45)'; ctx.lineWidth = 0.6;
      for (let i = 2; i < n - 2; i += 1) { const p = P[i], a = ang(i), wd = width(k, i / n); ctx.beginPath(); ctx.arc(p[0], p[1], wd * 0.55, a + 1.9, a + 4.4); ctx.stroke(); }
    }
    // shading: dark flanks, a lit ridge down the back
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'; ctx.lineWidth = 2.2; ctx.stroke(body);
    ctx.beginPath(); P.slice(0, n - 2).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = v.metal ? 'rgba(255, 245, 200, 0.55)' : 'rgba(255, 255, 255, 0.28)'; ctx.lineWidth = width(k, 0.3) * 0.5; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
    // dorsal fin, a translucent ridge
    ctx.beginPath(); P.slice(4, 10).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'; ctx.lineWidth = 1.4; ctx.stroke();
    // eyes
    const h0 = P[1], ha = ang(1), ew = width(k, 0.06) * 0.62;
    ctx.fillStyle = '#121014';
    [-1, 1].forEach(sd => { ctx.beginPath(); ctx.arc(h0[0] - Math.sin(ha) * ew * sd + Math.cos(ha) * k.seg * 0.5, h0[1] + Math.cos(ha) * ew * sd + Math.sin(ha) * k.seg * 0.5, Math.max(0.8, k.L * 0.012), 0, TAU); ctx.fill(); });
    ctx.restore();
  }

  /* ---------------- the surface ---------------- */
  function makeSurface() {
    const sc = Math.max(0.65, Math.min(1.2, h / 300));
    pads = Array.from({ length: Math.max(5, Math.round(w / 170)) }, (_, i) => {
      const x = w * (0.04 + R() * 0.92);
      return { x, y: cy(x) + (R() < 0.5 ? -1 : 1) * hw(x) * (0.55 + R() * 0.3), r: (11 + R() * 11) * sc, a: R() * TAU, va: (R() - 0.5) * 0.04, flower: i % 3 === 0 };
    });
    const kind = window.SEASON ? window.SEASON.info().kind : 'leaf';
    floaters = kind === 'snow' || kind === 'firefly' ? [] : Array.from({ length: Math.round(w / 110) }, () => {
      const p = window.SEASON.particle.spawn(kind, w, h, { anywhere: true });
      p.x = R() * w; p.y = cy(p.x) + (R() - 0.5) * hw(p.x) * 1.4; p.flip = 0; p.size *= 1.1; p.lane = (p.y - cy(p.x)) / hw(p.x); return p;
    });
    glints = Array.from({ length: Math.round(w / 40) }, () => { const x = R() * w; return { x, y: cy(x) + (R() - 0.5) * hw(x) * 1.6, ph: R() * TAU, s: 0.6 + R() * 1.4 }; });
    streaks = Array.from({ length: Math.round(w / 45) }, () => ({ x: R() * w, lane: (R() - 0.5) * 1.5, len: 14 + R() * 30, v: CURRENT * (1.4 + R()) }));
  }

  function drawPad(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(3, 5, p.r, p.r * 0.92, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
    g.addColorStop(0, '#5d8f4a'); g.addColorStop(1, '#2f5a2f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.r, 0.22, TAU - 0.05); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200, 230, 160, 0.18)'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) { const a = 0.4 + (i / 9) * (TAU - 0.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * p.r * 0.9, Math.sin(a) * p.r * 0.9); ctx.stroke(); }
    if (p.flower) {
      const fr = p.r * 0.5;
      ctx.translate(-p.r * 0.25, -p.r * 0.2);
      [[10, fr, '#e8a5b6'], [8, fr * 0.75, '#f3c1cc'], [6, fr * 0.5, '#fbe1e6']].forEach(([cnt, r, col], layer) => {
        ctx.fillStyle = col;
        for (let i = 0; i < cnt; i++) { const a = (i / cnt) * TAU + layer * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.55, r * 0.22, a, 0, TAU); ctx.fill(); }
      });
      ctx.fillStyle = '#f2cf5a'; ctx.beginPath(); ctx.arc(0, 0, fr * 0.16, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- frame ---------------- */
  function draw(dt) {
    ctx.drawImage(bed, 0, 0, w, h);
    // caustics on the floor, two layers drifting against each other
    if (caustic) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const S = caustic.width;
      for (const [k, vx, vy, al] of [[1.7, 7, 4, 0.2], [2.6, -5, 6, 0.13]]) {
        ctx.globalAlpha = al;
        const size = S * k, ox = ((time * vx) % size + size) % size, oy = ((time * vy) % size + size) % size;
        for (let x = -size + ox; x < w; x += size) for (let y = -size + oy; y < h; y += size) ctx.drawImage(caustic, x, y, size, size);
      }
      ctx.restore();
    }
    // shadows on the floor, then food, then the koi
    ctx.save(); ctx.filter = 'blur(4px)'; ctx.fillStyle = 'rgba(0, 12, 16, 0.4)';
    for (const k of koi) { ctx.save(); ctx.translate(8 * k.depth, 12 * k.depth); ctx.fill(bodyPath(k)); ctx.restore(); }
    ctx.restore();
    for (const f of food) {
      ctx.fillStyle = `rgba(196, 140, 70, ${Math.min(1, f.life / 2).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.2, 0, TAU); ctx.fill();
    }
    koi.slice().sort((a, b) => a.depth - b.depth).forEach(drawKoi);
    // a little caustic light on their backs too, and the water over them
    const wg = ctx.createLinearGradient(0, 0, w, h);
    wg.addColorStop(0, 'rgba(180, 230, 230, 0.06)'); wg.addColorStop(1, 'rgba(6, 24, 30, 0.04)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, w, h);
    // surface
    for (const p of pads) { p.a += p.va * dt; drawPad(p); }
    // last season's leaves fade as they drift on; the new season's fade in
    oldFloaters = oldFloaters.filter(p => (p.fade -= dt / 1.3) > 0);
    for (const p of oldFloaters) { p.x += CURRENT * 1.6 * dt; p.y = cy(p.x) + p.lane * hw(p.x); window.SEASON.particle.draw(ctx, p, 0.9 * p.fade); }
    for (const p of floaters) {
      p.fade = Math.min(1, (p.fade ?? 1) + dt / 1.3);
      p.x += (CURRENT * 1.6 + Math.sin(time * 0.3 + p.t) * 2) * dt; p.rot += 0.08 * dt;
      if (p.x > w + 20) p.x = -20;
      p.y = cy(p.x) + p.lane * hw(p.x) + Math.sin(time * 0.7 + p.t) * 2;
      window.SEASON.particle.draw(ctx, p, 0.9 * p.fade);
    }
    // the current, as faint streaks of light following the channel
    ctx.lineCap = 'round'; ctx.lineWidth = 1;
    for (const st of streaks) {
      st.x += st.v * dt; if (st.x > w + 40) st.x = -40;
      const y = x => cy(x) + st.lane * hw(x) * 0.6;
      ctx.strokeStyle = 'rgba(210, 240, 240, 0.09)';
      ctx.beginPath(); ctx.moveTo(st.x, y(st.x)); ctx.lineTo(st.x + st.len, y(st.x + st.len)); ctx.stroke();
    }
    // ripples
    ctx.lineWidth = 1;
    for (const r of ripples) {
      for (const k of [1, 0.6]) {
        ctx.strokeStyle = `rgba(220, 245, 245, ${(r.a * k).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * k, r.r * k * 0.82, 0, 0, TAU); ctx.stroke();
      }
    }
    // glints of sky on the surface
    for (const g of glints) {
      const a = Math.max(0, Math.sin(time * g.s + g.ph)) ** 6 * 0.5;
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(235, 248, 255, ${a.toFixed(3)})`; ctx.fillRect(g.x, g.y, 3 * g.s, 0.8);
    }
    // the spout's stream
    if (spoutAt) {
      const { x, y, land } = spoutAt;
      ctx.strokeStyle = 'rgba(220, 240, 245, 0.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 4, y + (land.y - y) * 0.3, land.x, land.y); ctx.stroke();
    }
    ctx.drawImage(rim, 0, 0, w, h);
    // a season change dissolves the old banks over the new ones
    if (oldRim && rimFade > 0) {
      ctx.globalAlpha = rimFade; ctx.drawImage(oldRim, 0, 0, w, h); ctx.globalAlpha = 1;
      rimFade = Math.max(0, rimFade - dt / 1.3); if (!rimFade) oldRim = null;
    }
  }

  function step(dt) {
    time += dt;
    koi.forEach(k => steer(k, dt));
    food.forEach(f => { f.life -= dt; f.x += (CURRENT + Math.sin(time + f.ph) * 2) * dt; });
    food = food.filter(f => !f.eaten && f.life > 0);
    ripples.forEach(r => { r.r += r.v * dt; r.a -= dt * 0.5; });
    ripples = ripples.filter(r => r.a > 0);
    if (spoutAt && (time % 0.7) < dt) ripples.push({ x: spoutAt.land.x, y: spoutAt.land.y, r: 2, a: 0.35, v: 22 });
    if (mouse.on) mouse.still += dt;
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.04, (now - (last || now)) / 1000); last = now;
    step(dt); draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function build() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    w = r.width; h = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bed = paintBed(); rim = paintGarden();
    if (!caustic) caustic = makeCaustic(160);
    if (!koi.length) koi = Array.from({ length: Math.max(5, Math.min(11, Math.round(w / 150))) }, (_, i) => makeKoi(VARIETIES[i % VARIETIES.length], i));
    makeSurface();
    built = true;
    return true;
  }

  const point = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    const [x, y] = point(e);
    ripples.push({ x, y, r: 3, a: 0.6, v: 34 }, { x, y, r: 1, a: 0.4, v: 22 });
    for (let i = 0; i < 6; i++) food.push({ x: x + (R() - 0.5) * 26, y: y + (R() - 0.5) * 26, life: 14, ph: R() * 6 });
    if (reduce) { for (let i = 0; i < 200; i++) step(1 / 30); draw(0); }
  });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = point(e);
    if (Math.hypot(x - mouse.x, y - mouse.y) > 3) mouse.still = 0;
    if (mouse.on && Math.hypot(x - mouse.x, y - mouse.y) > 26) ripples.push({ x, y, r: 1, a: 0.18, v: 20 });
    mouse.x = x; mouse.y = y; mouse.on = true;
  });
  canvas.addEventListener('pointerleave', () => { mouse.on = false; });

  const start = () => { if (!raf && visible && !reduce) { last = 0; raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !built && build()) { for (let i = 0; i < 60; i++) step(1 / 30); draw(0); }
    start();
  }, { rootMargin: '200px 0px' }).observe(canvas);
  document.addEventListener('visibilitychange', start);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (built && build()) draw(0); }, 200); });
  if (window.SEASON) window.SEASON.on(() => {
    if (!built) return;
    oldRim = rim; rimFade = 1; rim = paintGarden();
    oldFloaters = floaters.map(p => ({ ...p, fade: 1 }));
    const keepPads = pads, keepGlints = glints, keepStreaks = streaks;
    makeSurface();
    pads = keepPads; glints = keepGlints; streaks = keepStreaks; // only what the season owns changes
    floaters.forEach(p => { p.fade = 0; });
    if (reduce) { oldRim = null; oldFloaters = []; floaters.forEach(p => { p.fade = 1; }); draw(0); }
  });
})();
