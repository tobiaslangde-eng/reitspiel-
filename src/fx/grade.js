// Final colour grade: gentle filmic contrast, warm highlights / cool shadows, vignette and fine grain.
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.08 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uSaturation;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      // split toning
      c += (vec3(0.035, 0.012, -0.03)) * smoothstep(0.45, 1.0, l);
      c += (vec3(-0.012, 0.0, 0.025)) * (1.0 - smoothstep(0.0, 0.35, l));
      // soft S-curve
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
      // vignette
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      // grain
      c += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
