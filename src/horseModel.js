// Prozedurales Pferdemodell: Körper aus Loft-Flächen, gegliederte Beine, Fellzeichnung, Sattelzeug, Gangarten
import * as THREE from 'three';
import { clamp, lerp, damp, rng, mix, TAU } from './util.js';
import { coatOf, growth } from './data.js';
import { REAL, buildReal, applyReal } from './realHorse.js';

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function refine(secs, n = 3) {
  const out = [];
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[Math.max(0, i - 1)], b = secs[i], c = secs[i + 1], d = secs[Math.min(secs.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n; out.push([lerp(b[0], c[0], t), catmull(a[1], b[1], c[1], d[1], t), catmull(a[2], b[2], c[2], d[2], t), Math.max(0.005, catmull(a[3], b[3], c[3], d[3], t))]); }
  }
  out.push(secs[secs.length - 1].slice());
  return out;
}
function sampleSecs(secs, z) {
  if (z <= secs[0][0]) return secs[0];
  for (let i = 0; i < secs.length - 1; i++) {
    if (z <= secs[i + 1][0]) { const t = (z - secs[i][0]) / (secs[i + 1][0] - secs[i][0]); return secs[i].map((v, k) => lerp(v, secs[i + 1][k], t)); }
  }
  return secs[secs.length - 1];
}
// Loft entlang Z; secs: [z, oben, unten, halbeBreite]; arc = [θ0, θ1] (θ=0 unten, π oben)
export function loftZ(secs, radial = 16, arc = null, inflate = 0) {
  const n = secs.length, R = radial + 1;
  const pos = new Float32Array(n * R * 3), uv = new Float32Array(n * R * 2), idx = [];
  const z0 = secs[0][0], z1 = secs[n - 1][0];
  const t0 = arc ? arc[0] : 0, t1 = arc ? arc[1] : TAU;
  for (let i = 0; i < n; i++) {
    const [z, top, bot, w] = secs[i];
    const mid = (top + bot) / 2, hh = (top - bot) / 2 + inflate, ww = w + inflate;
    for (let j = 0; j < R; j++) {
      const th = lerp(t0, t1, j / radial), o = (i * R + j) * 3;
      const s = Math.sin(th), c = Math.cos(th);
      // leicht kantiger Querschnitt wirkt muskulöser als eine reine Ellipse
      const k = 1 + 0.06 * Math.abs(Math.sin(2 * th));
      pos[o] = ww * s * k; pos[o + 1] = mid - hh * c * k; pos[o + 2] = z;
      uv[(i * R + j) * 2] = (z - z0) / (z1 - z0); uv[(i * R + j) * 2 + 1] = (th) / TAU;
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) { const a = i * R + j, b = a + 1, c = a + R, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!arc) { // Naht glätten
    const nm = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const a = i * R, b = i * R + radial;
      const x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1;
      nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l);
    }
  }
  return g;
}

const TORSO = [[-0.9, 1.36, 1.26, 0.05], [-0.84, 1.5, 1.12, 0.2], [-0.66, 1.57, 0.96, 0.29], [-0.42, 1.565, 0.9, 0.3], [-0.15, 1.52, 0.86, 0.31], [0.1, 1.51, 0.83, 0.315], [0.32, 1.56, 0.84, 0.29], [0.48, 1.6, 0.88, 0.26], [0.62, 1.52, 0.95, 0.22], [0.74, 1.42, 1.04, 0.15], [0.8, 1.34, 1.14, 0.06]];
const NECK = [[-0.15, 0.3, -0.34, 0.2], [0, 0.27, -0.31, 0.19], [0.25, 0.2, -0.22, 0.135], [0.5, 0.155, -0.165, 0.105], [0.75, 0.125, -0.13, 0.09], [0.9, 0.1, -0.11, 0.085], [0.97, 0.05, -0.05, 0.05]];
const HEAD = [[-0.1, 0.1, -0.08, 0.07], [0, 0.135, -0.13, 0.105], [0.12, 0.125, -0.165, 0.11], [0.28, 0.095, -0.12, 0.085], [0.42, 0.075, -0.085, 0.065], [0.53, 0.07, -0.085, 0.068], [0.6, 0.045, -0.06, 0.05], [0.625, 0.01, -0.02, 0.02]];

function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function blob(ctx, r, cx, cy, rad, n = 9) { for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * rad * 0.6; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, rad * (0.35 + r() * 0.4), rad * (0.3 + r() * 0.35), r() * 3, 0, TAU); ctx.fill(); } }

function paintCoat(part, coat, h) {
  const W = part === 'torso' ? 256 : 128, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), r = rng(h.seed + part.length * 77);
  const leoFull = coat.leopard === 2 || (coat.leopard === 1 && h.seed % 3 === 0);
  x.fillStyle = coat.body; x.fillRect(0, 0, W, H);
  // Unterseite heller, Rücken dunkler
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,235,200,0.13)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.12)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,235,200,0.13)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  if (coat.dapple && part !== 'head') { x.fillStyle = 'rgba(255,255,255,0.16)'; for (let i = 0; i < (part === 'torso' ? 90 : 30); i++) { x.beginPath(); x.arc(r() * W, r() * H, 4 + r() * 5, 0, TAU); x.fill(); } }
  if (coat.roan && part !== 'head') { x.fillStyle = 'rgba(240,238,232,0.55)'; for (let i = 0; i < W * H * 0.5; i++) x.fillRect(r() * W, r() * H, 1, 1); }
  if (coat.dun && part === 'torso') { x.fillStyle = coat.points || mix(coat.body, '#000000', 0.5); x.globalAlpha = 0.8; x.fillRect(0, H / 2 - 2, W, 4); x.globalAlpha = 1; }
  if (coat.tobiano && part !== 'head') {
    x.fillStyle = '#f4f1ea';
    const n = part === 'torso' ? 3 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) blob(x, r, r() * W, H / 2 + (r() - 0.5) * H * 0.5, W * (part === 'torso' ? 0.2 : 0.3));
  }
  if (coat.leopard) {
    const spots = (n, x0, x1, y0, y1) => { x.fillStyle = coat.body; for (let i = 0; i < n; i++) { x.beginPath(); x.ellipse(lerp(x0, x1, r()), lerp(y0, y1, r()), 2 + r() * 4, 2 + r() * 3, r() * 3, 0, TAU); x.fill(); } };
    x.fillStyle = '#f2efe8';
    if (leoFull) { x.globalAlpha = 0.93; x.fillRect(0, 0, W, H); x.globalAlpha = 1; spots(coat.leopard === 2 ? 10 : part === 'torso' ? 110 : 40, 0, W, 0, H); }
    else if (part === 'torso') { blob(x, r, W * 0.2, H / 2, W * 0.26, 14); spots(45, 0, W * 0.42, H * 0.2, H * 0.8); }
  }
  if (part === 'head') {
    const dark = coat.points || mix(coat.body, '#000000', 0.35);
    const m = x.createLinearGradient(W * 0.62, 0, W, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, dark);
    x.globalAlpha = coat.pink ? 0 : 0.75; x.fillStyle = m; x.fillRect(W * 0.62, 0, W * 0.38, H); x.globalAlpha = 1;
    const f = h.face; x.fillStyle = '#f6f3ee';
    if (f >= 1) { x.beginPath(); x.ellipse(W * 0.24, H / 2, f >= 3 ? 12 : 8, f >= 3 ? 9 : 6, 0, 0, TAU); x.fill(); }
    if (f >= 2) { const hw = f === 2 ? 2.5 : f === 3 ? 7 : 15; x.fillRect(W * 0.24, H / 2 - hw, W * 0.7, hw * 2); }
    if (f >= 3) { x.fillStyle = '#dba79b'; x.fillRect(W * 0.9, H / 2 - (f === 4 ? 16 : 8), W * 0.1, f === 4 ? 32 : 16); }
  }
  // feine Haarstruktur
  for (let i = 0; i < W * H * 0.12; i++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; x.fillRect(r() * W, r() * H, 2, 1); }
  return tex(c);
}

const SH = { sph: new THREE.SphereGeometry(1, 12, 9), eye: new THREE.SphereGeometry(1, 8, 6) };
const LEATHER = { western: '#7a4a25', english: '#2a1c14' };

export function buildHorse(h, opt = {}) {
  if (REAL.ready && !opt.procedural) return buildReal(h, opt);
  const coat = coatOf(h.genes, h.age), cf = h.conf, g = growth(h.age);
  const foal = 1 - g;
  const L = cf.leg * lerp(1.22, 1, g), BL = lerp(0.76, 1, g), W = cf.bulk * lerp(0.72, 1, g), D = (1 + (cf.bulk - 1) * 0.45) * lerp(0.76, 1, g);
  const NK = cf.neck * lerp(0.8, 1, g), HD = cf.head * lerp(1.22, 1, g) * (1 + (cf.bulk - 1) * 0.15), T = Math.sqrt(W) * lerp(0.9, 1, g);
  const foreLen = 0.26 + 0.45 * L, baseY = 0.75 * L + 0.214, foreY = baseY + 0.26;
  const hipY = 0.3 + 0.8315 * L + 0.214;
  const adultH = 0.75 * cf.leg + 0.214 + 0.636 * (1 + (cf.bulk - 1) * 0.45);
  const S = (cf.height / 100) * lerp(0.6, 1, g) / (baseY + 0.636 * D) * 1.0;
  const sexK = h.sex === 'Hengst' ? 1.07 : 1;
  const dis = [];
  const G = (geo) => { dis.push(geo); return geo; };
  const M = (m) => { dis.push(m); return m; };
  const rough = lerp(0.62, 0.34, cf.sheen), metal = cf.sheen * 0.25;
  const mat = (color, o = {}) => M(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o }));
  const texs = ['torso', 'neck', 'head'].map((p) => { const t = paintCoat(p, coat, h); dis.push(t); return t; });
  const mTorso = mat('#ffffff', { map: texs[0] }), mNeck = mat('#ffffff', { map: texs[1] }), mHead = mat('#ffffff', { map: texs[2] });
  const leoFull = coat.leopard === 2 || (coat.leopard === 1 && h.seed % 3 === 0);
  const bodyCol = leoFull ? '#e9e5dc' : coat.body;
  const mBody = mat(bodyCol), mMane = mat(coat.tobiano && h.seed % 2 ? mix(coat.mane, '#f0ede6', 0.6) : coat.mane, { roughness: 0.75, metalness: 0 });
  const ptCol = coat.points || mix(coat.body, '#000000', 0.18);
  const mPts = mat(leoFull ? '#d8d2c6' : ptCol), mWhite = mat('#f1eee8'), mDark = mat('#211c19', { roughness: 0.5 }), mHoofL = mat('#cbbd9f', { roughness: 0.5 }), mEye = mat('#0b0908', { roughness: 0.15 });
  const mesh = (geo, m, sh = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = sh; o.receiveShadow = false; return o; };
  const sph = (m, sx, sy, sz, x, y, z, sh = false) => { const o = mesh(SH.sph, m, sh); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };
  const limb = (rt, rb, len, m) => { const geo = G(new THREE.CylinderGeometry(rt, rb, len, 10, 1)); geo.translate(0, -len / 2, 0); return mesh(geo, m); };

  const root = new THREE.Group(), scaleG = new THREE.Group(), body = new THREE.Group(), mdl = new THREE.Group();
  root.add(scaleG); scaleG.scale.setScalar(S); scaleG.add(body);
  const pivotY = baseY + 0.25; body.position.y = pivotY; body.add(mdl); mdl.position.y = -pivotY;

  const yT = (y) => baseY + (y - 0.964) * D;
  const tSecs = refine(TORSO.map(([z, t, b, w]) => [z * BL, yT(t), yT(b), w * W]), 3);
  mdl.add(mesh(G(loftZ(tSecs, 18)), mTorso));

  // Hals + Kopf
  const neck = new THREE.Group(); neck.position.set(0, yT(1.3), 0.5 * BL); mdl.add(neck);
  const nw = Math.sqrt(W) * sexK;
  const nSecs = refine(NECK.map(([z, t, b, w]) => [z * NK, t * nw * (1 + 0.1 * Math.sin(Math.PI * clamp(z, 0, 1))), b * nw, w * nw]), 3);
  neck.add(mesh(G(loftZ(nSecs, 14)), mNeck));
  const head = new THREE.Group(); head.position.set(0, 0.02, 0.88 * NK); neck.add(head);
  const hSecs = refine(HEAD.map(([z, t, b, w]) => [z * HD, (t + cf.profile * 0.022 * Math.sin(Math.PI * clamp(z / 0.6, 0, 1))) * HD, b * HD, w * HD]), 3);
  head.add(mesh(G(loftZ(hSecs, 12)), mHead));
  const ears = [];
  const earGeo = G(new THREE.ConeGeometry(0.036 * HD, 0.14 * HD, 6)); earGeo.translate(0, 0.07 * HD, 0);
  for (const s of [-1, 1]) {
    const e = mesh(earGeo, mBody, false); e.position.set(s * 0.062 * HD, 0.11 * HD, -0.015); e.rotation.set(-0.25, 0, -s * 0.3); head.add(e); ears.push(e);
    head.add(sph(mEye, 0.022, 0.022, 0.022, s * 0.1 * HD, 0.04 * HD, 0.13 * HD));
    head.add(sph(mDark, 0.016, 0.02, 0.022, s * 0.038 * HD, -0.005, 0.6 * HD));
  }
  // Mähne
  const mane = [];
  const upright = cf.mane < 0.4, ml = (upright ? 0.1 : 0.3 * cf.mane) * lerp(0.3, 1, g);
  {
    const nl = 14, mp = [], mi = [], mr = rng(h.seed + 5);
    for (let i = 0; i < nl; i++) {
      const z = lerp(0.0, 0.87, i / (nl - 1)) * NK, top = sampleSecs(nSecs, z)[1], k = (0.8 + mr() * 0.4) * (i === 0 || i === nl - 1 ? 0.5 : 1);
      if (upright) mp.push(0.028, top - 0.02, z, 0.012, top + ml * k, z, -0.012, top + ml * k, z, -0.028, top - 0.02, z);
      else mp.push(0.025, top - 0.03, z, 0, top + 0.022, z, -0.06, top - ml * 0.4 * k, z + 0.01, -0.075 - 0.02 * cf.mane, top - ml * k, z + (mr() - 0.5) * 0.03);
      if (i) { const o = (i - 1) * 4; for (let c = 0; c < 3; c++) mi.push(o + c, o + c + 4, o + c + 1, o + c + 1, o + c + 4, o + c + 5); }
    }
    const mg = G(new THREE.BufferGeometry()); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mp), 3)); mg.setIndex(mi); mg.computeVertexNormals();
    mMane.side = THREE.DoubleSide; neck.add(mesh(mg, mMane));
  }
  const fl = sph(mMane, 0.035, 0.03, clamp(0.06 + 0.08 * cf.mane, 0.06, 0.2) * lerp(0.4, 1, g), 0, 0.125 * HD, 0.07 * HD); head.add(fl);
  // Schweif
  const tail = new THREE.Group(); tail.position.set(0, yT(1.46), -0.85 * BL); mdl.add(tail);
  const tl = clamp(0.75 + cf.mane * 0.3, 0.8, 1.25) * lerp(0.35, 1, g);
  tail.add(limb(0.05, 0.04, 0.26, mMane));
  const tailHair = new THREE.Group(); tailHair.position.y = -0.2; tail.add(tailHair);
  const tw = 0.07 + 0.025 * cf.mane;
  const tg = G(new THREE.LatheGeometry([[0.035, 0], [tw * 0.8, -tl * 0.2], [tw, -tl * 0.5], [tw * 0.85, -tl * 0.8], [tw * 0.35, -tl * 0.96], [0.001, -tl]].map((q) => new THREE.Vector2(q[0], q[1])), 9));
  tailHair.add(mesh(tg, mMane));

  // Beine
  const legs = [];
  const lowerMat = (i, part) => { // part: 0 Röhre, 1 Fessel
    const s = coat.tobiano ? 3 : h.legs[i];
    if (s >= 3 || (s >= 2 && part === 1) || (s >= 1 && part === 2)) return mWhite;
    return mPts;
  };
  const mkLower = (parent, i, cannonLen, rT) => {
    const fet = new THREE.Group(); fet.position.y = -cannonLen; parent.add(fet);
    fet.add(sph(lowerMat(i, 1), 0.047 * rT, 0.05 * rT, 0.05 * rT, 0, 0, 0));
    const pas = limb(0.04 * rT, 0.046 * rT, 0.15, lowerMat(i, 2)); pas.rotation.x = -0.6; fet.add(pas);
    const white = coat.tobiano || h.legs[i] > 0 || coat.pink;
    const hg = G(new THREE.CylinderGeometry(0.052 * rT, 0.068 * rT, 0.09, 10)); const hoof = mesh(hg, white ? mHoofL : mDark); hoof.position.set(0, -0.169, 0.092); fet.add(hoof);
    if (cf.feather > 0.1) { const fg = G(new THREE.ConeGeometry((0.07 + 0.07 * cf.feather) * rT, 0.26, 8, 1, true)); const f = mesh(fg, lowerMat(i, 1), false); f.material.side = THREE.DoubleSide; f.position.set(0, -0.06, 0.03); f.rotation.x = -0.3; fet.add(f); }
    return fet;
  };
  for (let i = 0; i < 4; i++) {
    const fore = i < 2, side = i % 2 ? 1 : -1; // 0 LV, 1 RV, 2 LH, 3 RH (links = -x)
    const hip = new THREE.Group();
    if (fore) {
      hip.position.set(side * 0.165 * W, foreY, 0.48 * BL); mdl.add(hip);
      hip.add(limb(0.1 * T, 0.052 * T, foreLen, mBody));
      hip.add(sph(mBody, 0.07 * T, 0.2, 0.12 * T, -side * 0.01, -0.1, 0.01));
      const knee = new THREE.Group(); knee.position.y = -foreLen; hip.add(knee);
      knee.add(sph(mPts, 0.054 * T, 0.06 * T, 0.056 * T, 0, 0, 0));
      knee.add(limb(0.043 * T, 0.038 * T, 0.3 * L, lowerMat(i, 0)));
      const fet = mkLower(knee, i, 0.3 * L, T);
      legs.push({ fore, side, j: [hip, knee, fet], rest: [0, 0, 0], cur: [0, 0, 0] });
    } else {
      hip.position.set(side * 0.15 * W, hipY, -0.5 * BL); mdl.add(hip);
      hip.add(limb(0.14 * T, 0.11 * T, 0.32, mBody));
      hip.add(sph(mBody, 0.11 * T, 0.27 * Math.min(1, D), 0.22 * T, 0, -0.14, -0.04));
      const stifle = new THREE.Group(); stifle.position.y = -0.32; hip.add(stifle);
      stifle.add(limb(0.105 * T, 0.055 * T, 0.5 * L, mBody));
      const hock = new THREE.Group(); hock.position.y = -0.5 * L; stifle.add(hock);
      hock.add(sph(mPts, 0.056 * T, 0.066 * T, 0.062 * T, 0, 0, 0));
      hock.add(limb(0.047 * T, 0.04 * T, 0.38 * L, lowerMat(i, 0)));
      const fet = mkLower(hock, i, 0.38 * L, T);
      legs.push({ fore, side, j: [hip, stifle, hock, fet], rest: [-0.35, 0.75, -0.62, 0.22], cur: [-0.35, 0.75, -0.62, 0.22] });
    }
  }

  const torsoAt = (z) => sampleSecs(tSecs, z);
  const seat = new THREE.Group(); seat.position.set(0, torsoAt(0.1 * BL)[1] + 0.035, 0.1 * BL); mdl.add(seat);
  const bits = [new THREE.Object3D(), new THREE.Object3D()];
  bits[0].position.set(-0.07 * HD, -0.06 * HD, 0.47 * HD); bits[1].position.set(0.07 * HD, -0.06 * HD, 0.47 * HD); head.add(bits[0], bits[1]);

  const model = { h, root, body, mdl, neck, head, ears, mane, tail, tailHair, legs, seat, bits, S, pivotY, coat, upright, tack: null, L, withers: (baseY + 0.636 * D) * S, len: 1.7 * BL * S, foal, tSecs, hSecs, HD, BL, W,
    anim: { phase: Math.random(), t: Math.random() * 50, neckA: 0.85, headA: 1.75, bob: 0, pitch: 0, roll: 0, tail: 0.25, steps: [1, 1, 1, 1], lastGait: 0 },
    dispose() { for (const d of dis) d.dispose(); } };
  if (opt.tack && g > 0.7) addTack(model, opt.tack, G, M);
  return model;
}

function addTack(model, style, G, M) {
  const { mdl, head, tSecs, hSecs, HD, BL, W } = model;
  const western = style === 'western';
  const lea = M(new THREE.MeshStandardMaterial({ color: LEATHER[style], roughness: 0.55 }));
  const lea2 = M(new THREE.MeshStandardMaterial({ color: western ? '#5d3519' : '#1c120d', roughness: 0.5 }));
  const padM = M(new THREE.MeshStandardMaterial({ color: western ? '#a33b2c' : '#f2f0ea', roughness: 0.9, side: THREE.DoubleSide }));
  const steel = M(new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.25, metalness: 0.9 }));
  const grp = new THREE.Group(); mdl.add(grp);
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(geo), m); o.position.set(x, y, z); o.castShadow = true; grp.add(o); return o; };
  const cut = (z0, z1, n = 6) => { const out = []; for (let i = 0; i <= n; i++) out.push(sampleSecs(tSecs, lerp(z0, z1, i / n) * BL).slice()); return out; };
  const P = Math.PI;
  if (western) {
    add(loftZ(cut(-0.3, 0.4), 14, [P - 1.35, P + 1.35], 0.012), padM);
    add(loftZ(cut(-0.24, 0.34), 14, [P - 1.05, P + 1.05], 0.035), lea);
    add(loftZ(cut(0.27, 0.33, 2), 16, null, 0.008), lea2);
  } else {
    add(loftZ(cut(-0.16, 0.36), 14, [P - 1.2, P + 1.2], 0.012), padM);
    add(loftZ(cut(-0.12, 0.3), 14, [P - 0.8, P + 0.8], 0.035), lea);
    for (const s of [-1, 1]) add(loftZ(cut(0.04, 0.32, 4), 6, s < 0 ? [P - 1.5, P - 0.6] : [P + 0.6, P + 1.5], 0.032), lea);
    add(loftZ(cut(0.3, 0.35, 2), 16, null, 0.008), lea2);
  }
  const top = (z) => sampleSecs(tSecs, z * BL)[1];
  const sg = new THREE.SphereGeometry(1, 12, 8);
  const cantle = add(sg, lea2, 0, top(-0.14) + (western ? 0.07 : 0.035), -0.15 * BL); cantle.scale.set(0.17 * W, western ? 0.1 : 0.05, western ? 0.05 : 0.08); cantle.rotation.x = -0.35;
  const pom = add(sg, lea2, 0, top(0.3) + (western ? 0.05 : 0.02), 0.3 * BL); pom.scale.set(western ? 0.15 * W : 0.09 * W, western ? 0.055 : 0.04, 0.07);
  if (western) { add(new THREE.CylinderGeometry(0.018, 0.024, 0.11, 8), lea2, 0, top(0.3) + 0.14, 0.31 * BL); const cap = add(sg, lea2, 0, top(0.3) + 0.2, 0.31 * BL); cap.scale.set(0.038, 0.014, 0.038); }
  const stirrups = [];
  for (const s of [-1, 1]) {
    const w = sampleSecs(tSecs, 0.14 * BL), x = s * (w[3] + 0.045), y = (w[1] + w[2]) / 2;
    const st = new THREE.Group(); st.position.set(x, y + 0.12, 0.16 * BL); grp.add(st);
    const lg = G(new THREE.BoxGeometry(western ? 0.02 : 0.012, 0.56, western ? 0.15 : 0.03)); const le = new THREE.Mesh(lg, lea); le.position.y = -0.28; le.castShadow = true; st.add(le);
    const ig = G(western ? new THREE.BoxGeometry(0.1, 0.1, 0.07) : new THREE.TorusGeometry(0.055, 0.008, 6, 12)); const ir = new THREE.Mesh(ig, western ? lea2 : steel); ir.position.y = -0.6; ir.rotation.y = Math.PI / 2; st.add(ir);
    st.rotation.z = s * 0.1; stirrups.push(st);
  }
  // Zaumzeug
  const hg = new THREE.Group(); head.add(hg);
  const hcut = (z0, z1) => [sampleSecs(hSecs, z0 * HD).slice(), sampleSecs(hSecs, z1 * HD).slice()];
  const hadd = (geo, m) => { const o = new THREE.Mesh(G(geo), m); hg.add(o); return o; };
  hadd(loftZ(hcut(-0.03, 0.0), 10, null, 0.006), lea2);
  hadd(loftZ(hcut(0.05, 0.075), 10, [P - 1.2, P + 1.2], 0.006), lea2);
  if (!western) hadd(loftZ(hcut(0.36, 0.385), 10, null, 0.006), lea2);
  for (const s of [-1, 1]) {
    const b = hadd(new THREE.BoxGeometry(0.008, 0.018, 0.47 * HD), lea2); b.position.set(s * 0.1 * HD, -0.02 * HD, 0.24 * HD); b.rotation.x = 0.1; b.rotation.y = -s * 0.1;
    const ring = hadd(new THREE.TorusGeometry(0.022, 0.004, 5, 10), steel); ring.position.set(s * 0.072 * HD, -0.06 * HD, 0.47 * HD); ring.rotation.y = Math.PI / 2;
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3)); G(rg);
  const reins = new THREE.Line(rg, M(new THREE.LineBasicMaterial({ color: western ? '#3a2412' : '#1a110c' }))); reins.frustumCulled = false; model.root.add(reins);
  model.tack = { style, grp, stirrups, reins };
}

// ---------- Gangarten ----------
// Phasenversatz je Bein [LV, RV, LH, RH] und Stützphasen-Anteil
const GAITS = {
  1: { off: [0.25, 0.75, 0, 0.5], duty: 0.62, knee: 0.75, hock: 0.6 },
  2: { off: [0.5, 0, 0, 0.5], duty: 0.42, knee: 1.15, hock: 0.85 },
  3: { off: [0.28, 0.56, 0, 0.28], duty: 0.38, knee: 1.25, hock: 0.9 },
  4: { off: [0.4, 0.5, 0, 0.1], duty: 0.24, knee: 1.5, hock: 1.1 },
};
const ease = (t) => t * t * (3 - 2 * t);

// st: { speed (m/s, vorwärts), gait 0..4, air:{on, k(-1..1)}, slide, graze 0..1, yawRate, collected, spin }
// Rückgabe: Liste der Beine, die in diesem Frame aufsetzen (für Hufschlag)
export function animateHorse(model, st, dt) {
  const a = model.anim, S = model.S;
  a.t += dt;
  const v = Math.abs(st.speed) / S, gait = st.gait;
  const hits = [];
  let bob = 0, pitch = 0, neckT = 0.85, headT = 1.75, tailT = 0.22;
  const tgt = model.legs.map((l) => l.rest.slice());
  const moving = gait > 0 && v > 0.15;
  if (st.air && st.air.on) {
    const k = st.air.k; // 1 steigend ... -1 fallend
    const up = clamp(k * 0.5 + 0.5, 0, 1);
    for (let i = 0; i < 4; i++) {
      const l = model.legs[i];
      if (l.fore) { tgt[i][0] = lerp(-0.55, -0.95, up); tgt[i][1] = lerp(0.25, 1.9, up); tgt[i][2] = lerp(0.2, 0.9, up); }
      else { tgt[i][0] = l.rest[0] + lerp(-0.25, 0.85, up); tgt[i][1] = lerp(1.45, 0.45, up); tgt[i][2] = lerp(-1.5, -0.35, up); tgt[i][3] = lerp(0.5, 0.2, up); }
    }
    pitch = -0.3 * k; neckT = 0.55 + 0.15 * k; headT = 1.45; tailT = 0.9;
    a.steps = [0, 0, 0, 0];
  } else if (st.slide) {
    for (let i = 0; i < 4; i++) {
      const l = model.legs[i];
      if (l.fore) { const p = (a.t * 3 + (i ? 0.5 : 0)) % 1; tgt[i][0] = -0.25 + 0.2 * Math.sin(p * TAU); tgt[i][1] = 0.5 * Math.max(0, Math.sin(p * TAU)); }
      else { tgt[i][0] = l.rest[0] - 0.7; tgt[i][1] = 1.15; tgt[i][2] = -0.75; tgt[i][3] = 0.35; }
    }
    pitch = -0.2; bob = -0.14; neckT = 0.75; headT = 1.9; tailT = 0.5;
  } else if (moving || st.spin) {
    const gp = GAITS[st.spin && !moving ? 1 : gait] || GAITS[1];
    const stride = gait === 1 ? 1.75 : gait === 2 ? 2.6 : gait === 3 ? 3.9 : 4.4 + v * 0.17;
    const rate = st.spin && !moving ? Math.min(2.2, Math.abs(st.yawRate) * 0.7) : v / stride;
    a.phase = (a.phase + rate * dt * (st.speed < 0 ? -1 : 1) + 1) % 1;
    const A = st.spin && !moving ? 0.12 : Math.asin(clamp((stride * gp.duty) / 2.5, 0, 0.62));
    for (let i = 0; i < 4; i++) {
      const l = model.legs[i], p = (a.phase + gp.off[i]) % 1;
      let s, lift;
      if (p < gp.duty) { s = -A + 2 * A * (p / gp.duty); lift = 0; if (a.steps[i] === 0) hits.push(i); a.steps[i] = 1; }
      else { const t = (p - gp.duty) / (1 - gp.duty); s = A - 2 * A * ease(t); lift = Math.sin(Math.PI * t); a.steps[i] = 0; }
      if (l.fore) { tgt[i][0] = s - lift * 0.22; tgt[i][1] = lift * gp.knee; tgt[i][2] = lift * 0.7 - s * 0.25; }
      else { tgt[i][0] = l.rest[0] + s * 0.85 - lift * 0.1; tgt[i][1] = l.rest[1] + lift * gp.hock * 0.55; tgt[i][2] = l.rest[2] - lift * gp.hock * 0.7; tgt[i][3] = l.rest[3] + lift * 0.5 - s * 0.2; }
    }
    const ph = a.phase * TAU;
    if (gait === 1) { bob = 0.012 * Math.sin(ph * 2); neckT = 0.62 + 0.07 * Math.sin(ph * 2); headT = 1.6; }
    else if (gait === 2) { bob = 0.035 * Math.abs(Math.sin(ph)) - 0.012; neckT = 0.82; headT = 1.75; tailT = 0.4; }
    else if (gait === 3) { bob = 0.05 * Math.cos(ph - 5.9); pitch = -0.055 * Math.cos(ph); neckT = 0.72 - 0.08 * Math.cos(ph); headT = 1.7; tailT = 0.55; }
    else { bob = 0.045 * Math.cos(ph - 4.6); pitch = -0.04 * Math.cos(ph - 0.3); neckT = 0.42 - 0.06 * Math.cos(ph); headT = 1.25; tailT = 0.95 + 0.25 * (model.h.conf.tailSet || 0); }
    if (st.collected && gait <= 3) { neckT += 0.16; headT += 0.22; }
    if (model.h.conf.tailSet) tailT += 0.25;
  } else {
    // Stehen: atmen, Gewicht verlagern, grasen
    const gz = st.graze || 0;
    neckT = lerp(0.85 + 0.04 * Math.sin(a.t * 0.5), -0.72, gz); headT = lerp(1.75 + 0.05 * Math.sin(a.t * 0.37), 0.62, gz);
    bob = 0.004 * Math.sin(a.t * 1.6);
    const rl = model.legs[2 + (Math.floor(a.t / 14) % 2)];
    if (Math.floor(a.t / 7) % 2) { const i = model.legs.indexOf(rl); tgt[i][1] += 0.18; tgt[i][2] -= 0.22; tgt[i][3] += 0.5; }
    a.steps = [1, 1, 1, 1];
  }
  const kq = 1 - Math.exp(-dt * 20);
  for (let i = 0; i < 4; i++) { const l = model.legs[i]; for (let k = 0; k < l.cur.length; k++) { l.cur[k] += (tgt[i][k] - l.cur[k]) * kq; if (l.j) l.j[k].rotation.x = l.cur[k]; } }
  a.bob = damp(a.bob, bob, 18, dt); a.pitch = damp(a.pitch, pitch + (st.slope || 0), 10, dt);
  a.roll = damp(a.roll, st.roll || 0, 6, dt);
  a.neckA = damp(a.neckA, neckT, 5, dt); a.headA = damp(a.headA, headT, 5, dt); a.tail = damp(a.tail, tailT, 4, dt);
  if (model.real) { applyReal(model, st, dt); return hits; }
  model.body.position.y = model.pivotY + a.bob; model.body.rotation.x = a.pitch; model.body.rotation.z = a.roll;
  model.neck.rotation.x = -a.neckA; model.neck.rotation.y = damp(model.neck.rotation.y, clamp((st.yawRate || 0) * 0.25, -0.35, 0.35), 4, dt);
  model.head.rotation.x = a.headA;
  model.tail.rotation.x = a.tail; model.tail.rotation.z = 0.12 * Math.sin(a.t * (moving ? 5 : 0.9)) * (moving ? 0.6 : 1) + (!moving && Math.sin(a.t * 0.31) > 0.93 ? 0.5 * Math.sin(a.t * 9) : 0);
  model.tailHair.rotation.x = -a.tail * 0.45;
  const ef = Math.sin(a.t * 0.7 + model.h.seed) > 0.9 ? 0.5 : 0;
  model.ears[0].rotation.x = -0.25 + ef; model.ears[1].rotation.x = -0.25 + ef * 0.6;
  if (model.mane.length) { const blow = clamp(v / 14, 0, 1); for (let i = 0; i < model.mane.length; i++) { model.mane[i].rotation.x = blow * 0.9 + 0.05 * Math.sin(a.t * 6 + i) * blow; model.mane[i].rotation.z = -blow * 0.5; } }
  return hits;
}
