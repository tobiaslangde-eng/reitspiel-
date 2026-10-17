import * as THREE from 'three';
import { heightAt, normalAt, roadDist, riverInfo, forestFactor, TOWN } from '../world/terrain.js';
import { rand, pick, uid, formatMoney, shadowAll, mat } from '../core/utils.js';
import { fence, sign, log } from '../world/props.js';
import { westernBuilding } from '../world/buildings.js';
import { ITEMS } from './catalog.js';
import { esc } from '../ui/ui.js';

const MILLER = { x: 160, z: 120 };
const PEN = { x: MILLER.x + 14, z: MILLER.z + 4, r: 7 };

function findSpot(cx, cz, rad, pred = () => true) {
  for (let i = 0; i < 400; i++) {
    const x = cx + rand(-rad, rad), z = cz + rand(-rad, rad);
    const h = heightAt(x, z);
    if (h < 1 || normalAt(x, z).y < 0.9 || roadDist(x, z) < 6 || riverInfo(x, z).d < 12) continue;
    if (!pred(x, z)) continue;
    return { x, z };
  }
  return { x: cx, z: cz };
}

export class Quests {
  constructor(game) {
    this.game = game;
    this.runtime = new Map(); // quest id -> spawned objects
    this.buildMiller();
    const s = game.state;
    if (!s.quests.board || !s.quests.board.length || s.quests.boardDay !== s.day) this.newBoard();
    for (const q of s.quests.active) this.activate(q);
    game.events.on('newDay', () => this.newBoard());
    game.events.on('photo', (info) => this.onPhoto(info));
  }

  buildMiller() {
    const g = this.game;
    const b = westernBuilding({ w: 8, d: 7, h: 3.2, falseFront: false, sign: 'MILLER', color: 0x8a6a4a, trim: 0xe8dcc0 });
    b.group.position.set(MILLER.x, heightAt(MILLER.x, MILLER.z), MILLER.z);
    b.group.rotation.y = Math.PI / 2;
    g.scene.add(b.group);
    g.colliders.addBox(MILLER.x, MILLER.z, b.hw, b.hd, Math.PI / 2);
    const pts = [];
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2; const x = PEN.x + Math.cos(a) * PEN.r, z = PEN.z + Math.sin(a) * PEN.r; pts.push([x, heightAt(x, z), z]); }
    g.scene.add(fence(pts, { colliders: g.colliders, height: 1.4, gateAt: 7, color: 0x6a4a30 }));
    const s1 = sign('MILLER RANCH', 2.6, 0.6);
    s1.position.set(PEN.x - 9, heightAt(PEN.x - 9, PEN.z) + 1.3, PEN.z - 6); s1.rotation.y = -0.6;
    g.scene.add(s1);
  }

  // ------------------------------------------------------------ board
  newBoard() {
    const s = this.game.state;
    s.quests.boardDay = s.day;
    const gens = [() => this.genDeliver(), () => this.genCattle(), () => this.genCourier(), () => this.genRace(), () => this.genCollect(), () => this.genPhoto(), () => this.genCalf()];
    const board = [];
    const used = new Set();
    while (board.length < 4) {
      const i = Math.floor(Math.random() * gens.length);
      if (used.has(i)) continue;
      used.add(i);
      board.push(gens[i]());
    }
    s.quests.board = board;
  }

  npcSpot(role) {
    const n = this.game.town.npc(role);
    return n ? { x: n.pos.x, z: n.pos.z } : { x: TOWN.x, z: TOWN.z };
  }

  genDeliver() {
    const item = pick(['apple', 'carrot', 'hay']);
    const n = item === 'hay' ? 10 + Math.floor(rand(0, 3)) * 5 : 3 + Math.floor(rand(0, 5));
    const who = pick([['saloon', 'Rosie'], ['smith', 'Otto'], ['sheriff', 'Sheriff Walt'], ['miller', 'Familie Miller']]);
    const it = ITEMS[item];
    return { id: uid(), type: 'deliver', item, n, who: who[0], whoName: who[1], title: `Lieferung für ${who[1]}`, desc: `${who[1]} braucht ${n}× ${it.name}. Bring ${it.icon} vorbei!`, reward: Math.round(n * it.price * 3 + 60) };
  }
  genCattle() {
    const n = 2 + Math.floor(rand(0, 3));
    const sp = findSpot(rand(-60, 260), rand(160, 320), 40);
    return { id: uid(), type: 'cattle', n, done: 0, spawn: sp, title: 'Rinder zurücktreiben', desc: `${n} Rinder der Millers sind ausgebüxt! Treibe sie (oder führe sie mit dem Lasso, F) in den Pferch der Miller-Ranch.`, reward: 120 + n * 70 };
  }
  genCalf() {
    const sp = findSpot(-260, rand(-200, 200), 70, (x, z) => forestFactor(x, z) > 0.3);
    return { id: uid(), type: 'cattle', calf: true, n: 1, done: 0, spawn: sp, title: 'Das verlorene Kalb', desc: 'Das Kalb „Blümchen“ hat sich im Wald im Westen verirrt. Finde es und bring es mit dem Lasso (F) zur Miller-Ranch.', reward: 220 };
  }
  genCourier() {
    const s = this.game.state;
    const dests = [
      { name: 'Miller-Ranch', x: MILLER.x - 8, z: MILLER.z },
      ...this.game.places.list.filter((p) => s.discovered.includes(p.id)).map((p) => ({ name: p.name, x: p.x, z: p.z })),
      { name: 'Wasserfall', x: this.game.places.list[0].x, z: this.game.places.list[0].z },
    ];
    const d = pick(dests);
    return { id: uid(), type: 'courier', dest: d, title: `Kurierritt: ${d.name}`, desc: `Bring einen eiligen Brief zum Ort „${d.name}“. Folge der Markierung auf der Karte.`, reward: 90 + Math.round(Math.hypot(d.x - TOWN.x, d.z - TOWN.z) / 4) };
  }
  genRace() {
    const limit = 70 + Math.floor(rand(0, 4)) * 10;
    return { id: uid(), type: 'race', limit, title: 'Pony-Express-Zeitritt', desc: `Reite von der Stadt (Start am Ortsschild) bis zum Ranch-Tor in unter ${limit} Sekunden!`, reward: 140 + (110 - limit) * 3 };
  }
  genCollect() {
    const winter = this.game.season === 'winter';
    const sp = findSpot(rand(-200, 150), rand(-200, 250), 30);
    const pts = [];
    for (let i = 0; i < 5; i++) pts.push(findSpot(sp.x, sp.z, 35));
    return { id: uid(), type: 'collect', what: winter ? 'Feuerholz' : 'Wildblumen', pts, got: [], title: winter ? 'Feuerholz für den Saloon' : 'Blumen für Rosie', desc: winter ? 'Sammle 5 Bündel Feuerholz und bring sie Rosie im Saloon.' : 'Sammle 5 Wildblumensträuße für Rosies Tische im Saloon.', reward: 110 };
  }
  genPhoto() {
    const subj = pick([
      ['sunset', 'Fotografiere einen Sonnenuntergang (zwischen 17 und 19 Uhr).'],
      ['waterfall', 'Mach ein Foto am großen Wasserfall im Norden.'],
      ['horse', 'Mach ein schönes Foto von dir mit deinem Pferd.'],
      ['night', 'Fotografiere den Sternenhimmel bei Nacht.'],
    ]);
    return { id: uid(), type: 'photo', subject: subj[0], title: 'Foto für die Zeitung', desc: subj[1] + ' Fotomodus: P.', reward: 100 };
  }

  openBoard() {
    const g = this.game, s = g.state;
    g.ui.openPanel('Auftragsbrett von Dusty Creek', (el, refresh) => {
      el.innerHTML = `<p class="muted">Du kannst bis zu 3 Aufträge gleichzeitig annehmen. Jeden Tag gibt es neue Aufträge.</p><div class="grid"></div>
        <div class="section-title">Deine Aufträge</div><div id="act"></div>`;
      const grid = el.querySelector('.grid');
      for (const q of s.quests.board) {
        const c = document.createElement('div');
        c.className = 'card';
        c.innerHTML = `<h3>📜 ${esc(q.title)}</h3><div class="desc">${esc(q.desc)}</div><div class="row"><span class="price">${formatMoney(q.reward)}</span></div>`;
        const b = document.createElement('button');
        b.className = 'btn gold small'; b.textContent = 'Annehmen';
        b.disabled = s.quests.active.length >= 3;
        b.onclick = () => { this.accept(q); refresh(); };
        c.querySelector('.row').appendChild(b);
        grid.appendChild(c);
      }
      if (!s.quests.board.length) grid.innerHTML = '<p>Für heute sind alle Aufträge vergeben. Komm morgen wieder!</p>';
      this.renderActive(el.querySelector('#act'), refresh);
    });
  }

  renderActive(el, refresh) {
    const s = this.game.state;
    if (!s.quests.active.length) { el.innerHTML = '<p class="muted">Keine aktiven Aufträge.</p>'; return; }
    for (const q of s.quests.active) {
      const d = document.createElement('div');
      d.className = 'list-item';
      d.innerHTML = `<div><b>${esc(q.title)}</b><div class="muted">${esc(q.desc)}</div><div>${this.progressText(q)}</div></div>`;
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = 'Abbrechen';
      b.onclick = () => { this.abandon(q); refresh(); };
      d.appendChild(b);
      el.appendChild(d);
    }
  }

  accept(q) {
    const s = this.game.state;
    s.quests.board = s.quests.board.filter((x) => x !== q);
    s.quests.active.push(q);
    this.activate(q);
    this.game.ui.toast(`📜 Auftrag angenommen: ${q.title}`);
    this.game.audio.click();
  }

  abandon(q) {
    const s = this.game.state;
    this.deactivate(q);
    s.quests.active = s.quests.active.filter((x) => x !== q);
  }

  activate(q) {
    const g = this.game;
    const rt = { objs: [], cows: [] };
    if (q.type === 'cattle') {
      const left = q.n - (q.done || 0);
      const cows = g.animals.spawnCattle(left, { x: q.spawn.x, z: q.spawn.z, r: 8 }, 'quest');
      for (const c of cows) { c.important = true; c.questId = q.id; if (q.calf) c.root.scale.setScalar(0.6); }
      rt.cows = cows;
    }
    if (q.type === 'collect') {
      q.pts.forEach((p, i) => {
        if (q.got.includes(i)) return;
        const o = q.what === 'Feuerholz' ? log(1.2, 0.12) : this.flowerBunch();
        o.position.set(p.x, heightAt(p.x, p.z), p.z);
        g.scene.add(o);
        rt.objs.push({ o, i, p });
      });
    }
    this.runtime.set(q.id, rt);
  }

  flowerBunch() {
    const g = new THREE.Group();
    const cols = [0xf0c020, 0xe04080, 0x8060e0, 0xffffff, 0xff8030];
    for (let i = 0; i < 9; i++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), mat(0x3a7a2a)); st.position.set(Math.cos(i) * 0.1, 0.25, Math.sin(i) * 0.1); g.add(st);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(cols[i % 5], { emissive: cols[i % 5], emissiveIntensity: 0.25 })); f.position.set(Math.cos(i) * 0.12, 0.52, Math.sin(i) * 0.12); g.add(f);
    }
    return shadowAll(g);
  }

  deactivate(q) {
    const g = this.game;
    const rt = this.runtime.get(q.id);
    if (!rt) return;
    for (const o of rt.objs) g.scene.remove(o.o);
    for (const c of rt.cows) { if (c.tethered) g.lasso.release(); g.animals.removeCow(c); }
    this.runtime.delete(q.id);
    if (this.race && this.race.q === q) { this.race = null; g.ui.eventHud(null); }
  }

  complete(q) {
    const g = this.game, s = g.state;
    this.deactivate(q);
    s.quests.active = s.quests.active.filter((x) => x !== q);
    s.quests.done++;
    g.addMoney(q.reward, `Auftrag erledigt: ${q.title}`);
    g.ui.banner('✔ Auftrag erledigt!', `${q.title} · +$${q.reward}`, 3);
    g.audio.fanfare();
    const h = g.player.horse || g.activeHorseEntity();
    if (h) h.data.bond = Math.min(100, h.data.bond + 2);
    g.events.emit('questDone', q);
  }

  progressText(q) {
    switch (q.type) {
      case 'cattle': return `🐄 ${q.done || 0}/${q.n} im Pferch`;
      case 'collect': return `${q.what === 'Feuerholz' ? '🪵' : '💐'} ${q.got.length}/5 gesammelt${q.got.length >= 5 ? ' – bring sie zu Rosie!' : ''}`;
      case 'deliver': return `${ITEMS[q.item].icon} ${Math.min(this.game.state.items[q.item] || 0, q.n)}/${q.n} dabei → ${q.whoName}`;
      case 'race': return this.race?.q === q ? `⏱️ ${this.race.t.toFixed(1)} s` : 'Starte am Ortsschild von Dusty Creek';
      case 'courier': return `📨 Ziel: ${q.dest.name}`;
      case 'photo': return '📷 Fotomodus (P)';
      default: return '';
    }
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.game, s = g.state;
    const p = g.player.position;
    for (const q of [...s.quests.active]) {
      const rt = this.runtime.get(q.id);
      if (q.type === 'cattle' && rt) {
        for (const c of [...rt.cows]) {
          if (Math.hypot(c.pos.x - PEN.x, c.pos.z - PEN.z) < PEN.r - 1) {
            q.done = (q.done || 0) + 1;
            if (c.tethered) g.lasso.release();
            c.home = PEN; c.important = false;
            rt.cows = rt.cows.filter((x) => x !== c);
            s.stats.cattle++;
            g.ui.toast(`🐄 ${q.done}/${q.n} im Pferch!`);
            g.events.emit('cattleDelivered');
            setTimeout(() => g.animals.removeCow(c), 15000);
          }
        }
        if (q.done >= q.n) this.complete(q);
      } else if (q.type === 'courier') {
        if (Math.hypot(p.x - q.dest.x, p.z - q.dest.z) < 10) this.complete(q);
      }
    }
    // race
    if (this.race) {
      const r = this.race;
      r.t += dt;
      g.ui.eventHud(`⏱️ ${r.t.toFixed(1)} s<small>Ziel: Ranch-Tor · Limit ${r.q.limit} s</small>`);
      if (Math.hypot(p.x - 61, p.z + 34.5) < 9) {
        const ok = r.t <= r.q.limit;
        g.ui.eventHud(null);
        const q = r.q;
        this.race = null;
        if (ok) this.complete(q);
        else { g.ui.toast(`Zu langsam (${r.t.toFixed(1)} s)! Versuch es nochmal.`); g.audio.fail(); }
      } else if (r.t > r.q.limit + 60) { this.race = null; g.ui.eventHud(null); }
    }
    // HUD
    const a = s.quests.active[0];
    if (a && !g.competitions.active) g.ui.questHud(`<h4>📜 ${esc(a.title)}</h4><div>${this.progressText(a)}</div>${s.quests.active.length > 1 ? `<div class="muted">+${s.quests.active.length - 1} weitere (J)</div>` : ''}`);
    else g.ui.questHud(null);
  }

  interactables(p) {
    const g = this.game, s = g.state;
    const out = [];
    for (const q of s.quests.active) {
      if (q.type === 'deliver') {
        const t = q.who === 'miller' ? { x: MILLER.x - 6, z: MILLER.z } : this.npcSpot(q.who);
        out.push({ x: t.x, z: t.z, r: 4, label: `${q.n}× ${ITEMS[q.item].name} an ${q.whoName} übergeben`, action: () => {
          if ((s.items[q.item] || 0) < q.n) { g.ui.toast(`Du hast nur ${s.items[q.item] || 0}× ${ITEMS[q.item].name}. Kauf mehr bei Hank!`); return; }
          s.items[q.item] -= q.n; this.complete(q);
        } });
      }
      if (q.type === 'collect') {
        const rt = this.runtime.get(q.id);
        if (rt && p.mode === 'foot') for (const o of rt.objs) out.push({ x: o.p.x, z: o.p.z, r: 2, label: q.what === 'Feuerholz' ? 'Feuerholz aufheben' : 'Blumen pflücken', action: () => {
          g.scene.remove(o.o); rt.objs = rt.objs.filter((x) => x !== o); q.got.push(o.i);
          g.fx.sparkle(new THREE.Vector3(o.p.x, heightAt(o.p.x, o.p.z), o.p.z), 12);
          g.ui.toast(`${q.got.length}/5`);
        } });
        if (q.got.length >= 5) { const t = this.npcSpot('saloon'); out.push({ x: t.x, z: t.z, r: 4, label: `${q.what} an Rosie übergeben`, action: () => this.complete(q) }); }
      }
      if (q.type === 'race' && !this.race) {
        out.push({ x: TOWN.x - 70, z: TOWN.z + 6, r: 6, label: 'Zeitritt starten! ⏱️', action: () => {
          if (g.player.mode !== 'ride') { g.ui.toast('Steig auf dein Pferd!'); return; }
          this.race = { q, t: 0 }; g.ui.banner('Los!', 'Reite so schnell du kannst zum Ranch-Tor!', 2); g.audio.bell();
        } });
      }
    }
    return out;
  }

  markers() {
    const s = this.game.state;
    const out = [];
    for (const q of s.quests.active) {
      if (q.type === 'cattle') {
        const rt = this.runtime.get(q.id);
        if (rt) for (const c of rt.cows) out.push({ x: c.pos.x, z: c.pos.z, icon: '🐄', size: 12, edge: true });
        out.push({ x: PEN.x, z: PEN.z, icon: '🚩', size: 13, edge: true });
      }
      if (q.type === 'courier') out.push({ x: q.dest.x, z: q.dest.z, icon: '📨', size: 13, edge: true });
      if (q.type === 'deliver') { const t = q.who === 'miller' ? MILLER : this.npcSpot(q.who); out.push({ x: t.x, z: t.z, icon: '📦', size: 13, edge: true }); }
      if (q.type === 'collect') {
        const rt = this.runtime.get(q.id);
        if (rt) for (const o of rt.objs) out.push({ x: o.p.x, z: o.p.z, icon: q.what === 'Feuerholz' ? '🪵' : '💐', size: 11, edge: true });
      }
      if (q.type === 'race') out.push({ x: TOWN.x - 70, z: TOWN.z + 6, icon: '⏱️', size: 13, edge: true });
    }
    return out;
  }

  onPhoto(info) {
    const s = this.game.state;
    for (const q of [...s.quests.active]) {
      if (q.type !== 'photo') continue;
      const ok = (q.subject === 'sunset' && info.hour >= 16.8 && info.hour <= 19.2)
        || (q.subject === 'waterfall' && info.nearWaterfall)
        || (q.subject === 'horse' && info.horseInView)
        || (q.subject === 'night' && info.night);
      if (ok) this.complete(q);
    }
  }
}

export { MILLER, PEN };
