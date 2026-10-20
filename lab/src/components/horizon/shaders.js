/* Lab — 사건의 지평선. 슈바르츠실트 블랙홀 실시간 레이트레이서 셰이더.
   길이 단위는 슈바르츠실트 반지름 Rs(=1). 광자구 1.5, 가장 안쪽 안정 궤도(ISCO) 3.
   빛의 경로는 u'' + u = 1.5u² (u = 1/r) 와 같은 궤적을 주는 가속도
   a = -1.5·h²·r/|r|⁵ (h = |r × v|, 보존량)로 적분한다. */

export const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const COMMON = `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
                 mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                 mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / 0.9375;
}
`

export const SCENE = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCam;
uniform mat3 uBasis;     // 열: right, up, forward
uniform float uTanFov;
uniform float uDoppler;  // 1 = 도플러·중력 적색편이 적용, 0 = 영화식(편이 없음)
uniform float uPix;      // 픽셀 하나의 각크기(rad)
uniform int uSteps;
uniform float uOutScale; // 부동소수 렌더 타깃이 없을 때 범위를 줄여 담는다

const float RIN = 3.0;
const float ROUT = 15.0;
const float FMAX = 0.0020982;   // r = 49/36·RIN 에서의 최대 플럭스
const float SPIN = 7.5;         // 원반 회전을 눈에 보이는 속도로
const float PERIOD = 22.0;
${COMMON}

/* 플랑크 궤적 근사(Krystek) → CIE xyY(Y=1) → 선형 sRGB */
vec3 blackbody(float t) {
  float u = (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) / (1.0 + 8.42420235e-4 * t + 7.08145163e-7 * t * t);
  float v = (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) / (1.0 - 2.89741816e-5 * t + 1.61456053e-7 * t * t);
  float d = 2.0 * u - 8.0 * v + 4.0;
  float x = 3.0 * u / d;
  float y = 2.0 * v / d;
  vec3 xyz = vec3(x / y, 1.0, (1.0 - x - y) / y);
  vec3 rgb = mat3(3.2404542, -0.9692660, 0.0556434,
                  -1.5371385, 1.8760108, -0.2040259,
                  -0.4985314, 0.0415560, 1.0572252) * xyz;
  return max(rgb, vec3(0.0));
}

vec3 sky(vec3 d) {
  vec3 c = vec3(0.0);
  vec3 bn = normalize(vec3(0.25, 0.9, -0.35));
  float b = dot(d, bn);
  float band = exp(-b * b * 12.0);
  float clouds = fbm(d * 5.0 + 3.0);
  float dust = fbm(d * 11.0 - 2.0);
  c += band * (vec3(0.42, 0.42, 0.6) * pow(clouds, 3.0) * 0.22 + vec3(0.9, 0.62, 0.38) * pow(dust, 4.0) * 0.08);
  for (int l = 0; l < 3; l++) {
    float sc = 60.0 * pow(2.0, float(l));
    vec3 q = d * sc;
    vec3 id = floor(q);
    vec3 h = hash33(id + float(l) * 31.7);
    vec3 sp = id + 0.2 + 0.6 * h;
    float px = length(q - sp) / (sc * uPix);
    float has = step(1.0 - 0.05 / pow(2.4, float(l)), hash13(id * 1.31 + 7.0));
    float m = has * (0.08 + 2.2 * pow(h.x, 8.0)) / (1.0 + float(l));
    vec3 tint = mix(vec3(1.0, 0.74, 0.5), vec3(0.72, 0.84, 1.0), h.y);
    c += tint * m * exp(-px * px * 1.1) * 1.6;
  }
  return c;
}

/* 얇은 강착원반을 지나는 순간의 방출·흡수 */
void disk(vec3 p, vec3 dir, float camR, inout vec3 col, inout float alpha) {
  float r = length(p.xz);
  if (r < RIN || r > ROUT) return;
  float flux = max(0.0, 1.0 - sqrt(RIN / r)) / (r * r * r);
  float prof = pow(flux / FMAX, 0.25);            // ≈ T / Tmax

  // 원반 물질의 궤도 속도(정지 관측자 기준) — ISCO에서 0.5c
  float beta = sqrt(0.5 / (r - 1.0));
  vec3 tang = vec3(-p.z, 0.0, p.x) / r;
  float gamma = inversesqrt(1.0 - beta * beta);
  float dop = 1.0 / (gamma * (1.0 - beta * dot(tang, -dir)));
  float grav = sqrt((1.0 - 1.0 / r) / (1.0 - 1.0 / camR));
  float g = mix(1.0, dop * grav, uDoppler);

  // 안쪽이 빨리 도는 차등 회전 무늬 — 두 위상을 엇갈려 섞어 무한히 꼬이지 않게
  float omega = sqrt(0.5 / (r * r * r)) * SPIN;
  float phi = atan(p.z, p.x);
  float ph1 = fract(uTime / PERIOD);
  float ph2 = fract(uTime / PERIOD + 0.5);
  float a1 = phi - omega * ph1 * PERIOD;
  float a2 = phi - omega * ph2 * PERIOD;
  float n1 = fbm(vec3(cos(a1) * 2.4, sin(a1) * 2.4, r * 1.7));
  float n2 = fbm(vec3(cos(a2) * 2.4 + 13.1, sin(a2) * 2.4 - 7.3, r * 1.7 + 4.0));
  float n = mix(n1, n2, abs(ph1 * 2.0 - 1.0));
  float streak = fbm(vec3(cos(a1) * 9.0, sin(a1) * 9.0, r * 6.0));

  float edge = smoothstep(RIN, RIN + 0.5, r) * (1.0 - smoothstep(ROUT * 0.5, ROUT, r));
  float dens = edge * (0.18 + 1.6 * n * n) * (0.7 + 0.6 * streak);
  float a = 1.0 - exp(-dens * 1.25 / max(abs(dir.y), 0.06));

  float t = clamp(6200.0 * prof * g, 1000.0, 30000.0);
  vec3 e = blackbody(t) * pow(prof, 3.0) * pow(g, 4.0) * (0.5 + 0.9 * n) * 0.85;
  col += (1.0 - alpha) * e * a;
  alpha += (1.0 - alpha) * a;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 dir = normalize(uBasis * vec3(uv * uTanFov, 1.0));
  vec3 pos = uCam;
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float camR = max(length(uCam), 1.02);
  float escR = max(ROUT, camR) * 1.6;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool escaped = false;
  float r2 = dot(pos, pos);
  vec3 acc = -1.5 * h2 * pos / (r2 * r2 * sqrt(r2));
  for (int i = 0; i < 600; i++) {
    if (i >= uSteps) break;
    float r = length(pos);
    if (r < 1.0) break;
    if (r > escR && dot(pos, vel) > 0.0) { escaped = true; break; }
    float dt = clamp(0.06 * r, 0.015, 2.5) / length(vel);
    vec3 prev = pos;
    vel += acc * (0.5 * dt);          // 립프로그(kick-drift-kick)
    pos += vel * dt;
    r2 = dot(pos, pos);
    acc = -1.5 * h2 * pos / (r2 * r2 * sqrt(r2));
    vel += acc * (0.5 * dt);
    if (prev.y * pos.y < 0.0) {
      vec3 hit = mix(prev, pos, prev.y / (prev.y - pos.y));
      disk(hit, normalize(vel), camR, col, alpha);
      if (alpha > 0.995) break;
    }
  }
  if (escaped) col += (1.0 - alpha) * sky(normalize(vel));
  outColor = vec4(col * uOutScale, 1.0);
}`

/* 블룸 — 듀얼 필터 다운샘플(첫 단계에서 밝은 부분만 남김) */
export const DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThresh;
uniform float uPrefilter;
vec3 tap(vec2 uv) { return texture(uSrc, uv).rgb; }
void main() {
  vec2 t = uTexel;
  vec3 c = tap(vUv) * 4.0 + tap(vUv - t) + tap(vUv + t) + tap(vUv + vec2(t.x, -t.y)) + tap(vUv + vec2(-t.x, t.y));
  c *= 0.125;
  if (uPrefilter > 0.5) {
    float br = max(c.r, max(c.g, c.b));
    float knee = uThresh * 0.5;
    float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    c *= max(soft, br - uThresh) / max(br, 1e-4);
  }
  o = vec4(c, 1.0);
}`

export const UP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uTexel;
vec3 tap(vec2 uv) { return texture(uSrc, uv).rgb; }
void main() {
  vec2 h = uTexel;
  vec3 c = tap(vUv + vec2(-2.0 * h.x, 0.0)) + tap(vUv + vec2(2.0 * h.x, 0.0))
         + tap(vUv + vec2(0.0, -2.0 * h.y)) + tap(vUv + vec2(0.0, 2.0 * h.y))
         + 2.0 * (tap(vUv + vec2(-h.x, h.y)) + tap(vUv + h) + tap(vUv + vec2(h.x, -h.y)) + tap(vUv - h));
  o = vec4(c / 12.0, 1.0);
}`

/* 합성 — 블룸 + ACES 톤매핑 + 색수차·비네트·필름 그레인 */
export const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStr;
uniform float uExposure;
uniform float uTime;
uniform float uFade;
uniform float uInScale;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * r2 * 0.014;
  vec3 c;
  c.r = texture(uScene, vUv - off).r;
  c.g = texture(uScene, vUv).g;
  c.b = texture(uScene, vUv + off).b;
  c = (c + texture(uBloom, vUv).rgb * uBloomStr) * uInScale * uExposure;
  c = aces(c);
  c *= 1.0 - smoothstep(0.12, 0.6, r2) * 0.5;
  c = pow(c, vec3(1.0 / 2.2));
  c += (h12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * 0.028;
  o = vec4(c * uFade, 1.0);
}`
