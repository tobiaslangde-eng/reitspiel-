import * as THREE from 'three';
import { heightAt, TOWN } from './terrain.js';
import { westernBuilding, waterTower } from './buildings.js';
import { barrel, hitchingPost, lantern, crate, sign, boxGeo, woodMat, fence, hayBale, wagonWheel } from './props.js';
import { coveredWagon } from './buildings.js';
import { Rider } from '../player/rider.js';
import { mat, shadowAll, formatMoney, rand } from '../core/utils.js';
import { ITEMS, SHOP_SECTIONS, TYPE_NAMES, SLOT_NAMES } from '../game/catalog.js';
import { BREEDS, BREED_LIST, COATS, PERSONALITIES, randomHorse, breedName } from '../horse/breeds.js';
import { Horse } from '../horse/horse.js';
import { esc } from '../ui/ui.js';
import { mulberry32 } from '../core/noise.js';

const TX = TOWN.x, TZ = TOWN.z;

export class NPC {
  constructor(game, { name, portrait, x, z, heading = 0, outfit, female = true, role }) {
    this.game = game;
    this.name = name; this.portrait = portrait; this.role = role;
    this.rider = new Rider(game.scene, outfit);
    this.rider.braid.visible = female;
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.heading = heading;
    this.baseHeading = heading;
    this.rider.root.position.copy(this.pos);
    this.rider.root.rotation.y = heading;
    this.t = Math.random() * 10;
  }
  update(dt, playerPos) {
    this.t += dt;
    const d = playerPos.distanceTo(this.pos);
    if (d > 120) { this.rider.root.visible = false; return; }
    this.rider.root.visible = true;
    // look at player when near
    const want = d < 8 ? Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z) : this.baseHeading;
    let diff = want - this.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, dt * 3);
    this.rider.root.rotation.y = this.heading;
    this.rider.update(dt, { mode: 'foot', speed: 0 });
    this.rider.spine.rotation.z = Math.sin(this.t * 0.8) * 0.03;
    if (d < 8 && Math.random() < 0.002) this.rider.play('wave', 1.5);
  }
}

export class Town {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.npcs = [];
    this.lanterns = [];
    this.saleHorses = [];
    this.build();
    this.spawnNPCs();
    this.refreshSale();
    game.events.on('newDay', () => this.refreshSale());
  }

  y(x, z) { return heightAt(x, z); }
  add(obj, x, z, rot = 0, col = null) {
    obj.position.set(x, this.y(x, z), z);
    obj.rotation.y = rot;
    this.scene.add(obj);
    if (col) this.game.colliders.addBox(x, z, col[0], col[1], rot);
    return obj;
  }

  build() {
    const north = TZ - 15, south = TZ + 15;
    const defs = [
      { key: 'saloon', x: TX - 32, z: north, rot: 0, o: { w: 12, d: 12, h: 3.6, stories: 2, sign: 'SALOON', color: 0x9a5a3a, trim: 0xe8d8b0, doorType: 'saloon' } },
      { key: 'store', x: TX - 8, z: north, rot: 0, o: { w: 10, d: 10, h: 4, sign: 'GENERAL STORE', color: 0x7a8a6a, trim: 0xf0e8d0 } },
      { key: 'bank', x: TX + 14, z: north, rot: 0, o: { w: 9, d: 10, h: 4.2, sign: 'BANK', color: 0xb8a888, trim: 0x5a4030 } },
      { key: 'sheriff', x: TX + 34, z: north, rot: 0, o: { w: 9, d: 9, h: 3.8, sign: 'SHERIFF', color: 0x8a6a4a, trim: 0xe8dcc0 } },
      { key: 'smith', x: TX - 30, z: south, rot: Math.PI, o: { w: 10, d: 9, h: 3.8, sign: 'HUFSCHMIED', color: 0x5a4a40, trim: 0xd8c8a8, falseFront: false } },
      { key: 'tack', x: TX - 6, z: south, rot: Math.PI, o: { w: 10, d: 10, h: 4, sign: 'SATTLEREI', color: 0xa86a3a, trim: 0xf0e0c0 } },
      { key: 'fashion', x: TX + 16, z: south, rot: Math.PI, o: { w: 10, d: 10, h: 4, sign: 'WESTERNMODE', color: 0x6a7aa0, trim: 0xf8f0e0 } },
      { key: 'hotel', x: TX + 38, z: south, rot: Math.PI, o: { w: 11, d: 11, h: 3.6, stories: 2, sign: 'HOTEL', color: 0xa07a5a, trim: 0xf0e8d8 } },
    ];
    this.spots = {};
    for (const d of defs) {
      const b = westernBuilding(d.o);
      const off = d.rot === 0 ? -1 : 1;
      // buildings stand back so the porch faces the street
      this.add(b.group, d.x, d.z + off * (b.hd), d.rot, null);
      this.game.colliders.addBox(d.x, d.z + off * b.hd, b.hw, b.hd, d.rot);
      // porch collider (thin)
      const doorZ = d.z + off * b.hd - off * b.door.z;
      this.spots[d.key] = { x: d.x, z: doorZ };
    }
    // forge glow at the smithy
    const forge = new THREE.Group();
    const stone = new THREE.Mesh(boxGeo(1.6, 1.0, 1.2), mat(0x555050, { roughness: 1 })); stone.position.y = 0.5; forge.add(stone);
    const coals = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x200500, emissive: 0xff5010, emissiveIntensity: 2 }));
    coals.rotation.x = -Math.PI / 2; coals.position.y = 1.01; forge.add(coals);
    const anvil = new THREE.Group();
    const ab = new THREE.Mesh(boxGeo(0.5, 0.25, 0.3), mat(0x2a2a2e, { metalness: 0.8, roughness: 0.4 })); ab.position.y = 0.75; anvil.add(ab);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), mat(0x2a2a2e, { metalness: 0.8, roughness: 0.4 })); horn.rotation.z = Math.PI / 2; horn.position.set(0.4, 0.78, 0); anvil.add(horn);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 10), mat(0x6a4a30)); stump.position.y = 0.3; anvil.add(stump);
    anvil.position.set(2, 0, 0); forge.add(anvil);
    shadowAll(forge);
    this.add(forge, this.spots.smith.x - 4, this.spots.smith.z + 2.5, 0);
    this.forgeLight = new THREE.PointLight(0xff6020, 6, 10, 2);
    this.forgeLight.position.set(this.spots.smith.x - 4, this.y(TX, TZ) + 1.6, this.spots.smith.z + 2.5);
    this.scene.add(this.forgeLight);

    // street dressing
    for (const [x, z] of [[TX - 32, TZ - 6], [TX - 8, TZ - 6], [TX + 16, TZ + 6], [TX - 6, TZ + 6]]) this.add(hitchingPost(3), x + 4, z, 0);
    for (const [x, z] of [[TX - 25, TZ - 8], [TX - 24, TZ - 7.4], [TX + 4, TZ + 8], [TX + 28, TZ - 8], [TX - 18, TZ + 8]]) this.add(barrel(), x, z, rand(0, 3), [0.45, 0.45]);
    for (const [x, z] of [[TX + 8, TZ - 7], [TX + 27, TZ + 8]]) this.add(crate(), x, z, rand(0, 1), [0.45, 0.45]);
    for (let i = -2; i <= 2; i++) {
      const l = lantern(); this.add(l, TX + i * 20, TZ + (i % 2 ? 6 : -6), i % 2 ? Math.PI : 0); this.lanterns.push(l);
    }
    this.add(waterTower(), TX - 55, TZ - 25, 0, [2, 2]);
    const wg = coveredWagon(); this.add(wg.group, TX + 52, TZ - 8, 1.2, [wg.hw, wg.hd]);
    this.add(hayBale(), TX + 50, TZ + 6, 0.3);
    const wh = new THREE.Group(); const w = wagonWheel(0.7); w.position.y = 0.7; w.rotation.x = -0.2; wh.add(w); this.add(wh, TX - 20, TZ - 7.5, 0);
    // town sign
    const ts = new THREE.Group();
    const p1 = new THREE.Mesh(boxGeo(0.2, 3, 0.2), woodMat(0x5a3a22)); p1.position.set(-1.6, 1.5, 0); ts.add(p1);
    const p2 = p1.clone(); p2.position.x = 1.6; ts.add(p2);
    const sg = sign('DUSTY CREEK', 3.6, 0.9); sg.position.set(0, 2.4, 0.12); ts.add(sg);
    const sg2 = sign('Einwohner: 42', 2.6, 0.5, { font: 'Georgia' }); sg2.position.set(0, 1.6, 0.12); ts.add(sg2);
    this.add(shadowAll(ts), TX - 72, TZ + 6, Math.PI / 2 + 0.3);
    // quest board in front of the saloon
    const qb = new THREE.Group();
    const b1 = new THREE.Mesh(boxGeo(0.15, 2.2, 0.15), woodMat(0x5a3a22)); b1.position.set(-0.9, 1.1, 0); qb.add(b1);
    const b2 = b1.clone(); b2.position.x = 0.9; qb.add(b2);
    const board = new THREE.Mesh(boxGeo(2, 1.3, 0.08), woodMat(0x8a6a44)); board.position.y = 1.5; qb.add(board);
    const papers = [0xf0e6c8, 0xe8dcb8, 0xf8f0dc];
    for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), mat(papers[i % 3])); p.position.set(-0.7 + i * 0.35, 1.5 + (i % 2) * 0.15, 0.05); p.rotation.z = (i - 2) * 0.06; qb.add(p); }
    const qs = sign('AUFTRÄGE', 1.6, 0.35); qs.position.set(0, 2.35, 0.05); qb.add(qs);
    shadowAll(qb);
    this.questBoard = { x: TX - 20, z: TZ - 6 };
    this.add(qb, this.questBoard.x, this.questBoard.z, 0, [1, 0.2]);

    // horse trader corral
    this.corral = { x: TX + 75, z: TZ, r: 10 };
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([this.corral.x + Math.cos(a) * 12, 0, this.corral.z + Math.sin(a) * 12]); }
    pts.forEach((p) => (p[1] = this.y(p[0], p[2])));
    this.scene.add(fence(pts, { colliders: this.game.colliders, height: 1.5, rails: 3, gateAt: 8 }));
    const cs = sign('PFERDEHANDEL', 3, 0.7); this.add(cs, this.corral.x - 13, this.corral.z + 3, Math.PI / 2);
  }

  spawnNPCs() {
    const g = this.game;
    const s = this.spots;
    const def = [
      { role: 'saloon', name: 'Rosie', portrait: '👩‍🦰', x: s.saloon.x + 3, z: s.saloon.z - 2.5, heading: 0, outfit: { hat: 'hat_none', shirt: 'shirt_pink', vest: 'vest_black', pants: 'pants_black', boots: 'boots_red', scarf: 'scarf_none', hair: 'hair_red' } },
      { role: 'store', name: 'Hank', portrait: '🧔', female: false, x: s.store.x + 2.5, z: s.store.z - 2.5, heading: 0, outfit: { hat: 'hat_tan', shirt: 'shirt_white', vest: 'vest_denim', pants: 'pants_jeans', boots: 'boots_brown', scarf: 'scarf_none', hair: 'hair_black' } },
      { role: 'smith', name: 'Otto', portrait: '👨‍🔧', female: false, x: s.smith.x - 2, z: s.smith.z + 3.5, heading: Math.PI, outfit: { hat: 'hat_none', shirt: 'shirt_plaid_blue', vest: 'vest_leather', pants: 'pants_jeans', chaps: 'chaps_brown', boots: 'boots_black', scarf: 'scarf_none', hair: 'hair_brown' } },
      { role: 'tack', name: 'Martha', portrait: '👵', x: s.tack.x + 2.5, z: s.tack.z + 2.5, heading: Math.PI, outfit: { hat: 'hat_white', shirt: 'shirt_turq', vest: 'vest_suede', pants: 'pants_beige', boots: 'boots_turq', scarf: 'scarf_turq', hair: 'hair_blonde' } },
      { role: 'fashion', name: 'Jesse', portrait: '💁‍♀️', x: s.fashion.x + 2.5, z: s.fashion.z + 2.5, heading: Math.PI, outfit: { hat: 'hat_pink', shirt: 'shirt_white', vest: 'vest_leather', pants: 'pants_jeans', boots: 'boots_red', scarf: 'scarf_pink', hair: 'hair_blonde' } },
      { role: 'sheriff', name: 'Sheriff Walt', portrait: '🤠', female: false, x: s.sheriff.x + 2, z: s.sheriff.z - 2.5, heading: 0, outfit: { hat: 'hat_black', shirt: 'shirt_white', vest: 'vest_black', pants: 'pants_black', boots: 'boots_black', scarf: 'scarf_red', hair: 'hair_black' } },
      { role: 'trader', name: 'Lucía', portrait: '👩', x: this.corral.x - 13, z: this.corral.z - 1, heading: -Math.PI / 2, outfit: { hat: 'hat_brown', shirt: 'shirt_plaid_red', vest: 'vest_suede', pants: 'pants_jeans', chaps: 'chaps_suede', boots: 'boots_brown', scarf: 'scarf_yellow', hair: 'hair_black' } },
    ];
    for (const d of def) this.npcs.push(new NPC(g, d));
  }

  npc(role) { return this.npcs.find((n) => n.role === role); }

  setNight(n) {
    const lit = n > 0.25;
    for (const l of this.lanterns) l.userData.glass.material.emissiveIntensity = lit ? 3 : 0;
    this.forgeLight.intensity = 5 + Math.sin(performance.now() * 0.01) * 1.5;
  }

  update(dt) {
    const pp = this.game.player.position;
    for (const n of this.npcs) n.update(dt, pp);
    for (const h of this.saleHorses) {
      if (h.pos.distanceTo(pp) > 150) continue;
      h.drive(dt, h.think(dt, null));
    }
  }

  // ------------------------------------------------------------------ horse trader
  refreshSale() {
    const g = this.game;
    for (const h of this.saleHorses) h.dispose();
    this.saleHorses = [];
    const rnd = mulberry32(g.state.day * 7919 + 17);
    const list = [];
    const pool = BREED_LIST.slice();
    for (let i = 0; i < 6; i++) {
      const b = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const h = randomHorse(b, { age: 3 + Math.floor(rnd() * 8), bond: 5 });
      const br = BREEDS[b];
      const statSum = h.stats.speed + h.stats.stamina + h.stats.agility - (br.stats.speed + br.stats.stamina + br.stats.agility);
      h.price = Math.round((br.price * (0.9 + rnd() * 0.25) + statSum * 150) / 10) * 10;
      list.push(h);
    }
    this.saleList = list;
    list.slice(0, 5).forEach((hd, i) => {
      const e = new Horse(g, hd);
      const a = (i / 5) * Math.PI * 2;
      e.setPosition(this.corral.x + Math.cos(a) * 5, this.corral.z + Math.sin(a) * 5, Math.random() * 6);
      e.home = this.corral;
      e.forSale = true;
      this.saleHorses.push(e);
    });
  }

  // ------------------------------------------------------------------ interactions
  interactables(p) {
    if (Math.hypot(p.position.x - TX, p.position.z - TZ) > 140) return [];
    const out = [];
    for (const n of this.npcs) out.push({ x: n.pos.x, z: n.pos.z, r: 3.2, label: `Mit ${n.name} sprechen`, action: () => this.talk(n) });
    out.push({ x: this.questBoard.x, z: this.questBoard.z + 1, r: 3, label: 'Auftragsbrett lesen', action: () => this.game.quests.openBoard() });
    for (const h of this.saleHorses) out.push({ x: h.pos.x, z: h.pos.z, r: 2.5, label: `${h.data.name} ansehen (${formatMoney(h.data.price)})`, action: () => this.openTrader(h.data.id) });
    return out;
  }

  markers() {
    return [
      { x: TX, z: TZ, icon: '🏘️', size: 16, edge: true },
      { x: this.corral.x, z: this.corral.z, icon: '🐎', size: 12 },
    ];
  }

  talk(n) {
    const g = this.game;
    const ui = g.ui;
    const bye = { label: 'Bis bald!' };
    const s = g.state;
    switch (n.role) {
      case 'saloon': {
        const rumors = [
          'Man sagt, hinter dem großen Wasserfall im Norden gibt es einen geheimen Pfad nach oben …',
          'Alte Goldgräber erzählen von einer verlassenen Mine tief in den roten Canyons im Osten.',
          'In der Prärie im Süden zieht eine Herde wilder Mustangs umher. Nur geduldige Reiter können sie zähmen.',
          'Auf dem höchsten Tafelberg soll man den schönsten Sonnenuntergang des ganzen Westens sehen.',
          'Es gibt eine Geisterstadt im Südosten … nachts soll es dort spuken!',
          'Wer Schatzkarten kauft, sollte zum Graben absteigen – die Schätze liegen nie direkt am Weg.',
        ];
        ui.dialog(n.name, n.portrait, `Howdy, ${esc(s.playerName)}! Was darf's sein? ${s.day > 1 ? '' : 'Neu in Dusty Creek, was? Schau mal aufs Auftragsbrett draußen!'}`, [
          { label: 'Schatzkarte kaufen ($150)', gold: true, fn: () => g.places.buyTreasureMap() },
          { label: 'Gerüchte hören', fn: () => ui.dialog(n.name, n.portrait, rumors[Math.floor(Math.random() * rumors.length)], [{ label: 'Danke, Rosie!' }]) },
          { label: 'Sarsaparilla trinken ($3)', fn: () => { if (g.spend(3)) { ui.toast('Erfrischend! 🥤'); } } },
          { label: 'Auftragsbrett', fn: () => g.quests.openBoard() },
          bye,
        ]);
        break;
      }
      case 'store':
        ui.dialog(n.name, n.portrait, 'Willkommen im Gemischtwarenladen! Futter, Leckerlis und hübsche Deko für deine Ranch.', [
          { label: 'Einkaufen', gold: true, fn: () => this.openShop('store') }, bye]);
        break;
      case 'tack':
        ui.dialog(n.name, n.portrait, 'Ah, eine echte Reiterin! Ich habe die schönsten Sättel diesseits des Mississippi – handpunziert, mit Silber und Türkis.', [
          { label: 'Sattlerei ansehen', gold: true, fn: () => this.openShop('tack') }, bye]);
        break;
      case 'fashion':
        ui.dialog(n.name, n.portrait, 'Hut, Stiefel, Chaps – bei mir wirst du zum Star jedes Rodeos!', [
          { label: 'Mode ansehen', gold: true, fn: () => this.openShop('outfit') }, bye]);
        break;
      case 'smith': {
        const h = g.player.horse || g.activeHorseEntity();
        const opts = [];
        if (h && !h.data.shoes) opts.push({ label: `${h.data.name} beschlagen lassen ($120)`, gold: true, fn: () => {
          if (h.pos.distanceTo(n.pos) > 15) { ui.toast('Bring dein Pferd mit zur Schmiede!'); return; }
          if (!g.spend(120)) return;
          h.data.shoes = true; g.audio.hoof('rock', 1.5, n.pos);
          setTimeout(() => g.audio.hoof('rock', 1.5, n.pos), 300);
          ui.toast(`🔨 ${h.data.name} hat neue Hufeisen: schneller und trittsicherer!`, 'gold');
          g.events.emit('shoes', h);
        } });
        if (h) opts.push({ label: 'Hufe prüfen lassen (gratis)', fn: () => ui.dialog(n.name, n.portrait, h.data.shoes ? `${esc(h.data.name)}s Eisen sitzen bombenfest!` : `${esc(h.data.name)} läuft barhuf. Mit Eisen wäre ${h.data.gender === 'Stute' ? 'sie' : 'er'} etwa 6% schneller.`, [{ label: 'Danke, Otto!' }]) });
        opts.push(bye);
        ui.dialog(n.name, n.portrait, 'Klong, klong! Ich bin Otto, der Hufschmied. Ein gutes Eisen ist das halbe Pferd.', opts);
        break;
      }
      case 'sheriff':
        ui.dialog(n.name, n.portrait, `Ruhig hier in Dusty Creek, ${esc(s.playerName)}. Aber ich hab immer Arbeit für helfende Hände.`, [
          { label: 'Gibt es Aufträge?', fn: () => g.quests.openBoard() },
          { label: 'Erzählen Sie von Mustangs', fn: () => ui.dialog(n.name, n.portrait, 'Die Wildpferde leben in der südlichen Prärie. Steig ab, nähere dich langsam und geduckt (Strg/C) und zeig ihnen, dass du ihnen nichts Böses willst. Dann drücke E zum Zähmen.', [{ label: 'Verstanden!' }]) },
          bye]);
        break;
      case 'trader':
        ui.dialog(n.name, n.portrait, '¡Hola! Jeden Tag habe ich neue Pferde aus dem ganzen Land. Willst du eines kaufen – oder eines verkaufen?', [
          { label: 'Pferde ansehen', gold: true, fn: () => this.openTrader() },
          { label: 'Ein Pferd verkaufen', fn: () => this.openTrader(null, 'sell') }, bye]);
        break;
      default:
        ui.dialog(n.name, n.portrait, 'Howdy!', [bye]);
    }
  }

  openShop(section) {
    const g = this.game;
    const sec = SHOP_SECTIONS[section];
    const tabs = [];
    const typeList = section === 'outfit' ? Object.keys(SLOT_NAMES).filter((k) => k !== 'hair') : sec.types;
    for (const t of typeList) {
      tabs.push({
        id: t, label: section === 'outfit' ? SLOT_NAMES[t] : TYPE_NAMES[t],
        render: (el, refresh) => {
          const items = Object.values(ITEMS).filter((i) => (section === 'outfit' ? i.type === 'outfit' && i.slot === t : i.type === t) && !i.unique && i.price > 0);
          el.innerHTML = `<p class="muted">Kontostand: <b>${formatMoney(g.state.money)}</b></p><div class="grid"></div>`;
          const grid = el.querySelector('.grid');
          for (const it of items) grid.appendChild(this.itemCard(it, refresh));
        },
      });
    }
    g.ui.openPanel(sec.title, tabs);
  }

  itemCard(it, refresh) {
    const g = this.game, s = g.state;
    const c = document.createElement('div');
    c.className = 'card';
    const consumable = ['feed', 'decor', 'map'].includes(it.type);
    const owned = !consumable && s.owned.includes(it.id);
    const sw = it.color !== undefined && it.color ? `<span class="swatch" style="background:#${new THREE.Color(it.color).getHexString()}"></span>` : it.leather ? `<span class="swatch" style="background:#${new THREE.Color(it.leather).getHexString()}"></span>` : it.colors ? it.colors.map((cc) => `<span class="swatch" style="background:${cc}"></span>`).join('') : '';
    c.innerHTML = `<h3>${it.icon || ''} ${esc(it.name)}</h3><div>${sw}</div>${it.desc ? `<div class="desc">${esc(it.desc)}</div>` : ''}
      ${consumable ? `<div class="muted">Im Lager: ${s.items[it.id] || 0}</div>` : ''}
      <div class="row"><span class="price">${formatMoney(it.price)}</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn gold small';
    btn.textContent = owned ? '✔ Besitzt du' : consumable ? 'Kaufen' : 'Kaufen';
    btn.disabled = owned;
    btn.onclick = () => {
      if (!g.spend(it.price)) return;
      if (consumable) s.items[it.id] = (s.items[it.id] || 0) + (it.id === 'hay' ? 5 : 1);
      else s.owned.push(it.id);
      g.events.emit('buy', it);
      g.ui.toast(`🛍️ ${it.name} gekauft!${consumable ? '' : ' Ausrüsten im Menü (Tab).'}`);
      if (it.type === 'outfit') { s.outfit[it.slot] = it.id; g.player.rider.setOutfit(s.outfit); }
      refresh();
    };
    c.querySelector('.row').appendChild(btn);
    if (it.type === 'feed') {
      const b5 = document.createElement('button');
      b5.className = 'btn small'; b5.textContent = `10× ${formatMoney(it.price * 10)}`;
      b5.onclick = () => { if (!g.spend(it.price * 10)) return; s.items[it.id] = (s.items[it.id] || 0) + (it.id === 'hay' ? 50 : 10); refresh(); };
      c.querySelector('.row').appendChild(b5);
    }
    return c;
  }

  openTrader(focusId = null, tab = 'buy') {
    const g = this.game;
    g.ui.openPanel('Pferdehandel Lucía', [
      { id: 'buy', label: '🐎 Kaufen', render: (el, refresh) => this.renderBuy(el, refresh, focusId) },
      { id: 'sell', label: '💰 Verkaufen', render: (el, refresh) => this.renderSell(el, refresh) },
    ]);
    if (tab === 'sell') g.ui.selectTab('sell');
  }

  horseCard(h, extra = '') {
    const br = BREEDS[h.breed];
    const coat = COATS[h.coat];
    const col = coat.base.map((v) => Math.round(v * 255)).join(',');
    const pip = (v) => `<div class="pips"><i style="width:${v * 10}%"></i></div>`;
    return `<h3>${esc(h.name)} <span class="muted">${h.gender === 'Stute' ? '♀' : '♂'} ${h.age} J.</span></h3>
      <div><span class="swatch" style="background:rgb(${col})"></span>${esc(breedName(h))} · ${coat.name}</div>
      <div class="muted">${PERSONALITIES[h.personality].icon} ${PERSONALITIES[h.personality].name}</div>
      <div class="stat">Tempo ${pip(h.stats.speed)}</div><div class="stat">Ausdauer ${pip(h.stats.stamina)}</div><div class="stat">Wendigkeit ${pip(h.stats.agility)}</div>
      <div class="desc">${esc(br.desc)}</div>${extra}`;
  }

  renderBuy(el, refresh, focusId) {
    const g = this.game, s = g.state;
    el.innerHTML = `<p class="muted">Kontostand: <b>${formatMoney(s.money)}</b> · Stallplätze: ${s.horses.length}/${g.ranch.capacity()} · Jeden Tag neue Pferde!</p><div class="grid"></div>`;
    const grid = el.querySelector('.grid');
    for (const h of this.saleList) {
      const c = document.createElement('div');
      c.className = 'card' + (h.id === focusId ? ' sel' : '');
      c.innerHTML = this.horseCard(h, `<div class="row"><span class="price">${formatMoney(h.price)}</span></div>`);
      const b = document.createElement('button');
      b.className = 'btn gold small'; b.textContent = 'Kaufen';
      b.onclick = () => {
        if (s.horses.length >= g.ranch.capacity()) { g.ui.toast('Dein Stall ist voll! Baue einen zweiten Stall oder eine Weide.'); return; }
        if (!g.spend(h.price)) return;
        const data = { ...h }; delete data.price;
        data.tack = { saddle: null, bridle: null, pad: null, breast: null, wraps: null, mask: null };
        s.horses.push(data);
        this.saleList = this.saleList.filter((x) => x !== h);
        const ent = this.saleHorses.find((e) => e.data.id === h.id);
        if (ent) { ent.dispose(); this.saleHorses = this.saleHorses.filter((e) => e !== ent); }
        const nh = g.spawnHorse(data);
        g.ui.toast(`🎉 ${data.name} gehört jetzt dir! Lucía bringt ${data.gender === 'Stute' ? 'sie' : 'ihn'} zu deiner Koppel.`, 'gold');
        g.audio.fanfare();
        g.events.emit('horseBought', nh);
        refresh();
      };
      c.querySelector('.row').appendChild(b);
      grid.appendChild(c);
    }
  }

  renderSell(el, refresh) {
    const g = this.game, s = g.state;
    el.innerHTML = '<p class="muted">Lucía zahlt einen fairen Preis – abhängig von Rasse, Werten und Ausbildung.</p><div class="grid"></div>';
    const grid = el.querySelector('.grid');
    for (const h of s.horses) {
      const price = Math.round((BREEDS[h.breed].price * 0.6 + (h.xp || 0) * 2) / 10) * 10;
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = this.horseCard(h, `<div class="row"><span class="price">${formatMoney(price)}</span></div>`);
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = 'Verkaufen';
      b.disabled = s.horses.length <= 1 || (g.player.horse && g.player.horse.data.id === h.id);
      b.onclick = () => {
        if (!confirm(`Möchtest du ${h.name} wirklich verkaufen?`)) return;
        g.removeHorse(h.id);
        if (s.activeHorse === h.id) s.activeHorse = s.horses[0].id;
        g.addMoney(price, `${h.name} verkauft`);
        refresh();
      };
      c.querySelector('.row').appendChild(b);
      grid.appendChild(c);
    }
  }
}
