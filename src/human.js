// Prozedurale Spielfigur (zu Fuß und im Sattel)
import * as THREE from 'three';
import { clamp, lerp, damp, TAU } from './util.js';

export const SKINS = ['#f3d2b8', '#e4b890', '#c98f62', '#a06a42', '#74482a', '#4a2c1a'];
export const HAIRS = ['#1b1512', '#3d2616', '#6b4423', '#a56b2e', '#d8b06a', '#e9dcc0', '#8c2f1b', '#7d7d80'];
export const CLOTHES = ['#b3261e', '#27496d', '#2f5d3a', '#e8e3d6', '#1d1d22', '#c98a2b', '#6b3fa0', '#d46a8a', '#3a8fa3', '#7a5a3a'];
export const HAIR_STYLES = ['Kurz', 'Lang', 'Pferdeschwanz', 'Dutt', 'Glatze'];
export const defaultLook = () => ({ build: 0.4, size: 1, skin: SKINS[1], hair: HAIRS[2], hairStyle: 2, shirt: CLOTHES[0], jeans: CLOTHES[1], jacket: CLOTHES[4], breeches: CLOTHES[3], hat: '#c9b38a' });
export const randomLook = (r = Math.random) => ({ build: r(), size: 0.95 + r() * 0.1, skin: SKINS[Math.floor(r() * SKINS.length)], hair: HAIRS[Math.floor(r() * HAIRS.length)], hairStyle: Math.floor(r() * 4), shirt: CLOTHES[Math.floor(r() * CLOTHES.length)], jeans: CLOTHES[Math.floor(r() * CLOTHES.length)], jacket: CLOTHES[Math.floor(r() * CLOTHES.length)], breeches: CLOTHES[3], hat: r() < 0.5 ? '#c9b38a' : '#3b2a1c' });

export function buildHuman(look, style = 'western') {
  const dis = [];
  const G = (g) => { dis.push(g); return g; };
  const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o }); dis.push(m); return m; };
  const west = style === 'western';
  const b = look.build; // 0 zierlich ... 1 kräftig
  const mSkin = mat(look.skin, { roughness: 0.6 }), mTop = mat(west ? look.shirt : look.jacket), mLeg = mat(west ? look.jeans : look.breeches);
  const mBoot = mat(west ? '#5a3a22' : '#141416', { roughness: 0.45 }), mHair = mat(look.hair, { roughness: 0.9 }), mGlove = mat(west ? look.skin : '#1a1a1c');
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
  const cap = (r, len, m) => { const g = G(new THREE.CapsuleGeometry(r, len, 4, 10)); g.translate(0, -len / 2, 0); return mesh(g, m); };
  const sphG = G(new THREE.SphereGeometry(1, 14, 10));
  const sph = (m, sx, sy, sz, x, y, z) => { const o = mesh(sphG, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };

  const root = new THREE.Group(), hips = new THREE.Group(); root.add(hips); root.scale.setScalar(look.size || 1);
  const sw = lerp(0.17, 0.215, b), hw = lerp(0.165, 0.15, b);
  hips.add(sph(mLeg, hw, 0.12, 0.115, 0, 0, 0));
  const torso = new THREE.Group(); torso.position.y = 0.04; hips.add(torso);
  const chest = sph(mTop, sw * 0.92, 0.25, lerp(0.105, 0.125, b), 0, 0.27, 0); torso.add(chest);
  torso.add(sph(mTop, lerp(0.125, 0.15, b), 0.16, 0.1, 0, 0.1, 0));
  if (!west) { const t = sph(mTop, hw * 1.04, 0.1, 0.125, 0, 0, 0); torso.add(t); }
  if (west) torso.add(sph(mat('#2a1a10'), hw * 1.03, 0.025, 0.12, 0, 0.02, 0));
  const nk = mesh(G(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8)), mSkin); nk.position.y = 0.53; torso.add(nk);
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  head.add(sph(mSkin, 0.092, 0.115, 0.105, 0, 0, 0));
  head.add(sph(mSkin, 0.015, 0.02, 0.02, 0, -0.01, 0.105));
  const mEye = mat('#17120f', { roughness: 0.3 });
  for (const s of [-1, 1]) head.add(sph(mEye, 0.012, 0.012, 0.008, s * 0.036, 0.018, 0.094));
  const hs = look.hairStyle;
  if (hs !== 4) {
    head.add(sph(mHair, 0.099, 0.1, 0.112, 0, 0.03, -0.012));
    if (hs === 1) { head.add(sph(mHair, 0.1, 0.2, 0.06, 0, -0.1, -0.075)); }
    if (hs === 2) { const p = sph(mHair, 0.035, 0.17, 0.04, 0, -0.1, -0.13); p.rotation.x = 0.25; head.add(p); }
    if (hs === 3) head.add(sph(mHair, 0.05, 0.05, 0.05, 0, 0.06, -0.12));
  }
  if (west) {
    const mHat = mat(look.hat, { roughness: 0.9 });
    const brim = mesh(G(new THREE.CylinderGeometry(0.21, 0.22, 0.012, 20)), mHat); brim.position.y = 0.075; brim.scale.z = 1.15; head.add(brim);
    const crown = mesh(G(new THREE.CylinderGeometry(0.085, 0.105, 0.11, 14)), mHat); crown.position.y = 0.135; head.add(crown);
    const band = mesh(G(new THREE.CylinderGeometry(0.107, 0.107, 0.02, 14)), mat('#2a1a10')); band.position.y = 0.092; head.add(band);
  } else {
    const mHel = mat('#111114', { roughness: 0.35 });
    const hel = mesh(G(new THREE.SphereGeometry(0.112, 14, 8, 0, TAU, 0, Math.PI * 0.55)), mHel); hel.position.y = 0.025; hel.scale.z = 1.08; head.add(hel);
    const vis = mesh(G(new THREE.BoxGeometry(0.14, 0.012, 0.07)), mHel); vis.position.set(0, 0.035, 0.125); vis.rotation.x = 0.2; head.add(vis);
  }
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * sw, 0.44, 0); torso.add(sh);
    sh.add(sph(mTop, 0.052, 0.052, 0.052, 0, 0, 0));
    sh.add(cap(lerp(0.04, 0.05, b), 0.24, mTop));
    const el = new THREE.Group(); el.position.y = -0.27; sh.add(el);
    el.add(cap(lerp(0.034, 0.042, b), 0.22, west ? mTop : mTop));
    const hand = sph(mGlove, 0.036, 0.045, 0.04, 0, -0.27, 0); el.add(hand);
    arms.push({ sh, el, hand });
    const hip = new THREE.Group(); hip.position.set(s * 0.085, -0.03, 0); hip.rotation.order = 'YXZ'; hips.add(hip);
    hip.add(cap(lerp(0.07, 0.082, b), 0.36, mLeg));
    const kn = new THREE.Group(); kn.position.y = -0.44; hip.add(kn);
    kn.add(cap(0.052, 0.36, west ? mLeg : mBoot));
    const ft = new THREE.Group(); ft.position.y = -0.44; kn.add(ft);
    const boot = mesh(G(new THREE.BoxGeometry(0.085, 0.075, 0.24)), mBoot); boot.position.set(0, -0.025, 0.055); ft.add(boot);
    if (west) { const sh2 = cap(0.057, 0.16, mBoot); sh2.position.y = 0.2; ft.add(sh2); }
    legs.push({ hip, kn, ft });
  }
  return { root, hips, torso, head, arms, legs, style, anim: { phase: 0, t: 0, lean: 0, hy: 0.95 }, dispose() { for (const d of dis) d.dispose(); } };
}

// st: { mode: 'foot'|'ride', speed, gait, phase (Pferdephase), air, slide, sprint }
export function animateHuman(hm, st, dt) {
  const a = hm.anim; a.t += dt;
  const L = hm.legs, A = hm.arms, k = 1 - Math.exp(-dt * 14);
  const set = (o, x, y = 0, z = 0) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
  let hy, lean = 0, headX = 0;
  if (st.mode === 'ride') {
    const west = hm.style === 'western', g = st.gait;
    const ph = (st.phase || 0) * TAU;
    hy = 0.1;
    let twoPt = 0;
    if (st.air) { twoPt = 1; lean = 0.55; }
    else if (st.slide) { lean = -0.25; }
    else if (g === 2 && !west) { hy += 0.05 * Math.abs(Math.sin(ph)); lean = 0.1; }
    else if (g === 3) { lean = west ? 0.02 : 0.1; hy += 0.012 * Math.cos(ph); }
    else if (g >= 4) { twoPt = west ? 0.3 : 1; lean = west ? 0.2 : 0.5; }
    hy += twoPt * 0.09;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      set(L[i].hip, lerp(west ? -0.72 : -0.85, -0.7, twoPt), s * 0.5, 0);
      set(L[i].kn, lerp(west ? 0.62 : 1.0, 0.95, twoPt));
      set(L[i].ft, west ? -0.1 : -0.3);
      if (west && i === 1) { set(A[i].sh, 0.15, 0, 0.12); set(A[i].el, -0.35); }
      else { set(A[i].sh, -0.25 - lean * 0.6, 0, -s * 0.12); set(A[i].el, -1.25 + twoPt * 0.3); }
    }
    headX = -lean * 0.7;
  } else {
    const v = st.speed || 0, run = clamp((v - 1.8) / 3, 0, 1);
    a.phase = (a.phase + dt * v / lerp(1.5, 2.6, run)) % 1;
    const amp = clamp(v / 1.5, 0, 1) * lerp(0.5, 0.9, run), ph = a.phase * TAU;
    hy = 0.95 - 0.02 * amp + 0.02 * amp * Math.abs(Math.sin(ph)) + (v < 0.1 ? 0.003 * Math.sin(a.t * 1.8) : 0);
    lean = 0.04 + run * 0.18;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, sw = Math.sin(ph + (i ? Math.PI : 0));
      set(L[i].hip, -sw * amp * 0.9 - run * 0.15, 0, 0);
      set(L[i].kn, Math.max(0, Math.cos(ph + (i ? Math.PI : 0))) * amp * lerp(1.0, 1.7, run) + 0.05);
      set(L[i].ft, 0);
      set(A[i].sh, sw * amp * 0.7, 0, -s * 0.07); set(A[i].el, -0.15 - run * 1.1 - Math.max(0, sw) * amp * 0.3);
    }
  }
  a.hy = damp(a.hy, hy, 14, dt); a.lean = damp(a.lean, lean, 8, dt);
  hm.hips.position.y = a.hy; hm.torso.rotation.x = a.lean; hm.head.rotation.x = damp(hm.head.rotation.x, headX, 8, dt);
}
