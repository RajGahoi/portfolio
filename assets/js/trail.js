/* Cursor trail. It used to shed 0s and 1s; now the cursor sheds whatever the
   season is dropping (petals, sparks of firefly light, maple leaves, snow).
   Trail state lives in JS; the canvas is cleared every frame, and the
   loop stops entirely once every particle has faded and the mouse is still.
   Off on touch devices and for prefers-reduced-motion. */
(() => {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce || !window.SEASON) return;

  const CFG = {
    LERP: 0.09,          // cursor smoothing (lower = more lag)
    SPAWN_RATE: 0.35,    // particles per frame while moving
    MAX: 60,
    LIFE_MIN: 70,        // in 60fps frames
    LIFE_MAX: 120,
    SPAWN_RADIUS: 16,
    ALPHA: 0.9,
    MOVE_THRESH: 2.5,    // px the smoothed cursor must move to spawn
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); }, { passive: true });

  const cur = { rx: -999, ry: -999, sx: -999, sy: -999, on: false };
  const pool = [];
  let raf = 0, last = 0;

  function spawn(x, y) {
    let p = pool.find(q => !q.alive);
    if (!p) { if (pool.length >= CFG.MAX) return; p = {}; pool.push(p); }
    const kind = window.SEASON ? window.SEASON.info().kind : 'petal';
    Object.assign(p, window.SEASON.particle.spawn(kind, W, H));
    p.x = x + (Math.random() - 0.5) * CFG.SPAWN_RADIUS * 2;
    p.y = y + (Math.random() - 0.5) * CFG.SPAWN_RADIUS;
    p.size *= kind === 'snow' ? 0.8 : kind === 'firefly' ? 0.7 : 0.6;
    p.vx = (Math.random() - 0.5) * 20; p.vy = kind === 'firefly' ? -10 : 12 + Math.random() * 14;
    if (kind === 'firefly') { p.blink = 0.7; p.t = Math.random() * 0.5 + 0.2; }
    p.life = p.max = CFG.LIFE_MIN + Math.random() * (CFG.LIFE_MAX - CFG.LIFE_MIN);
    p.alive = true;
  }

  function frame(now) {
    raf = 0;
    const f = Math.min(now - (last || now), 50) / (1000 / 60); // 1.0 at 60fps
    last = now;

    // smoothed cursor; spawn while it's still travelling
    const px = cur.sx, py = cur.sy;
    const k = 1 - Math.pow(1 - CFG.LERP, f);
    cur.sx += (cur.rx - cur.sx) * k;
    cur.sy += (cur.ry - cur.sy) * k;
    const moving = cur.on && Math.hypot(cur.sx - px, cur.sy - py) > CFG.MOVE_THRESH;
    if (moving && Math.random() < CFG.SPAWN_RATE * f) spawn(cur.sx, cur.sy);

    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of pool) {
      if (!p.alive) continue;
      p.life -= f;
      if (p.life <= 0) { p.alive = false; continue; }
      alive++;
      window.SEASON.particle.step(p, f / 60, W, H + 400, 0);
      const t = p.life / p.max;
      window.SEASON.particle.draw(ctx, p, t * CFG.ALPHA);
    }

    // keep running while digits are visible or the smoothed cursor is still catching up
    const settling = cur.on && Math.hypot(cur.rx - cur.sx, cur.ry - cur.sy) > 0.5;
    if (alive || settling) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  }
  const wake = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };

  window.addEventListener('mousemove', e => {
    if (!cur.on) { cur.sx = e.clientX; cur.sy = e.clientY; } // don't streak in from the corner
    cur.rx = e.clientX; cur.ry = e.clientY; cur.on = true;
    wake();
  }, { passive: true });
  document.addEventListener('mouseleave', () => { cur.on = false; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
})();
