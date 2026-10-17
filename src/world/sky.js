import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { lerp, smoothstep } from '../core/utils.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES = { spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
export const DAYS_PER_SEASON = 5;
// One in-game hour = 40 real seconds -> a day lasts 16 minutes.
export const SECONDS_PER_HOUR = 40;

const C = (r, g, b) => new THREE.Color(r, g, b);
const DAY_ZENITH = C(0.16, 0.38, 0.78), DAY_HORIZON = C(0.62, 0.77, 0.93);
const SET_ZENITH = C(0.22, 0.24, 0.48), SET_HORIZON = C(1.0, 0.48, 0.2);
const NIGHT_ZENITH = C(0.008, 0.012, 0.035), NIGHT_HORIZON = C(0.035, 0.05, 0.1);
const STORM = C(0.28, 0.3, 0.34);

const skyVert = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // keep at far plane
}`;

const skyFrag = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunColor;
uniform float uNight; uniform float uSunset; uniform float uTime;
uniform float uCloud; uniform float uStorm; uniform float uFlash;
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 dir = normalize(vDir);
  float el = dir.y;
  float t = pow(clamp(1.0 - max(el,0.0), 0.0, 1.0), 3.0);
  vec3 col = mix(uZenith, uHorizon, t);
  if (el < 0.0) col = mix(uHorizon, uHorizon*0.7, clamp(-el*4.0,0.0,1.0));

  float sd = max(dot(dir, uSunDir), 0.0);
  // Sunset glow wraps around the sun along the horizon
  float glow = pow(sd, 6.0) * uSunset * (1.0 - smoothstep(0.0, 0.5, el));
  col += vec3(1.0, 0.42, 0.15) * glow * 0.9;
  col += uSunColor * pow(sd, 64.0) * 0.6 * (1.0-uCloud*0.8);
  float disc = smoothstep(0.99955, 0.9998, sd);
  col += uSunColor * disc * 25.0 * (1.0 - uCloud*0.95);

  // Stars
  if (uNight > 0.01) {
    vec3 sp = dir * 220.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    vec3 f = fract(sp) - 0.5;
    float star = step(0.985, h) * smoothstep(0.18, 0.0, length(f)) ;
    float tw = 0.6 + 0.4*sin(uTime*3.0 + h*90.0);
    float milky = smoothstep(0.35, 0.0, abs(dot(dir, normalize(vec3(0.4,0.6,-0.7))))) * fbm3(dir*7.0);
    col += (vec3(star*tw*(0.6+h*2.0)) + vec3(0.25,0.25,0.4)*milky*0.25) * uNight * smoothstep(-0.05, 0.15, el) * (1.0-uCloud);
    // Moon
    float md = dot(dir, uMoonDir);
    float moon = smoothstep(0.9993, 0.9996, md);
    float crater = fbm3(dir*400.0);
    col += vec3(0.95,0.93,0.85) * moon * (0.75 + crater*0.4) * 1.6 * (1.0-uCloud*0.9);
    col += vec3(0.25,0.3,0.45) * pow(max(md,0.0), 400.0) * 0.6 * uNight;
  }

  // Clouds on a virtual plane
  if (el > -0.02) {
    vec2 uv = dir.xz / (el + 0.12) * 1.6;
    vec2 wind = vec2(uTime*0.006, uTime*0.0025);
    float n = fbm3(vec3(uv*0.9 + wind, uTime*0.004));
    float n2 = fbm3(vec3(uv*3.0 + wind*2.0, 1.7));
    float cov = mix(0.62, 0.2, uCloud);
    float cl = smoothstep(cov, cov + 0.22, n*0.8 + n2*0.3);
    float fade = smoothstep(-0.02, 0.25, el);
    float light = mix(1.0, 0.6, n2);
    vec3 cloudDay = mix(vec3(1.0), vec3(0.55,0.57,0.62), uStorm);
    vec3 cloudCol = mix(cloudDay * light, vec3(1.0,0.55,0.35)*light + vec3(0.2,0.1,0.15), uSunset*0.85);
    cloudCol = mix(cloudCol, vec3(0.05,0.06,0.09) + vec3(0.04)*n2, uNight);
    cloudCol += vec3(1.0,0.75,0.5) * pow(sd, 8.0) * (1.0-uNight) * 0.6 * (1.0-cl*0.5);
    col = mix(col, cloudCol, cl * fade * (0.85 + uStorm*0.15));
  }
  col = mix(col, vec3(0.85,0.88,1.0), uFlash * 0.7);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenith: { value: DAY_ZENITH.clone() },
      uHorizon: { value: DAY_HORIZON.clone() },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uNight: { value: 0 },
      uSunset: { value: 0 },
      uTime: { value: 0 },
      uCloud: { value: 0.2 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.material));

    // Lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 70;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 500 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a3e, 0.9);
    scene.add(this.hemi);

    this.fogColor = new THREE.Color();
    this.sunDir = new THREE.Vector3();
    this.isNight = false;
    this.darkness = 0;
  }

  setShadowQuality(q) {
    const size = q === 'low' ? 1024 : q === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  // hour: 0..24, season index affects sun height
  update(hour, seasonIdx, weather, focus, timeSec, flash) {
    const maxEl = [0.95, 1.1, 0.85, 0.65][seasonIdx] ?? 0.9;
    const th = ((hour - 6) / 24) * Math.PI * 2;
    const sy = Math.sin(th);
    const sun = this.sunDir.set(-Math.cos(th), sy * Math.sin(maxEl) - 0.04, 0.45 * sy * Math.cos(maxEl) + 0.25).normalize();
    const moon = new THREE.Vector3(-sun.x * 0.9, -sun.y, -sun.z + 0.3).normalize();
    const u = this.uniforms;
    u.uSunDir.value.copy(sun);
    u.uMoonDir.value.copy(moon);
    u.uTime.value = timeSec;

    const h = sun.y;
    const day = smoothstep(-0.12, 0.2, h);
    const sunset = 1 - smoothstep(0.0, 0.32, Math.abs(h - 0.03));
    const night = 1 - smoothstep(-0.22, -0.02, h);
    this.isNight = night > 0.5;
    this.darkness = night;

    const zen = new THREE.Color().copy(NIGHT_ZENITH).lerp(DAY_ZENITH, day).lerp(SET_ZENITH, sunset * 0.6 * day);
    const hor = new THREE.Color().copy(NIGHT_HORIZON).lerp(DAY_HORIZON, day).lerp(SET_HORIZON, sunset * 0.85);
    const storm = weather.storm;
    zen.lerp(STORM.clone().multiplyScalar(0.25 + day * 0.75), weather.cloud * 0.75);
    hor.lerp(STORM.clone().multiplyScalar(0.3 + day * 0.9), weather.cloud * 0.6);
    // fog tint
    if (weather.dust > 0) hor.lerp(new THREE.Color(0.78, 0.6, 0.42).multiplyScalar(0.2 + day * 0.8), weather.dust * 0.8);
    if (weather.fog > 0) hor.lerp(new THREE.Color(0.78, 0.8, 0.84).multiplyScalar(0.15 + day * 0.85), weather.fog * 0.7);

    u.uZenith.value.copy(zen);
    u.uHorizon.value.copy(hor);
    u.uNight.value = night;
    u.uSunset.value = sunset;
    u.uCloud.value = weather.cloud;
    u.uStorm.value = storm;
    u.uFlash.value = flash;

    const sunCol = new THREE.Color(1, 0.96, 0.88).lerp(new THREE.Color(1, 0.55, 0.25), sunset);
    u.uSunColor.value.copy(sunCol);

    this.fogColor.copy(hor).lerp(zen, 0.15);

    // Light: sun by day, moon by night
    const lightDir = h > -0.05 ? sun : moon;
    const cloudDim = 1 - weather.cloud * 0.65;
    if (h > -0.05) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 3.2 * smoothstep(-0.05, 0.15, h) * cloudDim;
    } else {
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      this.sun.intensity = 0.45 * smoothstep(-0.0, 0.3, moon.y) * cloudDim;
    }
    this.sun.intensity += flash * 4;
    this.hemi.intensity = lerp(0.12, 1.05, day) * (1 - weather.cloud * 0.25) + flash * 2;
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(0.42, 0.34, 0.24).multiplyScalar(0.3 + day * 0.7);

    this.sun.position.copy(focus).addScaledVector(lightDir, 200);
    this.sun.target.position.copy(focus);
    // Snap shadow camera to texel grid to avoid shimmering
    this.sun.target.updateMatrixWorld();
    this.mesh.position.copy(focus);
    return { day, night, sunset };
  }
}
