/* Seasons: one of 春 夏 秋 冬 is set on <html data-season> before first paint
   (inline script in index.html, from the Japanese calendar month or the visitor's
   last pick). This file owns switching, and the small things that fall from the
   sky in each season: sakura petals, fireflies, momiji leaves and snow.
   scene.js, trail.js and ambience.js all read from here. */
(() => {
  const root = document.documentElement;
  const ORDER = ['spring', 'summer', 'autumn', 'winter'];
  const INFO = {
    spring: { kanji: '春', romaji: 'haru', en: 'spring', line: 'Sakura, and the one week a year everyone agrees on.', kind: 'petal', colors: ['#f6c9d4', '#f1b3c2', '#fbe3e9', '#e9a0b4'] },
    summer: { kanji: '夏', romaji: 'natsu', en: 'summer', line: 'Fireflies over the rice fields, and cicadas that never log off.', kind: 'firefly', colors: ['#d9f08a', '#c8e07a', '#eef7b0'] },
    autumn: { kanji: '秋', romaji: 'aki', en: 'autumn', line: 'Momiji season. The maples are shipping their best release.', kind: 'leaf', colors: ['#d9542f', '#e2703a', '#b8402c', '#e9a03c', '#c95a2a'] },
    winter: { kanji: '冬', romaji: 'fuyu', en: 'winter', line: 'Snow on the roofs, and a temple bell somewhere down the valley.', kind: 'snow', colors: ['#f4f7fc', '#e3ebf6', '#ffffff'] },
  };

  // Seasons as symbols anyone can read, with the English name beside them on hover.
  const PETAL_D = 'M0 1 C-0.5 0.6 -0.78 -0.3 -0.46 -0.9 Q-0.2 -1.06 0 -0.7 Q0.2 -1.06 0.46 -0.9 C0.78 -0.3 0.5 0.6 0 1Z';
  const ICON = {
    spring: `<svg viewBox="0 0 48 48" aria-hidden="true">${[0, 72, 144, 216, 288].map(r => `<path fill="currentColor" transform="translate(24 24) rotate(${r}) translate(0 -12) scale(10.5)" d="${PETAL_D}"/>`).join('')}<circle cx="24" cy="24" r="3.2" fill="#000" opacity=".35"/></svg>`,
    summer: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/><path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8"/></svg>',
    autumn: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M12.3 21 8 18.6l4.8-.4 5.8.6-4.8-6.3-2.2-5.3 4.8 3.1 5.4 5.8.4-9.1L24 1l1.8 6 .4 9.1 5.4-5.8 4.8-3.1-2.2 5.3-4.8 6.3 5.8-.6 4.8.4-4.3 2.4-5.5 2 .8 2 2.1 2.2-3.1-.7-6 1.8-6-1.8-3.1.7 2.1-2.2.8-2zM24 28l1 17h-2z"/></svg>',
    winter: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.6 4.2 12 6.4l2.4-2.2M9.6 19.8 12 17.6l2.4 2.2M4.4 10.4l3.1-.9-.8-3.1M19.6 13.6l-3.1.9.8 3.1M4.4 13.6l3.1.9-.8 3.1M19.6 10.4l-3.1-.9.8-3.1"/></svg>',
  };
  const NAME = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
  const subs = new Set();
  let current = ORDER.includes(root.dataset.season) ? root.dataset.season : 'autumn';
  root.dataset.season = current;

  function set(s, remember = true) {
    if (!INFO[s] || s === current) return;
    current = s;
    root.dataset.season = s;
    if (remember) { try { localStorage.setItem('season', s); } catch (_) { /* private mode */ } }
    subs.forEach(fn => fn(s));
    document.querySelectorAll('[data-season-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seasonBtn === s)));
    document.querySelectorAll('[data-season-kanji]').forEach(el => { el.innerHTML = ICON[s]; });
    document.querySelectorAll('[data-season-next]').forEach(el => { el.title = `Season: ${NAME[s]} (${INFO[s].kanji}). ${INFO[s].line} Click for the next one.`; el.setAttribute('aria-label', `Season: ${NAME[s]}. Change the season`); });
  }

  /* ---------------- falling things ---------------- */
  // Unit shapes, drawn at ~1px radius and scaled per particle.
  const PETAL = new Path2D('M0 1 C-0.5 0.6 -0.78 -0.3 -0.46 -0.9 Q-0.2 -1.06 0 -0.7 Q0.2 -1.06 0.46 -0.9 C0.78 -0.3 0.5 0.6 0 1Z');
  const LEAF = (() => {
    // a seven-lobed Japanese maple: tips, with shallow valleys between them
    const tips = [[-90, 1], [-50, 0.92], [-130, 0.92], [-12, 0.78], [-168, 0.78], [30, 0.5], [150, 0.5]].sort((a, b) => a[0] - b[0]);
    const p = new Path2D();
    const pt = (deg, r) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r];
    const all = [];
    for (let i = 0; i < tips.length; i++) {
      const [a, r] = tips[i];
      const nb = tips[(i + 1) % tips.length][0] + (i === tips.length - 1 ? 360 : 0);
      all.push(pt(a - 7, r * 0.72), pt(a, r), pt(a + 7, r * 0.72), pt((a + nb) / 2, 0.3));
    }
    all.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    p.moveTo(0, 0.3); p.lineTo(0.04, 0.95); p.lineTo(-0.02, 0.95); p.closePath();
    return p;
  })();

  function spawn(kind, w, h, opts = {}) {
    const r = Math.random;
    const colors = INFO[current].colors;
    const p = { kind, color: colors[(r() * colors.length) | 0], t: r() * 100, life: 1, depth: 0.4 + r() * 0.6 };
    const top = opts.anywhere ? r() * h : -20 - r() * 60;
    if (kind === 'firefly') {
      p.x = r() * w; p.y = h * (0.45 + r() * 0.5); p.vx = 0; p.vy = 0;
      p.size = 1.6 + r() * 1.8; p.blink = 0.6 + r() * 1.4;
    } else if (kind === 'snow') {
      p.x = r() * w; p.y = top; p.size = (0.8 + r() * 2.4) * (0.6 + p.depth * 0.6);
      p.vx = 0; p.vy = 18 + p.size * 9;
    } else {
      p.x = r() * w * 1.2 - w * 0.1; p.y = top;
      p.size = (kind === 'leaf' ? 5 + r() * 5 : 3.5 + r() * 3) * (0.55 + p.depth * 0.6);
      p.vx = 8 + r() * 14; p.vy = (kind === 'leaf' ? 28 : 20) + r() * 22;
      p.rot = r() * Math.PI * 2; p.vr = (r() - 0.5) * 2.4; p.flip = r() * 6; p.vflip = 1.5 + r() * 2.5;
    }
    return p;
  }

  // Integrate one particle. wind is a horizontal push in px/s, gust from the cursor.
  function step(p, dt, w, h, wind = 0) {
    p.t += dt;
    if (p.kind === 'firefly') {
      p.vx += (Math.sin(p.t * 0.7 + p.blink * 9) * 14 - p.vx) * dt;
      p.vy += (Math.cos(p.t * 0.5 + p.blink * 5) * 9 - p.vy) * dt;
      p.x += (p.vx + wind * 0.2) * dt; p.y += p.vy * dt;
      if (p.x < -20) p.x = w + 10; if (p.x > w + 20) p.x = -10;
      if (p.y < h * 0.3) p.vy += 6 * dt; if (p.y > h + 10) p.y = h * 0.5;
      return true;
    }
    if (p.kind === 'snow') {
      p.x += (Math.sin(p.t * 0.9 + p.size) * 10 + wind * 0.5) * dt;
      p.y += p.vy * dt;
    } else {
      const sway = Math.sin(p.t * 1.7 + p.flip) * (p.kind === 'leaf' ? 26 : 34);
      p.x += (p.vx + sway + wind) * dt;
      p.y += (p.vy + Math.cos(p.t * 2.1) * 8) * dt;
      p.rot += p.vr * dt; p.flip += p.vflip * dt;
    }
    return p.y < h + 30 && p.x > -60 && p.x < w + 60;
  }

  function draw(ctx, p, alpha = 1) {
    if (p.kind === 'firefly') {
      const on = Math.max(0, Math.sin(p.t * p.blink * 2.2)) ** 2;
      if (on < 0.02) return;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 7);
      g.addColorStop(0, hexA(p.color, 0.75 * on * alpha));
      g.addColorStop(1, hexA(p.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hexA('#fbffd8', on * alpha);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (p.kind === 'snow') {
      ctx.fillStyle = hexA(p.color, (0.35 + p.depth * 0.55) * alpha);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(p.size * Math.cos(p.flip), p.size);
    ctx.fillStyle = hexA(p.color, (0.55 + p.depth * 0.45) * alpha);
    ctx.fill(p.kind === 'leaf' ? LEAF : PETAL);
    ctx.restore();
  }

  const hexCache = new Map();
  function hexA(hex, a) {
    let rgb = hexCache.get(hex);
    if (!rgb) { const n = parseInt(hex.slice(1), 16); rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`; hexCache.set(hex, rgb); }
    return `rgba(${rgb},${a.toFixed(3)})`;
  }

  window.SEASON = {
    ORDER, INFO, ICON, NAME,
    get: () => current,
    info: () => INFO[current],
    set,
    next() { set(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]); },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    particle: { spawn, step, draw },
    hexA,
  };

  /* ---------------- controls ---------------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-season-btn]');
    if (b) { set(b.dataset.seasonBtn); return; }
    if (e.target.closest('[data-season-next]')) window.SEASON.next();
  });
  document.querySelectorAll('[data-season-btn]').forEach(b => {
    const k = b.dataset.seasonBtn;
    b.innerHTML = `${ICON[k]}<span class="season__label">${NAME[k]} <i lang="ja">${INFO[k].kanji}</i></span>`;
    b.setAttribute('aria-label', NAME[k]); b.title = `${NAME[k]} (${INFO[k].kanji})`;
  });
  // paint the labels for the starting season
  const start = current; current = null; set(start, false);
})();
