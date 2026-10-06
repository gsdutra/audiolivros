// Playback engine: one <audio> element, decrypted chapter blobs, Media Session, sleep timer, resume.
import * as vault from './vault.js';
import { heard, position, settings } from './store.js';

// 0.1 s of silence: playing it inside the first tap "activates" the element for later async play() calls on iOS.
const SILENCE = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';

const bisect = (arr, t, at = (x) => x) => {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (at(arr[mid]) <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
};

export class Player extends EventTarget {
  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.book = null;
    this.track = 0;
    this.urls = new Map(); // track index -> Promise<objectURL>
    this.loading = false;
    this.unlocked = false;
    this.pausedAt = 0;
    this.sleep = null; // { kind: 'time', until } | { kind: 'track' }
    this.lastSave = 0;
    this.coverUrl = null;

    const a = this.audio;
    a.addEventListener('play', () => this.emit('state'));
    a.addEventListener('pause', () => { this.pausedAt = Date.now(); this.save(); this.emit('state'); });
    a.addEventListener('waiting', () => this.emit('state'));
    a.addEventListener('playing', () => this.emit('state'));
    a.addEventListener('timeupdate', () => this.onTime());
    a.addEventListener('ended', () => this.onEnded());
    a.addEventListener('ratechange', () => this.updatePositionState());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    window.addEventListener('pagehide', () => this.save());
    this.mediaSession();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  get playing() { return !this.audio.paused && !this.audio.ended; }
  get time() { return this.audio.currentTime || this.pendingTime || 0; }
  get current() { return this.book?.tracks[this.track]; }
  get duration() { return this.current?.duration || 0; }
  get sectionIndex() { return this.current ? bisect(this.current.sections, this.time, (s) => s.t) : 0; }
  get paraIndex() { return this.current?.paras.length ? bisect(this.current.paras, this.time, (p) => p[0]) : -1; }
  /** Seconds into the whole book. */
  get bookTime() {
    return this.book ? this.book.tracks.slice(0, this.track).reduce((s, t) => s + t.duration, 0) + this.time : 0;
  }

  async open(book, coverUrl) {
    this.book = book;
    this.coverUrl = coverUrl;
    position.setLast(book.id);
    const saved = position.get(book.id);
    const track = saved ? Math.min(saved.track, book.tracks.length - 1) : 0;
    await this.load(track, saved ? saved.t : 0, false);
  }

  url(i) {
    if (!this.urls.has(i)) {
      const t = this.book.tracks[i];
      const p = vault.blob(`${this.book.id}/${t.file}`, 'audio/mp4').then((b) => URL.createObjectURL(b));
      p.catch(() => this.urls.delete(i));
      this.urls.set(i, p);
    }
    return this.urls.get(i);
  }

  /** Keep only the current and next chapter decrypted in memory. */
  trim() {
    for (const [i, p] of this.urls) {
      if (i !== this.track && i !== this.track + 1) {
        p.then((u) => URL.revokeObjectURL(u));
        this.urls.delete(i);
      }
    }
  }

  async load(i, t = 0, autoplay = true) {
    if (!this.book || i < 0 || i >= this.book.tracks.length) return;
    const same = i === this.track && this.audio.src && this.urls.has(i);
    this.track = i;
    this.pendingTime = t;
    this.emit('track');
    if (same) {
      this.audio.currentTime = t;
      this.pendingTime = null;
      if (autoplay) await this.play();
      return;
    }
    this.loading = true;
    this.emit('state');
    try {
      const url = await this.url(i);
      if (this.track !== i) return; // user moved on while decrypting
      this.audio.src = url;
      await new Promise((res, rej) => {
        this.audio.addEventListener('loadedmetadata', res, { once: true });
        this.audio.addEventListener('error', () => rej(new Error('Não foi possível abrir o áudio')), { once: true });
      });
      this.audio.currentTime = Math.min(t, Math.max(0, this.duration - 1));
      this.audio.playbackRate = settings.get().rate;
      this.pendingTime = null;
      this.loading = false;
      this.trim();
      this.updateMetadata();
      this.save();
      if (autoplay) await this.play();
    } catch (e) {
      this.loading = false;
      this.emit('error', e);
    }
    this.emit('state');
    // Decrypt the next chapter ahead so auto-advance works with the screen locked.
    setTimeout(() => { if (this.book && this.track + 1 < this.book.tracks.length) this.url(this.track + 1); }, 4000);
  }

  /** Call synchronously from a tap before any await, so iOS lets later async play() through. */
  unlock() {
    if (this.unlocked || this.audio.src) { this.unlocked = true; return; }
    this.audio.src = SILENCE;
    this.audio.play().catch(() => {});
    this.unlocked = true;
  }

  async play() {
    if (!this.book) return;
    if (this.loading || !this.audio.src || this.audio.src === SILENCE) {
      await this.load(this.track, this.time, false);
    }
    // Rewind a little after a long pause so the sentence context comes back.
    const idle = this.pausedAt ? Date.now() - this.pausedAt : 0;
    if (idle > 5 * 60e3) this.audio.currentTime = Math.max(0, this.audio.currentTime - 5);
    else if (idle > 30e3) this.audio.currentTime = Math.max(0, this.audio.currentTime - 2);
    this.pausedAt = 0;
    this.audio.playbackRate = settings.get().rate;
    try {
      await this.audio.play();
    } catch (e) {
      this.emit('error', e);
    }
  }

  pause() { this.audio.pause(); }

  toggle() {
    this.unlock();
    return this.playing ? this.pause() : this.play();
  }

  seek(t) {
    if (this.pendingTime != null) { this.pendingTime = Math.max(0, t); this.emit('time'); return; }
    this.audio.currentTime = Math.max(0, Math.min(t, this.duration - 0.5));
    this.onTime(true);
  }

  skip(delta) {
    const t = this.time + delta;
    if (t < 0 && this.track > 0) {
      const prev = this.book.tracks[this.track - 1];
      return this.load(this.track - 1, Math.max(0, prev.duration + t), this.playing);
    }
    if (t > this.duration && this.track + 1 < this.book.tracks.length) {
      return this.load(this.track + 1, t - this.duration, this.playing);
    }
    this.seek(t);
  }

  next() { return this.load(this.track + 1, 0, this.playing || this.unlocked); }

  prev() {
    if (this.time > 4 || this.track === 0) return this.seek(0);
    return this.load(this.track - 1, 0, this.playing);
  }

  go(track, t = 0) {
    this.unlock();
    return this.load(track, t, true);
  }

  setRate(rate) {
    settings.set({ rate });
    this.audio.playbackRate = rate;
    this.emit('state');
  }

  setSleep(kind, minutes) {
    this.sleep = kind === 'time' ? { kind, until: Date.now() + minutes * 60e3 }
      : kind === 'track' ? { kind } : null;
    this.emit('sleep');
  }

  sleepRemaining() {
    return this.sleep?.kind === 'time' ? Math.max(0, this.sleep.until - Date.now()) : null;
  }

  onTime(force = false) {
    const now = Date.now();
    if (this.sleep?.kind === 'time' && now >= this.sleep.until) {
      this.sleep = null;
      this.pause();
      this.emit('sleep', { fired: true });
    }
    if (force || now - this.lastSave > 5000) this.save();
    this.emit('time');
  }

  onEnded() {
    heard.bump(this.book.id, this.track, this.duration);
    if (this.sleep?.kind === 'track') {
      this.sleep = null;
      this.emit('sleep', { fired: true });
      this.load(this.track + 1, 0, false);
      return;
    }
    if (this.track + 1 < this.book.tracks.length) this.load(this.track + 1, 0, true);
    else this.emit('finished');
  }

  save() {
    if (!this.book || this.loading) return;
    this.lastSave = Date.now();
    position.set(this.book.id, this.track, this.time);
    heard.bump(this.book.id, this.track, this.time);
    this.updatePositionState();
  }

  // ---- Lock screen / AirPods ----
  mediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (e) { /* unsupported */ } };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('seekbackward', (d) => this.skip(-(d.seekOffset || settings.get().back)));
    set('seekforward', (d) => this.skip(d.seekOffset || settings.get().fwd));
    set('seekto', (d) => this.seek(d.seekTime));
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    this.addEventListener('time', () => {
      const s = this.sectionIndex;
      if (s !== this.metaSection) this.updateMetadata();
    });
  }

  updateMetadata() {
    if (!('mediaSession' in navigator) || !this.current || typeof MediaMetadata === 'undefined') return;
    this.metaSection = this.sectionIndex;
    const sec = this.current.sections[this.metaSection];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: sec && this.metaSection > 0 ? sec.title : this.current.title,
      artist: this.metaSection > 0 ? `${this.current.title} · ${this.book.author}` : this.book.author,
      album: this.book.title,
      artwork: this.coverUrl ? [{ src: this.coverUrl, sizes: '600x900', type: 'image/jpeg' }] : [],
    });
  }

  updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !this.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: this.duration,
        playbackRate: this.audio.playbackRate || 1,
        position: Math.min(this.time, this.duration),
      });
    } catch (e) { /* position may briefly exceed duration while seeking */ }
  }
}
