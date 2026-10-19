/* Page behaviour: nav, reveals,
   live GitHub numbers, the KV-cache simulator and small niceties. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GLYPHS = '01アイウエオカキクケコサシスセソ<>/{}=+*#λΣ∂∇';
  const rand = a => a[(Math.random() * a.length) | 0];

  /* ---------------- nav ---------------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 16);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggle = $('.nav__toggle');
  const menu = $('#mobile-menu');
  const setMenu = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    nav.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

  // Highlight the section in view
  const links = $$('.nav__links a');
  const byId = Object.fromEntries(links.map(a => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(l => l.classList.remove('is-active'));
      if (byId[en.target.id]) byId[en.target.id].classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['top', ...Object.keys(byId)].forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });

  /* ---------------- reveal + axon pulses ---------------- */
  const revealer = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      revealer.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('[data-reveal], .feature__viz').forEach(el => revealer.observe(el));

  const lit = new IntersectionObserver(entries => {
    entries.forEach(en => en.target.classList.toggle('is-lit', en.isIntersecting));
  }, { rootMargin: '0px 0px -30% 0px' });
  $$('.section').forEach(el => lit.observe(el));

  /* the portrait is a woodblock print now: assets/js/print.js */

  /* ---------------- train/loss sparkline ---------------- */
  (function loss() {
    const path = $('#loss-path'), val = $('#loss-val');
    if (!path) return;
    const N = 40, pts = [];
    let step = 0;
    const next = () => {
      step++;
      const base = 2.4 * Math.exp(-step / 60) + 0.12;
      return base + (Math.random() - 0.5) * base * 0.35;
    };
    for (let i = 0; i < N; i++) pts.push(next());
    const render = () => {
      const max = Math.max(...pts), min = Math.min(...pts);
      path.setAttribute('d', pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (N - 1)) * 80} ${18 - ((v - min) / (max - min || 1)) * 16}`).join(''));
      val.textContent = pts[N - 1].toFixed(3);
    };
    render();
    if (reduce) return;
    setInterval(() => {
      if (document.hidden) return;
      pts.shift(); pts.push(next());
      if (step > 420) step = 0; // start a new "run"
      render();
    }, 600);
  })();

  /* ---------------- live GitHub numbers ---------------- */
  async function repoStats(repo) {
    const key = `gh:${repo}`;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.t < 30 * 60 * 1000) return hit;
    } catch (_) { /* storage unavailable */ }
    const res = await fetch(`https://api.github.com/repos/TryingtobeingNikhil/${repo}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const out = { stars: j.stargazers_count, forks: j.forks_count, t: Date.now() };
    try { sessionStorage.setItem(key, JSON.stringify(out)); } catch (_) {}
    return out;
  }
  new Set($$('[data-stars],[data-forks]').map(el => el.dataset.stars || el.dataset.forks)).forEach(repo => {
    repoStats(repo).then(({ stars, forks }) => {
      $$(`[data-stars="${repo}"]`).forEach(el => { el.textContent = stars.toLocaleString('en-US'); });
      $$(`[data-forks="${repo}"]`).forEach(el => { el.textContent = forks.toLocaleString('en-US'); });
    }).catch(() => { /* keep the static numbers */ });
  });

  /* ---------------- demo recordings: play only while on screen ---------------- */
  $$('video[data-autoplay]').forEach(v => {
    if (reduce) { v.controls = true; return; } // no motion unless asked for
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) { if (v.preload !== 'auto') v.preload = 'auto'; v.play().catch(() => { v.controls = true; }); }
      else v.pause();
    }, { threshold: 0.35 }).observe(v);
  });

  /* ---------------- KV cache simulator ---------------- */
  (function kvSim() {
    const grid = $('#kv-grid');
    if (!grid) return;
    const POOL = 64, BLOCK = 16, MAX_RUN = 4;
    const cells = Array.from({ length: POOL }, () => {
      const d = document.createElement('div');
      d.className = 'kv-cell';
      grid.appendChild(d);
      return d;
    });
    const out = k => $(`[data-k="${k}"]`);
    const S = { run: out('run'), used: out('used'), swap: out('swap') };

    const owner = new Array(POOL).fill(-1);
    let seqs = [], swapped = [], nextId = 1, stepN = 0;
    const slots = [0, 1, 2, 3];
    const freeBlocks = () => owner.flatMap((o, i) => (o === -1 ? [i] : []));
    const need = s => Math.ceil(s.tokens / BLOCK);
    const flash = (i, cls) => { cells[i].classList.add(cls); setTimeout(() => cells[i].classList.remove(cls), 700); };

    function alloc(s, n) {
      const f = freeBlocks();
      if (f.length < n) return false;
      for (let k = 0; k < n; k++) {
        const i = f.splice((Math.random() * f.length) | 0, 1)[0]; // non-contiguous on purpose
        owner[i] = s.id; s.blocks.push(i);
        cells[i].dataset.s = s.slot;
        flash(i, 'is-new');
      }
      return true;
    }
    function release(s, cls) {
      s.blocks.forEach(i => { owner[i] = -1; delete cells[i].dataset.s; flash(i, cls); });
      s.blocks = [];
    }
    function retire(s) {
      seqs = seqs.filter(x => x !== s);
      slots.push(s.slot); slots.sort();
    }

    function admit() {
      if (!slots.length) return;
      if (swapped.length) {
        const s = swapped[0];
        s.slot = slots[0];
        if (alloc(s, need(s))) { swapped.shift(); slots.shift(); seqs.push(s); }
        return;
      }
      if (seqs.length >= MAX_RUN) return;
      const prompt = 16 + ((Math.random() * 64) | 0);
      const s = { id: nextId++, slot: slots[0], tokens: prompt, target: prompt + 90 + ((Math.random() * 260) | 0), blocks: [], age: stepN };
      if (alloc(s, need(s))) { slots.shift(); seqs.push(s); }
    }

    function tick() {
      stepN++;
      admit();
      for (const s of [...seqs]) {
        if (!seqs.includes(s)) continue;
        s.tokens += 6 + ((Math.random() * 6) | 0);
        if (s.tokens >= s.target) { release(s, 'is-freed'); retire(s); continue; }
        const more = need(s) - s.blocks.length;
        if (more > 0 && !alloc(s, more)) {
          // memory pressure: preempt the youngest sequence to the CPU pool
          const victim = seqs.reduce((a, b) => (b.age > a.age ? b : a));
          release(victim, 'is-swapped');
          retire(victim);
          swapped.push(victim);
          if (victim !== s) alloc(s, more);
        }
      }
      S.run.textContent = seqs.length;
      S.used.textContent = String(owner.filter(o => o !== -1).length).padStart(2, '0');
      S.swap.textContent = swapped.length;
    }

    let timer = 0;
    const run = on => {
      if (on && !timer) timer = setInterval(tick, reduce ? 1400 : 420);
      if (!on && timer) { clearInterval(timer); timer = 0; }
    };
    for (let i = 0; i < 18; i++) tick();
    new IntersectionObserver(([en]) => run(en.isIntersecting && !document.hidden)).observe(grid);
    document.addEventListener('visibilitychange', () => { if (document.hidden) run(false); });
  })();

  /* ---------------- copy email ---------------- */
  const copy = $('#copy-email');
  if (copy) copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copy.dataset.email);
    } catch (_) {
      window.location.href = `mailto:${copy.dataset.email}`;
      return;
    }
    copy.textContent = 'Copied ✓';
    copy.classList.add('is-copied');
    setTimeout(() => { copy.textContent = 'Copy email'; copy.classList.remove('is-copied'); }, 1800);
  });

  /* ---------------- the glass nav's sheen leans toward the cursor ---------------- */
  (function sheen() {
    const cap = $('.nav__capsule');
    if (!cap || reduce || !window.matchMedia('(hover: hover)').matches) return;
    let raf = 0, x = 30, y = -40;
    addEventListener('pointermove', e => {
      const r = cap.getBoundingClientRect();
      x = Math.max(-10, Math.min(110, ((e.clientX - r.left) / r.width) * 100));
      y = Math.max(-80, Math.min(60, ((e.clientY - r.top) / r.height) * 100 - 60));
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; cap.style.setProperty('--mx', `${x.toFixed(1)}%`); cap.style.setProperty('--my', `${y.toFixed(1)}%`); });
    }, { passive: true });
  })();

  /* ---------------- IST clock ---------------- */
  const clocks = $$('[data-clock]');
  if (clocks.length) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const t = () => { const v = f.format(new Date()); clocks.forEach(c => { c.textContent = v; }); };
    t(); setInterval(t, 15000);
  }
})();
