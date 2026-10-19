// Horse eye: iris texture with a horizontal pupil, glassy cornea, eyelids and lashes.
// Everything is in head space (+y toward the muzzle, face on -z, left side +x).
import * as THREE from 'three';
import { Strands, hairMaterial } from './hair.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../core/utils.js';
import { mulberry32 } from '../core/noise.js';

let IRIS = null;

// polar map: the pole of the sphere (centre of the eye) is at the top row of the texture
function irisTexture() {
  if (IRIS) return IRIS;
  const rnd = mulberry32(77);
  const slit = -47.8 * Math.PI / 180; // pupil axis: horizontal in the world for the head at rest
  IRIS = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const fib = Array.from({ length: 64 }, () => rnd());
    for (let y = 0; y < h; y++) {
      const th = (y / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const ph = (x / w) * Math.PI * 2;
        const rr = Math.sin(th);                  // 0 at the centre of the eye
        const dx = rr * Math.cos(ph - slit), dy = rr * Math.sin(ph - slit);
        let r = 0.1, gg = 0.07, b = 0.05;         // sclera / surrounding skin (dark)
        if (th < 1.22) {
          const t = rr / 0.94;                    // 0 pupil edge side .. 1 limbus
          const f = fib[Math.floor(x / w * 64) % 64] * 0.5 + fib[Math.floor(x / w * 64 + 1) % 64] * 0.5;
          const warm = Math.max(0, 1 - t * 1.3);
          r = 0.11 + 0.26 * warm + 0.05 * f;
          gg = 0.06 + 0.15 * warm + 0.03 * f;
          b = 0.025 + 0.04 * warm;
          const limbus = Math.max(0, (t - 0.82) / 0.18);
          r *= 1 - 0.7 * limbus; gg *= 1 - 0.7 * limbus; b *= 1 - 0.6 * limbus;
        }
        // horizontal pupil
        const pu = (dx / 0.5) ** 2 + (dy / 0.2) ** 2;
        const pm = Math.min(1, Math.max(0, (1.12 - pu) / 0.25));
        r *= 1 - pm; gg *= 1 - pm; b *= 1 - pm;
        const i = (y * w + x) * 4;
        img.data[i] = Math.min(255, r * 255); img.data[i + 1] = Math.min(255, gg * 255); img.data[i + 2] = Math.min(255, b * 255); img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  IRIS.wrapS = THREE.RepeatWrapping;
  return IRIS;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// returns { group (add to the head bone), dispose } – both eyes are merged into four meshes (ball, lids, catchlight, lashes)
export function buildEyes({ eye, lidColor }) {
  const group = new THREE.Group();
  const R = 0.032;
  const eyeMat = new THREE.MeshPhysicalMaterial({
    map: irisTexture(), roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.55,
  });
  const lidMat = new THREE.MeshStandardMaterial({ color: lidColor, roughness: 0.65, metalness: 0 });
  const lashMat = hairMaterial(0x0b0807, { stiff: 1, gloss: 0.5 });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const upLocal = V(0, -0.737, -0.675).normalize();    // world up seen from the head at rest
  const rnd = mulberry32(5);
  const balls = [], lids = [], sparks = [], lashGeos = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion();

  for (const s of [-1, 1]) {
    const at = V(s * eye[0], eye[1], eye[2]);
    const out = V(s, 0, 0);
    // eyeball (iris pole to the outside)
    balls.push(new THREE.SphereGeometry(R, 32, 22).rotateZ(-s * Math.PI / 2).applyMatrix4(M.compose(at, Q.identity(), V(0.8, 1, 1))));
    // eyelids: spherical caps slightly larger than the ball
    const cap = (dir, theta, rad) => {
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      return new THREE.SphereGeometry(rad, 28, 10, 0, Math.PI * 2, 0, theta).applyMatrix4(new THREE.Matrix4().compose(at, q, V(0.8, 1, 1)));
    };
    lids.push(cap(upLocal.clone().multiplyScalar(0.92).addScaledVector(out, 0.5), 0.88, R * 1.06));
    lids.push(cap(upLocal.clone().multiplyScalar(-0.92).addScaledVector(out, 0.55), 0.7, R * 1.05));
    // catchlight
    const dotPos = at.clone().addScaledVector(out, R * 0.86).addScaledVector(upLocal, R * 0.42).add(V(0, 0.006, -0.004));
    sparks.push(new THREE.SphereGeometry(0.0044, 8, 6).translate(dotPos.x, dotPos.y, dotPos.z));
    // lashes along the upper lid margin
    const lashes = new Strands();
    const side = V(0, 0.675, -0.737).normalize();      // along the lid in the face plane
    for (let k = 0; k < 14; k++) {
      const a = (k / 13 - 0.5) * 1.9;                  // angle along the margin
      const base = V().addScaledVector(upLocal, Math.cos(a) * 0.62).addScaledVector(side, Math.sin(a) * 0.9).addScaledVector(out, 0.62);
      base.normalize().multiplyScalar(R * 1.07);
      const dir = base.clone().addScaledVector(upLocal, 0.5).addScaledVector(out, 0.25).normalize();
      const pts = [];
      const len = 0.011 + 0.007 * rnd();
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        pts.push(base.clone().addScaledVector(dir, t * len).add(V(0, 0.002 * t * t, 0)).add(at));
      }
      lashes.add(pts, 0.0011, out, rnd() * 6.28, 1, null, 0.9);
    }
    lashGeos.push(lashes.build());
  }
  const parts = [
    [mergeGeometries(balls), eyeMat], [mergeGeometries(lids), lidMat], [mergeGeometries(sparks), sparkMat], [mergeGeometries(lashGeos), lashMat],
  ];
  const geos = [...balls, ...lids, ...sparks, ...lashGeos];
  for (const [g, m] of parts) {
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    group.add(mesh);
    geos.push(g);
  }
  return {
    group,
    dispose() { eyeMat.dispose(); lidMat.dispose(); lashMat.dispose(); sparkMat.dispose(); for (const g of geos) g.dispose(); },
  };
}
