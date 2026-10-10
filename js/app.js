// Culture du jour — un quiz de culture générale par jour.
// Tout est stocké en local (localStorage) sous une forme compacte :
// pour chaque jour, l'id du thème et l'indice des réponses choisies.
// Les fiches sont reconstruites à partir des fichiers de thèmes, rien n'est dupliqué.

const START = '2026-10-10'; // jour 0 de la rotation des thèmes
const KEY = 'cultureg:v1';
const REVIEW_SIZE = 10;

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
const tabbar = document.getElementById('tabbar');

/* ---------------------------------------------------------------- utils */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyParts = (k) => { const [y, m, d] = k.split('-').map(Number); return [y, m - 1, d]; };
const keyToDate = (k) => new Date(...keyParts(k));
const daysBetween = (a, b) => Math.round((Date.UTC(...keyParts(b)) - Date.UTC(...keyParts(a))) / 864e5);
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtTiny = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const LETTERS = 'ABCD';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const ICONS = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
};

// Générateur pseudo-aléatoire déterministe : l'ordre des réponses reste
// identique si on ferme et rouvre l'app au milieu d'un quiz.
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const choiceOrder = (seed, n) => shuffled([...Array(n).keys()], seeded(seed));

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------------------------------------------------------------- store */

// { days: { "2026-10-10": { t: "napoleon", n: 10, a: [0, 2, 0, ...] } }, mastered: { "napoleon:3": "2026-10-12" } }
// a[i] = indice (dans le fichier) du choix fait à la question i ; 0 = bonne réponse.
const store = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* stockage indisponible */ }
  s = s && typeof s === 'object' ? s : {};
  s.days ||= {};
  s.mastered ||= {};
  return s;
})();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { toast('Impossible d’enregistrer (stockage plein ?)'); }
}

const isDone = (rec) => rec && rec.a.length >= rec.n;
const scoreOf = (rec) => rec.a.filter((c) => c === 0).length;
const doneDays = () => Object.keys(store.days).filter((k) => isDone(store.days[k])).sort();

function streaks() {
  const set = new Set(doneDays());
  let cur = 0;
  let k = dayKey();
  if (!set.has(k)) k = addDays(k, -1);
  while (set.has(k)) { cur++; k = addDays(k, -1); }
  let best = 0, run = 0, prev = null;
  for (const d of [...set].sort()) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { cur, best };
}

// Toutes les questions ratées (dédoublonnées), de la plus récente à la plus ancienne.
function errorRefs() {
  const map = new Map();
  for (const d of Object.keys(store.days).sort()) {
    const rec = store.days[d];
    rec.a.forEach((c, i) => {
      if (c !== 0) map.set(`${rec.t}:${i}`, { ref: `${rec.t}:${i}`, t: rec.t, i, c, d });
    });
  }
  return [...map.values()].sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : 0));
}
const todoCount = () => errorRefs().filter((e) => !store.mastered[e.ref]).length;

/* ---------------------------------------------------------------- data */

let INDEX = [];
const themes = new Map();

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
function loadTheme(id) {
  if (!themes.has(id)) {
    themes.set(id, getJSON(`data/themes/${id}.json`).catch((e) => { themes.delete(id); throw e; }));
  }
  return themes.get(id);
}
const meta = (id) => INDEX.find((t) => t.id === id) || { id, titre: id, emoji: '❓', categorie: 'Divers' };

function themeIdFor(key) {
  if (store.days[key]) return store.days[key].t;
  const n = INDEX.length;
  return INDEX[((daysBetween(START, key) % n) + n) % n].id;
}

/* ---------------------------------------------------------------- router */

const timers = [];
let currentDay = dayKey();
let renderSeq = 0;

const routes = {
  '': viewHome,
  quiz: viewQuiz,
  jour: viewDay,
  fiches: viewFiches,
  revision: viewRevision,
  scores: viewScores,
};

async function render() {
  const seq = ++renderSeq;
  timers.splice(0).forEach(clearInterval);
  if (!sheet.hidden) hideSheet();
  const [, name = '', arg] = location.hash.split('/');
  const view = routes[name] || viewHome;
  const tab = name === 'fiches' || name === 'revision' ? 'fiches' : name === 'scores' || name === 'jour' ? 'scores' : 'home';
  tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.body.classList.toggle('immersive', name === 'quiz' || name === 'revision');
  try {
    await view(arg, () => seq === renderSeq);
  } catch (e) {
    console.error(e);
    if (seq !== renderSeq) return;
    app.innerHTML = `<div class="empty fade-in"><span class="big">📡</span><b>Contenu indisponible</b>
      Vérifie ta connexion : ce thème n'a pas encore été téléchargé.<br><br>
      <button class="btn small ghost" onclick="location.reload()">Réessayer</button></div>`;
  }
  window.scrollTo(0, 0);
}

const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

/* ---------------------------------------------------------------- home */

async function viewHome(_, alive) {
  const key = dayKey();
  const id = themeIdFor(key);
  const m = meta(id);
  const theme = await loadTheme(id);
  if (!alive()) return;
  const rec = store.days[key];
  const n = theme.questions.length;
  const { cur } = streaks();
  const done = doneDays();
  const avg = done.length ? Math.round((done.reduce((s, k) => s + scoreOf(store.days[k]) / store.days[k].n, 0) / done.length) * 100) : null;
  const todo = todoCount();

  let action;
  if (isDone(rec)) {
    action = `
      <div class="done-score"><b>${scoreOf(rec)}</b><span>/ ${rec.n}</span></div>
      <a class="btn block" href="#/jour/${key}">Voir le récap et les fiches</a>
      <p class="countdown" id="countdown"></p>`;
  } else if (rec && rec.a.length) {
    action = `<a class="btn accent block" href="#/quiz">Reprendre · question ${rec.a.length + 1}/${n}</a>`;
  } else {
    action = `<a class="btn accent block" href="#/quiz">Commencer le quiz</a>`;
  }

  app.innerHTML = `
    <div class="fade-in">
      <div class="home-top">
        <span class="date">${esc(cap(fmtLong.format(new Date())))}</span>
        <span class="chip ${cur ? 'accent' : ''} streak" title="Série de jours consécutifs">🔥 ${cur}</span>
      </div>

      <article class="card hero">
        <p class="eyebrow">Thème du jour</p>
        <span class="emoji" aria-hidden="true">${esc(theme.emoji || m.emoji)}</span>
        <h1 class="title">${esc(theme.titre)}</h1>
        <p class="accroche">${esc(theme.accroche || '')}</p>
        <div class="meta">
          <span class="chip">${esc(theme.categorie)}</span>
          <span class="chip">${n} questions</span>
        </div>
        ${action}
      </article>

      <div class="stat-row">
        <a class="stat" href="#/scores"><b>${cur}</b><span>jour${cur > 1 ? 's' : ''} de suite</span></a>
        <a class="stat" href="#/scores"><b>${avg === null ? '–' : avg + '%'}</b><span>de réussite</span></a>
        <a class="stat" href="#/fiches"><b>${todo}</b><span>fiche${todo > 1 ? 's' : ''} à revoir</span></a>
      </div>

      ${todo ? `
      <a class="card review-card" href="#/revision">
        <span class="ico" aria-hidden="true">🧠</span>
        <span class="txt"><b>Réviser mes erreurs</b><span>${Math.min(todo, REVIEW_SIZE)} questions ratées à retenter</span></span>
        ${ICONS.chev}
      </a>` : ''}
    </div>`;

  const cd = document.getElementById('countdown');
  if (cd) {
    const tick = () => {
      const now = new Date();
      const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const mins = Math.max(0, Math.ceil((mid - now) / 60000));
      cd.textContent = `Prochain thème dans ${Math.floor(mins / 60)} h ${pad(mins % 60)}`;
    };
    tick();
    timers.push(setInterval(tick, 30000));
  }
}

/* ---------------------------------------------------------------- quiz engine */

// items : [{ theme, i }] ; answers : tableau (muté) des choix faits.
function runQuiz({ items, answers, seedFor, label, onAnswer, onFinish, onQuit }) {
  const step = () => {
    const idx = answers.length;
    if (idx >= items.length) return onFinish();
    const { theme, i } = items[idx];
    const q = theme.questions[i];
    const perm = choiceOrder(seedFor(idx), q.choix.length);

    const segs = items.map((_, j) => {
      const cls = j < answers.length ? (answers[j] === 0 ? 'good' : 'bad') : j === idx ? 'cur' : '';
      return `<i class="${cls}"></i>`;
    }).join('');

    app.innerHTML = `
      <div class="fade-in">
        <div class="quiz-top">
          <button class="icon-btn" id="quit" aria-label="Quitter">${ICONS.close}</button>
          <div class="progress" id="progress">${segs}</div>
          <span class="counter">${idx + 1}/${items.length}</span>
        </div>
        <div class="quiz-theme"><span aria-hidden="true">${esc(theme.emoji)}</span> ${esc(label(theme))}</div>
        <h1 class="question">${esc(q.q)}</h1>
        <div class="options" id="options">
          ${perm.map((orig, k) => `
            <button class="option" data-orig="${orig}">
              <span class="letter">${LETTERS[k]}</span><span>${esc(q.choix[orig])}</span>
            </button>`).join('')}
        </div>
        <div id="feedback"></div>
      </div>`;

    document.getElementById('quit').onclick = onQuit;
    const opts = document.getElementById('options');
    opts.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.option');
      if (!btn || opts.classList.contains('locked')) return;
      const orig = Number(btn.dataset.orig);
      const ok = orig === 0;
      answers.push(orig);
      onAnswer(idx, orig);

      opts.classList.add('locked');
      opts.querySelector('[data-orig="0"]').classList.add('correct');
      if (!ok) { btn.classList.add('wrong'); navigator.vibrate?.(60); }
      document.querySelectorAll('#progress i')[idx].className = ok ? 'good' : 'bad';

      const last = answers.length >= items.length;
      const fb = document.getElementById('feedback');
      fb.innerHTML = `
        <div class="feedback">
          <div class="verdict ${ok ? 'good' : 'bad'}">
            <span class="dot">${ok ? '✓' : '✕'}</span>
            ${ok ? 'Bonne réponse !' : `Réponse : ${esc(q.choix[0])}`}
          </div>
          ${ok ? `
            <details class="more"><summary>En savoir plus ›</summary>
              <div class="card fiche-inline"><h3>${esc(q.fiche.titre)}</h3><p>${esc(q.fiche.texte)}</p></div>
            </details>` : `
            <div class="card fiche-inline"><h3>${esc(q.fiche.titre)}</h3><p>${esc(q.fiche.texte)}</p></div>`}
          <button class="btn block ${last ? 'accent' : ''}" id="next">${last ? 'Voir mon score' : 'Question suivante →'}</button>
        </div>`;
      document.getElementById('next').onclick = step;
      requestAnimationFrame(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    });
  };
  step();
}

async function viewQuiz(_, alive) {
  const key = dayKey();
  const id = themeIdFor(key);
  const theme = await loadTheme(id);
  if (!alive()) return;
  if (!store.days[key]) { store.days[key] = { t: id, n: theme.questions.length, a: [] }; save(); }
  const rec = store.days[key];
  if (isDone(rec)) return go(`#/jour/${key}`);

  runQuiz({
    items: theme.questions.map((_, i) => ({ theme, i })),
    answers: rec.a,
    seedFor: (idx) => `${key}:${id}:${idx}`,
    label: (t) => t.titre,
    onAnswer: (idx, orig) => {
      // Une question ratée lors d'un cycle précédent et réussie aujourd'hui est acquise.
      if (orig === 0 && errorRefs().some((e) => e.ref === `${id}:${idx}`)) store.mastered[`${id}:${idx}`] = key;
      save();
    },
    onFinish: () => go(`#/jour/${key}`),
    onQuit: () => go('#/'),
  });
}

/* ---------------------------------------------------------------- day recap */

function scoreMessage(s, n) {
  const r = s / n;
  if (r === 1) return ['Sans-faute ! 🏆', 'Champion du jour, rien à redire.'];
  if (r >= 0.8) return ['Excellent !', 'Tu maîtrises le sujet.'];
  if (r >= 0.6) return ['Bien joué', 'Quelques fiches à lire pour être imbattable.'];
  if (r >= 0.4) return ['Pas mal', 'Les fiches ci-dessous t’attendent.'];
  return ['Thème coriace', 'C’est comme ça qu’on apprend : jette un œil aux fiches.'];
}

function ringSVG(s, n) {
  const r = 66, c = 2 * Math.PI * r;
  return `
    <div class="ring">
      <svg viewBox="0 0 156 156"><circle class="track" cx="78" cy="78" r="${r}"/>
        <circle class="val" cx="78" cy="78" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - s / n)}"/></svg>
      <div class="num"><div><b>${s}</b><small>sur ${n}</small></div></div>
    </div>`;
}

function shareText(key, rec, theme) {
  const grid = rec.a.map((c) => (c === 0 ? '🟩' : '🟥')).join('');
  return `Culture du jour · ${fmtShort.format(keyToDate(key))}\n${theme.emoji} ${theme.titre}\n${grid} ${scoreOf(rec)}/${rec.n}`;
}

async function share(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Résultat copié 📋');
  } catch { /* partage annulé */ }
}

async function viewDay(key, alive) {
  const rec = store.days[key];
  if (!rec) return go('#/');
  const theme = await loadTheme(rec.t);
  if (!alive()) return;
  const done = isDone(rec);
  const s = scoreOf(rec);
  const [h, p] = scoreMessage(s, rec.n);
  const isToday = key === dayKey();

  app.innerHTML = `
    <div class="fade-in">
      <div class="quiz-top">
        <a class="icon-btn" href="${isToday ? '#/' : '#/scores'}" aria-label="Retour">${ICONS.back}</a>
        <span class="eyebrow" style="flex:1">${esc(fmtLong.format(keyToDate(key)))}</span>
      </div>
      <section class="card results-hero">
        <p class="eyebrow">${esc(theme.emoji)} ${esc(theme.titre)}</p>
        ${done ? `${ringSVG(s, rec.n)}<h2>${h}</h2><p>${p}</p>
          <div class="results-actions">
            <button class="btn ghost" id="share">${ICONS.share} Partager</button>
            <a class="btn" href="#/fiches">Mes fiches</a>
          </div>` : `
          <h2>Quiz inachevé</h2><p>${rec.a.length} question${rec.a.length > 1 ? 's' : ''} sur ${rec.n} répondue${rec.a.length > 1 ? 's' : ''}.</p>
          ${isToday ? '<a class="btn accent block" href="#/quiz">Reprendre</a>' : ''}`}
      </section>
      <h2 class="section-title">Les questions</h2>
      <p class="muted" style="margin:-6px 0 12px;font-size:14px">Touche une question pour ouvrir sa fiche.</p>
      <ul class="qlist">
        ${theme.questions.map((q, i) => {
          const c = rec.a[i];
          const st = c === undefined ? 'none' : c === 0 ? 'good' : 'bad';
          const sub = c === undefined ? 'Pas encore répondu' : c === 0 ? q.choix[0] : `${q.choix[c]} → ${q.choix[0]}`;
          const mastered = st === 'bad' && store.mastered[`${theme.id}:${i}`];
          return `<li><button class="qitem ${mastered ? 'mastered' : ''}" data-i="${i}" ${c === undefined ? 'disabled' : ''}>
            <span class="mark ${st}">${st === 'good' ? '✓' : st === 'bad' ? '✕' : i + 1}</span>
            <span class="body"><b>${esc(q.fiche.titre)}</b><span>${esc(sub)}</span></span>
            ${c === undefined ? '' : ICONS.chev}
          </button></li>`;
        }).join('')}
      </ul>
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const v = app.querySelector('.ring .val');
    if (v) v.style.strokeDashoffset = v.dataset.target;
  }));
  document.getElementById('share')?.addEventListener('click', () => share(shareText(key, rec, theme)));
  app.querySelector('.qlist').addEventListener('click', (ev) => {
    const b = ev.target.closest('.qitem');
    if (!b || b.disabled) return;
    const i = Number(b.dataset.i);
    openFiche({ theme, i, chosen: rec.a[i], onChange: () => render() });
  });
}

/* ---------------------------------------------------------------- fiches */

let ficheFilter = 'todo';
let ficheQuery = '';

async function viewFiches(_, alive) {
  const refs = errorRefs();
  const ids = [...new Set(refs.map((r) => r.t))];
  await Promise.allSettled(ids.map(loadTheme));
  if (!alive()) return;
  const loaded = new Map();
  for (const id of ids) { try { loaded.set(id, await loadTheme(id)); } catch { /* hors ligne */ } }
  const items = refs.filter((r) => loaded.has(r.t)).map((r) => ({ ...r, theme: loaded.get(r.t), q: loaded.get(r.t).questions[r.i] })).filter((r) => r.q);
  const todo = items.filter((r) => !store.mastered[r.ref]).length;

  if (!refs.length) {
    app.innerHTML = `
      <div class="fade-in">
        <div class="page-head"><div><p class="eyebrow">Ta bibliothèque</p><h1 class="title">Fiches</h1></div></div>
        <div class="empty"><span class="big">📚</span><b>Aucune fiche pour l'instant</b>
        Chaque question ratée génère une fiche explicative, à retrouver ici.</div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="fade-in">
      <div class="page-head">
        <div><p class="eyebrow">Ta bibliothèque</p><h1 class="title">Fiches</h1></div>
        ${todo ? `<a class="btn small accent" href="#/revision">🧠 Réviser</a>` : ''}
      </div>
      <label class="search">${ICONS.search}<input id="q" type="search" placeholder="Rechercher une fiche" value="${esc(ficheQuery)}" autocomplete="off"></label>
      <div class="segmented" role="tablist">
        <button data-f="todo" class="${ficheFilter === 'todo' ? 'on' : ''}">À revoir · ${todo}</button>
        <button data-f="done" class="${ficheFilter === 'done' ? 'on' : ''}">Acquises · ${items.length - todo}</button>
        <button data-f="all" class="${ficheFilter === 'all' ? 'on' : ''}">Toutes</button>
      </div>
      <div id="flist"></div>
    </div>`;

  const list = document.getElementById('flist');
  const draw = () => {
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const qy = norm(ficheQuery.trim());
    const shown = items.filter((r) => {
      const m = !!store.mastered[r.ref];
      if (ficheFilter === 'todo' && m) return false;
      if (ficheFilter === 'done' && !m) return false;
      return !qy || norm(`${r.q.fiche.titre} ${r.q.q} ${r.q.choix[0]} ${r.theme.titre}`).includes(qy);
    });
    if (!shown.length) {
      list.innerHTML = ficheFilter === 'todo' && !qy
        ? `<div class="empty"><span class="big">🎉</span><b>Tout est révisé</b>Aucune fiche en attente.</div>`
        : `<div class="empty"><span class="big">🔎</span><b>Aucun résultat</b></div>`;
      return;
    }
    let html = '', group = '';
    for (const r of shown) {
      const g = fmtMonth.format(keyToDate(r.d));
      if (g !== group) { html += `<p class="group-label">${esc(g)}</p>`; group = g; }
      html += `<button class="qitem ${store.mastered[r.ref] ? 'mastered' : ''}" data-ref="${esc(r.ref)}" style="margin-bottom:8px">
        <span class="emo" style="font-size:22px">${esc(r.theme.emoji)}</span>
        <span class="body"><b>${esc(r.q.fiche.titre)}</b><span>${esc(r.theme.titre)} · ${esc(fmtShort.format(keyToDate(r.d)))}</span></span>
        ${ICONS.chev}
      </button>`;
    }
    list.innerHTML = html;
  };
  draw();

  document.getElementById('q').addEventListener('input', (e) => { ficheQuery = e.target.value; draw(); });
  app.querySelector('.segmented').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ficheFilter = b.dataset.f;
    app.querySelectorAll('.segmented button').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.qitem');
    if (!b) return;
    const r = items.find((x) => x.ref === b.dataset.ref);
    openFiche({ theme: r.theme, i: r.i, chosen: r.c, onChange: () => render() });
  });
}

/* ---------------------------------------------------------------- revision */

async function viewRevision(_, alive) {
  const pending = errorRefs().filter((e) => !store.mastered[e.ref]);
  if (!pending.length) return go('#/fiches');
  const picked = shuffled(pending).slice(0, REVIEW_SIZE);
  const items = [];
  for (const p of picked) {
    try { const theme = await loadTheme(p.t); if (theme.questions[p.i]) items.push({ theme, i: p.i, ref: p.ref }); } catch { /* hors ligne */ }
  }
  if (!alive()) return;
  if (!items.length) throw new Error('offline');
  const answers = [];
  const salt = Math.random().toString(36).slice(2);

  runQuiz({
    items,
    answers,
    seedFor: (idx) => `rev:${salt}:${items[idx].ref}`,
    label: (t) => `Révision · ${t.titre}`,
    onAnswer: (idx, orig) => {
      if (orig === 0) { store.mastered[items[idx].ref] = dayKey(); save(); }
    },
    onQuit: () => go('#/fiches'),
    onFinish: () => {
      const ok = answers.filter((c) => c === 0).length;
      const left = todoCount();
      app.innerHTML = `
        <div class="fade-in">
          <section class="card results-hero">
            <p class="eyebrow">Révision terminée</p>
            ${ringSVG(ok, items.length)}
            <h2>${ok === items.length ? 'Tout est rentré ! 🧠' : `${ok} fiche${ok > 1 ? 's' : ''} acquise${ok > 1 ? 's' : ''}`}</h2>
            <p>${left ? `Encore ${left} fiche${left > 1 ? 's' : ''} à revoir.` : 'Plus aucune fiche en attente.'}</p>
            <div class="stack">
              ${left ? '<button class="btn accent block" id="again">Nouvelle série</button>' : ''}
              <a class="btn ghost block" href="#/fiches">Retour aux fiches</a>
            </div>
          </section>
        </div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const v = app.querySelector('.ring .val');
        if (v) v.style.strokeDashoffset = v.dataset.target;
      }));
      document.getElementById('again')?.addEventListener('click', () => render());
    },
  });
}

/* ---------------------------------------------------------------- scores */

function barsChart(days) {
  const W = 320, H = 132, top = 10, bottom = 20, left = 18;
  const plotH = H - top - bottom;
  const slot = (W - left) / days.length;
  const bw = Math.max(2, slot - 2);
  const y = (v) => top + plotH * (1 - v);
  let g = '';
  for (const v of [0, 0.5, 1]) {
    g += `<line class="grid" x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text class="axis-label" x="0" y="${y(v) + 3}">${Math.round(v * 10)}</text>`;
  }
  let bars = '';
  days.forEach((d, idx) => {
    const x = left + idx * slot + (slot - bw) / 2;
    let path, cls;
    if (!d.rec) {
      cls = 'none';
      path = `M${x},${y(0) - 2}h${bw}v2h${-bw}z`;
    } else {
      const v = d.s / d.rec.n;
      const h = Math.max(3, plotH * v);
      const r = Math.min(4, bw / 2, h);
      const yt = y(0) - h;
      cls = v === 1 ? 'perfect' : '';
      path = `M${x},${y(0)}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${y(0)}z`;
    }
    bars += `<g data-idx="${idx}"><rect class="hit" x="${left + idx * slot}" y="0" width="${slot}" height="${H - bottom}"/><path class="bar ${cls}" d="${path}"/></g>`;
  });
  const lbl = (idx, anchor) => `<text class="axis-label" x="${left + idx * slot + slot / 2}" y="${H - 4}" text-anchor="${anchor}">${fmtTiny.format(keyToDate(days[idx].key))}</text>`;
  const xl = lbl(0, 'start') + lbl(Math.floor(days.length / 2), 'middle') + lbl(days.length - 1, 'end');
  return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores des 30 derniers jours">${g}${bars}${xl}</svg>`, W, H, left, slot };
}

async function viewScores(_, alive) {
  const done = doneDays();
  const { cur, best } = streaks();
  const total = done.reduce((s, k) => s + scoreOf(store.days[k]), 0);
  const totalQ = done.reduce((s, k) => s + store.days[k].n, 0);
  const perfect = done.filter((k) => scoreOf(store.days[k]) === store.days[k].n).length;

  if (!Object.keys(store.days).length) {
    app.innerHTML = `
      <div class="fade-in">
        <div class="page-head"><div><p class="eyebrow">Ta progression</p><h1 class="title">Scores</h1></div></div>
        <div class="empty"><span class="big">📈</span><b>Pas encore de score</b>Fais le quiz du jour pour démarrer ton historique.<br><br>
        <a class="btn small accent" href="#/">Quiz du jour</a></div>
        ${footer()}
      </div>`;
    bindFooter();
    return;
  }

  // 30 derniers jours
  const today = dayKey();
  const last = [...Array(30)].map((_, i) => {
    const key = addDays(today, i - 29);
    const rec = isDone(store.days[key]) ? store.days[key] : null;
    return { key, rec, s: rec ? scoreOf(rec) : 0 };
  });
  const chart = barsChart(last);

  // par catégorie
  const cats = new Map();
  for (const k of done) {
    const rec = store.days[k];
    const c = meta(rec.t).categorie;
    const e = cats.get(c) || { s: 0, n: 0 };
    e.s += scoreOf(rec); e.n += rec.n;
    cats.set(c, e);
  }
  const catRows = [...cats.entries()].map(([c, e]) => ({ c, p: Math.round((e.s / e.n) * 100) })).sort((a, b) => b.p - a.p);

  const history = Object.keys(store.days).sort().reverse();

  app.innerHTML = `
    <div class="fade-in">
      <div class="page-head"><div><p class="eyebrow">Ta progression</p><h1 class="title">Scores</h1></div></div>
      <div class="kpis">
        <div class="kpi"><b>${done.length}</b><span>quiz terminés</span></div>
        <div class="kpi"><b>${totalQ ? Math.round((total / totalQ) * 100) + '%' : '–'}</b><span>bonnes réponses</span></div>
        <div class="kpi"><b>🔥 ${cur}</b><span>série actuelle</span></div>
        <div class="kpi"><b>${best}</b><span>meilleure série · ${perfect} sans-faute</span></div>
      </div>

      <section class="card chart-card" style="margin-top:14px">
        <div class="chart-head"><b>30 derniers jours</b><span>score sur 10</span></div>
        <div class="chart" id="chart">${chart.svg}<div class="tip" id="tip" hidden></div></div>
      </section>

      ${catRows.length ? `
      <h2 class="section-title">Par catégorie</h2>
      <section class="card cat-bars">
        ${catRows.map((r) => `<div class="cat-row"><span class="name">${esc(r.c)}</span><span class="track"><span class="fill" style="width:${r.p}%"></span></span><span class="val">${r.p}%</span></div>`).join('')}
      </section>` : ''}

      <h2 class="section-title">Historique</h2>
      <div class="qlist">
        ${history.map((k) => {
          const rec = store.days[k];
          const m = meta(rec.t);
          return `<a class="qitem hist-item" href="#/jour/${k}">
            <span class="emo">${esc(m.emoji)}</span>
            <span class="body"><b>${esc(m.titre)}</b><span>${esc(cap(fmtLong.format(keyToDate(k))))}</span></span>
            <span class="score">${isDone(rec) ? `${scoreOf(rec)}<span class="muted" style="font-size:14px">/${rec.n}</span>` : '<span class="chip">en cours</span>'}</span>
          </a>`;
        }).join('')}
      </div>
      ${footer()}
    </div>`;

  // Infobulle au survol / toucher des barres
  const tip = document.getElementById('tip');
  const svg = app.querySelector('#chart svg');
  const showTip = (g) => {
    const d = last[Number(g.dataset.idx)];
    svg.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
    g.querySelector('.bar').classList.add('on');
    const x = chart.left + Number(g.dataset.idx) * chart.slot + chart.slot / 2;
    const yTop = d.rec ? 10 + (chart.H - 30) * (1 - d.s / d.rec.n) : chart.H - 22;
    tip.style.left = `${Math.min(88, Math.max(12, (x / chart.W) * 100))}%`;
    tip.style.top = `${(yTop / chart.H) * 100}%`;
    tip.innerHTML = d.rec ? `<b>${d.s}/${d.rec.n}</b> · ${esc(meta(d.rec.t).titre)}<br>${esc(fmtShort.format(keyToDate(d.key)))}` : `${esc(fmtShort.format(keyToDate(d.key)))} · pas de quiz`;
    tip.dataset.idx = g.dataset.idx;
    tip.hidden = false;
  };
  // Souris : survol = infobulle, clic = ouvrir le jour. Tactile : 1er toucher = infobulle, 2e = ouvrir.
  let armed = false;
  svg.addEventListener('pointerover', (e) => {
    const g = e.target.closest('g[data-idx]');
    if (g && e.pointerType === 'mouse') showTip(g);
  });
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('g[data-idx]');
    if (!g) return;
    armed = !tip.hidden && tip.dataset.idx === g.dataset.idx;
    showTip(g);
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    tip.hidden = true;
    svg.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
  });
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('g[data-idx]');
    const d = g && last[Number(g.dataset.idx)];
    if (d?.rec && armed) go(`#/jour/${d.key}`);
  });
  bindFooter();
}

function footer() {
  let bytes = 0;
  try { bytes = new Blob([localStorage.getItem(KEY) || '']).size; } catch { /* rien */ }
  const size = bytes < 1024 ? `${bytes} o` : `${(bytes / 1024).toFixed(1)} Ko`;
  return `<p class="footnote">Données stockées sur ce téléphone : ${size}<br>
    <button id="export">Exporter</button> · <button id="import">Importer</button>
    <input type="file" id="import-file" accept="application/json" hidden></p>`;
}

function bindFooter() {
  document.getElementById('export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `culture-du-jour-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const file = document.getElementById('import-file');
  document.getElementById('import')?.addEventListener('click', () => file.click());
  file?.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await file.files[0].text());
      if (!data || typeof data.days !== 'object') throw new Error('format');
      if (!confirm('Remplacer les données de ce téléphone par celles du fichier ?')) return;
      store.days = data.days;
      store.mastered = data.mastered || {};
      save();
      toast('Données importées ✓');
      render();
    } catch { toast('Fichier invalide'); }
  });
}

/* ---------------------------------------------------------------- fiche (bottom sheet) */

const wikiCache = new Map();

async function wikiSummary(title) {
  if (wikiCache.has(title)) return wikiCache.get(title);
  const base = 'https://fr.wikipedia.org';
  let out = null;
  try {
    const r = await fetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);
    if (r.ok) {
      const j = await r.json();
      if (j.type !== 'disambiguation' && j.extract) {
        out = { extract: j.extract, thumb: j.thumbnail?.source, url: j.content_urls?.mobile?.page || `${base}/wiki/${encodeURIComponent(title)}`, title: j.title };
      }
    }
  } catch { /* hors ligne */ }
  if (!out) {
    try {
      const qs = new URLSearchParams({
        action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: title, gsrlimit: '1',
        prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exsentences: '5', piprop: 'thumbnail', pithumbsize: '320', inprop: 'url',
      });
      const j = await getJSON(`${base}/w/api.php?${qs}`);
      const page = j.query && Object.values(j.query.pages)[0];
      if (page?.extract) out = { extract: page.extract, thumb: page.thumbnail?.source, url: page.fullurl, title: page.title };
    } catch { /* hors ligne */ }
  }
  if (out) wikiCache.set(title, out);
  return out;
}

function hideSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
  document.body.style.overflow = '';
}

function closeSheet() {
  if (sheet.hidden) return;
  if (history.state?.sheet) history.back(); else hideSheet();
}

window.addEventListener('popstate', () => { if (!sheet.hidden) hideSheet(); });
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function openFiche({ theme, i, chosen, onChange }) {
  const q = theme.questions[i];
  const ref = `${theme.id}:${i}`;
  const f = q.fiche;
  const wrong = chosen !== undefined && chosen !== 0;

  const masterBtn = () => store.mastered[ref]
    ? '<button class="btn ghost block" id="master">✓ Fiche acquise · remettre à revoir</button>'
    : '<button class="btn block" id="master">Je la connais maintenant ✓</button>';

  sheet.innerHTML = `
    <div class="grabber"></div>
    <div class="sheet-head">
      <span class="chip">${esc(theme.emoji)} ${esc(theme.titre)}</span>
      <button class="icon-btn" id="close-sheet" aria-label="Fermer">${ICONS.close}</button>
    </div>
    <h2>${esc(f.titre)}</h2>
    <div class="card qa">
      <p class="q">${esc(q.q)}</p>
      ${wrong ? `<div class="row"><span class="k bad">✕</span><span>${esc(q.choix[chosen])}</span></div>` : ''}
      <div class="row"><span class="k good">✓</span><span><b>${esc(q.choix[0])}</b></span></div>
    </div>
    <p class="fiche-text">${esc(f.texte)}</p>
    <div class="wiki" id="wiki">
      <div class="wiki-head"><b style="font-family:var(--serif);font-size:20px">W</b><span class="eyebrow">Sur Wikipédia</span></div>
      <div class="skeleton" style="width:95%"></div><div class="skeleton" style="width:88%"></div><div class="skeleton" style="width:70%"></div>
    </div>
    <div class="sheet-actions" id="sheet-actions">${wrong ? masterBtn() : ''}</div>`;

  sheet.hidden = false;
  backdrop.hidden = false;
  sheet.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  history.pushState({ sheet: 1 }, '');

  document.getElementById('close-sheet').onclick = closeSheet;
  const bindMaster = () => {
    const b = document.getElementById('master');
    if (!b) return;
    b.onclick = () => {
      if (store.mastered[ref]) delete store.mastered[ref]; else store.mastered[ref] = dayKey();
      save();
      document.getElementById('sheet-actions').innerHTML = masterBtn();
      bindMaster();
      toast(store.mastered[ref] ? 'Fiche marquée comme acquise' : 'Fiche remise à revoir');
      sheet.dataset.changed = '1';
    };
  };
  bindMaster();
  sheet.dataset.changed = '';
  sheet.onchangeCb = onChange;

  const wikiTitle = f.wiki || f.titre;
  wikiSummary(wikiTitle).then((w) => {
    const box = document.getElementById('wiki');
    if (!box || sheet.hidden) return;
    const fallback = `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(wikiTitle)}`;
    if (!w) {
      box.innerHTML = `<div class="wiki-head"><b style="font-family:var(--serif);font-size:20px">W</b><span class="eyebrow">Sur Wikipédia</span></div>
        <p>Résumé indisponible hors connexion.</p><a href="${fallback}" target="_blank" rel="noopener">Chercher sur Wikipédia ↗</a>`;
      return;
    }
    const extract = w.extract.length > 900 ? `${w.extract.slice(0, 900).replace(/\s+\S*$/, '')}…` : w.extract;
    box.innerHTML = `<div class="wiki-head"><b style="font-family:var(--serif);font-size:20px">W</b><span class="eyebrow">Sur Wikipédia · ${esc(w.title)}</span></div>
      ${w.thumb ? `<img src="${esc(w.thumb)}" alt="" loading="lazy">` : ''}
      <p>${esc(extract)}</p>
      <a href="${esc(w.url || fallback)}" target="_blank" rel="noopener">Lire l'article complet ↗</a>`;
  });
}

// Rafraîchit la vue sous-jacente quand une fiche modifiée est fermée.
new MutationObserver(() => {
  if (sheet.hidden && sheet.dataset.changed) {
    sheet.dataset.changed = '';
    sheet.onchangeCb?.();
  }
}).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });

/* ---------------------------------------------------------------- boot */

async function boot() {
  try {
    INDEX = await getJSON('data/themes.json');
  } catch {
    app.innerHTML = `<div class="empty"><span class="big">📡</span><b>Pas de connexion</b>Ouvre l'app une première fois en ligne pour télécharger les thèmes.<br><br>
      <button class="btn small ghost" onclick="location.reload()">Réessayer</button></div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  // Passage à minuit pendant que l'app est ouverte / en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dayKey() !== currentDay) {
      currentDay = dayKey();
      if (!location.hash.startsWith('#/quiz') && !location.hash.startsWith('#/revision')) render();
    }
  });
  render();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
navigator.storage?.persist?.().catch(() => {});

boot();
