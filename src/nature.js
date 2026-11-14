// Natur: Bäume (ez-tree, MIT), Fototexturen, Grashalme mit Wind, Wasser
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import barkOak from '../assets/tex/bark_oak.webp';
import barkBirch from '../assets/tex/bark_birch.webp';
import barkPine from '../assets/tex/bark_pine.webp';
import leafOak from '../assets/tex/leaf_oak.webp';
import leafAspen from '../assets/tex/leaf_aspen.webp';
import leafPine from '../assets/tex/leaf_pine.webp';
import grassUrl from '../assets/tex/grass.webp';
import waterUrl from '../assets/tex/waternormal.webp';

const loader = new THREE.TextureLoader();
export function loadTex(url, srgb = true, rep = null) {
  const t = loader.load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (rep) t.repeat.set(rep[0], rep[1]); return t;
}
export const grassTexture = () => loadTex(grassUrl);
export const waterNormal = () => loadTex(waterUrl, false, [14, 14]);
export const wind = { value: 0 };

// Baum-Varianten: [Preset, Seed, Höhe in m, Blätter je Zweig, Blattgröße-Faktor, Rinde, Blatt, Typ (0 Laub, 1 Birke/Espe, 2 Nadel)]
const DEFS = [
  ['Oak Medium', 35729, 9.5, 7, 1.7, barkOak, leafOak, 0], ['Oak Large', 1207, 12, 6, 1.8, barkOak, leafOak, 0], ['Oak Small', 77, 6.5, 8, 1.6, barkOak, leafOak, 0],
  ['Aspen Medium', 5511, 10.5, 7, 1.6, barkBirch, leafAspen, 1], ['Pine Medium', 913, 13, 9, 1.5, barkPine, leafPine, 2], ['Pine Large', 4242, 16, 8, 1.6, barkPine, leafPine, 2],
];
export function treeVariants() {
  const out = [], cache = {};
  const T = (u, srgb) => cache[u] || (cache[u] = loadTex(u, srgb));
  for (const [preset, seed, height, leaves, lsize, bark, leaf, kind] of DEFS) {
    try {
      const t = new Tree(); t.loadPreset(preset);
      const o = t.options; o.seed = seed; o.leaves.count = leaves; o.leaves.size *= lsize;
      for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.min(5, o.branch.segments[k]));
      for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.ceil(o.branch.sections[k] * 0.6));
      t.generate();
      const bg = t.branchesMesh.geometry.clone(), lg = t.leavesMesh.geometry.clone();
      bg.computeBoundingBox(); const s = height / (bg.boundingBox.max.y - bg.boundingBox.min.y), y0 = bg.boundingBox.min.y;
      for (const g of [bg, lg]) { g.translate(0, -y0, 0); g.scale(s, s, s); }
      // weiche Kronen-Normalen statt flacher Blattkarten
      lg.computeBoundingBox(); const c = lg.boundingBox.getCenter(new THREE.Vector3()), p = lg.attributes.position, n = lg.attributes.normal, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.set(p.getX(i) - c.x, (p.getY(i) - c.y) * 0.8 + height * 0.12, p.getZ(i) - c.z).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
      const tint = new THREE.Color(o.leaves.tint).lerp(new THREE.Color('#ffffff'), 0.25);
      out.push({ kind, branch: bg, leaf: lg, bark: T(bark, true), leafTex: T(leaf, true), tint });
      t.branchesMesh.material.dispose(); t.leavesMesh.material.dispose();
    } catch (e) { console.warn('Baum', preset, e); }
  }
  return out;
}
export function leafMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uWind = wind;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;\n transformed.x += sin(uWind * 1.3 + ph + position.y * 0.5) * 0.014 * position.y;\n transformed.z += cos(uWind * 1.1 + ph * 1.7 + position.x) * 0.01 * position.y;\n#endif');
  };
  m.customProgramCacheKey = () => 'leaf-wind';
  return m;
}

// ---------- Gras: Halme folgen der Kamera, Höhe und Maske kommen aus einer Textur ----------
const GV = /* glsl */`
uniform vec3 uCam; uniform float uSize; uniform float uTime; uniform sampler2D uH; uniform vec3 uMap; // HALF, CS, N
attribute vec3 aOff; attribute vec3 aRnd;
varying float vY; varying float vR; varying float vFade;
#include <fog_pars_vertex>
void main() {
  vec2 w = mod(aOff.xz - uCam.xz, uSize) - uSize * 0.5 + uCam.xz;
  vec2 uv = ((w + uMap.x) / uMap.y + 0.5) / uMap.z;
  vec4 hm = texture2D(uH, uv);
  float dist = length(w - uCam.xz);
  float fade = smoothstep(uSize * 0.5, uSize * 0.16, dist) * smoothstep(0.35, 0.75, hm.g);
  float ht = (0.28 + 0.5 * aRnd.x) * fade;
  float a = aRnd.y * 6.2831, c = cos(a), s = sin(a);
  vec3 p = position; p.y *= ht; p.x *= 0.6 + aRnd.z * 0.8;
  float sway = (sin(uTime * 1.9 + w.x * 0.33 + w.y * 0.21) * 0.6 + sin(uTime * 3.3 + w.x * 1.1) * 0.25) * 0.16 + (aRnd.z - 0.5) * 0.25;
  p.z += sway * position.y * position.y * ht * 2.0;
  vec3 wp = vec3(w.x + p.x * c - p.z * s, hm.r + p.y, w.y + p.x * s + p.z * c);
  vY = position.y; vR = aRnd.x; vFade = fade;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GF = /* glsl */`
uniform vec3 uLight; uniform vec3 uBase; uniform vec3 uTip;
varying float vY; varying float vR; varying float vFade;
#include <fog_pars_fragment>
void main() {
  if (vFade < 0.02) discard;
  vec3 col = mix(uBase, uTip, vY * (0.6 + 0.4 * vR)) * (0.8 + 0.4 * vR);
  gl_FragColor = vec4(col * uLight * (0.55 + 0.45 * vY), 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;
export class GrassField {
  constructor(scene, heightTex, map, count, size) {
    const g = new THREE.InstancedBufferGeometry();
    const w = 0.035;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, 0.55, 0, w * 0.6, 0.55, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const off = new Float32Array(count * 3), rnd = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { off[i * 3] = Math.random() * size; off[i * 3 + 2] = Math.random() * size; rnd[i * 3] = Math.random(); rnd[i * 3 + 1] = Math.random(); rnd[i * 3 + 2] = Math.random(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 3));
    g.instanceCount = count;
    this.u = { uCam: { value: new THREE.Vector3() }, uSize: { value: size }, uTime: wind, uH: { value: heightTex }, uMap: { value: new THREE.Vector3(...map) }, uLight: { value: new THREE.Color(1, 1, 1) }, uBase: { value: new THREE.Color('#2e4a1e') }, uTip: { value: new THREE.Color('#7c9a40') } };
    const m = new THREE.ShaderMaterial({ vertexShader: GV, fragmentShader: GF, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), side: THREE.DoubleSide, fog: true });
    Object.assign(m.uniforms, this.u);
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  setCount(n) { this.mesh.geometry.instanceCount = Math.min(n, this.mesh.geometry.instanceCount); }
  update(cam, light) { this.u.uCam.value.copy(cam); this.u.uLight.value.copy(light); }
}
