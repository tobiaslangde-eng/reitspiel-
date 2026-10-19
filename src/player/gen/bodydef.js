// Signed-distance primitives of the rider's body, in the rest pose of src/player/skeleton.js.
// Women's proportions, about 1.72 m tall in boots. Every primitive names the bone it is skinned to.
import { ell, rc, sub } from './sdf.js';
import { JOINT as J } from '../skeleton.js';

const SIDES = [1, -1];
const m = (s, p) => [s * p[0], p[1], p[2]];
const side = (s) => (s > 0 ? 'L' : 'R');

// Everything below the neck: torso, arms down to the cuffs, legs and boots.
export function bodyPrims() {
  const P = [];
  const add = (p) => P.push(p);

  // ---- pelvis, belly, waist
  add(ell([0, -0.02, -0.012], [0.168, 0.105, 0.115], { bone: 'pelvis', k: 0.07 }));
  for (const s of SIDES) add(ell(m(s, [0.078, -0.055, -0.08]), [0.09, 0.092, 0.07], { bone: 'pelvis', k: 0.06 }));
  add(ell([0, 0.07, 0.02], [0.138, 0.1, 0.092], { bone: 'pelvis', k: 0.07 }));
  add(ell([0, 0.155, 0.0], [0.12, 0.09, 0.088], { bone: 'spine', k: 0.07 }));
  // ---- ribcage, bust, back
  add(ell([0, 0.245, -0.004], [0.13, 0.12, 0.099], { bone: 'spine', k: 0.08 }));
  add(ell([0, 0.35, -0.006], [0.144, 0.12, 0.106], { bone: 'chest', k: 0.08 }));
  for (const s of SIDES) add(ell(m(s, [0.068, 0.312, 0.07]), [0.066, 0.06, 0.058], { bone: 'chest', k: 0.06, rot: [0.12, 0, 0] }));
  add(ell([0, 0.375, -0.065], [0.135, 0.105, 0.05], { bone: 'chest', k: 0.08 }));
  add(ell([0, 0.424, -0.012], [0.168, 0.056, 0.085], { bone: 'chest', k: 0.08 }));
  for (const s of SIDES) add(rc(m(s, [0.045, 0.462, -0.026]), m(s, [0.15, 0.428, -0.012]), 0.034, 0.034, { bone: 'chest', k: 0.05 }));
  // ---- neck stump (the head mesh continues it, slightly wider)
  add(rc([0, 0.44, -0.026], [0, 0.59, -0.016], 0.047, 0.043, { bone: 'neck', k: 0.06, sx: 0.92 }));

  // ---- arms (vertical, like the bones)
  const AX = 0.215;
  for (const s of SIDES) {
    const b = side(s);
    const g = s > 0 ? 3 : 4;
    add(ell(m(s, [AX - 0.01, 0.436, 0.0]), [0.05, 0.06, 0.056], { bone: 'arm' + b, k: 0.05 })); // deltoid belongs to the torso group
    add(rc(m(s, [AX, 0.43, 0]), m(s, [AX, 0.152, 0]), 0.045, 0.035, { bone: 'arm' + b, k: 0.05, g }));
    add(ell(m(s, [AX, 0.33, 0.0]), [0.042, 0.095, 0.045], { bone: 'arm' + b, k: 0.05, g }));
    add(ell(m(s, [AX, 0.15, -0.004]), [0.036, 0.038, 0.038], { bone: 'fore' + b, k: 0.04, g })); // elbow
    add(rc(m(s, [AX, 0.152, 0]), m(s, [AX, -0.105, 0]), 0.036, 0.027, { bone: 'fore' + b, k: 0.04, g }));
    add(ell(m(s, [AX, 0.075, 0.0]), [0.038, 0.085, 0.04], { bone: 'fore' + b, k: 0.05, g })); // forearm muscle
    add(rc(m(s, [AX, -0.06, 0]), m(s, [AX, -0.118, 0]), 0.032, 0.033, { bone: 'hand' + b, k: 0.02, g })); // cuff
  }

  // ---- legs (vertical, like the bones)
  const LX = 0.095;
  for (const s of SIDES) {
    const b = side(s);
    const g = s > 0 ? 1 : 2;
    add(rc(m(s, [LX, -0.03, 0.0]), m(s, [LX, -0.43, 0.004]), 0.103, 0.058, { bone: 'hip' + b, k: 0.07, g }));
    add(ell(m(s, [LX + 0.004, -0.19, 0.02]), [0.074, 0.17, 0.078], { bone: 'hip' + b, k: 0.06, g }));
    add(ell(m(s, [LX - 0.002, -0.17, -0.035]), [0.074, 0.16, 0.074], { bone: 'hip' + b, k: 0.06, g }));
    add(ell(m(s, [LX, -0.435, 0.004]), [0.052, 0.055, 0.056], { bone: 'knee' + b, k: 0.05, g })); // knee
    add(rc(m(s, [LX, -0.45, 0]), m(s, [LX, -0.76, 0]), 0.05, 0.036, { bone: 'knee' + b, k: 0.05, g }));
    add(ell(m(s, [LX, -0.55, -0.022]), [0.05, 0.11, 0.056], { bone: 'knee' + b, k: 0.05, g })); // calf
    add(rc(m(s, [LX, -0.67, 0]), m(s, [LX, -0.79, 0]), 0.052, 0.063, { bone: 'knee' + b, k: 0.02, sz: 1.08, g })); // jeans hem over the boot
    // boot: shaft, ankle, vamp, toe, heel
    add(rc(m(s, [LX, -0.6, 0]), m(s, [LX, -0.84, -0.006]), 0.047, 0.045, { bone: 'foot' + b, k: 0.03, g }));
    add(ell(m(s, [LX, -0.86, -0.006]), [0.046, 0.05, 0.056], { bone: 'foot' + b, k: 0.04, g }));
    add(ell(m(s, [LX, -0.878, 0.062]), [0.043, 0.04, 0.095], { bone: 'foot' + b, k: 0.04, g }));
    add(rc(m(s, [LX, -0.902, 0.03]), m(s, [LX, -0.906, 0.15]), 0.034, 0.025, { bone: 'foot' + b, k: 0.03, sx: 1.12, g }));
    add(ell(m(s, [LX, -0.906, 0.175]), [0.027, 0.024, 0.055], { bone: 'foot' + b, k: 0.03, g }));
    add(ell(m(s, [LX, -0.91, -0.056]), [0.039, 0.026, 0.04], { bone: 'foot' + b, k: 0.03, g }));
  }
  return P;
}

export const BODY_BOUNDS = { min: [-0.36, -0.95, -0.2], max: [0.36, 0.6, 0.3] };

// ---------------------------------------------------------------------------------------------
// Head, written in head-local coordinates (origin = skull base joint, +z = face) and moved into rest-pose space.
const HJ = J.head;
const H = (x, y, z) => [x + HJ[0], y + HJ[1], z + HJ[2]];

export function headPrims() {
  const P = [];
  const add = (p) => P.push(p);
  const E = (c, r, o = {}) => add(ell(H(...c), r, { bone: 'head', ...o }));
  const R = (a, b, ra, rb, o = {}) => add(rc(H(...a), H(...b), ra, rb, { bone: 'head', ...o }));
  const S = (c, r, o = {}) => add(sub(H(...c), r, { bone: 'head', ...o }));

  // skull
  E([0, 0.095, -0.012], [0.074, 0.083, 0.098], { k: 0.04 });
  E([0, 0.058, -0.045], [0.066, 0.066, 0.06], { k: 0.05 });
  E([0, 0.085, 0.048], [0.062, 0.05, 0.042], { k: 0.05 });
  // midface: tapers from the cheekbones to the chin
  E([0, 0.02, 0.034], [0.057, 0.056, 0.05], { k: 0.05 });
  for (const s of SIDES) {
    E([s * 0.05, 0.042, 0.048], [0.021, 0.019, 0.024], { k: 0.03 }); // cheekbone
    E([s * 0.032, 0.0, 0.058], [0.022, 0.024, 0.024], { k: 0.04 }); // cheek
    R([s * 0.018, 0.087, 0.084], [s * 0.054, 0.083, 0.06], 0.007, 0.0075, { k: 0.02 }); // brow ridge
  }
  // nose: slim bridge, soft tip, small wings
  R([0, 0.066, 0.085], [0, 0.016, 0.106], 0.0075, 0.0105, { k: 0.03, sx: 0.9 });
  E([0, 0.012, 0.113], [0.0095, 0.0088, 0.011], { k: 0.02 });
  for (const s of SIDES) E([s * 0.0135, 0.007, 0.1], [0.0075, 0.0075, 0.009], { k: 0.02 });
  for (const s of SIDES) S([s * 0.0095, 0.0045, 0.1085], [0.0034, 0.0026, 0.0045], { k: 0.008 });
  // upper lip area fills the dent between nose and mouth
  E([0, -0.004, 0.078], [0.027, 0.02, 0.028], { k: 0.03 });
  // mouth: full soft lips, a fine line between them
  E([0, -0.0105, 0.09], [0.024, 0.0105, 0.013], { k: 0.02 });
  E([0, -0.0315, 0.088], [0.021, 0.009, 0.012], { k: 0.02 });
  E([0, -0.05, 0.07], [0.021, 0.02, 0.026], { k: 0.03 }); // chin
  // jaw: a clear mandible line from the angle to the chin, narrower than the cheekbones
  for (const s of SIDES) {
    R([s * 0.05, 0.014, -0.024], [s * 0.013, -0.05, 0.056], 0.022, 0.017, { k: 0.035 });
    E([s * 0.05, -0.01, -0.024], [0.015, 0.022, 0.028], { k: 0.04 });
  }
  // eyes: almond sockets (the eyeballs sit inside), lid folds
  for (const s of SIDES) {
    S([s * 0.031, 0.062, 0.081], [0.0185, 0.0112, 0.016], { k: 0.012, rot: [0, 0, s * 0.12] });
    E([s * 0.031, 0.0735, 0.083], [0.021, 0.0055, 0.01], { k: 0.01 });
    E([s * 0.03, 0.0505, 0.083], [0.017, 0.0045, 0.009], { k: 0.01 });
  }
  // ears
  for (const s of SIDES) {
    E([s * 0.075, 0.046, -0.012], [0.0065, 0.031, 0.019], { k: 0.015, rot: [0, s * 0.3, 0] });
    E([s * 0.073, 0.017, -0.007], [0.006, 0.01, 0.01], { k: 0.015 });
    S([s * 0.078, 0.044, -0.008], [0.0045, 0.014, 0.008], { k: 0.01 });
  }
  // neck, set back from the jaw (a hair wider than the body's stump so it always covers it)
  add(rc(H(0, -0.2, -0.016), H(0, -0.035, -0.008), 0.05, 0.047, { bone: 'neck', k: 0.05, sx: 0.92 }));
  add(rc(H(0, -0.06, -0.01), H(0, 0.0, -0.005), 0.046, 0.043, { bone: 'head', k: 0.05, sx: 0.92 }));
  return P;
}

export const HEAD_BOUNDS = { min: [-0.11, HJ[1] - 0.19, HJ[2] - 0.16], max: [0.11, HJ[1] + 0.21, HJ[2] + 0.16] };

// ---------------------------------------------------------------------------------------------
// Left hand hanging at the side, palm facing -x, thumb forward (+z). The wrist reaches into the sleeve.
export function handPrims() {
  const P = [];
  const add = (p) => P.push(p);
  const X = 0.215;
  add(rc([X, -0.07, 0], [X, -0.128, 0], 0.028, 0.027, { bone: 'handL', k: 0.03, sx: 0.8 })); // wrist
  add(ell([X, -0.165, 0.0], [0.016, 0.05, 0.036], { bone: 'handL', k: 0.03 })); // palm
  add(ell([X - 0.006, -0.148, 0.024], [0.015, 0.03, 0.018], { bone: 'handL', k: 0.03 })); // thumb muscle
  add(ell([X + 0.004, -0.185, 0.0], [0.011, 0.034, 0.034], { bone: 'handL', k: 0.03 })); // back of the hand
  // fingers: index, middle, ring, little
  const F = [[0.028, 1.0], [0.0095, 1.08], [-0.0095, 1.0], [-0.027, 0.8]];
  for (const [z, ls] of F) {
    const y0 = -0.21;
    const y1 = -0.254;
    const yEnd = y0 - 0.085 * ls;
    add(rc([X, y0 + 0.005, z], [X, y1, z], 0.0088, 0.0082, { bone: 'fingL', k: 0.012 }));
    add(rc([X, y1, z], [X, yEnd + 0.004, z], 0.0082, 0.0072, { bone: 'tipL', k: 0.012 }));
    add(ell([X, yEnd, z], [0.0072, 0.007, 0.0072], { bone: 'tipL', k: 0.01 }));
  }
  // thumb
  add(rc([X - 0.012, -0.14, 0.022], [X - 0.017, -0.19, 0.046], 0.0125, 0.0108, { bone: 'thumbL', k: 0.015 }));
  add(rc([X - 0.017, -0.19, 0.046], [X - 0.022, -0.225, 0.05], 0.0108, 0.0085, { bone: 'thumbL', k: 0.015 }));
  add(ell([X - 0.022, -0.229, 0.05], [0.0085, 0.008, 0.0085], { bone: 'thumbL', k: 0.01 }));
  return P;
}

export const HAND_BOUNDS = { min: [0.16, -0.32, -0.07], max: [0.27, -0.06, 0.095] };
