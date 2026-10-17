import { randomHorse, BREEDS, COATS } from '../horse/breeds.js';
import { Horse } from '../horse/horse.js';
import { rand, clamp, pick } from '../core/utils.js';
import { esc } from '../ui/ui.js';

const HERD_HOME = { x: 70, z: 430, r: 70 };
const GESTATION_DAYS = 2;
const GROWTH_PER_DAY = 0.25;

// Wild mustang herd, taming minigame and foal breeding.
export class Wildlife {
  constructor(game) {
    this.game = game;
    this.herd = [];
    for (let i = 0; i < 6; i++) this.spawnMustang();
    game.events.on('newDay', () => this.newDay());
  }

  spawnMustang() {
    const g = this.game;
    const d = randomHorse('mustang', { bond: 0 });
    d.wild = true;
    d.trust = 0;
    const h = new Horse(g, d);
    h.onStep = (horse, i) => { if (horse.pos.distanceTo(g.camera.position) < 50) g.fx.onStep(horse, i); };
    const a = Math.random() * Math.PI * 2, r = Math.random() * HERD_HOME.r * 0.6;
    h.setPosition(HERD_HOME.x + Math.cos(a) * r, HERD_HOME.z + Math.sin(a) * r, Math.random() * 6);
    h.home = HERD_HOME;
    this.herd.push(h);
    return h;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const pp = p.position;
    const cam = g.camera.position;
    for (const h of this.herd) {
      const far = h.pos.distanceTo(cam) > 250;
      h.setVisible(h.pos.distanceTo(cam) < 450);
      if (far && Math.random() > 0.15) continue;
      const d = h.pos.distanceTo(pp);
      // calm approach builds trust, riding or running scares them
      const scary = p.mode === 'ride' ? 22 : (p.crouch ? 3 : (p.speed > 3 ? 14 : 6));
      if (d < scary && h.state !== 'flee' && !this.taming) {
        h.state = 'flee'; h.stateT = rand(3, 6);
        if (Math.random() < 0.3) g.audio.whinny(h);
        h.data.trust = Math.max(0, (h.data.trust || 0) - 5);
        // the whole herd follows
        for (const o of this.herd) if (o !== h && o.pos.distanceTo(h.pos) < 30) { o.state = 'flee'; o.stateT = rand(3, 6); }
      } else if (d < 12 && p.mode === 'foot' && p.crouch) {
        h.data.trust = Math.min(100, (h.data.trust || 0) + dt * 6);
        h.lookYaw = 0;
      }
      if (this.taming && this.taming.horse === h) { h.speed = 0; h.state = 'stand'; h.stateT = 5; }
      const input = h.think(far ? dt * 5 : dt, pp);
      h.drive(far ? dt * 5 : dt, input);
    }
  }

  interactables(p) {
    if (p.mode !== 'foot') return [];
    const out = [];
    for (const h of this.herd) {
      const t = Math.round(h.data.trust || 0);
      out.push({ x: h.pos.x, z: h.pos.z, r: 4, label: `Wildpferd zähmen (Vertrauen ${t}%)`, action: () => this.startTaming(h) });
    }
    return out;
  }

  markers() {
    const d = Math.hypot(this.game.player.position.x - HERD_HOME.x, this.game.player.position.z - HERD_HOME.z);
    if (d > 300) return [];
    return this.herd.map((h) => ({ x: h.pos.x, z: h.pos.z, color: '#c89a5a', r: 2.5 }));
  }

  startTaming(h) {
    const g = this.game, s = g.state;
    if (s.horses.length >= g.ranch.capacity()) { g.ui.toast('Dein Stall ist voll – baue erst mehr Platz!'); return; }
    if ((h.data.trust || 0) < 30) {
      g.ui.toast('Das Wildpferd traut dir noch nicht. Bleib geduckt (Strg/C) in seiner Nähe, bis das Vertrauen über 30% steigt.');
      return;
    }
    this.taming = { horse: h };
    let hits = 0, misses = 0, pos = 0.5, vel = 0.6, zone = 0.5, zoneW = 0.22;
    const need = 5;
    g.ui.openPanel('Wildpferd zähmen', (el) => {
      el.innerHTML = `<p>Bleib ruhig und sprich sanft mit dem Mustang. Drücke <b>Leertaste</b> (oder klicke), wenn der Herzschlag im <span style="color:#2fa39b;font-weight:800">grünen Bereich</span> ist!</p>
        <canvas id="tame" width="600" height="90" style="width:100%;border-radius:10px;border:3px solid #7a5230;background:#3a2414"></canvas>
        <p id="tame-info" class="western" style="font-size:20px;text-align:center"></p>`;
      const cv = el.querySelector('#tame');
      const ctx = cv.getContext('2d');
      const info = el.querySelector('#tame-info');
      let last = performance.now();
      const press = () => {
        if (Math.abs(pos - zone) < zoneW / 2) {
          hits++; g.audio.blow(h.pos); g.fx.hearts(h);
          zone = rand(0.2, 0.8); zoneW = Math.max(0.12, zoneW - 0.02); vel *= 1.12;
        } else { misses++; g.audio.snort(h); h.startManeuver('rear'); }
      };
      cv.onclick = press;
      const key = (e) => { if (e.code === 'Space') { e.preventDefault(); press(); } };
      window.addEventListener('keydown', key);
      const loop = () => {
        if (!g.ui.panelOpen) { window.removeEventListener('keydown', key); this.taming = null; return; }
        const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
        pos += vel * dt; if (pos > 1 || pos < 0) { vel = -vel; pos = clamp(pos, 0, 1); }
        ctx.fillStyle = '#3a2414'; ctx.fillRect(0, 0, 600, 90);
        ctx.fillStyle = 'rgba(47,163,155,0.8)'; ctx.fillRect((zone - zoneW / 2) * 600, 15, zoneW * 600, 60);
        ctx.fillStyle = '#ff6a9a'; ctx.font = '40px serif'; ctx.textAlign = 'center'; ctx.fillText('❤', pos * 600, 62);
        info.textContent = `Treffer ${hits}/${need} · Fehler ${misses}/3`;
        if (hits >= need) { window.removeEventListener('keydown', key); this.finishTaming(h, true); return; }
        if (misses >= 3) { window.removeEventListener('keydown', key); this.finishTaming(h, false); return; }
        requestAnimationFrame(loop);
      };
      loop();
    }, () => { this.taming = null; });
  }

  finishTaming(h, ok) {
    const g = this.game, s = g.state;
    this.taming = null;
    g.ui.closePanel();
    if (!ok) {
      h.data.trust = Math.max(0, h.data.trust - 25);
      h.state = 'flee'; h.stateT = 4;
      g.ui.toast('Der Mustang ist zu nervös und galoppiert davon. Versuch es später nochmal!');
      return;
    }
    this.herd = this.herd.filter((x) => x !== h);
    const d = h.data;
    d.wild = false;
    d.bond = 15;
    d.tack = { saddle: null, bridle: null, pad: null, breast: null, wraps: null, mask: null };
    delete d.trust;
    s.horses.push(d);
    h.onEvent = (type, data, horse) => g.onHorseEvent(type, data, horse);
    h.home = g.ranch.paddockArea();
    h.state = 'follow'; h.stateT = 60;
    g.horses.push(h);
    s.stats.tamed++;
    g.audio.fanfare();
    g.audio.whinny(h);
    g.ui.banner('🐎 Mustang gezähmt!', `${esc(d.name)} (${COATS[d.coat].name}) vertraut dir jetzt.`, 4);
    g.events.emit('tamed', h);
    setTimeout(() => this.spawnMustang(), 30000);
  }

  // ------------------------------------------------------------- breeding
  canBreed() {
    const g = this.game;
    return g.ranch.has('stable2');
  }

  breed(mare, stallion) {
    const g = this.game, s = g.state;
    if (!this.canBreed()) { g.ui.toast('Für die Zucht brauchst du den zweiten Stall.'); return false; }
    if (s.horses.length + s.pregnancies.length >= g.ranch.capacity()) { g.ui.toast('Kein Platz für ein Fohlen!'); return false; }
    if (s.pregnancies.some((p) => p.mare === mare.id)) { g.ui.toast(`${mare.name} erwartet schon ein Fohlen.`); return false; }
    if (!g.spend(300)) return false;
    s.pregnancies.push({ mare: mare.id, sire: stallion.id, due: s.day + GESTATION_DAYS });
    g.ui.toast(`🍼 ${mare.name} und ${stallion.name} bekommen ein Fohlen! In ${GESTATION_DAYS} Tagen ist es so weit.`, 'gold');
    g.events.emit('breed');
    return true;
  }

  newDay() {
    const g = this.game, s = g.state;
    // foals grow
    for (const h of g.horses) {
      if ((h.data.growth ?? 1) < 1) {
        h.data.growth = Math.min(1, h.data.growth + GROWTH_PER_DAY);
        h.applyScale();
        if (h.data.growth >= 1) g.ui.toast(`🎉 ${h.data.name} ist erwachsen geworden und kann jetzt geritten werden!`, 'gold');
      }
      // horses that wandered off return to the paddock overnight
      if (!h.rider && h.data.id !== s.activeHorse && !g.ranch.isInside(h.pos, 20)) {
        const pad = g.ranch.paddockArea();
        h.setPosition(pad.x + rand(-5, 5), pad.z + rand(-5, 5));
        h.home = pad; h.state = 'stand';
      }
    }
    // births
    const due = s.pregnancies.filter((p) => p.due <= s.day);
    s.pregnancies = s.pregnancies.filter((p) => p.due > s.day);
    for (const p of due) {
      const mare = s.horses.find((h) => h.id === p.mare);
      const sire = s.horses.find((h) => h.id === p.sire);
      if (!mare || !sire) continue;
      const breed = mare.breed === sire.breed ? mare.breed : pick([mare.breed, sire.breed]);
      const mix = mare.breed === sire.breed ? null : (breed === mare.breed ? sire.breed : mare.breed);
      const coat = Math.random() < 0.45 ? mare.coat : Math.random() < 0.8 ? sire.coat : pick(BREEDS[breed].coats);
      const foal = randomHorse(breed, { coat, age: 0, growth: 0.05, bond: 40 });
      if (mix) foal.mix = mix;
      for (const k of ['speed', 'stamina', 'agility']) foal.stats[k] = clamp(Math.round((mare.stats[k] + sire.stats[k]) / 2 + rand(-1, 1.5)), 1, 10);
      foal.parents = [mare.name, sire.name];
      s.horses.push(foal);
      const ent = g.spawnHorse(foal);
      ent.home = g.ranch.paddockArea();
      s.stats.foals++;
      g.ui.banner('🍼 Ein Fohlen ist geboren!', `${foal.gender === 'Stute' ? 'Ein Stutfohlen' : 'Ein Hengstfohlen'} von ${esc(mare.name)} & ${esc(sire.name)}. Gib ihm einen Namen (Tab → Pferde)!`, 5);
      g.events.emit('foal', ent);
    }
  }
}
