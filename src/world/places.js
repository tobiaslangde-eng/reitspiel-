import * as THREE from 'three';
import { heightAt, normalAt, POOL, SHELF, canyonFactor, roadDist, riverInfo } from './terrain.js';
import { mat, shadowAll, rand, pick } from '../core/utils.js';
import { boxGeo, woodMat, lantern, log, sign, barrel, wagonWheel } from './props.js';
import { westernBuilding } from './buildings.js';
import { mulberry32 } from '../core/noise.js';
import { ITEMS } from '../game/catalog.js';

function findLow(cx, cz, rad, maxH) {
  let best = null, bh = 1e9;
  const r = mulberry32(5);
  for (let i = 0; i < 1500; i++) {
    const x = cx + (r() - 0.5) * rad * 2, z = cz + (r() - 0.5) * rad * 2;
    const h = heightAt(x, z);
    if (h < 1 || h > maxH) continue;
    const n = normalAt(x, z);
    if (n.y < 0.9) continue;
    const d = Math.hypot(x - cx, z - cz);
    if (d < bh) { bh = d; best = { x, z }; }
  }
  return best || { x: cx, z: cz };
}

export class Places {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    const mine = findLow(560, 60, 120, 9);
    const arch = findLow(150, 640, 60, 20);
    const ghost = findLow(430, 500, 60, 20);
    const spring = findLow(80, -320, 60, 40);
    this.list = [
      { id: 'waterfall', name: 'Donnernder Wasserfall', icon: '💦', x: POOL.x, z: POOL.z + 8, r: 30, desc: 'Ein tosender Wasserfall stürzt aus den Bergen.' },
      { id: 'ledge', name: 'Geheimer Bergsee', icon: '🏞️', x: SHELF.x, z: SHELF.z, r: 14, desc: 'Ein stiller See hoch über dem Wasserfall.' },
      { id: 'mine', name: 'Verlassene Goldmine', icon: '⛏️', x: mine.x, z: mine.z, r: 18, desc: 'Tief in den roten Canyons rostet eine alte Mine.' },
      { id: 'arch', name: 'Steinbogen der Wüste', icon: '🌄', x: arch.x, z: arch.z, r: 20, desc: 'Ein gewaltiger Felsbogen aus rotem Stein.' },
      { id: 'ghost', name: 'Geisterstadt Rattlesnake', icon: '👻', x: ghost.x, z: ghost.z, r: 28, desc: 'Verlassene Häuser, in denen der Wind heult.' },
      { id: 'spring', name: 'Heiße Quelle', icon: '♨️', x: spring.x, z: spring.z, r: 14, desc: 'Dampfendes Wasser am Fuß der Berge.' },
      { id: 'mesa', name: 'Adlerfelsen', icon: '🦅', x: 180, z: 300, r: 55, desc: 'Ein mächtiger Tafelberg – Heimat der Adler.' },
      { id: 'oak', name: 'Der alte Wächterbaum', icon: '🌳', x: -205, z: 150, r: 16, desc: 'Ein riesiger, uralter Baum – angeblich 500 Jahre alt.' },
      { id: 'chapel', name: 'Alte Missionskapelle', icon: '⛪', x: -330, z: -160, r: 20, desc: 'Ruinen einer Kapelle mitten im Wald.' },
      { id: 'petrified', name: 'Versteinerter Wald', icon: '🪨', x: -260, z: 520, r: 22, desc: 'Uralte Baumstämme, zu Stein geworden.' },
    ];
    for (const p of this.list) { const fl = findLow(p.x, p.z, 8, 200); if (p.id !== 'waterfall' && p.id !== 'ledge' && p.id !== 'mesa') { p.x = fl.x; p.z = fl.z; } }
    this.buildAll();
    this.treasureObj = null;
    this.spots = this.makeTreasureSpots();
    this.sparkT = 0;
  }

  y(x, z) { return heightAt(x, z); }
  add(o, x, z, rot = 0, col = null) {
    o.position.set(x, this.y(x, z), z); o.rotation.y = rot; this.scene.add(o);
    if (col) this.game.colliders.addBox(x, z, col[0], col[1], rot);
    return o;
  }

  buildAll() {
    const P = Object.fromEntries(this.list.map((p) => [p.id, p]));
    // Mine
    {
      const p = P.mine;
      const g = new THREE.Group();
      const w = woodMat(0x5a3a22);
      for (const x of [-1.4, 1.4]) { const post = new THREE.Mesh(boxGeo(0.3, 3, 0.3), w); post.position.set(x, 1.5, 0); g.add(post); }
      const top = new THREE.Mesh(boxGeo(3.4, 0.35, 0.35), w); top.position.y = 3; g.add(top);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(4, 1), mat(0x9a5a3a, { roughness: 1 })); rock.position.set(0, 2, -3.5); rock.scale.set(1.3, 1, 1); g.add(rock);
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.8), mat(0x050302)); dark.position.set(0, 1.4, 0.05); g.add(dark);
      for (const x of [-0.5, 0.5]) { const rail = new THREE.Mesh(boxGeo(0.06, 0.06, 8), mat(0x5a4a40, { metalness: 0.6 })); rail.position.set(x, 0.05, 4); g.add(rail); }
      for (let i = 0; i < 9; i++) { const tie = new THREE.Mesh(boxGeo(1.4, 0.08, 0.2), w); tie.position.set(0, 0.03, i * 0.9 + 0.3); g.add(tie); }
      const cart = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(1.1, 0.7, 1.4), mat(0x6a5040, { metalness: 0.4 })); body.position.y = 0.6; cart.add(body);
      const gold = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat(0xe8b830, { metalness: 1, roughness: 0.3 })); gold.position.y = 1.0; gold.scale.set(1.2, 0.5, 1.5); cart.add(gold);
      for (const [x, z] of [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 10), mat(0x2a2a2a)); wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.18, z); cart.add(wh); }
      cart.position.set(0, 0, 3.5); g.add(cart);
      const l = lantern(); l.position.set(2, 0, 0.6); g.add(l);
      const s = sign('KEEP OUT', 1.6, 0.4); s.position.set(-2.2, 1.2, 0.4); s.rotation.z = 0.15; g.add(s);
      shadowAll(g);
      this.add(g, p.x, p.z, Math.random() * 6, [2, 1]);
    }
    // Arch
    {
      const p = P.arch;
      const g = new THREE.Group();
      const m = mat(0xb5603a, { roughness: 1 });
      for (const s of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 14, 9, 4), m);
        pillar.position.set(s * 9, 7, 0); g.add(pillar);
        this.game.colliders.addCircle(p.x + s * 9, p.z, 3);
      }
      const arc = new THREE.Mesh(new THREE.TorusGeometry(9, 2.2, 8, 20, Math.PI), m);
      arc.position.y = 13; arc.scale.y = 0.6; g.add(arc);
      g.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (1 + Math.sin(pos.getY(i) * 1.7) * 0.06), pos.getY(i), pos.getZ(i) * (1 + Math.cos(pos.getX(i)) * 0.08));
        o.geometry.computeVertexNormals();
      });
      shadowAll(g);
      this.add(g, p.x, p.z, 0.4);
    }
    // Ghost town
    {
      const p = P.ghost;
      const r = mulberry32(9);
      for (let i = 0; i < 5; i++) {
        const b = westernBuilding({ w: 7 + r() * 3, d: 8, h: 3.5, sign: ['SALOON', 'BANK', 'HOTEL', 'GENERAL', 'JAIL'][i], color: 0x6a5a4a, trim: 0x8a7a6a, roofColor: 0x3a3430 });
        const side = i % 2 ? 1 : -1;
        const x = p.x - 20 + i * 10, z = p.z + side * 10;
        b.group.rotation.z = (r() - 0.5) * 0.08;
        b.group.traverse((o) => { if (o.isMesh && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.7); } });
        this.add(b.group, x, z, side > 0 ? Math.PI : 0, [b.hw, b.hd]);
      }
      const ww = new THREE.Group(); const wh = wagonWheel(0.7); wh.rotation.x = Math.PI / 2 - 0.1; wh.position.y = 0.1; ww.add(wh); this.add(ww, p.x + 3, p.z, 0);
      this.add(barrel(0x5a4030), p.x - 4, p.z + 3, 0.3, [0.4, 0.4]);
      this.tumbleweeds = [];
      for (let i = 0; i < 4; i++) {
        const tw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: 0xa08a5a, wireframe: true }));
        tw.position.set(p.x + rand(-20, 20), 0, p.z + rand(-6, 6));
        this.scene.add(tw);
        this.tumbleweeds.push({ m: tw, home: { x: p.x, z: p.z }, v: rand(1, 3) });
      }
    }
    // Hot spring
    {
      const p = P.spring;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3.5, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4ac0c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85, emissive: 0x0a3a40 }));
      this.add(pool, p.x, p.z);
      pool.position.y += 0.08;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.3, 0), mat(0xd8d0c0));
        this.add(st, p.x + Math.cos(a) * 3.8, p.z + Math.sin(a) * 3.8, a);
      }
      this.springPos = new THREE.Vector3(p.x, this.y(p.x, p.z), p.z);
    }
    // Great oak
    {
      const p = P.oak;
      const g = new THREE.Group();
      const bark = mat(0x4a3424, { roughness: 1 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 7, 12), bark); trunk.position.y = 3.5; g.add(trunk);
      for (let i = 0; i < 6; i++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 6, 8), bark);
        br.position.set(Math.cos(i) * 2, 7.5, Math.sin(i) * 2); br.rotation.set(Math.sin(i) * 0.8, 0, Math.cos(i) * 0.8); g.add(br);
      }
      this.oakLeaves = [];
      for (let i = 0; i < 10; i++) {
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 1.5, 1), new THREE.MeshStandardMaterial({ color: 0x3a6a24, roughness: 0.9 }));
        l.position.set(Math.cos(i * 1.3) * 5, 10 + Math.sin(i * 2.1) * 2, Math.sin(i * 1.3) * 5); g.add(l);
        this.oakLeaves.push(l);
      }
      const swing = new THREE.Group();
      for (const x of [-0.4, 0.4]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 4.5), mat(0xc8b080)); rope.position.set(x, 3.4, 0); swing.add(rope); }
      const seat = new THREE.Mesh(boxGeo(1.0, 0.06, 0.35), woodMat(0x7a5030)); seat.position.y = 1.15; swing.add(seat);
      swing.position.set(4, 0, 1); g.add(swing);
      this.swing = swing;
      shadowAll(g);
      this.add(g, p.x, p.z, 0);
      this.game.colliders.addCircle(p.x, p.z, 1.6);
    }
    // Chapel ruins
    {
      const p = P.chapel;
      const g = new THREE.Group();
      const st = mat(0xb8a890, { roughness: 1 });
      const walls = [[0, -5, 8, 0.6, 5], [-4, 0, 0.6, 10, 4], [4, 0, 0.6, 10, 3], [-2.6, 5, 2.4, 0.6, 4.5], [2.6, 5, 2.4, 0.6, 2.5]];
      for (const [x, z, w, d, h] of walls) { const m = new THREE.Mesh(boxGeo(w, h, d), st); m.position.set(x, h / 2, z); g.add(m); this.game.colliders.addBox(p.x + x, p.z + z, w / 2, d / 2); }
      const tower = new THREE.Mesh(boxGeo(2.4, 7, 2.4), st); tower.position.set(0, 3.5, -6); g.add(tower);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 0.6, 12, 1, true), mat(0xa08040, { metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide })); bell.position.set(0, 6.2, -6); g.add(bell);
      const cross = new THREE.Group(); const c1 = new THREE.Mesh(boxGeo(0.15, 1.2, 0.15), woodMat(0x4a3020)); const c2 = new THREE.Mesh(boxGeo(0.7, 0.15, 0.15), woodMat(0x4a3020)); c2.position.y = 0.25; cross.add(c1, c2); cross.position.set(0, 7.6, -6); g.add(cross);
      shadowAll(g);
      this.add(g, p.x, p.z, 0);
      this.bellPos = new THREE.Vector3(p.x, this.y(p.x, p.z) + 6, p.z - 6);
    }
    // Petrified forest
    {
      const p = P.petrified;
      const r = mulberry32(3);
      for (let i = 0; i < 9; i++) {
        const l = log(2 + r() * 3, 0.35 + r() * 0.2);
        l.traverse((o) => { if (o.isMesh) o.material = mat([0x9a7aa0, 0xb88a6a, 0x8a8a9a, 0xc0a080][i % 4], { roughness: 0.6, metalness: 0.1 }); });
        this.add(l, p.x + (r() - 0.5) * 30, p.z + (r() - 0.5) * 30, r() * 6);
      }
    }
    // Mesa: eagle nest marker (on the top)
    {
      const p = P.mesa;
      const nest = new THREE.Group();
      const n = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.3, 6, 14), mat(0x6a5030, { roughness: 1 })); n.rotation.x = Math.PI / 2; nest.add(n);
      for (let i = 0; i < 2; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xf0ece0)); e.position.set(i * 0.25 - 0.1, 0.1, 0); e.scale.y = 1.3; nest.add(e); }
      this.add(nest, p.x, p.z, 0);
    }
    // Eagles circling over the canyon & mesa
    this.eagles = [];
    for (const c of [[P.mesa.x, P.mesa.z, 70], [560, 0, 90], [-150, -480, 80]]) {
      const e = new THREE.Group();
      const m = mat(0x3a2a1a);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 6), m); body.rotation.x = Math.PI / 2; e.add(body);
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.4), m);
        w.geometry.translate(s * 0.7, 0, 0);
        e.add(w); wings.push(w);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat(0xf0ece0)); head.position.z = 0.45; e.add(head);
      this.scene.add(e);
      this.eagles.push({ g: e, wings, cx: c[0], cz: c[1], h: c[2], a: Math.random() * 6, r: 40 + Math.random() * 30 });
    }
  }

  makeTreasureSpots() {
    const r = mulberry32(77);
    const out = [];
    let tries = 0;
    while (out.length < 40 && tries < 5000) {
      tries++;
      const x = (r() - 0.5) * 1300, z = (r() - 0.5) * 1300;
      const h = heightAt(x, z);
      if (h < 1 || h > 60) continue;
      if (normalAt(x, z).y < 0.88) continue;
      if (roadDist(x, z) < 15 || riverInfo(x, z).d < 15) continue;
      if (Math.hypot(x, z) < 110 || Math.hypot(x - 300, z + 120) < 120) continue;
      out.push({ x, z, canyon: canyonFactor(x, z) > 0.5 });
    }
    return out;
  }

  buyTreasureMap() {
    const g = this.game, s = g.state;
    if (s.treasure) { g.ui.toast('Du hast schon eine Schatzkarte! Finde erst diesen Schatz (Karte: M).'); return; }
    if (!g.spend(150)) return;
    this.newTreasure();
    g.ui.toast('🗺️ Schatzkarte gekauft! Öffne die Karte (M), um das Gebiet zu sehen.', 'gold');
  }

  newTreasure() {
    const s = this.game.state;
    const spot = pick(this.spots);
    const a = Math.random() * Math.PI * 2, off = rand(5, 28);
    s.treasure = { x: spot.x, z: spot.z, cx: spot.x + Math.cos(a) * off, cz: spot.z + Math.sin(a) * off, r: 40 };
  }

  update(dt) {
    const g = this.game, s = g.state;
    const p = g.player.position;
    for (const pl of this.list) {
      if (s.discovered.includes(pl.id)) continue;
      if (Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r) this.discover(pl);
    }
    // treasure sparkle hint
    if (s.treasure) {
      const d = Math.hypot(p.x - s.treasure.x, p.z - s.treasure.z);
      this.sparkT -= dt;
      if (d < 18 && this.sparkT < 0) {
        this.sparkT = 0.3;
        g.fx.sparkle(new THREE.Vector3(s.treasure.x, this.y(s.treasure.x, s.treasure.z), s.treasure.z), 4);
      }
    }
    // ambient life
    for (const e of this.eagles) {
      e.a += dt * 0.25;
      const x = e.cx + Math.cos(e.a) * e.r, z = e.cz + Math.sin(e.a) * e.r;
      e.g.position.set(x, heightAt(e.cx, e.cz) + e.h, z);
      e.g.rotation.y = -e.a;
      e.g.rotation.z = -0.3;
      const flap = Math.sin(g.time * 3) * 0.15;
      e.wings[0].rotation.z = flap; e.wings[1].rotation.z = -flap;
    }
    if (this.tumbleweeds) for (const t of this.tumbleweeds) {
      t.m.position.x += t.v * dt;
      if (t.m.position.x > t.home.x + 30) t.m.position.x = t.home.x - 30;
      t.m.position.y = heightAt(t.m.position.x, t.m.position.z) + 0.5 + Math.abs(Math.sin(g.time * 3 + t.v)) * 0.4;
      t.m.rotation.z -= t.v * dt * 2;
    }
    if (this.swing) this.swing.rotation.x = Math.sin(g.time * 1.2) * 0.15;
    if (this.springPos && g.player.position.distanceTo(this.springPos) < 80 && Math.random() < 0.4) {
      g.fx.dust.emit(this.springPos.x + rand(-3, 3), this.springPos.y + 0.2, this.springPos.z + rand(-3, 3), 0, rand(0.4, 0.9), 0, rand(2, 4), rand(0.8, 1.6), 1, 1, 1, 0.25, 3, 0);
    }
    if (this.oakLeaves && this.lastSeason !== g.season) {
      this.lastSeason = g.season;
      const c = { spring: 0x5a9a30, summer: 0x3a6a24, autumn: 0xc8641a, winter: 0x8a8a80 }[g.season];
      for (const l of this.oakLeaves) { l.material.color.setHex(c); l.visible = g.season !== 'winter'; }
    }
  }

  discover(pl) {
    const g = this.game, s = g.state;
    s.discovered.push(pl.id);
    g.ui.banner(`${pl.icon} ${pl.name}`, 'Neuer Ort entdeckt! ' + pl.desc, 4);
    g.addMoney(75, 'Entdeckerbonus');
    g.audio.fanfare();
    if (pl.id === 'chapel') g.audio.bell();
    g.events.emit('discover', pl);
  }

  interactables(p) {
    const s = this.game.state;
    const out = [];
    if (s.treasure && p.mode === 'foot') {
      out.push({ x: s.treasure.x, z: s.treasure.z, r: 3, label: 'Nach dem Schatz graben ⛏️', action: () => this.dig() });
    } else if (s.treasure && p.mode === 'ride') {
      const d = Math.hypot(p.position.x - s.treasure.x, p.position.z - s.treasure.z);
      if (d < 5) out.push({ x: s.treasure.x, z: s.treasure.z, r: 5, label: 'Hier funkelt etwas … absteigen zum Graben', action: () => p.dismount() });
    }
    if (this.springPos && p.mode === 'ride') out.push({ x: this.springPos.x, z: this.springPos.z, r: 6, label: 'Pferd in der warmen Quelle entspannen lassen', action: () => {
      const h = p.horse; h.data.needs.clean = Math.min(100, h.data.needs.clean + 40); h.data.needs.happy = 100; h.stamina = h.maxStamina();
      this.game.fx.hearts(h); this.game.ui.toast(`${h.data.name} genießt das warme Wasser. ♨️ Ausdauer voll!`);
    } });
    return out;
  }

  dig() {
    const g = this.game, s = g.state;
    const t = s.treasure;
    g.player.rider.play('dig', 2.2);
    g.audio.dig();
    g.player.faceTowards(t);
    setTimeout(() => {
      const pos = new THREE.Vector3(t.x, this.y(t.x, t.z), t.z);
      const chest = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(0.9, 0.5, 0.6), woodMat(0x6a3a1a)); body.position.y = 0.25; chest.add(body);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI), woodMat(0x6a3a1a)); lid.rotation.z = Math.PI / 2; lid.position.y = 0.5; chest.add(lid);
      const band = new THREE.Mesh(boxGeo(0.95, 0.06, 0.62), mat(0xd0a040, { metalness: 0.9, roughness: 0.3 })); band.position.y = 0.45; chest.add(band);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd060 })); glow.position.y = 0.55; glow.scale.set(1.2, 0.4, 0.8); chest.add(glow);
      shadowAll(chest);
      chest.position.copy(pos); chest.rotation.y = g.player.heading + Math.PI;
      this.scene.add(chest);
      g.fx.sparkle(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 60);
      g.fx.burst(pos, undefined, 20, 0.5);
      const money = Math.round(rand(200, 650) / 10) * 10;
      const rares = ['saddle_gold', 'pad_sunset', 'bridle_turq', 'breast_turq', 'mask_purple', 'hat_white', 'boots_turq'].filter((id) => ITEMS[id] && !s.owned.includes(id));
      let extra = '';
      if (rares.length && Math.random() < 0.45) { const id = pick(rares); s.owned.push(id); extra = ` + <b>${ITEMS[id].name}</b>`; }
      s.items.treat = (s.items.treat || 0) + 3;
      g.addMoney(money, 'Schatz gefunden!');
      g.ui.banner('💰 Schatz gefunden!', `$${money}${extra.replace(/<[^>]+>/g, '')} und 3 Leckerlis`, 4);
      g.audio.fanfare();
      s.stats.treasures++;
      s.treasure = null;
      g.events.emit('treasure', { money });
      setTimeout(() => this.scene.remove(chest), 20000);
    }, 2200);
  }

  markers() {
    const s = this.game.state;
    const out = [];
    for (const p of this.list) if (s.discovered.includes(p.id)) out.push({ x: p.x, z: p.z, icon: p.icon, size: 13 });
    if (s.treasure) out.push({ x: s.treasure.cx, z: s.treasure.cz, icon: '❌', size: 14, edge: true });
    return out;
  }
}

