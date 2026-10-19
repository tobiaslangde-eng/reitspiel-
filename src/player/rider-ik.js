// Two-bone inverse kinematics for the rider's arms and legs.
// Bones hang along local -y in the rest pose and bend about their local x axis (see skeleton.js).
import * as THREE from 'three';

const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const _dir = new THREE.Vector3(), _k = new THREE.Vector3(), _e = new THREE.Vector3();
const _dp = new THREE.Vector3(), _dc = new THREE.Vector3(), _n = new THREE.Vector3(), _pp = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();

// upper: thigh / upper arm, lower: shin / forearm, end: foot / hand bone. Target and pole are world positions.
// lateral: world direction of the character's +x (to keep the hinge axis from flipping).
// blend 0..1 fades the IK pose in over the current pose.
export function solveLimb(upper, lower, end, target, pole, lateral, blend = 1) {
  upper.getWorldPosition(_p0);
  lower.getWorldPosition(_p1);
  end.getWorldPosition(_p2);
  const L1 = _p0.distanceTo(_p1), L2 = _p1.distanceTo(_p2);
  _dir.subVectors(target, _p0);
  const dist = _dir.length();
  if (dist < 1e-4) return;
  _dir.divideScalar(dist);
  const D = Math.min(Math.max(dist, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const along = (L1 * L1 + D * D - L2 * L2) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  _pp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_pp.lengthSq() < 1e-6) _pp.set(0, 0, 1);
  _pp.normalize();
  _k.copy(_p0).addScaledVector(_dir, along).addScaledVector(_pp, h);
  _e.copy(_p0).addScaledVector(_dir, D);
  _dp.subVectors(_k, _p0).normalize();
  _dc.subVectors(_e, _k).normalize();
  const cosT = Math.min(1, Math.max(-1, _dp.dot(_dc)));
  let theta = Math.acos(cosT);
  _n.crossVectors(_dp, _dc);
  if (_n.lengthSq() < 1e-8) _n.crossVectors(_dp, _pp);
  _n.normalize();
  if (_n.dot(lateral) < 0) { _n.negate(); theta = -theta; }
  // world basis of the upper bone: x = hinge axis, y = -direction, z = x cross y
  _x.copy(_n);
  _y.copy(_dp).negate();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  upper.parent.getWorldQuaternion(_pq).invert();
  _q.premultiply(_pq);
  if (blend >= 1) upper.quaternion.copy(_q); else upper.quaternion.slerp(_q, blend);
  const lx = blend >= 1 ? theta : lower.rotation.x + (theta - lower.rotation.x) * blend;
  lower.rotation.set(lx, 0, 0);
  return theta;
}
