// Offene Welt: Gelände, Himmel, Straßen, Ranch, Stadt, Turnierplatz, Vegetation, Kollisionen
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, sstep, fbm, noise2, rng, segDist, TAU, mix } from './util.js';

export const SIZE = 1800, N = 301, CS = SIZE / (N - 1), HALF = SIZE / 2;
export const LOC = {
  ranch: { x: 0, z: 0, name: 'Silbertal Ranch' }, town: { x: 400, z: -40, name: 'Silbertal' },
  arena: { x: 0, z: -450, name: 'Turnierplatz' }, lake: { x: -320, z: 140, name: 'Silbersee' },
};
export const ARENA = { x: 0, z: -450, hw: 48, hd: 32 };
export const TRACK = { cx: 0, cz: -450, sl: 90, r: 80, w: 14 };
TRACK.len = 4 * TRACK.sl + TAU * TRACK.r;
export const PADDOCK = { x0: -55, x1: 25, z0: 38, z1: 95 };
export const MARKET = { x0: 480, x1: 516, z0: -57, z1: -23 };
export const POIS = [
  { id: 'stall', x: -15, z: 8, label: 'Stall', color: '#e0a030', icon: 'S' },
  { id: 'market', x: 473, z: -40, label: 'Pferdemarkt', color: '#40b060', icon: '$' },
  { id: 'office', x: 9, z: -353, label: 'Meldestelle', color: '#3f8fe0', icon: 'T' },
];
const ZONES = [
  { x: 0, z: 10, r: 120, b: 60, h: 3 }, { x: 410, z: -40, r: 130, b: 60, h: 5 },
  { x: 0, z: -450, r: 200, b: 60, h: 6 }, { x: -320, z: 140, r: 70, b: 60, h: -4.5 },
];
const ROADS = [
  [[0, -28], [0, -90], [-8, -160], [-14, -240], [0, -320], [0, -356]],
  [[0, -90], [60, -104], [140, -98], [240, -62], [320, -40], [400, -40], [470, -40]],
  [[320, -40], [318, -110], [280, -210], [190, -290], [80, -336], [0, -340]],
];
// Geländestrecke: [x, z, Hindernistyp] 0 Baumstamm, 1 Hecke, 2 Mauer, 3 Wasser (ohne Sprung)
export const XC = [[-90, -322, 0], [-150, -290, 1], [-215, -250, 0], [-270, -190, 2], [-300, -120, 1], [-290, -50, 0], [-255, 10, 2], [-246, 84, 3], [-170, 40, 0], [-130, -30, 1], [-150, -110, 2], [-110, -190, 0], [-70, -260, 1], [-30, -318, 3]];
export const XC_START = { x: -36, z: -326, heading: -Math.PI / 2 - 0.1 };

function catmullPts(pts, step = 4) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
function canvasTex(w, h, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
function noiseFill(x, w, h, base, amt, n, r = Math.random) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = r(); x.fillStyle = v < 0.5 ? `rgba(0,0,0,${amt * r()})` : `rgba(255,255,255,${amt * r()})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}

export class World {
  constructor(scene, renderer, quality = 1) {
    this.scene = scene; this.renderer = renderer; this.quality = quality;
    this.grid = new Map(); this.dyn = []; this.mapRects = []; this.spin = [];
    this.fenceM = { white: [], wood: [] };
    this.r = rng(4711);
    this.buildHeights();
    this.buildTerrain();
    this.buildSky();
    this.buildRoads();
    this.buildWater();
    this.mats();
    this.buildRanch();
    this.buildTown();
    this.buildArena();
    this.buildXC();
    this.buildVegetation();
    this.flushFences();
    this.buildMarkers();
  }

  // ---------- Höhenfeld ----------
  buildHeights() {
    const raw = (x, z) => {
      const d = Math.hypot(x, z);
      return (fbm(x * 0.0034 + 3.1, z * 0.0034 + 7.7, 5) - 0.47) * 78 + (fbm(x * 0.021, z * 0.021, 3) - 0.5) * 5 + sstep(640, 900, d) * 110 + 6;
    };
    const base = (x, z) => {
      let h = raw(x, z);
      for (const zn of ZONES) { const w = sstep(zn.r + zn.b, zn.r, Math.hypot(x - zn.x, z - zn.z)); if (w > 0) h = lerp(h, zn.h, w); }
      return h;
    };
    this.roads = ROADS.map((r) => {
      const pts = catmullPts(r, 4);
      let hs = pts.map((p) => base(p[0], p[1]));
      for (let pass = 0; pass < 6; pass++) hs = hs.map((_, i) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const j = clamp(i + k, 0, hs.length - 1); s += hs[j]; n++; } return s / n; });
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      return { pts, hs, bb: [x0 - 20, x1 + 20, z0 - 20, z1 + 20] };
    });
    const H = this.H = new Float32Array(N * N), RD = this.RD = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + i * CS, z = -HALF + j * CS;
      let h = base(x, z), best = 99, bh = 0;
      for (const rd of this.roads) {
        if (x < rd.bb[0] || x > rd.bb[1] || z < rd.bb[2] || z > rd.bb[3]) continue;
        for (let k = 0; k < rd.pts.length; k++) { const d = Math.hypot(x - rd.pts[k][0], z - rd.pts[k][1]); if (d < best) { best = d; bh = rd.hs[k]; } }
      }
      if (best < 18) h = lerp(h, bh, sstep(18, 7.5, best));
      H[j * N + i] = h; RD[j * N + i] = best;
    }
  }
  heightAt(x, z) {
    const gx = clamp((x + HALF) / CS, 0, N - 1.001), gz = clamp((z + HALF) / CS, 0, N - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, H = this.H, o = j * N + i;
    const h00 = H[o], h10 = H[o + 1], h01 = H[o + N], h11 = H[o + N + 1];
    return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }
  slopeAt(x, z, dx, dz) { return (this.heightAt(x + dx * 1.2, z + dz * 1.2) - this.heightAt(x - dx * 1.2, z - dz * 1.2)) / 2.4; }
  roadDist(x, z) { let b = 99; for (const rd of this.roads) { if (x < rd.bb[0] || x > rd.bb[1] || z < rd.bb[2] || z > rd.bb[3]) continue; for (const p of rd.pts) { const d = Math.hypot(x - p[0], z - p[1]); if (d < b) b = d; } } return b; }
  waterDepth(x, z) { if (Math.hypot(x - LOC.lake.x, z - LOC.lake.z) > 150) return 0; const h = this.heightAt(x, z); return h < this.waterY ? this.waterY - h : 0; }

  buildTerrain() {
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2), idx = [];
    const H = this.H, c = new THREE.Color(), c2 = new THREE.Color();
    const G1 = new THREE.Color('#4f7332'), G2 = new THREE.Color('#7b8c42'), G3 = new THREE.Color('#a39a58'), ROCK = new THREE.Color('#7b756a'), SAND = new THREE.Color('#b9a87a'), DIRT = new THREE.Color('#8b7751'), SNOW = new THREE.Color('#d9dbe0');
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i, x = -HALF + i * CS, z = -HALF + j * CS, h = H[o];
      pos[o * 3] = x; pos[o * 3 + 1] = h; pos[o * 3 + 2] = z; uv[o * 2] = x / 9; uv[o * 2 + 1] = z / 9;
      const hx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)], hz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
      const slope = Math.hypot(hx, hz) / (2 * CS);
      const n1 = fbm(x * 0.012 + 9, z * 0.012, 3), n2 = noise2(x * 0.09, z * 0.09);
      c.copy(G1).lerp(G2, sstep(0.35, 0.65, n1)).lerp(G3, sstep(0.55, 0.8, n1) * 0.7);
      c.multiplyScalar(0.9 + n2 * 0.2);
      c.lerp(ROCK, sstep(0.38, 0.62, slope));
      c.lerp(ROCK, sstep(45, 70, h) * 0.8); c.lerp(SNOW, sstep(85, 110, h));
      if (h < 0.4) c.lerp(SAND, sstep(0.4, -0.8, h));
      const rd = this.RD[o]; if (rd < 12) c.lerp(DIRT, sstep(12, 6, rd) * 0.75);
      const ry = Math.hypot(x + 8, z - 2); if (ry < 46) c.lerp(c2.copy(DIRT).multiplyScalar(1.05), sstep(46, 30, ry) * 0.8);
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i; idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const r = rng(5);
    const t = canvasTex(256, 256, (x, w, h) => {
      noiseFill(x, w, h, '#d6d6d6', 0.14, 9000, r);
      for (let i = 0; i < 1800; i++) { x.strokeStyle = `rgba(${r() < 0.5 ? '40,60,20' : '230,240,200'},${0.06 + r() * 0.1})`; const px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 2 - r() * 5); x.stroke(); }
    });
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; this.scene.add(mesh); this.terrain = mesh;
  }

  // ---------- Himmel & Licht ----------
  buildSky() {
    const sc = this.scene;
    this.sky = new Sky(); this.sky.scale.setScalar(8000); sc.add(this.sky);
    const u = this.sky.material.uniforms; u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    this.sun = new THREE.DirectionalLight('#fff4e0', 3); this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(this.quality > 0 ? 2048 : 1024, this.quality > 0 ? 2048 : 1024);
    s.camera.left = -70; s.camera.right = 70; s.camera.top = 70; s.camera.bottom = -70; s.camera.near = 10; s.camera.far = 420; s.bias = -0.0004; s.normalBias = 0.05;
    sc.add(this.sun); sc.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#6b5d45', 1); sc.add(this.hemi);
    sc.fog = new THREE.FogExp2('#b8c9d6', 0.0011);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    // Sterne
    const sp = new Float32Array(900 * 3), r = rng(8);
    for (let i = 0; i < 900; i++) { const a = r() * TAU, e = Math.asin(r()), R = 5000; sp[i * 3] = Math.cos(a) * Math.cos(e) * R; sp[i * 3 + 1] = Math.sin(e) * R + 100; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * R; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); sc.add(this.stars);
    // Wolken
    const ct = canvasTex(256, 128, (x, w, h) => { const rr = rng(3); for (let i = 0; i < 26; i++) { const cx = 40 + rr() * (w - 80), cy = 50 + rr() * 40, rad = 18 + rr() * 26; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); } });
    ct.wrapS = ct.wrapT = THREE.ClampToEdgeWrapping;
    this.cloudMat = new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
    this.clouds = [];
    for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(this.cloudMat); const w = 500 + r() * 700; s.scale.set(w, w * 0.4, 1); s.position.set((r() - 0.5) * 6000, 480 + r() * 500, (r() - 0.5) * 6000); sc.add(s); this.clouds.push(s); }
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envT = -99;
  }
  // t: Uhrzeit in Stunden
  updateSky(t, focus, dt) {
    const dayA = ((t - 6) / 12) * Math.PI, el = Math.sin(dayA) * 1.05, az = dayA * 0.9 + 0.5;
    const elev = clamp(el, -0.4, 1);
    const sd = this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) * 0.8 + 0.25).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(sd);
    const day = sstep(-0.08, 0.25, el), low = 1 - sstep(0.05, 0.45, el);
    this.day = day;
    this.sky.material.uniforms.rayleigh.value = lerp(1.2, 3, low * day);
    const night = 1 - day;
    const ld = night > 0.9 ? new THREE.Vector3(-0.4, 0.75, 0.3) : sd;
    this.sun.position.copy(focus).addScaledVector(ld.y < 0.12 ? ld.clone().setY(0.12).normalize() : ld, 200); this.sun.target.position.copy(focus);
    this.sun.color.set(mix('#ff9a55', '#fff4e0', sstep(0, 0.4, el))); if (night > 0.9) this.sun.color.set('#8fa8d8');
    this.sun.intensity = night > 0.9 ? 1.1 : 3.2 * sstep(-0.02, 0.3, el);
    this.hemi.intensity = lerp(0.75, 1.0, day);
    this.hemi.color.set(mix('#5d77b8', '#bcd4ff', day)); this.hemi.groundColor.set(mix('#2a2f3d', '#6b5d45', day));
    const fc = mix(mix('#18223a', '#d59a70', sstep(0, 0.5, day)), '#b9cad8', sstep(0.4, 1, day) * (1 - low * 0.5));
    this.scene.fog.color.set(fc);
    this.stars.material.opacity = night * 0.9;
    this.cloudMat.color.set(mix(mix('#1a2030', '#e8a680', sstep(0, 0.6, day)), '#ffffff', sstep(0.5, 1, day) * (1 - low * 0.6)));
    for (const c of this.clouds) { c.position.x += dt * 4; if (c.position.x > 3000) c.position.x = -3000; }
    this.renderer.toneMappingExposure = lerp(0.7, 0.62, day);
    if (this.winMat) { this.winMat.emissiveIntensity = night * 1.6; this.lampMat.emissiveIntensity = night * 3; }
    if (Math.abs(t - this.envT) > 1) {
      this.envT = t;
      if (!this.envScene) { this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky); }
      const u = this.envSky.material.uniforms, v = this.sky.material.uniforms; for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = v[k].value; u.sunPosition.value.copy(sd);
      const old = this.envRT; this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000); this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = lerp(0.6, 0.55, day); if (old) old.dispose();
    }
    for (const s of this.spin) s.rotation.z += dt * 1.4;
  }

  // ---------- Straßen ----------
  buildRoads() {
    const r = rng(2);
    const t = canvasTex(64, 256, (x, w, h) => {
      noiseFill(x, w, h, '#3b3b3d', 0.25, 5000, r);
      x.fillStyle = '#d8b53a'; x.fillRect(w / 2 - 1.5, 0, 3, h * 0.55);
      x.fillStyle = 'rgba(235,235,230,0.85)'; x.fillRect(3, 0, 2, h); x.fillRect(w - 5, 0, 2, h);
    });
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const rd of this.roads) this.ribbon(rd.pts, 7.4, m, 0.07, 12);
  }
  ribbon(pts, width, mat, lift = 0.07, vRep = 12, closed = false) {
    const pos = [], uv = [], idx = [], cols = 4;
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let c = 0; c <= cols; c++) { const o = (c / cols - 0.5) * width, x = pts[i][0] - dz * o, z = pts[i][1] + dx * o; pos.push(x, this.heightAt(x, z) + lift, z); uv.push(c / cols, len / vRep); }
      if (i) for (let c = 0; c < cols; c++) { const p = (i - 1) * (cols + 1) + c, q = p + cols + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const me = new THREE.Mesh(g, mat); me.receiveShadow = true; this.scene.add(me); return me;
  }
  buildWater() {
    this.waterY = -1.3;
    const g = new THREE.CircleGeometry(150, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: '#27505c', roughness: 0.06, metalness: 0.7, transparent: true, opacity: 0.88 });
    const w = new THREE.Mesh(g, m); w.position.set(LOC.lake.x, this.waterY, LOC.lake.z); this.scene.add(w);
  }

  // ---------- Materialien & Bau-Helfer ----------
  mats() {
    const r = rng(77);
    const planks = (base, horiz) => canvasTex(128, 128, (x, w, h) => { noiseFill(x, w, h, base, 0.12, 2500, r); x.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 8; i++) horiz ? x.fillRect(0, i * 16, w, 1.5) : x.fillRect(i * 16, 0, 1.5, h); }, [4, 2]);
    const brick = (base) => canvasTex(128, 128, (x, w, h) => { noiseFill(x, w, h, base, 0.18, 3000, r); x.fillStyle = 'rgba(220,210,200,0.5)'; for (let j = 0; j < 8; j++) { x.fillRect(0, j * 16, w, 1.5); for (let i = 0; i < 4; i++) x.fillRect(i * 32 + (j % 2) * 16, j * 16, 1.5, 16); } }, [3, 2]);
    const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
    this.M = {
      barn: M({ map: planks('#8f2d22') }), white: M({ map: planks('#e6e2d8', true) }), wood: M({ map: planks('#8a6a45') }), woodD: M({ map: planks('#5b4028') }),
      brick: M({ map: brick('#8c4a3a') }), brick2: M({ map: brick('#a08a70') }), blue: M({ map: planks('#5d7f96', true) }), cream: M({ map: planks('#d9c79a', true) }), green: M({ map: planks('#5c7a5a', true) }),
      roof: M({ color: '#4a4f57', roughness: 0.6, metalness: 0.3 }), roofR: M({ color: '#7a3028', roughness: 0.7 }), dark: M({ color: '#231c17' }), trim: M({ color: '#f0ede6' }),
      sand: M({ map: canvasTex(128, 128, (x, w, h) => noiseFill(x, w, h, '#cdb58a', 0.16, 5000, r), [14, 10]), roughness: 1 }),
      trackM: M({ map: canvasTex(128, 128, (x, w, h) => noiseFill(x, w, h, '#a98f66', 0.18, 5000, r), [1, 1]), roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      concrete: M({ color: '#9a9a96' }), metal: M({ color: '#a8adb3', roughness: 0.35, metalness: 0.8 }), hay: M({ color: '#cfae58', roughness: 1 }), stone: M({ color: '#8a857c', roughness: 0.95 }), hedge: M({ color: '#2f5a2a', roughness: 1 }), log: M({ color: '#6a4a30', roughness: 0.95 }),
    };
    this.winMat = M({ color: '#1b2633', roughness: 0.1, metalness: 0.5, emissive: '#ffc878', emissiveIntensity: 0 });
    this.lampMat = M({ color: '#fff3d0', emissive: '#ffd9a0', emissiveIntensity: 0 });
    this.boxG = new THREE.BoxGeometry(1, 1, 1);
  }
  box(parent, w, h, d, mat, x, y, z, ry = 0, shadow = true) {
    const m = new THREE.Mesh(this.boxG, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  }
  signTex(text, bg = '#2a1c12', fg = '#f3e6c4') {
    return canvasTex(512, 96, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12); x.fillStyle = fg; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3, w - 30); });
  }
  sign(parent, text, w, x, y, z, ry = 0, bg, fg) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), new THREE.MeshStandardMaterial({ map: this.signTex(text, bg, fg), roughness: 0.8, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  }
  // Gebäude: lokale +Z-Seite ist die Front
  building(o) {
    const { x, z, w, d, h } = o, ry = o.ry || 0, y = this.heightAt(x, z);
    const g = new THREE.Group(); g.position.set(x, y - 0.3, z); g.rotation.y = ry; this.scene.add(g);
    this.box(g, w, h + 0.3, d, o.wall, 0, (h + 0.3) / 2, 0);
    if (o.roof === 'gable') {
      const rh = o.rh || w * 0.3, ov = 0.6;
      const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, rh); sh.closePath();
      const pg = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); const pm = new THREE.Mesh(pg, o.wall); pm.position.set(0, h + 0.3, -d / 2); pm.castShadow = true; g.add(pm);
      const ang = Math.atan2(rh, w / 2), sl = Math.hypot(w / 2, rh) + ov;
      for (const s of [-1, 1]) { const rb = this.box(g, sl, 0.18, d + 1.2, o.roofM || this.M.roof, s * (w / 4 + ov * 0.5 * Math.cos(ang)), h + 0.3 + rh / 2 - ov * 0.5 * Math.sin(ang) + 0.1, 0); rb.rotation.z = -s * ang; }
    } else {
      this.box(g, w + 0.5, 0.5, d + 0.5, o.roofM || this.M.dark, 0, h + 0.5, 0);
      if (o.front) this.box(g, w, o.front, 0.4, o.wall, 0, h + 0.7 + o.front / 2, d / 2 - 0.2);
    }
    const wg = new THREE.PlaneGeometry(1.3, 1.5);
    const win = (px, py, pz, r2) => { const m = new THREE.Mesh(wg, this.winMat); m.position.set(px, py, pz); m.rotation.y = r2; g.add(m); this.box(g, 1.5, 0.12, 0.12, this.M.trim, px + Math.sin(r2) * 0.03, py - 0.82, pz + Math.cos(r2) * 0.03, r2, false); };
    const nW = Math.max(1, Math.floor(w / 4));
    for (let fl = 0; fl < Math.max(1, Math.floor(h / 3.2)); fl++) for (let i = 0; i < nW; i++) {
      const px = (i + 0.5) / nW * w - w / 2, py = 1.9 + fl * 3.1;
      if (!(fl === 0 && o.door !== false && Math.abs(px - (o.doorX || 0)) < 1.6)) win(px, py, d / 2 + 0.03, 0);
      if (o.backWin !== false) win(px, py, -d / 2 - 0.03, Math.PI);
    }
    if (o.door !== false) { const dw = o.doorW || 1.4, dh = o.doorH || 2.3; this.box(g, dw, dh, 0.1, o.doorM || this.M.dark, o.doorX || 0, dh / 2 + 0.3, d / 2 + 0.03, 0, false); }
    if (o.sign) this.sign(g, o.sign, Math.min(w - 1, 9), 0, o.signY || h - 0.2 + (o.front ? o.front * 0.5 + 0.9 : 0), d / 2 + (o.front ? 0.03 : 0.12), 0, o.signBg, o.signFg);
    if (o.porch) { this.box(g, w, 0.2, 2.6, this.M.wood, 0, 0.4, d / 2 + 1.3); this.box(g, w + 0.4, 0.14, 3, o.roofM || this.M.roof, 0, 3.1, d / 2 + 1.4).rotation.x = 0.12; for (let i = 0; i <= 3; i++) this.box(g, 0.16, 2.7, 0.16, this.M.trim, -w / 2 + 0.2 + i * (w - 0.4) / 3, 1.7, d / 2 + 2.5); }
    this.addBoxCollider(x, z, w, d + (o.porch ? 0 : 0), ry);
    this.mapRects.push({ x, z, w, d, ry, c: o.mapC || '#8d8a84' });
    return g;
  }

  // ---------- Kollisionen ----------
  key(cx, cz) { return cx * 4096 + cz; }
  addCol(c) {
    let x0, x1, z0, z1;
    if (c.t === 0) { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; } else { x0 = Math.min(c.x1, c.x2); x1 = Math.max(c.x1, c.x2); z0 = Math.min(c.z1, c.z2); z1 = Math.max(c.z1, c.z2); }
    for (let cx = Math.floor((x0 - 1.5) / 20); cx <= Math.floor((x1 + 1.5) / 20); cx++) for (let cz = Math.floor((z0 - 1.5) / 20); cz <= Math.floor((z1 + 1.5) / 20); cz++) { const k = this.key(cx, cz); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(c); }
  }
  addCircle(x, z, r, h = 99) { this.addCol({ t: 0, x, z, r, h }); }
  addSeg(x1, z1, x2, z2, h = 99) { this.addCol({ t: 1, x1, z1, x2, z2, h }); }
  addBoxCollider(x, z, w, d, ry = 0, h = 99) {
    const c = Math.cos(ry), s = Math.sin(ry), P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 15); for (let k = 0; k < n; k++) this.addSeg(lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), lerp(a[0], b[0], (k + 1) / n), lerp(a[1], b[1], (k + 1) / n), h); }
  }
  // schiebt p {x,z} aus Hindernissen; hAbove = Höhe über Grund. Liefert {hit, knock[]}
  collide(p, R, hAbove = 0, res = null) {
    let hit = false;
    const test = (c) => {
      if (c.off) return;
      if (c.t === 0) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = R + c.r;
        if (d < m && hAbove < c.h) { if (c.knock) { if (res) res.knock.push(c); return; } const k = (m - d) / (d || 1); p.x += dx * k; p.z += dz * k; hit = true; if (res) { res.nx = dx / (d || 1); res.nz = dz / (d || 1); res.col = c; } }
      } else {
        const sd = segDist(p.x, p.z, c.x1, c.z1, c.x2, c.z2), m = R + 0.12;
        if (sd[0] < m && hAbove < c.h) { if (c.knock) { if (res) res.knock.push(c); return; } const dx = p.x - sd[2], dz = p.z - sd[3], d = sd[0] || 1e-4; p.x += (dx / d) * (m - sd[0]); p.z += (dz / d) * (m - sd[0]); hit = true; if (res) { res.nx = dx / d; res.nz = dz / d; res.col = c; } }
      }
    };
    const cx = Math.floor(p.x / 20), cz = Math.floor(p.z / 20);
    const a = this.grid.get(this.key(cx, cz)); if (a) for (let i = 0; i < a.length; i++) test(a[i]);
    for (let i = 0; i < this.dyn.length; i++) test(this.dyn[i]);
    return hit;
  }

  // ---------- Zäune ----------
  fence(pts, o = {}) {
    const h = o.h || 1.3, kind = o.color || 'white', rails = o.rails || 3, sp = o.post || 3, arr = this.fenceM[kind], d = new THREE.Object3D();
    const n = pts.length - (o.closed ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / sp));
      for (let s = 0; s < k; s++) {
        const x1 = lerp(a[0], b[0], s / k), z1 = lerp(a[1], b[1], s / k), x2 = lerp(a[0], b[0], (s + 1) / k), z2 = lerp(a[1], b[1], (s + 1) / k);
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        if (o.gaps && o.gaps.some((g) => Math.hypot(mx - g[0], mz - g[1]) < g[2])) continue;
        const y1 = this.heightAt(x1, z1), y2 = this.heightAt(x2, z2);
        for (const [px, py, pz] of [[x1, y1, z1], [x2, y2, z2]]) { d.position.set(px, py + h / 2, pz); d.rotation.set(0, 0, 0); d.scale.set(0.12, h + 0.1, 0.12); d.updateMatrix(); arr.push(d.matrix.clone()); }
        for (let rI = 0; rI < rails; rI++) { const ry = h * (1 - rI / rails) - 0.08; d.position.set(mx, (y1 + y2) / 2 + ry, mz); d.lookAt(x2, y2 + ry, z2); d.scale.set(0.05, 0.11, Math.hypot(x2 - x1, z2 - z1, y2 - y1)); d.updateMatrix(); arr.push(d.matrix.clone()); }
        if (o.solid !== false) this.addSeg(x1, z1, x2, z2, h);
      }
    }
  }
  flushFences() {
    for (const [k, col] of [['white', '#eeebe4'], ['wood', '#77593a']]) {
      const a = this.fenceM[k]; if (!a.length) continue;
      const im = new THREE.InstancedMesh(this.boxG, new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }), a.length);
      a.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; this.scene.add(im);
    }
  }
  truck(x, z, ry, color) {
    const g = new THREE.Group(); g.position.set(x, this.heightAt(x, z), z); g.rotation.y = ry; this.scene.add(g);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 }), tire = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
    this.box(g, 1.95, 0.6, 5.3, m, 0, 0.85, 0); this.box(g, 1.85, 0.75, 1.9, m, 0, 1.5, 0.5); this.box(g, 1.7, 0.5, 1.7, this.winMat, 0, 1.55, 0.52);
    this.box(g, 1.95, 0.45, 0.1, m, 0, 1.35, -2.6); for (const s of [-1, 1]) this.box(g, 0.1, 0.45, 2.1, m, s * 0.92, 1.35, -1.55);
    const wg = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14); wg.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1.7, 1.7]) { const w = new THREE.Mesh(wg, tire); w.position.set(sx * 0.9, 0.4, sz); w.castShadow = true; g.add(w); }
    this.addBoxCollider(x, z, 2.1, 5.4, ry); this.mapRects.push({ x, z, w: 2, d: 5, ry, c: '#666' });
  }

  // ---------- Ranch ----------
  buildRanch() {
    const M = this.M, sc = this.scene;
    const barn = this.building({ x: -30, z: 8, ry: Math.PI / 2, w: 22, d: 16, h: 6.5, roof: 'gable', rh: 5, wall: M.barn, roofM: M.roof, doorW: 4.4, doorH: 4.6, doorM: M.woodD, sign: 'STALL', signY: 6.2, mapC: '#a8452f', backWin: false });
    this.box(barn, 4.8, 0.25, 0.12, M.trim, 0, 5.05, 8.06, 0, false); for (const s of [-1, 1]) this.box(barn, 0.25, 4.8, 0.12, M.trim, s * 2.3, 2.6, 8.06, 0, false);
    this.building({ x: 30, z: 20, ry: -Math.PI / 2, w: 13, d: 10, h: 3.4, roof: 'gable', rh: 3, wall: M.white, roofM: M.roofR, porch: true, mapC: '#cfc8b8' });
    this.building({ x: -34, z: -22, ry: 0, w: 18, d: 7, h: 3.2, roof: 'gable', rh: 2, wall: M.wood, roofM: M.roof, doorW: 2.4, mapC: '#8a6a45' });
    const P = PADDOCK;
    this.fence([[P.x0, P.z0], [P.x1, P.z0], [P.x1, P.z1], [P.x0, P.z1]], { closed: true, color: 'wood', h: 1.35, gaps: [[-15, P.z0, 3.2]] });
    for (let i = 0; i < 9; i++) { const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14), M.hay); const x = -44 + (i % 3) * 1.7, z = 20 + Math.floor(i / 3) * 1.45; hb.rotation.z = Math.PI / 2; hb.position.set(x, this.heightAt(x, z) + 0.75 + (i > 5 ? 1.3 : 0), i > 5 ? z - 2.2 : z); hb.castShadow = true; sc.add(hb); }
    this.addBoxCollider(-42.3, 21.4, 5.5, 4.6, 0, 1.6);
    // Tränke, Windrad, Tor, Pick-up
    const tr = this.box(sc, 2.6, 0.6, 0.9, M.metal, -20, this.heightAt(-20, 40.5) + 0.3, 40.2); this.addBoxCollider(-20, 40.2, 2.6, 0.9, 0, 0.7);
    this.box(sc, 2.4, 0.05, 0.7, new THREE.MeshStandardMaterial({ color: '#2f5560', roughness: 0.05, metalness: 0.6 }), -20, tr.position.y + 0.26, 40.2, 0, false);
    const wx = -52, wz = -8, wy = this.heightAt(wx, wz), wm = new THREE.Group(); wm.position.set(wx, wy, wz); sc.add(wm);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 11.2, 6), M.metal); leg.position.set(a * 0.9, 5.5, b * 0.9); leg.rotation.set(b * 0.12, 0, -a * 0.12); leg.castShadow = true; wm.add(leg); }
    for (let i = 1; i < 4; i++) this.box(wm, 2.4 - i * 0.42, 0.06, 2.4 - i * 0.42, M.metal, 0, i * 2.7, 0);
    const rot = new THREE.Group(); rot.position.set(0, 11.3, 0.7); wm.add(rot); this.spin.push(rot);
    for (let i = 0; i < 14; i++) { const bl = this.box(rot, 0.32, 1.5, 0.03, M.metal, 0, 0, 0); bl.position.set(Math.sin(i / 14 * TAU) * 1.05, Math.cos(i / 14 * TAU) * 1.05, 0); bl.rotation.set(0, 0.35, -i / 14 * TAU); }
    this.box(wm, 0.06, 0.9, 1.8, M.roofR, 0, 11.4, -0.9); this.addCircle(wx, wz, 1.4);
    const gy = this.heightAt(0, -34);
    for (const s of [-1, 1]) { this.box(sc, 0.45, 6, 0.45, M.woodD, s * 6, gy + 3, -34); this.addCircle(s * 6, -34, 0.4); }
    this.box(sc, 13.4, 0.45, 0.45, M.woodD, 0, gy + 5.9, -34);
    this.sign(sc, 'SILBERTAL RANCH', 8.5, 0, gy + 4.9, -34, 0);
    this.fence([[-6, -34], [-70, -34], [-70, 30]], { color: 'wood', h: 1.25 }); this.fence([[6, -34], [60, -34], [60, 50]], { color: 'wood', h: 1.25 });
    this.truck(14, -8, 0.5, '#7a1f1f');
    // Roundpen
    const rp = []; for (let i = 0; i < 20; i++) rp.push([42 + Math.cos(i / 20 * TAU) * 11, -14 + Math.sin(i / 20 * TAU) * 11]);
    this.fence(rp, { closed: true, color: 'wood', h: 1.5, rails: 4, gaps: [[42 - 11, -14, 2.2]] });
    const pen = new THREE.Mesh(new THREE.CircleGeometry(10.8, 28), M.sand); pen.rotation.x = -Math.PI / 2; pen.position.set(42, this.heightAt(42, -14) + 0.06, -14); pen.receiveShadow = true; sc.add(pen);
  }

  // ---------- Stadt ----------
  buildTown() {
    const M = this.M, sc = this.scene;
    const north = [['SALOON', M.wood, 6.5, 2], ['BANK', M.brick, 7, 1.6], ['HOTEL', M.blue, 9.5, 1.4], ['POST', M.brick2, 5.5, 1.8], ['TIERARZT', M.white, 5.5, 1.6], ['SCHMIEDE', M.woodD, 5, 2]];
    const south = [['DINER', M.cream, 5, 1.8], ['REITSPORT', M.green, 6.5, 1.8], ['FUTTERHANDEL', M.barn, 6, 2.2], ['CAFÉ', M.brick2, 5.5, 1.6], ['KINO', M.brick, 8, 2.4], ['WERKSTATT', M.white, 5, 1.8]];
    north.forEach((b, i) => this.building({ x: 346 + i * 21, z: -58, ry: 0, w: 17, d: 13, h: b[2], wall: b[1], roof: 'flat', front: b[3], sign: b[0], porch: i % 2 === 0, mapC: '#9a938a' }));
    south.forEach((b, i) => this.building({ x: 346 + i * 21, z: -22, ry: Math.PI, w: 17, d: 13, h: b[2], wall: b[1], roof: 'flat', front: b[3], sign: b[0], porch: i % 2 === 1, mapC: '#9a938a' }));
    // Gehwege & Laternen
    for (const s of [-1, 1]) { const y = this.heightAt(400, -40); this.box(sc, 128, 0.16, 5.6, M.concrete, 400, y + 0.06, -40 + s * 7.6, 0, false); }
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 5, 8), lamp = new THREE.SphereGeometry(0.28, 10, 8);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const x = 342 + i * 24 + (s > 0 ? 10 : 0), z = -40 + s * 5.4, y = this.heightAt(x, z); const p = new THREE.Mesh(pole, M.dark); p.position.set(x, y + 2.5, z); p.castShadow = true; sc.add(p); const l = new THREE.Mesh(lamp, this.lampMat); l.position.set(x, y + 5.1, z); sc.add(l); this.addCircle(x, z, 0.15); }
    // Wasserturm
    const tx = 372, tz = -92, ty = this.heightAt(tx, tz), wt = new THREE.Group(); wt.position.set(tx, ty, tz); sc.add(wt);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4.5, 18), M.white); tank.position.y = 13; tank.castShadow = true; wt.add(tank);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.8, 18), M.roofR); cone.position.y = 16.1; wt.add(cone);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.78; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 11.2, 6), M.metal); leg.position.set(Math.cos(a) * 2.9, 5.5, Math.sin(a) * 2.9); leg.rotation.set(-Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08); leg.castShadow = true; wt.add(leg); }
    this.sign(wt, 'SILBERTAL', 6, 0, 13, 3.45, 0, '#e6e2d8', '#7a3028'); this.addCircle(tx, tz, 3.2);
    this.truck(388, -45.5, Math.PI / 2, '#274a7a'); this.truck(430, -34.5, -Math.PI / 2, '#d8d4c8'); this.truck(352, -34.5, -Math.PI / 2, '#3d4a3a');
    // Pferdemarkt
    const K = MARKET;
    this.fence([[K.x0, K.z0], [K.x1, K.z0], [K.x1, K.z1], [K.x0, K.z1]], { closed: true, color: 'wood', h: 1.4, rails: 4 });
    const gy = this.heightAt(474, -40);
    for (const s of [-1, 1]) this.box(sc, 0.4, 5, 0.4, M.woodD, 477, gy + 2.5, -40 + s * 6); this.box(sc, 0.4, 0.4, 12.4, M.woodD, 477, gy + 4.9, -40);
    this.sign(sc, 'PFERDEMARKT', 9, 476.7, gy + 4, -40, -Math.PI / 2, '#2a1c12', '#f1d58a');
    const ms = new THREE.Mesh(new THREE.PlaneGeometry(K.x1 - K.x0, K.z1 - K.z0), M.sand); ms.rotation.x = -Math.PI / 2; ms.position.set((K.x0 + K.x1) / 2, gy + 0.05, (K.z0 + K.z1) / 2); ms.receiveShadow = true; sc.add(ms);
  }

  // ---------- Turnierplatz ----------
  trackPoint(s, off = 0) { // Mittellinie der Rennbahn, s in Metern (gegen den Uhrzeigersinn), off nach außen
    const T = TRACK, L = T.len; s = ((s % L) + L) % L;
    const R = T.r + off, sl2 = T.sl * 2, arc = Math.PI * T.r;
    if (s < sl2) return [T.cx - T.sl + s, T.cz + R, 1, 0];
    s -= sl2; if (s < arc) { const a = Math.PI / 2 - s / T.r; return [T.cx + T.sl + Math.cos(a) * R, T.cz + Math.sin(a) * R, Math.sin(a), -Math.cos(a)]; }
    s -= arc; if (s < sl2) return [T.cx + T.sl - s, T.cz - R, -1, 0];
    s -= sl2; const a = -Math.PI / 2 - s / T.r; return [T.cx - T.sl + Math.cos(a) * R, T.cz + Math.sin(a) * R, Math.sin(a), -Math.cos(a)];
  }
  trackProgress(x, z) { // -> [s, seitlicher Abstand zur Mittellinie]
    const T = TRACK, dx = x - T.cx, dz = z - T.cz, sl2 = T.sl * 2, arc = Math.PI * T.r;
    if (dx > T.sl) { const a = Math.atan2(dz, dx - T.sl); return [sl2 + (Math.PI / 2 - a) * T.r, Math.hypot(dx - T.sl, dz) - T.r]; }
    if (dx < -T.sl) { let a = Math.atan2(dz, dx + T.sl); if (a > 0) a -= TAU; return [sl2 + arc + sl2 + (-Math.PI / 2 - a) * T.r, Math.hypot(dx + T.sl, dz) - T.r]; }
    return dz > 0 ? [dx + T.sl, dz - T.r] : [sl2 + arc + (T.sl - dx), -dz - T.r];
  }
  buildArena() {
    const M = this.M, sc = this.scene, A = ARENA, y = this.heightAt(A.x, A.z);
    this.arenaY = y + 0.06;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2), M.sand); sand.rotation.x = -Math.PI / 2; sand.position.set(A.x, this.arenaY, A.z); sand.receiveShadow = true; sc.add(sand);
    this.fence([[A.x - A.hw, A.z - A.hd], [A.x + A.hw, A.z - A.hd], [A.x + A.hw, A.z + A.hd], [A.x - A.hw, A.z + A.hd]], { closed: true, h: 1.3, gaps: [[A.x, A.z + A.hd, 4.5]] });
    this.mapRects.push({ x: A.x, z: A.z, w: A.hw * 2, d: A.hd * 2, ry: 0, c: '#cdb58a' });
    // Tribüne
    const gs = new THREE.Group(); gs.position.set(A.x, y, A.z - A.hd - 5); sc.add(gs);
    const cols = ['#b3261e', '#27496d', '#e8e3d6', '#c98a2b', '#2f5d3a', '#d46a8a', '#3a8fa3', '#222'];
    const crowd = []; const r = rng(31);
    for (let i = 0; i < 6; i++) { this.box(gs, 70, 0.9, 1.6, M.concrete, 0, 0.45 + i * 0.9, -i * 1.6); for (let k = 0; k < 64; k++) if (r() < 0.7) crowd.push([-33 + k * 1.05 + r() * 0.3, 1.25 + i * 0.9, -i * 1.6 + 0.2, cols[Math.floor(r() * cols.length)]]); }
    this.box(gs, 72, 0.3, 12, M.roof, 0, 10.5, -4).rotation.x = 0.08; for (let i = 0; i < 6; i++) this.box(gs, 0.3, 10.4, 0.3, M.metal, -35 + i * 14, 5.2, -10);
    const im = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length), d = new THREE.Object3D(), c = new THREE.Color();
    crowd.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.set(p[3])); }); gs.add(im);
    this.addBoxCollider(A.x, A.z - A.hd - 9.5, 70, 10); this.mapRects.push({ x: A.x, z: A.z - A.hd - 9.5, w: 70, d: 10, ry: 0, c: '#8d8a84' });
    // Flaggen
    const fc = ['#b3261e', '#e8e3d6', '#27496d', '#c98a2b'];
    for (let i = 0; i < 8; i++) { const fx = A.x - A.hw + i * (A.hw * 2 / 7), fz = A.z - A.hd - 1.2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7, 6), M.metal); p.position.set(fx, y + 3.5, fz); sc.add(p); this.box(sc, 1.5, 0.9, 0.03, new THREE.MeshStandardMaterial({ color: fc[i % 4], side: THREE.DoubleSide }), fx + 0.8, y + 6.4, fz, 0, false); }
    // Meldestelle
    this.building({ x: 22, z: -353, ry: -Math.PI / 2, w: 12, d: 9, h: 3.4, roof: 'gable', rh: 2.4, wall: M.white, roofM: M.roofR, sign: 'MELDESTELLE', porch: true, mapC: '#cfc8b8' });
    this.truck(33, -353, 0.1, '#e0e0e0');
    // Rennbahn
    const T = TRACK, pts = []; for (let s = 0; s <= T.len + 1; s += 5) { const p = this.trackPoint(s); pts.push([p[0], p[1]]); }
    this.ribbon(pts, T.w, M.trackM, 0.05, 6);
    for (const off of [-T.w / 2, T.w / 2]) { const rp = []; for (let s = 0; s < T.len; s += 6) { const p = this.trackPoint(s, off); rp.push([p[0], p[1]]); } this.fence(rp, { closed: true, h: 1.1, rails: 1, post: 6, gaps: [[0, T.cz + T.r + off, 6.5]] }); }
    this.ribbon([[0, -356], [0, A.z + A.hd]], 7, M.trackM, 0.045, 6);
    const fy = this.heightAt(0, T.cz + T.r);
    for (const s of [-1, 1]) this.box(sc, 0.3, 6, 0.3, M.trim, 40, fy + 3, T.cz + T.r + s * (T.w / 2 + 0.6));
    this.sign(sc, 'ZIEL', 8, 40, fy + 5.4, T.cz + T.r, Math.PI / 2, '#f0ede6', '#b3261e').scale.set(1.9, 1.2, 1);
  }

  buildXC() {
    const M = this.M, sc = this.scene;
    this.xcGates = XC.map((g, i) => {
      const p = i ? XC[i - 1] : [XC_START.x, XC_START.z], n = XC[Math.min(XC.length - 1, i + 1)];
      let dx = n[0] - p[0], dz = n[1] - p[1]; if (i === XC.length - 1) { dx = g[0] - p[0]; dz = g[1] - p[1]; }
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const [x, z, type] = g, y = this.heightAt(x, z), hw = 3.6, px = -dz, pz = dx, ang = Math.atan2(dx, dz);
      const gr = new THREE.Group(); gr.position.set(x, y, z); gr.rotation.y = ang; sc.add(gr);
      for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), M.trim); pole.position.set(s * hw, 1.3, 0); gr.add(pole); this.box(gr, 0.7, 0.45, 0.03, new THREE.MeshStandardMaterial({ color: s < 0 ? '#c8281e' : '#f2f2f2', side: THREE.DoubleSide }), s * hw + 0.36, 2.3, 0, 0, false); this.addCircle(x + px * s * hw, z + pz * s * hw, 0.12); }
      let h = 0;
      if (type === 0) { h = 0.85; const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, hw * 2 - 0.4, 10), M.log); lg.rotation.z = Math.PI / 2; lg.position.y = 0.42; lg.castShadow = true; gr.add(lg); }
      if (type === 1) { h = 1.0; const hd = this.box(gr, hw * 2 - 0.4, 1.0, 0.9, M.hedge, 0, 0.5, 0); hd.castShadow = true; }
      if (type === 2) { h = 0.9; this.box(gr, hw * 2 - 0.4, 0.9, 0.55, M.stone, 0, 0.45, 0); }
      if (h) this.addSeg(x - px * (hw - 0.3), z - pz * (hw - 0.3), x + px * (hw - 0.3), z + pz * (hw - 0.3), h - 0.28);
      return { x, z, dx, dz, hw, h, type };
    });
  }

  // Instanzen in Kacheln gruppieren, damit Sichtbarkeits-Culling greift
  chunks(geo, mat, items, o = {}) {
    const cells = new Map(), d = new THREE.Object3D(), c = new THREE.Color(), cs = o.cell || 300;
    for (const it of items) { const k = Math.floor(it.x / cs) * 64 + Math.floor(it.z / cs); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(it); }
    for (const a of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, a.length);
      a.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); d.scale.set(it.sx, it.sy, it.sz); d.updateMatrix(); im.setMatrixAt(i, d.matrix); if (it.c) im.setColorAt(i, c.set(it.c).multiplyScalar(it.k || 1)); });
      im.castShadow = !!o.cast; im.receiveShadow = !!o.receive; im.computeBoundingSphere(); this.scene.add(im);
    }
  }

  // ---------- Vegetation ----------
  buildVegetation() {
    const r = rng(99), sc = this.scene;
    const jitter = (g, a) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (r() - 0.5) * a, p.getY(i) + (r() - 0.5) * a, p.getZ(i) + (r() - 0.5) * a); return g; };
    const blobs = (n, rad, y0, spread) => { const gs = []; for (let i = 0; i < n; i++) { const g = new THREE.IcosahedronGeometry(rad * (0.7 + r() * 0.5), 1); jitter(g, rad * 0.25); g.translate((r() - 0.5) * spread, y0 + (r() - 0.3) * spread * 0.6, (r() - 0.5) * spread); gs.push(g); } const m = mergeGeometries(gs); m.computeVertexNormals(); return m; };
    const cones = () => { const gs = []; for (let i = 0; i < 4; i++) { const g = new THREE.ConeGeometry(2.3 - i * 0.45, 3.2, 8); g.translate(0, 3 + i * 1.9, 0); gs.push(g); } return mergeGeometries(gs); };
    const trunk = (h, r1, r2) => { const g = new THREE.CylinderGeometry(r1, r2, h, 7); g.translate(0, h / 2, 0); return g; };
    const types = [
      { tg: trunk(3.6, 0.2, 0.36), cg: blobs(5, 2.0, 5.2, 3.2), cc: ['#3f6a2a', '#4d7a30', '#5a8236', '#476f2d'], tc: '#4a3828' },
      { tg: trunk(4.6, 0.13, 0.2), cg: blobs(3, 1.4, 5.6, 1.8), cc: ['#6f9440', '#86a548', '#7b9a3c'], tc: '#cfcabb' },
      { tg: trunk(3.2, 0.16, 0.3), cg: cones(), cc: ['#274a2a', '#2f5631', '#22422a'], tc: '#3d2c20' },
    ];
    const inst = types.map(() => []);
    const clear = (x, z) => {
      if (Math.hypot(x, z) > 860) return false;
      for (const zn of ZONES) if (Math.hypot(x - zn.x, z - zn.z) < zn.r + 12) return false;
      if (Math.hypot(x - LOC.lake.x, z - LOC.lake.z) < 135) return false;
      for (const g of XC) if (Math.hypot(x - g[0], z - g[1]) < 13) return false;
      for (let i = 0; i < XC.length - 1; i++) if (segDist(x, z, XC[i][0], XC[i][1], XC[i + 1][0], XC[i + 1][1])[0] < 7) return false;
      return this.roadDist(x, z) > 11;
    };
    const hi = this.quality > 0, count = hi ? 1500 : 700;
    let tries = 0, n = 0;
    while (n < count && tries++ < 60000) {
      const x = (r() - 0.5) * 1720, z = (r() - 0.5) * 1720, f = fbm(x * 0.006 + 20, z * 0.006 + 5, 3);
      if (f < 0.46 + r() * 0.12 || !clear(x, z)) continue;
      const h = this.heightAt(x, z); if (h < 0.3 || h > 80) continue;
      const ty = h > 36 || r() < 0.22 ? 2 : r() < 0.2 ? 1 : 0, s = 0.8 + r() * 0.9, t = types[ty];
      inst[ty].push({ x, y: h - 0.15, z, sx: s, sy: s * (0.9 + r() * 0.3), sz: s, ry: r() * TAU, c: t.cc[n % t.cc.length], k: 0.85 + r() * 0.3 }); this.addCircle(x, z, 0.4 * s); n++;
    }
    types.forEach((t, ti) => {
      this.chunks(t.tg, new THREE.MeshStandardMaterial({ color: t.tc, roughness: 1 }), inst[ti], { cast: hi });
      this.chunks(t.cg, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: ti === 2 }), inst[ti], { cast: true, receive: true });
    });
    const spot = (ok) => { let x, z, k = 0; do { x = (r() - 0.5) * 1700; z = (r() - 0.5) * 1700; } while (!ok(x, z) && k++ < 30); return [x, z]; };
    // Büsche & Felsen
    const bushes = [];
    for (let i = 0; i < (hi ? 800 : 300); i++) { const [x, z] = spot((a, b) => clear(a, b) && this.heightAt(a, b) > 0.2); const s = 0.6 + r() * 1.1; bushes.push({ x, y: this.heightAt(x, z) - 0.1, z, sx: s, sy: s * 0.8, sz: s, ry: r() * 6, c: ['#3d6129', '#55742f', '#6b7d3a'][i % 3] }); }
    this.chunks(blobs(3, 0.7, 0.5, 0.9), new THREE.MeshStandardMaterial({ roughness: 1 }), bushes, { cast: hi });
    const rg = jitter(new THREE.DodecahedronGeometry(1, 1), 0.25); rg.computeVertexNormals();
    const rocks = [];
    for (let i = 0; i < 220; i++) { const [x, z] = spot(clear); const s = 0.5 + r() * r() * 2.6; rocks.push({ x, y: this.heightAt(x, z) + s * 0.1, z, sx: s, sy: s * 0.65, sz: s * 0.9, rx: r(), ry: r() * 6, rz: r() }); if (s > 0.9) this.addCircle(x, z, s * 0.8, s * 0.7); }
    this.chunks(rg, new THREE.MeshStandardMaterial({ color: '#85807a', roughness: 0.95, flatShading: true }), rocks, { cast: true, receive: true });
    // Grasbüschel rund um Ranch und Turnierplatz
    if (hi) {
      const gg = new THREE.ConeGeometry(0.09, 0.55, 3); gg.translate(0, 0.27, 0);
      const tufts = [];
      for (let i = 0; i < 7000; i++) { const a = r() * TAU, cen = i % 3 === 0 ? LOC.arena : LOC.ranch, rad = 30 + Math.sqrt(r()) * 250; const x = cen.x + Math.cos(a) * rad, z = cen.z + Math.sin(a) * rad; if (this.roadDist(x, z) < 5 || (Math.abs(x - ARENA.x) < 50 && Math.abs(z - ARENA.z) < 34) || Math.hypot(x + 8, z - 2) < 44) continue; const s = 0.6 + r() * 1.3; tufts.push({ x, y: this.heightAt(x, z), z, sx: s * 1.6, sy: s, sz: s * 1.6, rx: (r() - 0.5) * 0.5, ry: r() * 6, rz: (r() - 0.5) * 0.5, c: ['#5c8038', '#7c9044', '#94984e', '#4d7030'][i % 4] }); }
      this.chunks(gg, new THREE.MeshStandardMaterial({ roughness: 1 }), tufts, { cell: 150, receive: true });
    }
  }

  buildMarkers() {
    this.markers = POIS.map((p) => {
      const g = new THREE.CylinderGeometry(1.5, 1.5, 1.6, 24, 1, true);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      m.position.set(p.x, this.heightAt(p.x, p.z) + 0.8, p.z); this.scene.add(m); return m;
    });
  }
}
