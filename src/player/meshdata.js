import * as THREE from 'three';
import { BONE_NAMES, BONE_PARENT, boneOffset, MIRROR_BONE } from './skeleton.js';

const B64 = new Uint8Array(128).fill(255);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => { B64[c.charCodeAt(0)] = i; });

export function decodeBase64(str) {
  let len = str.length;
  while (str.charCodeAt(len - 1) === 61) len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < len; i++) {
    acc = ((acc << 6) | B64[str.charCodeAt(i)]) & 0xffffff;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out;
}

// Mesh layout written by gen/build-rider.js
export function parseMesh(b64) {
  const bytes = decodeBase64(b64);
  const buf = bytes.buffer;
  const [, n, ni, metaLen, big] = new Uint32Array(buf, 0, 5);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + metaLen)));
  let o = 20 + metaLen;
  const take = (Ctor, count) => {
    const a = new Ctor(buf.slice(o, o + count * Ctor.BYTES_PER_ELEMENT));
    o += count * Ctor.BYTES_PER_ELEMENT;
    return a;
  };
  const posQ = take(Int16Array, n * 3);
  const nor = take(Int8Array, n * 3);
  const ao = take(Uint8Array, n);
  const si = take(Uint8Array, n * 4);
  const sw = take(Uint8Array, n * 4);
  const ind = big ? take(Uint32Array, ni) : take(Uint16Array, ni);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = posQ[i] / meta.scale;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1, true));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(si), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  g.setIndex(new THREE.BufferAttribute(ind, 1));
  return { geometry: g, meta };
}

// Left/right copy of a mesh authored for the left side (x flipped, bones swapped, winding reversed).
export function mirrorGeometry(src) {
  const g = src.clone();
  const p = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); nrm.setX(i, -nrm.getX(i)); }
  const si = g.attributes.skinIndex;
  for (let i = 0; i < si.array.length; i++) si.array[i] = MIRROR_BONE[si.array[i]];
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return g;
}

// Bone hierarchy in the rest pose (all rotations zero), hung under `root`.
export function buildSkeleton(root = new THREE.Group()) {
  const bones = BONE_NAMES.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...boneOffset(name));
    return b;
  });
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  BONE_NAMES.forEach((name, i) => {
    const parent = BONE_PARENT[name];
    if (parent) byName[parent].add(bones[i]); else root.add(bones[i]);
  });
  root.updateMatrixWorld(true);
  return { root, bones, byName, skeleton: new THREE.Skeleton(bones) };
}
