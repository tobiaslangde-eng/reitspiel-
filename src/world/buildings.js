import * as THREE from 'three';
import { mat, shadowAll } from '../core/utils.js';
import { boxGeo, woodMat, sign, textures, wagonWheel, hayBale, roundBale, fence, barrel } from './props.js';

// Shared window material: glows warm at night.
export const WINDOW_MAT = new THREE.MeshStandardMaterial({ color: 0x1a2028, emissive: 0xffb055, emissiveIntensity: 0, roughness: 0.15, metalness: 0.3 });
export function setNightGlow(v) { WINDOW_MAT.emissiveIntensity = v * 1.6; }

function windowMesh(w = 0.9, h = 1.1, frameColor = 0xe8e0d0) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), WINDOW_MAT);
  g.add(glass);
  const fm = woodMat(frameColor);
  const t = 0.08;
  for (const [x, y, ww, hh] of [[0, h / 2, w + t * 2, t], [0, -h / 2, w + t * 2, t], [-w / 2, 0, t, h], [w / 2, 0, t, h], [0, 0, t * 0.6, h], [0, 0, w, t * 0.6]]) {
    const b = new THREE.Mesh(boxGeo(ww, hh, 0.06), fm); b.position.set(x, y, 0.02); g.add(b);
  }
  const sill = new THREE.Mesh(boxGeo(w + 0.3, 0.07, 0.18), fm); sill.position.set(0, -h / 2 - 0.06, 0.06); g.add(sill);
  return g;
}

function gableRoof(w, d, rise, overhang, material) {
  const g = new THREE.Group();
  const half = w / 2 + overhang;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(boxGeo(slope, 0.12, d + overhang * 2, 0.6), material);
    p.position.set((s * half) / 2, rise / 2, 0);
    p.rotation.z = -s * ang;
    g.add(p);
  }
  return g;
}

function gableEnd(w, rise, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, rise); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, geo.attributes.position.getX(i) * 0.5, geo.attributes.position.getY(i) * 0.5);
  return new THREE.Mesh(geo, material);
}

/**
 * Western storefront with optional false front, porch and sign.
 * Returns { group, hw, hd, door } in local space (front faces +z).
 */
export function westernBuilding({
  w = 8, d = 10, h = 4, color = 0xa47148, trim = 0xe8dcc0, sign: signText = null, falseFront = true,
  porch = true, stories = 1, roofColor = 0x5a4a3c, doorType = 'normal', signColors,
} = {}) {
  const g = new THREE.Group();
  const H = h * stories;
  const wall = woodMat(color);
  const body = new THREE.Mesh(boxGeo(w, H, d), wall);
  body.position.y = H / 2;
  g.add(body);
  const roofMat = woodMat(roofColor, 'shingles');
  const roof = gableRoof(w, d, 1.8, 0.4, roofMat);
  roof.position.y = H;
  g.add(roof);
  const gb = gableEnd(w, 1.8, wall);
  gb.position.set(0, H, -d / 2 - 0.001); gb.rotation.y = Math.PI; g.add(gb);
  if (!falseFront) { const gf = gableEnd(w, 1.8, wall); gf.position.set(0, H, d / 2 + 0.001); g.add(gf); }

  if (falseFront) {
    const ffH = H + 2.4;
    const ff = new THREE.Mesh(boxGeo(w + 0.2, ffH, 0.25), wall);
    ff.position.set(0, ffH / 2, d / 2 + 0.12); g.add(ff);
    const corn = new THREE.Mesh(boxGeo(w + 0.6, 0.3, 0.5), woodMat(trim));
    corn.position.set(0, ffH, d / 2 + 0.15); g.add(corn);
    const step = new THREE.Mesh(boxGeo(w * 0.4, 0.6, 0.25), wall);
    step.position.set(0, ffH + 0.3, d / 2 + 0.12); g.add(step);
    const stepC = new THREE.Mesh(boxGeo(w * 0.4 + 0.3, 0.18, 0.4), woodMat(trim));
    stepC.position.set(0, ffH + 0.65, d / 2 + 0.15); g.add(stepC);
    if (signText) {
      const sg = sign(signText, Math.min(w * 0.85, 9), 1.2, signColors);
      sg.position.set(0, H + 1.2, d / 2 + 0.3); g.add(sg);
    }
  } else if (signText) {
    const sg = sign(signText, Math.min(w * 0.7, 6), 0.9, signColors);
    sg.position.set(0, H - 0.6, d / 2 + 0.08); g.add(sg);
  }

  const fz = d / 2 + (falseFront ? 0.26 : 0.01);
  // corner trims
  for (const x of [-w / 2, w / 2]) {
    const t = new THREE.Mesh(boxGeo(0.18, H, 0.18), woodMat(trim));
    t.position.set(x, H / 2, d / 2); g.add(t);
  }
  // door
  const door = new THREE.Group();
  if (doorType === 'saloon') {
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.3), mat(0x140c08));
    dark.position.y = 1.15; door.add(dark);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(boxGeo(0.78, 1.0, 0.05), woodMat(0x7a4a26));
      leaf.position.set(s * 0.4, 1.3, 0.05); door.add(leaf);
    }
  } else {
    const dm = new THREE.Mesh(boxGeo(1.2, 2.3, 0.08), woodMat(0x5a3820));
    dm.position.y = 1.15; door.add(dm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0xc0a050, { metalness: 0.9, roughness: 0.3 }));
    knob.position.set(0.45, 1.1, 0.06); door.add(knob);
  }
  door.position.set(0, 0, fz);
  g.add(door);
  // windows
  const nWin = Math.max(1, Math.floor((w - 2) / 2.6));
  for (let st = 0; st < stories; st++) {
    for (let i = 0; i < nWin; i++) {
      const x = -w / 2 + (w / (nWin + 1)) * (i + 1);
      if (st === 0 && Math.abs(x) < 1.2) continue;
      const win = windowMesh(st ? 0.8 : 1.0, st ? 1.0 : 1.2, trim);
      win.position.set(x, st * h + h * 0.55, fz + 0.01);
      g.add(win);
    }
    if (st === 0) {
      for (const s of [-1, 1]) {
        const win = windowMesh(0.8, 1.0, trim);
        win.position.set(s * (w / 2 + 0.01), h * 0.55, 0);
        win.rotation.y = s * Math.PI / 2; g.add(win);
      }
    }
  }
  // balcony for two stories
  if (stories > 1) {
    const deck = new THREE.Mesh(boxGeo(w, 0.15, 1.6), woodMat(0x6e4a2e));
    deck.position.set(0, h, fz + 0.8); g.add(deck);
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.5) {
      const b = new THREE.Mesh(boxGeo(0.06, 0.9, 0.06), woodMat(trim)); b.position.set(x, h + 0.5, fz + 1.55); g.add(b);
    }
    const rail = new THREE.Mesh(boxGeo(w, 0.08, 0.1), woodMat(trim)); rail.position.set(0, h + 0.95, fz + 1.55); g.add(rail);
  }
  // porch
  if (porch) {
    const pd = 2.6;
    const deck = new THREE.Mesh(boxGeo(w + 0.4, 0.25, pd), woodMat(0x7a5634));
    deck.position.set(0, 0.12, fz + pd / 2); g.add(deck);
    const ph = stories > 1 ? h - 0.05 : h * 0.85;
    for (const x of [-w / 2, -w / 6, w / 6, w / 2]) {
      if (stories > 1 && Math.abs(x) < w / 2 - 0.1) continue;
      const p = new THREE.Mesh(boxGeo(0.16, ph, 0.16), woodMat(0x6e4a2e));
      p.position.set(x, ph / 2 + 0.2, fz + pd - 0.15); g.add(p);
    }
    if (stories === 1) {
      const aw = new THREE.Mesh(boxGeo(w + 0.6, 0.1, pd + 0.4, 0.6), woodMat(roofColor, 'shingles'));
      aw.position.set(0, ph + 0.25, fz + pd / 2); aw.rotation.x = 0.12; g.add(aw);
    }
    const stepM = new THREE.Mesh(boxGeo(1.6, 0.12, 0.4), woodMat(0x7a5634));
    stepM.position.set(0, 0.06, fz + pd + 0.2); g.add(stepM);
  }
  shadowAll(g);
  return { group: g, hw: w / 2, hd: d / 2, door: new THREE.Vector3(0, 0, fz + (porch ? 3.4 : 1.2)) };
}

export function stable(stalls = 4) {
  const g = new THREE.Group();
  const sw = 3.4, d = 5, h = 3;
  const w = sw * stalls;
  const wall = woodMat(0x8b5a35);
  const back = new THREE.Mesh(boxGeo(w, h, 0.2), wall); back.position.set(0, h / 2, -d / 2); g.add(back);
  for (let i = 0; i <= stalls; i++) {
    const x = -w / 2 + i * sw;
    const div = new THREE.Mesh(boxGeo(0.15, h, d), wall); div.position.set(x, h / 2, 0); g.add(div);
  }
  for (let i = 0; i < stalls; i++) {
    const x = -w / 2 + (i + 0.5) * sw;
    const half = new THREE.Mesh(boxGeo(sw - 0.2, 1.2, 0.12), woodMat(0x6b3f22)); half.position.set(x, 0.6, d / 2); g.add(half);
    const xb = new THREE.Mesh(boxGeo(Math.hypot(sw - 0.3, 1.1), 0.1, 0.05), woodMat(0xe8dcc0)); xb.position.set(x, 0.6, d / 2 + 0.07); xb.rotation.z = 0.33; g.add(xb);
    const xb2 = xb.clone(); xb2.rotation.z = -0.33; g.add(xb2);
    const plaque = sign(`Box ${i + 1}`, 1.1, 0.35, { font: 'Rye' }); plaque.position.set(x, 2.5, d / 2 + 0.05); g.add(plaque);
    const straw = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.2, d - 0.2), new THREE.MeshStandardMaterial({ map: textures().hay, color: 0xd0b060, roughness: 1 }));
    straw.rotation.x = -Math.PI / 2; straw.position.set(x, 0.03, 0); g.add(straw);
  }
  const top = new THREE.Mesh(boxGeo(w, 0.4, 0.2), wall); top.position.set(0, h - 0.2, d / 2); g.add(top);
  const roof = gableRoof(d, w, 1.4, 0.5, woodMat(0x4a4038, 'shingles'));
  roof.rotation.y = Math.PI / 2; roof.position.y = h; g.add(roof);
  for (const s of [-1, 1]) { const ge = gableEnd(d, 1.4, wall); ge.position.set(s * w / 2, h, 0); ge.rotation.y = s * Math.PI / 2; g.add(ge); }
  const sg = sign('STALL', 3, 0.8); sg.position.set(0, h + 0.6, d / 2 + 0.3); g.add(sg);
  shadowAll(g);
  return { group: g, hw: w / 2, hd: d / 2, stallW: sw };
}

export function barn() {
  const g = new THREE.Group();
  const w = 12, d = 16, h = 5;
  const red = woodMat(0x9a2e22);
  const white = woodMat(0xece6da);
  const body = new THREE.Mesh(boxGeo(w, h, d), red); body.position.y = h / 2; g.add(body);
  // gambrel roof
  const rm = woodMat(0x3c3632, 'shingles');
  const p1 = [w / 2 + 0.3, 0], p2 = [w / 2 - 1.8, 2.4], p3 = [0, 4];
  for (const s of [-1, 1]) {
    const l1 = Math.hypot(p1[0] - p2[0], p2[1] - p1[1]);
    const a1 = Math.atan2(p2[1] - p1[1], p1[0] - p2[0]);
    const r1 = new THREE.Mesh(boxGeo(l1, 0.15, d + 0.8, 0.6), rm);
    r1.position.set(s * (p1[0] + p2[0]) / 2, h + (p1[1] + p2[1]) / 2, 0); r1.rotation.z = s * a1; g.add(r1);
    const l2 = Math.hypot(p2[0], p3[1] - p2[1]);
    const a2 = Math.atan2(p3[1] - p2[1], p2[0]);
    const r2 = new THREE.Mesh(boxGeo(l2 + 0.2, 0.15, d + 0.8, 0.6), rm);
    r2.position.set(s * p2[0] / 2, h + (p2[1] + p3[1]) / 2, 0); r2.rotation.z = s * a2; g.add(r2);
  }
  for (const sz of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(p2[0], p2[1]); shape.lineTo(0, p3[1]); shape.lineTo(-p2[0], p2[1]); shape.closePath();
    const ge = new THREE.Mesh(new THREE.ShapeGeometry(shape), red);
    ge.position.set(0, h, sz * (d / 2 + 0.01)); if (sz < 0) ge.rotation.y = Math.PI; g.add(ge);
  }
  // doors with X braces
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(boxGeo(2.2, 3.6, 0.1), red); door.position.set(s * 1.1, 1.8, d / 2 + 0.06); g.add(door);
    for (const [x, y, ww, hh, rz] of [[0, 1.75, 2.2, 0.16, 0], [0, -1.75, 2.2, 0.16, 0], [-1.05, 0, 0.16, 3.6, 0], [1.05, 0, 0.16, 3.6, 0], [0, 0, 4.1, 0.16, 1.02], [0, 0, 4.1, 0.16, -1.02]]) {
      const t = new THREE.Mesh(boxGeo(ww, hh, 0.05), white); t.position.set(s * 1.1 + x, 1.8 + y, d / 2 + 0.12); t.rotation.z = rz; g.add(t);
    }
  }
  const loft = new THREE.Mesh(boxGeo(1.6, 1.6, 0.1), white); loft.position.set(0, h + 1.2, d / 2 + 0.05); g.add(loft);
  const loftIn = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat(0x1a1008)); loftIn.position.set(0, h + 1.2, d / 2 + 0.11); g.add(loftIn);
  for (const x of [-w / 2, w / 2]) { const t = new THREE.Mesh(boxGeo(0.2, h, 0.2), white); t.position.set(x, h / 2, d / 2); g.add(t); }
  const hb = hayBale(); hb.position.set(3.5, 0, d / 2 + 1.2); g.add(hb);
  const hb2 = hayBale(); hb2.position.set(3.6, 0.6, d / 2 + 1.2); hb2.rotation.y = 0.2; g.add(hb2);
  shadowAll(g);
  return { group: g, hw: w / 2, hd: d / 2 };
}

export function ranchHouse() {
  const g = new THREE.Group();
  const w = 11, d = 8, h = 3.4;
  const logM = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 });
  // log walls
  for (let y = 0.2; y < h; y += 0.36) {
    for (const [x, z, len, rot] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, len + 0.6, 8), logM);
      l.rotation.z = Math.PI / 2; l.rotation.y = rot; l.position.set(x, y, z); g.add(l);
    }
  }
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, h, d - 0.2), mat(0x5a3a22)); inner.position.y = h / 2; g.add(inner);
  const roof = gableRoof(d, w, 2.2, 0.8, woodMat(0x4a3a30, 'shingles'));
  roof.rotation.y = Math.PI / 2; roof.position.y = h + 0.1;
  g.add(roof);
  for (const s of [-1, 1]) { const ge = gableEnd(d + 0.4, 2.2, woodMat(0x7a5030)); ge.position.set(s * (w / 2 + 0.2), h + 0.1, 0); ge.rotation.y = s * Math.PI / 2; g.add(ge); }
  // chimney
  const ch = new THREE.Mesh(boxGeo(1.1, 7.2, 1.1, 0.6), new THREE.MeshStandardMaterial({ map: textures().stone, roughness: 1 }));
  ch.position.set(-w / 2 - 0.3, 3.6, -1.5); g.add(ch);
  // veranda
  const vd = 3;
  const deck = new THREE.Mesh(boxGeo(w + 1, 0.3, vd), woodMat(0x7a5634)); deck.position.set(0, 0.15, d / 2 + vd / 2 + 0.2); g.add(deck);
  for (const x of [-w / 2, -w / 4, w / 4, w / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.8, 8), logM); p.position.set(x, 1.6, d / 2 + vd); g.add(p);
  }
  const aw = new THREE.Mesh(boxGeo(w + 1.4, 0.12, vd + 0.6, 0.6), woodMat(0x4a3a30, 'shingles'));
  aw.position.set(0, 3.1, d / 2 + vd / 2 + 0.2); aw.rotation.x = 0.16; g.add(aw);
  for (let x = -w / 2; x <= w / 2; x += 0.45) {
    if (Math.abs(x) < 1) continue;
    const b = new THREE.Mesh(boxGeo(0.06, 0.8, 0.06), woodMat(0x6e4a2e)); b.position.set(x, 0.7, d / 2 + vd); g.add(b);
  }
  const door = new THREE.Mesh(boxGeo(1.2, 2.3, 0.1), woodMat(0x4a2c18)); door.position.set(0, 1.35, d / 2 + 0.22); g.add(door);
  for (const x of [-3, 3]) { const win = windowMesh(1.1, 1.2); win.position.set(x, 1.8, d / 2 + 0.25); g.add(win); }
  const sg = sign('SILVER SPUR RANCH', 4.5, 0.7); sg.position.set(0, 2.75, d / 2 + vd + 0.05); g.add(sg);
  shadowAll(g);
  return { group: g, hw: w / 2 + 0.5, hd: d / 2, porchFront: d / 2 + vd };
}

export function coveredWagon() {
  const g = new THREE.Group();
  const w = woodMat(0x7a5030);
  const bed = new THREE.Mesh(boxGeo(1.8, 0.6, 4), w); bed.position.y = 1.1; g.add(bed);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.8, 16, 1, true, -Math.PI / 2, Math.PI), mat(0xeee6d2, { side: THREE.DoubleSide, roughness: 1 }));
  cover.rotation.x = -Math.PI / 2; cover.position.y = 1.4; g.add(cover);
  for (const [x, z] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]]) {
    const wh = wagonWheel(0.6); wh.rotation.y = Math.PI / 2; wh.position.set(x, 0.62, z); g.add(wh);
  }
  const tongue = new THREE.Mesh(boxGeo(0.12, 0.12, 2.4), w); tongue.position.set(0, 0.6, 3.1); tongue.rotation.x = 0.2; g.add(tongue);
  shadowAll(g);
  return { group: g, hw: 1.2, hd: 2.2 };
}

export function roundPen(r = 9, colliders = null, cx = 0, cz = 0, y = 0) {
  const pts = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    if (i === n) { pts.push([cx + r, y, cz]); break; }
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return fence(pts, { colliders, height: 1.7, rails: 4, color: 0x8a6a4a, gateAt: 6 });
}

export function hayShed() {
  const g = new THREE.Group();
  const w = 8, d = 5, h = 3.6;
  const pm = woodMat(0x6e4a2e);
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) {
    const p = new THREE.Mesh(boxGeo(0.25, h, 0.25), pm); p.position.set(x, h / 2, z); g.add(p);
  }
  const roof = new THREE.Mesh(boxGeo(w + 1, 0.15, d + 1, 0.5), mat(0x8a8f96, { metalness: 0.6, roughness: 0.45 }));
  roof.position.y = h + 0.2; roof.rotation.x = 0.1; g.add(roof);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const b = roundBale(); b.position.set(-2.6 + i * 2.6, j * 1.4, 0); b.scale.setScalar(0.95); g.add(b);
  }
  shadowAll(g);
  return { group: g, hw: w / 2, hd: d / 2 };
}

export function chickenCoop() {
  const g = new THREE.Group();
  const wall = woodMat(0xd8c8a0);
  const body = new THREE.Mesh(boxGeo(2.4, 1.6, 1.8), wall); body.position.y = 1.3; g.add(body);
  for (const [x, z] of [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]]) { const l = new THREE.Mesh(boxGeo(0.12, 0.5, 0.12), woodMat(0x6e4a2e)); l.position.set(x, 0.25, z); g.add(l); }
  const roof = gableRoof(2.4, 1.8, 0.8, 0.2, woodMat(0x8a2a20, 'shingles')); roof.position.y = 2.1; g.add(roof);
  for (const s of [-1, 1]) { const ge = gableEnd(2.4, 0.8, wall); ge.position.set(0, 2.1, s * 0.91); if (s < 0) ge.rotation.y = Math.PI; g.add(ge); }
  const ramp = new THREE.Mesh(boxGeo(0.5, 0.05, 1.3), woodMat(0x7a5634)); ramp.position.set(0.6, 0.3, 1.4); ramp.rotation.x = 0.55; g.add(ramp);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.45), mat(0x140c06)); hole.position.set(0.6, 0.8, 0.91); g.add(hole);
  shadowAll(g);
  return { group: g, hw: 1.3, hd: 1.0 };
}

export function dogHouse() {
  const g = new THREE.Group();
  const wall = woodMat(0x9a6a40);
  const body = new THREE.Mesh(boxGeo(1.1, 0.9, 1.4), wall); body.position.y = 0.45; g.add(body);
  const roof = gableRoof(1.1, 1.4, 0.5, 0.12, woodMat(0x8a2a20, 'shingles')); roof.position.y = 0.9; g.add(roof);
  const ge = gableEnd(1.1, 0.5, wall); ge.position.set(0, 0.9, 0.71); g.add(ge);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12, 0, Math.PI), mat(0x140c06)); hole.position.set(0, 0.12, 0.71); g.add(hole);
  const holeR = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12), mat(0x140c06)); holeR.position.set(0, 0.06, 0.711); g.add(holeR);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.08, 12), mat(0x3060c0, { metalness: 0.3 })); bowl.position.set(0.7, 0.04, 0.9); g.add(bowl);
  const sg = sign('BUDDY', 0.7, 0.2); sg.position.set(0, 1.0, 0.75); g.add(sg);
  shadowAll(g);
  return { group: g, hw: 0.6, hd: 0.75 };
}

export function trophyCabinet() {
  const g = new THREE.Group();
  const w = woodMat(0x4a2a16);
  const back = new THREE.Mesh(boxGeo(2.0, 2.0, 0.08), w); back.position.set(0, 1.0, -0.26); g.add(back);
  for (const x of [-1, 1]) { const s = new THREE.Mesh(boxGeo(0.08, 2.0, 0.6), w); s.position.set(x, 1.0, 0); g.add(s); }
  const shelves = [];
  for (let i = 0; i < 4; i++) {
    const sh = new THREE.Mesh(boxGeo(2.0, 0.06, 0.6), w); sh.position.set(0, 0.05 + i * 0.62, 0); g.add(sh);
    if (i < 3) shelves.push(0.08 + i * 0.62);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, clearcoat: 1 }));
  glass.position.set(0, 1, 0.3); g.add(glass);
  shadowAll(g);
  g.userData.shelves = shelves;
  return { group: g, hw: 1.05, hd: 0.35 };
}

export function arenaStands(len = 20) {
  const g = new THREE.Group();
  const w = woodMat(0x8a6a48);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(boxGeo(len, 0.12, 0.8), w); s.position.set(0, 0.5 + i * 0.5, -i * 0.8); g.add(s);
    const r = new THREE.Mesh(boxGeo(len, 0.5 + i * 0.5, 0.1), woodMat(0x6e4a2e)); r.position.set(0, (0.5 + i * 0.5) / 2, -i * 0.8 + 0.4); g.add(r);
  }
  const flagColors = [0xc0302a, 0xeeeeee, 0x2a4ac0];
  for (let i = 0; i < 6; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.5, 6), mat(0xcccccc, { metalness: 0.8 }));
    pole.position.set(-len / 2 + (i + 0.5) * (len / 6), 4.5, -4); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), mat(flagColors[i % 3], { side: THREE.DoubleSide }));
    flag.position.set(pole.position.x + 0.5, 6.4, -4); flag.userData.flag = true; g.add(flag);
  }
  shadowAll(g);
  return g;
}

export function barrelProp() { return barrel(0x8a3a20); }

export function waterTower() {
  const g = new THREE.Group();
  const w = woodMat(0x7a5634);
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    const l = new THREE.Mesh(boxGeo(0.25, 7, 0.25), w); l.position.set(x, 3.5, z); g.add(l);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 20), woodMat(0x8a6040));
  tank.position.y = 8.5; g.add(tank);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 20), woodMat(0x4a3a30, 'shingles')); cap.position.y = 10.6; g.add(cap);
  for (const y of [7.4, 8.5, 9.6]) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.04, 4, 30), mat(0x333333, { metalness: 0.7 })); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  shadowAll(g);
  return g;
}
