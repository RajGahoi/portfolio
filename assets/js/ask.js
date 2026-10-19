/* "Ask this page": extractive QA over the page's own text.
   BM25 ranks passages built from the DOM; if the best passage scores below a
   threshold, it refuses instead of guessing. No LLM, no network.
   The same rule HiveMind uses: the math decides when to stop, not the model. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = $('#ask');
  if (!root) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const K1 = 1.2, B = 0.5, TOP = 3; // B below the usual 0.75 so full descriptions can beat one-line mentions; TOP = passages shown
  const THRESHOLD = 3.0; // BM25 score the best passage needs before it answers (tuned on real questions)

  const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its '
    + 'me my of on or our she so than that the their them then there these they this to was we were what when where which who whom why will '
    + 'with would you your about tell know nikhil mourya him does doing much many any some also just').split(' '));

  // light query expansion so plain questions reach the right words on the page
  const ALIASES = [
    [['work', 'worked', 'job', 'jobs', 'company', 'companies', 'employer', 'intern', 'internship', 'career'], ['experience', 'hirebuddy']],
    [['email', 'contact', 'mail', 'hire', 'hiring', 'dm', 'message'], ['email', 'contact', 'roles']],
    [['college', 'university', 'study', 'studies', 'degree', 'student', 'school', 'education'], ['bit', 'mesra', 'college']],
    [['live', 'lives', 'location', 'based', 'city', 'from'], ['jaipur', 'location', 'based']],
    [['vllm', 'serving', 'serve', 'llm'], ['pageserve', 'inference', 'serving']],
    [['rl', 'reinforcement'], ['rlforge', 'reinforcement']],
    [['writing', 'write', 'articles', 'article', 'blog', 'posts', 'post'], ['articles', 'writing', 'series']],
    [['reach', 'audience', 'impressions', 'views', 'twitter', 'x'], ['impressions', 'views', 'reach']],
    [['music', 'song', 'songs', 'listening', 'spotify'], ['spotify', 'played', 'playing']],
    [['codeforces', 'cp', 'rating', 'competitive'], ['codeforces', 'specialist']],
    [['startup', 'product', 'founder', 'founded'], ['devpath', 'founder', 'product']],
    [['skills', 'stack', 'tools', 'languages', 'tech'], ['python', 'pytorch', 'languages', 'infra']],
    [['available', 'open', 'looking', 'roles'], ['open', 'roles']],
    [['ttft', 'latency', 'fast', 'faster', 'speed', 'speedup', 'improve', 'improved', 'improvement'], ['ttft', 'latency']],
  ];

  const stem = w => w.length > 4 ? w.replace(/(ing|ers|er|ed|es|s)$/, '') : w;
  const tokens = text => (text.toLowerCase().match(/[a-z0-9+#.]+/g) || [])
    .map(w => w.replace(/\.+$/, ''))
    .filter(w => (w.length > 1 || w === 'x') && !STOP.has(w)) // "what's" must not leave a stray "s"
    .map(stem);
  function expand(q) {
    const raw = (q.toLowerCase().match(/[a-z0-9+#.]+/g) || []);
    const extra = [];
    ALIASES.forEach(([from, to]) => { if (raw.some(w => from.includes(w))) extra.push(...to); });
    return [...tokens(q), ...tokens(extra.join(' '))];
  }

  /* ---------- corpus: passages taken from the live page ---------- */
  const SECTION = { top: 'Intro', about: 'About', experience: 'Experience', projects: 'Work', lab: 'Lab', writing: 'Writing', contact: 'Contact' };
  const clean = s => s.replace(/\s+/g, ' ').replace(/\s*↗\s*/g, ' ').trim();
  const txt = el => (el ? (el.innerText || el.textContent || '') : '');
  let index = null;
  document.addEventListener('writing:render', () => { index = null; }); // newly added articles join the corpus
  function build() {
    const docs = [];
    const add = (el, text, title, boost = true) => {
      text = clean(text);
      if (!el || text.length < 20) return;
      const sec = el.closest('section[id]');
      docs.push({ el, text, title: title || '', boost, where: [SECTION[sec?.id] || '', title].filter(Boolean).join(' · ') });
    };
    const t = (el, sel) => clean(txt(sel ? el.querySelector(sel) : el));
    const list = (el, sel) => [...el.querySelectorAll(sel)].map(x => clean(txt(x))).filter(Boolean).join(', ');
    const end = x => (/[.!?]$/.test(x) ? x : x + '.');

    // one clean, self-contained passage per thing on the page, so answers read as sentences
    add($('.hero__lede'), txt($('.hero__lede')), 'Intro');
    add($('#about .shead__title'), end(txt($('#about .shead__title'))), '');
    $$('#about .about__text > p').forEach(p => add(p, txt(p), ''));
    $$('#about .info dl div').forEach(d => add(d, `${t(d, 'dt')}: ${t(d, 'dd')}.`, 'nikhil --info'));
    $$('.stack__row').forEach(r => add(r, `Skills, ${t(r, '.stack__k')}: ${list(r, 'li')}.`, 'Stack'));
    $$('.highlights .hl').forEach(h => add(h, `${end(t(h, '.hl__text'))} (${t(h, 'em')})`, 'Highlights'));
    $$('#experience .role').forEach(r => {
      const name = t(r, 'h3');
      const body = [t(r, '.role__text'), ...[...r.querySelectorAll('.role__points li')].map(li => clean(txt(li)))].filter(Boolean).map(end).join(' ');
      const nums = [...r.querySelectorAll('.role__nums div')].map(d => `${t(d, 'b')} ${t(d, 'span')}`).join(', ');
      add(r, `${name}, ${t(r, '.role__title')} (${t(r, '.role__when')}). ${body}${nums ? ` Results: ${nums}.` : ''}`, name);
    });
    $$('.feature').forEach(f => {
      const name = t(f, '.feature__name');
      const metrics = [...f.querySelectorAll('.metrics div')].map(d => `${t(d, 'dd')} ${t(d, 'dt')}`).join('; ');
      add(f, `${name} (${t(f, '.feature__kicker')}): ${[t(f, '.feature__tagline'), t(f, '.feature__text'), t(f, '.feature__credit')].filter(Boolean).map(end).join(' ')} Demo: ${t(f, '.viz__label')}.`, name);
      add(f.querySelector('.metrics'), `${name} results: ${metrics}.`, name, false);
    });
    $$('.wx').forEach(li => {
      const name = t(li, '.wx__name'), stack = t(li, '.wx__stack');
      add(li, `${name} (${t(li, '.wx__cat')}): ${end(t(li, '.wx__q'))} ${end(t(li, '.wx__text'))}${stack ? ` Stack: ${stack}.` : ''} ${t(li, '.wx__stat')}.`, name);
    });
    const stats = $('.writing__stats');
    if (stats) add(stats, `Writing and reach on X: ${[...stats.querySelectorAll('span')].map(x => clean(txt(x))).join(', ')}.`, 'Writing');
    const lib = $('#writing .lib') || $('#writing');
    (window.ARTICLES_MERGED || []).forEach(sr => add(lib, `${sr.series} article series (${sr.items.length} ${sr.numbered ? 'parts' : 'pieces'}): ${sr.items.map(a => a.title).join(', ')}.`, sr.series, false));
    $$('#spec, .toy').forEach(x => add(x, `Lab demo, ${t(x, 'h4')}: ${t(x, 'p')}`, 'Lab'));
    if (!$('#spotify')?.hidden) add($('#spotify'), `Music on Spotify: ${t($('#spotify'), '[data-spin-heading]')}, ${t($('#spotify'), '[data-spin-title]')} by ${t($('#spotify'), '[data-spin-artist]')}.`, 'Spotify');
    add($('.contact__lede'), txt($('.contact__lede')), '');
    const mail = $('#copy-email')?.dataset.email;
    if (mail) add($('.mail'), `Email: ${mail}. Email is fastest; DMs on X work too.`, 'Email');
    const socials = $$('.social');
    if (socials.length) add(socials[0].parentElement, 'Contact links: ' + socials.map(x => `${(x.getAttribute('aria-label') || '').split(':')[0]} ${clean(txt(x.querySelector('.social__h')))}`).join(', ') + '.', 'Links');

    // a passage's title counts extra, so "What is PageServe?" lands on PageServe itself, not a passing mention
    docs.forEach(d => { d.terms = tokens(d.boost ? `${d.text} ${d.title} ${d.title} ${d.title}` : d.text); d.len = d.terms.length; d.tf = new Map(); d.terms.forEach(t => d.tf.set(t, (d.tf.get(t) || 0) + 1)); });
    const N = docs.length, avg = docs.reduce((n, d) => n + d.len, 0) / N;
    const df = new Map();
    docs.forEach(d => new Set(d.terms).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const idf = t => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
    index = { docs, avg, idf };
  }

  function search(q) {
    if (!index) build();
    const qs = [...new Set(expand(q))];
    const { docs, avg, idf } = index;
    return docs.map(d => {
      let s = 0;
      qs.forEach(t => { const f = d.tf.get(t) || 0; if (f) s += idf(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / avg)); });
      return { d, s };
    }).filter(h => h.s > 0).sort((a, b) => b.s - a.s);
  }

  // the most relevant sentence(s) of the best passage
  function extract(text, q) {
    if (text.length <= 240) return text;
    const qs = new Set(expand(q));
    const sents = text.match(/[^.!?]+[.!?]*/g) || [text];
    let best = 0, bestScore = -1;
    sents.forEach((s, i) => { const sc = tokens(s).filter(t => qs.has(t)).length - (/^\s*Demo:/.test(s) ? 10 : 0); if (sc > bestScore) { bestScore = sc; best = i; } });
    return clean(sents.slice(best, best + 2).join(' '));
  }

  /* ---------- UI ---------- */
  const form = $('[data-ask-form]', root), input = $('[data-ask-input]', root), out = $('[data-ask-out]', root);
  const ans = $('[data-ask-answer]', root), src = $('[data-ask-src]', root), hitsEl = $('[data-ask-hits]', root);
  const meterFill = $('[data-ask-fill]', root), meterText = $('[data-ask-verdict]', root);
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
    // open whatever the citation is folded inside: a Work row, or the longer git log
    if (el.matches('.wx') && window.WORK) window.WORK.open(el);
    const more = el.closest('[data-gitlog]');
    if (more && el.closest('[data-more]')) more.classList.add('is-all');
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
    meterText.innerHTML = `best passage BM25 <b>${best.toFixed(2)}</b> ${confident ? '≥' : '<'} threshold <b>${THRESHOLD.toFixed(1)}</b> → ${confident ? 'answer' : 'refuse'}`;
    hitsEl.innerHTML = top.length
      ? top.map((h, i) => `<li><button type="button" data-hit="${i}"><span class="ask__score">${h.s.toFixed(2)}</span><span class="ask__where">${esc(h.d.where || 'Page')}</span><span class="ask__snip">${esc(h.d.text.slice(0, 90))}${h.d.text.length > 90 ? '…' : ''}</span></button></li>`).join('')
      : '<li class="ask__none">No passage on this page shares a single meaningful word with that question.</li>';
    $$('[data-hit]', hitsEl).forEach(b => b.addEventListener('click', () => jump(top[+b.dataset.hit].d.el)));

    if (confident) {
      const doc = top[0].d;
      type(extract(doc.text, q));
      src.innerHTML = `from <button type="button" class="ask__jump">${esc(doc.where || 'this page')} ↗</button>`;
      $('.ask__jump', src).addEventListener('click', () => jump(doc.el));
    } else {
      type("I don't know enough to answer that from this page, so I won't guess.");
      src.innerHTML = 'The retrieval score is below the threshold. Try asking about projects, work, writing or how to reach him.';
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  $$('[data-ask-q]', root).forEach(b => b.addEventListener('click', () => { input.value = b.dataset.askQ; ask(b.dataset.askQ); }));
})();
