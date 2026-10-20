/* "Ask this page": extractive QA over the page's own text for Raj Gahoi.
   BM25 ranks passages built from the DOM; if the best passage scores below a
   threshold, it refuses instead of guessing. No LLM, no network. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = $('#ask');
  if (!root) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const K1 = 1.2, B = 0.5, TOP = 3;
  const THRESHOLD = 3.0;

  const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its '
    + 'me my of on or our she so than that the their them then there these they this to was we were what when where which who whom why will '
    + 'with would you your about tell know raj gahoi him does doing much many any some also just').split(' '));

  // light query expansion for Raj Gahoi's systems portfolio
  const ALIASES = [
    [['work', 'worked', 'job', 'jobs', 'company', 'companies', 'employer', 'career', 'hire', 'contract'], ['valkey', 'expensify', 'upwork', 'contributions']],
    [['email', 'contact', 'mail', 'hire', 'hiring', 'reach', 'message'], ['email', 'upwork', 'contact']],
    [['valkey', 'redis', 'caching', 'sharding', 'slot', 'slots'], ['cluster', 'heatmap', 'valkey', 'crc16']],
    [['rust', 'glide', 'options', 'wire', 'parser', 'binary'], ['rust', 'glide', 'infosection', 'buffer']],
    [['expensify', 'mobile', 'react-native', 'frontend', 'bounty'], ['expensify', 'focus', 'carousel']],
    [['skills', 'stack', 'languages', 'tools', 'tech'], ['rust', 'typescript', 'c++', 'python', 'react', 'valkey']],
    [['location', 'city', 'based', 'timezone', 'ist'], ['gr. noida', 'greater noida', 'ncr', 'remote', 'ist']],
    [['leetcode', 'cp', 'dsa', 'competitive', 'ranking'], ['leetcode', 'algorithmic', 'dsa']],
    [['degree', 'college', 'education', 'university'], ['engineering', 'systems', 'computer']],
  ];

  const stem = w => w.length > 4 ? w.replace(/(ing|ers|er|ed|es|s)$/, '') : w;
  const tokens = text => (text.toLowerCase().match(/[a-z0-9+#.]+/g) || [])
    .map(w => w.replace(/\.+$/, ''))
    .filter(w => (w.length > 1 || w === 'x') && !STOP.has(w))
    .map(stem);

  function expand(q) {
    const raw = (q.toLowerCase().match(/[a-z0-9+#.]+/g) || []);
    const extra = [];
    ALIASES.forEach(([from, to]) => { if (raw.some(w => from.includes(w))) extra.push(...to); });
    return [...tokens(q), ...tokens(extra.join(' '))];
  }

  const SECTION = { top: 'Intro', about: 'About', experience: 'Experience', projects: 'Work', writing: 'Notes', lab: 'Lab', contact: 'Contact' };
  const clean = s => s.replace(/\s+/g, ' ').replace(/\s*↗\s*/g, ' ').trim();
  const txt = el => (el ? (el.innerText || el.textContent || '') : '');
  let index = null;

  function build() {
    const docs = [];
    const add = (el, text, title, boost = true) => {
      text = clean(text);
      if (!el || text.length < 20) return;
      const sec = el.closest('section[id]');
      docs.push({ el, text, title: title || '', boost, where: [SECTION[sec?.id] || '', title].filter(Boolean).join(' · ') });
    };
    const t = (el, sel) => clean(txt(sel ? el.querySelector(sel) : el));
    const end = x => (/[.!?]$/.test(x) ? x : x + '.');

    // Build docs from page sections
    add($('.hero__title'), txt($('.hero__title')), 'Hero Title');
    $$('#about p').forEach(p => add(p, txt(p), 'About'));
    $$('#experience .role, #experience article').forEach(r => add(r, txt(r), 'Experience'));
    $$('.feature').forEach(f => {
      const name = t(f, '.feature__name');
      add(f, `${name}: ${t(f, '.feature__tagline')} ${t(f, '.feature__text')}`, name);
    });
    $$('.wx').forEach(li => {
      add(li, `${t(li, '.wx__name')}: ${t(li, '.wx__q')} ${t(li, '.wx__stat')}`, t(li, '.wx__name'));
    });
    $$('.art').forEach(a => {
      add(a, `Technical note: ${t(a, '.art__t')} (${t(a, '.art__s')}, ${t(a, '.art__d')})`, 'Writing');
    });
    $$('.toy').forEach(ty => {
      add(ty, `Lab interactive sandbox: ${t(ty, 'h4')} - ${t(ty, 'p')}`, 'Lab');
    });
    add($('.contact__title'), `Contact Raj Gahoi directly via Upwork or email at gahoiraj01@gmail.com.`, 'Contact');
    add($('.mail'), `Hire Raj Gahoi on Upwork: https://www.upwork.com/freelancers/~014898525b9c53fc32 or via email gahoiraj01@gmail.com.`, 'Upwork & Email');

    const N = docs.length;
    const df = {};
    docs.forEach(d => {
      d.terms = {};
      const words = tokens(d.text);
      d.len = words.length;
      const seen = new Set();
      words.forEach(w => {
        d.terms[w] = (d.terms[w] || 0) + 1;
        if (!seen.has(w)) { df[w] = (df[w] || 0) + 1; seen.add(w); }
      });
    });

    const avgdl = docs.reduce((a, b) => a + b.len, 0) / (N || 1);
    const idf = {};
    Object.keys(df).forEach(w => {
      idf[w] = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5));
    });

    index = { docs, idf, avgdl };
  }

  function search(q) {
    if (!index) build();
    const { docs, idf, avgdl } = index;
    const qterms = expand(q);
    if (!qterms.length) return [];

    const scores = docs.map(d => {
      let score = 0;
      qterms.forEach(t => {
        const tf = d.terms[t] || 0;
        if (!tf) return;
        const w = idf[t] || 0.5;
        const num = tf * (K1 + 1);
        const den = tf + K1 * (1 - B + B * (d.len / avgdl));
        score += w * (num / den);
      });
      if (d.boost) score *= 1.25;
      return { d, s: score };
    });

    return scores.filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  }

  function extract(text, q) {
    const sents = text.match(/[^.!?]+[.!?]+/g) || [text];
    const qset = new Set(expand(q));
    let best = sents[0], bestScore = -1;
    sents.forEach(s => {
      const words = tokens(s);
      let hit = 0;
      words.forEach(w => { if (qset.has(w)) hit++; });
      const score = hit / Math.sqrt(words.length + 1);
      if (score > bestScore) { bestScore = score; best = s; }
    });
    return best ? best.trim() : text.slice(0, 200);
  }

  const form = $('form', root);
  const input = $('input', form);
  const out = $('.ask__out', root);
  const ans = $('.ask__answer', root);
  const src = $('.ask__src', root);
  const meterFill = $('.ask__track i', root);
  const meterText = $('.ask__meter p', root);
  const hitsEl = $('.ask__hits', root);
  let typing = 0;

  async function type(text) {
    const id = ++typing;
    ans.textContent = '';
    if (reduce) { ans.textContent = text; return; }
    const words = text.split(/(\s+)/);
    for (let i = 0; i < words.length; i++) {
      if (id !== typing) return;
      ans.textContent += words[i];
      if (words[i].trim()) await new Promise(r => setTimeout(r, 18));
    }
  }

  function jump(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('is-cited'); void el.offsetWidth; el.classList.add('is-cited');
    setTimeout(() => el.classList.remove('is-cited'), 2200);
  }

  function ask(q) {
    q = q.trim();
    if (!q) return;
    const hits = search(q);
    const top = hits.slice(0, TOP);
    const best = top.length ? top[0].s : 0;
    const confident = best >= THRESHOLD;
    out.hidden = false;
    root.classList.toggle('is-refusing', !confident);

    meterFill.style.width = `${Math.min(100, (best / (THRESHOLD * 2)) * 100).toFixed(1)}%`;
    meterText.innerHTML = `BM25 confidence: <b>${best.toFixed(2)}</b> ${confident ? '≥' : '<'} threshold <b>${THRESHOLD.toFixed(1)}</b> → ${confident ? 'Verified Answer' : 'Refusal (No Speculation)'}`;
    hitsEl.innerHTML = top.length
      ? top.map((h, i) => `<li><button type="button" data-hit="${i}"><span class="ask__score">${h.s.toFixed(2)}</span><span class="ask__where">${esc(h.d.where || 'Page')}</span><span class="ask__snip">${esc(h.d.text.slice(0, 90))}${h.d.text.length > 90 ? '…' : ''}</span></button></li>`).join('')
      : '<li class="ask__none" style="padding:6px;font-size:12px;color:var(--fg-4);">No matching passage on this page shares relevant terms with that query.</li>';
    $$('[data-hit]', hitsEl).forEach(b => b.addEventListener('click', () => jump(top[+b.dataset.hit].d.el)));

    if (confident) {
      const doc = top[0].d;
      type(extract(doc.text, q));
      src.innerHTML = `Retrieved from <button type="button" class="ask__jump" style="cursor:pointer;background:none;border:none;text-decoration:underline;">${esc(doc.where || 'this page')} ↗</button>`;
      $('.ask__jump', src).addEventListener('click', () => jump(doc.el));
    } else {
      type("I don't have enough deterministic context on this page to answer that without guessing.");
      src.innerHTML = 'Retrieval score below confidence bar. Try querying about Valkey, cluster routing, Rust wire options, or Upwork.';
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  $$('[data-ask-q]', root).forEach(b => b.addEventListener('click', () => { input.value = b.dataset.askQ; ask(b.dataset.askQ); }));
})();
