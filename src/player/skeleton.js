// Rider skeleton shared by the offline mesh generator (gen/build-rider.js) and the runtime rig.
// Rest pose: standing, arms hanging, every bone rotation zero. Coordinates are pelvis-relative
// (hip centre = origin), y up, z forward, +x is the character's left side. Metres.

// Left-side joints; the right side mirrors x.
const L = {
  spine: [0, 0.11, -0.005],
  chest: [0, 0.29, -0.005],
  neck: [0, 0.485, -0.012],
  head: [0, 0.64, -0.012],
  clav: [0.045, 0.455, 0.0],
  // arms and legs hang exactly vertical so every bone's rest axis is -y (keeps the IK exact)
  arm: [0.215, 0.445, 0.0],
  fore: [0.215, 0.145, 0.0],
  hand: [0.215, -0.12, 0.0],
  fing: [0.215, -0.21, 0.0],
  tip: [0.215, -0.255, 0.0],
  thumb: [0.2, -0.15, 0.03],
  hip: [0.095, -0.015, 0.0],
  knee: [0.095, -0.44, 0.0],
  foot: [0.095, -0.86, 0.0],
};

export const STAND_HEIGHT = 0.93; // pelvis height above the ground when standing (boot soles at -0.93)

const SIDE = ['clav', 'arm', 'fore', 'hand', 'fing', 'tip', 'thumb'];
const LEG = ['hip', 'knee', 'foot'];
const PARENT = { clav: 'chest', arm: 'clav', fore: 'arm', hand: 'fore', fing: 'hand', tip: 'fing', thumb: 'hand', hip: 'pelvis', knee: 'hip', foot: 'knee' };

// Order matters: the generator stores bone indices into the mesh data.
export const BONE_NAMES = ['pelvis', 'spine', 'chest', 'neck', 'head'];
for (const s of ['L', 'R']) for (const n of SIDE) BONE_NAMES.push(n + s);
for (const s of ['L', 'R']) for (const n of LEG) BONE_NAMES.push(n + s);

export const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));

// absolute rest position of every joint
export const JOINT = { pelvis: [0, 0, 0], spine: L.spine, chest: L.chest, neck: L.neck, head: L.head };
for (const n of [...SIDE, ...LEG]) {
  JOINT[n + 'L'] = L[n];
  JOINT[n + 'R'] = [-L[n][0], L[n][1], L[n][2]];
}

export const BONE_PARENT = { spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck' };
for (const s of ['L', 'R']) {
  for (const n of [...SIDE, ...LEG]) {
    const p = PARENT[n];
    BONE_PARENT[n + s] = p === 'chest' || p === 'pelvis' ? p : p + s;
  }
}

// local offset of a bone relative to its parent
export function boneOffset(name) {
  const p = BONE_PARENT[name];
  if (!p) return JOINT[name].slice();
  return [0, 1, 2].map((i) => JOINT[name][i] - JOINT[p][i]);
}

// left bone index <-> right bone index (used to mirror the hand mesh)
export const MIRROR_BONE = BONE_NAMES.map((n) => {
  if (n.endsWith('L')) return BONE_INDEX[n.slice(0, -1) + 'R'];
  if (n.endsWith('R')) return BONE_INDEX[n.slice(0, -1) + 'L'];
  return BONE_INDEX[n];
});
