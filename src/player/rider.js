import * as THREE from 'three';
import { canvasTexture, damp, lerp } from '../core/utils.js';
import { ITEMS } from '../game/catalog.js';

const SKIN = 0xf0c4a0;

function plaidTexture(base, line) {
  const b = '#' + new THREE.Color(base).getHexString();
  const l = '#' + new THREE.Color(line).getHexString();
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = b; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.55; g.fillStyle = l;
    for (let i = 0; i < w; i += 32) { g.fillRect(i, 0, 10, h); g.fillRect(0, i, w, 10); }
    g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
    for (let i = 16; i < w; i += 32) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); }
  }, { repeat: true });
}

function capsule(r, len, mat, segs = 10) {
  const g = new THREE.CapsuleGeometry(r, len, 4, segs);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function hatGeo() {
  // Cowboy hat via lathe + curled brim
  const pts = [];
  pts.push(new THREE.Vector2(0.0, 0.13));
  pts.push(new THREE.Vector2(0.05, 0.125));
  pts.push(new THREE.Vector2(0.085, 0.135));
  pts.push(new THREE.Vector2(0.1, 0.11));
  pts.push(new THREE.Vector2(0.105, 0.02));
  pts.push(new THREE.Vector2(0.11, 0.0));
  pts.push(new THREE.Vector2(0.19, -0.005));
  pts.push(new THREE.Vector2(0.21, 0.01));
  pts.push(new THREE.Vector2(0.205, 0.0));
  pts.push(new THREE.Vector2(0.11, -0.012));
  pts.push(new THREE.Vector2(0.0, -0.012));
  const g = new THREE.LatheGeometry(pts, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const r = Math.hypot(x, z);
    if (r > 0.11) {
      // curl the sides up, front/back stay low
      const side = Math.abs(x) / r;
      p.setY(i, y + Math.pow((r - 0.11) / 0.1, 2) * 0.07 * side * side);
      p.setZ(i, z * 1.12);
    }
    // crown pinch (dent) at the top front
    if (y > 0.1 && r < 0.1) p.setY(i, y - Math.max(0, 0.03 - Math.abs(x) * 0.25));
  }
  g.computeVertexNormals();
  return g;
}

export class Rider {
  constructor(scene, outfit) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.mats = {
      skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: 0xa83228, roughness: 0.85 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x2e4468, roughness: 0.9 }),
      boots: new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.45 }),
      hat: new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.8, side: THREE.DoubleSide }),
      band: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.6 }),
      vest: new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.75, side: THREE.DoubleSide }),
      chaps: new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.7 }),
      scarf: new THREE.MeshStandardMaterial({ color: 0xc0282a, roughness: 0.8, side: THREE.DoubleSide }),
      eye: new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.2 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.25 }),
      lips: new THREE.MeshStandardMaterial({ color: 0xc06060, roughness: 0.6 }),
    };
    this.build();
    this.pose = 'stand';
    this.t = 0;
    this.walkPhase = 0;
    this.action = null;
    this.actionT = 0;
    this.setOutfit(outfit);
  }

  build() {
    const M = this.mats;
    const pelvis = new THREE.Group();
    this.root.add(pelvis);
    this.pelvis = pelvis;
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), M.pants);
    hips.scale.set(1.1, 0.75, 0.85); hips.castShadow = true;
    pelvis.add(hips);

    const spine = new THREE.Group(); spine.position.y = 0.05; pelvis.add(spine); this.spine = spine;
    const torso = capsule(0.135, 0.3, M.shirt, 12); torso.position.y = 0.42; torso.scale.set(1.05, 1, 0.78); spine.add(torso);
    this.torso = torso;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), M.shirt); chest.position.set(0, 0.3, 0.035); chest.scale.set(1.0, 0.6, 0.65); spine.add(chest);
    // vest
    const vestG = new THREE.CylinderGeometry(0.15, 0.142, 0.36, 14, 1, true, 0.35, Math.PI * 2 - 0.7);
    const vest = new THREE.Mesh(vestG, M.vest); vest.position.y = 0.26; vest.scale.z = 0.8; vest.castShadow = true;
    spine.add(vest); this.vest = vest;
    this.fringe = new THREE.Group(); spine.add(this.fringe);
    for (let i = 0; i < 18; i++) {
      const a = 0.4 + (i / 17) * (Math.PI * 2 - 0.8);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.004), M.vest);
      f.position.set(Math.sin(a) * 0.145, 0.05, Math.cos(a) * 0.115); f.rotation.y = a;
      this.fringe.add(f);
    }
    // neck & head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), M.skin); neck.position.y = 0.5; spine.add(neck);
    const scarf = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.12, 3, 1, true), M.scarf);
    scarf.position.set(0, 0.42, 0.07); scarf.rotation.x = Math.PI + 0.5; scarf.scale.set(1.2, 1, 0.5);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 6, 14), M.scarf); knot.position.y = 0.48; knot.rotation.x = Math.PI / 2;
    this.scarf = new THREE.Group(); this.scarf.add(scarf, knot); spine.add(this.scarf);

    const head = new THREE.Group(); head.position.y = 0.56; spine.add(head); this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), M.skin); skull.position.y = 0.1; skull.scale.set(0.92, 1.05, 1); skull.castShadow = true; head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), M.skin); jaw.position.set(0, 0.05, 0.025); jaw.scale.set(0.95, 0.9, 1); head.add(jaw);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), M.eye); e.position.set(s * 0.036, 0.11, 0.093); head.add(e);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.006, 0.01), M.hair); brow.position.set(s * 0.037, 0.135, 0.095); brow.rotation.z = s * -0.15; head.add(brow);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf0a090, roughness: 0.8, transparent: true, opacity: 0.45 }));
      cheek.position.set(s * 0.055, 0.075, 0.085); cheek.scale.z = 0.4; head.add(cheek);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.skin); nose.position.set(0, 0.085, 0.105); nose.scale.set(0.8, 1, 1.1); head.add(nose);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10, Math.PI), M.lips); mouth.position.set(0, 0.055, 0.098); mouth.rotation.z = Math.PI; head.add(mouth);
    // hair: cap + braid
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M.hair);
    hairCap.position.set(0, 0.11, -0.008); hairCap.rotation.x = -0.35; hairCap.scale.set(0.95, 1.05, 1.05); head.add(hairCap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), M.hair); back.position.set(0, 0.08, -0.04); back.scale.set(0.95, 1.0, 0.8); head.add(back);
    this.braid = new THREE.Group(); this.braid.position.set(0, 0.04, -0.09); head.add(this.braid);
    let par = this.braid;
    this.braidSegs = [];
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group(); seg.position.y = i ? -0.055 : 0; par.add(seg);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03 - i * 0.003, 8, 6), M.hair); b.scale.set(1, 1.3, 1); b.position.y = -0.03; seg.add(b);
      par = seg; this.braidSegs.push(seg);
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.006, 4, 8), M.scarf); tie.position.y = -0.06; par.add(tie);
    // hat
    this.hat = new THREE.Group(); this.hat.position.set(0, 0.17, -0.005); this.hat.rotation.x = -0.12; head.add(this.hat);
    const hm = new THREE.Mesh(hatGeo(), M.hat); hm.castShadow = true; this.hat.add(hm);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.108, 0.022, 24, 1, true), M.band); band.position.y = 0.015; this.hat.add(band);

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.17, 0.43, 0); spine.add(sh);
      const up = capsule(0.042, 0.22, M.shirt); sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.26; sh.add(el);
      const fo = capsule(0.036, 0.2, M.shirt); el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), M.skin); hand.position.y = -0.25; hand.scale.set(0.8, 1.1, 0.6); el.add(hand);
      const handPt = new THREE.Object3D(); handPt.position.y = -0.26; el.add(handPt);
      this.arms.push({ sh, el, side: s, hand: handPt });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.085, -0.02, 0); pelvis.add(hip);
      const th = capsule(0.068, 0.34, M.pants); hip.add(th);
      const chap = capsule(0.078, 0.33, M.chaps); chap.position.y = 0.0; hip.add(chap);
      const kn = new THREE.Group(); kn.position.y = -0.42; hip.add(kn);
      const sh = capsule(0.054, 0.26, M.pants); kn.add(sh);
      const chap2 = capsule(0.064, 0.25, M.chaps); kn.add(chap2);
      const boot = new THREE.Group(); boot.position.y = -0.3; kn.add(boot);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.055, 0.2, 12), M.boots); shaft.position.y = 0.04; shaft.castShadow = true; boot.add(shaft);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.24), M.boots); foot.position.set(0, -0.07, 0.05); foot.castShadow = true; boot.add(foot);
      const toe = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 8), M.boots); toe.rotation.x = Math.PI / 2; toe.position.set(0, -0.075, 0.2); toe.scale.y = 1; boot.add(toe);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), M.boots); heel.position.set(0, -0.1, -0.05); boot.add(heel);
      const spur = new THREE.Group(); spur.position.set(0, -0.06, -0.09); boot.add(spur);
      const spurBand = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.005, 4, 14, Math.PI), M.silver); spurBand.rotation.x = Math.PI / 2; spurBand.position.z = 0.06; spurBand.rotation.z = Math.PI; spur.add(spurBand);
      const rowel = new THREE.Group(); rowel.position.z = -0.025; spur.add(rowel);
      for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 4), M.silver); p.rotation.x = (k / 6) * Math.PI * 2; p.position.set(0, Math.cos((k / 6) * Math.PI * 2) * 0.015, Math.sin((k / 6) * Math.PI * 2) * 0.015); rowel.add(p); }
      this.legs.push({ hip, kn, boot, side: s, chaps: [chap, chap2], spur, rowel });
    }
  }

  setOutfit(o) {
    this.outfit = o;
    const M = this.mats;
    const get = (slot) => ITEMS[o?.[slot]];
    const hat = get('hat'); this.hat.visible = !!(hat && hat.color);
    if (hat && hat.color) { M.hat.color.setHex(hat.color); M.band.color.setHex(hat.band || 0x2a1a10); }
    const shirt = get('shirt');
    if (shirt) {
      if (M.shirt.map) { M.shirt.map.dispose(); M.shirt.map = null; }
      if (shirt.plaid) { M.shirt.map = plaidTexture(shirt.color, shirt.plaid); M.shirt.color.setHex(0xffffff); }
      else M.shirt.color.setHex(shirt.color);
      M.shirt.needsUpdate = true;
    }
    const vest = get('vest'); this.vest.visible = !!(vest && vest.color); this.fringe.visible = !!(vest && vest.fringe);
    if (vest && vest.color) M.vest.color.setHex(vest.color);
    const pants = get('pants'); if (pants) M.pants.color.setHex(pants.color);
    const chaps = get('chaps'); const hasChaps = !!(chaps && chaps.color);
    this.legs.forEach((l) => l.chaps.forEach((c) => (c.visible = hasChaps)));
    if (hasChaps) M.chaps.color.setHex(chaps.color);
    const boots = get('boots'); if (boots) M.boots.color.setHex(boots.color);
    this.legs.forEach((l) => (l.spur.visible = !!(boots && boots.spurs)));
    const scarf = get('scarf'); this.scarf.visible = !!(scarf && scarf.color);
    if (scarf && scarf.color) M.scarf.color.setHex(scarf.color);
    const hair = get('hair'); if (hair) M.hair.color.setHex(hair.color);
  }

  play(action, dur = 1.2) { this.action = action; this.actionT = 0; this.actionDur = dur; }

  // params: { mode:'ride'|'foot', speed, gait, lean, swing (lasso), time }
  update(dt, p) {
    this.t += dt;
    if (this.action) { this.actionT += dt; if (this.actionT > this.actionDur) this.action = null; }
    const A = this.arms, L = this.legs;
    const k = (v, tgt, s = 12) => damp(v, tgt, s, dt);
    const set = (obj, x, y, z, s = 12) => {
      obj.rotation.x = k(obj.rotation.x, x, s);
      obj.rotation.y = k(obj.rotation.y, y, s);
      obj.rotation.z = k(obj.rotation.z, z, s);
    };
    if (p.mode === 'ride') {
      this.pelvis.position.set(0, 0, 0);
      const bounce = p.gait === 2 ? Math.abs(Math.sin(p.phase * Math.PI * 2)) * 0.02 : 0;
      this.pelvis.position.y = bounce;
      const lean = p.gait >= 3 ? 0.18 + (p.gait === 4 ? 0.12 : 0) : (p.backing ? -0.08 : 0.02);
      set(this.spine, lean + (p.slide ? -0.25 : 0) + Math.sin(p.phase * Math.PI * 2) * (p.gait >= 3 ? 0.05 : 0.01), 0, -p.turn * 0.08);
      L.forEach((l) => {
        set(l.hip, -1.25, 0, l.side * 0.42);
        set(l.kn, 1.45, 0, -l.side * 0.1);
        set(l.boot, -0.25, 0, 0);
      });
      // left hand holds the reins above the horn; right hand on thigh or swinging lasso
      set(A[0].sh, -0.75, 0.0, 0.15); set(A[0].el, -0.9, 0, 0);
      if (this.action === 'lasso' || p.lasso) {
        const a = this.t * 9;
        set(A[1].sh, -2.9, Math.sin(a) * 0.4, -0.3 + Math.cos(a) * 0.3, 20); set(A[1].el, -0.4, 0, 0, 20);
      } else if (this.action === 'wave') {
        set(A[1].sh, -2.6, 0, -0.4); set(A[1].el, -0.6 + Math.sin(this.t * 12) * 0.4, 0, 0);
      } else if (this.action === 'pat') {
        set(A[1].sh, -0.9, 0, -0.1); set(A[1].el, -0.6 + Math.sin(this.t * 14) * 0.25, 0, 0);
      } else {
        set(A[1].sh, -0.55, 0, -0.25); set(A[1].el, -0.9, 0, 0);
      }
      set(this.head, -lean * 0.6, p.look || 0, 0);
    } else {
      // on foot
      const sp = p.speed || 0;
      const running = sp > 3;
      this.walkPhase += dt * (running ? 1.6 : 1.0) * Math.min(sp, 6) * 1.2;
      const ph = this.walkPhase;
      const amp = Math.min(1, sp / 2) * (running ? 0.9 : 0.55);
      const legY = 0.97;
      this.pelvis.position.y = legY + (sp > 0.1 ? Math.abs(Math.sin(ph)) * (running ? 0.05 : 0.02) : 0);
      const crouch = this.action === 'crouch' || p.crouch;
      if (crouch) this.pelvis.position.y = 0.6;
      L.forEach((l, i) => {
        const sw = Math.sin(ph + (i ? Math.PI : 0)) * amp;
        if (crouch) { set(l.hip, -1.4, 0, l.side * 0.15); set(l.kn, 2.0, 0, 0); set(l.boot, -0.6, 0, 0); }
        else {
          set(l.hip, -sw, 0, l.side * 0.04, 18);
          set(l.kn, Math.max(0, Math.sin(ph + (i ? Math.PI : 0) + 1.2)) * amp * 1.4 + 0.05, 0, 0, 18);
          set(l.boot, 0, 0, 0);
        }
      });
      set(this.spine, running ? 0.15 : 0.02, 0, 0);
      const armSw = (i) => Math.sin(ph + (i ? 0 : Math.PI)) * amp * 0.8;
      if (this.action === 'whistle') {
        set(A[1].sh, -2.4, 0, 0.3); set(A[1].el, -1.9, 0, 0);
        set(A[0].sh, armSw(0), 0, 0.1); set(A[0].el, -0.3, 0, 0);
      } else if (this.action === 'brush' || this.action === 'feed' || this.action === 'pat' || this.action === 'hoof') {
        const r = this.action === 'brush' ? Math.sin(this.t * 9) * 0.35 : this.action === 'pat' ? Math.sin(this.t * 12) * 0.2 : 0;
        set(A[1].sh, -1.3 + r, 0.2, -0.1, 20); set(A[1].el, -0.5 - r * 0.5, 0, 0, 20);
        set(A[0].sh, -0.4, 0, 0.1); set(A[0].el, -0.6, 0, 0);
        if (this.action === 'hoof') { set(this.spine, 0.7, 0, 0); set(A[1].sh, -1.0, 0, 0); set(A[0].sh, -1.0, 0, 0); }
      } else if (this.action === 'lasso' || p.lasso) {
        const a = this.t * 9;
        set(A[1].sh, -2.9, Math.sin(a) * 0.4, -0.3 + Math.cos(a) * 0.3, 20); set(A[1].el, -0.4, 0, 0, 20);
        set(A[0].sh, -0.5, 0, 0.2); set(A[0].el, -0.8, 0, 0);
      } else if (this.action === 'dig') {
        const d = Math.sin(this.t * 7) * 0.5;
        set(this.spine, 0.6 + d * 0.3, 0, 0);
        set(A[0].sh, -1.2 + d, 0, 0.1); set(A[1].sh, -1.2 + d, 0, -0.1);
        set(A[0].el, -0.3, 0, 0); set(A[1].el, -0.3, 0, 0);
      } else if (crouch) {
        set(A[0].sh, -1.1, 0, 0.1); set(A[1].sh, -1.2, 0, -0.1); set(A[0].el, -0.4, 0, 0); set(A[1].el, -0.4, 0, 0);
      } else {
        set(A[0].sh, armSw(0), 0, 0.1, 18); set(A[0].el, -0.25 - (running ? 0.9 : 0.1), 0, 0, 18);
        set(A[1].sh, armSw(1), 0, -0.1, 18); set(A[1].el, -0.25 - (running ? 0.9 : 0.1), 0, 0, 18);
      }
      set(this.head, 0, p.look || 0, 0);
    }
    // braid sways
    const swing = Math.sin(this.t * 3) * 0.08 + (p.speed || 0) * 0.02;
    this.braidSegs.forEach((s, i) => { s.rotation.x = lerp(s.rotation.x, 0.15 + swing * (i + 1) * 0.3, 0.2); });
    this.legs.forEach((l) => { l.rowel.rotation.x += dt * (p.speed || 0) * 2; });
  }

  handWorld(i, out = new THREE.Vector3()) { return this.arms[i].hand.getWorldPosition(out); }
}
