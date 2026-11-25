/** GLSL ES 3.0 shader sources for the 3D kart renderer. */

const SCENE = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGndCol;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform float uFogStart;
uniform vec3 uCamPos;
uniform mat4 uLightVP;
uniform highp sampler2DShadow uShadow;
uniform float uShadowOn;
uniform float uTime;

float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 lp = uLightVP * vec4(wp + n * 1.2, 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x <= 0.002 || p.x >= 0.998 || p.y <= 0.002 || p.y >= 0.998 || p.z >= 1.0) return 1.0;
  float b = 0.0012;
  vec2 ts = vec2(1.0 / 2048.0);
  float s = 0.0;
  s += texture(uShadow, vec3(p.xy + vec2(-0.7, -0.7) * ts, p.z - b));
  s += texture(uShadow, vec3(p.xy + vec2(0.7, -0.7) * ts, p.z - b));
  s += texture(uShadow, vec3(p.xy + vec2(-0.7, 0.7) * ts, p.z - b));
  s += texture(uShadow, vec3(p.xy + vec2(0.7, 0.7) * ts, p.z - b));
  return s * 0.25;
}

vec3 applyFog(vec3 c, vec3 wp) {
  float d = max(0.0, length(uCamPos - wp) - uFogStart);
  float f = 1.0 - exp(-d * uFogDen);
  return mix(c, uFogCol, clamp(f, 0.0, 1.0));
}

vec3 shade(vec3 albedo, vec3 n, vec3 wp, float spec, float emis, float sh) {
  float ndl = dot(n, uSunDir);
  float diff = clamp(ndl * 0.8 + 0.2, 0.0, 1.0);
  vec3 amb = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5);
  vec3 v = normalize(uCamPos - wp);
  vec3 h = normalize(v + uSunDir);
  float sp = pow(max(dot(n, h), 0.0), 36.0) * spec * sh * step(0.0, ndl);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.28;
  vec3 c = albedo * (amb + uSunCol * diff * mix(0.35, 1.0, sh)) + uSunCol * sp + uSkyCol * rim * (0.4 + albedo);
  return mix(c, albedo * 1.15, emis);
}
`;

export const LIT_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec2 aUv;
uniform mat4 uVP;
uniform mat4 uModel;
out vec3 vWp;
out vec3 vN;
out vec4 vCol;
out vec2 vUv;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(uModel) * aNrm);
  vCol = aCol;
  vUv = aUv;
  gl_Position = uVP * wp;
}`;

export const LIT_FS = /* glsl */ `#version 300 es
precision highp float;
${SCENE}
in vec3 vWp;
in vec3 vN;
in vec4 vCol;
in vec2 vUv;
uniform vec4 uTint;
uniform vec3 uAdd;
uniform float uSpec;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uNoFog;
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vCol.rgb * uTint.rgb;
  float a = uTint.a;
  if (uUseTex > 0.5) {
    vec4 t = texture(uTex, vUv);
    albedo *= t.rgb;
    a *= t.a;
  }
  float sh = shadowAt(vWp, n);
  vec3 c = shade(albedo, n, vWp, uSpec, vCol.a, sh) + uAdd;
  if (uNoFog < 0.5) c = applyFog(c, vWp);
  o = vec4(c * a, a);
}`;

export const GROUND_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uVP;
out vec3 vWp;
out vec3 vN;
void main() {
  vWp = aPos;
  vN = aNrm;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

export const GROUND_FS = /* glsl */ `#version 300 es
precision highp float;
${SCENE}
in vec3 vWp;
in vec3 vN;
uniform sampler2D uTex;
uniform float uWorld;
uniform vec3 uCliffCol;
uniform vec3 uCliffCol2;
uniform float uSpace;
uniform vec3 uEdgeGlow;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 n = normalize(vN);
  vec2 uv = vWp.xz / uWorld;
  vec3 albedo = texture(uTex, uv).rgb;
  // fine detail so the ground does not look blurry up close
  float dn = vnoise(vWp.xz * 0.35) * 0.55 + vnoise(vWp.xz * 1.3) * 0.45;
  albedo *= 0.9 + dn * 0.2;
  // cliffs / slopes get a rocky look
  float slope = 1.0 - n.y;
  float h = vWp.y;
  if (uSpace > 0.5) {
    if (h < -4.0) {
      float k = clamp(-h / 260.0, 0.0, 1.0);
      float panel = step(0.5, fract(vWp.y * 0.05)) * 0.15 + step(0.92, fract((vWp.x + vWp.z) * 0.04)) * 0.25;
      albedo = mix(uCliffCol + panel * 0.3, uCliffCol2, k);
      if (h < -330.0) discard;
    }
  } else {
    float rock = smoothstep(0.25, 0.6, slope);
    vec3 rc = mix(uCliffCol, uCliffCol2, vnoise(vWp.xz * 0.05 + vWp.y * 0.08));
    albedo = mix(albedo, rc * (0.85 + dn * 0.3), rock);
  }
  float sh = shadowAt(vWp, n);
  vec3 c = shade(albedo, n, vWp, 0.08, 0.0, sh);
  if (uSpace > 0.5) {
    float e = exp(-abs(h + 3.0) * 0.35);
    c += uEdgeGlow * e * (0.8 + 0.2 * sin(uTime * 3.0 + vWp.x * 0.02));
  }
  c = applyFog(c, vWp);
  o = vec4(c, 1.0);
}`;

export const WATER_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
out vec3 vWp;
void main() {
  vWp = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

export const WATER_FS = /* glsl */ `#version 300 es
precision highp float;
${SCENE}
in vec3 vWp;
uniform sampler2D uHeight;
uniform vec4 uHeightRect; // x0, z0, 1/w, 1/h
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uMurky;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vWp.xz;
  float t = uTime;
  // procedural wave normal
  vec2 g = vec2(0.0);
  g += vec2(cos(p.x * 0.021 + t * 1.3), cos(p.y * 0.017 + t * 1.1)) * 0.5;
  g += vec2(cos((p.x + p.y) * 0.043 - t * 1.9), cos((p.x - p.y) * 0.037 + t * 1.6)) * 0.35;
  g += vec2(vnoise(p * 0.08 + t * 0.6) - 0.5, vnoise(p * 0.08 - t * 0.5 + 7.0) - 0.5) * 0.9;
  vec3 n = normalize(vec3(-g.x * 0.18, 1.0, -g.y * 0.18));
  vec2 huv = (p - uHeightRect.xy) * uHeightRect.zw;
  float ground = texture(uHeight, huv).r;
  float depth = max(0.0, vWp.y - ground);
  vec3 v = normalize(uCamPos - vWp);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 base = mix(uShallow, uDeep, clamp(depth / 26.0, 0.0, 1.0));
  vec3 c = base * (0.55 + 0.45 * max(dot(n, uSunDir), 0.0)) * (uGndCol * 0.4 + uSunCol * 0.7);
  c = mix(c, uSkyCol * 1.05, fres * 0.65);
  vec3 h = normalize(v + uSunDir);
  float sh = shadowAt(vWp, vec3(0.0, 1.0, 0.0));
  c += uSunCol * pow(max(dot(n, h), 0.0), 120.0) * 1.4 * sh;
  // shore foam
  float fn = vnoise(p * 0.12 + vec2(t * 0.4, -t * 0.3));
  float foam = smoothstep(5.5, 0.5, depth + fn * 3.0 - sin(t * 2.0 + p.x * 0.01) * 1.2);
  c = mix(c, vec3(0.97, 0.99, 1.0), foam * 0.85 * (1.0 - uMurky * 0.5));
  float a = clamp(0.55 + depth / 18.0 + fres * 0.3 + uMurky * 0.3, 0.0, 0.95);
  a = max(a, foam * 0.9);
  c *= sh * 0.25 + 0.75;
  c = applyFog(c, vWp);
  o = vec4(c * a, a);
}`;

export const SKY_VS = /* glsl */ `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vNdc;
void main() {
  vNdc = P[gl_VertexID];
  gl_Position = vec4(P[gl_VertexID], 0.9999, 1.0);
}`;

export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInvVP;
uniform vec3 uCamPos;
uniform sampler2D uPano;
uniform vec3 uTop;
uniform vec3 uFogCol;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSpace;
uniform float uTime;
uniform float uPanoTop; // elevation (radians) of the top of the panorama
out vec4 o;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec4 a = uInvVP * vec4(vNdc, -1.0, 1.0);
  vec4 b = uInvVP * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.z, d.x);
  float u = fract(az / 6.2831853 + 0.25);
  float lo = -0.03;
  vec3 c;
  if (el > uPanoTop) {
    vec3 topRow = texture(uPano, vec2(u, 0.002)).rgb;
    c = mix(topRow, uTop, smoothstep(uPanoTop, 1.2, el));
  } else if (el > lo) {
    float v = 1.0 - (el - lo) / (uPanoTop - lo);
    c = texture(uPano, vec2(u, v)).rgb;
  } else {
    c = mix(texture(uPano, vec2(u, 0.999)).rgb, uFogCol, smoothstep(lo, lo - 0.08, el));
  }
  if (uSpace > 0.5) {
    vec3 q = floor(d * 420.0);
    float s = hash(q);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0);
    float star = step(0.996, s) * tw;
    float vis = el > lo ? smoothstep(0.0, 0.2, el - uPanoTop * 0.3) : 1.0;
    c += vec3(star) * vis;
    if (el < lo) c = mix(c, vec3(0.02, 0.01, 0.06), 0.6) + vec3(star);
  }
  // sun glow
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 400.0) * 1.6 + pow(sd, 12.0) * 0.18) * (1.0 - uSpace * 0.6);
  o = vec4(c, 1.0);
}`;

export const PART_VS = /* glsl */ `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPosSize; // xyz + size
layout(location=2) in vec4 aCol;
layout(location=3) in vec2 aKindRot;
uniform mat4 uVP;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
out vec2 vUv;
out vec4 vCol;
out float vKind;
out vec3 vWp;
void main() {
  float r = aKindRot.y;
  vec2 c = vec2(aCorner.x * cos(r) - aCorner.y * sin(r), aCorner.x * sin(r) + aCorner.y * cos(r));
  vec3 wp = aPosSize.xyz + (uCamRight * c.x + uCamUp * c.y) * aPosSize.w;
  vUv = aCorner;
  vCol = aCol;
  vKind = aKindRot.x;
  vWp = wp;
  gl_Position = uVP * vec4(wp, 1.0);
}`;

export const PART_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vCol;
in float vKind;
in vec3 vWp;
uniform vec3 uCamPos;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform float uFogStart;
out vec4 o;
void main() {
  float r = length(vUv);
  float a = 0.0;
  float add = 0.0;
  int k = int(vKind + 0.5);
  if (k == 0) { a = smoothstep(1.0, 0.0, r); a *= a; }               // smoke puff
  else if (k == 1) { a = smoothstep(1.0, 0.6, r); }                   // solid dot
  else if (k == 2) {                                                  // star
    float ang = atan(vUv.y, vUv.x);
    float rr = 0.55 + 0.45 * cos(ang * 5.0);
    a = smoothstep(rr, rr - 0.15, r);
  } else if (k == 3) { a = smoothstep(0.12, 0.0, abs(r - 0.8)); }      // ring
  else if (k == 4) { a = smoothstep(1.0, 0.0, r); add = 1.0; }        // additive glow
  else if (k == 5) { a = smoothstep(1.0, 0.2, r); add = 0.85; } // spark
  a *= vCol.a;
  a *= smoothstep(25.0, 75.0, length(uCamPos - vWp));
  if (a < 0.004) discard;
  vec3 c = vCol.rgb;
  float d = max(0.0, length(uCamPos - vWp) - uFogStart);
  float f = clamp(1.0 - exp(-d * uFogDen), 0.0, 1.0);
  c = mix(c, uFogCol, f * (1.0 - add));
  o = vec4(c * a, a * (1.0 - add));
}`;

export const DEPTH_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() {
  gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
}`;

export const DEPTH_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`;

/** Animated boost-pad / decal overlay: arrows that scroll along +u. */
export const DECAL_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=3) in vec2 aUv;
uniform mat4 uVP;
out vec2 vUv;
out vec3 vWp;
void main() {
  vUv = aUv;
  vWp = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

export const DECAL_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vWp;
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
out vec4 o;
void main() {
  float x = fract(vUv.x * 3.0 - uTime * 2.2);
  float y = abs(vUv.y - 0.5) * 2.0;
  float chev = smoothstep(0.08, 0.0, abs(x - 0.5 - y * 0.32) - 0.1);
  float edge = smoothstep(0.86, 0.98, y) + smoothstep(0.03, 0.0, vUv.x) + smoothstep(0.97, 1.0, vUv.x);
  float pulse = 0.65 + 0.35 * sin(uTime * 6.0);
  vec3 c = mix(uColA, uColB, chev) * (0.6 + chev * 0.8 * pulse);
  float a = clamp(chev * 0.95 + edge * 0.6 + 0.12, 0.0, 1.0);
  o = vec4(c * a, a * 0.35);
}`;
