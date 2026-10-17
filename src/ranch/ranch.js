import * as THREE from 'three';
import { heightAt, RANCH } from '../world/terrain.js';
import { mat, shadowAll, formatMoney, rand } from '../core/utils.js';
import {
  fence, lantern, rockingChair, flowerPot, flowerBed, barrel, hayBale, wagonWheel, crate, campfire, flames,
  waterTrough, windmill, sign, boxGeo, woodMat, cactus, trophyMesh, ribbonMesh,
} from '../world/props.js';
import { stable, barn, ranchHouse, coveredWagon, roundPen, hayShed, chickenCoop, dogHouse, trophyCabinet } from '../world/buildings.js';
import { ITEMS } from '../game/catalog.js';
import { esc } from '../ui/ui.js';

const RX = RANCH.x, RZ = RANCH.z;

export const BUILDINGS = {
  stable: { name: 'Pferdestall', icon: '🐴', price: 0, desc: 'Platz für 4 Pferde.', start: true },
  paddock: { name: 'Koppel', icon: '🌿', price: 0, desc: 'Hier grasen deine Pferde.', start: true },
  house: { name: 'Ranchhaus mit Veranda', icon: '🏠', price: 2500, desc: 'Gemütliches Blockhaus mit Schaukelstuhl, Kamin und Pokal-Vitrine.' },
  trough: { name: 'Wassertränke & Windrad', icon: '💧', price: 300, desc: 'Pferde auf der Koppel trinken automatisch.' },
  hayshed: { name: 'Heulager', icon: '🌾', price: 700, desc: 'Pferde auf der Koppel bekommen automatisch Heu. Jeden Tag kostenloses Heu.' },
  roundpen: { name: 'Round Pen', icon: '⭕', price: 600, desc: 'Runder Trainingsplatz – Bodenarbeit stärkt die Bindung.' },
  arena: { name: 'Reitplatz', icon: '🏟️', price: 1200, desc: 'Mit Tonnen zum Barrel-Racing-Training.' },
  barn: { name: 'Große Scheune', icon: '🛖', price: 1800, desc: 'Rote Scheune. Eine Stallkatze zieht ein!' },
  pasture: { name: 'Weidefläche', icon: '🌱', price: 900, desc: 'Große Weide: Pferde fressen frisches Gras.' },
  stable2: { name: 'Zweiter Stall', icon: '🏘️', price: 2000, desc: 'Platz für 4 weitere Pferde. Ermöglicht die Fohlenzucht.' },
  coop: { name: 'Hühnerstall', icon: '🐔', price: 400, desc: 'Gackernde Hühner – und frische Eier zum Verkaufen.' },
  doghouse: { name: 'Hundehütte', icon: '🐕', price: 250, desc: 'Buddy, der Ranch-Hund, zieht ein und begleitet dich.' },
  cattle: { name: 'Rinderweide', icon: '🐄', price: 1500, desc: 'Eigene Rinder! Täglicher Verkaufserlös und Lasso-Training.' },
};

const LAYOUT = {
  wagon: { x: RX - 4, z: RZ - 30, rot: 0.3 },
  fire: { x: RX + 6, z: RZ - 20 },
  house: { x: RX, z: RZ - 42, rot: 0 },
  stable: { x: RX - 34, z: RZ - 8, rot: Math.PI / 2 },
  stable2: { x: RX - 34, z: RZ - 34, rot: Math.PI / 2 },
  paddock: { x: RX - 34, z: RZ + 30, w: 34, d: 26 },
  pasture: { x: RX - 62, z: RZ + 66, w: 46, d: 36 },
  trough: { x: RX - 14, z: RZ + 22, rot: Math.PI / 2 },
  hayshed: { x: RX - 50, z: RZ - 52, rot: 0.2 },
  roundpen: { x: RX + 10, z: RZ + 42 },
  arena: { x: RX + 46, z: RZ + 40, w: 40, d: 24 },
  barn: { x: RX + 36, z: RZ - 14, rot: -Math.PI / 2 },
  coop: { x: RX + 24, z: RZ - 44, rot: 0 },
  doghouse: { x: RX + 12, z: RZ - 30, rot: -0.3 },
  cattle: { x: RX + 58, z: RZ - 56, w: 34, d: 26 },
  board: { x: RX + 12, z: RZ - 14 },
};

// Decoration builders
function bench() {
  const g = new THREE.Group();
  const w = woodMat(0x7a5030);
  const seat = new THREE.Mesh(boxGeo(1.8, 0.08, 0.45), w); seat.position.y = 0.45; g.add(seat);
  const back = new THREE.Mesh(boxGeo(1.8, 0.4, 0.06), w); back.position.set(0, 0.75, -0.2); g.add(back);
  for (const x of [-0.8, 0.8]) for (const z of [-0.18, 0.18]) { const l = new THREE.Mesh(boxGeo(0.07, 0.45, 0.07), w); l.position.set(x, 0.22, z); g.add(l); }
  return shadowAll(g);
}
function cactusPot() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.26, 0.45, 12), mat(0xb5562e)); pot.position.y = 0.22; g.add(pot);
  const c = cactus(() => 0.3); c.scale.setScalar(0.35); c.position.y = 0.4; g.add(c);
  return shadowAll(g);
}
function scarecrow() {
  const g = new THREE.Group();
  const w = woodMat(0x6a4426);
  const pole = new THREE.Mesh(boxGeo(0.1, 2.2, 0.1), w); pole.position.y = 1.1; g.add(pole);
  const arm = new THREE.Mesh(boxGeo(1.6, 0.08, 0.08), w); arm.position.y = 1.6; g.add(arm);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.8, 8), mat(0x3a5a9a)); body.position.y = 1.4; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xd8b878)); head.position.y = 2.05; g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 12), mat(0xc8a050)); hat.position.y = 2.35; g.add(hat);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), mat(0xe0c060)); st.position.set(s * 0.85, 1.55, 0); st.rotation.z = s * Math.PI / 2; g.add(st); }
  return shadowAll(g);
}
function signpost() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(boxGeo(0.12, 2.4, 0.12), woodMat(0x6a4426)); pole.position.y = 1.2; g.add(pole);
  const a = sign('STADT →', 1.4, 0.32); a.position.set(0.5, 2.0, 0.08); a.rotation.y = 0.2; g.add(a);
  const b = sign('← CANYON', 1.4, 0.32); b.position.set(-0.5, 1.6, 0.08); b.rotation.y = -0.3; g.add(b);
  const c = sign('RANCH', 1.2, 0.32); c.position.set(0.4, 1.2, 0.08); g.add(c);
  return g;
}
function horseshoe() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(boxGeo(0.12, 1.6, 0.12), woodMat(0x6a4426)); post.position.y = 0.8; g.add(post);
  const board = new THREE.Mesh(boxGeo(0.6, 0.6, 0.06), woodMat(0x8a5a30)); board.position.set(0, 1.5, 0.08); g.add(board);
  const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 16, Math.PI * 1.4), mat(0xd0b060, { metalness: 0.9, roughness: 0.3 }));
  shoe.rotation.z = -Math.PI * 0.2 + Math.PI; shoe.position.set(0, 1.5, 0.13); g.add(shoe);
  return shadowAll(g);
}
function jumpPole(colliders, x, z, rot, y) {
  const g = new THREE.Group();
  const white = mat(0xf2f2f2), red = mat(0xc03030);
  for (const s of [-1, 1]) {
    const std = new THREE.Mesh(boxGeo(0.15, 1.4, 0.15), white); std.position.set(s * 1.6, 0.7, 0); g.add(std);
    const foot = new THREE.Mesh(boxGeo(0.5, 0.1, 0.5), white); foot.position.set(s * 1.6, 0.05, 0); g.add(foot);
  }
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), i ? red : white);
    p.rotation.z = Math.PI / 2; p.position.y = 0.45 + i * 0.4; g.add(p);
  }
  if (colliders) {
    const dx = Math.cos(rot) * 1.6, dz = -Math.sin(rot) * 1.6;
    g.userData.collider = colliders.addSegment(x - dx, z - dz, x + dx, z + dz, 0.4, y + 0.9, 'jump');
  }
  return shadowAll(g);
}

export class Ranch {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.groups = {};
    this.decorObjs = [];
    this.lanterns = [];
    this.placing = null;
    const b = game.state.ranch.buildings;
    this.buildStatic();
    for (const k of Object.keys(BUILDINGS)) if (b[k]) this.construct(k);
    for (const d of game.state.ranch.decor) this.spawnDecor(d);
  }

  has(k) { return !!this.game.state.ranch.buildings[k]; }
  y(x, z) { return heightAt(x, z); }

  add(obj, x, z, rot = 0, collider = null) {
    obj.position.set(x, this.y(x, z), z);
    obj.rotation.y = rot;
    this.scene.add(obj);
    if (collider) this.game.colliders.addBox(x, z, collider[0], collider[1], rot);
    return obj;
  }

  buildStatic() {
    const g = this.game;
    // entrance arch on the road to town
    const ax = RX + 61, az = RZ - 34.5;
    const dir = Math.atan2(-35, 62);
    const arch = new THREE.Group();
    const pm = woodMat(0x5a3a22);
    const archRot = -dir + Math.PI / 2;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 6, 10), pm); p.position.set(s * 4.2, 3, 0); arch.add(p);
      g.colliders.addCircle(ax + Math.cos(archRot) * s * 4.2, az - Math.sin(archRot) * s * 4.2, 0.35);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9.4, 10), pm); beam.rotation.z = Math.PI / 2; beam.position.y = 5.8; arch.add(beam);
    const sg = sign('SILVER SPUR RANCH', 6, 1.0); sg.position.set(0, 4.9, 0.12); arch.add(sg);
    const sg2 = sign('SILVER SPUR RANCH', 6, 1.0); sg2.position.set(0, 4.9, -0.12); sg2.rotation.y = Math.PI; arch.add(sg2);
    const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 16, Math.PI * 1.4), mat(0xd0b060, { metalness: 0.9, roughness: 0.3 }));
    shoe.position.set(0, 6.6, 0); shoe.rotation.z = Math.PI * 0.8; arch.add(shoe);
    shadowAll(arch);
    this.add(arch, ax, az, archRot);

    // starting camp: covered wagon + campfire
    const L = LAYOUT;
    const w = coveredWagon();
    this.wagon = this.add(w.group, L.wagon.x, L.wagon.z, L.wagon.rot, [w.hw, w.hd]);
    const cf = campfire();
    this.fire = this.add(cf, L.fire.x, L.fire.z);
    this.flames = flames();
    this.flames.position.copy(this.fire.position);
    this.scene.add(this.flames);
    g.colliders.addCircle(L.fire.x, L.fire.z, 1.0, this.y(L.fire.x, L.fire.z) + 0.4);
    this.fireLight = new THREE.PointLight(0xff8a3a, 0, 22, 1.6);
    this.fireLight.position.copy(this.fire.position).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(this.fireLight);
    // build board
    const board = new THREE.Group();
    const post = new THREE.Mesh(boxGeo(0.15, 2, 0.15), pm); post.position.set(-0.8, 1, 0); board.add(post);
    const post2 = post.clone(); post2.position.x = 0.8; board.add(post2);
    const s2 = sign('RANCH-AUSBAU', 2.0, 0.9); s2.position.set(0, 1.6, 0.1); board.add(s2);
    this.add(shadowAll(board), L.board.x, L.board.z, -0.6);
    // some ranch ambience
    for (const [x, z, r] of [[RX + 4, RZ - 25, 0.2], [RX - 8, RZ - 22, 1]]) this.add(barrel(), x, z, r, [0.45, 0.45]);
    const l1 = lantern(); this.add(l1, RX + 10, RZ - 22, 0); this.lanterns.push(l1);
    const l2 = lantern(); this.add(l2, RX - 20, RZ - 4, Math.PI); this.lanterns.push(l2);
    const l3 = lantern(); this.add(l3, RX + 58, RZ - 30, -0.5); this.lanterns.push(l3);
    for (let i = 0; i < 4; i++) this.add(hayBale(), RX - 24 + i * 1.3, RZ - 18, 0.1 * i);
    const wb = wagonWheel(0.7); wb.position.y = 0.7; wb.rotation.x = -0.2; const wg = new THREE.Group(); wg.add(wb); this.add(wg, RX - 10, RZ - 34, 0.6);
  }

  construct(k) {
    const L = LAYOUT[k];
    const g = this.game;
    const C = g.colliders;
    let obj;
    switch (k) {
      case 'stable': case 'stable2': {
        const s = stable(4);
        obj = this.add(s.group, L.x, L.z, L.rot, [s.hw, s.hd]);
        break;
      }
      case 'paddock': case 'pasture': {
        const hw = L.w / 2, hd = L.d / 2;
        const pts = [[L.x - hw, L.z - hd], [L.x + hw, L.z - hd], [L.x + hw, L.z + hd], [L.x - hw, L.z + hd], [L.x - hw, L.z - hd]].map(([x, z]) => [x, this.y(x, z), z]);
        obj = fence(pts, { colliders: C, height: 1.4, gateAt: k === 'paddock' ? 1 : 0, white: k === 'pasture' });
        this.scene.add(obj);
        break;
      }
      case 'house': {
        const h = ranchHouse();
        obj = this.add(h.group, L.x, L.z, L.rot, [h.hw, h.hd + 0.3]);
        // porch furniture & trophy cabinet
        const ch = rockingChair(); ch.position.set(3.5, 0.3, h.porchFront - 1.2); ch.rotation.y = 0.4; h.group.add(ch);
        this.chair = ch;
        const tc = trophyCabinet(); tc.group.position.set(-3.6, 0.3, h.hd + 0.6); h.group.add(tc.group);
        this.cabinet = tc.group;
        const fp = flowerPot(0xe04070); fp.position.set(1.5, 0.3, h.porchFront - 0.4); h.group.add(fp);
        const fp2 = flowerPot(0xf0c020); fp2.position.set(-1.5, 0.3, h.porchFront - 0.4); h.group.add(fp2);
        const lan = lantern(); lan.position.set(5.6, 0.3, h.porchFront); lan.rotation.y = Math.PI; h.group.add(lan); this.lanterns.push(lan);
        this.housePorch = h.porchFront;
        this.refreshTrophies();
        break;
      }
      case 'trough': {
        const t = waterTrough();
        obj = this.add(t, L.x, L.z, L.rot, [1.25, 0.45]);
        const wm = windmill();
        this.windmill = this.add(wm, L.x + 4, L.z - 6, 0.4, [0.9, 0.9]);
        break;
      }
      case 'hayshed': {
        const h = hayShed();
        obj = this.add(h.group, L.x, L.z, L.rot, [h.hw, h.hd]);
        break;
      }
      case 'roundpen': {
        obj = roundPen(9, C, L.x, L.z, this.y(L.x, L.z));
        this.scene.add(obj);
        break;
      }
      case 'arena': {
        const hw = L.w / 2, hd = L.d / 2;
        const pts = [[L.x - hw, L.z - hd], [L.x + hw, L.z - hd], [L.x + hw, L.z + hd], [L.x - hw, L.z + hd], [L.x - hw, L.z - hd]].map(([x, z]) => [x, this.y(x, z), z]);
        obj = fence(pts, { colliders: C, height: 1.5, gateAt: 3, white: true, rails: 3 });
        this.scene.add(obj);
        this.arenaBarrels = [];
        for (const [dx, dz] of [[-10, -6], [10, -6], [0, 8]]) {
          const b = barrel(0x2a6aa8); this.add(b, L.x + dx, L.z + dz, 0);
          this.arenaBarrels.push(b);
        }
        const s = sign('REITPLATZ', 3, 0.7); this.add(s, L.x - hw + 1, L.z + hd + 0.4, 0);
        break;
      }
      case 'barn': {
        const b = barn();
        obj = this.add(b.group, L.x, L.z, L.rot, [b.hw, b.hd]);
        break;
      }
      case 'coop': {
        const c = chickenCoop();
        obj = this.add(c.group, L.x, L.z, L.rot, [c.hw, c.hd]);
        const y = this.y(L.x, L.z);
        const r = 6;
        const pts = [];
        for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push([L.x + Math.cos(a) * r, y, L.z + 4 + Math.sin(a) * r]); }
        this.scene.add(fence(pts, { height: 0.8, rails: 2, color: 0x9a7a5a }));
        break;
      }
      case 'doghouse': {
        const d = dogHouse();
        obj = this.add(d.group, L.x, L.z, L.rot, [d.hw, d.hd]);
        break;
      }
      case 'cattle': {
        const hw = L.w / 2, hd = L.d / 2;
        const pts = [[L.x - hw, L.z - hd], [L.x + hw, L.z - hd], [L.x + hw, L.z + hd], [L.x - hw, L.z + hd], [L.x - hw, L.z - hd]].map(([x, z]) => [x, this.y(x, z), z]);
        obj = fence(pts, { colliders: C, height: 1.5, gateAt: 3, rails: 3, color: 0x6a4a30 });
        this.scene.add(obj);
        const t = waterTrough(); this.add(t, L.x + hw - 3, L.z, Math.PI / 2, [1.25, 0.45]);
        break;
      }
      default:
    }
    this.groups[k] = obj;
    if (g.animals && ['coop', 'doghouse', 'barn', 'cattle'].includes(k)) g.animals.onBuilding(k);
  }

  paddockArea() {
    const L = this.has('pasture') ? LAYOUT.pasture : LAYOUT.paddock;
    return { x: L.x, z: L.z, r: Math.min(L.w, L.d) / 2 - 3 };
  }
  cattlePen() { const L = LAYOUT.cattle; return { x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2 }; }
  arenaArea() { return LAYOUT.arena; }

  capacity() { return 4 + (this.has('stable2') ? 4 : 0) + (this.has('pasture') ? 2 : 0); }

  isInside(p, extra = 0) { return Math.hypot(p.x - RX, p.z - RZ) < RANCH.r + extra; }

  fireNear(p) {
    const lit = this.fireLit ? 1 : 0;
    const d = p.distanceTo ? Math.hypot(p.x - this.fire.position.x, p.z - this.fire.position.z) : 99;
    return lit * Math.max(0, 1 - d / 25);
  }

  setNight(n, time) {
    const lit = n > 0.25;
    this.fireLit = lit;
    const flick = 0.8 + Math.sin(time * 13) * 0.1 + Math.sin(time * 7.3) * 0.1;
    this.fireLight.intensity = lit ? 26 * flick * Math.min(1, n * 1.5) : 0;
    this.flames.visible = lit;
    this.flames.userData.mat.uniforms.uTime.value = time;
    this.fire.userData.coal.material.emissiveIntensity = lit ? 1.6 * flick : 0.3;
    if (lit && Math.random() < 0.3) this.game.fx.embers(this.fire.position);
    for (const l of this.lanterns) l.userData.glass.material.emissiveIntensity = lit ? 3 : 0.0;
    for (const d of this.decorObjs) if (d.obj.userData.isLantern) d.obj.userData.glass.material.emissiveIntensity = lit ? 3 : 0;
    if (this.windmill) this.windmill.userData.rotor.rotation.z += 0.02 + this.game.weather.cur.wind * 0.08;
    if (this.chair) this.chair.rotation.x = Math.sin(time * 1.4) * 0.05;
  }

  update(dt) {
    if (this.placing) this.updatePlacing();
  }

  // ------------------------------------------------------------ trophies
  refreshTrophies() {
    if (!this.cabinet) return;
    if (this.trophyGroup) this.cabinet.remove(this.trophyGroup);
    const tg = new THREE.Group();
    const shelves = this.cabinet.userData.shelves;
    const tr = this.game.state.trophies;
    tr.slice(-18).forEach((t, i) => {
      const shelf = shelves[Math.floor(i / 6) % shelves.length];
      const x = -0.8 + (i % 6) * 0.32;
      let m;
      if (t.kind === 'trophy') m = trophyMesh(t.place === 1 ? 'gold' : t.place === 2 ? 'silver' : 'bronze');
      else m = ribbonMesh(t.place === 1 ? 0x2050d0 : t.place === 2 ? 0xd02020 : 0xf0f0f0);
      m.scale.setScalar(t.kind === 'trophy' ? 1.6 : 1.4);
      m.position.set(x, shelf, 0);
      tg.add(m);
    });
    this.cabinet.add(tg);
    this.trophyGroup = tg;
  }

  // ------------------------------------------------------------ interactions
  interactables(p) {
    const g = this.game;
    const out = [];
    const L = LAYOUT;
    out.push({ x: L.board.x, z: L.board.z, r: 4, label: 'Ranch ausbauen', action: () => this.openBuildMenu() });
    if (p.mode === 'foot') {
      const sleepAt = this.has('house') ? { x: L.house.x, z: L.house.z + 7.5, label: 'Im Ranchhaus schlafen' } : { x: L.wagon.x, z: L.wagon.z, label: 'Im Planwagen schlafen' };
      out.push({ ...sleepAt, r: 4, action: () => this.sleep() });
      if (this.cabinet) out.push({ x: L.house.x - 3.6, z: L.house.z + 5, r: 3, label: 'Pokal-Vitrine ansehen', action: () => g.menus.openMain('trophies') });
      if (this.chair) out.push({ x: L.house.x + 3.5, z: L.house.z + 4 + this.housePorch - 4, r: 2.5, label: 'Im Schaukelstuhl ausruhen', action: () => this.rest() });
      out.push({ x: L.stable.x + 3, z: L.stable.z, r: 7, label: 'Stall: Pferde verwalten', action: () => g.menus.openMain('horses') });
      if (this.has('hayshed')) out.push({ x: L.hayshed.x, z: L.hayshed.z + 3, r: 5, label: 'Heu holen', action: () => this.takeHay() });
      if (this.has('coop')) out.push({ x: L.coop.x, z: L.coop.z + 2, r: 4, label: 'Eier einsammeln', action: () => this.collectEggs() });
      for (const d of this.decorObjs) out.push({ x: d.data.x, z: d.data.z, r: 1.6, label: `${ITEMS[d.data.item]?.name || 'Deko'} aufheben`, action: () => this.pickUpDecor(d) });
    }
    if (this.has('roundpen') && p.mode === 'ride') {
      const R = L.roundpen;
      out.push({ x: R.x, z: R.z, r: 8, label: 'Round-Pen-Training (Bindung)', action: () => this.roundPenTraining() });
    }
    return out;
  }

  markers() {
    return [{ x: RX, z: RZ, icon: '🏠', size: 16, edge: true }];
  }

  sleep() {
    const g = this.game;
    const s = g.state;
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    setTimeout(() => {
      if (s.hour > 7) { s.hour = 7; g.newDay(); } else s.hour = 7;
      g.weather.nextChange = 0;
      for (const h of g.horses) h.stamina = h.maxStamina();
      fade.classList.remove('on');
      g.ui.banner('Guten Morgen!', `Tag ${s.day} beginnt.`, 3);
    }, 900);
  }

  rest() {
    const g = this.game;
    g.timeScale = 30;
    g.ui.toast('Du schaukelst gemütlich und schaust in die Ferne … (Bewegen zum Aufstehen)');
    const stop = () => { g.timeScale = 1; };
    const check = setInterval(() => {
      const i = g.input;
      if (i.isDown('KeyW') || i.isDown('KeyA') || i.isDown('KeyS') || i.isDown('KeyD')) { stop(); clearInterval(check); }
    }, 100);
  }

  takeHay() {
    const s = this.game.state;
    if (s.lastHayDay === s.day) { this.game.ui.toast('Heute hast du schon Heu geholt.'); return; }
    s.lastHayDay = s.day;
    s.items.hay = (s.items.hay || 0) + 8;
    this.game.ui.toast('🌾 +8 Heu aus dem Heulager');
  }

  collectEggs() {
    const s = this.game.state;
    if (s.lastEggDay === s.day) { this.game.ui.toast('Die Hühner haben heute schon gelegt.'); return; }
    s.lastEggDay = s.day;
    const n = 3 + Math.floor(Math.random() * 4);
    this.game.addMoney(n * 6, `${n} frische Eier verkauft 🥚`);
    this.game.audio.cluck(this.game.player.pos);
  }

  roundPenTraining() {
    const g = this.game;
    const h = g.player.horse;
    if (!h) return;
    const s = g.state;
    h.data.lastRoundPen = h.data.lastRoundPen || 0;
    if (h.data.lastRoundPen === s.day) { g.ui.toast(`${h.data.name} hat heute schon trainiert.`); return; }
    g.ui.toast('Reite 3 Runden im Round Pen! 🔄');
    const R = LAYOUT.roundpen;
    let ang = null, total = 0;
    const timer = setInterval(() => {
      if (!g.player.horse) { clearInterval(timer); return; }
      const p = g.player.horse.pos;
      const d = Math.hypot(p.x - R.x, p.z - R.z);
      if (d > 10) { clearInterval(timer); g.ui.toast('Training abgebrochen.'); return; }
      const a = Math.atan2(p.z - R.z, p.x - R.x);
      if (ang !== null) { let da = a - ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2; total += Math.abs(da); }
      ang = a;
      if (total > Math.PI * 6) {
        clearInterval(timer);
        h.data.lastRoundPen = s.day;
        h.data.bond = Math.min(100, h.data.bond + 6);
        h.data.stats.agility = Math.min(10, h.data.stats.agility + (Math.random() < 0.25 ? 1 : 0));
        g.fx.hearts(h);
        g.ui.toast(`Super Training! ${h.data.name} vertraut dir mehr. ❤`, 'gold');
        g.events.emit('training', h);
      }
    }, 100);
  }

  // ------------------------------------------------------------ build menu
  openBuildMenu() {
    const g = this.game;
    if (!this.isInside(g.player.position, 40)) { g.ui.toast('Ausbauen kannst du nur auf deiner Ranch.'); return; }
    g.ui.openPanel('Ranch ausbauen', [
      { id: 'build', label: '🏗️ Gebäude', render: (el, refresh) => this.renderBuild(el, refresh) },
      { id: 'decor', label: '🌼 Dekorieren', render: (el, refresh) => this.renderDecor(el, refresh) },
    ]);
  }

  renderBuild(el, refresh) {
    const g = this.game;
    const s = g.state;
    el.innerHTML = `<p class="muted">Kontostand: <b>${formatMoney(s.money)}</b> · Pferdeplätze: ${s.horses.length}/${this.capacity()}</p><div class="grid"></div>`;
    const grid = el.querySelector('.grid');
    for (const [k, b] of Object.entries(BUILDINGS)) {
      const owned = this.has(k);
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `<h3>${b.icon} ${esc(b.name)}</h3><div class="desc">${esc(b.desc)}</div>
        <div class="row">${owned ? '<span class="tag turq">✔ gebaut</span>' : `<span class="price">${formatMoney(b.price)}</span>`}</div>`;
      if (!owned) {
        const btn = document.createElement('button');
        btn.className = 'btn gold small'; btn.textContent = 'Bauen';
        btn.disabled = s.money < b.price;
        btn.onclick = () => {
          if (!g.spend(b.price)) return;
          s.ranch.buildings[k] = 1;
          this.construct(k);
          g.ui.toast(`${b.icon} ${b.name} wurde gebaut!`, 'gold');
          g.audio.fanfare();
          g.events.emit('build', k);
          if (k === 'pasture') for (const h of g.horses) if (h.home) h.home = this.paddockArea();
          refresh();
        };
        c.querySelector('.row').appendChild(btn);
      }
      grid.appendChild(c);
    }
  }

  renderDecor(el, refresh) {
    const g = this.game;
    const s = g.state;
    const decorItems = Object.values(ITEMS).filter((i) => i.type === 'decor');
    el.innerHTML = '<p class="muted">Kaufe Deko im Gemischtwarenladen in der Stadt – oder direkt hier (etwas teurer, +20%). Platziere sie dann auf deiner Ranch. Zum Aufheben gehe hin und drücke E.</p><div class="grid"></div>';
    const grid = el.querySelector('.grid');
    for (const it of decorItems) {
      const n = s.items[it.id] || 0;
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `<h3>${it.icon} ${esc(it.name)}</h3><div class="muted">Im Lager: ${n}</div><div class="row"></div>`;
      const row = c.querySelector('.row');
      const place = document.createElement('button');
      place.className = 'btn turq small'; place.textContent = 'Platzieren'; place.disabled = n <= 0;
      place.onclick = () => { g.ui.closePanel(); this.startPlacing(it.id); };
      const buy = document.createElement('button');
      const price = Math.round(it.price * 1.2);
      buy.className = 'btn small'; buy.textContent = `Kaufen ${formatMoney(price)}`;
      buy.onclick = () => { if (g.spend(price)) { s.items[it.id] = n + 1; refresh(); } };
      row.append(place, buy);
      grid.appendChild(c);
    }
  }

  buildDecor(itemId, x, z, rot) {
    const it = ITEMS[itemId];
    const [name, arg] = it.builder.split(':');
    const C = this.game.colliders;
    const y = this.y(x, z);
    let obj;
    switch (name) {
      case 'lantern': obj = lantern(); break;
      case 'flowerPot': obj = flowerPot(parseInt(arg, 16)); break;
      case 'flowerBed': obj = flowerBed(); break;
      case 'barrel': obj = barrel(); break;
      case 'hayBale': obj = hayBale(); break;
      case 'wheel': { obj = new THREE.Group(); const w = wagonWheel(0.7); w.position.y = 0.7; w.rotation.x = -0.15; obj.add(w); break; }
      case 'rockingChair': obj = rockingChair(); break;
      case 'crate': obj = crate(); break;
      case 'bench': obj = bench(); break;
      case 'cactusPot': obj = cactusPot(); break;
      case 'scarecrow': obj = scarecrow(); break;
      case 'signpost': obj = signpost(); break;
      case 'horseshoe': obj = horseshoe(); break;
      case 'fence': {
        const dx = Math.cos(rot) * 2, dz = -Math.sin(rot) * 2;
        obj = fence([[-dx, 0, -dz], [dx, 0, dz]], { height: 1.3 });
        obj.userData.collider = C.addSegment(x - dx, z - dz, x + dx, z + dz, 0.3, y + 1.3, 'jump');
        obj.position.set(x, y, z);
        this.scene.add(obj);
        return obj;
      }
      case 'jumpPole': obj = jumpPole(C, x, z, rot, y); break;
      default: obj = crate();
    }
    obj.position.set(x, y, z);
    obj.rotation.y = rot;
    this.scene.add(obj);
    if (!obj.userData.collider && name !== 'flowerBed') obj.userData.collider = C.addCircle(x, z, name === 'bench' ? 0.9 : 0.5, y + 1.2);
    return obj;
  }

  spawnDecor(d) {
    const obj = this.buildDecor(d.item, d.x, d.z, d.rot);
    this.decorObjs.push({ data: d, obj });
  }

  pickUpDecor(d) {
    const s = this.game.state;
    this.scene.remove(d.obj);
    if (d.obj.userData.collider) this.game.colliders.remove(d.obj.userData.collider);
    this.decorObjs = this.decorObjs.filter((x) => x !== d);
    s.ranch.decor = s.ranch.decor.filter((x) => x !== d.data);
    s.items[d.data.item] = (s.items[d.data.item] || 0) + 1;
    this.game.ui.toast('Ins Lager gelegt.');
  }

  startPlacing(itemId) {
    const g = this.game;
    if (g.player.mode === 'ride') g.player.dismount();
    this.placing = { item: itemId, rot: g.player.heading };
    this.ghost = this.buildDecor(itemId, 0, 0, 0);
    if (this.ghost.userData.collider) g.colliders.remove(this.ghost.userData.collider);
    this.ghost.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; } });
    g.ui.toast('Platzieren: <b>E</b> abstellen · <b>R</b> drehen · <b>Esc</b> abbrechen');
    this.offKeys = (e) => {
      if (!this.placing) return;
      if (e.code === 'KeyR') this.placing.rot += Math.PI / 8;
      if (e.code === 'Escape') this.cancelPlacing();
      if (e.code === 'KeyE') { e.stopImmediatePropagation(); this.confirmPlacing(); }
    };
    window.addEventListener('keydown', this.offKeys, true);
  }

  updatePlacing() {
    const p = this.game.player;
    const x = p.pos.x + Math.sin(p.heading) * 2.5, z = p.pos.z + Math.cos(p.heading) * 2.5;
    this.ghost.position.set(x, this.y(x, z), z);
    this.ghost.rotation.y = this.placing.rot;
    this.placing.x = x; this.placing.z = z;
    this.game.input.pressed.delete('KeyE');
  }

  confirmPlacing() {
    const g = this.game;
    const pl = this.placing;
    if (!this.isInside({ x: pl.x, z: pl.z }, 10)) { g.ui.toast('Deko kann nur auf deiner Ranch stehen.'); return; }
    const s = g.state;
    s.items[pl.item] = Math.max(0, (s.items[pl.item] || 0) - 1);
    const d = { item: pl.item, x: pl.x, z: pl.z, rot: pl.rot };
    s.ranch.decor.push(d);
    this.spawnDecor(d);
    g.fx.sparkle(new THREE.Vector3(pl.x, this.y(pl.x, pl.z), pl.z), 15);
    g.events.emit('decor', d);
    this.cancelPlacing();
    if ((s.items[d.item] || 0) > 0) this.startPlacing(d.item);
  }

  cancelPlacing() {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.placing = null;
    window.removeEventListener('keydown', this.offKeys, true);
  }

  randomPointInRanch() {
    const a = Math.random() * Math.PI * 2, r = rand(10, 60);
    return { x: RX + Math.cos(a) * r, z: RZ + Math.sin(a) * r };
  }
}
