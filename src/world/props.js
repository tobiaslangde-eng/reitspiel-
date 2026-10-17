import * as THREE from 'three';
import { canvasTexture, mat, shadowAll } from '../core/utils.js';
import { mulberry32 } from '../core/noise.js';

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
let TEX = null;
export function textures() {
  if (TEX) return TEX;
  const rnd = mulberry32(42);
  const planks = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#bbb'; g.fillRect(0, 0, w, h);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      const v = 150 + rnd() * 80;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, w / n, h);
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(60,60,60,${0.05 + rnd() * 0.12})`;
        g.beginPath();
        const gx = x + rnd() * (w / n);
        g.moveTo(gx, 0); g.bezierCurveTo(gx + rnd() * 6 - 3, h * 0.3, gx + rnd() * 6 - 3, h * 0.7, gx, h); g.stroke();
      }
      g.fillStyle = 'rgba(30,30,30,0.7)'; g.fillRect(x, 0, 2, h);
      if (rnd() < 0.5) { g.fillStyle = 'rgba(40,40,40,0.4)'; g.beginPath(); g.ellipse(x + 12, rnd() * h, 3, 5, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(30,30,30,0.6)'; g.fillRect(x, rnd() * h, w / n, 2);
      for (let s = 0; s < 4; s++) { g.fillStyle = 'rgba(20,20,20,0.8)'; g.fillRect(x + 4, (s * h) / 4 + 10, 2, 2); }
    }
  }, { repeat: true });
  const shingles = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#999'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 16; row++) {
      for (let i = 0; i < 10; i++) {
        const v = 110 + rnd() * 90;
        g.fillStyle = `rgb(${v},${v},${v})`;
        const x = i * 26 + (row % 2) * 13 - 13;
        g.fillRect(x, row * 16, 25, 16);
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, row * 16 + 14, 25, 2);
      }
    }
  }, { repeat: true });
  const stone = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#777'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const v = 100 + rnd() * 100;
      g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 14 + rnd() * 18, 10 + rnd() * 12, rnd() * 3, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.stroke();
    }
  }, { repeat: true });
  const hay = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#c9a74a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.strokeStyle = `rgba(${120 + rnd() * 120},${90 + rnd() * 80},${20 + rnd() * 40},0.7)`;
      const x = rnd() * w, y = rnd() * h, a = rnd() * 0.6 - 0.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.stroke();
    }
  }, { repeat: true });
  const leather = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      const v = 110 + rnd() * 50;
      g.fillStyle = `rgba(${v},${v},${v},0.25)`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  }, { repeat: true });
  TEX = { planks, shingles, stone, hay, leather };
  return TEX;
}

// Scale BoxGeometry UVs so textures keep a constant world density.
export function boxGeo(w, h, d, density = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] * density, uv.getY(i) * dims[f][1] * density);
    }
  }
  return g;
}

const _matCache = new Map();
export function woodMat(color = 0x8a5a36, kind = 'planks') {
  const key = kind + color;
  if (_matCache.has(key)) return _matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, map: textures()[kind], roughness: 0.9 });
  _matCache.set(key, m);
  return m;
}

export function signTexture(text, { w = 512, h = 128, bg = '#3b2414', fg = '#f3d9a0', font = 'Rye', border = '#1e110a' } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, (i * h) / 6, w, 2); }
    g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = fg;
    let size = h * 0.55;
    g.font = `${size}px ${font}, Georgia, serif`;
    while (g.measureText(text).width > w * 0.88 && size > 10) { size -= 2; g.font = `${size}px ${font}, Georgia, serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4;
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function sign(text, width = 4, height = 1, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: signTexture(text, opts), roughness: 0.8 }));
  const back = new THREE.Mesh(boxGeo(width + 0.15, height + 0.15, 0.08), woodMat(0x5a3a22));
  back.position.z = -0.05;
  const grp = new THREE.Group();
  grp.add(back, m);
  m.position.z = 0.0;
  return shadowAll(grp);
}

// ---------------------------------------------------------------------------
// Small props
// ---------------------------------------------------------------------------
export function barrel(color = 0x7a4a2a) {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(0.38 + Math.sin(t * Math.PI) * 0.07, t * 1.1));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), woodMat(color));
  g.add(body);
  for (const y of [0.15, 0.95]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.025, 6, 24), mat(0x333333, { metalness: 0.7, roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
  }
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), woodMat(color));
  lid.rotation.x = -Math.PI / 2; lid.position.y = 1.1; g.add(lid);
  return shadowAll(g);
}

export function hayBale() {
  const m = new THREE.Mesh(boxGeo(1.2, 0.6, 0.7, 1.4), new THREE.MeshStandardMaterial({ map: textures().hay, roughness: 1, color: 0xe0c070 }));
  m.position.y = 0.3;
  const g = new THREE.Group(); g.add(m);
  for (const x of [-0.3, 0.3]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.72), mat(0x6b4b2a));
    s.position.set(x, 0.3, 0); g.add(s);
  }
  return shadowAll(g);
}

export function roundBale() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 20), new THREE.MeshStandardMaterial({ map: textures().hay, roughness: 1, color: 0xd8b860 }));
  m.rotation.z = Math.PI / 2; m.position.y = 0.75;
  const g = new THREE.Group(); g.add(m);
  return shadowAll(g);
}

export function log(len = 4, r = 0.28) {
  const g = new THREE.Group();
  const bark = mat(0x5a4030, { roughness: 1 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, len, 10), bark);
  m.rotation.z = Math.PI / 2; m.position.y = r;
  g.add(m);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 10), mat(0xc49a6c));
    end.rotation.y = s * Math.PI / 2; end.position.set(s * len / 2 + s * 0.001, r, 0);
    g.add(end);
  }
  return shadowAll(g);
}

export function fencePost(h = 1.4) {
  const m = new THREE.Mesh(boxGeo(0.16, h, 0.16), woodMat(0x6e4a2e));
  m.position.y = h / 2;
  return m;
}

// Builds a rail fence along a polyline. Returns group; adds colliders if given.
export function fence(points, { colliders, height = 1.3, color = 0x7b5434, rails = 3, jumpable = false, gateAt = -1, white = false } = {}) {
  const g = new THREE.Group();
  const wm = woodMat(white ? 0xe8e2d6 : color);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay, az] = points[i];
    const [bx, by, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, y0 = ay + (by - ay) * t0;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1, y1 = ay + (by - ay) * t1;
      const post = new THREE.Mesh(boxGeo(0.16, height + 0.25, 0.16), wm);
      post.position.set(x0, y0 + (height + 0.25) / 2 - 0.1, z0);
      g.add(post);
      if (i === gateAt && k === Math.floor(n / 2)) continue;
      const sl = Math.hypot(x1 - x0, z1 - z0);
      for (let r = 0; r < rails; r++) {
        const ry = height * (0.35 + (0.65 * r) / Math.max(1, rails - 1));
        const rail = new THREE.Mesh(boxGeo(sl + 0.1, 0.12, 0.06), wm);
        rail.position.set((x0 + x1) / 2, (y0 + y1) / 2 + ry, (z0 + z1) / 2);
        rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        g.add(rail);
      }
      if (colliders) colliders.addSegment(x0, z0, x1, z1, 0.3, (y0 + y1) / 2 + height, jumpable ? 'jump' : 'fence');
    }
    if (i === points.length - 2) {
      const post = new THREE.Mesh(boxGeo(0.16, height + 0.25, 0.16), wm);
      post.position.set(bx, by + (height + 0.25) / 2 - 0.1, bz);
      g.add(post);
    }
  }
  return shadowAll(g);
}

export function lantern(lit = true) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), mat(0x222222, { metalness: 0.6, roughness: 0.5 }));
  pole.position.y = 1.1; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), mat(0x222222, { metalness: 0.6 }));
  arm.position.set(0.22, 2.15, 0); g.add(arm);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xffd38a, emissive: 0xffa040, emissiveIntensity: lit ? 2.5 : 0, transparent: true, opacity: 0.9 }));
  glass.position.set(0.45, 1.95, 0); g.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.15, 6), mat(0x222222, { metalness: 0.6 }));
  cap.position.set(0.45, 2.17, 0); g.add(cap);
  g.userData.glass = glass;
  g.userData.isLantern = true;
  return shadowAll(g, true, false);
}

export function rockingChair() {
  const g = new THREE.Group();
  const w = woodMat(0x6b3f22);
  const seat = new THREE.Mesh(boxGeo(0.6, 0.06, 0.55), w); seat.position.y = 0.5; g.add(seat);
  const back = new THREE.Mesh(boxGeo(0.6, 0.8, 0.05), w); back.position.set(0, 0.95, -0.3); back.rotation.x = -0.18; g.add(back);
  for (const x of [-0.28, 0.28]) {
    const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 6, 20, 0.9), w);
    rocker.rotation.y = Math.PI / 2; rocker.rotation.z = Math.PI / 2 - 0.45 + Math.PI;
    rocker.position.set(x, 0.95, 0); g.add(rocker);
    for (const z of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(boxGeo(0.05, 0.45, 0.05), w); leg.position.set(x, 0.27, z); g.add(leg);
    }
    const armrest = new THREE.Mesh(boxGeo(0.06, 0.05, 0.55), w); armrest.position.set(x, 0.75, 0); g.add(armrest);
  }
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.45), mat(0xa83232)); pillow.position.y = 0.56; g.add(pillow);
  g.userData.rock = true;
  return shadowAll(g);
}

export function flowerPot(color = 0xe04070) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.4, 12), mat(0xb5562e));
  pot.position.y = 0.2; g.add(pot);
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), mat(0x3d7a2a));
  bush.position.y = 0.55; g.add(bush);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(color, { emissive: color, emissiveIntensity: 0.1 }));
    const a = i * 2.4;
    f.position.set(Math.cos(a) * 0.22, 0.62 + Math.sin(i) * 0.1, Math.sin(a) * 0.22); g.add(f);
  }
  return shadowAll(g);
}

export function flowerBed(color = 0xf0c020) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(boxGeo(2, 0.3, 0.7), woodMat(0x7a5030)); box.position.y = 0.15; g.add(box);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.6), mat(0x3a2a1c)); soil.position.y = 0.3; g.add(soil);
  const colors = [color, 0xe04070, 0xffffff, 0x8060e0];
  for (let i = 0; i < 20; i++) {
    const c = colors[i % colors.length];
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 4), mat(0x3a7a2a));
    const x = -0.85 + (i % 10) * 0.19, z = i < 10 ? -0.13 : 0.13;
    stem.position.set(x, 0.47, z); g.add(stem);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(c)); f.position.set(x, 0.66, z); g.add(f);
  }
  return shadowAll(g);
}

export function wagonWheel(r = 0.7) {
  const g = new THREE.Group();
  const w = woodMat(0x6a4426);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 24), w); g.add(rim);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.025, 4, 24), mat(0x2b2b2b, { metalness: 0.7 })); g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10), w); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, r, 5), w);
    s.position.set(Math.cos((i / 12) * Math.PI * 2) * r / 2, Math.sin((i / 12) * Math.PI * 2) * r / 2, 0);
    s.rotation.z = (i / 12) * Math.PI * 2 - Math.PI / 2; g.add(s);
  }
  return shadowAll(g);
}

export function waterTrough() {
  const g = new THREE.Group();
  const w = woodMat(0x6b4a2c);
  const L = 2.4, W = 0.8, H = 0.6;
  const bottom = new THREE.Mesh(boxGeo(L, 0.08, W), w); bottom.position.y = 0.25; g.add(bottom);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(boxGeo(L, H, 0.08), w); side.position.set(0, 0.25 + H / 2, s * W / 2); g.add(side);
    const end = new THREE.Mesh(boxGeo(0.08, H, W), w); end.position.set(s * L / 2, 0.25 + H / 2, 0); g.add(end);
    const leg = new THREE.Mesh(boxGeo(0.12, 0.3, W), w); leg.position.set(s * (L / 2 - 0.2), 0.12, 0); g.add(leg);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.1, W - 0.1), new THREE.MeshStandardMaterial({ color: 0x2a5a6a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.75; g.add(water);
  return shadowAll(g);
}

export function campfire() {
  const g = new THREE.Group();
  const stoneM = mat(0x777777, { roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneM);
    s.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75); s.rotation.set(i, i * 2, 0); g.add(s);
  }
  const wood = mat(0x4a3020);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 6), wood);
    l.position.y = 0.25; l.rotation.z = 1.0; l.rotation.y = (i / 5) * Math.PI * 2;
    l.position.x = Math.cos((i / 5) * Math.PI * 2) * 0.15; l.position.z = Math.sin((i / 5) * Math.PI * 2) * 0.15;
    g.add(l);
  }
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshStandardMaterial({ color: 0x200a00, emissive: 0xff4000, emissiveIntensity: 1.2 }));
  coal.rotation.x = -Math.PI / 2; coal.position.y = 0.03; g.add(coal);
  // log benches
  for (const a of [0.4, 2.3, 4.2]) {
    const b = log(2.2, 0.22);
    b.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
    b.rotation.y = -a + Math.PI / 2;
    g.add(b);
  }
  g.userData.coal = coal;
  return shadowAll(g);
}

// Animated flames: a few crossed additive quads with a noise shader.
export function flames() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uIntensity; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 uv = vUv; float y = uv.y;
        float nn = n(vec2(uv.x*4.0, y*3.0 - uTime*3.5))*0.6 + n(vec2(uv.x*9.0, y*7.0 - uTime*6.0))*0.4;
        float shape = smoothstep(0.5, 0.0, abs(uv.x-0.5)*(1.3 + y*1.6)) * smoothstep(1.0, 0.1, y + nn*0.45);
        vec3 col = mix(vec3(1.0,0.25,0.02), vec3(1.0,0.85,0.4), smoothstep(0.2, 0.9, shape));
        gl_FragColor = vec4(col*2.2*uIntensity, shape*uIntensity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), mat);
    p.position.y = 0.75; p.rotation.y = (i / 3) * Math.PI;
    g.add(p);
  }
  g.userData.mat = mat;
  return g;
}

export function cactus(rnd = Math.random) {
  const g = new THREE.Group();
  const m = mat(0x4f7a3a, { roughness: 0.8 });
  const h = 2.5 + rnd() * 2.5;
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, h, 4, 10), m);
  trunk.position.y = h / 2; g.add(trunk);
  const arms = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? 1 : -1;
    const ay = h * (0.35 + rnd() * 0.35);
    const ah = 0.8 + rnd() * 1.2;
    const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), m);
    elbow.rotation.z = Math.PI / 2; elbow.position.set(side * 0.45, ay, 0); g.add(elbow);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, ah, 4, 8), m);
    up.position.set(side * 0.75, ay + ah / 2, 0); g.add(up);
  }
  g.rotation.y = rnd() * 6;
  return shadowAll(g);
}

export function windmill() {
  const g = new THREE.Group();
  const steel = mat(0x6b6b6b, { metalness: 0.6, roughness: 0.5 });
  const H = 9;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, H * 1.02, 5), steel);
    leg.position.set(Math.cos(a) * 0.75, H / 2, Math.sin(a) * 0.75);
    leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
    g.add(leg);
  }
  for (let y = 1.5; y < H; y += 2) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0 - y * 0.06, 0.03, 4, 4), steel);
    ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 4; ring.position.y = y; g.add(ring);
  }
  const head = new THREE.Group(); head.position.y = H + 0.2; g.add(head);
  const rotor = new THREE.Group(); rotor.position.z = 0.4; head.add(rotor);
  const bladeM = mat(0xb0b0b0, { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 1.6), bladeM);
    b.position.set(0, 1.1, 0); b.rotation.y = 0.5;
    const p = new THREE.Group(); p.rotation.z = (i / 16) * Math.PI * 2; p.add(b); rotor.add(p);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 1.6), mat(0x8a2a20, { side: THREE.DoubleSide }));
  tail.position.set(0, 0.2, -1.6); head.add(tail);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2), steel); boom.position.z = -0.7; head.add(boom);
  g.userData.rotor = rotor;
  return shadowAll(g);
}

export function hitchingPost(len = 3) {
  const g = new THREE.Group();
  const w = woodMat(0x6a4426);
  for (const x of [-len / 2, len / 2]) { const p = new THREE.Mesh(boxGeo(0.15, 1.1, 0.15), w); p.position.set(x, 0.55, 0); g.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len + 0.2, 8), w); bar.rotation.z = Math.PI / 2; bar.position.y = 1.0; g.add(bar);
  return shadowAll(g);
}

export function crate() {
  const m = new THREE.Mesh(boxGeo(0.8, 0.8, 0.8, 1.2), woodMat(0xa07040));
  m.position.y = 0.4;
  const g = new THREE.Group(); g.add(m);
  return shadowAll(g);
}

export function trophyMesh(kind = 'gold') {
  const col = kind === 'gold' ? 0xf0c040 : kind === 'silver' ? 0xd0d4dc : 0xc07a40;
  const m = mat(col, { metalness: 1, roughness: 0.25 });
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), mat(0x3a2414)); base.position.y = 0.03; g.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.12, 8), m); stem.position.y = 0.12; g.add(stem);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.035, 0.12, 12, 1, true), m); cup.position.y = 0.23; g.add(cup);
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 10), m); h.position.set(s * 0.09, 0.24, 0); h.rotation.y = Math.PI / 2; g.add(h); }
  return g;
}

export function ribbonMesh(color) {
  const g = new THREE.Group();
  const m = mat(color, { side: THREE.DoubleSide });
  const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16), m);
  rosette.rotation.x = Math.PI / 2; rosette.position.y = 0.18; g.add(rosette);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.14), m);
    tail.position.set(s * 0.025, 0.09, 0); tail.rotation.z = s * 0.2; g.add(tail);
  }
  return g;
}
