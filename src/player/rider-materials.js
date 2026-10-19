// Procedural materials for the rider: one shader for the clothed body (skin / shirt / jeans / boots
// are told apart by rest-pose position and skin weights), one for the head and hands, one for the eyes.
// All patterns are evaluated in the bind pose, so they never swim when the body bends.
import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { JOINT } from './skeleton.js';

const HEAD = JOINT.head;

// smoothstep that is also defined for edge0 > edge1
const SS_DEF = /* glsl */`
float ss( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
`;

// bump mapping from a procedural height (screen-space derivatives), same maths as three's bumpmap chunk
const BUMP_PARS = /* glsl */`
${SS_DEF}
vec3 riderBump( vec3 surfPos, vec3 surfNorm, float h, float faceDirection ) {
  vec2 dH = vec2( dFdx( h ), dFdy( h ) );
  vec3 vSigmaX = normalize( dFdx( surfPos ) );
  vec3 vSigmaY = normalize( dFdy( surfPos ) );
  vec3 R1 = cross( vSigmaY, surfNorm );
  vec3 R2 = cross( surfNorm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDirection;
  vec3 vGrad = sign( fDet ) * ( dH.x * R1 + dH.y * R2 );
  return normalize( abs( fDet ) * surfNorm - vGrad );
}
// anti-aliased 50 % pulse wave with period 1
float pulse( float u ) {
  float w = max( fwidth( u ), 1e-4 );
  float v = ss( -w, w, 0.25 - abs( fract( u ) - 0.5 ) );
  return mix( v, 0.5, ss( 0.25, 0.6, w ) );
}
`;

const VERT_PARS = /* glsl */`
attribute float aAO;
varying vec3 vRest; varying vec3 vRN; varying float vAO; varying float vArm; varying float vLeg;
`;

function patchVertex(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvRN = normal;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vRest = position; vAO = aAO;
      vArm = 0.0; vLeg = 0.0;
      for (int k = 0; k < 4; k++) {
        float bi = skinIndex[k], bw = skinWeight[k];
        if (bi > 4.5 && bi < 18.5) vArm += bw;
        if (bi > 18.5) vLeg += bw;
      }`);
}

const FRAG_PARS = /* glsl */`
varying vec3 vRest; varying vec3 vRN; varying float vAO; varying float vArm; varying float vLeg;
${GLSL_NOISE}
${BUMP_PARS}
`;

// ---------------------------------------------------------------------------------------------
// Clothed body
// ---------------------------------------------------------------------------------------------
const BODY_GLSL = /* glsl */`
uniform vec3 uSkin; uniform vec3 uShirt; uniform vec3 uShirtB; uniform float uPlaid;
uniform vec3 uPants; uniform vec3 uBoots;
vec3 plaidColor( vec3 p, vec3 n ) {
  vec3 w = pow( abs( n ), vec3( 4.0 ) );
  w /= ( w.x + w.y + w.z + 1e-4 );
  const float P = 0.045;
  vec3 c = vec3( 0.0 );
  for ( int i = 0; i < 3; i++ ) {
    vec2 uv = i == 0 ? p.xy / P : i == 1 ? p.zy / P : p.xz / P;
    float a = pulse( uv.x ), b = pulse( uv.y );
    vec3 t = mix( uShirt, uShirtB, a * 0.5 );
    t = mix( t, uShirtB, b * 0.5 );
    float pin = pulse( uv.x * 2.0 + 0.5 ) * pulse( uv.y * 2.0 + 0.5 );
    t = mix( t, vec3( 0.9, 0.85, 0.8 ), pin * 0.07 * ( 1.0 - a ) * ( 1.0 - b ) );
    c += t * ( i == 0 ? w.z : i == 1 ? w.x : w.y );
  }
  return c;
}
`;

const BODY_COLOR = /* glsl */`
#include <color_fragment>
{
  vec3 p = vRest, n = normalize( vRN );
  float isBoot = 1.0 - ss( -0.800, -0.786, p.y );
  float armW = ss( 0.35, 0.65, vArm );
  float legW = ss( 0.35, 0.65, vLeg );
  float shirtZ = max( armW, ss( 0.042, 0.056, p.y ) );
  // skin: neck stump and the V of the shirt
  float rN = length( vec2( p.x, p.z + 0.022 ) );
  float neckM = ss( 0.462, 0.475, p.y ) * ( 1.0 - ss( 0.062, 0.074, rN ) );
  float vM = ss( 0.0, 0.012, ( p.y - 0.372 ) - abs( p.x ) * 1.25 ) * ss( 0.0, 0.03, p.z + 0.0 ) * ( 1.0 - ss( 0.05, 0.075, abs( p.x ) ) );
  float skinZ = max( neckM, vM ) * ( 1.0 - armW );
  #ifdef FORCE_SHIRT
  shirtZ = 1.0; skinZ = 0.0; isBoot = 0.0;
  #endif
  float fold = fbm3( p * vec3( 14.0, 5.0, 14.0 ) + 3.0 );
  float weave = vnoise( p * 260.0 );

  vec3 shirt = uPlaid > 0.5 ? plaidColor( p, n ) : uShirt * ( 0.94 + 0.1 * fold );
  shirt *= 0.93 + 0.1 * weave;
  vec3 denim = uPants * ( 0.86 + 0.28 * fbm3( p * vec3( 9.0, 4.0, 9.0 ) ) );
  float fade = ss( 0.55, 0.85, fbm3( p * 6.0 + 7.0 ) );
  denim = mix( denim, denim * 1.4 + vec3( 0.025 ), fade * 0.4 );
  // topstitching along the outer and inner seam
  float seamO = ss( 0.035, 0.0, abs( n.z + 0.0 ) ) * ss( 0.75, 0.92, abs( n.x ) );
  float dash = pulse( p.y * 160.0 );
  denim = mix( denim, vec3( 0.55, 0.38, 0.17 ), seamO * dash * legW * 0.65 );
  vec3 leather = uBoots * ( 0.82 + 0.3 * fbm3( p * vec3( 18.0, 6.0, 18.0 ) ) );
  float sole = ss( -0.912, -0.92, p.y );
  float toeCap = ss( 0.135, 0.14, p.z ) * ( 1.0 - sole );
  leather = mix( leather, leather * 0.7, toeCap * 0.6 );
  leather = mix( leather, vec3( 0.07, 0.05, 0.04 ), sole );
  float bootStitch = pulse( p.y * 120.0 ) * ss( 0.03, 0.0, abs( abs( p.x ) - 0.093 ) - 0.03 ) ;
  leather = mix( leather, leather * 1.4, bootStitch * 0.15 * ss( -0.84, -0.8, p.y ) );

  vec3 col = mix( denim, shirt, shirtZ );
  col = mix( col, leather, isBoot );
  vec3 skin = uSkin * ( 0.95 + 0.08 * fbm3( p * 25.0 ) );
  col = mix( col, skin, skinZ * ( 1.0 - isBoot ) );
  diffuseColor.rgb = col;
  bZShirt = shirtZ * ( 1.0 - skinZ ) * ( 1.0 - isBoot );
  bZBoot = isBoot;
  bZSkin = skinZ * ( 1.0 - isBoot );
  bAO = mix( 0.35, 1.0, vAO );
  bBump = ( ( fold - 0.5 ) * 0.0025 + ( weave - 0.5 ) * 0.0003 ) * ( 1.0 - bZSkin ) + ( fbm3( p * 40.0 ) - 0.5 ) * 0.0003 * bZSkin;
}
`;

function bodyDecls() {
  return 'float bZShirt = 0.0; float bZBoot = 0.0; float bZSkin = 0.0; float bAO = 1.0; float bBump = 0.0;\n';
}

// `shared` lets the collar use the same colours as the body; `forceShirt` paints the whole mesh as shirt cloth.
export function makeBodyMaterial(shared = null, forceShirt = false) {
  const uniforms = shared || {
    uSkin: { value: new THREE.Color(0xe9b595) },
    uShirt: { value: new THREE.Color(0xa83228) },
    uShirtB: { value: new THREE.Color(0x401010) },
    uPlaid: { value: 0 },
    uPants: { value: new THREE.Color(0x2e4468) },
    uBoots: { value: new THREE.Color(0x4a2c18) },
  };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.35, 0.35, 0.35), clearcoat: 0.0, side: forceShirt ? THREE.DoubleSide : THREE.FrontSide });
  if (forceShirt) m.defines = { FORCE_SHIRT: 1 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${BODY_GLSL}`)
      .replace('void main() {', `void main() {\n${bodyDecls()}`)
      .replace('#include <color_fragment>', BODY_COLOR)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( mix( 0.86, 0.42, bZBoot ), 0.55, bZSkin );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = riderBump( -vViewPosition, normal, bBump * 120.0, faceDirection );`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.sheenColor *= bZShirt;
        #ifdef USE_CLEARCOAT
        material.clearcoat = bZBoot * 0.35;
        #endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= bAO; reflectedLight.indirectSpecular *= bAO;
        reflectedLight.directDiffuse *= mix( 0.6, 1.0, bAO );
        totalEmissiveRadiance += bZSkin * vec3( 0.5, 0.12, 0.06 ) * 0.1 * pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 );`);
  };
  m.customProgramCacheKey = () => (forceShirt ? 'riderBodyShirt1' : 'riderBody1');
  m.userData.uniforms = uniforms;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Head and hands
// ---------------------------------------------------------------------------------------------
const SKIN_GLSL = /* glsl */`
uniform vec3 uSkin; uniform vec3 uLip; uniform vec3 uBrow; uniform float uMale;
`;
const SKIN_COLOR = /* glsl */`
#include <color_fragment>
{
  vec3 p = vRest;
  vec3 hp = p - vec3( ${HEAD[0].toFixed(4)}, ${HEAD[1].toFixed(4)}, ${HEAD[2].toFixed(4)} );
  bool isHead = hp.y > -0.2 && p.y > 0.4;
  vec3 col = uSkin * ( 0.95 + 0.09 * fbm3( p * 30.0 ) );
  float lipM = 0.0, lineM = 0.0, eyeM = 0.0, browM = 0.0, cheekM = 0.0;
  if ( isHead ) {
    float sx = abs( hp.x );
    // lips
    vec2 lq = vec2( hp.x / 0.027, ( hp.y + 0.0212 ) / 0.0215 );
    lipM = ( 1.0 - ss( 0.72, 1.0, length( lq ) ) ) * ss( 0.06, 0.085, hp.z );
    lineM = ss( 0.0034, 0.0006, abs( hp.y + 0.0212 ) ) * ( 1.0 - ss( 0.019, 0.026, sx ) ) * ss( 0.07, 0.09, hp.z );
    // eye shadow and liner
    vec2 eq = vec2( ( sx - 0.031 ) / 0.026, ( hp.y - 0.0625 ) / 0.02 );
    eyeM = ( 1.0 - ss( 0.8, 1.5, length( eq ) ) ) * ss( 0.06, 0.085, hp.z );
    // brows
    float bx = ( sx - 0.032 ) / 0.028;
    float byC = 0.092 + 0.008 * ( 1.0 - bx * bx ) - 0.004 * max( 0.0, bx );
    browM = ( 1.0 - ss( 0.55, 1.0, abs( bx ) ) ) * ss( 0.0055, 0.0015, abs( hp.y - byC ) ) * ss( 0.06, 0.085, hp.z );
    // blush
    vec2 cq = vec2( ( sx - 0.044 ) / 0.03, ( hp.y - 0.01 ) / 0.026 );
    cheekM = ( 1.0 - ss( 0.0, 1.0, length( cq ) ) ) * ss( 0.0, 0.05, hp.z );
    col = mix( col, col * vec3( 1.04, 0.84, 0.82 ), cheekM * 0.45 );
    col = mix( col, col * vec3( 0.93, 0.78, 0.8 ), eyeM * 0.55 );
    col = mix( col, uLip, lipM * 0.85 );
    col = mix( col, col * 0.35, lineM );
    col = mix( col, uBrow, browM * 0.9 );
  } else {
    // hands: knuckles and nails are a little darker / pinker
    col *= 1.0 - 0.05 * fbm3( p * vec3( 80.0, 40.0, 80.0 ) );
  }
  diffuseColor.rgb = col;
  bZSkin = 1.0;
  bAO = mix( 0.3, 1.0, vAO );
  bBump = ( fbm3( p * 160.0 ) - 0.5 ) * 0.00025 + ( fbm3( p * 40.0 ) - 0.5 ) * 0.0004;
  bZShirt = lipM;
}
`;

export function makeSkinMaterial() {
  const uniforms = {
    uSkin: { value: new THREE.Color(0xe9b595) },
    uLip: { value: new THREE.Color(0xb8575c) },
    uBrow: { value: new THREE.Color(0x3a2418) },
    uMale: { value: 0 },
  };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.8, 0.7, 0.65), clearcoat: 0.0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${SKIN_GLSL}`)
      .replace('void main() {', `void main() {\n${bodyDecls()}`)
      .replace('#include <color_fragment>', SKIN_COLOR)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( 0.5, 0.32, bZShirt );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = riderBump( -vViewPosition, normal, bBump * 120.0, faceDirection );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= bAO; reflectedLight.indirectSpecular *= bAO;
        reflectedLight.directDiffuse *= mix( 0.55, 1.0, bAO );
        // soft subsurface glow at grazing angles, warm and red
        float sss = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 2.5 );
        totalEmissiveRadiance += vec3( 0.55, 0.13, 0.07 ) * sss * 0.16 * bAO;`);
  };
  m.customProgramCacheKey = () => 'riderSkin1';
  m.userData.uniforms = uniforms;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Eyes: sclera, iris with fibres, pupil, limbal ring. The eyeball is a sphere whose +z pole is the pupil.
// ---------------------------------------------------------------------------------------------
export function makeEyeMaterial() {
  const uniforms = { uIris: { value: new THREE.Color(0x5a3a22) } };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyePos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vEyePos; uniform vec3 uIris;\n${GLSL_NOISE}\n${SS_DEF}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 d = normalize( vEyePos );
          float ang = acos( clamp( d.z, -1.0, 1.0 ) );
          float az = atan( d.y, d.x );
          float irisR = 0.5, pupilR = 0.2 + 0.0;
          float inIris = 1.0 - ss( irisR - 0.015, irisR + 0.015, ang );
          float fibre = vnoise( vec3( az * 9.0, ang * 14.0, 1.0 ) ) * 0.6 + vnoise( vec3( az * 23.0, ang * 30.0, 4.0 ) ) * 0.4;
          vec3 iris = uIris * ( 0.55 + 0.9 * fibre );
          iris = mix( iris, uIris * 1.6 + vec3( 0.05 ), ss( 0.3, 0.2, ang ) * 0.5 );
          iris *= mix( 0.45, 1.0, ss( irisR, irisR - 0.12, ang ) );
          vec3 sclera = vec3( 0.93, 0.9, 0.88 ) * ( 0.85 + 0.15 * ss( 0.9, 0.5, ang ) );
          sclera = mix( sclera, vec3( 0.86, 0.55, 0.5 ), ss( 1.05, 1.4, ang ) * 0.0 );
          vec3 c = mix( sclera, iris, inIris );
          c = mix( c, vec3( 0.01 ), 1.0 - ss( pupilR - 0.02, pupilR + 0.01, ang ) );
          diffuseColor.rgb = c;
        }`);
  };
  m.customProgramCacheKey = () => 'riderEye1';
  m.userData.uniforms = uniforms;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Hair cap: strand streaks flowing away from the crown, soft sheen
// ---------------------------------------------------------------------------------------------
export function makeHairMaterial() {
  const uniforms = { uHair: { value: new THREE.Color(0x4a2c18) } };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(0.9, 0.85, 0.8) });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\nuniform vec3 uHair;`)
      .replace('void main() {', `void main() {\n${bodyDecls()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 hp = vRest - vec3( ${HEAD[0].toFixed(4)}, ${HEAD[1].toFixed(4)}, ${HEAD[2].toFixed(4)} );
          vec3 d = normalize( hp - vec3( 0.0, 0.17, -0.03 ) );
          float az = atan( d.x, d.z );
          float pol = acos( clamp( d.y, -1.0, 1.0 ) );
          float s1 = vnoise( vec3( az * 30.0, pol * 3.0, 0.5 ) );
          float s2 = vnoise( vec3( az * 90.0, pol * 6.0, 2.5 ) );
          float strand = 0.6 * s1 + 0.4 * s2;
          vec3 col = uHair * ( 0.5 + 1.0 * strand );
          col *= mix( 0.7, 1.05, ss( 0.2, 1.6, pol ) );
          diffuseColor.rgb = col;
          bAO = mix( 0.4, 1.0, vAO );
          bBump = ( strand - 0.5 ) * 0.0007;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = riderBump( -vViewPosition, normal, bBump * 120.0, faceDirection );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= bAO; reflectedLight.indirectSpecular *= bAO;
        reflectedLight.directDiffuse *= mix( 0.55, 1.0, bAO );`);
  };
  m.customProgramCacheKey = () => 'riderHair1';
  m.userData.uniforms = uniforms;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Leather / suede for vest, chaps and belt. `aF` (distance to the cut edge) draws the stitching.
// ---------------------------------------------------------------------------------------------
export function makeLeatherMaterial(color, { suede = false, conchos = false } = {}) {
  const uniforms = { uLeather: { value: new THREE.Color(color) } };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: suede ? 0.95 : 0.52, metalness: 0, clearcoat: suede ? 0 : 0.25, clearcoatRoughness: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    patchVertex(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aF; varying float vF;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvF = aF;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\nvarying float vF; uniform vec3 uLeather;`)
      .replace('void main() {', `void main() {\n${bodyDecls()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vRest;
          float grain = fbm3( p * ${suede ? '90.0' : '55.0'} );
          float fine = vnoise( p * ${suede ? '420.0' : '260.0'} );
          vec3 col = uLeather * ( 0.82 + 0.3 * grain );
          float edge = 1.0 - ss( 0.0, 0.012, vF );
          col *= 1.0 - 0.28 * edge;
          float line = 1.0 - ss( 0.0006, 0.0022, abs( vF - 0.009 ) );
          float dash = pulse( ( p.x + p.y * 0.7 + p.z ) * 140.0 );
          col = mix( col, vec3( 0.78, 0.62, 0.38 ), line * dash * 0.6 );
          diffuseColor.rgb = col;
          bAO = mix( 0.4, 1.0, vAO );
          bBump = ( grain - 0.5 ) * 0.0012 + ( fine - 0.5 ) * 0.0004;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = riderBump( -vViewPosition, normal, bBump * 120.0, faceDirection );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= bAO; reflectedLight.indirectSpecular *= bAO;
        reflectedLight.directDiffuse *= mix( 0.6, 1.0, bAO );`);
  };
  m.customProgramCacheKey = () => (suede ? 'riderSuede1' : 'riderLeather1');
  m.userData.uniforms = uniforms;
  void conchos;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Braid: a rope of three twisted strands (bump from the helix), hair colour
// ---------------------------------------------------------------------------------------------
export function makeBraidMaterial() {
  const uniforms = { uHair: { value: new THREE.Color(0x4a2c18) } };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(0.9, 0.85, 0.8) });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBraid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBraid = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBraid; uniform vec3 uHair;\n${GLSL_NOISE}\n${SS_DEF}\n${BUMP_PARS}`)
      .replace('void main() {', 'void main() {\nfloat brH = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float ang = atan( vBraid.x, vBraid.z );
          float helix = sin( vBraid.y * 190.0 + ang * 3.0 );
          float ridge = pow( abs( helix ), 0.6 );
          float fibre = vnoise( vec3( ang * 14.0, vBraid.y * 80.0, 1.0 ) );
          brH = ridge * 0.0035 + fibre * 0.0006;
          diffuseColor.rgb = uHair * ( 0.45 + 0.55 * ridge ) * ( 0.8 + 0.4 * fibre );
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = riderBump( -vViewPosition, normal, brH * 120.0, faceDirection );`);
  };
  m.customProgramCacheKey = () => 'riderBraid1';
  m.userData.uniforms = uniforms;
  return m;
}
