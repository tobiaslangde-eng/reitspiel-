// Hair for the rider: strands lying on the skull, hair falling behind the ears and a plait down the back.
// Everything is built in the space of the head bone (origin at the head joint, +y up, face towards +z).
import * as THREE from 'three';
import { Strands, hairMaterial } from '../horse/hair.js';
import { mulberry32 } from '../core/noise.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// The skull surface is read from the head mesh itself: for every direction from the middle of the head the
// largest radius of the mesh vertices, so hair always sits on the real shape (forehead, temples, nape).
const CENTRE = V(0, 0.065, -0.004);
const HEAD_JOINT = [0, 0.64, -0.012];
const GAP = 0.0055; // strands float slightly above the skin
const NP = 48, NT = 30, TMAX = Math.PI * 0.8;
let TABLE = null;

function radiusTable(headGeo) {
  const R = new Float32Array(NP * NT);
  const pos = headGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - HEAD_JOINT[0], y = pos.getY(i) - HEAD_JOINT[1] - CENTRE.y, z = pos.getZ(i) - HEAD_JOINT[2] - CENTRE.z;
    if (y + CENTRE.y < 0.0) continue;
    const r = Math.hypot(x, y, z);
    const t = Math.acos(y / r);
    if (t >= TMAX) continue;
    const phi = Math.atan2(x, z);
    const ip = Math.floor(((phi + Math.PI) / (Math.PI * 2)) * NP) % NP, it = Math.min(NT - 1, Math.floor((t / TMAX) * NT));
    R[it * NP + ip] = Math.max(R[it * NP + ip], r);
  }
  // fill empty bins from neighbours
  for (let pass = 0; pass < 4; pass++) {
    for (let it = 0; it < NT; it++) for (let ip = 0; ip < NP; ip++) {
      if (R[it * NP + ip] > 0) continue;
      let sum = 0, n = 0;
      for (const [dt, dp] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const jt = it + dt; if (jt < 0 || jt >= NT) continue;
        const v = R[jt * NP + (ip + dp + NP) % NP]; if (v > 0) { sum += v; n++; }
      }
      if (n) R[it * NP + ip] = sum / n;
    }
  }
  return R;
}

function skull(t, phi, lift) {
  const ft = Math.min(NT - 1.001, Math.max(0, (t / TMAX) * NT - 0.5));
  const fp = (((phi + Math.PI) / (Math.PI * 2)) * NP - 0.5 + NP * 4) % NP;
  const it = Math.floor(ft), ip = Math.floor(fp), kt = ft - it, kp = fp - ip;
  const g = (a, b) => TABLE[a * NP + (b % NP)];
  const r = (g(it, ip) * (1 - kp) + g(it, ip + 1) * kp) * (1 - kt) + (g(it + 1, ip) * (1 - kp) + g(it + 1, ip + 1) * kp) * kt;
  const rr = r + lift;
  return V(rr * Math.sin(t) * Math.sin(phi), rr * Math.cos(t), rr * Math.sin(t) * Math.cos(phi)).add(CENTRE);
}

// polar angle where the hair ends: low at the nape, high on the forehead
function hairline(phi) {
  const back = (1 - Math.cos(phi)) * 0.5;                  // 0 front .. 1 back
  const side = Math.sin(Math.abs(phi));                    // 0 front/back .. 1 at the ears
  // forehead high, temples a little lower, hair tucked behind the ears and down to the nape
  return 0.9 + 0.12 * side + 0.62 * back * back + 0.1 * side * back;
}

function scalpStrands(rnd) {
  const st = new Strands();
  const N = 640;
  for (let i = 0; i < N; i++) {
    const phi = (rnd() * 2 - 1) * Math.PI;
    const a = Math.abs(phi), sg = Math.sign(phi) || 1;
    const frontness = Math.max(0, Math.cos(phi));
    // centre parting: the strands start at the part and sweep to the sides over the temples
    const t0 = rnd() * 0.5;
    const t1 = hairline(phi) + (rnd() - 0.5) * 0.1;
    const back = (1 - Math.cos(phi)) * 0.5;
    const hang = 0.004 + back * 0.04 * rnd() + (Math.sin(a) > 0.7 ? 0.015 * rnd() : 0);
    const sweep = frontness * frontness * 0.55 * sg;
    const pts = [];
    const segs = 8;
    const lift = GAP + rnd() * 0.0035;
    for (let k = 0; k <= segs; k++) {
      const u = k / segs;
      const t = t0 + (t1 - t0) * u;
      pts.push(skull(t, phi + sweep * u * u + Math.sin(u * 3 + i) * 0.01, lift + 0.003 * u));
    }
    // the end falls a little and tapers to a point
    const end = pts[pts.length - 1].clone();
    const out = V(end.x - CENTRE.x, 0, end.z - CENTRE.z).normalize();
    pts.push(end.clone().addScaledVector(out, 0.003).add(V(0, -hang * 0.5, 0)));
    pts.push(end.clone().addScaledVector(out, 0.005).add(V(0, -hang, 0)));
    const m = pts[3];
    const ref = V(m.x - CENTRE.x, m.y - CENTRE.y, m.z - CENTRE.z).normalize();
    st.add(pts, 0.0072 + rnd() * 0.003, ref, rnd() * 6.28, 0.85 + rnd() * 0.3, null, 0.92);
  }
  return st.build();
}

// the plait: strands fan out of the nape into a braid of beads, ending in a tuft
function plaitCurve() {
  return new THREE.CatmullRomCurve3([
    V(0, -0.012, -0.112), V(0, -0.075, -0.15), V(0, -0.18, -0.162), V(0, -0.32, -0.165), V(0, -0.46, -0.158),
  ]);
}

function plaitBeads() {
  const curve = plaitCurve();
  const proto = new THREE.SphereGeometry(1, 10, 8);
  const pp = proto.attributes.position, pn = proto.attributes.normal;
  const pos = [], nor = [], idx = [];
  const beads = 30;
  const t = V(), c = V(), q = new THREE.Quaternion(), v = V();
  for (let b = 0; b < beads; b++) {
    const s = 0.02 + (b / (beads - 1)) * 0.86;
    curve.getPointAt(s, c); curve.getTangentAt(s, t);
    q.setFromUnitVectors(V(0, 1, 0), t);
    const taper = 1 - 0.45 * s;
    const sway = (b % 2 ? 1 : -1) * 0.0085 * taper;
    const base = pos.length / 3;
    for (let i = 0; i < pp.count; i++) {
      v.set(pp.getX(i) * 0.0145 * taper, pp.getY(i) * 0.0155, pp.getZ(i) * 0.0145 * taper).applyQuaternion(q).add(c);
      pos.push(v.x + sway, v.y, v.z);
      v.set(pn.getX(i), pn.getY(i), pn.getZ(i)).applyQuaternion(q);
      nor.push(v.x, v.y, v.z);
    }
    for (let i = 0; i < proto.index.count; i++) idx.push(base + proto.index.getX(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function plaitStrands(rnd) {
  const curve = plaitCurve();
  const st = new Strands();
  const t = V(), c = V();
  // strands sweeping from the back of the head into the plait
  for (let i = 0; i < 90; i++) {
    const a = (rnd() - 0.5) * 2.2, h = 0.05 + rnd() * 0.07;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      curve.getPointAt(Math.min(1, 0.02 + u * 0.16), c);
      const spread = (1 - u) * 0.06;
      pts.push(skull(1.7 - 0.35 * (1 - u) + 0.4 * u, Math.PI + a * (0.5 - 0.4 * u), 0.007 + u * 0.004).lerp(c, u * u).add(V(spread * Math.sin(a) * 0.1, -h * u * 0.2, 0)));
    }
    st.add(pts, 0.0075, V(0, 0, -1), rnd() * 6.28, 0.9 + rnd() * 0.2, null, 0.4);
  }
  // tuft at the end of the plait
  for (let i = 0; i < 46; i++) {
    const ph = rnd() * 6.28, rr = rnd() * 0.012;
    const pts = [];
    const len = 0.05 + rnd() * 0.07;
    curve.getPointAt(0.88, c); curve.getTangentAt(0.88, t);
    for (let k = 0; k <= 5; k++) {
      const u = k / 5;
      const o = c.clone().addScaledVector(t, u * len);
      o.x += Math.cos(ph) * (rr + u * 0.02); o.z += Math.sin(ph) * (rr + u * 0.02);
      o.y -= u * u * 0.012;
      pts.push(o);
    }
    st.add(pts, 0.006, V(1, 0, 0), rnd() * 6.28, 0.9 + rnd() * 0.2, null, 0.85);
  }
  return st.build();
}

export function buildRiderHair(headGeo, seed = 3) {
  if (!TABLE) TABLE = radiusTable(headGeo);
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  const mat = hairMaterial(0x4a2c18, { stiff: 0.96, gloss: 0.42 });
  const beadMat = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.5 });
  const geos = [scalpStrands(rnd), plaitStrands(rnd), plaitBeads()];
  const scalp = new THREE.Mesh(geos[0], mat);
  const fan = new THREE.Mesh(geos[1], mat);
  const beads = new THREE.Mesh(geos[2], beadMat);
  const plait = new THREE.Group();
  for (const m of [scalp, fan, beads]) { m.castShadow = true; m.frustumCulled = false; }
  group.add(scalp, plait);
  plait.add(fan, beads);
  // ribbon tie where the plait starts
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0045, 6, 14), new THREE.MeshStandardMaterial({ color: 0xa22a1c, roughness: 0.6 }));
  tie.position.set(0, -0.34, -0.1655); tie.rotation.x = Math.PI / 2;
  plait.add(tie);
  geos.push(tie.geometry);
  return {
    group, plait,
    setColor(hex) {
      mat.color.setHex(hex); beadMat.color.setHex(hex);
      mat.sheenColor.setHex(hex).lerp(new THREE.Color(1, 0.96, 0.9), 0.25);
    },
    dispose() { mat.dispose(); beadMat.dispose(); tie.material.dispose(); for (const g of geos) g.dispose(); },
  };
}
