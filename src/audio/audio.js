// Procedural audio: country guitar music, horse sounds, ambience. No sample files needed.
const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64, 67],
  D: [50, 57, 62, 66, 69],
  Em: [40, 47, 52, 55, 59, 64],
  Am: [45, 52, 57, 60, 64, 69],
  Bm: [47, 54, 59, 62, 66],
  A7: [45, 52, 55, 61, 64],
};
const SONGS = {
  day: { bpm: 96, prog: ['G', 'G', 'C', 'G', 'D', 'D', 'G', 'G', 'Em', 'C', 'G', 'D', 'G', 'C', 'D', 'G'], scale: [67, 69, 71, 74, 76, 79, 81, 83] },
  evening: { bpm: 74, prog: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'D', 'C', 'G', 'Am', 'Em', 'C', 'D', 'Em', 'Em'], scale: [64, 67, 69, 71, 74, 76, 79] },
  rodeo: { bpm: 128, prog: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G', 'C', 'C', 'G', 'G', 'A7', 'A7', 'D', 'D'], scale: [67, 69, 71, 74, 76, 79, 81] },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.listener = { x: 0, y: 0, z: 0 };
    this.ksCache = new Map();
    this.mood = 'day';
    this.bar = 0;
    this.step = 0;
    this.nextTime = 0;
    this.melodyOn = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol * 0.55; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = this.sfxVol * 0.8; this.ambBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.5);
    const rv = ctx.createGain(); rv.gain.value = 0.35;
    this.reverb.connect(rv).connect(this.master);
    this.musicRev = ctx.createGain(); this.musicRev.gain.value = 0.4; this.musicRev.connect(this.reverb);
    this.musicBus.connect(this.musicRev);
    this.noiseBuf = this.makeNoise(2);
    this.brownBuf = this.makeBrown(4);
    this.startAmbience();
    this.enabled = true;
    this.nextTime = ctx.currentTime + 0.2;
    this.schedTimer = setInterval(() => this.schedule(), 40);
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.2);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.2);
    this.ambBus.gain.setTargetAtTime(sfx * 0.8, this.ctx.currentTime, 0.2);
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  makeNoise(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  makeBrown(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }

  // ------------------------------------------------------------- helpers
  noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, buf, freqEnd, out } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf || this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || this.sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
    return g;
  }
  tone(t, dur, { type = 'sine', freq = 440, freqEnd, gain = 0.3, attack = 0.005, out } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  distGain(pos, ref = 6, max = 80) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    if (d > max) return 0;
    return Math.min(1, ref / Math.max(ref, d));
  }
  ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  // ------------------------------------------------------------- horse sfx
  hoof(surface, intensity = 1, pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos, 5, 60) * intensity;
    if (v < 0.02) return;
    const t = this.ctx.currentTime + Math.random() * 0.01;
    switch (surface) {
      case 'water':
        this.noise(t, 0.28, { freq: 1400, q: 0.7, gain: 0.35 * v, freqEnd: 600 });
        this.noise(t + 0.04, 0.15, { freq: 3200, q: 2, gain: 0.12 * v });
        break;
      case 'rock':
        this.tone(t, 0.05, { freq: 1700, freqEnd: 900, gain: 0.18 * v, type: 'triangle' });
        this.noise(t, 0.05, { freq: 2600, q: 3, gain: 0.25 * v });
        this.tone(t, 0.09, { freq: 120, freqEnd: 60, gain: 0.3 * v });
        break;
      case 'wood':
        this.tone(t, 0.12, { freq: 380, freqEnd: 260, gain: 0.35 * v, type: 'triangle' });
        this.noise(t, 0.06, { freq: 900, q: 4, gain: 0.25 * v });
        break;
      case 'snow':
        this.noise(t, 0.12, { freq: 3500, q: 0.8, gain: 0.18 * v, type: 'highpass' });
        this.tone(t, 0.08, { freq: 90, freqEnd: 50, gain: 0.25 * v });
        break;
      case 'sand':
        this.noise(t, 0.1, { freq: 900, q: 0.8, gain: 0.3 * v, type: 'lowpass' });
        this.tone(t, 0.1, { freq: 95, freqEnd: 45, gain: 0.45 * v });
        break;
      default: // grass / dirt
        this.noise(t, 0.07, { freq: 600, q: 0.9, gain: 0.25 * v, type: 'lowpass' });
        this.tone(t, 0.11, { freq: 85, freqEnd: 42, gain: 0.5 * v });
    }
  }

  whinny(horse, pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos || horse?.pos, 8, 150);
    if (v < 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const size = horse ? horse.scale || 1 : 1;
    const base = 700 / Math.sqrt(size);
    const dur = 1.5;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    o.frequency.setValueAtTime(base * 1.1, t);
    o.frequency.linearRampToValueAtTime(base * 1.75, t + 0.18);
    o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur);
    o2.frequency.setValueAtTime(base * 0.55, t);
    o2.frequency.linearRampToValueAtTime(base * 0.87, t + 0.18);
    o2.frequency.exponentialRampToValueAtTime(base * 0.28, t + dur);
    // vibrato / whinny tremble
    const lfo = ctx.createOscillator(); lfo.frequency.value = 17;
    const lg = ctx.createGain(); lg.gain.value = base * 0.09;
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const trem = ctx.createGain();
    const tl = ctx.createOscillator(); tl.frequency.value = 22;
    const tg = ctx.createGain(); tg.gain.value = 0.35;
    tl.connect(tg).connect(trem.gain);
    trem.gain.value = 0.65;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2400; f2.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.06);
    g.gain.setValueAtTime(0.5 * v, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = ctx.createGain(); mix.gain.value = 0.7;
    o.connect(mix); o2.connect(mix);
    mix.connect(f1); mix.connect(f2);
    f1.connect(trem); f2.connect(trem);
    trem.connect(g);
    g.connect(this.sfxBus); g.connect(this.reverb);
    [o, o2, lfo, tl].forEach((x) => { x.start(t); x.stop(t + dur + 0.1); });
    // breathy snort at the end
    this.noise(t + dur - 0.2, 0.5, { freq: 500, q: 1.2, gain: 0.15 * v });
  }

  snort(horse, pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos || horse?.pos, 6, 60);
    if (v < 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = this.noise(t, 0.7, { freq: 700, q: 1.5, gain: 0.45 * v, freqEnd: 300, attack: 0.03 });
    // nostril flutter
    const lfo = ctx.createOscillator(); lfo.frequency.value = 32;
    const lg = ctx.createGain(); lg.gain.value = 0.25 * v;
    lfo.connect(lg).connect(g.gain);
    lfo.start(t); lfo.stop(t + 0.7);
  }

  blow(pos) { // soft breath
    if (!this.ok()) return;
    const v = this.distGain(pos, 4, 30);
    this.noise(this.ctx.currentTime, 0.9, { freq: 400, q: 0.6, gain: 0.15 * v, type: 'lowpass', attack: 0.2 });
  }

  whistle() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.35, { freq: 1500, freqEnd: 2500, gain: 0.25 });
    this.tone(t + 0.4, 0.55, { freq: 2600, freqEnd: 1700, gain: 0.25 });
  }

  thunder(delay = 0, near = false) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    if (near) this.noise(t, 0.4, { freq: 2000, type: 'highpass', gain: 0.6 });
    this.noise(t, 4.5, { freq: 140, type: 'lowpass', q: 0.7, gain: near ? 1.0 : 0.6, buf: this.brownBuf, attack: 0.08 });
    this.noise(t + 0.3, 3, { freq: 80, type: 'lowpass', gain: 0.5, buf: this.brownBuf, attack: 0.3 });
  }

  moo(pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos, 8, 90); if (v < 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(140, t + 0.3); o.frequency.linearRampToValueAtTime(95, t + 1.3);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(900, t + 0.5); f.frequency.linearRampToValueAtTime(350, t + 1.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f).connect(g).connect(this.sfxBus); g.connect(this.reverb);
    o.start(t); o.stop(t + 1.5);
  }
  cluck(pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos, 4, 30); if (v < 0.02) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.12, 0.07, { type: 'square', freq: 600 + Math.random() * 200, freqEnd: 400, gain: 0.08 * v });
  }
  bark(pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos, 5, 60); if (v < 0.02) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      this.tone(t + i * 0.25, 0.12, { type: 'sawtooth', freq: 420, freqEnd: 260, gain: 0.2 * v });
      this.noise(t + i * 0.25, 0.1, { freq: 900, q: 1.5, gain: 0.2 * v });
    }
  }
  meow(pos) {
    if (!this.ok()) return;
    const v = this.distGain(pos, 3, 20); if (v < 0.02) return;
    const t = this.ctx.currentTime;
    const o = this.tone(t, 0.6, { type: 'triangle', freq: 700, gain: 0.12 * v, attack: 0.08 });
    o.frequency.linearRampToValueAtTime(950, t + 0.25); o.frequency.linearRampToValueAtTime(600, t + 0.6);
  }
  footstep(water) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    if (water) this.noise(t, 0.2, { freq: 1200, gain: 0.12 });
    else this.noise(t, 0.06, { freq: 700, type: 'lowpass', gain: 0.12 });
  }
  swish() {
    if (!this.ok()) return;
    this.noise(this.ctx.currentTime, 0.35, { freq: 600, freqEnd: 2400, q: 2, gain: 0.2 });
  }
  dig() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.noise(t + i * 0.3, 0.15, { freq: 500, type: 'lowpass', gain: 0.3 });
  }
  brush() {
    if (!this.ok()) return;
    this.noise(this.ctx.currentTime, 0.18, { freq: 4000, q: 0.6, gain: 0.08, type: 'highpass' });
  }
  crunch() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noise(t + i * 0.13, 0.07, { freq: 2500, q: 1, gain: 0.12 });
  }
  slurp() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.noise(t + i * 0.22, 0.15, { freq: 500 + i * 60, q: 3, gain: 0.12 });
  }

  // ------------------------------------------------------------- ui sfx
  coin() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.12, { type: 'square', freq: 988, gain: 0.08 });
    this.tone(t + 0.08, 0.35, { type: 'square', freq: 1319, gain: 0.08 });
  }
  click() { if (this.ok()) this.tone(this.ctx.currentTime, 0.05, { type: 'triangle', freq: 900, gain: 0.08 }); }
  fanfare() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [67, 71, 74, 79].forEach((m, i) => this.pluck(m, t + i * 0.12, 0.5, this.sfxBus));
    this.pluck(79, t + 0.5, 0.6, this.sfxBus); this.pluck(83, t + 0.5, 0.5, this.sfxBus);
  }
  fail() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [62, 61, 60].forEach((m, i) => this.pluck(m, t + i * 0.2, 0.5, this.sfxBus));
  }
  bell() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.5, 1.2, { freq: 880, gain: 0.15 });
  }

  // ------------------------------------------------------------- Karplus-Strong guitar
  ksBuffer(midi, bright = 0.5) {
    const key = midi + ':' + bright;
    if (this.ksCache.has(key)) return this.ksCache.get(key);
    const sr = this.ctx.sampleRate;
    const f = midiFreq(midi);
    const len = Math.floor(sr * (midi < 50 ? 2.6 : 2.0));
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    const ring = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = prev + (r - prev) * (0.3 + bright * 0.6); ring[i] = prev; }
    let idx = 0;
    const damp = midi < 50 ? 0.9985 : 0.997;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % N];
      const v = (a + b) * 0.5 * damp;
      ring[idx] = v;
      d[i] = a;
      idx = (idx + 1) % N;
    }
    // soft attack click removal
    for (let i = 0; i < 40; i++) d[i] *= i / 40;
    this.ksCache.set(key, buf);
    return buf;
  }

  pluck(midi, t, gain = 0.3, out, bright = 0.5, pan = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.ksBuffer(midi, bright);
    const g = this.ctx.createGain(); g.gain.value = gain;
    let node = src.connect(g);
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(out || this.musicBus);
    src.start(t);
    src.stop(t + src.buffer.duration);
  }

  harmonica(midi, t, dur, gain = 0.07) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiFreq(midi);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = midiFreq(midi) * 1.002;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = midiFreq(midi) * 0.012;
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g).connect(this.musicBus);
    [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
  }

  setMood(m) { if (SONGS[m] && m !== this.mood) { this.mood = m; this.bar = 0; this.step = 0; } }

  schedule() {
    if (!this.ok()) return;
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.nextTime);
      const song = SONGS[this.mood];
      const spb = 60 / song.bpm;
      // swing feel on off-beats
      const swing = this.step % 2 === 0 ? 1.12 : 0.88;
      this.nextTime += (spb / 2) * swing;
      this.step++;
      if (this.step >= 8) {
        this.step = 0; this.bar++;
        if (this.bar % song.prog.length === 0) this.melodyOn = Math.random() < 0.6;
      }
    }
  }

  playStep(t) {
    if (this.musicVol <= 0.001) return;
    const song = SONGS[this.mood];
    const chordName = song.prog[this.bar % song.prog.length];
    const ch = CHORDS[chordName];
    const s = this.step;
    const evening = this.mood === 'evening';
    const v = evening ? 0.22 : 0.26;
    // Travis picking: alternating bass with the thumb, melody notes on top
    const bassA = ch[0], bassB = ch[Math.min(2, ch.length - 1)];
    if (s === 0 || s === 4) this.pluck(bassA, t, v * 1.15, null, 0.35, -0.2);
    if (s === 2 || s === 6) this.pluck(bassB, t, v, null, 0.35, -0.2);
    if (!evening || s % 2 === 1) {
      if (s === 1 || s === 5) this.pluck(ch[ch.length - 1], t, v * 0.8, null, 0.6, 0.2);
      if (s === 3 || s === 7) this.pluck(ch[ch.length - 2], t, v * 0.75, null, 0.6, 0.2);
      if (s === 0) this.pluck(ch[ch.length - 1], t + 0.01, v * 0.6, null, 0.6, 0.25);
    }
    // upright bass
    if (s === 0) this.pluck(ch[0] - 12 >= 28 ? ch[0] - 12 : ch[0], t, v * 1.2, null, 0.15, 0);
    // shaker
    if (!evening && this.ctx) this.noise(t, 0.05, { freq: 7000, type: 'highpass', gain: s % 2 ? 0.02 : 0.035, out: this.musicBus });
    // lead melody
    if (this.melodyOn && (s % 2 === 0 || Math.random() < 0.3) && Math.random() < 0.55) {
      const sc = song.scale;
      const chordTones = ch.map((n) => n % 12);
      let note = sc[Math.floor(Math.random() * sc.length)];
      if (s === 0) { const ct = sc.filter((n) => chordTones.includes(n % 12)); if (ct.length) note = ct[Math.floor(Math.random() * ct.length)]; }
      const dur = (60 / song.bpm) * (s === 0 ? 1.5 : 0.6);
      if (this.mood === 'evening') this.harmonica(note - 12, t, dur * 1.4, 0.05);
      else this.harmonica(note, t, dur, 0.05);
    }
  }

  // ------------------------------------------------------------- ambience
  startAmbience() {
    const ctx = this.ctx;
    const loop = (buf, type, freq, q = 0.7) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambBus);
      src.start();
      return { g, f };
    };
    this.amb = {
      rain: loop(this.noiseBuf, 'lowpass', 2500),
      wind: loop(this.brownBuf, 'bandpass', 400, 0.6),
      river: loop(this.noiseBuf, 'lowpass', 900),
      fire: loop(this.brownBuf, 'lowpass', 300),
    };
    this.birdT = 2; this.cricketT = 0; this.crackleT = 0;
  }

  updateAmbience(dt, s) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const set = (k, v, tc = 0.5) => this.amb[k].g.gain.setTargetAtTime(v, t, tc);
    set('rain', s.rain * 0.4);
    set('wind', 0.08 + s.wind * 0.35 + s.dust * 0.3);
    this.amb.wind.f.frequency.setTargetAtTime(300 + s.wind * 500 + Math.sin(t * 0.3) * 120, t, 0.8);
    set('river', s.water * 0.35);
    this.amb.river.f.frequency.setTargetAtTime(700 + s.waterfall * 1500, t, 0.5);
    set('fire', s.fire * 0.25);
    // birds by day
    this.birdT -= dt;
    if (this.birdT < 0 && s.day > 0.5 && s.rain < 0.3) {
      this.birdT = 2 + Math.random() * 6;
      const n = 2 + Math.floor(Math.random() * 4);
      const base = 2800 + Math.random() * 2000;
      for (let i = 0; i < n; i++) this.tone(t + i * 0.11, 0.08, { freq: base * (1 + Math.random() * 0.3), freqEnd: base * (0.7 + Math.random() * 0.6), gain: 0.03 + Math.random() * 0.02, out: this.ambBus });
    }
    // crickets at night
    this.cricketT -= dt;
    if (this.cricketT < 0 && s.night > 0.5 && s.season !== 'winter' && s.rain < 0.3) {
      this.cricketT = 0.5 + Math.random() * 0.8;
      for (let i = 0; i < 3; i++) this.tone(t + i * 0.06, 0.04, { freq: 4400 + Math.random() * 200, gain: 0.018, out: this.ambBus });
    }
    // campfire crackles
    this.crackleT -= dt;
    if (this.crackleT < 0 && s.fire > 0.05) {
      this.crackleT = Math.random() * 0.4;
      this.noise(t, 0.02, { freq: 3000 + Math.random() * 3000, q: 2, gain: 0.15 * s.fire, out: this.ambBus });
    }
  }
}
