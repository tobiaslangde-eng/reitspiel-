// Synthetische Geräusche (WebAudio): Hufschlag, Wiehern, Wind, Signale
export class Audio {
  constructor() { this.ctx = null; this.on = true; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate, b = this.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      // Wind
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      this.wind = this.ctx.createGain(); this.wind.gain.value = 0.03; s.connect(f); f.connect(this.wind); this.wind.connect(this.master); s.start();
    } catch (_) { this.ctx = null; }
  }
  setMute(m) { this.on = !m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  setWind(v) { if (this.wind) this.wind.gain.value = 0.025 + Math.min(0.12, v * 0.007); }
  burst(freq, dur, vol, type = 'lowpass', q = 1) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5, dur + 0.02);
  }
  hoof(vol = 0.3, hard = false) { this.burst(hard ? 1500 : 240 + Math.random() * 80, hard ? 0.05 : 0.09, vol * (hard ? 0.7 : 1.3), hard ? 'bandpass' : 'lowpass', hard ? 3 : 1); }
  thud(vol = 0.6) { this.burst(120, 0.22, vol); }
  splash() { this.burst(2600, 0.3, 0.25, 'bandpass', 0.7); }
  tone(f, dur, vol = 0.15, type = 'sine', when = 0, slide = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  click() { this.tone(660, 0.06, 0.08, 'triangle'); }
  beep(hi) { this.tone(hi ? 880 : 440, hi ? 0.5 : 0.18, 0.18, 'square'); }
  fault() { this.tone(180, 0.35, 0.2, 'sawtooth', 0, 90); }
  good() { this.tone(660, 0.12, 0.14, 'triangle'); this.tone(990, 0.2, 0.14, 'triangle', 0.1); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 0.16, 'triangle', i * 0.14)); }
  cash() { this.tone(1200, 0.08, 0.12, 'square'); this.tone(1600, 0.2, 0.12, 'square', 0.07); }
  whinny() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(), l = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1500, t + 0.18); o.frequency.exponentialRampToValueAtTime(380, t + 1.1);
    l.frequency.value = 13; lg.gain.value = 110; l.connect(lg); lg.connect(o.frequency);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); l.start(t); o.stop(t + 1.2); l.stop(t + 1.2);
  }
  whistle() { this.tone(1400, 0.35, 0.12, 'sine', 0, 2400); }
}
