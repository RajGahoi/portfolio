/* Extras: time-zone line, token hover, contribution calendar,
   the three lab toys, and the ⌘K command palette. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (v, d) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d; // palette lives in main.css :root
  const ACC = css('--accent-rgb', '205, 176, 124'), FG = css('--fg-rgb', '236, 235, 230');
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- writing: assets/data/articles.js + articles added from the site ---------------- */
  // Articles published with the private "Add article" button live in /api/articles
  // (netlify/functions/articles.mjs) and are merged into the series here.
  // assets/js/publish.js drives the button through window.WRITING.
  const compact = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));
  (function articles() {
    const host = $('[data-articles]');
    const base = window.ARTICLES;
    if (!host || !Array.isArray(base)) return;
    const latestBox = $('[data-latest]');
    const views = items => items.reduce((n, a) => n + (a.views || 0), 0);
    const day = d => { const t = new Date(`${d}T00:00:00`); return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    let extra = [];

    // static series first, then each added article joins its series (or starts a new one)
    function merged() {
      const data = base.map(s => ({ ...s, items: s.items.map(a => ({ ...a })) }));
      const seen = new Set(data.flatMap(s => s.items.map(a => a.url)));
      extra.forEach(a => {
        if (seen.has(a.url)) return;
        seen.add(a.url);
        let s = data.find(x => x.series.toLowerCase() === a.series.toLowerCase());
        if (!s) data.push(s = { series: a.series, numbered: !a.tag, items: [] });
        s.items.push({ ...a, live: true });
      });
      return data;
    }

    /* ---------- the library: one list with series chips, sort and search ---------- */
    // Grouped by series in reading order (long series show 5 parts until opened);
    // flat when sorted by date or views, or while searching. The series filter
    // lives in the URL (#writing/rlforge) so a series can be shared as one link.
    const slug = name => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const chipsBox = $('[data-lib-chips]'), qBox = $('[data-lib-q]'), sortBox = $('[data-lib-sort]');
    // One series at a time (a tab per series), five parts showing until opened.
    const SHOW = 5, FOLD_ABOVE = 5, FRESH_DAYS = 10;
    const st = { series: null, sort: 'order', q: '', open: new Set() };
    let data = [];

    const fromHash = () => {
      const m = location.hash.match(/^#writing\/([a-z0-9-]+)$/);
      return m ? m[1] : null;
    };
    const setHash = () => {
      const want = st.series === 'all' ? '' : `#writing/${st.series}`;
      if (want && location.hash !== want) history.replaceState(null, '', want);
      else if (!want && /^#writing\//.test(location.hash)) history.replaceState(null, '', '#writing');
    };

    function row(a, s, i, flat, maxV, newest) {
      const n = s.numbered ? String(i + 1).padStart(2, '0') : esc(a.tag || '');
      const age = (Date.now() - new Date(`${a.date}T00:00:00`)) / 864e5;
      const flag = a === newest || age < FRESH_DAYS ? '<em class="art__flag is-new">new</em>'
        : !flat && s.numbered && i === 0 && s.items.length > 2 ? '<em class="art__flag">start here</em>' : '';
      const w = maxV && a.views ? Math.max(0.04, a.views / maxV) : 0;
      return `<a class="art" href="${esc(a.url)}" target="_blank" rel="noopener"${a.note ? ` title="${esc(a.note)}"` : ''}>
        <span class="art__n">${n}</span>
        <span class="art__t">${esc(a.title)}${flag}</span>
        ${flat ? `<span class="art__s">${esc(s.series)}</span>` : ''}
        <span class="art__d">${esc(day(a.date))}</span>
        <span class="art__v" aria-label="${a.views ? a.views.toLocaleString('en-US') + ' views' : 'views not counted yet'}"><i style="--w:${w.toFixed(3)}"></i><b>${a.views ? compact(a.views) : ''}</b></span>
        <span class="art__go" aria-hidden="true">↗</span>
      </a>`;
    }

    function draw() {
      const all = data.flatMap(s => s.items.map((a, i) => ({ a, s, i })));
      const maxV = Math.max(0, ...all.map(x => x.a.views || 0));
      const newest = all.reduce((b, x) => (!b || `${x.a.date}|${x.a.added || ''}` > `${b.a.date}|${b.a.added || ''}` ? x : b), null)?.a;
      const inSeries = x => st.series === 'all' || slug(x.s.series) === st.series;
      const q = st.q.toLowerCase();
      const hit = x => !q || `${x.a.title} ${x.s.series} ${x.a.tag || ''} ${x.a.note || ''}`.toLowerCase().includes(q);

      if (chipsBox) {
        chipsBox.innerHTML =
          data.map(s => `<button type="button" data-ls="${slug(s.series)}" aria-pressed="${st.series === slug(s.series)}">${esc(s.series)} <i>${s.items.length}</i></button>`).join('');
      }

      if (st.sort === 'order' && !q) {
        host.innerHTML = data.map((s, idx) => ({ s, idx })).filter(({ s }) => st.series === 'all' || slug(s.series) === st.series).map(({ s, idx }) => {
          const key = slug(s.series), open = st.open.has(key) || s.items.length <= FOLD_ABOVE;
          const list = open ? s.items : s.items.slice(0, SHOW);
          const v = views(s.items);
          return `<section class="shelf" aria-label="${esc(s.series)}">
            <h4 class="shelf__h" data-num="${'一二三四五六七八九十'[idx] || idx + 1}"><span class="series__title">${esc(s.series)}</span><span class="series__meta">${s.numbered ? `${s.items.length} part${s.items.length === 1 ? '' : 's'}` : `${s.items.length} pieces`}${v ? ` · ${compact(v)} views` : ''}</span></h4>
            ${list.map((a, i) => row(a, s, i, false, maxV, newest)).join('')}
            ${!open ? `<button class="shelf__more" type="button" data-lib-open="${key}">Show all ${s.items.length} <span aria-hidden="true">↓</span></button>` : ''}
          </section>`;
        }).join('');
      } else {
        let list = all.filter(x => inSeries(x) && hit(x));
        if (st.sort === 'new') list.sort((x, y) => `${y.a.date}|${y.a.added || ''}`.localeCompare(`${x.a.date}|${x.a.added || ''}`));
        else if (st.sort === 'top') list.sort((x, y) => (y.a.views || 0) - (x.a.views || 0));
        host.innerHTML = list.length
          ? `<div class="shelf is-flat">${list.map(x => row(x.a, x.s, x.i, true, maxV, newest)).join('')}</div>`
          : `<p class="lib__empty">Nothing matches “${esc(st.q)}”. Try a shorter word, or <button type="button" data-lib-clear>clear the search</button>.</p>`;
      }
    }

    if (chipsBox) chipsBox.addEventListener('click', e => {
      const b = e.target.closest('[data-ls]');
      if (!b) return;
      st.series = b.dataset.ls;
      setHash(); draw();
    });
    host.addEventListener('click', e => {
      const more = e.target.closest('[data-lib-open]');
      if (more) { st.open.add(more.dataset.libOpen); draw(); return; }
      if (e.target.closest('[data-lib-clear]')) { st.q = ''; if (qBox) qBox.value = ''; draw(); qBox && qBox.focus(); }
    });
    if (qBox) qBox.addEventListener('input', () => { st.q = qBox.value.trim(); draw(); });
    if (sortBox) sortBox.addEventListener('change', () => { st.sort = sortBox.value; draw(); });
    const applyHash = () => {
      const h = fromHash();
      if (!h) return;
      st.series = h;
      draw();
      const el = document.getElementById('writing');
      if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    };
    window.addEventListener('hashchange', applyHash);

    function render() {
      data = merged();
      window.ARTICLES_MERGED = data;
      const total = data.reduce((n, s) => n + s.items.length, 0);
      const totalViews = data.reduce((n, s) => n + views(s.items), 0);
      // open on the series that holds the newest piece, unless the URL asks for one
      if (!st.series || (st.series !== 'all' && !data.some(s => slug(s.series) === st.series))) {
        const newest = data.flatMap(s => s.items.map(a => ({ a, s }))).reduce((b, x) => (!b || `${x.a.date}|${x.a.added || ''}` > `${b.a.date}|${b.a.added || ''}` ? x : b), null);
        st.series = newest ? slug(newest.s.series) : (data[0] ? slug(data[0].series) : 'all');
      }
      draw();

      // the newest piece gets its own row, with the note written for it (if any)
      if (latestBox) {
        let best = null;
        data.forEach(s => s.items.forEach((a, i) => {
          const key = `${a.date || ''}|${a.added || ''}`;
          if (!best || key > best.key) best = { a, s, i, key };
        }));
        if (best) {
          const { a, s, i } = best;
          const where = s.numbered ? `${s.series}, part ${i + 1}` : `${s.series}${a.tag ? ` · ${a.tag}` : ''}`;
          latestBox.innerHTML = `
            <a class="latest__row" href="${esc(a.url)}" target="_blank" rel="noopener">
              <span class="latest__k"><b>Latest</b><i aria-hidden="true"></i>${esc(day(a.date))}</span>
              <span class="latest__main">
                <span class="latest__t">${esc(a.title)}</span>
                ${a.note ? `<span class="latest__note">${esc(a.note)}</span>` : ''}
              </span>
              <span class="latest__where">${esc(where)}</span>
              <span class="latest__go" aria-hidden="true">↗</span>
            </a>`;
          latestBox.hidden = false;
        }
      }

      $$('[data-article-count]').forEach(el => { el.textContent = total; });
      if (totalViews) $$('[data-article-views]').forEach(el => { el.textContent = compact(totalViews); });
      $$('[data-series-views]').forEach(el => {
        const s = data.find(x => x.series === el.dataset.seriesViews);
        if (s && views(s.items)) el.textContent = compact(views(s.items));
      });
      document.dispatchEvent(new CustomEvent('writing:render'));
    }

    window.WRITING = {
      set(items) { extra = Array.isArray(items) ? items : []; render(); },
      extra: () => extra,
      series: () => merged().map(s => ({ name: s.series, numbered: !!s.numbered })),
      // used by ⌘K: show one series and bring the library into view
      show(series) { st.series = series ? slug(series) : 'all'; st.q = ''; if (qBox) qBox.value = ''; setHash(); draw(); },
      slug,
    };
    const first = fromHash();
    if (first) st.series = first;
    render();
    if (first) requestAnimationFrame(() => document.getElementById('writing')?.scrollIntoView());
    fetch('/api/articles', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (d && Array.isArray(d.items) && d.items.length) window.WRITING.set(d.items); })
      .catch(() => { /* no function locally, or storage down: the static list stands */ });
  })();

  /* ---------------- quote strip, from assets/data/quotes.js ---------------- */
  (function quotes() {
    const box = $('[data-quote]'), bank = window.QUOTES;
    if (!box || !Array.isArray(bank) || !bank.length) return;
    const text = $('[data-quote-text]', box), by = $('[data-quote-by]', box);
    const KEY = 'quote:last';
    let cur = -1;
    try { cur = parseInt(sessionStorage.getItem(KEY) ?? '-1', 10); } catch (_) {}
    const pickNext = () => {
      if (bank.length === 1) return 0;
      let i; do { i = Math.floor(Math.random() * bank.length); } while (i === cur);
      return i;
    };
    const render = i => {
      const q = bank[i];
      text.textContent = q.text;
      by.innerHTML = [q.by ? esc(q.by) : '', q.mine ? '<span class="mine">a favourite</span>' : ''].filter(Boolean).join(' · ') || '&nbsp;';
      box.title = q.source || '';
      cur = i;
      try { sessionStorage.setItem(KEY, String(i)); } catch (_) {}
    };
    render(pickNext()); // new quote on every visit, never the same twice in a row
    $('[data-quote-next]', box).addEventListener('click', () => {
      if (reduce) { render(pickNext()); return; }
      box.classList.add('is-swapping');
      setTimeout(() => { render(pickNext()); box.classList.remove('is-swapping'); }, 300);
    });
  })();

  /* ---------------- spotify: now playing / last played ---------------- */
  // Data comes from the Netlify Function in netlify/functions/now-playing.mjs.
  // If it isn't configured (or runs locally without Netlify), the block stays hidden.
  (function spotify() {
    const box = $('#spotify');
    if (!box) return;
    const ago = iso => {
      const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 90) return 'just now';
      const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
      const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
      const d = Math.round(h / 24); return `${d} day${d === 1 ? '' : 's'} ago`;
    };
    let timer = 0;
    const load = () => fetch('/api/now-playing', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(t => {
        if (!t || !t.title) throw new Error('empty');
        $('[data-spin-heading]', box).textContent = t.playing ? 'Now playing' : 'Last played';
        $('[data-spin-title]', box).textContent = t.title;
        $('[data-spin-artist]', box).textContent = t.artist;
        const art = $('[data-spin-art]', box);
        if (t.art) { art.src = t.art; art.alt = t.album ? `${t.album} cover` : ''; }
        const link = box.matches('[data-spin-link]') ? box : $('[data-spin-link]', box); // in "Right now" the whole cell is the link
        if (t.url && /^https:\/\/open\.spotify\.com\//.test(t.url)) link.href = t.url;
        $('[data-spin-status]', box).innerHTML = t.playing
          ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>listening now'
          : esc(t.playedAt ? ago(t.playedAt) : 'paused');
        box.classList.toggle('is-live', !!t.playing);
        if (window.FIELD) window.FIELD.tempo(t.playing ? 2.2 : 1); // the hero gets a heartbeat while I'm listening
        box.hidden = false;
        box.classList.add('is-in');
        // refresh while the tab is open: every 30s when playing, 2 min otherwise
        clearTimeout(timer);
        timer = setTimeout(() => { if (!document.hidden) load(); }, t.playing ? 30000 : 120000);
      })
      .catch(() => { /* not configured or Spotify down: keep it hidden */ });
    load();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !box.hidden) load(); });
  })();

  /* ---------------- signature, written when it scrolls into view ---------------- */
  (function signature() {
    const sig = $('#signature');
    if (!sig) return;
    const sign = () => sig.classList.add('is-signed');
    if (reduce) { sign(); return; }
    const start = () => new IntersectionObserver(([en], obs) => {
      if (en.isIntersecting) { obs.disconnect(); setTimeout(sign, 150); }
    }, { threshold: 0.6 }).observe(sig);
    // wait for the script font, otherwise the first strokes are drawn in a fallback face
    (document.fonts && document.fonts.load ? document.fonts.load("66px 'Mrs Saint Delafield'") : Promise.resolve()).then(start, start);
  })();

  /* ---------------- visitor counter (netlify/functions/visits.mjs) ---------------- */
  (function visits() {
    const box = $('[data-visits]');
    if (!box) return;
    const KEY = 'visit:last', WINDOW = 12 * 3600 * 1000;
    let count = true;
    try {
      const last = +localStorage.getItem(KEY) || 0;
      count = Date.now() - last > WINDOW;
      if (count) localStorage.setItem(KEY, String(Date.now()));
    } catch (_) { /* storage blocked: still show the total, just don't count */ count = false; }
    if (navigator.webdriver) count = false; // bots and test runners don't count
    fetch('/api/visits', { method: count ? 'POST' : 'GET', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => {
        if (!d || !(d.visits > 0)) return;
        $('[data-visits-n]', box).textContent = d.visits.toLocaleString('en-US');
        $('[data-visits-word]', box).textContent = d.visits === 1 ? 'visitor' : 'visitors';
        box.hidden = false;
      })
      .catch(() => { /* counter unavailable: stay hidden */ });
  })();

  /* ---------------- your time vs mine ---------------- */
  (function tz() {
    const IST = 330; // minutes east of UTC (Asia/Kolkata)
    const mine = -new Date().getTimezoneOffset();
    const diff = IST - mine;
    const fmt = m => { const h = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60; return `${h ? h + 'h' : ''}${h && r ? ' ' : ''}${r ? r + 'm' : ''}`; };
    // Visitors already on IST (including me) just see the clock; everyone else gets the gap.
    if (diff === 0) {
      $$('[data-tzdiff], [data-tzdiff-long]').forEach(el => { el.textContent = ''; el.hidden = true; });
      return;
    }
    const short = `${fmt(diff)} ${diff > 0 ? 'ahead of' : 'behind'} you`;
    $$('[data-tzdiff]').forEach(el => { el.textContent = short; });
    $$('[data-tzdiff-long]').forEach(el => { el.textContent = `, ${short}`; });
  })();

  /* ---------------- tokenizer hover ---------------- */
  $$('.tok[data-tokens]').forEach(el => {
    const tokens = el.dataset.tokens.split('|');
    const plain = el.textContent;
    const split = () => {
      if (el.classList.contains('is-split')) return;
      el.innerHTML = tokens.map(t => `<span class="t">${esc(t)}</span>`).join('') +
        `<span class="tok__tip" aria-hidden="true"><b>${tokens.length}</b> tokens · ${plain.length} chars</span>`;
      el.classList.add('is-split');
    };
    const join = () => { el.classList.remove('is-split'); el.textContent = plain; };
    el.setAttribute('aria-label', plain);
    el.addEventListener('pointerenter', split);
    el.addEventListener('pointerleave', join);
    el.addEventListener('focus', split);
    el.addEventListener('blur', join);
  });

  /* ---------------- contribution calendar ---------------- */
  (function contrib() {
    const box = $('#contrib'), svg = $('#contrib-svg');
    if (!box || !svg) return;
    const draw = data => {
      const days = data.contributions;
      if (!days || !days.length) return;
      const C = 11, G = 3, top = 16, left = 26;
      const first = new Date(days[0].date + 'T00:00:00');
      const pad = first.getDay(); // Sunday-first columns, like GitHub
      const weeks = Math.ceil((days.length + pad) / 7);
      const W = left + weeks * (C + G), H = top + 7 * (C + G);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      let out = '', lastMonth = -1;
      days.forEach((d, i) => {
        const idx = i + pad, col = Math.floor(idx / 7), row = idx % 7;
        const x = left + col * (C + G), y = top + row * (C + G);
        const date = new Date(d.date + 'T00:00:00');
        if (row === 0 || i === 0) {
          const m = date.getMonth();
          if (m !== lastMonth && date.getDate() <= 7) { out += `<text x="${x}" y="10">${date.toLocaleString('en-US', { month: 'short' })}</text>`; lastMonth = m; }
        }
        out += `<rect x="${x}" y="${y}" width="${C}" height="${C}" data-l="${d.level}"><title>${d.count} on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</title></rect>`;
      });
      ['Mon', 'Wed', 'Fri'].forEach((n, k) => { out += `<text x="0" y="${top + (1 + k * 2) * (C + G) + 9}">${n}</text>`; });
      svg.innerHTML = out;
      $('[data-contrib-total]').textContent = (data.total.lastYear ?? 0).toLocaleString('en-US');
      box.hidden = false;
    };
    const KEY = 'gh:contrib';
    try {
      const hit = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (hit && Date.now() - hit.t < 6 * 3600 * 1000) { draw(hit.d); return; }
    } catch (_) { /* storage unavailable */ }
    fetch('https://github-contributions-api.jogruber.de/v4/TryingtobeingNikhil?y=last')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { draw(d); try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d })); } catch (_) {} })
      .catch(() => { /* leave the block hidden */ });
  })();

  /* ---------------- lab: temperature ---------------- */
  (function temperature() {
    const root = $('#toy-temp');
    if (!root) return;
    const cands = [['keys and values', 3.1], ['attention', 2.2], ['past tokens', 1.9], ['activations', 1.2], ['weights', 0.7], ['gradients', 0.3]];
    const bars = $('[data-bars]', root), slider = $('[data-t]', root), tv = $('[data-tv]', root), pick = $('[data-pick]', root);
    bars.innerHTML = cands.map(([w]) => `<div class="bar"><span>${w}</span><div class="bar__track"><div class="bar__fill"></div></div><b>0%</b></div>`).join('');
    const rows = $$('.bar', bars);
    let probs = [];
    const update = () => {
      const T = parseFloat(slider.value);
      tv.textContent = T.toFixed(2);
      const ex = cands.map(([, l]) => Math.exp(l / T));
      const sum = ex.reduce((a, b) => a + b, 0);
      probs = ex.map(e => e / sum);
      const max = Math.max(...probs);
      rows.forEach((r, i) => {
        $('.bar__fill', r).style.width = `${(probs[i] * 100).toFixed(1)}%`;
        $('b', r).textContent = `${Math.round(probs[i] * 100)}%`;
        r.classList.toggle('is-top', probs[i] === max);
      });
    };
    slider.addEventListener('input', update);
    $('[data-sample]', root).addEventListener('click', () => {
      let u = Math.random(), i = 0;
      while (i < probs.length - 1 && (u -= probs[i]) > 0) i++;
      pick.textContent = cands[i][0];
      rows.forEach((r, k) => r.classList.toggle('is-picked', k === i));
    });
    update();
  })();

  /* ---------------- lab: learning rate ---------------- */
  (function learningRate() {
    const root = $('#toy-lr');
    if (!root) return;
    const canvas = $('[data-canvas]', root), ctx = canvas.getContext('2d');
    const slider = $('[data-lr]', root), lrv = $('[data-lrv]', root), readout = $('[data-readout]', root);
    const A = 1, B = 12;                        // f(x, y) = ½(A x² + B y²)
    const f = (x, y) => 0.5 * (A * x * x + B * y * y);
    const start = [-3.6, 1.1];
    let w = 0, h = 0, path = [], timer = 0;
    const toPx = (x, y) => [w / 2 + x * (w / 9), h / 2 - y * (h / 3.4)];

    function size() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      // contours
      for (let k = 1; k <= 7; k++) {
        const c = 0.35 * k * k;
        const rx = Math.sqrt((2 * c) / A) * (w / 9), ry = Math.sqrt((2 * c) / B) * (h / 3.4);
        ctx.strokeStyle = `rgba(${FG}, ${0.12 - k * 0.012})`;
        ctx.beginPath(); ctx.ellipse(w / 2, h / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${ACC}, 0.9)`;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
      if (!path.length) return;
      ctx.strokeStyle = `rgba(${ACC}, 0.8)`; ctx.lineWidth = 1.4;
      ctx.beginPath();
      path.forEach(([x, y], i) => { const [px, py] = toPx(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
      path.forEach(([x, y], i) => {
        const [px, py] = toPx(x, y);
        ctx.fillStyle = i === path.length - 1 ? `rgb(${FG})` : `rgba(${ACC}, 0.7)`;
        ctx.beginPath(); ctx.arc(px, py, i === path.length - 1 ? 3.5 : 1.8, 0, Math.PI * 2); ctx.fill();
      });
    }
    function run() {
      clearInterval(timer);
      const lr = parseFloat(slider.value);
      path = [start.slice()];
      let step = 0;
      const tick = () => {
        const [x, y] = path[path.length - 1];
        const nx = x - lr * A * x, ny = y - lr * B * y;
        path.push([nx, ny]); step++;
        const loss = f(nx, ny);
        const diverged = !isFinite(loss) || Math.abs(ny) > 6;
        readout.textContent = diverged ? `step ${step} · diverged` : `step ${step} · loss ${loss.toFixed(3)}`;
        draw();
        if (diverged || step >= 40 || loss < 1e-3) clearInterval(timer);
      };
      if (reduce) { for (let i = 0; i < 40; i++) tick(); } else timer = setInterval(tick, 90);
    }
    slider.addEventListener('input', () => { lrv.textContent = parseFloat(slider.value).toFixed(3).replace(/0$/, ''); });
    $('[data-run]', root).addEventListener('click', run);
    window.addEventListener('resize', () => { size(); draw(); });
    new IntersectionObserver(([en], obs) => { if (en.isIntersecting) { size(); run(); obs.disconnect(); } }, { threshold: 0.4 }).observe(canvas);
    size(); draw();
  })();

  /* ---------------- lab: causal attention ---------------- */
  (function attention() {
    const root = $('#toy-attn');
    if (!root) return;
    const words = ['The', 'model', 'knows', 'when', 'it', "doesn't", 'know', 'enough'];
    // hand-set links that a trained head might plausibly learn; everything else decays with distance
    const links = { '4,1': 2.6, '6,2': 2.4, '5,4': 1.4, '7,6': 1.6, '2,1': 1.8, '3,2': 1.2, '7,2': 1.1 };
    const weights = q => {
      const s = words.map((_, k) => (k > q ? -Infinity : (links[`${q},${k}`] || 0) - 0.35 * (q - k) + (k === q ? 0.6 : 0)));
      const ex = s.map(v => (v === -Infinity ? 0 : Math.exp(v)));
      const z = ex.reduce((a, b) => a + b, 0);
      return ex.map(e => e / z);
    };
    const sent = $('[data-sent]', root), hint = $('[data-hint]', root);
    sent.innerHTML = words.map((wd, i) => `<span tabindex="0" data-i="${i}">${esc(wd)}</span>`).join('');
    const spans = $$('span', sent);
    const show = q => {
      const w = weights(q);
      const top = w.map((v, k) => [v, k]).filter(([, k]) => k !== q).sort((a, b) => b[0] - a[0])[0];
      spans.forEach((sp, k) => {
        sp.classList.toggle('is-q', k === q);
        sp.classList.toggle('is-masked', k > q);
        sp.style.background = k <= q ? `rgba(${ACC}, ${(w[k] * 0.85).toFixed(3)})` : '';
        sp.style.color = k <= q && w[k] > 0.35 ? '#03140a' : '';
      });
      hint.textContent = top ? `"${words[q]}" looks most at "${words[top[1]]}" (${Math.round(top[0] * 100)}%)` : `"${words[q]}" can only see itself`;
    };
    const clear = () => { spans.forEach(sp => { sp.className = ''; sp.style.background = ''; sp.style.color = ''; }); hint.textContent = 'hover a token'; };
    spans.forEach((sp, i) => {
      sp.addEventListener('pointerenter', () => show(i));
      sp.addEventListener('focus', () => show(i));
    });
    sent.addEventListener('pointerleave', clear);
    // demo once on reveal so it isn't a dead box
    new IntersectionObserver(([en], obs) => {
      if (!en.isIntersecting) return;
      obs.disconnect();
      if (reduce) { show(6); return; }
      let i = 0;
      const t = setInterval(() => { show(i++); if (i >= words.length) { clearInterval(t); setTimeout(() => show(6), 400); } }, 420);
    }, { threshold: 0.5 }).observe(sent);
  })();

  /* ---------------- ⌘K command palette ---------------- */
  (function palette() {
    const dlg = $('#cmdk');
    if (!dlg) return;
    const input = $('[data-cmdk-input]', dlg), list = $('[data-cmdk-list]', dlg);
    const email = ($('#copy-email') || {}).dataset?.email || '';
    const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').replace('↗', '').trim() : '');

    // Built from the page itself (on every open) so the palette never drifts from the content.
    let items = [];
    const add = (group, label, hint, run, keys = '') => items.push({ group, label, hint, run, hay: `${label} ${hint} ${keys}`.toLowerCase() });
    const go = hash => () => { const el = document.querySelector(hash); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
    const open = href => () => window.open(href, '_blank', 'noopener');

    const collect = () => {
      items = [];
      [['#about', 'About'], ['#experience', 'Experience'], ['#projects', 'Work'], ['#lab', 'Lab'], ['#writing', 'Writing'], ['#contact', 'Contact']]
        .forEach(([h, l]) => add('Sections', l, 'jump', go(h), l === 'Work' ? 'section projects' : 'section'));
      $$('.feature').forEach(f => { const a = $('.feature__links a', f); if (a) add('Projects', txt($('.feature__name', f)), 'GitHub', open(a.href), txt($('.feature__kicker', f))); });
      $$('.wx').forEach(li => add('Projects', txt($('.wx__name', li)), 'open', () => window.WORK && window.WORK.open(li), `${txt($('.wx__q', li))} ${li.dataset.cat}`));
      [['agents', 'Agents & RAG'], ['models', 'Models'], ['tools', 'Tools'], ['research', 'Research']]
        .forEach(([cat, label]) => add('Projects', `${label} projects`, 'filter', () => window.WORK && window.WORK.filter(cat, true), 'kind category filter'));
      (window.ARTICLES_MERGED || []).forEach(s => {
        add('Writing', `${s.series} series`, `${s.items.length} articles`, () => { window.WRITING.show(s.series); go('#writing')(); }, 'series articles read');
        s.items.forEach(a => add('Writing', a.title, s.series, open(a.url), 'article'));
      });
      $$('.social').forEach(a => add('Links', (a.getAttribute('aria-label') || '').split(':')[0], txt($('.social__h', a)), open(a.href)));
      if (email) add('Actions', 'Copy email', email, () => navigator.clipboard?.writeText(email), 'mail contact');
      add('Actions', 'Back to top', 'scroll', go('#top'), 'home');
      if (window.TERMINAL) add('Actions', 'Open terminal', 'press `', () => window.TERMINAL.open(), 'shell console command');
      if (window.PUBLISH && window.PUBLISH.isAdmin()) add('Actions', 'Add article', 'publish', () => window.PUBLISH.open(), 'new write post');
    };

    let shown = [], sel = 0, lastFocus = null;
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      shown = items.filter(it => terms.every(t => it.hay.includes(t)));
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      if (!shown.length) { list.innerHTML = `<li class="cmdk__empty">No match for "${esc(input.value)}"</li>`; return; }
      let html = '', g = '';
      shown.forEach((it, i) => {
        if (it.group !== g) { g = it.group; html += `<li class="cmdk__group" role="presentation">${g}</li>`; }
        html += `<li class="cmdk__item" role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === sel}"><span>${esc(it.label)}</span><small>${esc(it.hint)}</small></li>`;
      });
      list.innerHTML = html;
      input.setAttribute('aria-activedescendant', `cmdk-${sel}`);
      const cur = $(`#cmdk-${sel}`, list);
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const show = () => {
      lastFocus = document.activeElement;
      collect();
      dlg.hidden = false; input.value = ''; sel = 0; render();
      document.body.style.overflow = 'hidden';
      input.focus(); // synchronous, so keys typed right after ⌘K aren't lost
    };
    const hide = (restore = true) => {
      dlg.hidden = true; document.body.style.overflow = '';
      if (restore && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    const choose = i => { const it = shown[i]; if (!it) return; hide(false); it.run(); };

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); }
      else if (e.key === 'Tab') e.preventDefault(); // keep focus inside
    });
    list.addEventListener('pointermove', e => { const li = e.target.closest('.cmdk__item'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; render(); } });
    list.addEventListener('click', e => { const li = e.target.closest('.cmdk__item'); if (li) choose(+li.dataset.i); });
    $('[data-cmdk-close]', dlg).addEventListener('click', () => hide());
    $$('[data-cmdk]').forEach(b => b.addEventListener('click', () => {
      const menu = $('#mobile-menu'), nav = $('#nav');
      if (menu && !menu.hidden) { menu.hidden = true; nav.classList.remove('is-open'); $('.nav__toggle').setAttribute('aria-expanded', 'false'); }
      show();
    }));
    document.addEventListener('keydown', e => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dlg.hidden) show(); else hide(); }
      else if (e.key === '/' && dlg.hidden && !typing) { e.preventDefault(); show(); }
    });
    // Show Ctrl instead of ⌘ off Apple platforms
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      $$('kbd').forEach(k => { if (k.textContent === '⌘') k.textContent = 'Ctrl'; });
    }
  })();
})();
