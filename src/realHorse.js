// Realistisches Pferdemodell (glTF mit Skelett): Laden, Fellfarben per Shader, Gangarten auf das Skelett übertragen
// Modell: "HORSE - Realistic 3D Model (DEMO FREE)" von WildMesh 3D, CC-BY-NC-4.0
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, lerp, damp, mix } from './util.js';
import { coatOf, growth } from './data.js';

export const REAL = { ready: false, scene: null, clips: {}, base: {}, tex: {} };
const REF_WITHERS = 1.68, Z0 = 1.5, WALK_STRIDE = 1.84, PIVOT = 1.2;
// Knochen, die prozedural bewegt werden
const LEG_BONES = [
  ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'fingers_01_l'], ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'fingers_01_r'],
  ['upperleg_l', 'lowerleg_l', 'foot_l', 'toes_01_l'], ['upperleg_r', 'lowerleg_r', 'foot_r', 'toes_01_r'],
];
const NECK = ['neck_01', 'neck_02', 'neck_03', 'neck_04'], EXTRA = ['head', 'tail_01', 'tail_02', 'saddle'];
const key = (n) => n.replace(/_0?\d+$/, '');

export function loadRealHorse(url) {
  return new Promise((resolve) => {
    let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => fin(false), 25000);
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const ok = (g) => { try { prepare(g); REAL.ready = true; fin(true); } catch (e) { console.warn('Pferdemodell unbrauchbar', e); fin(false); } };
      if (window.HORSE_GLB) { const bin = atob(window.HORSE_GLB), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); window.HORSE_GLB = null; loader.parse(buf.buffer, '', ok, () => fin(false)); }
      else loader.load(url, ok, undefined, () => fin(false));
    } catch (_) { fin(false); }
  });
}

function prepare(g) {
  const sc = REAL.scene = g.scene;
  for (const c of g.animations) REAL.clips[/walk/i.test(c.name) ? 'walk' : 'idle'] = c;
  // Referenzhaltung: erstes Bild der Steh-Animation
  const mixer = new THREE.AnimationMixer(sc), act = mixer.clipAction(REAL.clips.idle); act.play(); mixer.setTime(0); sc.updateMatrixWorld(true);
  const X = new THREE.Vector3(1, 0, 0), q = new THREE.Quaternion();
  const want = new Set([...LEG_BONES.flat(), ...NECK, ...EXTRA]);
  sc.traverse((o) => {
    if (o.isBone && want.has(key(o.name)) && !REAL.base[key(o.name)]) {
      o.parent.getWorldQuaternion(q);
      REAL.base[key(o.name)] = { q: o.quaternion.clone(), axis: X.clone().applyQuaternion(q.invert()).normalize() };
    }
    if (o.isSkinnedMesh) {
      const n = o.material.name; REAL.tex[n] = o.material.map;
      if (n === 'M_Body') { // Ruheposition je Vertex (Meter) für die Fellzeichnung
        const pos = o.geometry.attributes.position, a = new Float32Array(pos.count * 3), v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; }
        o.geometry.setAttribute('aRest', new THREE.BufferAttribute(a, 3));
      }
    }
  });
  act.stop(); mixer.uncacheRoot(sc);
}

const COAT_FRAG = /* glsl */`
uniform vec3 uBody; uniform vec3 uPoints; uniform float uPointsAmt; uniform vec4 uSock; uniform float uFace; uniform float uTobi; uniform float uLeo;
uniform float uRoan; uniform float uDapple; uniform float uDun; uniform float uSeed; uniform float uPink;
varying vec3 vRest;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb(vec3 p) { return 0.55 * n3(p) + 0.3 * n3(p * 2.1 + 7.0) + 0.15 * n3(p * 4.3 + 3.0); }
float cell(vec3 p) { vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) { vec3 o = vec3(float(x), float(y), float(z)); vec3 c = o + vec3(h3(i + o), h3(i + o + 5.3), h3(i + o + 9.1)); d = min(d, length(c - f)); }
  return d; }
`;
const COAT_MAIN = /* glsl */`
{
  vec3 tex = diffuseColor.rgb, p = vRest, sp = p + uSeed;
  float fore = step(1.5, p.z), left = step(0.0, p.x);
  float head = smoothstep(2.55, 2.75, p.z) * smoothstep(1.5, 1.6, p.y);
  float legArea = smoothstep(0.95, 0.75, p.y);
  vec3 col = uBody;
  col *= 1.0 + uDapple * 0.22 * (smoothstep(0.42, 0.2, cell(sp * 9.0)) - 0.3) * (1.0 - legArea) * (1.0 - head);
  col = mix(col, vec3(0.9, 0.89, 0.86), uRoan * 0.6 * smoothstep(0.35, 0.7, n3(sp * 160.0)) * (1.0 - legArea) * (1.0 - head));
  float pts = smoothstep(0.8, 0.5, p.y + (n3(sp * 14.0) - 0.5) * 0.1);
  pts = max(pts, smoothstep(2.98, 3.1, p.z) * (1.0 - uPink));
  col = mix(col, uPoints, pts * uPointsAmt);
  col = mix(col, uPoints, uDun * smoothstep(0.03, 0.012, abs(p.x)) * smoothstep(1.5, 1.56, p.y) * step(p.z, 2.0));
  float white = 0.0;
  float sh = mix(mix(uSock.w, uSock.z, left), mix(uSock.y, uSock.x, left), fore);
  white = max(white, step(0.01, sh) * smoothstep(sh + 0.02, sh - 0.02, p.y + (n3(sp * 30.0) - 0.5) * 0.05));
  float tob = fb(sp * 1.7) + (p.y - 1.2) * 0.3;
  white = max(white, uTobi * max(smoothstep(0.5, 0.54, tob) * (1.0 - head), smoothstep(0.7, 0.55, p.y)));
  float spots = smoothstep(0.2, 0.27, cell(sp * 13.0));
  float blanket = smoothstep(1.5, 1.2, p.z + (n3(sp * 5.0) - 0.5) * 0.3) * smoothstep(0.95, 1.25, p.y);
  white = max(white, step(0.5, uLeo) * mix(blanket, 1.0, step(1.5, uLeo)) * mix(spots, 1.0, step(2.5, uLeo) * 0.9));
  float fd = (p.z - 2.86) * 0.79 + (p.y - 2.05) * 0.61, fx = abs(p.x + 0.03);
  float front = smoothstep(-0.06, -0.02, fd) * step(2.6, p.z);
  float fw = uFace < 1.5 ? 0.0 : uFace < 2.5 ? 0.014 : uFace < 3.5 ? 0.04 : 0.085;
  float fm = step(0.5, uFace) * smoothstep(0.05, 0.035, length(vec3(p.x + 0.03, p.y - 2.0, p.z - 2.9)));
  fm = max(fm, smoothstep(fw + 0.006, fw - 0.004, fx) * step(0.001, fw) * smoothstep(2.05, 2.0, p.y));
  white = max(white, fm * front);
  col = mix(col, vec3(0.93, 0.91, 0.87), white);
  float nose = smoothstep(3.0, 3.09, p.z) * max(uPink, white * step(2.5, uFace));
  col = mix(col, vec3(0.85, 0.62, 0.58), nose * 0.8);
  float hoof = smoothstep(0.1, 0.075, p.y);
  float sockHoof = step(0.01, sh) + uTobi + uPink;
  diffuseColor.rgb = mix(col * tex * 1.32, tex * mix(vec3(0.5), vec3(1.5, 1.35, 1.1), clamp(sockHoof, 0.0, 1.0)), hoof);
}
`;

function coatMaterial(h, coat, cf) {
  const leoFull = coat.leopard === 2 || (coat.leopard === 1 && h.seed % 3 === 0);
  const C = (hex) => new THREE.Color(hex);
  const sockH = [0, 0.14, 0.26, 0.52];
  const u = {
    uBody: { value: C(coat.body) }, uPoints: { value: C(coat.points || mix(coat.body, '#000000', 0.3)) }, uPointsAmt: { value: coat.points ? 0.95 : 0.35 },
    uSock: { value: new THREE.Vector4(...h.legs.map((v) => sockH[v])) }, uFace: { value: h.face }, uTobi: { value: coat.tobiano ? 1 : 0 },
    uLeo: { value: !coat.leopard ? 0 : coat.leopard === 2 ? 3 : leoFull ? 2 : 1 }, uRoan: { value: coat.roan ? 1 : 0 }, uDapple: { value: coat.dapple ? 1 : 0 },
    uDun: { value: coat.dun ? 1 : 0 }, uSeed: { value: (h.seed % 1000) * 0.137 }, uPink: { value: coat.pink ? 1 : 0 },
  };
  const m = new THREE.MeshStandardMaterial({ map: REAL.tex.M_Body, roughness: lerp(0.66, 0.36, cf.sheen || 0), metalness: (cf.sheen || 0) * 0.2 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRest; varying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + COAT_FRAG).replace('#include <map_fragment>', '#include <map_fragment>\n' + COAT_MAIN);
  };
  m.customProgramCacheKey = () => 'coat-v1';
  return m;
}

export function buildReal(h, opt = {}) {
  const coat = coatOf(h.genes, h.age), cf = h.conf, g = growth(h.age);
  const sy = (cf.height / 100) * lerp(0.6, 1, g) / REF_WITHERS;
  const sx = sy * clamp(0.92 + (cf.bulk - 1) * 0.75, 0.85, 1.3) * lerp(0.8, 1, g), sz = sy * lerp(0.82, 1, g) * (1 + (cf.bulk - 1) * 0.1);
  const obj = cloneSkinned(REAL.scene);
  const root = new THREE.Group(), tilt = new THREE.Group(), wrap = new THREE.Group();
  root.add(tilt); tilt.add(wrap); wrap.add(obj); obj.position.z = -Z0; wrap.scale.set(sx, sy, sz);
  tilt.position.y = PIVOT * sy; wrap.position.y = -PIVOT * sy;
  const mats = [], tack = opt.tack && g > 0.7 ? opt.tack : null;
  const body = coatMaterial(h, coat, cf); mats.push(body);
  const hairCol = new THREE.Color(coat.tobiano && h.seed % 2 ? mix(coat.mane, '#f0ede6', 0.6) : coat.mane).multiplyScalar(1.5).addScalar(0.02);
  const hair = new THREE.MeshStandardMaterial({ map: REAL.tex.M_Hair, color: hairCol, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }); mats.push(hair);
  const eye = new THREE.MeshStandardMaterial({ map: REAL.tex.M_Eye, roughness: 0.15 }); mats.push(eye);
  const west = tack === 'western';
  const s1 = new THREE.MeshStandardMaterial({ map: REAL.tex.M_Saddle1, roughness: 0.6, color: west ? '#ffe2c4' : '#6b6468' }), s2 = new THREE.MeshStandardMaterial({ map: REAL.tex.M_Saddle2, roughness: 0.6, color: west ? '#ffe2c4' : '#5d5559' }); mats.push(s1, s2);
  const bones = {};
  obj.traverse((o) => {
    if (o.isBone) { const k = key(o.name); if (REAL.base[k] && !bones[k]) bones[k] = o; }
    if (o.isSkinnedMesh) {
      const n = o.material.name; o.frustumCulled = false; o.castShadow = n !== 'M_Eye'; o.receiveShadow = false;
      if (n === 'M_Body') o.material = body; else if (n === 'M_Hair') o.material = hair; else if (n === 'M_Eye') o.material = eye;
      else { o.material = n === 'M_Saddle1' ? s1 : s2; o.visible = !!tack; }
    }
  });
  const mixer = new THREE.AnimationMixer(obj), idle = mixer.clipAction(REAL.clips.idle), walk = mixer.clipAction(REAL.clips.walk);
  idle.play(); walk.play(); walk.setEffectiveWeight(0); idle.time = Math.random() * 10;
  const seat = {
    getWorldPosition(v) { bones.saddle.getWorldPosition(v); v.y -= 0.03 * sy; return v; },
    getWorldQuaternion(q) { return tilt.getWorldQuaternion(q); },
  };
  const legs = [0, 1, 2, 3].map((i) => (i < 2 ? { fore: true, rest: [0, 0, 0], cur: [0, 0, 0] } : { fore: false, rest: [-0.35, 0.75, -0.62, 0.22], cur: [-0.35, 0.75, -0.62, 0.22] }));
  return { real: true, h, root, tilt, bones, mixer, idle, walk, seat, legs, S: sy, sz, pivotY: PIVOT, coat, tack: null, mane: [], withers: REF_WITHERS * sy, len: 2.5 * sz, wP: 0, wW: 0, skip: 0, accDt: 0,
    anim: { phase: Math.random(), t: Math.random() * 50, neckA: 0.85, headA: 1.75, bob: 0, pitch: 0, roll: 0, tail: 0.25, steps: [1, 1, 1, 1], lastGait: 0 },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(obj); for (const m of mats) m.dispose(); } };
}

const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
// Haltung aus computePose (model.legs[].cur, model.anim) auf das Skelett übertragen
export function applyReal(model, st, dt) {
  const a = model.anim, B = model.bones, base = REAL.base, sp = Math.abs(st.speed);
  const walking = (st.gait === 1 || st.speed < -0.1) && !(st.air && st.air.on) && !st.slide;
  const proc = !walking && (st.gait >= 2 || (st.air && st.air.on) || st.slide || st.spin);
  model.wP = damp(model.wP, proc ? 1 : 0, 9, dt); model.wW = damp(model.wW, walking ? 1 : 0, 7, dt);
  model.tilt.position.y = model.pivotY * model.S + a.bob * model.S * model.wP; model.tilt.rotation.x = a.pitch; model.tilt.rotation.z = a.roll;
  // weit entfernte Pferde nur jedes dritte Bild animieren
  model.accDt += dt; if (st.far && (model.skip = (model.skip + 1) % 3)) return;
  const d = model.accDt; model.accDt = 0;
  model.walk.setEffectiveWeight(model.wW); model.idle.setEffectiveWeight(1 - model.wW);
  model.walk.timeScale = walking ? Math.sign(st.speed || 1) * clamp(sp / (WALK_STRIDE * model.sz), 0.25, 1.6) * model.walk.getClip().duration : 1;
  model.mixer.update(d);
  const turn = (name, ang, w) => { const b = B[name], bs = base[name]; if (!b) return; Q.setFromAxisAngle(bs.axis, ang).multiply(bs.q); b.quaternion.slerp(Q, w); };
  const add = (name, ang) => { const b = B[name]; if (!b || Math.abs(ang) < 1e-4) return; Q2.setFromAxisAngle(base[name].axis, ang); b.quaternion.premultiply(Q2); };
  const w = model.wP;
  if (w > 0.002) {
    for (let i = 0; i < 4; i++) {
      const l = model.legs[i], n = LEG_BONES[i], c = l.cur;
      if (l.fore) { turn(n[0], c[0] * 0.22, w); turn(n[1], c[0] * 0.8, w); turn(n[2], -c[1] * 0.3, w); turn(n[3], c[1], w); turn(n[4], c[2], w); }
      else { turn(n[0], (c[0] - l.rest[0]) * 0.95, w); turn(n[1], c[1] - l.rest[1], w); turn(n[2], c[2] - l.rest[2], w); turn(n[3], c[3] - l.rest[3], w); }
    }
  }
  let nd = -(a.neckA - 0.85); if (nd > 0) nd *= 1.2;
  const NW = [0.58, 0.24, 0.11, 0.07]; for (let i = 0; i < 4; i++) add(NECK[i], nd * NW[i]);
  add('head', (a.headA - 1.75) * 0.75);
  add('tail_01', (a.tail - 0.22) * 0.4); add('tail_02', (a.tail - 0.22) * 0.15);
}
