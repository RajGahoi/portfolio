/* 肖像, the portrait as a woodblock print. Aizuri-e, the indigo prints Hokusai
   and Hiroshige made with Prussian blue: the photo is cut into a key block
   (the outlines, from a Sobel pass) and tone blocks (posterised luminance), then
   pressed onto washi one block at a time when the scroll finishes unrolling.
   The season tints the bokashi, the gradient band along the top edge.
   The ink is still wet: touching it makes it bleed, and it dries back.
   The precision slider (fun.js) sets how many tone blocks there are. */
(() => {
  const canvas = document.getElementById('print');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const fig = canvas.closest('.portrait');
  const status = fig && fig.querySelector('[data-print-status]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const img = new Image();
  img.src = './assets/images/portrait.jpg?v=20261020_6';

  // dark → light: sumi, ai, hanada, asagi, a pale indigo wash, washi
  const RAMP = ['#15162b', '#22305f', '#38548f', '#7a94bf', '#c6d0e2', '#f2e9d6'].map(h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
  const WASHI = RAMP[5], SUMI = RAMP[0];
  const BOKASHI = { spring: [232, 160, 180], summer: [116, 178, 164], autumn: [222, 118, 72], winter: [168, 190, 220] };

  let cw = 0, ch = 0, W = 0, H = 0, dpr = 1, bits = 32;
  let sharp, soft, edge, grain, layers = null, finalC = null, wetC = null, maskC = null;
  let pressed = false, press = null, wet = [], raf = 0, last = 0, ready = false;

  const surface = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ramp = t => {
    const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = x | 0, f = x - i, a = RAMP[i], b = RAMP[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };

  // Read the photo once per size: sharp and softened luminance, outlines, wood grain.
  function build() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height || !img.width) return false;
    cw = r.width; ch = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(cw * dpr); H = Math.round(ch * dpr);
    canvas.width = W; canvas.height = H;
    const k = img.width / 1123; // framing tuned on the 1123px original
    const read = blur => {
      const o = surface(W, H).getContext('2d', { willReadFrequently: true });
      o.filter = blur ? `blur(${blur}px)` : 'none';
      o.drawImage(img, 0, 0, img.width, img.height, 0, 0, W, H);
      const d = o.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
      for (let i = 0; i < L.length; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
      return L;
    };
    let lines;
    try { sharp = read(0.5 * dpr); soft = read(1.6 * dpr); lines = read(2.4 * dpr); } catch (_) { return false; }
    const hist = [];
    for (let i = 0; i < sharp.length; i += 7) hist.push(sharp[i]);
    hist.sort((a, b) => a - b);
    const lo = hist[(hist.length * 0.01) | 0], hi = hist[(hist.length * 0.998) | 0];
    // a gentle stretch: lift the blacks and keep skin off bare paper, so nothing clips
    for (const L of [sharp, soft, lines]) for (let i = 0; i < L.length; i++) L[i] = 0.1 + 0.8 * Math.pow(Math.min(1, Math.max(0, (L[i] - lo) / (hi - lo))), 0.9);

    // key block: Sobel on a well-softened copy, so it cuts one clean line per edge (glasses included)
    edge = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, s = lines;
      const gx = s[i - W + 1] + 2 * s[i + 1] + s[i + W + 1] - s[i - W - 1] - 2 * s[i - 1] - s[i + W - 1];
      const gy = s[i + W - 1] + 2 * s[i + W] + s[i + W + 1] - s[i - W - 1] - 2 * s[i - W] - s[i - W + 1];
      const m = Math.sqrt(gx * gx + gy * gy) / dpr;
      edge[i] = Math.min(1, Math.max(0, (m - 0.2) / 0.38));
    }
    // the cherry block leaves its grain in the ink: long horizontal streaks, plus washi fibre
    grain = new Float32Array(W * H);
    const rows = Array.from({ length: H }, () => Math.random()), cols = Array.from({ length: (W >> 3) + 2 }, () => Math.random());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = cols[x >> 3] + ((cols[(x >> 3) + 1] - cols[x >> 3]) * (x & 7)) / 8;
      grain[y * W + x] = 0.9 + 0.06 * (0.5 + 0.5 * Math.sin(y / dpr * 0.9 + c * 5 + rows[y] * 0.8)) + Math.random() * 0.03;
    }
    return true;
  }

  // Cut the blocks for the current precision and season, and the final print.
  function cut() {
    const n = bits >= 8 ? 0 : 2 ** bits;
    const L = n && n <= 4 ? soft : sharp;
    const bok = BOKASHI[window.SEASON ? window.SEASON.get() : 'autumn'];
    const band = Math.round(H * 0.24);
    const mk = () => new ImageData(W, H);
    const paper = mk(), tone = [mk(), mk(), mk()], key = mk();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      const t = L[i], q = n ? Math.round(t * (n - 1)) / (n - 1) : t;
      const fib = 0.97 + Math.random() * 0.03;
      // paper, with the bokashi band rubbed into the top edge
      let pr = WASHI[0] * fib, pg = WASHI[1] * fib, pb = WASHI[2] * fib;
      if (y < band) {
        const a = Math.pow(1 - y / band, 1.6) * 0.7;
        pr += (bok[0] - pr) * a; pg += (bok[1] - pg) * a; pb += (bok[2] - pb) * a;
      }
      paper.data.set([pr, pg, pb, 255], o);
      // tone blocks: light, mid, dark; anything brighter stays bare paper
      const b = n === 2 ? (q < 0.5 ? 2 : -1) : q < 0.32 ? 2 : q < 0.58 ? 1 : q < 0.89 ? 0 : -1;
      if (b >= 0) {
        const [r, g, bl] = n === 2 ? SUMI : ramp(q);
        const d = grain[i];
        tone[b].data.set([pr + (r - pr) * d, pg + (g - pg) * d, pb + (bl - pb) * d, 255], o);
      }
      const e = edge[i] * (n === 2 ? 0.5 : n ? 0.6 : 0.42);
      if (e > 0.02) key.data.set([SUMI[0], SUMI[1], SUMI[2], e * 255 * grain[i]], o);
    }
    const toCanvas = id => { const c = surface(W, H); c.getContext('2d').putImageData(id, 0, 0); return c; };
    layers = { paper: toCanvas(paper), tone: tone.map(toCanvas), key: toCanvas(key), seal: sealCanvas() };

    finalC = surface(W, H);
    const f = finalC.getContext('2d');
    f.drawImage(layers.paper, 0, 0);
    layers.tone.forEach(c => f.drawImage(c, 0, 0));
    f.drawImage(layers.key, 0, 0);
    f.drawImage(layers.seal, 0, 0);
    // wet ink: the same print, bled and a shade darker
    wetC = surface(W, H);
    const g = wetC.getContext('2d');
    g.filter = `blur(${2.4 * dpr}px)`; g.drawImage(finalC, 0, 1.5 * dpr);
    g.filter = 'none'; g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(70, 80, 130, 0.35)'; g.fillRect(0, 0, W, H);
    maskC = maskC && maskC.width === W && maskC.height === H ? maskC : surface(W, H);
  }

  // the signature seal, stamped last in the lower right
  function sealCanvas() {
    const c = surface(W, H), g = c.getContext('2d'), s = 15 * dpr, x = W - s - 9 * dpr, y = H - s * 2.1 - 9 * dpr;
    g.fillStyle = 'rgba(196, 64, 44, 0.92)'; g.fillRect(x, y, s, s * 2.1);
    g.strokeStyle = 'rgba(242, 233, 214, 0.75)'; g.lineWidth = dpr; g.strokeRect(x + 1.6 * dpr, y + 1.6 * dpr, s - 3.2 * dpr, s * 2.1 - 3.2 * dpr);
    g.fillStyle = '#f6ecdb'; g.font = `700 ${Math.round(8.5 * dpr)}px 'Shippori Mincho', serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['ラ', 'ジ', 'ガ'].forEach((ch, i) => g.fillText(ch, x + s / 2, y + s * 0.42 + i * s * 0.62));
    return c;
  }

  /* ---------------- pressing ---------------- */
  // key block first, then the tones light to dark, then the seal; each lands slightly
  // out of register and settles, the way a hand-pressed sheet does
  const STAMPS = [['key', 0], ['tone0', 0.5], ['tone1', 0.95], ['tone2', 1.4], ['seal', 2.05]];
  function startPress() {
    if (!layers) return;
    pressed = true;
    if (reduce) { draw(); return; }
    press = { t: 0, jit: STAMPS.map(() => [(Math.random() - 0.5) * 6 * dpr, (Math.random() - 0.5) * 6 * dpr]) };
    say('pressing');
    wake();
  }
  const layerOf = name => (name.startsWith('tone') ? layers.tone[+name[4]] : layers[name]);

  function draw(dt = 0) {
    if (!layers) return;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (!pressed) { ctx.drawImage(layers.paper, 0, 0); return; }
    if (press) {
      press.t += dt;
      ctx.drawImage(layers.paper, 0, 0);
      const at = name => STAMPS.find(s => s[0] === name)[1];
      const stamp = name => {
        const k = Math.min(1, Math.max(0, (press.t - at(name)) / 0.32));
        if (!k) return;
        const e = 1 - Math.pow(1 - k, 3), [jx, jy] = press.jit[STAMPS.findIndex(s => s[0] === name)];
        ctx.globalAlpha = e;
        ctx.drawImage(layerOf(name), jx * (1 - e), jy * (1 - e));
        ctx.globalAlpha = 1;
      };
      ['tone0', 'tone1', 'tone2', 'key', 'seal'].forEach(stamp);
      if (press.t > 2.5) { press = null; say('ink drying'); setTimeout(() => say('online'), 2600); }
      return;
    }
    ctx.drawImage(finalC, 0, 0);
    if (wet.length) {
      const m = maskC.getContext('2d');
      m.globalCompositeOperation = 'source-over';
      m.clearRect(0, 0, W, H);
      for (const p of wet) {
        const life = 1 - p.age / 1.9, r = (12 + p.age * 16) * dpr;
        const gr = m.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(0,0,0,${(0.85 * life * life).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        m.fillStyle = gr; m.beginPath(); m.arc(p.x, p.y, r, 0, Math.PI * 2); m.fill();
      }
      m.globalCompositeOperation = 'source-in';
      m.drawImage(wetC, 0, 0);
      ctx.drawImage(maskC, 0, 0);
    }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    wet.forEach(p => { p.age += dt; });
    wet = wet.filter(p => p.age < 1.9);
    draw(dt);
    if (press || wet.length) raf = requestAnimationFrame(frame); else last = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const say = s => { if (status) status.textContent = s; };

  canvas.parentElement.addEventListener('pointermove', e => {
    if (!pressed || press || reduce || !layers) return;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const p = wet[wet.length - 1];
    if (p && Math.hypot(p.x - x, p.y - y) < 7 * dpr) return;
    wet.push({ x, y, age: 0 });
    if (wet.length > 40) wet.shift();
    wake();
  });
  canvas.parentElement.addEventListener('click', () => { if (pressed && !press) startPress(); });

  function boot() {
    if (!build()) return;
    cut(); ready = true;
    if (reduce || (fig && fig.classList.contains('is-unrolled'))) startPress();
    draw();
  }
  if (fig) fig.addEventListener('unrolled', () => { if (ready && !pressed) startPress(); });
  if (!fig || !fig.classList.contains('scroll')) pressed = true; // no scroll to wait for
  img.onload = () => (document.fonts && document.fonts.ready ? document.fonts.ready.then(boot) : boot());

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (ready && build()) { cut(); draw(); } }, 160);
  });
  if (window.SEASON) window.SEASON.on(() => {
    if (!ready) return;
    cut();
    const r = canvas.getBoundingClientRect();
    if (pressed && r.bottom > 0 && r.top < window.innerHeight) startPress(); else draw();
  });

  // the precision slider (fun.js): fewer bits, fewer blocks to cut
  window.PORTRAIT = {
    quantize(b) { bits = b; if (!ready) return; cut(); if (!press) draw(); },
    pixels: () => Math.round(cw * ch),
  };
})();
