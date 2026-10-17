import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/utils.js';
import { heightAt } from '../world/terrain.js';

// Orbiting third-person camera that drifts back behind the target while moving.
export class FollowCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 7.5;
    this.targetDist = 7.5;
    this.focus = new THREE.Vector3();
    this.free = false; // photo mode
    this.freePos = new THREE.Vector3();
    this.freeYaw = 0;
    this.freePitch = 0;
    this.sensitivity = 0.0035;
    this.shake = 0;
  }

  update(dt, target, heading, moving, height = 1.6) {
    const inp = this.input;
    if (this.free) return this.updateFree(dt);
    this.yaw -= inp.mouseDX * this.sensitivity;
    this.pitch = clamp(this.pitch + inp.mouseDY * this.sensitivity, -0.35, 1.25);
    if (inp.wheel) this.targetDist = clamp(this.targetDist + inp.wheel * 0.8, 2.5, 18);
    this.dist = damp(this.dist, this.targetDist, 6, dt);
    const idle = performance.now() - inp.lastMouseMove > 1800;
    if (moving && idle) this.yaw = dampAngle(this.yaw, heading + Math.PI, 1.6, dt);

    this.focus.x = damp(this.focus.x, target.x, 14, dt);
    this.focus.z = damp(this.focus.z, target.z, 14, dt);
    this.focus.y = damp(this.focus.y, target.y + height, 8, dt);
    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist);
    const pos = this.focus.clone().add(off);
    // keep above terrain
    const g = Math.max(heightAt(pos.x, pos.z), 0.2);
    if (pos.y < g + 0.6) pos.y = g + 0.6;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      pos.x += (Math.random() - 0.5) * this.shake * 0.3;
      pos.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.focus);
  }

  enterFree() {
    this.free = true;
    this.freePos.copy(this.camera.position);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.freeYaw = Math.atan2(-dir.x, -dir.z);
    this.freePitch = Math.asin(clamp(dir.y, -1, 1));
  }

  exitFree() { this.free = false; }

  updateFree(dt) {
    const inp = this.input;
    this.freeYaw -= inp.mouseDX * this.sensitivity;
    this.freePitch = clamp(this.freePitch - inp.mouseDY * this.sensitivity, -1.4, 1.4);
    const fwd = new THREE.Vector3(-Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), -Math.cos(this.freeYaw) * Math.cos(this.freePitch));
    const right = new THREE.Vector3(Math.cos(this.freeYaw), 0, -Math.sin(this.freeYaw));
    const sp = (inp.isDown('ShiftLeft') ? 14 : 5) * dt;
    if (inp.isDown('KeyW')) this.freePos.addScaledVector(fwd, sp);
    if (inp.isDown('KeyS')) this.freePos.addScaledVector(fwd, -sp);
    if (inp.isDown('KeyA')) this.freePos.addScaledVector(right, -sp);
    if (inp.isDown('KeyD')) this.freePos.addScaledVector(right, sp);
    if (inp.isDown('KeyE') || inp.isDown('Space')) this.freePos.y += sp;
    if (inp.isDown('KeyQ') || inp.isDown('KeyC')) this.freePos.y -= sp;
    const g = heightAt(this.freePos.x, this.freePos.z);
    this.freePos.y = Math.max(this.freePos.y, g + 0.3);
    this.camera.position.copy(this.freePos);
    this.camera.lookAt(this.freePos.clone().add(fwd));
  }
}
