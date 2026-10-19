import * as THREE from 'three';
import { damp, lerp } from '../core/utils.js';
import { ITEMS } from '../game/catalog.js';
import * as DATA from './rider-data.js';
import { parseMesh, mirrorGeometry, buildSkeleton } from './meshdata.js';
import { makeBodyMaterial, makeSkinMaterial, makeEyeMaterial } from './rider-materials.js';
import { solveLimb } from './rider-ik.js';
import { STAND_HEIGHT } from './skeleton.js';
import { buildRiderHair } from './rider-hair.js';
import { hatGeometry, bandGeometry, makeFeltMaterial, addPlanarUV } from './rider-gear.js';


// geometry is parsed once and shared by every rider (the player and the town folk)
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  const body = parseMesh(DATA.BODY).geometry;
  const head = parseMesh(DATA.HEAD).geometry;
  const handL = parseMesh(DATA.HAND).geometry;
  const eye = new THREE.SphereGeometry(0.0118, 24, 16);
  eye.rotateX(Math.PI / 2); // pole (pupil) towards +z
  GEO = { body, head, handL, handR: mirrorGeometry(handL), eye, hat: addPlanarUV(hatGeometry()), band: bandGeometry() };
  return GEO;
}

// Saddle geometry the legs have to reach (see Tack.saddle): stirrup tread relative to the seat point
const SEAT_OFFSET = { y: 0.078, z: -0.02 }; // pelvis above the seat point
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();

export class Rider {
  constructor(scene, outfit) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    const sk = buildSkeleton(this.root);
    this.B = sk.byName;
    this.skeleton = sk.skeleton;
    this.mats = {
      body: makeBodyMaterial(),
      skin: makeSkinMaterial(),
      eye: makeEyeMaterial(),
      felt: makeFeltMaterial(),
      band: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.55, side: THREE.DoubleSide }),
    };
    this.build();
    this.pose = 'stand';
    this.t = 0;
    this.walkPhase = 0;
    this.action = null;
    this.actionT = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.setOutfit(outfit);
  }

  build() {
    const G = geometries();
    const B = this.B;
    const skinned = (geo, mat) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    this.bodyMesh = skinned(G.body, this.mats.body);
    this.headMesh = skinned(G.head, this.mats.skin);
    this.handMeshes = [skinned(G.handL, this.mats.skin), skinned(G.handR, this.mats.skin)];

    // eyes ride on the head bone
    this.eyes = [];
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(G.eye, this.mats.eye);
      e.position.set(s * 0.0305, 0.0625, 0.0735);
      e.scale.set(1, 1, 1);
      B.head.add(e);
      this.eyes.push(e);
    }

    // hat
    this.hat = new THREE.Group();
    this.hat.position.set(0, 0.112, -0.004);
    this.hat.rotation.x = 0.07;
    B.head.add(this.hat);
    const hm = new THREE.Mesh(G.hat, this.mats.felt); hm.castShadow = true; this.hat.add(hm);
    const bm = new THREE.Mesh(G.band, this.mats.band); this.hat.add(bm);

    this.hair = buildRiderHair(G.head);
    B.head.add(this.hair.group);
    this.braid = this.hair.plait;

    // arms: [0] holds the reins (left hand), [1] is the free hand
    const mkHand = (b) => {
      const pt = new THREE.Object3D();
      pt.position.set(-0.012 * (b.endsWith('L') ? 1 : -1), -0.075, 0.012);
      B[b].add(pt);
      return pt;
    };
    this.arms = [
      { side: 1, up: B.armL, fore: B.foreL, wrist: B.handL, fing: B.fingL, tip: B.tipL, thumb: B.thumbL, hand: mkHand('handL'), clav: B.clavL },
      { side: -1, up: B.armR, fore: B.foreR, wrist: B.handR, fing: B.fingR, tip: B.tipR, thumb: B.thumbR, hand: mkHand('handR'), clav: B.clavR },
    ];
    this.legs = [
      { side: 1, hip: B.hipL, knee: B.kneeL, foot: B.footL },
      { side: -1, hip: B.hipR, knee: B.kneeR, foot: B.footR },
    ];
    this.spine = B.spine;
    this.pelvis = B.pelvis;
    this.head = B.head;
    this.pelvis.position.y = STAND_HEIGHT;
  }

  setOutfit(o) {
    this.outfit = o;
    const U = this.mats.body.userData.uniforms;
    const get = (slot) => ITEMS[o?.[slot]];
    const hat = get('hat');
    this.hat.visible = !!(hat && hat.color);
    if (hat && hat.color) { this.mats.felt.color.setHex(hat.color); this.mats.band.color.setHex(hat.band || 0x2a1a10); }
    const hair = get('hair');
    if (hair && hair.color) this.hair.setColor(hair.color);
    const shirt = get('shirt');
    if (shirt) {
      U.uShirt.value.setHex(shirt.color);
      if (shirt.plaid) { U.uShirtB.value.setHex(shirt.plaid); U.uPlaid.value = 1; } else U.uPlaid.value = 0;
    }
    const pants = get('pants'); if (pants) U.uPants.value.setHex(pants.color);
    const boots = get('boots'); if (boots) U.uBoots.value.setHex(boots.color);
  }

  play(action, dur = 1.2) { this.action = action; this.actionT = 0; this.actionDur = dur; }

  // params: { mode:'ride'|'foot', speed, gait, phase, turn, slide, backing, lasso, crouch, look, bulk, saddle }
  update(dt, p) {
    this.t += dt;
    if (this.action) { this.actionT += dt; if (this.action && this.actionT > this.actionDur) this.action = null; }
    if (p.mode === 'ride') this.poseRide(dt, p); else this.poseFoot(dt, p);
    this.blink(dt);
  }

  blink(dt) {
    this.blinkT -= dt;
    const k = this.blinkT < 0 ? Math.max(0, 1 - Math.abs(this.blinkT + 0.08) / 0.08) : 0;
    this.eyes.forEach((e) => { e.scale.y = 1 - 0.0 * k; });
    if (this.blinkT < -0.16) this.blinkT = 2 + Math.random() * 4;
  }

  // simple damped joint rotation
  rot(bone, x, y, z, rate, dt) {
    bone.rotation.x = damp(bone.rotation.x, x, rate, dt);
    bone.rotation.y = damp(bone.rotation.y, y, rate, dt);
    bone.rotation.z = damp(bone.rotation.z, z, rate, dt);
  }

  grip(arm, amount, dt) {
    const s = arm.side;
    this.rot(arm.fing, 0, 0, -s * (0.25 + amount * 1.15), 14, dt);
    this.rot(arm.tip, 0, 0, -s * (0.35 + amount * 1.25), 14, dt);
    this.rot(arm.thumb, -0.25 * amount, 0, -s * (0.1 + amount * 0.55), 14, dt);
  }

  toWorld(x, y, z, out) { return this.root.localToWorld(out.set(x, y, z)); }
  dirWorld(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.root.quaternion); }

  poseRide(dt, p) {
    const B = this.B;
    const bulk = p.bulk || 1;
    const gait = p.gait || 0;
    const ph = (p.phase || 0) * Math.PI * 2;
    const bounce = gait === 2 ? Math.abs(Math.sin(ph * 2)) * 0.018 : gait === 1 ? Math.sin(ph * 2) * 0.004 : 0;
    this.pelvis.position.set(0, SEAT_OFFSET.y + bounce, SEAT_OFFSET.z);
    this.pelvis.rotation.set(0, 0, 0);
    const lean = gait >= 3 ? 0.12 + (gait === 4 ? 0.14 : 0) : p.backing ? -0.05 : 0.0;
    const rock = gait >= 3 ? Math.sin(ph + 0.6) * 0.035 : gait === 2 ? Math.sin(ph * 2) * 0.012 : 0;
    this.rot(this.spine, lean * 0.55 + rock + (p.slide ? -0.2 : 0), 0, -p.turn * 0.05, 10, dt);
    this.rot(B.chest, lean * 0.45 + rock * 0.5, 0, -p.turn * 0.05, 10, dt);
    this.rot(B.neck, -lean * 0.5, (p.look || 0) * 0.4, 0, 10, dt);
    this.rot(B.head, -lean * 0.3, (p.look || 0) * 0.6, 0, 10, dt);
    this.rot(B.clavL, 0, 0, 0, 10, dt);
    this.rot(B.clavR, 0, 0, 0, 10, dt);
    this.root.updateMatrixWorld(true);

    const lat = this.dirWorld(1, 0, 0, tmp3).clone();
    // legs: heels down in the stirrups (or hanging along the barrel without a saddle)
    const sx = p.saddle === false ? 0.29 * bulk + 0.03 : 0.92 * (0.29 * bulk + 0.04) + 0.05;
    const footY = p.saddle === false ? -0.84 : -0.668;
    const footZ = p.saddle === false ? -0.07 : -0.03;
    const poleW = new THREE.Vector3();
    for (const leg of this.legs) {
      const s = leg.side;
      const target = this.toWorld(s * sx, footY, footZ, tmp.clone());
      const pole = this.dirWorld(s * 0.35, 0.05, 1, poleW);
      solveLimb(leg.hip, leg.knee, leg.foot, target, pole, lat);
    }
    this.root.updateMatrixWorld(true);
    // feet: toes slightly up and out
    const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    for (const leg of this.legs) {
      const s = leg.side;
      q1.setFromEuler(new THREE.Euler(-0.2, s * 0.22, 0, 'YXZ')).premultiply(this.root.quaternion);
      leg.knee.getWorldQuaternion(q2).invert();
      leg.foot.quaternion.copy(q2.multiply(q1));
    }

    // arms
    const reins = this.arms[0], free = this.arms[1];
    const elbowPole = (s) => this.dirWorld(s * 0.7, -0.8, -0.5, new THREE.Vector3());
    let handTarget = this.toWorld(0.07, 0.235, 0.31, new THREE.Vector3());
    solveLimb(reins.up, reins.fore, reins.wrist, handTarget, elbowPole(1), lat);
    this.grip(reins, 1, dt);
    this.root.updateMatrixWorld(true);

    // free hand: rests on the thigh, or lasso / wave / pat
    let tgt, grip = 0.25, pose = 'rest';
    const hipW = leg(this.legs[1].hip), kneeW = leg(this.legs[1].knee);
    function leg(b) { return b.getWorldPosition(new THREE.Vector3()); }
    if (this.action === 'lasso' || p.lasso) {
      const a = this.t * 9;
      tgt = this.toWorld(-0.12 + Math.cos(a) * 0.2, 0.98 + Math.sin(a * 2) * 0.03, 0.12 + Math.sin(a) * 0.2, new THREE.Vector3());
      grip = 1; pose = 'lasso';
    } else if (this.action === 'wave') {
      tgt = this.toWorld(-0.32 + Math.sin(this.t * 12) * 0.05, 0.9, 0.1, new THREE.Vector3());
      grip = 0; pose = 'wave';
    } else if (this.action === 'pat') {
      tgt = this.toWorld(-0.06, 0.3 + Math.sin(this.t * 14) * 0.025, 0.62, new THREE.Vector3());
      grip = 0; pose = 'pat';
    } else {
      tgt = hipW.clone().lerp(kneeW, 0.45);
      tgt.add(this.dirWorld(0.0, 0.1, 0, tmp2));
      pose = 'rest';
    }
    solveLimb(free.up, free.fore, free.wrist, tgt, elbowPole(-1), lat);
    this.grip(free, grip, dt);
    this.root.updateMatrixWorld(true);
    this.pose = pose;
  }

  poseFoot(dt, p) {
    const B = this.B;
    const A = this.arms, L = this.legs;
    const sp = p.speed || 0;
    const running = sp > 3;
    this.walkPhase += dt * (running ? 1.6 : 1.0) * Math.min(sp, 6) * 1.2;
    const ph = this.walkPhase;
    const amp = Math.min(1, sp / 2) * (running ? 0.9 : 0.55);
    const crouch = this.action === 'crouch' || p.crouch;
    this.pelvis.position.y = STAND_HEIGHT + (sp > 0.1 ? Math.abs(Math.sin(ph)) * (running ? 0.05 : 0.02) : 0);
    this.pelvis.position.x = 0; this.pelvis.position.z = 0;
    if (crouch) this.pelvis.position.y = 0.6;
    L.forEach((l, i) => {
      const sw = Math.sin(ph + (i ? Math.PI : 0)) * amp;
      if (crouch) { this.rot(l.hip, -1.4, 0, l.side * 0.15, 12, dt); this.rot(l.knee, 2.0, 0, 0, 12, dt); this.rot(l.foot, -0.6, 0, 0, 12, dt); }
      else {
        this.rot(l.hip, -sw, 0, l.side * 0.03, 18, dt);
        this.rot(l.knee, Math.max(0, Math.sin(ph + (i ? Math.PI : 0) + 1.2)) * amp * 1.4 + 0.03, 0, 0, 18, dt);
        this.rot(l.foot, 0, 0, 0, 18, dt);
      }
    });
    this.rot(this.spine, running ? 0.12 : 0.01, 0, 0, 10, dt);
    this.rot(B.chest, running ? 0.06 : 0.0, 0, 0, 10, dt);
    this.rot(B.neck, 0, 0, 0, 10, dt);
    const set = (a, up, fore, extra = {}) => {
      this.rot(a.up, up[0], up[1], up[2], extra.rate || 14, dt);
      this.rot(a.fore, fore[0], fore[1], fore[2], extra.rate || 14, dt);
    };
    const armSw = (i) => Math.sin(ph + (i ? 0 : Math.PI)) * amp * 0.8;
    this.arms.forEach((a) => { this.rot(a.clav, 0, 0, 0, 12, dt); this.rot(a.wrist, 0, 0, 0, 12, dt); });
    // every pose is written for the left arm (A[0]); the right arm mirrors
    const SIDE = (a) => a.side;
    const sA = (a, x, y, z) => [x, a.side * y, a.side * z];
    const rest = (a, i) => set(a, sA(a, armSw(i), 0, 0.07), [-0.25 - (running ? 0.9 : 0.1), 0, 0]);
    if (this.action === 'whistle') {
      set(A[1], [-2.4, 0, -0.3], [-1.9, 0, 0]); rest(A[0], 0);
    } else if (this.action === 'brush' || this.action === 'feed' || this.action === 'pat' || this.action === 'hoof') {
      const r = this.action === 'brush' ? Math.sin(this.t * 9) * 0.35 : this.action === 'pat' ? Math.sin(this.t * 12) * 0.2 : 0;
      set(A[1], [-1.3 + r, -0.2, 0.1], [-0.5 - r * 0.5, 0, 0], { rate: 20 });
      set(A[0], [-0.4, 0, 0.1], [-0.6, 0, 0]);
      if (this.action === 'hoof') { this.rot(this.spine, 0.7, 0, 0, 10, dt); set(A[1], [-1.0, 0, 0], [-0.3, 0, 0]); set(A[0], [-1.0, 0, 0], [-0.3, 0, 0]); }
    } else if (this.action === 'lasso' || p.lasso) {
      const a = this.t * 9;
      set(A[1], [-2.9, -Math.sin(a) * 0.4, 0.3 - Math.cos(a) * 0.3], [-0.4, 0, 0], { rate: 20 });
      set(A[0], [-0.5, 0, 0.2], [-0.8, 0, 0]);
    } else if (this.action === 'dig') {
      const d = Math.sin(this.t * 7) * 0.5;
      this.rot(this.spine, 0.6 + d * 0.3, 0, 0, 10, dt);
      set(A[0], [-1.2 + d, 0, 0.1], [-0.3, 0, 0]); set(A[1], [-1.2 + d, 0, -0.1], [-0.3, 0, 0]);
    } else if (crouch) {
      set(A[0], [-1.1, 0, 0.1], [-0.4, 0, 0]); set(A[1], [-1.2, 0, -0.1], [-0.4, 0, 0]);
    } else {
      rest(A[0], 0); rest(A[1], 1);
    }
    void SIDE;
    this.arms.forEach((a) => this.grip(a, this.action === 'lasso' ? 1 : 0, dt));
    this.rot(this.head, 0, p.look || 0, 0, 10, dt);
  }

  handWorld(i, out = new THREE.Vector3()) { return this.arms[i].hand.getWorldPosition(out); }
}
void lerp;
