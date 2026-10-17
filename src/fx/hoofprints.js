import * as THREE from 'three';
import { canvasTexture } from '../core/utils.js';
import { normalAt } from '../world/terrain.js';

// Ring buffer of hoof print decals laid flat on the terrain; they fade over time.
export class Hoofprints {
  constructor(scene, capacity = 600) {
    this.cap = capacity;
    const tex = canvasTexture(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(40,28,18,0.9)';
      g.beginPath(); g.ellipse(32, 34, 20, 24, 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(32, 18); g.lineTo(24, 58); g.lineTo(40, 58); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(32, 36, 11, 14, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
    });
    const geo = new THREE.PlaneGeometry(0.22, 0.26);
    geo.rotateX(-Math.PI / 2);
    const birth = new Float32Array(capacity).fill(-1000);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birth, 1));
    this.birth = birth;
    this.uniforms = { uTime: { value: 0 }, uLife: { value: 90 } };
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBirth; uniform float uTime; uniform float uLife; varying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = 1.0 - clamp((uTime - aBirth)/uLife, 0.0, 1.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade * 0.75;');
    };
    this.mesh = new THREE.InstancedMesh(geo, m, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, zero);
    scene.add(this.mesh);
    this.head = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._n = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  add(x, y, z, heading, time, scale = 1) {
    const i = this.head; this.head = (this.head + 1) % this.cap;
    normalAt(x, z, this._n);
    this._q.setFromUnitVectors(this._up, this._n);
    this._q2.setFromAxisAngle(this._up, heading);
    this._q.multiply(this._q2);
    this._m.compose(new THREE.Vector3(x, y + 0.03, z), this._q, new THREE.Vector3(scale, 1, scale));
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.birth[i] = time;
    this.mesh.geometry.attributes.aBirth.needsUpdate = true;
  }

  update(time) { this.uniforms.uTime.value = time; }
}
