// Playback engine: one <audio> element, decrypted chapter blobs, Media Session, sleep timer, resume, EQ.
import * as vault from './vault.js';
import { heard, position, settings } from './store.js';
import { Equalizer, FLAT, isFlat } from './eq.js';

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
    this.book = null;
    this.track = 0;
    this.urls = new Map(); // track index -> Promise<objectURL>
    this.loading = false;
    this.unlocked = false;
    this.pausedAt = 0;
    this.sleep = null; // { kind: 'time', until } | { kind: 'track' }
    this.lastSave = 0;
    this.coverUrl = null;
    this.eq = null; // Equalizer while a non-flat EQ is in use
    this.eqGains = settings.get().eq || FLAT;

    this.bind(new Audio());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
    this.mediaSession();
  }

  /** Attach listeners to an <audio> element; events from a replaced element are ignored. */
  bind(a) {
    this.audio = a;
    a.preload = 'auto';
    const on = (type, fn) => a.addEventListener(type, (e) => { if (a === this.audio) fn(e); });
    on('play', () => this.emit('state'));
    on('pause', () => { this.pausedAt = Date.now(); this.save(); this.emit('state'); });
    on('waiting', () => this.emit('state'));
    on('playing', () => this.emit('state'));
    on('timeupdate', () => this.onTime());
    on('ended', () => this.onEnded());
    on('ratechange', () => this.updatePositionState());
  }

  // ---- Equalizer ----
  // WebKit garbles audio (repeats, skips, ignores the new rate) when a Web Audio–routed element plays
  // at a rate other than 1 (bugs 240405, 221334), so the EQ only runs at 1,0×; settings are kept.
  get eqActive() { return !isFlat(this.eqGains) && settings.get().rate === 1; }

  setEq(gains) {
    this.eqGains = gains;
    settings.set({ eq: gains });
    if (!this.eqActive) {
      if (this.eq) this.swapElement();
      return;
    }
    if (!this.eq && !document.hidden) this.attachEq();
    this.eq?.set(gains);
    this.eq?.resume().catch(() => {});
  }

  /** Synchronously inside a tap: build the graph and wake the AudioContext (iOS needs the gesture). */
  prepareEq() {
    if (!this.eqActive || document.hidden) return;
    if (!this.eq) this.attachEq();
    this.eq.resume().catch(() => {});
  }

  attachEq() {
    this.eq = new Equalizer(this.audio);
    this.eq.set(this.eqGains);
    this.eq.ctx.onstatechange = () => {
      if (!this.eq || this.eq.running || !this.playing) return;
      if (document.hidden) {
        // iOS suspended the EQ with the screen locked: stop rather than let the book run on silently.
        this.eqStopped = true;
        this.audio.pause();
      } else {
        this.eq.resume().catch(() => {});
      }
    };
  }

  /** Back to the plain element path (a routed element can't be un-routed). Runs inside the tap. */
  swapElement() {
    const old = this.audio;
    const { src, currentTime: t } = old;
    const wasPlaying = this.playing;
    const eq = this.eq;
    this.eq = null;
    this.bind(new Audio());
    old.pause();
    eq.close();
    const a = this.audio;
    a.defaultPlaybackRate = a.playbackRate = settings.get().rate;
    if (src) {
      a.src = src;
      if (src !== SILENCE) {
        a.muted = wasPlaying; // started inside the tap for iOS; unmuted once it's at the right spot
        a.addEventListener('loadedmetadata', () => {
          a.playbackRate = settings.get().rate;
          if (t > 0.1) a.currentTime = t;
          else a.muted = false;
        }, { once: true });
        a.addEventListener('seeked', () => { a.muted = false; }, { once: true });
      }
      if (wasPlaying) a.play().catch((e) => this.emit('error', e));
    }
    this.emit('state');
  }

  onVisibility() {
    if (document.hidden) {
      // AudioContext time only advances while sound flows: compare it with the element later.
      this.hideMark = this.eq && this.playing
        ? { track: this.track, el: this.audio.currentTime, ctx: this.eq.ctx.currentTime, rate: this.audio.playbackRate }
        : null;
      this.save();
      return;
    }
    const mark = this.hideMark;
    this.hideMark = null;
    if (!this.eq) return;
    // Where the sound really stopped (the AudioContext clock freezes while suspended).
    const heardUntil = mark ? mark.el + (this.eq.ctx.currentTime - mark.ctx) * mark.rate : null;
    this.eq.resume().catch(() => {});
    // WebKit sometimes resumes the context a moment after unlock: judge after a short wait.
    setTimeout(() => {
      if (!this.eq) return;
      let t = this.audio.currentTime;
      let lost = this.eqStopped;
      if (heardUntil != null && t - heardUntil > 3) { lost = true; t = heardUntil; }
      if (!this.eq.running && this.playing) lost = true; // "playing" but no sound reaches the speaker
      if (!lost) return;
      this.eqStopped = false;
      this.pause();
      this.seek(t);
      this.emit('eqinterrupted', { t });
    }, 400);
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
    this.hideMark = null;
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
    this.prepareEq(); // before the first await: resuming the AudioContext needs the tap
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
    const to = Math.max(0, Math.min(t, this.duration - 0.5));
    if (this.hideMark) this.hideMark.el += to - this.audio.currentTime;
    this.audio.currentTime = to;
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
    if (this.eq && !this.eqActive) {
      this.swapElement(); // leave the Web Audio path before changing speed (runs inside the tap)
    } else {
      this.audio.playbackRate = rate;
      if (this.eqActive && !this.eq && !document.hidden) {
        this.attachEq();
        this.eq.resume().catch(() => {});
      }
    }
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
