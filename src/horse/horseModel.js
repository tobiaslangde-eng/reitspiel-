import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { COATS, proportions, BREEDS } from './breeds.js';

// ---------------------------------------------------------------------------
// Parametric surface helper: tube along t with ring points from fn(t, theta).
// Ends are closed with pole vertices.
// ---------------------------------------------------------------------------
function tube(fn, R = 24, S = 20, flip = false) {
  const pos = [];
  const idx = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    for (let j = 0; j < S; j++) {
      fn(t, (j / S) * Math.PI * 2, v);
      pos.push(v.x, v.y, v.z);
    }
  }
  const ringCenter = (i) => {
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < S; j++) { x += pos[(i * S + j) * 3]; y += pos[(i * S + j) * 3 + 1]; z += pos[(i * S + j) * 3 + 2]; }
    return [x / S, y / S, z / S];
  };
  const c0 = ringCenter(0), c1 = ringCenter(R);
  const p0 = pos.length / 3; pos.push(...c0);
  const p1 = pos.length / 3; pos.push(...c1);
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + ((j + 1) % S), c = (i + 1) * S + j, d = (i + 1) * S + ((j + 1) % S);
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  for (let j = 0; j < S; j++) {
    if (flip) {
      idx.push(p0, (j + 1) % S, j);
      idx.push(p1, R * S + j, R * S + ((j + 1) % S));
    } else {
      idx.push(p0, j, (j + 1) % S);
      idx.push(p1, R * S + ((j + 1) % S), R * S + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
const gauss = (x, m, s) => Math.exp(-(((x - m) / s) ** 2));

// ---------------------------------------------------------------------------
// Coat shader
// ---------------------------------------------------------------------------
const COAT_GLSL = /* glsl */`
${GLSL_NOISE}
float vor(vec3 x){
  vec3 p = floor(x); vec3 f = fract(x); float res = 8.0;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 b = vec3(float(i),float(j),float(k));
    vec3 r = b - f + vec3(hash13(p+b), hash13(p+b+17.17), hash13(p+b+31.31));
    res = min(res, dot(r,r));
  }
  return sqrt(res);
}
vec3 coatColor(vec3 p, vec3 lp, float part){
  float n = fbm3(p*3.0 + uSeed);
  vec3 col = uBase * (0.88 + 0.24*n);
  // darker topline, lighter belly & flank shading
  col *= mix(1.0, 1.08, smoothstep(1.3, 0.9, p.y) * step(0.7, p.y));
  float legZone = 1.0 - smoothstep(0.42, 0.64, p.y + (n-0.5)*0.1);
  if (uPoints > 0.5) {
    col = mix(col, uPoint, legZone);
  } else {
    col = mix(col, uPoint, legZone*0.7);
  }
  if (uDorsal > 0.5) {
    float d = smoothstep(0.05, 0.015, abs(p.x)) * smoothstep(uTopY-0.1, uTopY+0.02, p.y) * step(p.z, uBodyFront) * step(-uBodyFront, p.z);
    col = mix(col, uPoint, d*0.85);
  }
  if (uPattern == 1) {
    float v = vor(p*7.5 + uSeed);
    float ring = smoothstep(0.35, 0.65, v);
    col = mix(col, uPatternColor, ring * smoothstep(0.7, 1.15, p.y) * 0.55);
    col = mix(col, uPoint, (1.0 - smoothstep(0.2, 0.75, p.y))*0.5);
  } else if (uPattern == 2) {
    float t = fbm3(vec3(p.x*1.4, p.y*2.3, p.z*2.6) + uSeed*1.7);
    float white = smoothstep(0.5, 0.52, t + (1.25 - p.y)*0.14);
    col = mix(col, uPatternColor, white);
  } else if (uPattern == 3) {
    float v = vor(p*vec3(9.0,9.0,9.0) + uSeed);
    float rad = 0.32 + 0.12*vnoise(p*20.0);
    float spot = smoothstep(rad, rad-0.08, v);
    col = mix(col, uPatternColor*(0.8+0.4*n), spot*0.92);
  } else if (uPattern == 4) {
    float blanket = smoothstep(0.08, -0.12, p.z + (n-0.5)*0.35) * smoothstep(0.92, 1.18, p.y + (n-0.5)*0.1);
    col = mix(col, uPatternColor, blanket);
    float v = vor(p*11.0 + uSeed);
    float spot = smoothstep(0.32, 0.2, v) * blanket;
    col = mix(col, uBase*0.7, spot);
  }
  // white socks
  if (part > 2.5) {
    int li = int(part - 3.0 + 0.5);
    float sh = li==0 ? uSocks.x : li==1 ? uSocks.y : li==2 ? uSocks.z : uSocks.w;
    if (sh > 0.0) {
      float edge = sh + (vnoise(p*30.0)-0.5)*0.05;
      col = mix(col, vec3(0.94,0.93,0.9), smoothstep(edge+0.01, edge-0.01, p.y));
    }
  }
  // head: blaze & muzzle
  if (part > 1.5 && part < 2.5) {
    float L = uHeadLen;
    float t = clamp(lp.y / L, 0.0, 1.0);
    if (uBlaze > 0.5) {
      float w = uBlaze > 1.5 ? mix(0.05, 0.06, t) : mix(0.035, 0.018, t);
      float star = uBlaze > 1.5 ? 1.0 : smoothstep(0.75, 0.6, t);
      float b = smoothstep(w, w-0.01, abs(lp.x + (vnoise(lp*25.0)-0.5)*0.01)) * step(lp.z, -0.02) * smoothstep(0.08, 0.14, t) * star;
      col = mix(col, vec3(0.95,0.94,0.92), b);
    }
    float muzzle = smoothstep(0.78, 0.95, t);
    col = mix(col, uBlaze > 1.5 ? vec3(0.36,0.2,0.18) : vec3(0.02,0.015,0.015), muzzle*0.75);
  }
  // dirt
  float dm = smoothstep(0.5, 0.72, fbm3(p*6.0 + 3.0)) * (1.0 - smoothstep(0.25, 1.4, p.y));
  dm += smoothstep(0.55, 0.7, fbm3(p*4.0 + 9.0)) * 0.6;
  col = mix(col, vec3(0.1, 0.065, 0.035), clamp(dm,0.0,1.0) * uDirt);
  return col;
}
`;

function coatMaterial(coatKey, horse, breed) {
  const c = COATS[coatKey] || COATS.brauner;
  const sheen = (c.sheen || breed.sheen) ? 1 : 0;
  const uniforms = {
    uBase: { value: new THREE.Color().setRGB(...c.base, THREE.SRGBColorSpace) },
    uPoint: { value: new THREE.Color().setRGB(...c.point, THREE.SRGBColorSpace) },
    uPatternColor: { value: new THREE.Color().setRGB(...(c.patternColor || c.base), THREE.SRGBColorSpace) },
    uPattern: { value: c.pattern },
    uPoints: { value: c.points ? 1 : 0 },
    uDorsal: { value: c.dorsal ? 1 : 0 },
    uSeed: { value: (parseInt(horse.id, 36) % 1000) * 0.137 },
    uSocks: { value: new THREE.Vector4(...(horse.markings?.socks || [0, 0, 0, 0])) },
    uBlaze: { value: horse.markings?.blaze || 0 },
    uDirt: { value: 0 },
    uTopY: { value: 1.6 },
    uBodyFront: { value: 0.7 },
    uHeadLen: { value: 0.6 },
    uSheen: { value: sheen },
    uWet: { value: 0 },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest; attribute vec3 aLocal; attribute float aPart; varying vec3 vRest; varying vec3 vLocal; varying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vLocal = aLocal; vPart = aPart;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uBase; uniform vec3 uPoint; uniform vec3 uPatternColor; uniform int uPattern; uniform float uPoints; uniform float uDorsal;
        uniform float uSeed; uniform vec4 uSocks; uniform float uBlaze; uniform float uDirt; uniform float uTopY; uniform float uBodyFront;
        uniform float uHeadLen; uniform float uSheen; uniform float uWet;
        varying vec3 vRest; varying vec3 vLocal; varying float vPart;
        ${COAT_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = coatColor(vRest, vLocal, vPart) * (1.0 - uWet*0.25);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(mix(0.58, 0.34, uSheen), 0.3, uWet);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = uSheen * 0.4;');
  };
  m.userData.uniforms = uniforms;
  m.customProgramCacheKey = () => 'coat';
  return m;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
export function buildHorseModel(horse) {
  const P = proportions(horse);
  const breed = BREEDS[horse.breed];
  const coat = COATS[horse.coat] || COATS.brauner;
  const coatMat = coatMaterial(horse.coat, horse, breed);
  const hairColor = new THREE.Color().setRGB(...coat.mane, THREE.SRGBColorSpace);
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.5, side: THREE.DoubleSide });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.45 });
  const hoofLight = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.45 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 0.05, metalness: 0.2 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const coatMeshes = [];
  const addCoat = (geo, part, parent) => {
    const m = new THREE.Mesh(geo, coatMat);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.part = part;
    parent.add(m);
    coatMeshes.push(m);
    return m;
  };

  const L = P.legLen, bulk = P.bulk, BL = P.bodyLen, th = P.legThick;
  // --- Leg geometry metrics ---
  const fSeg = [0.46 * L, 0.4 * L, 0.24 * L];
  const fRest = [0.02, 0, -0.5];
  const hSeg = [0.56 * L, 0.42 * L, 0.24 * L];
  const hRest = [0.48, -0.48, -0.42];
  const vert = (segs, rest) => {
    let a = 0, y = 0;
    for (let i = 0; i < 3; i++) { a += rest[i]; y += (i === 2 ? segs[i] - 0.08 : segs[i]) * Math.cos(a); }
    return y + 0.08;
  };
  const hipF = vert(fSeg, fRest);
  const hipH = vert(hSeg, hRest);

  const hb = 0.3 * bulk, htBase = 0.3 * bulk;
  const cy = hipF + 0.24 * bulk;
  const zLen = 0.82 * BL;
  const topAt = (s) => cy + (htBase + 0.07 * gauss(s, 0.62, 0.17) + 0.04 * gauss(s, -0.55, 0.25) - 0.025 * gauss(s, 0.05, 0.25));

  // --- Body ---
  const bodyGeo = tube((t, th2, v) => {
    const s = t * 2 - 1;
    const taper = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.5);
    const vtaper = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 3.2)), 0.45);
    const hw = 0.27 * bulk * (1 + 0.06 * -s) * taper;
    const ht = (htBase + 0.07 * gauss(s, 0.62, 0.17) + 0.04 * gauss(s, -0.55, 0.25) - 0.025 * gauss(s, 0.05, 0.25)) * vtaper;
    const hbb = hb * (1 + 0.08 * gauss(s, -0.05, 0.4) - 0.12 * gauss(s, 0.8, 0.2)) * vtaper;
    const sx = Math.sin(th2), cz = Math.cos(th2);
    v.set(hw * spow(sx, 0.75), cy + (cz > 0 ? ht : hbb) * spow(cz, 0.8), s * zLen);
  }, 36, 26);
  addCoat(bodyGeo, 0, body);

  // --- Neck ---
  const neckLen = 0.78 * P.neckLen;
  const neckTilt = 0.62;
  const neck = new THREE.Group();
  neck.position.set(0, cy + 0.08, zLen * 0.72);
  neck.rotation.x = neckTilt;
  body.add(neck);
  const neckGeo = tube((t, a, v) => {
    const rx = (0.2 - 0.115 * Math.pow(t, 0.8)) * Math.sqrt(bulk);
    const rz = (0.3 - 0.15 * t) * (0.9 + 0.1 * bulk);
    const cz = 0.04 * (1 - t) - 0.02 * Math.sin(t * Math.PI);
    v.set(rx * spow(Math.sin(a), 0.85), -0.12 + t * (neckLen + 0.18), cz + rz * spow(Math.cos(a), 0.9) * (Math.cos(a) < 0 ? 0.92 : 1));
  }, 16, 18, true);
  addCoat(neckGeo, 1, neck);

  // --- Head ---
  const headLen = 0.68 * P.headLen;
  const head = new THREE.Group();
  head.position.set(0, neckLen, 0.02);
  head.rotation.x = 1.5;
  neck.add(head);
  const headSection = (t) => ({
    rx: (0.118 - 0.04 * t + 0.014 * gauss(t, 0.93, 0.07)) * (0.92 + 0.08 * bulk),
    rz: 0.108 - 0.022 * t + 0.075 * gauss(t, 0.2, 0.2),
    cz: 0.055 * gauss(t, 0.18, 0.22) + 0.005,
    y: -0.04 + t * (headLen + 0.06),
  });
  const headGeo = tube((t, a, v) => {
    const { rx, rz, cz } = headSection(t);
    const ca = Math.cos(a);
    v.set(rx * spow(Math.sin(a), 0.8), -0.04 + t * (headLen + 0.06), cz + rz * spow(ca, ca < 0 ? 0.7 : 0.9));
  }, 18, 18, true);
  addCoat(headGeo, 2, head);
  // eyes & nostrils
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeMat);
    eye.position.set(s * 0.105 * (0.92 + 0.08 * bulk), headLen * 0.22, -0.015);
    eye.scale.set(0.6, 1, 1);
    head.add(eye);
    const nos = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat);
    nos.position.set(s * 0.045, headLen * 0.97, -0.04); nos.scale.set(0.7, 1.3, 0.6);
    head.add(nos);
  }
  // ears
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.055, 0.03, -0.07);
    ear.rotation.set(0.85, 0, s * 0.3);
    head.add(ear);
    const eg = new THREE.ConeGeometry(0.035, 0.15, 8);
    eg.translate(0, 0.075, 0); eg.rotateX(Math.PI); eg.scale(1, 1, 0.6);
    addCoat(eg, 2, ear);
    ears.push(ear);
  }

  // --- Legs ---
  const legs = [];
  const legDefs = [
    { front: true, side: 1, x: 0.125 * bulk, z: zLen * 0.6, y: hipF, segs: fSeg, rest: fRest },
    { front: true, side: -1, x: -0.125 * bulk, z: zLen * 0.6, y: hipF, segs: fSeg, rest: fRest },
    { front: false, side: 1, x: 0.14 * bulk, z: -zLen * 0.62, y: hipH, segs: hSeg, rest: hRest },
    { front: false, side: -1, x: -0.14 * bulk, z: -zLen * 0.62, y: hipH, segs: hSeg, rest: hRest },
  ];
  legDefs.forEach((d, i) => {
    const hip = new THREE.Group(); hip.position.set(d.x, d.y, d.z); hip.rotation.x = d.rest[0]; body.add(hip);
    const r1t = (d.front ? 0.125 : 0.17) * th, r1b = (d.front ? 0.068 : 0.07) * th;
    const g1 = new THREE.CylinderGeometry(r1t, r1b, d.segs[0] + 0.2, 12, 3);
    g1.translate(0, -(d.segs[0] + 0.2) / 2 + 0.2, 0);
    g1.scale(d.front ? 0.85 : 0.75, 1, d.front ? 1.1 : 1.3);
    addCoat(g1, 3 + i, hip);
    const knee = new THREE.Group(); knee.position.y = -d.segs[0]; knee.rotation.x = d.rest[1]; hip.add(knee);
    const kj = new THREE.SphereGeometry(r1b * 1.05, 10, 8); kj.scale(0.9, 1.1, 1.0);
    addCoat(kj, 3 + i, knee);
    const g2 = new THREE.CylinderGeometry(0.056 * th, 0.05 * th, d.segs[1], 10);
    g2.translate(0, -d.segs[1] / 2, 0);
    addCoat(g2, 3 + i, knee);
    const fet = new THREE.Group(); fet.position.y = -d.segs[1]; fet.rotation.x = d.rest[2]; knee.add(fet);
    const fj = new THREE.SphereGeometry(0.062 * th, 10, 8);
    addCoat(fj, 3 + i, fet);
    const g3 = new THREE.CylinderGeometry(0.048 * th, 0.054 * th, d.segs[2] - 0.08, 10);
    g3.translate(0, -(d.segs[2] - 0.08) / 2, 0);
    addCoat(g3, 3 + i, fet);
    // hoof: stays level with the ground (counter-rotate)
    const hoofPivot = new THREE.Group(); hoofPivot.position.y = -(d.segs[2] - 0.08); fet.add(hoofPivot);
    hoofPivot.rotation.x = -(d.rest[0] + d.rest[1] + d.rest[2]);
    const sock = (horse.markings?.socks || [])[i] > 0;
    const hg = new THREE.CylinderGeometry(0.052 * th, 0.068 * th, 0.09, 12);
    hg.translate(0, -0.045, 0.012);
    const hoof = new THREE.Mesh(hg, sock ? hoofLight : hoofMat);
    hoof.castShadow = true;
    hoofPivot.add(hoof);
    let feather = null;
    if (P.feather > 0.05) {
      const fg = new THREE.CylinderGeometry(0.058 * th, (0.075 + 0.04 * P.feather) * th, 0.2 * P.feather + 0.08, 12, 2, true);
      const fpos = fg.attributes.position;
      for (let k = 0; k < fpos.count; k++) {
        const yy = fpos.getY(k);
        if (yy < 0) { fpos.setX(k, fpos.getX(k) * (0.9 + Math.random() * 0.3)); fpos.setY(k, yy - Math.random() * 0.03); }
      }
      fg.translate(0, -(0.2 * P.feather + 0.08) / 2 + 0.02, 0.015);
      const fMat = sock ? new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.7, side: THREE.DoubleSide }) : hairMat;
      feather = new THREE.Mesh(fg, fMat);
      feather.castShadow = true;
      feather.position.y = -(d.segs[2] - 0.08) + 0.12;
      fet.add(feather);
    }
    legs.push({ ...d, hip, knee, fet, hoofPivot, hoof, feather, phase: 0, lastU: 0 });
  });

  // --- Tail ---
  const tail = [];
  const tailLen = 0.95 * P.tailLen;
  const N = 7;
  const segL = tailLen / N;
  let parent = body;
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, topAt(-0.97) - 0.08, -zLen * 0.97);
  body.add(tailRoot);
  parent = tailRoot;
  const tailMeshes = [];
  for (let i = 0; i < N; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0 : -segL;
    seg.rotation.x = i === 0 ? (breed.tailHigh ? 0.35 : 0.7) : -0.12;
    parent.add(seg);
    const k0 = i / N, k1 = (i + 1) / N;
    const fan = (k) => (k < 0.2 ? 0.035 + k * 0.1 : 0.055 + Math.sin(Math.min(1, k) * Math.PI * 0.85) * 0.07 * Math.min(1.4, P.tailLen));
    const g = new THREE.CylinderGeometry(fan(k0), i === N - 1 ? 0.02 : fan(k1), segL * 1.25, 9, 1);
    g.translate(0, -segL / 2, 0);
    g.scale(0.75, 1, 1);
    const m = new THREE.Mesh(g, hairMat);
    m.castShadow = true;
    seg.add(m);
    tailMeshes.push(m);
    tail.push({ g: seg, rest: seg.rotation.x, vel: 0, off: 0, yaw: 0, yawVel: 0 });
    parent = seg;
  }

  // --- Mane ---
  const mane = [];
  const maneGroup = new THREE.Group();
  neck.add(maneGroup);
  const fjord = (breed.maneStyle === 'fjord');
  const lockCount = 15;
  const lockGeoCache = {};
  const lockGeo = (len, w) => {
    const key = len.toFixed(2) + w;
    if (lockGeoCache[key]) return lockGeoCache[key];
    const g = new THREE.PlaneGeometry(w, len, 1, 5);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const yy = p.getY(k);
      const t = 0.5 - yy / len; // 0 top .. 1 bottom
      p.setX(k, p.getX(k) * (1 - 0.65 * t));
      p.setZ(k, Math.sin(t * Math.PI) * 0.02 + t * t * 0.03);
      p.setY(k, yy - len / 2);
    }
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    lockGeoCache[key] = g;
    return g;
  };
  for (let i = 0; i < lockCount; i++) {
    const t = i / (lockCount - 1);
    const y = -0.05 + t * (neckLen + 0.02);
    const rz = (0.3 - 0.15 * Math.min(1, (y + 0.12) / (neckLen + 0.18))) * (0.9 + 0.1 * bulk);
    const lock = new THREE.Group();
    lock.position.set(0, y, -rz + 0.05 + 0.04 * (1 - t));
    maneGroup.add(lock);
    let len = (0.18 + 0.22 * Math.sin(0.4 + t * 2.4)) * P.maneLen;
    if (fjord) len = 0.1;
    const m = new THREE.Mesh(lockGeo(len, 0.13), hairMat);
    m.castShadow = true;
    lock.add(m);
    if (!fjord) {
      const m2 = new THREE.Mesh(lockGeo(len * 0.85, 0.11), hairMat);
      m2.rotation.y = 0.5; m2.position.x = -0.01;
      lock.add(m2);
    }
    if (fjord) {
      lock.rotation.x = -0.15;
      const dark = new THREE.Mesh(lockGeo(0.105, 0.04), new THREE.MeshStandardMaterial({ color: 0x14100c, side: THREE.DoubleSide }));
      dark.position.z = -0.005;
      lock.add(dark);
      lock.rotation.x = Math.PI - neckTilt;
    }
    mane.push({ g: lock, t, len, rest: fjord ? lock.rotation.x : -neckTilt + 0.15, side: -1, mesh: m });
  }
  // forelock
  const forelock = new THREE.Group();
  forelock.position.set(0, 0.01, -0.09);
  head.add(forelock);
  const fl = new THREE.Mesh(lockGeo(0.16 * Math.max(0.6, P.maneLen), 0.1), hairMat);
  forelock.add(fl);
  forelock.rotation.x = Math.PI + 0.25;

  // Braids (hidden unless maneStyle = braids)
  const braids = new THREE.Group();
  neck.add(braids);
  const braidGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const bowGroup = new THREE.Group();
  neck.add(bowGroup);
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    const y = t * neckLen;
    const rz = (0.3 - 0.15 * Math.min(1, (y + 0.12) / (neckLen + 0.18))) * (0.9 + 0.1 * bulk);
    const b = new THREE.Mesh(braidGeo, hairMat);
    b.position.set(0, y, -rz + 0.02); b.scale.set(1, 1.3, 1.1);
    braids.add(b);
    const bow = new THREE.Group();
    bow.position.copy(b.position); bow.position.z -= 0.035;
    bowGroup.add(bow);
  }
  braids.visible = false;
  bowGroup.visible = false;

  // --- Mount points ---
  const saddleMount = new THREE.Object3D();
  saddleMount.position.set(0, topAt(0.12), zLen * 0.12);
  body.add(saddleMount);
  const chestMount = new THREE.Object3D();
  chestMount.position.set(0, cy + 0.05, zLen * 0.93);
  body.add(chestMount);

  // Bake rest-pose attributes
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const m of coatMeshes) {
    const g = m.geometry;
    const n = g.attributes.position.count;
    const rest = new Float32Array(n * 3);
    const local = new Float32Array(n * 3);
    const part = new Float32Array(n).fill(m.userData.part);
    const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const v = new THREE.Vector3();
    // local coords in the parent pivot frame (used for head markings)
    const headInv = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(m.matrixWorld);
    for (let k = 0; k < n; k++) {
      v.fromBufferAttribute(g.attributes.position, k).applyMatrix4(mw);
      rest[k * 3] = v.x; rest[k * 3 + 1] = v.y; rest[k * 3 + 2] = v.z;
      v.fromBufferAttribute(g.attributes.position, k).applyMatrix4(headInv);
      local[k * 3] = v.x; local[k * 3 + 1] = v.y; local[k * 3 + 2] = v.z;
    }
    g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    g.setAttribute('aLocal', new THREE.BufferAttribute(local, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  }
  const u = coatMat.userData.uniforms;
  u.uTopY.value = topAt(0.62) - 0.02;
  u.uBodyFront.value = zLen * 0.8;
  u.uHeadLen.value = headLen;

  return {
    root, body, neck, head, ears, legs, tail, mane, maneGroup, forelock, braids, bowGroup,
    saddleMount, chestMount, coatMat, hairMat, tailMeshes,
    dims: { hipF, hipH, cy, zLen, neckLen, headLen, topY: topAt(0.62), size: P.size, neckTilt, saddleY: topAt(0.12), bulk, headSection, legThick: th },
    P,
  };
}

export function disposeHorseModel(rig) {
  rig.root.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
    }
  });
  rig.coatMat.dispose();
  rig.hairMat.dispose();
}
