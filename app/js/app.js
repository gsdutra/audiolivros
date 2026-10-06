// Audiolivros — UI. Views: unlock, library, and per book: now (Ouvindo), line (Capítulos), text, marks.
import * as vault from './vault.js';
import { bookmarks, heard, position, settings } from './store.js';
import { Player } from './player.js';
import { icon } from './icons.js';
import { BANDS, FLAT, PRESETS, RANGE, isFlat, presetOf } from './eq.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const tabsEl = $('#tabs');
const miniEl = $('#mini');
const sheet = $('#sheet');
const toastEl = $('#toast');

const player = new Player();
if (['localhost', '127.0.0.1'].includes(location.hostname)) window.audiolivros = player; // dev inspection only
const LINES = [['scarlet', '#fff'], ['cobalt', '#fff'], ['green', '#fff'], ['amber', '#0B1230']];
const RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2];

const state = {
  library: null,     // { books: [...] }
  manifests: {},     // book id -> manifest
  covers: {},        // book id -> object URL
  route: 'now',
  following: true,   // read-along auto-scroll
  picked: null,      // read-along paragraph chosen by tap
  downloads: {},     // book id -> { done, total, running }
  cached: {},        // book id -> Set of cached file names
};

// ---------- formatting ----------
const pad = (n) => String(n).padStart(2, '0');
const clock = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};
const human = (s) => {
  const m = Math.round(s / 60);
  if (m < 60) return `${Math.max(m, 1)} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};
const etaParts = (s) => {
  if (s < 60) return ['<1', 'min'];
  const m = Math.round(s / 60);
  return m < 60 ? [String(m), 'min'] : [`${Math.floor(m / 60)}h${pad(m % 60)}`, ''];
};
const rateLabel = (r) => `${r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MB = (b) => `${Math.round(b / 1e6)} MB`;

function partOf(book, i) {
  for (let k = i; k >= 0; k--) if (book.tracks[k].part) return book.tracks[k].part;
  return null;
}
const partShort = (p) => p?.replace(/^Parte (\w+) — /, '$1 · ');
const sectionAt = (track, t) => {
  let s = track.sections[0];
  for (const x of track.sections) if (x.t <= t + 0.05) s = x;
  return s;
};
const bookHeard = (book) => {
  const pos = position.get(book.id);
  if (!pos) return 0;
  return book.tracks.slice(0, pos.track).reduce((s, t) => s + t.duration, 0) + pos.t;
};

function setLine(bookId) {
  const i = Math.max(0, state.library?.books.findIndex((b) => b.id === bookId) ?? 0);
  const [name, on] = LINES[i % LINES.length];
  document.documentElement.style.setProperty('--line', `var(--${name})`);
  document.documentElement.style.setProperty('--line-on', on);
}

// ---------- toast & sheet ----------
let toastTimer;
function toast(msg, action, fn, ms = 4500) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  toastEl.hidden = false;
  if (action) $('button', toastEl).onclick = () => { toastEl.hidden = true; fn(); };
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function openSheet(html, onPick, { keep = false } = {}) {
  const form = $('.sheet-body', sheet);
  form.innerHTML = `${html}<div class="close-row"><button class="btn btn-ghost btn-block" value="close">Fechar</button></div>`;
  form.onclick = (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    e.preventDefault();
    onPick(b.dataset.pick);
    if (!keep) sheet.close();
  };
  sheet.showModal();
  return form;
}

// Equalizer: five bands drawn as short vertical rails; their stations are joined by the book's line.
function eqSheet() {
  let gains = [...player.eqGains];
  const form = openSheet(`
    <h2 id="sheet-title">Equalizador</h2>
    <p>Ajusta o timbre do narrador. Vale para todos os livros neste aparelho.${settings.get().rate === 1 ? '' : ` <b>Pausado a ${rateLabel(settings.get().rate)}:</b> o iPhone só aplica o equalizador em 1,0×.`}</p>
    <div class="chips" id="eq-presets">${PRESETS.map((p) => `<button type="button" class="chip" data-pick="${p.id}">${p.label}</button>`).join('')}
      <span class="chip chip-static" id="eq-custom">Personalizado</span></div>
    <div class="eq" role="group" aria-label="Faixas do equalizador">
      <svg class="eq-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline/></svg>
      ${BANDS.map((b, i) => `<div class="eq-band">
        <output id="eq-v${i}"></output>
        <div class="eq-rail" role="slider" tabindex="0" data-i="${i}" aria-label="${b.label}, ${b.hz} Hz"
          aria-valuemin="${-RANGE}" aria-valuemax="${RANGE}"><i class="zero"></i><i class="thumb"></i></div>
        <span>${b.label}</span><small>${b.hz} Hz</small></div>`).join('')}
    </div>`, (id) => apply([...PRESETS.find((p) => p.id === id).gains]), { keep: true });

  const frac = (g) => 1 - (g + RANGE) / (2 * RANGE); // 0 = top (+12 dB), 1 = bottom (−12 dB)
  const fmt = (g) => (g > 0 ? `+${g}` : String(g));
  function paint() {
    const preset = presetOf(gains);
    form.querySelectorAll('#eq-presets [data-pick]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pick === preset));
    $('#eq-custom', form).setAttribute('aria-pressed', preset === 'custom');
    form.querySelectorAll('.eq-rail').forEach((rail, i) => {
      $('.thumb', rail).style.top = `calc(13px + (100% - 26px) * ${frac(gains[i])})`;
      rail.setAttribute('aria-valuenow', gains[i]);
      rail.setAttribute('aria-valuetext', `${fmt(gains[i])} dB`);
      $(`#eq-v${i}`, form).textContent = fmt(gains[i]);
    });
    $('.eq-curve polyline', form).setAttribute('points', gains.map((g, i) => `${(i + 0.5) * 20},${frac(g) * 100}`).join(' '));
  }
  function apply(g) {
    gains = g;
    player.setEq([...g]);
    paint();
    update();
  }
  const set = (i, v) => {
    v = Math.max(-RANGE, Math.min(RANGE, v));
    if (gains[i] === v) return;
    const g = [...gains];
    g[i] = v;
    apply(g);
  };
  form.querySelectorAll('.eq-rail').forEach((rail) => {
    const i = Number(rail.dataset.i);
    const valueAt = (y) => {
      const r = rail.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (y - r.top - 13) / (r.height - 26)));
      return Math.round(RANGE - f * 2 * RANGE);
    };
    rail.addEventListener('pointerdown', (e) => {
      rail.setPointerCapture(e.pointerId);
      rail.classList.add('dragging');
      set(i, valueAt(e.clientY));
    });
    rail.addEventListener('pointermove', (e) => { if (rail.hasPointerCapture(e.pointerId)) set(i, valueAt(e.clientY)); });
    const end = () => rail.classList.remove('dragging');
    rail.addEventListener('pointerup', end);
    rail.addEventListener('pointercancel', end);
    rail.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); set(i, gains[i] + d); }
    });
  });
  paint();
}

function speedSheet() {
  const cur = settings.get().rate;
  openSheet(
    `<h2 id="sheet-title">Velocidade</h2><p>Vale para todos os livros neste aparelho.${isFlat(player.eqGains) ? '' : ' Fora de 1,0× o equalizador fica pausado (limitação do iPhone).'}</p>
     <div class="chips">${RATES.map((r) => `<button class="chip" data-pick="${r}" aria-pressed="${r === cur}">${rateLabel(r)}</button>`).join('')}</div>`,
    (v) => { player.setRate(Number(v)); update(); },
  );
}

function sleepSheet() {
  const on = player.sleep;
  const mins = [10, 15, 30, 45, 60, 90];
  openSheet(
    `<h2 id="sheet-title">Timer para dormir</h2>
     <p>${on ? (on.kind === 'track' ? 'Para no fim deste capítulo.' : `Para em ${human(player.sleepRemaining() / 1000)}.`) : 'Pausa o livro sozinho.'}</p>
     <div class="chips">${mins.map((m) => `<button class="chip" data-pick="${m}">${m} min</button>`).join('')}
       <button class="chip wide" data-pick="track" aria-pressed="${on?.kind === 'track'}">No fim do capítulo</button>
       ${on ? '<button class="chip wide" data-pick="off">Desligar timer</button>' : ''}</div>`,
    (v) => {
      if (v === 'off') player.setSleep(null);
      else if (v === 'track') player.setSleep('track');
      else player.setSleep('time', Number(v));
      update();
    },
  );
}

function addMark() {
  if (!player.book) return;
  const m = bookmarks.add(player.book.id, { track: player.track, t: player.time });
  toast(`Marcado em ${clock(m.t)}`, 'Escrever nota', () => go('marks', m.id));
}

// ---------- routing ----------
const TABS = [
  ['now', 'Ouvindo', icon.listening],
  ['line', 'Capítulos', icon.line],
  ['text', 'Texto', icon.text],
  ['marks', 'Marcadores', icon.mark],
];

function go(route, focus) {
  state.route = route;
  if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
  render(focus);
}

function render(focus) {
  const inBook = ['now', 'line', 'text', 'marks'].includes(state.route) && player.book;
  tabsEl.hidden = !inBook;
  document.body.classList.toggle('no-tabs', !inBook);
  if (inBook) {
    tabsEl.innerHTML = TABS.map(([id, label, ic]) =>
      `<button class="tab" role="tab" aria-selected="${state.route === id}" data-tab="${id}">${ic(24)}<span>${label}</span></button>`).join('');
  }
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  ({ unlock: renderUnlock, library: renderLibrary, now: renderNow, line: renderLine, text: renderText, marks: renderMarks })[state.route]?.(focus);
  renderMini();
}

tabsEl.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) go(t.dataset.tab);
});

// ---------- unlock ----------
function renderUnlock(message) {
  view.innerHTML = `
  <section class="unlock">
    <svg class="unlock-lines" viewBox="0 0 390 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${
      ['scarlet', 'cobalt', 'amber', 'green'].map((c, k) => {
        const dx = -5.8 * k;
        const y = 24 + 14 * k;
        return `<path d="M-20 ${y} H${170 + dx} L${230 + dx} ${y + 60} H420" stroke="var(--${c})"/>`;
      }).join('')}
      <circle cx="96" cy="24" r="9" class="stn"/><rect x="292" y="72" width="24" height="66" rx="12" class="hub"/>
    </svg>
    <h1>Audio&shy;livros</h1>
    <p>Digite a senha da sua biblioteca. Ela fica guardada neste aparelho; você só digita uma vez.</p>
    <form class="field" id="unlock-form" autocomplete="on">
      <label for="pw">Senha da biblioteca</label>
      <input id="pw" class="input" type="password" name="password" autocomplete="current-password"
        autocapitalize="off" autocorrect="off" spellcheck="false" required>
      <p class="form-error" id="pw-error" role="alert">${message ? esc(message) : ''}</p>
      <button class="btn btn-primary btn-block" id="pw-go">Desbloquear ${icon.arrowRight(20)}</button>
    </form>
  </section>`;
  $('#unlock-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#pw-go');
    btn.disabled = true;
    btn.textContent = 'Abrindo a biblioteca…';
    try {
      if (await vault.unlock($('#pw').value)) return boot();
      $('#pw-error').textContent = 'Senha incorreta. Ela está no Mac, em .secrets/passphrase.';
    } catch (err) {
      $('#pw-error').textContent = 'Sem conexão com a biblioteca. Conecte-se à internet e tente de novo.';
    }
    btn.disabled = false;
    btn.innerHTML = `Desbloquear ${icon.arrowRight(20)}`;
  };
}

// ---------- library ----------
async function loadManifest(id) {
  if (!state.manifests[id]) state.manifests[id] = await vault.json(`${id}/book.enc`);
  const m = state.manifests[id];
  if (!state.covers[id] && m.cover) {
    vault.blob(`${id}/${m.cover}`, 'image/jpeg').then((b) => {
      state.covers[id] = URL.createObjectURL(b);
      document.querySelectorAll(`img[data-cover="${id}"]`).forEach((img) => { img.src = state.covers[id]; });
      if (player.book?.id === id) { player.coverUrl = state.covers[id]; player.updateMetadata(); }
    }).catch(() => {});
  }
  return m;
}

async function refreshCached(book) {
  const set = new Set();
  await Promise.all(book.tracks.map(async (t) => { if (await vault.isCached(`${book.id}/${t.file}`)) set.add(t.file); }));
  state.cached[book.id] = set;
}

// Schematic like a metro map: stations evenly spaced, the train interpolated inside its chapter.
function miniline(book) {
  const n = book.tracks.length;
  const stations = book.tracks.map((t, i) => `<span class="s${t.part ? ' hub' : ''}" style="left:${(i / n) * 100}%"></span>`).join('');
  const pos = position.get(book.id);
  const done = pos ? Math.min(100, ((pos.track + pos.t / book.tracks[pos.track].duration) / n) * 100) : 0;
  return `<div class="miniline" aria-hidden="true"><div class="rail"></div><div class="done" style="width:${done}%"></div>${stations}
    <span class="s" style="left:100%"></span><span class="train" style="left:${done}%"></span></div>`;
}

async function renderLibrary() {
  const books = state.library.books;
  const total = books.reduce((s, b) => s + b.duration, 0);
  view.innerHTML = `
    <header class="lib-head">
      <h1>Audiolivros</h1>
      <p class="meta">${books.length} ${books.length === 1 ? 'livro' : 'livros'} · ${human(total)} de áudio</p>
    </header>
    <div id="books"></div>
    <section class="device" aria-labelledby="dev-h">
      <h2 id="dev-h">Neste aparelho</h2>
      <div class="row"><span>Senha da biblioteca guardada</span><button class="btn btn-quiet" id="forget">Esquecer</button></div>
      <p class="hint">Novos livros aparecem aqui quando você publica pelo Mac com <code>pipeline/publish.py</code>. Seu progresso fica só neste iPhone.</p>
    </section>`;
  $('#forget').onclick = () => {
    if (!confirm('Esquecer a senha neste aparelho? O progresso continua salvo.')) return;
    player.pause();
    vault.forget();
    state.route = 'unlock';
    render();
  };
  const holder = $('#books');
  for (const [i, b] of books.entries()) {
    const m = await loadManifest(b.id);
    await refreshCached(m);
    const pos = position.get(b.id);
    const t = pos ? m.tracks[pos.track] : null;
    const [lineName] = LINES[i % LINES.length];
    const totalDur = m.tracks.reduce((s, x) => s + x.duration, 0);
    const pct = Math.round((bookHeard(m) / totalDur) * 100);
    const card = document.createElement('article');
    card.className = 'panel book-card';
    card.style.setProperty('--line', `var(--${lineName})`);
    card.innerHTML = `
      <div class="top">
        <img class="cover" alt="" data-cover="${b.id}" ${state.covers[b.id] ? `src="${state.covers[b.id]}"` : ''}>
        <div>
          <h2>${esc(m.title)}</h2>
          <div class="author">${esc(m.author)}</div>
          <div class="where">${t ? `Parada atual: <b>${esc(t.title)}</b> · ${pct}%` : `${m.tracks.length} estações · ${human(totalDur)}`}</div>
        </div>
      </div>
      ${miniline(m)}
      <div class="actions"><button class="btn btn-primary" data-open="${b.id}">${t ? 'Continuar' : 'Começar'} ${icon.arrowRight(20)}</button></div>
      <div class="offline-row" data-offline="${b.id}"></div>`;
    holder.append(card);
    paintOffline(m);
  }
  holder.onclick = async (e) => {
    const o = e.target.closest('[data-open]');
    if (o) {
      player.unlock();
      await openBook(o.dataset.open);
      player.play();
      return;
    }
    const d = e.target.closest('[data-download]');
    if (d) downloadBook(state.manifests[d.dataset.download]);
  };
}

function paintOffline(book) {
  const row = document.querySelector(`[data-offline="${book.id}"]`);
  if (!row) return;
  const cached = state.cached[book.id] || new Set();
  const dl = state.downloads[book.id];
  const size = book.tracks.reduce((s, t) => s + t.bytes, 0);
  const n = book.tracks.filter((t) => cached.has(t.file)).length;
  if (dl?.running) {
    row.innerHTML = `${icon.download(20)}<div class="grow">Baixando ${dl.done} de ${dl.total} capítulos…<div class="bar"><i style="transform:scaleX(${dl.done / dl.total})"></i></div></div>`;
  } else if (n === book.tracks.length) {
    row.innerHTML = `${icon.check(20)}<div class="grow">Disponível sem internet · ${MB(size)}</div>`;
  } else {
    row.innerHTML = `${icon.download(20)}<div class="grow">${n ? `${n} de ${book.tracks.length} capítulos offline` : 'Ouvir sem internet'}</div>
      <button class="btn btn-ghost" style="min-height:40px;font-size:15px" data-download="${book.id}">Baixar ${MB(size)}</button>`;
  }
}

async function downloadBook(book) {
  const missing = book.tracks.filter((t) => !state.cached[book.id]?.has(t.file));
  const dl = (state.downloads[book.id] = { done: 0, total: missing.length, running: true });
  paintOffline(book);
  try {
    for (const t of missing) {
      await vault.cache(`${book.id}/${t.file}`);
      state.cached[book.id].add(t.file);
      dl.done++;
      paintOffline(book);
    }
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    toast('O download parou. Verifique a conexão e toque em Baixar de novo.');
  }
  dl.running = false;
  paintOffline(book);
}

// ---------- now playing ----------
const nowRefs = {};

function renderNow() {
  const b = player.book;
  const tr = player.current;
  const part = partOf(b, player.track);
  const stops = tr.sections.slice(1).map((s) => `<span class="stop" style="left:${(s.t / tr.duration) * 100}%"></span>`).join('');
  view.innerHTML = `
  <div class="np">
    <header class="topbar">
      <button class="icon-btn" id="to-lib" aria-label="Biblioteca">${icon.chevronLeft(24)}</button>
      <div class="title">${esc(b.title)}</div>
    </header>
    <section class="station">
      <div class="name-row"><h1 id="np-title">${esc(tr.title)}</h1>${part ? `<span class="badge">${esc(partShort(part))}</span>` : ''}</div>
      <p class="section" id="np-section"></p>
    </section>
    <section class="panel board" aria-labelledby="board-h">
      <div class="panel-head"><h2 id="board-h">Próximas paradas</h2><span class="meta" id="np-rate"></span></div>
      <ol id="np-board"></ol>
    </section>
    <section class="track" id="np-track">
      <div class="hit" role="slider" tabindex="0" aria-label="Posição no capítulo" aria-valuemin="0" aria-valuemax="${Math.round(tr.duration)}">
        <div class="rail"></div><div class="done"></div>${stops}
        <span class="end" style="left:0"></span><span class="end" style="left:100%"></span>
        <div class="train"></div>
      </div>
      <div class="times"><span id="np-el"></span><span id="np-rem"></span></div>
    </section>
    <div class="controls">
      <button class="ctl small" data-act="prev" aria-label="Capítulo anterior">${icon.prevStation(26)}</button>
      <button class="ctl" data-act="back" aria-label="Voltar ${settings.get().back} segundos">${icon.back(settings.get().back, 34)}</button>
      <button class="play" id="np-play" data-act="toggle" aria-label="Tocar"></button>
      <button class="ctl" data-act="fwd" aria-label="Avançar ${settings.get().fwd} segundos">${icon.fwd(settings.get().fwd, 34)}</button>
      <button class="ctl small" data-act="next" aria-label="Próximo capítulo">${icon.nextStation(26)}</button>
    </div>
    <div class="secondary">
      <button class="btn btn-ghost" data-act="speed" id="np-speed"></button>
      <button class="btn btn-ghost" data-act="sleep" id="np-sleep"></button>
      <button class="btn btn-ghost" data-act="eq" id="np-eq" aria-label="Equalizador">EQ</button>
      <button class="btn btn-ghost" data-act="mark" aria-label="Marcar este trecho">Marcar</button>
    </div>
  </div>`;
  Object.assign(nowRefs, {
    section: $('#np-section'), board: $('#np-board'), boardH: $('#board-h'), rate: $('#np-rate'), hit: $('#np-track .hit'),
    track: $('#np-track'), done: $('#np-track .done'), train: $('#np-track .train'),
    el: $('#np-el'), rem: $('#np-rem'), play: $('#np-play'), speed: $('#np-speed'), sleep: $('#np-sleep'), eq: $('#np-eq'),
    boardKey: null, sectionIdx: null,
  });
  $('#to-lib').onclick = () => go('library');
  bindScrubber();
  updateNow();
}

function upcoming() {
  const b = player.book;
  const tr = player.current;
  const t = player.time;
  const rows = tr.sections.slice(1).filter((s) => s.t > t + 0.5).slice(0, 2)
    .map((s) => ({ label: s.title, at: s.t - t, track: player.track, t: s.t }));
  const next = b.tracks[player.track + 1];
  if (next && rows.length < 3) rows.push({ label: next.title, at: tr.duration - t, track: player.track + 1, t: 0, chap: true, hub: !!next.part });
  return rows;
}

function updateNow() {
  const r = nowRefs;
  if (!r.board || !document.body.contains(r.board)) return;
  const tr = player.current;
  const t = player.time;
  const rate = settings.get().rate;
  if (!r.dragging) {
    const sec = sectionAt(tr, t);
    const label = sec === tr.sections[0] ? 'Início do capítulo' : sec.title;
    if (r.section.textContent !== label) r.section.textContent = label;
    const f = Math.min(1, t / tr.duration) * 100;
    r.train.style.left = `${f}%`;
    r.done.style.width = `${f}%`;
    r.el.textContent = clock(t);
    r.rem.textContent = `−${clock((tr.duration - t) / rate)}`;
    r.hit.setAttribute('aria-valuenow', Math.round(t));
    r.hit.setAttribute('aria-valuetext', `${clock(t)} de ${clock(tr.duration)}, ${label}`);
  }
  const rows = upcoming();
  const key = rows.map((x) => `${x.label}|${etaParts(x.at / rate).join('')}`).join('/');
  if (key !== r.boardKey) {
    r.boardKey = key;
    r.board.innerHTML = rows.length ? rows.map((x) => {
      const [n, u] = etaParts(x.at / rate);
      return `<li><button data-go="${x.track}" data-t="${x.t}">
        <span class="tick${x.hub ? ' hub' : ''}" aria-hidden="true"></span>
        <span class="label${x.chap ? ' chap' : ''}">${esc(x.label)}</span>
        <span class="eta">${n}<small>${u}</small></span></button></li>`;
    }).join('') : `<li class="empty">Última parada: o livro termina em ${human((tr.duration - t) / rate)}.</li>`;
  }
  r.rate.textContent = rate === 1 ? '' : `a ${rateLabel(rate)}`;
  r.speed.textContent = rateLabel(rate);
  const rem = player.sleepRemaining();
  r.sleep.textContent = player.sleep ? (player.sleep.kind === 'track' ? 'Fim cap' : human(rem / 1000)) : 'Timer';
  r.sleep.setAttribute('aria-label', player.sleep ? `Timer: ${r.sleep.textContent}` : 'Timer para dormir');
  r.sleep.classList.toggle('on', !!player.sleep);
  r.eq.classList.toggle('on', player.eqActive);
  paintPlay(r.play);
}

function paintPlay(btn) {
  if (!btn) return;
  const loading = player.loading;
  const playing = player.playing;
  const want = loading ? 'loading' : playing ? 'pause' : 'play';
  if (btn.dataset.state === want) return;
  btn.dataset.state = want;
  btn.classList.toggle('loading', loading);
  btn.innerHTML = playing ? icon.pause(btn.classList.contains('pp') ? 22 : 38) : icon.play(btn.classList.contains('pp') ? 22 : 38);
  btn.setAttribute('aria-label', loading ? 'Carregando' : playing ? 'Pausar' : 'Tocar');
}

function bindScrubber() {
  const r = nowRefs;
  const at = (x) => {
    const rect = r.hit.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * player.duration;
  };
  const show = (t) => {
    const f = (t / player.duration) * 100;
    r.train.style.left = `${f}%`;
    r.done.style.width = `${f}%`;
    r.el.textContent = clock(t);
    const sec = sectionAt(player.current, t);
    r.section.textContent = sec === player.current.sections[0] ? 'Início do capítulo' : sec.title;
    r.boardH.textContent = `Soltar em ${clock(t)}`;
  };
  r.hit.addEventListener('pointerdown', (e) => {
    r.dragging = true;
    r.hit.setPointerCapture(e.pointerId);
    r.track.classList.add('dragging');
    r.section.classList.add('dragging');
    r.dragT = at(e.clientX);
    show(r.dragT);
  });
  r.hit.addEventListener('pointermove', (e) => {
    if (!r.dragging) return;
    r.dragT = at(e.clientX);
    show(r.dragT);
  });
  const end = () => {
    if (!r.dragging) return;
    r.dragging = false;
    r.track.classList.remove('dragging');
    r.section.classList.remove('dragging');
    r.boardH.textContent = 'Próximas paradas';
    player.seek(r.dragT);
    updateNow();
  };
  r.hit.addEventListener('pointerup', end);
  r.hit.addEventListener('pointercancel', end);
  r.hit.addEventListener('keydown', (e) => {
    const s = settings.get();
    if (e.key === 'ArrowLeft') { player.skip(-s.back); e.preventDefault(); }
    if (e.key === 'ArrowRight') { player.skip(s.fwd); e.preventDefault(); }
  });
}

// ---------- chapters (the line) ----------
function renderLine() {
  const b = player.book;
  const h = heard.get(b.id);
  const total = b.tracks.reduce((s, t) => s + t.duration, 0);
  const done = bookHeard(b);
  const cached = state.cached[b.id] || new Set();
  let html = '';
  b.tracks.forEach((t, i) => {
    if (t.part) {
      html += `<li class="st part part-label${i <= player.track ? ' heard' : ''}"><div class="rail"></div>
        <div class="row"><span class="dot" aria-hidden="true"></span><div class="name"><strong>${esc(t.part)}</strong></div></div></li>`;
    }
    const cur = i === player.track;
    const full = (h[i] || 0) >= t.duration - 5;
    const partial = !full && (h[i] || 0) > 5;
    const status = cur ? `agora · ${clock(player.time)} de ${human(t.duration)}`
      : full ? `${icon.check(16)} ouvido · ${human(t.duration)}`
      : partial ? `${human(h[i])} de ${human(t.duration)}` : human(t.duration);
    const stops = t.sections.slice(1).map((s, k) => {
      const here = cur && sectionAt(t, player.time) === s;
      return `<li><button class="stop-row${here ? ' here' : ''}" data-go="${i}" data-t="${s.t}">
        <span class="pin${here ? ' here' : ''}" aria-hidden="true"></span><span class="t">${esc(s.title)}</span><span class="time">${clock(s.t)}</span></button></li>`;
    }).join('');
    html += `<li class="st${i < player.track ? ' heard' : ''}${cur ? ' current open' : ''}${i === 0 ? ' first' : ''}${i === b.tracks.length - 1 ? ' last' : ''}" id="st-${i}">
      <div class="rail"></div>
      <div class="row">
        <button class="dot" data-go="${i}" data-t="0" aria-label="Tocar ${esc(t.title)} do início"></button>
        <button class="name" data-go="${i}" data-t="${cur ? player.time : (partial ? h[i] : 0)}" style="text-align:left">
          <strong>${esc(t.title)}</strong><span>${status}${cached.has(t.file) ? ' · offline' : ''}</span></button>
        ${stops ? `<button class="more" data-more="${i}" aria-expanded="${cur}" aria-label="Seções de ${esc(t.title)}">${icon.chevronDown(22)}</button>` : '<span></span>'}
      </div>
      ${stops ? `<ol class="stops" ${cur ? '' : 'hidden'}>${stops}</ol>` : ''}
    </li>`;
  });
  view.innerHTML = `
    <header class="line-head">
      <h1>${esc(b.title)}</h1>
      <p class="meta">${Math.round((done / total) * 100)}% ouvido · faltam ${human(total - done)}</p>
    </header>
    <ol class="stations">${html}</ol>`;
  view.querySelector('.stations').onclick = (e) => {
    const more = e.target.closest('[data-more]');
    if (more) {
      const li = more.closest('.st');
      const open = !li.classList.contains('open');
      li.classList.toggle('open', open);
      more.setAttribute('aria-expanded', open);
      $('.stops', li).hidden = !open;
      return;
    }
    const g = e.target.closest('[data-go]');
    if (g) { player.go(Number(g.dataset.go), Number(g.dataset.t)); go('now'); }
  };
  requestAnimationFrame(() => $(`#st-${player.track}`)?.scrollIntoView({ block: 'center' }));
}

// ---------- read-along ----------
const textRefs = {};

function renderText() {
  const tr = player.current;
  let html = '';
  let k = 0;
  tr.sections.forEach((s, si) => {
    if (si > 0) html += `<h2>${esc(s.title)}</h2>`;
    while (k < tr.paras.length && tr.paras[k][1] === si) {
      html += `<p class="para" data-i="${k}">${esc(tr.paras[k][2])}</p>`;
      k++;
    }
  });
  view.innerHTML = `
    <header class="reader-head"><h1>${esc(tr.title)}</h1><p class="meta">Toque num parágrafo para ouvir a partir dele.</p></header>
    <article class="reader" lang="pt-BR"><div class="rail" aria-hidden="true"></div><div class="train" aria-hidden="true"></div>${html}</article>
    <button class="btn btn-primary follow" id="follow" hidden>Voltar ao trecho atual</button>`;
  Object.assign(textRefs, { reader: $('.reader'), train: $('.reader .train'), follow: $('#follow'), idx: -1 });
  state.following = true;
  state.picked = null;
  const stopFollowing = () => { state.following = false; textRefs.follow.hidden = false; };
  view.addEventListener('touchmove', stopFollowing, { passive: true });
  view.addEventListener('wheel', stopFollowing, { passive: true });
  textRefs.follow.onclick = () => { state.following = true; textRefs.follow.hidden = true; updateText(true); };
  textRefs.reader.onclick = (e) => {
    const act = e.target.closest('[data-para-act]');
    if (act) {
      const i = Number(act.dataset.i);
      if (act.dataset.paraAct === 'play') {
        player.unlock();
        player.seek(tr.paras[i][0]);
        if (!player.playing) player.play();
        state.following = true;
        textRefs.follow.hidden = true;
      } else {
        bookmarks.add(player.book.id, { track: player.track, t: tr.paras[i][0] });
        toast('Trecho marcado', 'Ver', () => go('marks'));
      }
      clearPick();
      return;
    }
    const p = e.target.closest('.para');
    if (!p) return;
    const was = state.picked === p.dataset.i;
    clearPick();
    if (was) return;
    state.picked = p.dataset.i;
    p.classList.add('picked');
    p.insertAdjacentHTML('afterend', `<div class="para-go">
      <button class="btn btn-primary" data-para-act="play" data-i="${p.dataset.i}">${icon.play(18)}Ouvir daqui</button>
      <button class="btn btn-ghost" data-para-act="mark" data-i="${p.dataset.i}">${icon.markAdd(18)}Marcar</button></div>`);
  };
  updateText(true);
}

function clearPick() {
  state.picked = null;
  view.querySelectorAll('.para.picked').forEach((p) => p.classList.remove('picked'));
  view.querySelectorAll('.para-go').forEach((d) => d.remove());
}

function updateText(jump = false) {
  const r = textRefs;
  if (!r.reader || !document.body.contains(r.reader)) return;
  const i = player.paraIndex;
  if (i === r.idx && !jump) return;
  r.reader.querySelector('.para.now')?.classList.remove('now');
  const p = r.reader.querySelector(`.para[data-i="${i}"]`);
  r.idx = i;
  if (!p) return;
  p.classList.add('now');
  r.train.style.transform = `translateY(${p.offsetTop + 4}px)`;
  if (state.following) p.scrollIntoView({ block: 'start', behavior: jump ? 'auto' : 'smooth' });
}

// ---------- bookmarks ----------
function renderMarks(focusId) {
  const b = player.book;
  const list = bookmarks.get(b.id);
  if (!list.length) {
    view.innerHTML = `
      <header class="line-head"><h1>Marcadores</h1></header>
      <section class="panel empty-state"><h2>Nenhum marcador ainda</h2>
      <p>Toque em <b>Marcar</b> na tela Ouvindo (ou num parágrafo do Texto) para guardar um trecho. Ele aparece aqui com o capítulo e o minuto, e você pode escrever uma nota.</p></section>`;
    return;
  }
  view.innerHTML = `
    <header class="line-head"><h1>Marcadores</h1><p class="meta">${list.length} ${list.length === 1 ? 'trecho guardado' : 'trechos guardados'}</p></header>
    <ol class="marks">${list.map((m) => {
      const t = b.tracks[m.track];
      const sec = sectionAt(t, m.t);
      return `<li class="panel mark" data-id="${m.id}">
        <div class="where"><strong>${esc(t.title)}</strong><time>${clock(m.t)}</time></div>
        ${sec !== t.sections[0] ? `<div class="sec">${esc(sec.title)}</div>` : ''}
        <textarea rows="1" placeholder="Escrever uma nota…" aria-label="Nota do marcador">${esc(m.note)}</textarea>
        <div class="acts">
          <button class="btn btn-primary" data-act-mark="play">${icon.play(18)}Ouvir</button>
          <button class="icon-btn" data-act-mark="del" aria-label="Apagar marcador">${icon.trash(22)}</button>
        </div></li>`;
    }).join('')}</ol>`;
  const ol = $('.marks');
  ol.oninput = (e) => {
    const ta = e.target.closest('textarea');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    bookmarks.update(b.id, ta.closest('.mark').dataset.id, { note: ta.value });
  };
  ol.onclick = (e) => {
    const a = e.target.closest('[data-act-mark]');
    if (!a) return;
    const id = a.closest('.mark').dataset.id;
    const m = bookmarks.get(b.id).find((x) => x.id === id);
    if (a.dataset.actMark === 'play') {
      player.go(m.track, m.t);
      go('now');
    } else {
      bookmarks.remove(b.id, id);
      renderMarks();
      toast('Marcador apagado', 'Desfazer', () => {
        const { id: _, ...rest } = m;
        bookmarks.add(b.id, rest);
        renderMarks();
      });
    }
  };
  ol.querySelectorAll('textarea').forEach((ta) => { ta.style.height = `${Math.max(44, ta.scrollHeight)}px`; });
  if (focusId) {
    const ta = $(`.mark[data-id="${focusId}"] textarea`);
    ta?.scrollIntoView({ block: 'center' });
    ta?.focus();
  }
}

// ---------- mini player ----------
function renderMini() {
  const show = player.book && ['line', 'text', 'marks'].includes(state.route);
  miniEl.hidden = !show;
  document.body.classList.toggle('has-mini', !!show);
  if (!show) return;
  if (!$('.open', miniEl)) {
    miniEl.innerHTML = `<button class="open" aria-label="Abrir Ouvindo"><strong></strong><span></span></button>
      <button class="pp" aria-label="Tocar"></button><i class="prog"></i>`;
    $('.open', miniEl).onclick = () => go('now');
    $('.pp', miniEl).onclick = () => { player.toggle(); };
  }
  updateMini();
}

function updateMini() {
  if (miniEl.hidden || !player.book) return;
  const tr = player.current;
  const sec = sectionAt(tr, player.time);
  $('strong', miniEl).textContent = tr.title;
  $('span', miniEl).textContent = `${sec === tr.sections[0] ? '' : `${sec.title} · `}${clock(player.time)}`;
  $('.prog', miniEl).style.width = `${(player.time / tr.duration) * 100}%`;
  paintPlay($('.pp', miniEl));
}

// ---------- global wiring ----------
function update() {
  if (state.route === 'now') updateNow();
  if (state.route === 'text') updateText();
  updateMini();
}

view.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a) {
    const s = settings.get();
    ({
      toggle: () => player.toggle(),
      back: () => player.skip(-s.back),
      fwd: () => player.skip(s.fwd),
      prev: () => player.prev(),
      next: () => { player.unlock(); player.next(); },
      speed: speedSheet,
      sleep: sleepSheet,
      eq: eqSheet,
      mark: addMark,
    })[a.dataset.act]?.();
    return;
  }
  const g = e.target.closest('#np-board [data-go]');
  if (g) player.go(Number(g.dataset.go), Number(g.dataset.t));
});

player.addEventListener('time', update);
player.addEventListener('state', update);
player.addEventListener('sleep', (e) => {
  update();
  if (e.detail?.fired) toast('Timer encerrado. Boa noite.');
});
player.addEventListener('track', () => {
  if (['now', 'text', 'line'].includes(state.route)) render();
  else updateMini();
});
player.addEventListener('error', (e) => {
  const msg = navigator.onLine ? (e.detail?.message || 'Não foi possível tocar.') : 'Sem internet e este capítulo não está baixado.';
  if (e.detail?.name !== 'AbortError') toast(msg);
});
player.addEventListener('finished', () => toast('Fim do livro. Parabéns!'));
player.addEventListener('eqinterrupted', (e) => toast(
  `O iPhone pausou o equalizador com a tela bloqueada. Voltei para ${clock(e.detail.t)}, onde o som parou.`,
  'Desligar EQ', () => { player.setEq([...FLAT]); update(); }, 10000));
setInterval(() => { if (player.sleep && state.route === 'now') updateNow(); }, 15000);

window.addEventListener('hashchange', () => {
  const r = location.hash.slice(1);
  if (r && r !== state.route && (r === 'library' || player.book)) { state.route = r; render(); }
});

async function openBook(id) {
  const m = await loadManifest(id);
  setLine(id);
  await player.open(m, state.covers[id]);
  if (!state.cached[id]) refreshCached(m);
  go('now');
}

async function boot() {
  // Offline cache everywhere except plain localhost development (add ?sw to test it there).
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw');
  if ('serviceWorker' in navigator && !dev) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!(await vault.restore())) { state.route = 'unlock'; return render(); }
  try {
    state.library = await vault.json('index.enc');
  } catch (e) {
    if (e.name === 'OperationError') { vault.forget(); state.route = 'unlock'; return renderUnlock('A senha da biblioteca mudou. Digite a nova.'); }
    state.route = 'unlock';
    return renderUnlock('Sem conexão para abrir a biblioteca. Tente de novo com internet.');
  }
  const books = state.library.books;
  const want = location.hash.slice(1);
  const last = books.find((b) => b.id === position.last()) || (books.length === 1 ? books[0] : null);
  if (want === 'library' || !last) { state.route = 'library'; return render(); }
  await openBook(last.id);
  if (['line', 'text', 'marks'].includes(want)) go(want);
}

boot();
