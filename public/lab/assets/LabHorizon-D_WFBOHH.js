import{r as w,j as a,L as ze}from"./index-CgyggJ-P.js";import{R as we}from"./Room-DhS2bC6n.js";import"./rooms-BUCbQs8g.js";const Se=`#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,De=`
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
`,je=`#version 300 es
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
${De}

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
}`,Ne=`#version 300 es
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
}`,Ue=`#version 300 es
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
}`,ke=`#version 300 es
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
}`,Ie=6;function me(o,e,d){const h=o.createShader(e);if(o.shaderSource(h,d),o.compileShader(h),!o.getShaderParameter(h,o.COMPILE_STATUS))throw new Error(o.getShaderInfoLog(h)||"shader compile failed");return h}function q(o,e){const d=o.createProgram(),h=me(o,o.VERTEX_SHADER,Se),m=me(o,o.FRAGMENT_SHADER,e);if(o.attachShader(d,h),o.attachShader(d,m),o.linkProgram(d),o.deleteShader(h),o.deleteShader(m),!o.getProgramParameter(d,o.LINK_STATUS))throw new Error(o.getProgramInfoLog(d)||"program link failed");const l=new Map;return{p:d,u(b){return l.has(b)||l.set(b,o.getUniformLocation(d,b)),l.get(b)}}}function Le(o){const e=o.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,powerPreference:"high-performance",preserveDrawingBuffer:!1});if(!e)throw new Error("webgl2");const d=!!(e.getExtension("EXT_color_buffer_float")||e.getExtension("EXT_color_buffer_half_float")),h=d?1:.25,m=e.createVertexArray(),l=q(e,je),b=q(e,Ne),T=q(e,Ue),R=q(e,ke);let v=null,E=[];function j(f,x){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),d?e.texImage2D(e.TEXTURE_2D,0,e.RGBA16F,f,x,0,e.RGBA,e.HALF_FLOAT,null):e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,f,x,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);const p=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,p),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0),{tex:i,fb:p,w:f,h:x}}function M(f){f&&(e.deleteTexture(f.tex),e.deleteFramebuffer(f.fb))}function U(f,x){M(v),E.forEach(M),v=j(f,x),E=[];let i=f,p=x;for(let s=0;s<Ie&&(i=Math.max(2,i>>1),p=Math.max(2,p>>1),E.push(j(i,p)),!(i<=4||p<=4));s++);}function y(f,x,i,p){e.activeTexture(e.TEXTURE0+p),e.bindTexture(e.TEXTURE_2D,i),e.uniform1i(f.u(x),p)}function z(f,x,i){e.bindFramebuffer(e.FRAMEBUFFER,f),e.viewport(0,0,x,i),e.drawArrays(e.TRIANGLES,0,3)}function H(f,x,i,p){const s=Math.max(2,Math.round(f*i)),c=Math.max(2,Math.round(x*i));(o.width!==s||o.height!==c)&&(o.width=s,o.height=c);const t=Math.max(2,Math.round(s*p)),N=Math.max(2,Math.round(c*p));return(!v||v.w!==t||v.h!==N)&&U(t,N),{w:t,h:N}}function V(f){e.bindVertexArray(m),e.disable(e.BLEND),e.useProgram(l.p),e.uniform2f(l.u("uRes"),v.w,v.h),e.uniform1f(l.u("uTime"),f.time),e.uniform3fv(l.u("uCam"),f.cam),e.uniformMatrix3fv(l.u("uBasis"),!1,f.basis),e.uniform1f(l.u("uTanFov"),f.tanFov),e.uniform1f(l.u("uDoppler"),f.doppler),e.uniform1f(l.u("uPix"),2*f.tanFov/v.h),e.uniform1i(l.u("uSteps"),f.steps),e.uniform1f(l.u("uOutScale"),h),z(v.fb,v.w,v.h),e.useProgram(b.p),e.uniform1f(b.u("uThresh"),.9*h);let x=v;E.forEach((i,p)=>{y(b,"uSrc",x.tex,0),e.uniform2f(b.u("uTexel"),1/x.w,1/x.h),e.uniform1f(b.u("uPrefilter"),p===0?1:0),z(i.fb,i.w,i.h),x=i}),e.useProgram(T.p),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE);for(let i=E.length-2;i>=0;i--){const p=E[i+1];y(T,"uSrc",p.tex,0),e.uniform2f(T.u("uTexel"),.5/p.w,.5/p.h),z(E[i].fb,E[i].w,E[i].h)}e.disable(e.BLEND),e.useProgram(R.p),y(R,"uScene",v.tex,0),y(R,"uBloom",E[0].tex,1),e.uniform1f(R.u("uBloomStr"),f.bloom),e.uniform1f(R.u("uExposure"),f.exposure),e.uniform1f(R.u("uTime"),f.time),e.uniform1f(R.u("uFade"),f.fade),e.uniform1f(R.u("uInScale"),1/h),z(null,o.width,o.height)}function K(){M(v),E.forEach(M),[l,b,T,R].forEach(f=>e.deleteProgram(f.p)),e.deleteVertexArray(m)}return{gl:e,hdr:d,resize:H,render:V,dispose:K}}const _e=[{id:"film",label:"원반 높이에서",dist:19,el:.075},{id:"top",label:"위에서 내려다보기",dist:24,el:1.18},{id:"near",label:"광자구 가까이",dist:2.6,el:.1}],P=1.3,I=45,Pe=11,ve=Math.log(I),Fe=[[1,"사건의 지평선"],[1.5,"광자구"],[3,"최내곽 안정 궤도"],[15,"원반 바깥 끝"]],Ae=[["빛을 거꾸로 쏩니다","픽셀마다 카메라에서 광선을 하나씩 쏘고, 블랙홀 곁 시공간에서 빛이 지나는 길(널 측지선)을 매 프레임 수백 단계로 적분합니다. 미리 그려 둔 이미지나 영상은 없습니다."],["원반이 머리띠처럼 보이는 이유","블랙홀 뒤쪽 원반에서 나온 빛이 중력에 휘어 위아래로 넘어옵니다. 그래서 평평한 원반이 블랙홀을 감싸는 고리처럼 보입니다. 그림자 바로 바깥의 가는 고리는 블랙홀을 한 바퀴 넘게 돌고 나온 빛입니다."],["그림자는 지평선보다 큽니다","지평선은 1 Rs지만, 광자구(1.5 Rs) 안쪽으로 들어온 빛은 모두 빨려 들어갑니다. 그래서 검은 그림자의 반지름은 약 2.6 Rs(3√3/2)로 보입니다."],["한쪽만 밝은 이유","원반 안쪽 끝은 광속의 절반 속도로 돕니다. 다가오는 쪽은 도플러 효과로 밝고 푸르게, 멀어지는 쪽은 어둡고 붉게 보입니다. 영화 〈인터스텔라〉 제작진은 관객이 헷갈리지 않도록 이 효과를 뺐습니다. 아래 스위치로 두 모습을 비교해 보세요."],["시간이 느려집니다","블랙홀 가까이 멈춰 선 사람의 시간은 √(1 − Rs/r)배로 느리게 흐릅니다. 오른쪽 위 숫자는 지금 거리에서 계산한 값입니다."],["단순화한 부분","회전하지 않는 블랙홀(슈바르츠실트)과 두께 없는 원반을 가정했습니다. 원반 밝기는 표준 원반 이론(Novikov–Thorne)의 온도 분포를 단순화했고, 지평선 바로 앞 시야는 근사입니다. 새 라이브러리 없이 WebGL2 셰이더로 그리고, 기기 성능에 맞춰 해상도를 스스로 조절하며, 화면 밖에서는 계산을 멈춥니다."]],D=(o,e,d)=>Math.min(d,Math.max(e,o)),G=(o,e,d)=>o+(e-o)*d,ge=o=>o*o*(3-2*o),re=o=>ge(D((8-o)/6.8,0,1));function Ce(o,e,d){const h=Math.cos(e),m=[d*h*Math.cos(o),d*Math.sin(e),d*h*Math.sin(o)],l=[-m[0]/d,-m[1]/d,-m[2]/d],b=Math.hypot(l[2],l[0])||1,T=[-l[2]/b,0,l[0]/b],R=[T[1]*l[2]-T[2]*l[1],T[2]*l[0]-T[0]*l[2],T[0]*l[1]-T[1]*l[0]],v=re(d)*.95,E=Math.cos(v),j=Math.sin(v),M=l.map((y,z)=>y*E+T[z]*j),U=T.map((y,z)=>y*E-l[z]*j);return{pos:m,basis:new Float32Array([...U,...R,...M])}}const xe=o=>1/Math.sqrt(Math.max(1e-4,1-1/o));function Oe(o){if(o>50)return`${Math.round(o)}시간 넘게`;const e=Math.round(60*o),d=Math.floor(e/60),h=e%60;return h?`${d}시간 ${h}분`:`${d}시간`}function $(o){const e=Math.floor(o);return`${Math.floor(e/60)}:${String(e%60).padStart(2,"0")}`}function Be(o){return o<1.5?"광자구 안쪽 · 빛도 궤도를 못 돈다":o<3?"안정 궤도 없음 · 물질이 곧장 떨어진다":o<15?"강착원반 안":"원반 바깥"}function $e(){const o=w.useRef(null),e=w.useRef(null),d=w.useRef({}),h=w.useRef({az:-1.25,el:.075,dist:34,tEl:.075,tDist:19,vaz:0,dragging:!1,idle:0,doppler:1,tDoppler:1,fade:0,dive:null,gone:!1,here:0,far:0}),[m,l]=w.useState("loading"),[b,T]=w.useState(0),[R,v]=w.useState(!0),[E,j]=w.useState("film"),[M,U]=w.useState("orbit"),[y,z]=w.useState(null);w.useEffect(()=>{const s=e.current,c=o.current,t=h.current;let N;try{N=Le(s)}catch(r){console.error(r),l(r.message==="webgl2"?"unsupported":"error");return}const F=window.matchMedia("(max-width: 760px)").matches,be=window.matchMedia("(prefers-reduced-motion: reduce)"),Ee=F?2:1.5,n={scale:F?.5:.72,ceiling:F?.8:1,steps:F?240:320,frames:0,acc:0,hold:0,warm:1.2,fps:60};let A=1,C=1,L=0,O=0,oe=0,W=1,ae=!0,Y={w:0,h:0};const se=()=>{const r=c.getBoundingClientRect();A=Math.max(1,r.width),C=Math.max(1,r.height)};se();const ne=new ResizeObserver(se);ne.observe(c);const Te=(r,u)=>{if(t.dive){const g=t.dive;g.t=Math.min(1,g.t+r/Pe);const k=Math.pow(g.t,1.7);t.dist=Math.exp(G(Math.log(g.from),Math.log(1.012),k)),t.el=G(g.fromEl,.03,ge(g.t)),t.az+=r*(.04+1.1*k*k),t.fade=g.t<.88?1:1-(g.t-.88)/.12,g.t>=1&&(t.dive=null,t.gone=!0,t.fade=0,z({here:t.here,far:t.far}),U("gone"))}else if(!t.gone){const g=1-Math.exp(-r*4.5);t.dist=Math.exp(G(Math.log(t.dist),Math.log(t.tDist),g)),t.el+=(t.tEl-t.el)*g,t.dragging||(t.az+=t.vaz*r,t.vaz*=Math.exp(-r*2.2),t.idle+=r,t.idle>3&&!u&&(t.az+=r*.035*Math.min(1,(t.idle-3)/2))),t.fade=Math.min(1,t.fade+r/1.4)}t.doppler+=(t.tDoppler-t.doppler)*(1-Math.exp(-r*4)),t.gone||(t.here+=r,t.far+=r*xe(t.dist))},Re=r=>{if(n.frames+=1,n.acc+=r,n.warm-=r,n.acc<.75)return;const u=n.frames/n.acc;if(n.fps=u,n.hold-=n.acc,n.frames=0,n.acc=0,!(n.warm>0)){if(n.trial){u<n.trial.fps*1.12&&Object.assign(n,{scale:n.trial.scale,steps:n.trial.steps,ceiling:n.trial.ceiling,capped:!0}),n.trial=null,n.hold=3;return}u<46&&!n.capped?(n.trial={fps:u,scale:n.scale,steps:n.steps,ceiling:n.ceiling},n.scale>.32?(n.ceiling=Math.max(.3,n.scale-.05),n.scale=Math.max(.3,n.scale-.1)):n.steps=Math.max(150,n.steps-40)):u>56&&(n.capped=!1,n.hold<=0&&n.scale<n.ceiling&&(n.scale=Math.min(n.ceiling,n.scale+.04)))}},Me=()=>{const r=d.current,u=xe(t.dist);r.dist&&(r.dist.textContent=t.dist.toFixed(t.dist<10?2:1)),r.dil&&(r.dil.textContent=`×${u.toFixed(u<2?3:2)}`),r.hour&&(r.hour.textContent=Oe(u)),r.here&&(r.here.textContent=$(t.here)),r.far&&(r.far.textContent=$(t.far)),r.zone&&(r.zone.textContent=Be(t.dist)),r.rays&&(r.rays.textContent=(Y.w*Y.h).toLocaleString("ko-KR")),r.steps&&(r.steps.textContent=n.steps),r.fps&&(r.fps.textContent=Math.round(n.fps)),r.marker&&(r.marker.style.bottom=`${Math.log(t.dist)/ve*100}%`)},ie=r=>{L=requestAnimationFrame(ie);const u=O?Math.min(.1,(r-O)/1e3):1/60;O=r;const g=be.matches;oe+=u*(g?.35:1),Te(u,g),Re(u),Y=N.resize(A,C,Math.min(window.devicePixelRatio||1,Ee),n.scale);const{pos:k,basis:Z}=Ce(t.az,t.el,t.dist);N.render({time:oe,cam:k,basis:Z,tanFov:Math.max(.5,.36/(A/C))*(1+1.4*re(t.dist)),doppler:t.doppler,steps:n.steps,bloom:.13,exposure:G(1,.5,re(t.dist)),fade:t.fade}),W+=u,W>.1&&(W=0,Me()),ae&&(ae=!1,l("ready"))},ye=()=>{L||(O=0,L=requestAnimationFrame(ie))},J=()=>{cancelAnimationFrame(L),L=0};let ce=!0;const B=()=>ce&&!document.hidden?ye():J(),le=new IntersectionObserver(([r])=>{ce=r.isIntersecting,B()});le.observe(c),document.addEventListener("visibilitychange",B);const S=new Map;let _=0;const fe=()=>{const[r,u]=[...S.values()];return r&&u?Math.hypot(r.x-u.x,r.y-u.y):0},Q=()=>t.dive||t.gone,ue=r=>{var u;Q()||((u=s.setPointerCapture)==null||u.call(s,r.pointerId),S.set(r.pointerId,{x:r.clientX,y:r.clientY,t:r.timeStamp}),t.dragging=!0,t.idle=0,t.vaz=0,S.size===2&&(_=fe()),c.classList.add("is-dragging"))},de=r=>{const u=S.get(r.pointerId);if(!u||Q())return;const g=r.clientX-u.x,k=r.clientY-u.y,Z=Math.max(.008,(r.timeStamp-u.t)/1e3);if(Object.assign(u,{x:r.clientX,y:r.clientY,t:r.timeStamp}),S.size>=2){const te=fe();_>0&&te>0&&(t.tDist=D(t.tDist*(_/te),P,I)),_=te;return}const ee=4/Math.max(360,Math.min(A,C)*1.4);t.az+=g*ee,t.tEl=D(t.tEl+k*ee,-1.3,1.3),t.el=t.tEl,t.vaz=t.vaz*.5+g*ee/Z*.5},X=r=>{const u=S.get(r.pointerId);u&&r.timeStamp-u.t>90&&(t.vaz=0),S.delete(r.pointerId),S.size<2&&(_=0),S.size||(t.dragging=!1,t.idle=0,c.classList.remove("is-dragging"))},he=r=>{Q()||(r.preventDefault(),t.tDist=D(t.tDist*Math.exp(r.deltaY*.0011),P,I),t.idle=0)},pe=r=>{r.preventDefault(),J(),l("lost")};return s.addEventListener("pointerdown",ue),s.addEventListener("pointermove",de),s.addEventListener("pointerup",X),s.addEventListener("pointercancel",X),s.addEventListener("wheel",he,{passive:!1}),s.addEventListener("webglcontextlost",pe),B(),()=>{J(),ne.disconnect(),le.disconnect(),document.removeEventListener("visibilitychange",B),s.removeEventListener("pointerdown",ue),s.removeEventListener("pointermove",de),s.removeEventListener("pointerup",X),s.removeEventListener("pointercancel",X),s.removeEventListener("wheel",he),s.removeEventListener("webglcontextlost",pe),N.dispose()}},[b]);const H=s=>{const c=h.current;c.dive||c.gone||(c.tDist=s.dist,c.tEl=s.el,c.idle=0,j(s.id))},V=()=>{const s=!R;h.current.tDoppler=s?1:0,v(s)},K=()=>{const s=h.current;s.dive||s.gone||(s.dive={t:0,from:s.dist,fromEl:s.el},s.vaz=0,U("dive"))},f=()=>{Object.assign(h.current,{gone:!1,dist:42,tDist:19,el:.075,tEl:.075,fade:0,here:0,far:0,idle:0}),j("film"),z(null),U("orbit")},x=s=>{const c=h.current;if(c.dive||c.gone)return;const t={ArrowLeft:()=>{c.az-=.14},ArrowRight:()=>{c.az+=.14},ArrowUp:()=>{c.tEl=D(c.tEl+.1,-1.3,1.3)},ArrowDown:()=>{c.tEl=D(c.tEl-.1,-1.3,1.3)},"+":()=>{c.tDist=D(c.tDist/1.25,P,I)},"=":()=>{c.tDist=D(c.tDist/1.25,P,I)},"-":()=>{c.tDist=D(c.tDist*1.25,P,I)}};t[s.key]&&(s.preventDefault(),t[s.key](),c.idle=0)},i=s=>c=>{d.current[s]=c},p=m==="ready"||m==="loading";return a.jsxs(we,{id:"horizon",tone:"dark",className:`hz is-${M}`,stageRef:o,stageClass:"hz-stage",stageProps:{tabIndex:0,onKeyDown:x,"aria-label":"블랙홀 시뮬레이션. 드래그나 방향키로 돌고, 휠·핀치나 +/- 키로 다가갈 수 있습니다."},instruction:a.jsxs(a.Fragment,{children:[a.jsx("span",{className:"hz-hint-fine",children:"드래그로 돌고, 휠로 다가가 보세요."}),a.jsx("span",{className:"hz-hint-touch",children:"밀어서 돌고, 두 손가락으로 다가가 보세요."})]}),notesTitle:"어떻게 그리나요?",intro:"블랙홀 곁을 지나는 빛이 어떻게 휘는지, 화면의 모든 픽셀마다 실시간으로 계산합니다.",notes:Ae,hud:a.jsxs("dl",{className:"hz-hud","aria-live":"off",children:[a.jsxs("div",{children:[a.jsx("dt",{children:"블랙홀까지 거리"}),a.jsxs("dd",{children:[a.jsx("b",{ref:i("dist"),children:"19.0"}),a.jsx("small",{children:"Rs"})]}),a.jsx("span",{className:"hz-zone",ref:i("zone"),children:"원반 바깥"})]}),a.jsxs("div",{children:[a.jsx("dt",{children:"시간 지연"}),a.jsx("dd",{children:a.jsx("b",{ref:i("dil"),children:"×1.027"})}),a.jsxs("span",{className:"hz-zone",children:["여기서 1시간 = 바깥 ",a.jsx("i",{ref:i("hour"),children:"1시간 2분"})]})]}),a.jsxs("div",{className:"hz-clock",children:[a.jsx("dt",{children:"머문 시간 / 바깥 시간"}),a.jsxs("dd",{children:[a.jsx("b",{ref:i("here"),children:"0:00"}),a.jsx("small",{children:"/"}),a.jsx("b",{ref:i("far"),children:"0:00"})]})]})]}),controls:a.jsxs("div",{className:"hz-controls",children:[a.jsxs("div",{className:"hz-chips",role:"group","aria-label":"시점",children:[_e.map(s=>a.jsx("button",{type:"button","aria-pressed":E===s.id,disabled:!p||M!=="orbit",onClick:()=>H(s),children:s.label},s.id)),a.jsxs("button",{type:"button",role:"switch","aria-checked":R,className:"hz-switch",disabled:!p||M==="gone",onClick:V,children:[a.jsx("span",{className:"hz-switch-track",children:a.jsx("span",{})}),"도플러 효과 ",R?"켬":"끔"]})]}),a.jsx("button",{type:"button",className:"hz-dive",disabled:!p||M!=="orbit",onClick:K,children:M==="dive"?"떨어지는 중…":"지평선으로 뛰어들기"})]}),children:[a.jsx("canvas",{ref:e,role:"img","aria-label":"강착원반이 빛나는 블랙홀. 원반 뒤쪽의 빛이 중력에 휘어 블랙홀 위아래로 고리처럼 보입니다."},b),m==="loading"&&a.jsxs("div",{className:"hz-veil",children:[a.jsx("span",{className:"hz-pulse"}),"시공간 계산 준비 중"]}),(m==="unsupported"||m==="error"||m==="lost")&&a.jsxs("div",{className:"hz-veil hz-veil-solid",children:[a.jsx("p",{children:m==="unsupported"?"이 브라우저는 WebGL2를 지원하지 않아 블랙홀을 그릴 수 없습니다.":m==="lost"?"그래픽 장치가 초기화됐습니다.":"그래픽 셰이더를 준비하지 못했습니다."}),m==="unsupported"?a.jsx(ze,{to:"/",children:"실험실 목록으로 →"}):a.jsx("button",{type:"button",onClick:()=>{l("loading"),T(s=>s+1)},children:"다시 그리기"})]}),a.jsx("div",{className:"hz-gauge","aria-hidden":"true",children:a.jsxs("div",{className:"hz-gauge-rail",children:[Fe.map(([s,c])=>a.jsxs("span",{className:"hz-tick",style:{bottom:`${Math.log(s)/ve*100}%`},children:[a.jsxs("em",{children:[s," Rs"]}),c]},s)),a.jsx("span",{className:"hz-marker",ref:i("marker")})]})}),a.jsxs("p",{className:"hz-stats","aria-hidden":"true",children:["광선 ",a.jsx("b",{ref:i("rays"),children:"0"}),"개 / 프레임 · 최대 ",a.jsx("b",{ref:i("steps"),children:"320"}),"단계 적분 · ",a.jsx("b",{ref:i("fps"),children:"60"})," fps"]}),M==="gone"&&y&&a.jsxs("div",{className:"hz-gone",role:"dialog","aria-label":"사건의 지평선 통과",children:[a.jsx("span",{className:"hz-eyebrow",children:"r < 1 Rs"}),a.jsx("h2",{children:"지평선을 넘었습니다."}),a.jsxs("p",{children:["이제 여기서 나가는 빛은 없습니다. 바깥에서는 당신이 지평선 앞에서",a.jsx("br",{className:"hz-wide"})," 점점 느려지다 멈춘 채 붉게 사라지는 모습만 보입니다."]}),a.jsxs("p",{className:"hz-gone-time",children:["머문 시간 ",a.jsx("b",{children:$(y.here)})," · 그동안 바깥에서 흐른 시간 ",a.jsx("b",{children:$(y.far)})]}),a.jsx("button",{type:"button",onClick:f,autoFocus:!0,children:"다시 바깥에서 시작"})]})]})}export{$e as default};
