// Speech equalizer on Web Audio. The graph exists only while a non-flat setting is in use: once an
// <audio> element is routed through an AudioContext it can't be un-routed, and on iOS the routed
// sound depends on the AudioContext surviving screen lock — so "Plano" keeps the plain element path.

export const BANDS = [
  { type: 'lowshelf', freq: 120, label: 'Graves', hz: '120' },
  { type: 'peaking', freq: 400, q: 1, label: 'Corpo', hz: '400' },
  { type: 'peaking', freq: 1200, q: 1, label: 'Médios', hz: '1,2k' },
  { type: 'peaking', freq: 3200, q: 1, label: 'Presença', hz: '3,2k' },
  { type: 'highshelf', freq: 8000, label: 'Brilho', hz: '8k' },
];
export const RANGE = 12; // dB, each direction

export const PRESETS = [
  { id: 'flat', label: 'Plano', gains: [0, 0, 0, 0, 0] },
  { id: 'clear', label: 'Voz clara', gains: [-3, -1, 0, 4, 2] },
  { id: 'car', label: 'Carro', gains: [-5, -2, 2, 5, 3] },
  { id: 'warm', label: 'Quente', gains: [4, 2, 0, -1, -2] },
  { id: 'soft', label: 'Suave', gains: [1, 0, -1, -3, -5] },
];

export const FLAT = PRESETS[0].gains;
export const isFlat = (gains) => gains.every((g) => g === 0);
export const presetOf = (gains) => PRESETS.find((p) => p.gains.every((g, i) => g === gains[i]))?.id || 'custom';

export class Equalizer {
  constructor(audio) {
    // iOS: a "playback" audio session lets the AudioContext keep running with the screen locked.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'playback' });
    this.source = this.ctx.createMediaElementSource(audio);
    this.pre = this.ctx.createGain();
    this.filters = BANDS.map((b) => {
      const f = this.ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      if (b.q) f.Q.value = b.q;
      return f;
    });
    // Safety limiter so boosted bands can't clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    [this.source, this.pre, ...this.filters, limiter, this.ctx.destination].reduce((a, b) => { a.connect(b); return b; });
  }

  set(gains) {
    const t = this.ctx.currentTime;
    gains.forEach((g, i) => this.filters[i].gain.setTargetAtTime(g, t, 0.04));
    // Pull the input down by part of the largest boost; the limiter catches the rest.
    const boost = Math.max(0, ...gains);
    this.pre.gain.setTargetAtTime(10 ** ((-0.6 * boost) / 20), t, 0.04);
  }

  get running() { return this.ctx.state === 'running'; }

  resume() { return this.running ? Promise.resolve() : this.ctx.resume(); }

  close() { this.ctx.close().catch(() => {}); }
}
