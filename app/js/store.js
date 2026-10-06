// Per-device listening state in localStorage. Every access is guarded: storage can be blocked or full.

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore: state is best-effort */ }
};

export const settings = {
  get: () => ({ rate: 1, back: 15, fwd: 30, ...read('audiolivros:settings', {}) }),
  set: (patch) => write('audiolivros:settings', { ...settings.get(), ...patch }),
};

/** Where the listener is in a book: { track, t, at } (track index, seconds, timestamp). */
export const position = {
  get: (book) => read(`audiolivros:pos:${book}`, null),
  set: (book, track, t) => write(`audiolivros:pos:${book}`, { track, t: Math.round(t * 10) / 10, at: Date.now() }),
  last: () => read('audiolivros:lastBook', null),
  setLast: (book) => write('audiolivros:lastBook', book),
};

/** Furthest point heard per track, for chapter progress. { [trackIndex]: seconds } */
export const heard = {
  get: (book) => read(`audiolivros:heard:${book}`, {}),
  bump: (book, track, t) => {
    const h = heard.get(book);
    if (!(h[track] >= t)) {
      h[track] = Math.round(t);
      write(`audiolivros:heard:${book}`, h);
    }
  },
};

/** Bookmarks: [{ id, track, t, note, at }] */
export const bookmarks = {
  get: (book) => read(`audiolivros:bm:${book}`, []),
  add: (book, mark) => {
    const list = bookmarks.get(book);
    const item = { id: Date.now().toString(36), at: Date.now(), note: '', ...mark };
    write(`audiolivros:bm:${book}`, [...list, item].sort((a, b) => a.track - b.track || a.t - b.t));
    return item;
  },
  update: (book, id, patch) =>
    write(`audiolivros:bm:${book}`, bookmarks.get(book).map((m) => (m.id === id ? { ...m, ...patch } : m))),
  remove: (book, id) => write(`audiolivros:bm:${book}`, bookmarks.get(book).filter((m) => m.id !== id)),
};
