import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { RIVER, POOL, SHELF, SHELF_WATER } from './terrain.js';

const waterVert = /* glsl */`
varying vec3 vWPos; varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFrag = /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon;
uniform float uNight; uniform float uRain; uniform float uFlow; uniform float uIce;
varying vec3 vWPos; varying vec2 vUv;
${GLSL_NOISE}
#include <fog_pars_fragment>
float hgt(vec2 p){
  vec2 flow = vec2(0.0, uTime*uFlow);
  return fbm3(vec3(p*0.55 + flow*0.6, uTime*0.15)) + 0.5*vnoise(vec3(p*2.2 + flow*1.4, uTime*0.4));
}
void main(){
  vec2 p = vec2(vUv.x*6.0, vUv.y);
  if (uFlow == 0.0) p = vWPos.xz*0.25;
  float e = 0.05;
  float h0 = hgt(p);
  float hx = hgt(p+vec2(e,0.0));
  float hz = hgt(p+vec2(0.0,e));
  vec3 n = normalize(vec3((h0-hx)*1.4, 1.0, (h0-hz)*1.4));
  // rain ripples
  if (uRain > 0.0){
    vec2 cell = floor(vWPos.xz*1.5); vec2 f = fract(vWPos.xz*1.5)-0.5;
    float r = hash13(vec3(cell, floor(uTime*2.0)));
    float ph = fract(uTime*2.0);
    float ring = sin(length(f)*30.0 - ph*12.0) * smoothstep(0.5,0.0,length(f)) * (1.0-ph) * step(0.6, r);
    n.xz += ring * uRain * 0.25;
    n = normalize(n);
  }
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, V),0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uZenith, clamp(R.y*1.5,0.0,1.0));
  vec3 deep = mix(vec3(0.03,0.13,0.15), vec3(0.06,0.2,0.18), h0);
  deep *= mix(1.0, 0.15, uNight);
  vec3 col = mix(deep, sky, clamp(fres,0.0,1.0));
  float spec = pow(max(dot(R, uSunDir),0.0), 220.0) * 6.0;
  col += uSunColor * spec * (1.0-uNight*0.7);
  // foam streaks
  float foam = smoothstep(0.72, 0.9, fbm3(vec3(p*1.5 + vec2(0.0,uTime*uFlow*1.5), uTime*0.2)));
  col = mix(col, vec3(0.85,0.9,0.92)*(1.0-uNight*0.8), foam*0.35);
  col = mix(col, vec3(0.82,0.88,0.94)*(1.0-uNight*0.7), uIce*0.85);
  gl_FragColor = vec4(col, mix(0.82, 0.97, fres));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const fallFrag = /* glsl */`
uniform float uTime; uniform float uNight;
varying vec2 vUv; varying vec3 vWPos;
${GLSL_NOISE}
#include <fog_pars_fragment>
void main(){
  float n = fbm3(vec3(vUv.x*14.0, vUv.y*3.0 + uTime*2.4, uTime*0.3));
  float streak = smoothstep(0.35, 0.75, n);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float bottom = smoothstep(0.0, 0.15, vUv.y);
  vec3 col = mix(vec3(0.55,0.7,0.75), vec3(0.97), streak) * (1.0 - uNight*0.8);
  gl_FragColor = vec4(col, (0.55 + streak*0.45) * edge);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), (1.0-bottom)*0.6);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uNight: { value: 0 }, uRain: { value: 0 },
      uFlow: { value: 0.35 }, uIce: { value: 0 },
    };
    const mkMat = () => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.uniforms]),
      vertexShader: waterVert, fragmentShader: waterFrag, transparent: true, fog: true, depthWrite: true,
    });
    this.riverMat = mkMat();
    this.stillMat = mkMat();
    this.stillMat.uniforms.uFlow.value = 0;

    // River ribbon
    const curve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const N = 360;
    const pts = curve.getSpacedPoints(N);
    const W = 34;
    const pos = [], uvs = [], idx = [];
    let len = 0;
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      const t = curve.getTangentAt(i / N);
      const nx = -t.z, nz = t.x;
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      pos.push(p.x + nx * W, 0, p.z + nz * W, p.x - nx * W, 0, p.z - nz * W);
      uvs.push(0, len * 0.08, 1, len * 0.08);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    this.river = new THREE.Mesh(g, this.riverMat);
    this.river.position.y = -0.02;
    scene.add(this.river);

    const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r + 4, 48).rotateX(-Math.PI / 2), this.stillMat);
    pool.position.set(POOL.x, 0.0, POOL.z);
    scene.add(pool);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(10.5, 40).rotateX(-Math.PI / 2), this.stillMat);
    pond.position.set(SHELF.x, SHELF_WATER, SHELF.z);
    scene.add(pond);

    // Waterfall: from the shelf edge down into the pool.
    const top = SHELF_WATER;
    const fx = SHELF.x, fz = SHELF.z + SHELF.r + 1;
    const fg = new THREE.PlaneGeometry(9, top + 2, 12, 24);
    const fpos = fg.attributes.position;
    for (let i = 0; i < fpos.count; i++) {
      const y = fpos.getY(i) + (top + 2) / 2;
      const k = 1 - y / (top + 2);
      // follow the cliff and bulge outward near the bottom
      fpos.setZ(i, Math.pow(k, 0.5) * 5.5);
      fpos.setY(i, y - 1);
      fpos.setX(i, fpos.getX(i) * (1 + k * 0.35));
    }
    fg.computeVertexNormals();
    const fallMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uNight: { value: 0 } }]),
      vertexShader: waterVert, fragmentShader: fallFrag, transparent: true, fog: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.fallMat = fallMat;
    const fall = new THREE.Mesh(fg, fallMat);
    fall.position.set(fx, 0, fz);
    scene.add(fall);
    this.fallBase = new THREE.Vector3(fx, 0.3, fz + 5);
    this.fallTop = new THREE.Vector3(fx, top, fz);
    this.mats = [this.riverMat, this.stillMat];
  }

  update(time, sky, weather, season) {
    for (const m of this.mats) {
      const u = m.uniforms;
      u.uTime.value = time;
      u.uSunDir.value.copy(sky.uniforms.uSunDir.value);
      u.uSunColor.value.copy(sky.uniforms.uSunColor.value);
      u.uZenith.value.copy(sky.uniforms.uZenith.value);
      u.uHorizon.value.copy(sky.uniforms.uHorizon.value);
      u.uNight.value = sky.uniforms.uNight.value;
      u.uRain.value = weather.rain;
    }
    this.stillMat.uniforms.uIce.value = season === 'winter' ? 0.75 : 0;
    this.fallMat.uniforms.uTime.value = time;
    this.fallMat.uniforms.uNight.value = sky.uniforms.uNight.value;
  }
}
