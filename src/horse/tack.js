import * as THREE from 'three';
import { canvasTexture } from '../core/utils.js';
import { mulberry32 } from '../core/noise.js';
import { ITEMS } from '../game/catalog.js';

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
const texCache = new Map();
function cached(key, fn) {
  if (!texCache.has(key)) texCache.set(key, fn());
  return texCache.get(key);
}

const hex = (c) => '#' + new THREE.Color(c).getHexString();

// Floral / basket tooling: returns { map, bump }
function toolingTextures(kind, leather) {
  return cached('tool' + kind + leather, () => {
    const base = new THREE.Color(leather);
    const dark = base.clone().multiplyScalar(0.45);
    const light = base.clone().lerp(new THREE.Color(1, 0.9, 0.75), 0.18);
    const rnd = mulberry32(kind === 'floral' ? 11 : 12);
    const draw = (g, w, h, bumpMode) => {
      g.fillStyle = bumpMode ? '#888' : hex(base); g.fillRect(0, 0, w, h);
      // leather grain
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = bumpMode ? `rgba(${rnd() < 0.5 ? 0 : 255},0,0,0.04)` : `rgba(0,0,0,${rnd() * 0.06})`;
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
      if (!kind) return;
      g.lineCap = 'round';
      const stroke = bumpMode ? '#222' : hex(dark);
      const hi = bumpMode ? '#ddd' : hex(light);
      if (kind === 'basket') {
        for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
          const vert = ((x + y) / 16) % 2 === 0;
          g.strokeStyle = stroke; g.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            if (vert) { g.moveTo(x + 3 + k * 5, y + 1); g.lineTo(x + 3 + k * 5, y + 15); } else { g.moveTo(x + 1, y + 3 + k * 5); g.lineTo(x + 15, y + 3 + k * 5); }
            g.stroke();
          }
        }
        return;
      }
      // floral scrollwork
      const flower = (cx, cy, r) => {
        for (let p = 0; p < 6; p++) {
          const a = (p / 6) * Math.PI * 2;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.25, a, 0, Math.PI * 2);
          g.strokeStyle = stroke; g.lineWidth = 2.2; g.stroke();
          g.strokeStyle = hi; g.lineWidth = 0.8; g.stroke();
        }
        g.beginPath(); g.arc(cx, cy, r * 0.22, 0, Math.PI * 2); g.fillStyle = stroke; g.fill();
      };
      const scroll = (x, y, r, a0, dirS) => {
        g.beginPath();
        for (let t = 0; t < 1; t += 0.02) {
          const a = a0 + t * Math.PI * 2.2 * dirS;
          const rr = r * (1 - t * 0.8);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (t === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokeStyle = stroke; g.lineWidth = 2.4; g.stroke();
        // leaves along the scroll
        for (let k = 0; k < 3; k++) {
          const a = a0 + k * 0.9 * dirS;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          g.beginPath(); g.ellipse(px, py, 7, 3, a + 0.8, 0, Math.PI * 2);
          g.strokeStyle = stroke; g.lineWidth = 1.6; g.stroke();
        }
      };
      for (let i = 0; i < 9; i++) {
        const cx = (i % 3) * (w / 3) + w / 6 + (rnd() - 0.5) * 20, cy = Math.floor(i / 3) * (h / 3) + h / 6 + (rnd() - 0.5) * 20;
        flower(cx, cy, 26 + rnd() * 10);
        scroll(cx + 40, cy + 10, 28, rnd() * 6, 1);
        scroll(cx - 40, cy - 14, 24, rnd() * 6, -1);
      }
      g.strokeStyle = stroke; g.lineWidth = 3;
      g.strokeRect(6, 6, w - 12, h - 12);
    };
    const map = canvasTexture(512, 512, (g, w, h) => draw(g, w, h, false), { repeat: true });
    const bump = canvasTexture(512, 512, (g, w, h) => draw(g, w, h, true), { repeat: true, linear: true });
    return { map, bump };
  });
}

function padTexture(colors) {
  return cached('pad' + colors.join(), () => canvasTexture(512, 256, (g, w, h) => {
    const [a, b, c, d] = colors;
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    const band = (y, hh, col) => { g.fillStyle = col; g.fillRect(0, y, w, hh); };
    band(0, 18, c); band(h - 18, 18, c);
    band(22, 8, b); band(h - 30, 8, b);
    band(h / 2 - 34, 68, d);
    // step diamonds
    for (let x = 0; x < w; x += 64) {
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? b : c;
        const s = 30 - k * 7;
        g.beginPath(); g.moveTo(x + 32, h / 2 - s); g.lineTo(x + 32 + s, h / 2); g.lineTo(x + 32, h / 2 + s); g.lineTo(x + 32 - s, h / 2); g.closePath(); g.fill();
      }
      g.fillStyle = b;
      for (let k = 0; k < 6; k++) { g.fillRect(x + k * 10, 46, 6, 6); g.fillRect(x + k * 10 + 5, h - 52, 6, 6); }
    }
    // woven texture
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 4) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x, 0, 1, h); }
  }));
}

export function nameTexture(text, engraved = false) {
  return cached('name' + text + engraved, () => canvasTexture(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (engraved) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#f4f4f8'); grd.addColorStop(0.5, '#a8acb4'); grd.addColorStop(1, '#e4e6ec');
      g.fillStyle = grd;
      g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 30); g.fill();
      g.strokeStyle = '#6a6e76'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#2a2c30';
    } else {
      g.fillStyle = '#ffffff';
    }
    g.font = `${engraved ? 96 : 118}px Rye, Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!engraved) { g.shadowColor = 'rgba(255,255,255,0.8)'; g.shadowBlur = 6; }
    g.fillText(text, w / 2, h / 2 + 6);
  }));
}

function meshTexture() {
  return cached('flymesh', () => canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  }, { repeat: true }));
}

const METALS = {
  silver: () => new THREE.MeshStandardMaterial({ color: 0xe4e6ec, metalness: 1, roughness: 0.18 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xf0c050, metalness: 1, roughness: 0.22 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc0964a, metalness: 1, roughness: 0.35 }),
};
const metalCache = {};
const metal = (k) => (metalCache[k] ||= METALS[k] ? METALS[k]() : METALS.silver());
const turquoiseMat = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.35, metalness: 0.05 });
const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.6, emissive: 0x332233 });

function concho(kind, turq, r = 0.03) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.008, 16), metal(kind));
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  // scalloped edge
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, r * 0.12, 4, 16), metal(kind));
  ring.position.z = 0.004;
  g.add(ring);
  if (turq) {
    const stone = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 10, 6), turquoiseMat);
    stone.scale.z = 0.5; stone.position.z = 0.006; g.add(stone);
  } else {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 8, 6), metal(kind));
    dome.scale.z = 0.5; dome.position.z = 0.005; g.add(dome);
  }
  return g;
}

// open cylinder arc lying across the back (top at y=0)
function arcSlab(radius, arc, length, segs = 20) {
  const g = new THREE.CylinderGeometry(radius, radius, length, segs, 1, true, Math.PI - arc / 2, arc);
  g.rotateX(Math.PI / 2);
  g.translate(0, -radius, 0);
  return g;
}

function ellipseTube(cx, cy, cz, rx, rz, r, plane = 'xz', a0 = 0, a1 = Math.PI * 2, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    if (plane === 'xz') pts.push(new THREE.Vector3(cx + Math.cos(a) * rx, cy, cz + Math.sin(a) * rz));
    else pts.push(new THREE.Vector3(cx + Math.cos(a) * rx, cy + Math.sin(a) * rz, cz));
  }
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-3;
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), n, r, 5, closed);
}

// ---------------------------------------------------------------------------
export class Tack {
  constructor(game) {
    this.game = game;
    this.reinMat = new THREE.MeshStandardMaterial({ color: 0x3a2112, roughness: 0.6 });
  }

  dress(horse) {
    const rig = horse.rig;
    if (horse.tackObjs) horse.tackObjs.forEach((o) => o.parent && o.parent.remove(o));
    horse.tackObjs = [];
    const t = horse.data.tack || {};
    const add = (obj, parent) => { parent.add(obj); horse.tackObjs.push(obj); obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); };
    const d = rig.dims;
    const bulk = d.bulk;
    horse.hasSaddle = !!t.saddle;
    horse.bit = null;
    horse.horn = null;
    if (t.pad || t.saddle) add(this.pad(ITEMS[t.pad] || ITEMS.pad_navajo, bulk), rig.saddleMount);
    if (t.saddle) {
      const s = this.saddle(ITEMS[t.saddle], bulk);
      add(s, rig.saddleMount);
      horse.horn = s.userData.horn;
      horse.seat = s.userData.seat;
    } else {
      horse.seat = new THREE.Object3D(); horse.seat.position.set(0, 0.04, -0.04); add(horse.seat, rig.saddleMount);
    }
    if (t.bridle) {
      const b = this.bridle(ITEMS[t.bridle], d);
      add(b, rig.head);
      horse.bit = b.userData.bits;
    }
    if (t.breast) add(this.breastCollar(ITEMS[t.breast], d), rig.body);
    if (t.wraps) rig.legs.forEach((leg) => add(this.wrap(ITEMS[t.wraps], leg, d), leg.knee));
    if (t.mask) {
      const fm = this.flyMask(ITEMS[t.mask], d);
      add(fm, rig.head);
      rig.ears.forEach((e) => { const c = this.earCover(ITEMS[t.mask]); add(c, e); });
    }
    // reins (world space, updated per frame)
    if (horse.reins) { this.game.scene.remove(horse.reins); horse.reins.geometry.dispose(); horse.reins = null; }
    if (t.bridle) {
      horse.reins = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: ITEMS[t.bridle].color, roughness: 0.6 }));
      horse.reins.castShadow = true;
      horse.reins.frustumCulled = false;
      this.game.scene.add(horse.reins);
    }
  }

  pad(item, bulk) {
    const tex = padTexture(item.colors);
    const g = new THREE.Group();
    const r = 0.29 * bulk + 0.02;
    const m = new THREE.Mesh(arcSlab(r, 2.3, 0.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
    m.position.set(0, 0.012, -0.04);
    g.add(m);
    return g;
  }

  saddle(item, bulk) {
    const g = new THREE.Group();
    const tool = toolingTextures(item.tooling, item.leather);
    const leather = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tool.map, bumpMap: tool.bump, bumpScale: 2.2, roughness: item.rough ? 0.95 : 0.55, side: THREE.DoubleSide });
    const plain = new THREE.MeshStandardMaterial({ color: item.leather, roughness: item.rough ? 0.95 : 0.5 });
    const seatM = new THREE.MeshStandardMaterial({ color: item.seat, roughness: 0.6 });
    const r = 0.29 * bulk + 0.04;
    const conchoKind = item.conchos || 'silver';
    // skirt
    const skirt = new THREE.Mesh(arcSlab(r, 1.95, 0.64), leather);
    skirt.position.set(0, 0.03, -0.05);
    g.add(skirt);
    const skirtEdge = new THREE.Mesh(arcSlab(r + 0.004, 1.95, 0.64), new THREE.MeshStandardMaterial({ color: new THREE.Color(item.leather).multiplyScalar(0.6), side: THREE.BackSide }));
    skirtEdge.position.copy(skirt.position);
    g.add(skirtEdge);
    // seat
    const seatG = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const seat = new THREE.Mesh(seatG, seatM);
    seat.scale.set(0.2 * bulk + 0.03, 0.06, 0.25);
    seat.position.set(0, 0.035, -0.04);
    g.add(seat);
    // fork + horn
    const fork = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), leather);
    fork.scale.set(0.15 * bulk + 0.03, 0.1, 0.09);
    fork.position.set(0, 0.07, 0.2);
    g.add(fork);
    const hornNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.11, 10), plain);
    hornNeck.position.set(0, 0.2, 0.24); hornNeck.rotation.x = 0.25;
    g.add(hornNeck);
    const hornCap = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.028, 18), item.trim ? metal(item.trim) : plain);
    hornCap.position.set(0, 0.26, 0.255); hornCap.rotation.x = 0.25;
    g.add(hornCap);
    const horn = new THREE.Object3D(); horn.position.set(0, 0.24, 0.25); g.add(horn);
    // cantle
    const shape = new THREE.Shape();
    shape.moveTo(-0.17, 0);
    shape.quadraticCurveTo(-0.18, 0.13, 0, 0.15);
    shape.quadraticCurveTo(0.18, 0.13, 0.17, 0);
    shape.lineTo(-0.17, 0);
    const cg = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 12 });
    cg.translate(0, 0, -0.0225);
    const cantle = new THREE.Mesh(cg, leather);
    cantle.position.set(0, 0.04, -0.27); cantle.rotation.x = -0.3;
    cantle.scale.x = 0.9 + bulk * 0.1;
    g.add(cantle);
    if (item.trim) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const a = Math.PI * (i / 16); pts.push(new THREE.Vector3(-Math.cos(a) * 0.175, Math.sin(a) * 0.15 + 0.005, 0)); }
      const trim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 5), metal(item.trim));
      trim.position.copy(cantle.position); trim.rotation.copy(cantle.rotation);
      trim.scale.x = cantle.scale.x;
      g.add(trim);
    }
    if (item.text) {
      // silver lettering on the back of the cantle
      const tex = nameTexture(item.text);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.085), new THREE.MeshStandardMaterial({
        color: 0xf0f2f8, metalness: 1, roughness: 0.12, alphaMap: tex, transparent: true, alphaTest: 0.35,
        bumpMap: tex, bumpScale: 3, emissive: 0x30343c, side: THREE.DoubleSide,
      }));
      // in the cantle's local frame: just behind its back face
      plate.position.set(0, 0.075, -0.0375);
      plate.rotation.set(0, Math.PI, 0);
      cantle.add(plate);
      for (const s of [-1, 1]) {
        const c = concho(conchoKind, item.turquoise, 0.022);
        c.position.set(s * 0.155, 0.035, -0.036); c.rotation.set(0, Math.PI, 0);
        cantle.add(c);
      }
    }
    // fenders + stirrups
    for (const s of [-1, 1]) {
      const fenderG = new THREE.PlaneGeometry(0.17, 0.5, 2, 4);
      const fp = fenderG.attributes.position;
      for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); fp.setX(i, fp.getX(i) * (1 + (0.25 - y) * 0.6)); }
      fenderG.translate(0, -0.25, 0);
      const fender = new THREE.Mesh(fenderG, leather);
      fender.position.set(s * (r * 0.92), -0.07, 0.0);
      fender.rotation.set(0, s * Math.PI / 2, s * 0.08);
      g.add(fender);
      const stirrup = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 6, 14, Math.PI), plain);
      stirrup.add(arch);
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.08), plain);
      tread.position.y = 0.0; stirrup.add(tread);
      stirrup.rotation.y = Math.PI / 2;
      stirrup.position.set(s * (r * 0.92 + 0.05), -0.66, 0.0);
      stirrup.scale.y = -1;
      g.add(stirrup);
      // conchos on the skirt corners
      for (const z of [0.2, -0.3]) {
        const c = concho(conchoKind, item.turquoise);
        const a = 0.8;
        c.position.set(s * Math.sin(a) * (r + 0.006), 0.03 - r + Math.cos(a) * (r + 0.006), z - 0.03);
        c.lookAt(c.position.clone().add(new THREE.Vector3(s * Math.sin(a), Math.cos(a), 0)));
        g.add(c);
        // saddle strings
        for (const o of [-0.012, 0.012]) {
          const str = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.18, 0.012), plain);
          str.position.copy(c.position); str.position.y -= 0.09; str.position.z += o; str.position.x += s * 0.008;
          g.add(str);
        }
      }
      if (item.crystals) {
        for (let k = 0; k < 8; k++) {
          const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.008), crystalMat);
          const a = 0.5 + (k % 4) * 0.12;
          cr.position.set(s * Math.sin(a) * (r + 0.008), 0.03 - r + Math.cos(a) * (r + 0.008), -0.2 + Math.floor(k / 4) * 0.35);
          g.add(cr);
        }
      }
    }
    // cinch
    const cinch = new THREE.Mesh(ellipseTube(0, -0.31 * bulk, 0.05, 0.29 * bulk + 0.03, 0.33 * bulk + 0.02, 0.012, 'xy', Math.PI * 1.05, Math.PI * 1.95, 20), new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 1 }));
    g.add(cinch);
    const seatPoint = new THREE.Object3D(); seatPoint.position.set(0, 0.1, -0.06); g.add(seatPoint);
    g.userData.horn = horn;
    g.userData.seat = seatPoint;
    return g;
  }

  bridle(item, d) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.55 });
    const hs = d.headSection;
    const ring = (t, r = 0.008, a0 = 0, a1 = Math.PI * 2) => {
      const s = hs(t);
      return new THREE.Mesh(ellipseTube(0, s.y, s.cz, s.rx + 0.006, s.rz + 0.006, r, 'xz', a0, a1), m);
    };
    // crown piece behind ears
    g.add(ring(0.0, 0.009));
    // browband across forehead (face side = -z: angle PI..2PI)
    g.add(ring(0.08, 0.008, Math.PI * 1.05, Math.PI * 1.95));
    // noseband / bosal
    g.add(ring(0.66, 0.009));
    // cheek pieces
    const bits = [];
    for (const s of [-1, 1]) {
      const a = hs(0.02), b = hs(0.86);
      const pts = [
        new THREE.Vector3(s * (a.rx + 0.006), a.y, a.cz),
        new THREE.Vector3(s * (hs(0.4).rx + 0.006), hs(0.4).y, hs(0.4).cz - 0.01),
        new THREE.Vector3(s * (b.rx + 0.004), b.y, b.cz + 0.01),
      ];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.008, 4), m));
      const bitRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 14), metal(item.conchos || 'silver'));
      bitRing.position.set(s * (b.rx + 0.01), b.y, b.cz + 0.01); bitRing.rotation.y = Math.PI / 2;
      g.add(bitRing);
      const bitPt = new THREE.Object3D(); bitPt.position.copy(bitRing.position); g.add(bitPt);
      bits.push(bitPt);
      if (item.conchos) {
        const c = concho(item.conchos, false, 0.02);
        const p = hs(0.08);
        c.position.set(s * (p.rx + 0.012), p.y, p.cz - 0.02); c.rotation.y = s * Math.PI / 2;
        g.add(c);
      }
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, hs(0.86).rx * 2 + 0.02, 6), metal('silver'));
    bar.rotation.z = Math.PI / 2; bar.position.set(0, hs(0.86).y, hs(0.86).cz + 0.01);
    g.add(bar);
    if (item.plate) {
      // engraved name plate on the browband
      const p = hs(0.1);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.032), new THREE.MeshStandardMaterial({ map: nameTexture(item.plate, true), metalness: 0.9, roughness: 0.25, transparent: true }));
      plate.position.set(0, p.y, p.cz - p.rz - 0.012);
      plate.rotation.set(0, Math.PI, 0); // face side of the head is -z
      g.add(plate);
    }
    g.userData.bits = bits;
    return g;
  }

  breastCollar(item, d) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.55 });
    const b = d.bulk, zl = d.zLen, cy = d.cy;
    const wAt = (s) => 0.27 * b * Math.sqrt(Math.max(0, 1 - Math.pow(s, 2.4))) + 0.018;
    const pts = [];
    for (const s of [0.5, 0.7, 0.86, 0.95]) pts.push(new THREE.Vector3(wAt(s), cy + 0.06 - (s - 0.5) * 0.2, s * zl));
    const mid = new THREE.Vector3(0, cy - 0.04, zl + 0.02);
    const all = [...pts.slice().reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z)), mid, ...pts].reverse();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(all), 30, 0.018, 5), m));
    const c = concho(item.conchos || 'silver', item.turquoise, 0.045);
    c.position.copy(mid).add(new THREE.Vector3(0, 0, 0.02));
    g.add(c);
    for (const s of [-1, 1]) {
      const c2 = concho(item.conchos || 'silver', item.turquoise, 0.03);
      c2.position.set(s * wAt(0.86), cy + 0.06 - 0.36 * 0.2, 0.86 * zl);
      c2.lookAt(c2.position.clone().add(new THREE.Vector3(s, 0, 0.6)));
      g.add(c2);
    }
    return g;
  }

  wrap(item, leg, d) {
    const r = 0.056 * d.legThick + 0.014;
    const h = leg.segs[1] * 0.75;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, h, 12), new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.9 }));
    m.position.y = -leg.segs[1] * 0.55;
    const g = new THREE.Group(); g.add(m);
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    strap.position.y = m.position.y + h * 0.3; g.add(strap);
    const strap2 = strap.clone(); strap2.position.y = m.position.y - h * 0.3; g.add(strap2);
    return g;
  }

  flyMask(item, d) {
    const hs = d.headSection;
    const pos = [], idx = [], uvs = [];
    const R = 14, S = 16;
    for (let i = 0; i <= R; i++) {
      const t = (i / R) * 0.72;
      const s = hs(t);
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * Math.PI * 2;
        pos.push((s.rx + 0.016) * Math.sin(a), s.y, s.cz + (s.rz + 0.016) * Math.cos(a));
        uvs.push(j / S * 4, i / R * 4);
      }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) {
      const a = i * (S + 1) + j, b = a + 1, c = a + S + 1, dd = c + 1;
      idx.push(a, c, b, b, c, dd);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const tex = meshTexture();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: item.color, alphaMap: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, roughness: 1, alphaTest: 0.2 }));
    const grp = new THREE.Group(); grp.add(m);
    const trim = new THREE.Mesh(ellipseTube(0, hs(0.72).y, hs(0.72).cz, hs(0.72).rx + 0.018, hs(0.72).rz + 0.018, 0.008), new THREE.MeshStandardMaterial({ color: item.color }));
    grp.add(trim);
    return grp;
  }

  earCover(item) {
    const g = new THREE.ConeGeometry(0.045, 0.17, 8);
    g.translate(0, 0.085, 0); g.rotateX(Math.PI); g.scale(1, 1, 0.7);
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: item.color, roughness: 1 }));
  }

  updateReins(horse, riderHands) {
    if (!horse.reins || !horse.bit) return;
    const a = horse.bit[0].getWorldPosition(new THREE.Vector3());
    const b = horse.bit[1].getWorldPosition(new THREE.Vector3());
    let hand;
    if (riderHands) hand = riderHands;
    else if (horse.horn) hand = horse.horn.getWorldPosition(new THREE.Vector3());
    else return;
    const mid = (p, q, sag) => p.clone().lerp(q, 0.5).add(new THREE.Vector3(0, -sag, 0));
    const pts = [a, mid(a, hand, 0.12), hand.clone().add(new THREE.Vector3(0, 0.0, 0)), mid(b, hand, 0.12), b];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.007, 4);
    horse.reins.geometry.dispose();
    horse.reins.geometry = g;
  }

  removeReins(horse) {
    if (horse.reins) { this.game.scene.remove(horse.reins); horse.reins.geometry.dispose(); horse.reins = null; }
  }
}
