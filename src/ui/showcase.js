import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from '../world/sky.js';
import { fence } from '../world/props.js';
import { leafyFoliage, pineFoliage, leafTexture, needleTexture } from '../world/vegetation.js';
import { canvasTexture } from '../core/utils.js';
import { mulberry32 } from '../core/noise.js';
import { Horse } from '../horse/horse.js';
import { Tack } from '../horse/tack.js';
import { GradeShader } from '../fx/grade.js';
import { isTouchDevice } from './touch.js';

function grassTexture() {
  const rnd = mulberry32(5);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#4f7f2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      const v = rnd();
      g.strokeStyle = `rgba(${60 + v * 90},${110 + v * 90},${30 + v * 40},0.55)`;
      const x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6); g.stroke();
    }
  }, { repeat: true });
}

function bladeTuft() {
  const pos = [], col = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
    const h = 0.35 + (k % 3) * 0.12, lean = 0.08;
    pos.push(ox - 0.025, 0, oz, ox + 0.025, 0, oz, ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean);
    col.push(0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  return g;
}

// Main-menu backdrop: the chosen horse standing in a sunny paddock.
export class Showcase {
  constructor(canvas) {
    this.canvas = canvas;
    const mobile = isTouchDevice();
    const r = new THREE.WebGLRenderer({ canvas, antialias: mobile, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0xb8cde0, 70, 260);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 3000);
    this.sky = new Sky(scene);
    this.sky.sun.shadow.mapSize.set(2048, 2048);
    this.sky.setShadowRange(8);
    this.weather = { cloud: 0.1, storm: 0, dust: 0, fog: 0, rain: 0, snow: 0, wind: 0.3 };
    this.sky.update(15.8, 1, this.weather, new THREE.Vector3(), 0, 0);
    scene.fog.color.copy(this.sky.fogColor);
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(this.sky.envScene, 0, 0.1, 500).texture;
    scene.environmentIntensity = 0.7;

    // ground
    const gt = grassTexture(); gt.repeat.set(60, 60);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0xb8d090 }));
    ground.receiveShadow = true;
    scene.add(ground);
    // dense grass around the horse
    const rnd = mulberry32(11);
    const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, color: 0x7fb048 });
    const N = mobile ? 3500 : 9000;
    const grass = new THREE.InstancedMesh(bladeTuft(), tuftMat, N);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.6) * 28;
      d.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr - 4);
      d.rotation.y = rnd() * 6; d.scale.set(0.8 + rnd() * 0.6, 0.35 + rnd() * 0.45, 0.8 + rnd() * 0.6);
      d.updateMatrix(); grass.setMatrixAt(i, d.matrix);
      grass.setColorAt(i, c.setHSL(0.24 + rnd() * 0.05, 0.55, 0.38 + rnd() * 0.15));
    }
    grass.receiveShadow = true;
    scene.add(grass);
    // flowers
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }), 500);
    const fcols = [0xfff2a0, 0xffffff, 0xf0a0d0, 0xc0a0ff];
    for (let i = 0; i < 500; i++) {
      d.position.set((rnd() - 0.5) * 40, 0.3 + rnd() * 0.15, (rnd() - 0.5) * 30 - 6); d.scale.setScalar(1); d.updateMatrix();
      fl.setMatrixAt(i, d.matrix); fl.setColorAt(i, c.setHex(fcols[i % 4]));
    }
    scene.add(fl);
    // white paddock fence
    const fpts = [];
    for (let i = 0; i <= 12; i++) fpts.push([-30 + i * 5, 0, -9 - Math.sin(i * 0.4) * 0.6]);
    scene.add(fence(fpts, { white: true, height: 1.35, rails: 3 }));
    // trees
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: needleTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
    const leafGeo = leafyFoliage(7), pineGeo = pineFoliage(4);
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 6, 8).translate(0, 3, 0);
    const trees = [[-22, -24, 'l', 1.3], [-12, -30, 'l', 1.1], [4, -34, 'p', 1.2], [14, -27, 'l', 1.4], [26, -31, 'p', 1.3], [34, -22, 'l', 1.2], [-34, -18, 'p', 1.1], [-40, -36, 'l', 1.5], [44, -40, 'p', 1.4], [0, -48, 'l', 1.6], [-26, -50, 'p', 1.5], [22, -52, 'l', 1.5]];
    trees.forEach(([x, z, kind, s], i) => {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.castShadow = true; t.add(tr);
      const f = new THREE.Mesh(kind === 'l' ? leafGeo : pineGeo, kind === 'l' ? leafMat : pineMat);
      f.material = f.material.clone();
      f.material.color = new THREE.Color(kind === 'l' ? (i % 3 === 0 ? 0xe2a84a : 0x7cb24a) : 0x4d7a3c);
      f.castShadow = true; t.add(f);
      t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = i;
      scene.add(t);
    });
    // distant hills
    const hills = new THREE.Mesh(new THREE.CylinderGeometry(180, 180, 1, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fb7c8, side: THREE.BackSide, fog: true }));
    const hp = hills.geometry.attributes.position;
    for (let i = 0; i < hp.count; i++) if (hp.getY(i) > 0) hp.setY(i, 14 + Math.sin(i * 0.37) * 6 + Math.sin(i * 0.11) * 9);
    scene.add(hills);

    // fake game context so the real Horse class (animation, tack) can be reused
    this.ctx = { scene, camera: this.camera, weather: null, lodDistance: 999, colliders: { resolve: () => null } };
    this.ctx.tack = new Tack(this.ctx);
    this.horse = null;
    this.t = 0;

    if (!mobile) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const comp = new EffectComposer(r, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
      comp.addPass(new RenderPass(scene, this.camera));
      comp.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.6, 0.92));
      comp.addPass(new OutputPass());
      this.grade = new ShaderPass(GradeShader);
      comp.addPass(this.grade);
      this.composer = comp;
    }
    this.resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.composer) this.composer.setSize(w, h);
    };
    window.addEventListener('resize', this.resize);
    this.resize();
    this.clock = new THREE.Clock();
    this.running = true;
    r.setAnimationLoop(() => this.frame());
  }

  setHorse(data) {
    if (this.horse) { this.ctx.tack.removeReins(this.horse); this.horse.dispose(); }
    const h = new Horse(this.ctx, data);
    h.rig.root.position.set(0, 0, 0);
    h.pos.set(0, 0, 0);
    h.heading = -0.55;
    h.rig.root.rotation.y = h.heading;
    this.horse = h;
    this.focusY = 1.2 * h.scale;
  }

  frame() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    if (this.horse) {
      this.horse.time += dt;
      this.horse.animate(dt);
      this.ctx.tack.updateReins(this.horse);
    }
    // slow cinematic drift
    const a = 0.25 + Math.sin(this.t * 0.08) * 0.18;
    const wide = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight) > 1.6;
    const dist = wide ? 6.8 : 7.8;
    const fy = this.focusY || 1.2;
    const off = wide ? 0.7 : 0;
    this.camera.position.set(Math.sin(a) * dist + off, fy + 0.15 + Math.sin(this.t * 0.11) * 0.08, Math.cos(a) * dist);
    this.camera.lookAt(off, fy - 0.15, 0);
    this.sky.uniforms.uTime.value = this.t;
    this.sky.mesh.position.copy(this.camera.position);
    if (this.grade) this.grade.uniforms.uTime.value = this.t;
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    if (this.horse) this.horse.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

