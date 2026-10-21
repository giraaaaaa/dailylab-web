import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { tileMaps, microBeads, clothMap, desilverMap, palmStamp, greaseText } from './textures'

/* 김 서린 거울. 밤, 전구 하나뿐인 욕실. 세면대 위 거울에 김이 서려 있다.
   - 거울에 비친 건 등 뒤의 진짜 욕실(문과 문에 걸린 가운, 욕조와 커튼, 선반, 수건, 문 너머 복도). 거울 평면에 대칭인 카메라로 따로 그려 둔다(바뀔 때만).
     그 방에 서 있어야 할 사람은 비치지 않는다.
   - 김: GPU에서 칸마다 김 두께(R), 손가락 기름(G), 물기(B)를 계산한다. 아래쪽(세면대 김)부터, 자리마다 다른 빠르기로 다시 서리고,
     기름 묻은 자리는 잘 안 서린다(진짜 현상). 그래서 다시 서릴 때 손가락으로 쓴 글씨가 드러난다.
   - 물방울: 닦은 가장자리에 맺히고, 무거워지면 흘러내리며 길을 남긴다. 방울마다 등 뒤 욕실을 뒤집어 비추는 작은 렌즈.
   - 이상한 것: 저쪽에서 쓴 글씨(거울상), 많이 쓰면 대답, 김 위에 안쪽에서 누른 손자국, 유리 너머 노크.
     등 뒤의 문은 김에 가려 안 보일 때만 조금씩 더 열린다.
   - 예산: 손대지 않고 김도 다 서리면 그리지 않는다. 반사는 바뀔 때만 다시 그리고, 저절로 서리는 동안은 30fps. 재질은 모두 코드로 그린다. */

const MEMORY = 'dl-mirror'
const MW = 0.9, MH = 0.68 // 거울 크기(m)
const MX = 0, MY = 1.5, MZ = 0.02 // 거울 가운데, 유리 면
const RW = 0.9, RD = 2.9, RH = 2.28 // 방: 폭의 절반, 깊이, 높이
const BULB = new THREE.Vector3(0, 1.97, 0.16)
const FW = 512, FH = Math.round((512 * MH) / MW)
const ASPECT = MW / MH
const FIRST_WORDS = ['안녕', '여기', '보여요?', '또 왔네', '쉿']
const REPLIES = ['뭐라고 썼어요?', '나도 보여요', '거기 추워요?', '천천히 닦아요', '뒤에 누구예요?']
const RUB = [[0.36, 0.56], [2.24, 2.6], [2.8, 3.0], [3.44, 3.56], [3.88, 4.04]]
const COBALT = '#2a4bff'
const SEGS = 24
const DROP_PAD = 1.4 // 물방울 판 / 방울 지름(둘레 빛 번짐 자리)
const BANDS = [0.62, 0.42, 0.8, 0.24, 0.52, 0.9, 0.1, 0.33, 0.71] // 닦기 버튼이 차례로 훔치는 높이

const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

function readMemory() { try { return { visits: 0, door: 13, ...JSON.parse(localStorage.getItem(MEMORY) || '{}') } } catch { return { visits: 0, door: 13 } } }
function writeMemory(m) { try { localStorage.setItem(MEMORY, JSON.stringify(m)) } catch { /* 저장 불가 */ } }

const QUAD_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }`

// 김 격자 한 단계: 다시 서림, 물기 마름, 손가락·물방울 길, 도장(기름 글씨, 손자국)
// 김 두께는 한 프레임에 아주 조금씩(1/255보다 작게) 자란다. 8비트 칸에 그냥 쓰면 반올림에 먹혀 영영 안 서리니,
// 두께를 두 칸에 나눠 담는다: R = 눈금(uQ) 단위로 내린 값, A = 눈금 아래 나머지(0~1). 반정밀도 칸도 같은 방식(눈금 1/1024).
// 물기(B)는 줄어드는 양을 확률적으로 반올림해 평균이 맞게 한다(8비트일 때만).
const SIM_FRAG = `
uniform sampler2D uPrev, uStamp;
uniform float uDt, uSteam, uInit, uAspect, uStampAmt, uStampClear, uStampGrease, uStampProg, uQ, uQB, uSeed;
uniform vec4 uStampRect;
uniform vec4 uSeg[${SEGS}];
uniform vec4 uSegP[${SEGS}];
uniform int uSegN;
varying vec2 vUv;
${NOISE}
float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0); return length(pa - ba * h); }
vec4 pack(float F, float Gr, float B) { float k = F / uQ; float hi = floor(k + 1e-4); return vec4(hi * uQ, Gr, B, clamp(k - hi, 0.0, 1.0)); }
void main() {
  vec2 asp = vec2(uAspect, 1.0);
  if (uInit > 0.5) { gl_FragColor = pack(0.8 + 0.17 * noise(vUv * asp * 2.6 + 1.7) + 0.05 * noise(vUv * 9.0), 0.0, 0.0); return; } // 군데군데 엷어 방이 흐릿하게 비친다
  vec4 s = texture2D(uPrev, vUv);
  float F = s.r + s.a * uQ, Gr = s.g, B = s.b;
  float patchy = 0.5 + 0.95 * noise(vUv * asp * 6.0) + 0.3 * noise(vUv * asp * 29.0);
  float fromBelow = mix(1.6, 0.62, vUv.y); // 세면대 김이 아래부터
  float grow = uSteam * patchy * fromBelow * (1.0 - 0.92 * Gr) * (1.0 - 0.85 * B);
  F += (1.0 - F) * grow * 0.085 * uDt;
  F -= F * max(0.0, 0.25 - uSteam) * 0.02 * uDt;
  float dry = uDt * 0.2;
  if (uQB > 0.0) dry = floor(dry / uQB + hash(gl_FragCoord.xy * 0.731 + uSeed)) * uQB;
  B = max(0.0, B - dry);
  vec2 p = vUv * asp;
  for (int i = 0; i < ${SEGS}; i++) {
    if (i >= uSegN) break;
    vec4 sg = uSeg[i]; vec4 sp = uSegP[i];
    float d = segDist(p, sg.xy * asp, sg.zw * asp);
    float r = sp.x;
    float rag = 0.86 + 0.28 * noise(p * 150.0 + float(i));
    float w = smoothstep(r * rag, r * 0.4, d) * sp.y;
    F *= 1.0 - w * 0.97;
    if (sp.z < 0.5) { Gr = max(Gr, smoothstep(r * 0.8, r * 0.2, d) * sp.w * sp.y); B = max(B, w * 0.8); }
    else B = max(B, w * 0.95);
  }
  if (uStampAmt > 0.0) {
    vec2 q = (vUv - uStampRect.xy) / (uStampRect.zw - uStampRect.xy);
    if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0 && 1.0 - q.x <= uStampProg) { // 거울 안쪽에서 쓰면 우리 눈엔 오른쪽부터 써진다
      float m = texture2D(uStamp, q).r;
      Gr = max(Gr, m * uStampGrease * uStampAmt);
      F *= 1.0 - m * uStampClear * uStampAmt;
    }
  }
  gl_FragColor = pack(clamp(F, 0.0, 1.0), clamp(Gr, 0.0, 1.0), clamp(B, 0.0, 1.0));
}`

// 읽어 오기용 축소(통계·문 둘레 김·물방울)
const SHRINK_FRAG = `uniform sampler2D uField; uniform vec2 uTexel; varying vec2 vUv;
void main() { vec4 a = texture2D(uField, vUv + uTexel * vec2(-1.5, -1.5)) + texture2D(uField, vUv + uTexel * vec2(1.5, -1.5)) + texture2D(uField, vUv + uTexel * vec2(-1.5, 1.5)) + texture2D(uField, vUv + uTexel * vec2(1.5, 1.5)); gl_FragColor = a * 0.25; }`

const MIRROR_VERT = `
uniform mat4 uTexMat;
varying vec2 vUv; varying vec4 vRefl;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vRefl = uTexMat * wp; gl_Position = projectionMatrix * viewMatrix * wp; }`
const MIRROR_FRAG = `
uniform sampler2D uRefl, uField, uMicro, uDesilver;
uniform vec2 uFieldTexel;
uniform float uAspect, uBulb, uTime, uQ;
varying vec2 vUv; varying vec4 vRefl;
${NOISE}
float fog(vec2 uv) { vec4 f = texture2D(uField, uv); return f.r + f.a * uQ; }
void main() {
  vec4 f = texture2D(uField, vUv);
  float raw = f.r + f.a * uQ;
  float F = smoothstep(0.03, 0.95, raw);
  vec2 t2 = uFieldTexel * 2.0, t6 = uFieldTexel * 6.0;
  float edge = clamp(length(vec2(fog(vUv + vec2(t2.x, 0.0)) - fog(vUv - vec2(t2.x, 0.0)), fog(vUv + vec2(0.0, t2.y)) - fog(vUv - vec2(0.0, t2.y)))) * 2.6, 0.0, 1.0);
  // 김 층의 두께를 높이로 보고 기울기를 낸다: 닦은 자리 아래 둔덕은 전구 쪽(위)을 향해 빛나고, 위 둔덕은 그늘진다
  vec2 hg = vec2(fog(vUv + vec2(t6.x, 0.0)) - fog(vUv - vec2(t6.x, 0.0)), fog(vUv + vec2(0.0, t6.y)) - fog(vUv - vec2(0.0, t6.y)));
  vec3 n = normalize(vec3(-hg * 1.6, 1.0));
  float relief = dot(n, normalize(vec3(0.0, 0.8, 0.6))) - 0.6;
  float lip = fog(vUv + vec2(0.0, uFieldTexel.y * 9.0)) - raw; // 바로 위에 김이 있으면 그 둔덕 그늘이 드리운다
  vec2 ruv = vRefl.xy / vRefl.w;
  ruv += (vec2(noise(vUv * 40.0 + uTime * 0.2), noise(vUv * 40.0 + 7.0)) - 0.5) * f.b * 0.003; // 물기에 일렁임
  vec3 sharp = textureLod(uRefl, ruv, 0.0).rgb;
  float lod = 1.5 + F * 4.0;
  vec2 o = vec2(0.006, 0.004) * F;
  vec3 blur = (textureLod(uRefl, ruv, lod) + textureLod(uRefl, ruv + o, lod) + textureLod(uRefl, ruv - o, lod) + textureLod(uRefl, ruv + vec2(-o.y, o.x), lod) + textureLod(uRefl, ruv - vec2(-o.y, o.x), lod)).rgb * 0.2;
  vec3 haze = textureLod(uRefl, ruv + vec2(0.0, 0.02), 6.5).rgb; // 김 속으로 넓게 번진 등 뒤 빛
  haze = mix(vec3(dot(haze, vec3(0.3, 0.55, 0.15))), haze, 0.5);
  // 김: 전구에 비쳐 위쪽 가운데가 환하게 피어오르는 우윳빛. 아주 작은 물방울이 두 겹(겹마다 크기·밝기가 달라 두께가 보인다)
  vec2 a = vUv * vec2(uAspect, 1.0);
  float glow = exp(-distance(a, vec2(0.5 * uAspect, 1.14)) * 1.4);
  float lit = (0.26 + 1.2 * glow) * uBulb;
  vec4 mb = texture2D(uMicro, a * 7.0);
  vec4 mb2 = texture2D(uMicro, a * 3.1 + 0.37);
  vec4 mb3 = texture2D(uMicro, a * 13.0 + 0.71);
  float thick = 0.84 + 0.3 * noise(a * 2.4 + 3.1) + 0.1 * noise(a * 9.0); // 김 두께가 자리마다 다르다(구름처럼 엷고 짙은 데)
  vec3 milk = vec3(0.6, 0.6, 0.62) * lit * thick;
  vec3 fogCol = blur * 0.3 + haze * 0.4 + milk * (0.78 + 0.22 * mb.r + 0.12 * mb3.r) + vec3(1.0) * (mb.g * 0.14 + mb3.g * 0.1) * lit;
  fogCol *= 1.0 + relief * 0.9;
  // 얇은 김은 반사가 흐리게 비치는 반투명 막, 두꺼운 김은 빛을 머금은 막
  vec3 col = mix(mix(sharp, blur, smoothstep(0.0, 0.5, F)), fogCol, F);
  col *= 1.0 - clamp(lip * 1.6, 0.0, 1.0) * 0.32 * (1.0 - F);
  col += vec3(1.0) * max(relief, 0.0) * lit * 0.35 * smoothstep(0.1, 0.5, raw);
  // 닦은 가장자리에 맺힌 물방울들: 빛을 받아 반짝이는 알갱이
  col = mix(col, col * 0.85 + vec3(0.1) * lit, edge * mb2.r * 0.5);
  col += vec3(1.0) * edge * (mb2.g * 1.1 + mb.g * 0.4) * lit * 0.75;
  // 기름 자국: 맑은 곳에서 아주 옅은 번짐
  col = mix(col, col * 0.93 + vec3(0.02) * lit, f.g * (1.0 - F) * 0.25);
  // 오래된 거울: 가장자리부터 은박이 삭았다
  float ds = texture2D(uDesilver, vUv).r;
  col *= (1.0 - ds * 0.55) * 0.93;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(vUv * 977.0 + uTime) - 0.5) / 255.0;
}`

const DROP_VERT = `
uniform mat4 uTexMat;
varying vec2 vUv; varying vec4 vRefl; varying float vSize;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vRefl = uTexMat * c;
  vSize = length(instanceMatrix[0].xyz) / ${DROP_PAD.toFixed(2)};
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
// 물방울 하나 = 작은 볼록 렌즈. 등 뒤 방을 뒤집어 모아 비추고(그래서 둘레보다 밝다), 전구가 또렷한 점으로 맺히고,
// 아래쪽에 모인 빛이 초승달처럼 빛난다. 테두리만 얇게 어둡다. 판은 방울보다 조금 커서 둘레에 옅은 빛 번짐을 둔다
const DROP_FRAG = `
uniform sampler2D uRefl;
uniform float uBulb;
varying vec2 vUv; varying vec4 vRefl; varying float vSize;
void main() {
  vec2 q = (vUv * 2.0 - 1.0) * ${DROP_PAD.toFixed(2)};
  float d = length(q);
  if (d > ${DROP_PAD.toFixed(2)}) discard;
  if (d > 1.0) { gl_FragColor = vec4(vec3(1.0), exp(-(d - 1.0) * 10.0) * 0.16 * uBulb); return; }
  float h = sqrt(1.0 - d * d);
  vec3 n = normalize(vec3(q * 0.95, h));
  vec2 ruv = vRefl.xy / vRefl.w - q * vSize * 6.0;
  vec3 c = textureLod(uRefl, ruv, 1.0).rgb * 1.7 + vec3(0.06) * uBulb;
  vec3 L = normalize(vec3(-0.3, 0.75, 0.6));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
  c += vec3(1.0) * spec * 3.2 * uBulb;
  c += vec3(1.0) * smoothstep(0.24, 0.06, length(q - vec2(-0.26, 0.34))) * 2.4 * uBulb; // 전구가 맺힌 점
  c += vec3(1.0) * smoothstep(0.5, 0.88, d) * smoothstep(0.05, 0.75, -q.y) * 1.2 * uBulb; // 아래쪽 초승달
  c *= mix(0.4, 1.0, smoothstep(1.0, 0.86, d));
  gl_FragColor = vec4(c, smoothstep(1.0, 0.9, d));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const STREAM_FRAG = `
uniform float uTime, uOn;
varying vec2 vUv;
${NOISE}
void main() {
  float n = noise(vec2(vUv.x * 6.0, vUv.y * 40.0 + uTime * 26.0));
  float core = smoothstep(0.5, 0.1, abs(vUv.x - 0.5));
  float a = (0.25 + 0.55 * n) * core * uOn;
  gl_FragColor = vec4(vec3(0.82, 0.84, 0.88) * (0.6 + n * 0.6), a);
}`

export function createMirror(canvas, { sfx, onStats }) {
  const small = window.matchMedia('(max-width: 760px)').matches
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('webgl')
  const maxDpr = Math.min(window.devicePixelRatio || 1, small ? 1.6 : 1.5)
  let dpr = maxDpr
  renderer.setPixelRatio(dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false
  const floatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')

  const memory = readMemory()
  memory.visits += 1
  memory.door = clamp((memory.door ?? 13) + (memory.visits > 1 ? 3 : 0), 13, 58) // 올 때마다 조금 더 열려 있다
  writeMemory(memory)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#040405')
  const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 30)
  camera.layers.enable(1)
  const reflCam = new THREE.PerspectiveCamera(36, 1, 0.03, 30)
  reflCam.layers.set(0)
  // 주변 반사 지도는 반정밀도 칸에 굽는다. 그걸 못 그리는 기기에선 빼고(크롬·도기는 조금 덜 반짝인다) 오류 없이 간다
  let env = null
  if (floatOK) { const pmrem = new THREE.PMREMGenerator(renderer); env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose() }

  /* ---------- 빛 ---------- */
  const hemi = new THREE.HemisphereLight('#a0a4ad', '#070708', 0.08)
  const bulbLight = new THREE.PointLight('#f2ece2', 7.5, 0, 1.35)
  bulbLight.position.copy(BULB)
  bulbLight.castShadow = true
  bulbLight.shadow.mapSize.set(512, 512)
  bulbLight.shadow.bias = -0.002
  bulbLight.shadow.radius = 3
  // 복도 빛은 그림자 없이 벽을 뚫지 않도록 닿는 거리를 복도 안으로만 짧게 끊는다
  const hall = new THREE.PointLight(COBALT, 0, 1.6, 1.2) // 문 너머 복도
  hall.position.set(0.38, 1.85, RD + 1.6)
  const hallSpill = new THREE.PointLight(COBALT, 0, 0.62, 1.6) // 문 틈 바로 밖(문이 쓸고 지나가는 자리 밖): 문설주와 복도 벽에 푸른 빛
  hallSpill.position.set(-0.15, 1.3, RD + 0.35)
  // 천장·벽에서 되튄 빛(그림자 없이 아주 약하게): 등 뒤 방이 거울에 알아볼 만큼은 보이게
  const bounce = new THREE.PointLight('#d9d6d0', 1.1, 0, 1.2)
  bounce.position.set(0, RH - 0.08, 2.1) // 등 뒤 천장 가까이: 문과 선반이 위에서 비스듬히 빛을 받는다
  scene.add(hemi, bulbLight, hall, hallSpill, bounce)

  /* ---------- 재질 ---------- */
  const wall = tileMaps({ base: 62, spread: 9, n: 4 })
  wall.map.repeat.set((RW * 2) / 0.6, RH / 0.6); wall.normalMap.repeat.copy(wall.map.repeat); wall.roughnessMap.repeat.copy(wall.map.repeat)
  const wallMat = new THREE.MeshStandardMaterial({ map: wall.map, normalMap: wall.normalMap, roughnessMap: wall.roughnessMap, roughness: 1, envMap: env, envMapIntensity: 0.25 })
  const side = tileMaps({ base: 58, spread: 9, n: 4 })
  side.map.repeat.set(RD / 0.6, RH / 0.6); side.normalMap.repeat.copy(side.map.repeat); side.roughnessMap.repeat.copy(side.map.repeat)
  const sideMat = new THREE.MeshStandardMaterial({ map: side.map, normalMap: side.normalMap, roughnessMap: side.roughnessMap, roughness: 1, envMap: env, envMapIntensity: 0.2 })
  const floor = tileMaps({ base: 34, spread: 7, n: 3, grout: 0.035 })
  floor.map.repeat.set((RW * 2) / 0.9, RD / 0.9); floor.normalMap.repeat.copy(floor.map.repeat); floor.roughnessMap.repeat.copy(floor.map.repeat)
  const floorMat = new THREE.MeshStandardMaterial({ map: floor.map, normalMap: floor.normalMap, roughnessMap: floor.roughnessMap, roughness: 1, envMap: env, envMapIntensity: 0.15 })
  const plasterMat = new THREE.MeshStandardMaterial({ color: '#3b3b3e', roughness: 0.95 })
  const ceramic = new THREE.MeshStandardMaterial({ color: '#b9b8b5', roughness: 0.2, envMap: env, envMapIntensity: 0.45 })
  const chrome = new THREE.MeshStandardMaterial({ color: '#cfd0d3', metalness: 1, roughness: 0.16, envMap: env, envMapIntensity: 0.9 })
  const backT = tileMaps({ base: 60, spread: 9, n: 4 }) // 뒷벽: UV를 미터로 깔아 조각끼리 줄눈이 이어진다
  const backMat = new THREE.MeshStandardMaterial({ map: backT.map, normalMap: backT.normalMap, roughnessMap: backT.roughnessMap, roughness: 1, envMap: env, envMapIntensity: 0.2 })
  const doorMat = new THREE.MeshStandardMaterial({ color: '#6c6b68', roughness: 0.48, envMap: env, envMapIntensity: 0.25 }) // 반광 페인트: 전구 빛이 판 몰딩에 걸린다
  const trimMat = new THREE.MeshStandardMaterial({ color: '#82817d', roughness: 0.42, envMap: env, envMapIntensity: 0.3 })
  const plastic = new THREE.MeshStandardMaterial({ color: '#d6d6d3', roughness: 0.32, envMap: env, envMapIntensity: 0.4 })
  const darkGlass = new THREE.MeshStandardMaterial({ color: '#2c2d30', roughness: 0.1, envMap: env, envMapIntensity: 0.9 })
  const counterMat = new THREE.MeshStandardMaterial({ color: '#232325', roughness: 0.45, envMap: env, envMapIntensity: 0.3 })
  const cloth = clothMap()
  const curtainMat = new THREE.MeshStandardMaterial({ map: cloth, color: '#e4e4e6', roughness: 0.85, side: THREE.DoubleSide })
  const towelMat = new THREE.MeshStandardMaterial({ map: cloth, color: '#e6e5e1', roughness: 1, side: THREE.DoubleSide })
  const robeMat = new THREE.MeshStandardMaterial({ map: cloth, color: '#d2d2d5', roughness: 1, side: THREE.DoubleSide, vertexColors: true })
  const recessMat = new THREE.MeshStandardMaterial({ color: '#4c4b49', roughness: 0.6 })
  const aoH = shadeTexture(false), aoV = shadeTexture(true)

  const add = (mesh, layer = 0, { cast = true, receive = true } = {}) => { mesh.layers.set(layer); mesh.castShadow = cast; mesh.receiveShadow = receive; scene.add(mesh); return mesh }
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)

  /* ---------- 앞벽(거울이 걸린 벽, 화면에만) ---------- */
  const front = plane(RW * 2, RH, wallMat); front.position.set(0, RH / 2, 0)
  add(front, 1, { cast: false })
  // 거울 테두리(얇은 금속)
  const frameMat = new THREE.MeshStandardMaterial({ color: '#77787c', metalness: 0.9, roughness: 0.35, envMap: env, envMapIntensity: 0.6 })
  for (const [w, h, x, y] of [[MW + 0.04, 0.02, 0, MH / 2 + 0.01], [MW + 0.04, 0.02, 0, -MH / 2 - 0.01], [0.02, MH, MW / 2 + 0.01, 0], [0.02, MH, -MW / 2 - 0.01, 0]]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.03, 2, 0.006), frameMat)
    b.position.set(MX + x, MY + y, MZ - 0.004)
    add(b, 1)
  }
  if (!env) for (const m of [chrome, frameMat]) { m.metalness = 0.35; m.roughness = 0.32 } // 주변 반사 지도가 없으면 금속이 새까매지니 반쯤만 금속으로

  /* ---------- 등 뒤의 방(거울에만 비친다) ---------- */
  // 좁은 욕실이라 거울 가장자리로 옆벽이 깊이 쪽으로 물러나는 게 보인다. 천장 몰딩, 욕조와 반쯤 걷힌 커튼, 선반, 문에 걸린 가운.
  const back = new THREE.Group()
  const fl = plane(RW * 2, RD + 0.2, floorMat); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, RD / 2); back.add(fl)
  const ce = plane(RW * 2, RD, plasterMat); ce.rotation.x = Math.PI / 2; ce.position.set(0, RH, RD / 2); back.add(ce)
  const lw = plane(RD, RH, sideMat); lw.rotation.y = Math.PI / 2; lw.position.set(-RW, RH / 2, RD / 2); back.add(lw)
  const rw = plane(RD, RH, sideMat); rw.rotation.y = -Math.PI / 2; rw.position.set(RW, RH / 2, RD / 2); back.add(rw)
  // 뒷벽(타일)과 문 구멍(문 폭 0.72, 높이 2.02, 가운데에서 조금 오른쪽). 타일 눈금이 조각마다 이어지게 UV를 미터로 깐다
  const DX0 = 0.02, DX1 = 0.74, DH = 2.02
  const tiled = (w, h, x0, y0) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (RW - x0 - (1 - uv.getX(i)) * w) / 0.6, (y0 + uv.getY(i) * h) / 0.6)
    return new THREE.Mesh(g, backMat)
  }
  for (const [x0, x1, y0, y1] of [[-RW, DX0, 0, RH], [DX1, RW, 0, RH], [DX0, DX1, DH, RH]]) {
    const p = tiled(x1 - x0, y1 - y0, x0, y0); p.rotation.y = Math.PI; p.position.set((x0 + x1) / 2, (y0 + y1) / 2, RD); back.add(p)
  }
  // 문틀: 벽에서 도드라진 몰딩(빛을 받는 모서리)
  for (const [w, h, x, y] of [[0.07, DH + 0.07, DX0 - 0.035, (DH + 0.07) / 2], [0.07, DH + 0.07, DX1 + 0.035, (DH + 0.07) / 2], [DX1 - DX0 + 0.14, 0.07, (DX0 + DX1) / 2, DH + 0.035]]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.05, 2, 0.012), trimMat); b.position.set(x, y, RD - 0.022); back.add(b)
  }
  for (const x of [DX0 - 0.005, DX1 + 0.005]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.01, DH, 0.12), trimMat); j.position.set(x, DH / 2, RD + 0.06); back.add(j) } // 문설주 안쪽 면
  const hinge = new THREE.Group(); hinge.position.set(DX1, 0, RD)
  const DW = DX1 - DX0
  const door = new THREE.Mesh(new RoundedBoxGeometry(DW - 0.01, DH - 0.01, 0.04, 2, 0.006), doorMat)
  door.position.set(-DW / 2, DH / 2, 0.02)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), chrome); knob.position.set(-DW + 0.07, 1.0, -0.035)
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18), chrome); rose.rotation.x = Math.PI / 2; rose.position.set(-DW + 0.07, 1.0, -0.004)
  // 오목한 판 두 장: 안쪽은 그늘진 듯 어둡고, 테두리 몰딩은 도드라져 빛을 받는다
  for (const [y, h] of [[0.52, 0.66], [1.43, 0.86]]) {
    const pw = DW - 0.2
    const inset = new THREE.Mesh(new THREE.PlaneGeometry(pw, h), recessMat); inset.rotation.y = Math.PI; inset.position.set(-DW / 2, y, -0.001); hinge.add(inset)
    for (const [w2, h2, x, yy] of [[pw + 0.04, 0.04, 0, h / 2], [pw + 0.04, 0.04, 0, -h / 2], [0.04, h + 0.04, -pw / 2, 0], [0.04, h + 0.04, pw / 2, 0]]) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w2, h2, 0.018, 2, 0.007), trimMat); m.position.set(-DW / 2 + x, y + yy, -0.006); hinge.add(m)
    }
  }
  hinge.add(door, knob, rose)
  // 문 안쪽 고리에 걸린 가운(문과 같이 움직인다). 정면에서 빛이 와도 주름이 읽히게 골짜기를 꼭짓점 색으로 어둡게
  const robeG = new THREE.PlaneGeometry(0.4, 0.94, 40, 36)
  const rp = robeG.attributes.position
  const robeC = []
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), t = (0.47 - rp.getY(i)) / 0.94 // 위 0 → 아래 1
    const shoulder = 0.22 + 0.78 * smooth(0, 0.22, t) + 0.08 * t // 고리에 걸린 위쪽은 모이고, 어깨에서 퍼져 아래로 조금 벌어진다
    const fold = Math.sin(x * 34 + t * 2.4 + Math.sin(x * 9) * 1.5) * (0.4 + 0.6 * smooth(0.05, 0.4, t))
    const z = fold * 0.022 + 0.06 * Math.sin(smooth(0, 0.35, t) * Math.PI * 0.5) * (1 - (x / 0.2) ** 2) * (1 - 0.4 * t)
    rp.setX(i, x * shoulder); rp.setZ(i, z)
    const lapel = t > 0.07 && t < 0.46 ? smooth(0.012, 0, Math.abs(Math.abs(x) - (0.46 - t) * 0.26)) : 0 // V자 깃
    const belt = smooth(0.02, 0, Math.abs(t - 0.5)) * 0.18
    const k = 0.5 + 0.5 * (fold * 0.5 + 0.5) - 0.25 * (Math.abs(x) / 0.2) ** 3 - 0.2 * (1 - smooth(0, 0.15, t)) - 0.35 * lapel - belt
    robeC.push(k, k, k)
  }
  robeG.setAttribute('color', new THREE.Float32BufferAttribute(robeC, 3))
  robeG.computeVertexNormals()
  const robe = new THREE.Mesh(robeG, robeMat); robe.rotation.y = Math.PI; robe.position.set(-DW / 2 + 0.04, 1.35, -0.045)
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), chrome); hook.rotation.x = Math.PI / 2; hook.position.set(-DW / 2 + 0.04, 1.82, -0.03)
  hinge.add(robe, hook)
  back.add(hinge)
  // 문 너머 복도: 어둡고, 끝에 코발트빛. 문 틈으로 복도 벽이 그 빛을 받아 깊이가 보인다
  const hallMat = new THREE.MeshStandardMaterial({ color: '#2a2a2d', roughness: 0.9 })
  const hf = plane(1.5, 3, hallMat); hf.rotation.x = -Math.PI / 2; hf.position.set((DX0 + DX1) / 2, 0, RD + 1.5); back.add(hf)
  const hc = plane(1.5, 3, hallMat); hc.rotation.x = Math.PI / 2; hc.position.set((DX0 + DX1) / 2, 2.3, RD + 1.5); back.add(hc)
  for (const x of [DX0 - 0.36, DX1 + 0.36]) { const hw = plane(3, 2.3, hallMat); hw.rotation.y = x < DX0 ? Math.PI / 2 : -Math.PI / 2; hw.position.set(x, 1.15, RD + 1.5); back.add(hw) }
  const glowEnd = plane(0.62, 1.7, new THREE.MeshBasicMaterial({ color: COBALT, transparent: true, opacity: 0.0 }))
  glowEnd.rotation.y = Math.PI; glowEnd.position.set((DX0 + DX1) / 2, 1.05, RD + 2.95); back.add(glowEnd)
  // 욕조(왼쪽 안쪽)와 반쯤 걷힌 샤워 커튼: 커튼은 뒷벽과 나란히 걸려 왼쪽으로 모여 있다
  const TX1 = -0.12, TZ0 = 2.16
  const tub = new THREE.Mesh(new RoundedBoxGeometry(TX1 + RW, 0.56, RD - TZ0, 3, 0.03), ceramic); tub.position.set((TX1 - RW) / 2, 0.28, (TZ0 + RD) / 2); back.add(tub)
  const cg = new THREE.PlaneGeometry(0.5, 1.52, 70, 1)
  const cp = cg.attributes.position
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i); cp.setZ(i, Math.sin(x * 58) * 0.035 + Math.sin(x * 19 + 1) * 0.02 + (x + 0.25) * 0.08) }
  cg.computeVertexNormals()
  const curtain = new THREE.Mesh(cg, curtainMat); curtain.position.set(-RW + 0.27, 1.3, TZ0 + 0.02); back.add(curtain)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, TX1 + RW + 0.02, 8), chrome); rod.rotation.z = Math.PI / 2; rod.position.set((TX1 - RW) / 2, 2.07, TZ0 + 0.02); back.add(rod)
  for (let i = 0; i < 9; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0025, 6, 14), chrome); const x = -RW + 0.05 + (i < 7 ? i * 0.068 : 0.5 + (i - 7) * 0.12); ring.position.set(x, 2.07, TZ0 + 0.02); ring.rotation.y = Math.PI / 2; back.add(ring) }
  // 오른쪽 벽: 수건걸이와 수건, 그 위 선반(병, 컵과 칫솔, 뚜껑 달린 병, 갠 수건)
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), chrome); bar.rotation.x = Math.PI / 2; bar.position.set(RW - 0.06, 1.25, 1.75); back.add(bar)
  const tg = new THREE.PlaneGeometry(0.5, 0.7, 20, 1)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i); tp.setZ(i, Math.sin(x * 18) * 0.012) }
  tg.computeVertexNormals()
  const towel = new THREE.Mesh(tg, towelMat); towel.rotation.y = -Math.PI / 2; towel.position.set(RW - 0.07, 0.93, 1.75); back.add(towel)
  const SY = 1.6, SZ0 = 1.98, SZ1 = 2.62
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.024, SZ1 - SZ0, 2, 0.006), trimMat); board.position.set(RW - 0.08, SY, (SZ0 + SZ1) / 2); back.add(board)
  for (const z of [SZ0 + 0.07, SZ1 - 0.07]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.014), chrome); br.position.set(RW - 0.06, SY - 0.035, z); back.add(br) }
  const onShelf = (pts, mat, x, z, segs = 24) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), segs), mat); m.position.set(RW - x, SY + 0.012, z); back.add(m); return m }
  onShelf([[0, 0], [0.03, 0], [0.032, 0.006], [0.032, 0.16], [0.024, 0.19], [0.011, 0.2], [0.011, 0.225], [0, 0.225]], plastic, 0.08, SZ0 + 0.08)
  const pump = onShelf([[0, 0], [0.027, 0], [0.029, 0.006], [0.029, 0.12], [0.018, 0.135], [0.008, 0.14], [0.008, 0.162], [0, 0.162]], darkGlass, 0.075, SZ0 + 0.17)
  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.035), chrome); nozzle.position.set(0, 0.164, -0.014); pump.add(nozzle)
  onShelf([[0, 0], [0.025, 0], [0.03, 0.095], [0.027, 0.095], [0.022, 0.006], [0, 0.006]], ceramic, 0.075, SZ0 + 0.29)
  for (const [tilt, tw, c] of [[0.2, -0.3, plastic], [-0.16, 0.5, darkGlass]]) {
    const brush = new THREE.Mesh(new RoundedBoxGeometry(0.009, 0.18, 0.013, 1, 0.004), c)
    brush.position.set(RW - 0.075 + Math.sin(tilt) * 0.06, SY + 0.11, SZ0 + 0.29 + Math.sin(tw) * 0.01); brush.rotation.set(tw * 0.3, 0, tilt); back.add(brush)
  }
  onShelf([[0, 0], [0.04, 0], [0.042, 0.006], [0.042, 0.07], [0.036, 0.075], [0, 0.075]], darkGlass, 0.08, SZ0 + 0.41)
  onShelf([[0, 0], [0.039, 0], [0.04, 0.02], [0, 0.02]], chrome, 0.08, SZ0 + 0.41).position.y += 0.075
  const folded = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.07, 0.15, 3, 0.022), towelMat); folded.position.set(RW - 0.08, SY + 0.047, SZ1 - 0.1); back.add(folded)
  // 천장 몰딩(뒷벽·옆벽 위를 한 바퀴): 천장 모서리가 보여 방의 깊이가 읽힌다
  for (const [w, x, z, ry] of [[RW * 2, 0, RD - 0.035, 0], [RD, -RW + 0.035, RD / 2, Math.PI / 2], [RD, RW - 0.035, RD / 2, Math.PI / 2]]) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(w, 0.075, 0.07, 2, 0.02), trimMat); c.position.set(x, RH - 0.0375, z); c.rotation.y = ry; back.add(c)
  }
  // 구석 그늘(모서리에 빛이 덜 닿는 자리): 아주 옅은 검은 띠
  const shade = (w, h, alpha, x, y, z, ry, dir) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#000', alphaMap: dir === 'v' ? aoV : aoH, transparent: true, opacity: alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
    m.position.set(x, y, z); m.rotation.y = ry; back.add(m); return m
  }
  shade(RW * 2, 0.35, 0.55, 0, RH - 0.075 - 0.175, RD - 0.004, Math.PI, 'h') // 뒷벽 위
  shade(RD, 0.35, 0.5, -RW + 0.004, RH - 0.075 - 0.175, RD / 2, Math.PI / 2, 'h')
  shade(RD, 0.35, 0.5, RW - 0.004, RH - 0.075 - 0.175, RD / 2, -Math.PI / 2, 'h')
  for (const s of [-1, 1]) {
    const m = shade(0.3, RH, 0.45, s * (RW - 0.15), RH / 2, RD - 0.004, Math.PI, 'v'); if (s < 0) m.rotation.z = Math.PI // 뒷벽 양쪽 구석
    const n = shade(0.3, RH, 0.45, s * (RW - 0.004), RH / 2, RD - 0.15, -s * Math.PI / 2, 'v'); if (s > 0) n.rotation.z = Math.PI // 옆벽 안쪽 구석
  }
  back.traverse((o) => { if (o.isMesh) { o.layers.set(0); const lit = !o.material.isMeshBasicMaterial; o.castShadow = lit; o.receiveShadow = lit } })
  scene.add(back)
  function setDoor(deg) {
    hinge.rotation.y = THREE.MathUtils.degToRad(deg) // 복도 쪽으로 열린다
    const open = deg / 58
    hall.intensity = 0.6 + open * 2.2
    hallSpill.intensity = 0.4 + open * 1.8
    glowEnd.material.opacity = 0.3 + open * 0.6
  }
  let doorNow = memory.door, doorTarget = memory.door
  setDoor(doorNow)

  /* ---------- 세면대·수도·전구(양쪽에 다 보인다) ---------- */
  const counter = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.045, 0.5, 2, 0.01), counterMat); counter.position.set(0, 0.86, 0.25)
  const bowlProfile = [[0, 0.0], [0.14, 0.0], [0.2, 0.04], [0.225, 0.13], [0.232, 0.135], [0.226, 0.14], [0.212, 0.135], [0.19, 0.05], [0.13, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y))
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile, 48), ceramic); bowl.scale.set(1.0, 0.9, 0.82); bowl.position.set(0, 0.883, 0.27)
  const spoutCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.88, 0.06), new THREE.Vector3(0, 1.17, 0.05), new THREE.Vector3(0, 1.1, 0.22))
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 24, 0.014, 12, false), chrome)
  const fBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 20), chrome); fBase.position.set(0, 0.895, 0.06)
  const lever = new THREE.Group(); lever.position.set(0.07, 0.91, 0.06)
  const lv = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 10), chrome); lv.rotation.z = Math.PI / 2; lv.position.x = 0.04
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16), chrome)
  lever.add(lv, lb)
  const soap = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.026, 0.055, 3, 0.012), new THREE.MeshStandardMaterial({ color: '#bdbcb8', roughness: 0.55 })); soap.position.set(-0.36, 0.896, 0.2); soap.rotation.y = 0.3
  const sconce = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24), frameMat); sconce.rotation.x = Math.PI / 2; sconce.position.set(0, BULB.y + 0.02, 0.01)
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 8), frameMat); arm.rotation.x = Math.PI / 2; arm.position.set(0, BULB.y + 0.02, 0.08)
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.04, 16), frameMat); socket.position.set(0, BULB.y + 0.035, BULB.z)
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fbf7ef' })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 16), bulbMat); bulb.position.copy(BULB)
  for (const m of [counter, bowl, spout, fBase, lever, soap, sconce, arm, socket]) { add(m, 0) }
  lever.traverse((o) => { if (o.isMesh) { o.layers.set(0); o.castShadow = true } })
  add(bulb, 0, { cast: false, receive: false })
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#f6f0e6', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
  halo.scale.setScalar(0.34); halo.position.copy(BULB)
  add(halo, 0, { cast: false, receive: false })
  // 물줄기(화면에만)
  const streamU = { uTime: { value: 0 }, uOn: { value: 0 } }
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.2, 10, 1, true), new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: STREAM_FRAG, uniforms: streamU, transparent: true, depthWrite: false }))
  stream.position.set(0, 1.0, 0.225)
  add(stream, 1, { cast: false, receive: false })
  // 김(화면에만): 세면대에서 피어오르는 부드러운 덩어리 몇 개
  const steamTex = puffTexture()
  const puffs = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: '#b9bcc2', transparent: true, opacity: 0, depthWrite: false }))
    s.userData = { t: rand(0, 1), speed: rand(0.12, 0.22), x: rand(-0.12, 0.12), size: rand(0.18, 0.34) }
    add(s, 1, { cast: false, receive: false })
    return s
  })

  /* ---------- 반사(거울 평면에 대칭인 카메라로, 바뀔 때만) ---------- */
  let reflRT = null
  const texMat = new THREE.Matrix4()
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
  let reflDirty = true
  const lookAt = new THREE.Vector3(0, 1.47, 0)
  function renderReflection() {
    reflCam.fov = camera.fov; reflCam.aspect = camera.aspect; reflCam.near = camera.near; reflCam.far = camera.far
    reflCam.updateProjectionMatrix()
    reflCam.position.set(camera.position.x, camera.position.y, 2 * MZ - camera.position.z)
    reflCam.up.set(0, 1, 0)
    reflCam.lookAt(lookAt.x, lookAt.y, 2 * MZ - lookAt.z)
    reflCam.updateMatrixWorld()
    texMat.copy(bias).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse)
    renderer.setRenderTarget(reflRT)
    renderer.clear()
    renderer.render(scene, reflCam)
    renderer.setRenderTarget(null)
    reflDirty = false
  }

  /* ---------- 김 격자(GPU) ---------- */
  const FIELD_Q = floatOK ? 1 / 1024 : 1 / 255 // 김 두께 눈금(SIM_FRAG 참고)
  const rtOpts = { type: floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }
  let fieldA = new THREE.WebGLRenderTarget(FW, FH, rtOpts)
  let fieldB = new THREE.WebGLRenderTarget(FW, FH, rtOpts)
  const segs = Array.from({ length: SEGS }, () => new THREE.Vector4())
  const segP = Array.from({ length: SEGS }, () => new THREE.Vector4())
  const simU = {
    uPrev: { value: null }, uStamp: { value: null }, uDt: { value: 0 }, uSteam: { value: 0 }, uInit: { value: 1 }, uAspect: { value: ASPECT },
    uStampAmt: { value: 0 }, uStampClear: { value: 0 }, uStampGrease: { value: 0 }, uStampProg: { value: 1 }, uStampRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSeg: { value: segs }, uSegP: { value: segP }, uSegN: { value: 0 },
    uQ: { value: FIELD_Q }, uQB: { value: floatOK ? 0 : 1 / 255 }, uSeed: { value: 0 },
  }
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SIM_FRAG, uniforms: simU, depthTest: false, depthWrite: false }))
  const quadScene = new THREE.Scene(); quadScene.add(quad)
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const shrinkRT = new THREE.WebGLRenderTarget(64, 48, { type: THREE.UnsignedByteType, depthBuffer: false })
  const shrinkMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SHRINK_FRAG, uniforms: { uField: { value: null }, uTexel: { value: new THREE.Vector2(1 / FW, 1 / FH) } }, depthTest: false, depthWrite: false })
  const grid = new Uint8Array(64 * 48 * 4)
  function sim(dt, list) {
    let n = 0
    for (const s of list.splice(0, SEGS)) { segs[n].set(s.x0, s.y0, s.x1, s.y1); segP[n].set(s.r, s.k, s.type, s.g ?? 0); n++ }
    simU.uSegN.value = n
    simU.uDt.value = dt
    simU.uSeed.value = Math.random() * 97
    simU.uPrev.value = fieldA.texture
    renderer.setRenderTarget(fieldB)
    renderer.render(quadScene, quadCam)
    renderer.setRenderTarget(null)
    ;[fieldA, fieldB] = [fieldB, fieldA]
    simU.uInit.value = 0
    simU.uStampAmt.value = 0
  }
  function readGrid() {
    quad.material = shrinkMat
    shrinkMat.uniforms.uField.value = fieldA.texture
    renderer.setRenderTarget(shrinkRT)
    renderer.render(quadScene, quadCam)
    renderer.readRenderTargetPixels(shrinkRT, 0, 0, 64, 48, grid)
    renderer.setRenderTarget(null)
    quad.material = simMat
  }
  const simMat = quad.material
  const fogAt = (u, v) => grid[(clamp(Math.floor(v * 48), 0, 47) * 64 + clamp(Math.floor(u * 64), 0, 63)) * 4] / 255

  /* ---------- 거울 면과 물방울 ---------- */
  const mirrorU = {
    uRefl: { value: null }, uField: { value: fieldA.texture }, uMicro: { value: microBeads() }, uDesilver: { value: desilverMap() },
    uTexMat: { value: texMat }, uFieldTexel: { value: new THREE.Vector2(1 / FW, 1 / FH) }, uAspect: { value: ASPECT }, uBulb: { value: 1 }, uTime: { value: 0 }, uQ: { value: FIELD_Q },
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.ShaderMaterial({ vertexShader: MIRROR_VERT, fragmentShader: MIRROR_FRAG, uniforms: mirrorU }))
  glass.position.set(MX, MY, MZ)
  add(glass, 1, { cast: false, receive: false })
  const MAX_DROPS = 150
  const dropU = { uRefl: { value: null }, uTexMat: { value: texMat }, uBulb: { value: 1 } }
  const dropsMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: DROP_VERT, fragmentShader: DROP_FRAG, uniforms: dropU, transparent: true, depthWrite: false }), MAX_DROPS)
  dropsMesh.count = 0
  dropsMesh.frustumCulled = false
  dropsMesh.renderOrder = 2
  add(dropsMesh, 1, { cast: false, receive: false })
  const drops = []
  const dm = new THREE.Matrix4()

  /* ---------- 상태 ---------- */
  const queue = [] // 이번 프레임에 김 격자로 보낼 길
  let wiping = null
  let strokes = 0
  let strokesSinceReply = 0
  let lastStrokeEnd = 0
  let firstStrokeEnd = 0
  const strokeCenter = { x: 0, y: 0, n: 0 }
  let lastStroke = { x: 0.5, y: 0.5 }
  let wordsDone = false
  let replied = false
  let palm = null
  let palmDone = false
  let reply = null
  let knockAt = 0
  let faucet = false
  let faucetSteam = 0
  let flicker = null
  let nextFlicker = rand(35, 70)
  let lastDoorMove = 0
  let lastGrid = 0
  let lastInteract = performance.now()
  let rubLast = 0
  let wiped = 0
  let tap = null
  const born = performance.now()
  const stats = { wiped: 0, door: Math.round(doorNow) }
  let lastSig = ''
  const report = () => { const sig = `${stats.wiped}|${stats.door}|${faucet}`; if (sig !== lastSig) { lastSig = sig; onStats?.({ ...stats, faucet, visits: memory.visits }) } }

  function stamp(texture, rect, { grease = 0, clear = 0, amt = 1, prog = 1 }) {
    simU.uStampProg.value = prog
    simU.uStamp.value = texture
    simU.uStampRect.value.set(...rect)
    simU.uStampGrease.value = grease
    simU.uStampClear.value = clear
    simU.uStampAmt.value = amt
  }
  function writeWords(text, cx, cy, h) {
    const w = (h * 512) / 160 / ASPECT
    const x0 = clamp(cx - w / 2, 0.02, 0.98 - w), y0 = clamp(cy - h / 2, 0.04, 0.96 - h)
    stamp(greaseText(text), [x0, y0, x0 + w, y0 + h], { grease: 1, clear: 0 })
  }

  /* ---------- 물방울 ---------- */
  function spawnDrops(s) {
    const len = Math.hypot((s.x1 - s.x0) * ASPECT, s.y1 - s.y0)
    const n = len * 26 + (Math.random() < 0.3 ? 1 : 0)
    const nx = -(s.y1 - s.y0), ny = (s.x1 - s.x0) * ASPECT
    const nl = Math.hypot(nx, ny) || 1
    for (let i = 0; i < n && drops.length < MAX_DROPS; i++) {
      if (Math.random() > 0.22) continue
      const t = Math.random(), sideK = Math.random() < 0.5 ? -1 : 1
      const off = s.r * rand(0.85, 1.05) * sideK
      drops.push({ u: s.x0 + (s.x1 - s.x0) * t + (nx / nl) * off / ASPECT, v: s.y0 + (s.y1 - s.y0) * t + (ny / nl) * off, r: rand(0.0019, 0.0034), vy: 0, vx: 0, slide: false })
    }
  }
  function stepDrops(dt) {
    let moving = false
    // 가끔 이웃과 합쳐져 무거워진다
    for (let i = 0; i < drops.length; i++) for (let j = i + 1; j < drops.length; j++) {
      const a = drops[i], b = drops[j]
      const d = Math.hypot((a.u - b.u) * MW, (a.v - b.v) * MH)
      if (d < (a.r + b.r) * 0.9) { a.r = Math.cbrt(a.r ** 3 + b.r ** 3); a.slide = a.slide || b.slide; drops.splice(j, 1); j-- }
    }
    if (drops.length && Math.random() < dt * 0.5) drops[Math.floor(Math.random() * drops.length)].r += 0.00025
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      if (d.r > 0.0042) d.slide = true
      if (!d.slide) continue
      moving = true
      d.vy = Math.min(d.vy + dt * 0.25, 0.03 + d.r * 22)
      d.vx += (Math.random() - 0.5) * dt * 0.12; d.vx *= Math.exp(-dt * 5)
      const pu = d.u, pv = d.v
      d.v -= (d.vy * dt) / MH
      d.u += (d.vx * dt) / MW
      d.r = Math.max(0.0024, d.r - d.vy * dt * 0.006)
      queue.push({ x0: pu, y0: pv, x1: d.u, y1: d.v, r: (d.r * 0.75) / MH, k: 1, type: 1 })
      if (d.r < 0.0028 && Math.random() < dt * 0.6) { d.slide = false; d.vy = 0 }
      if (d.v < -0.02) { drops.splice(i, 1); sfx.play('mirror-drip', { gain: rand(0.12, 0.25), rate: rand(0.9, 1.15), at: 0.25, pan: (d.u - 0.5) * 0.6, send: 0.15 }) }
    }
    dropsMesh.count = drops.length
    drops.forEach((d, i) => {
      const s = d.r * 2 * DROP_PAD * (d.slide ? 1.08 : 1)
      dm.makeScale(s, s * (d.slide ? 1.12 : 1), 1).setPosition(MX - MW / 2 + d.u * MW, MY - MH / 2 + d.v * MH, MZ + 0.0015)
      dropsMesh.setMatrixAt(i, dm)
    })
    dropsMesh.instanceMatrix.needsUpdate = true
    return moving
  }

  /* ---------- 입력 ---------- */
  const ray = new THREE.Raycaster()
  ray.layers.enableAll()
  const ndc = new THREE.Vector2()
  const mirrorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -MZ)
  const hit = new THREE.Vector3()
  const faucetParts = [spout, fBase, lever, lb, lv]
  function toMirror(e) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(mirrorPlane, hit)) return null
    return { u: (hit.x - (MX - MW / 2)) / MW, v: (hit.y - (MY - MH / 2)) / MH, t: performance.now() }
  }
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    sfx.unlock(); sfx.reverb(1.1, 3.2, 0.7)
    lastInteract = performance.now()
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (ray.intersectObjects(faucetParts, false).length) { toggleFaucet(); wake(); return }
    const p = toMirror(e)
    if (!p || p.u < 0 || p.u > 1 || p.v < 0 || p.v > 1) return
    canvas.setPointerCapture?.(e.pointerId)
    wiping = { id: e.pointerId, last: p, speed: 0 }
    wake()
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect()
    if (!small) { lean.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; lean.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; wake(300) }
    if (!wiping || e.pointerId !== wiping.id) return
    const p = toMirror(e)
    if (!p) return
    const a = wiping.last
    const dt = Math.max(0.008, (p.t - a.t) / 1000)
    const dist = Math.hypot((p.u - a.u) * MW, (p.v - a.v) * MH)
    if (dist < 0.0015) return
    wiping.speed = damp(wiping.speed, dist / dt, 8, dt)
    // 천천히 = 손끝으로 쓰기, 빠르게 = 손바닥으로 훔치기
    const palmish = smooth(0.12, 1.1, wiping.speed)
    const rM = 0.011 + 0.026 * palmish
    // 손끝으로 쓴 자리엔 기름이 남고, 손바닥으로 훔친 자리엔 조금만
    const seg = { x0: clamp(a.u, -0.1, 1.1), y0: clamp(a.v, -0.1, 1.1), x1: clamp(p.u, -0.1, 1.1), y1: clamp(p.v, -0.1, 1.1), r: rM / MH, k: 1, type: 0, g: 0.85 - 0.75 * palmish }
    queue.push(seg)
    spawnDrops(seg)
    strokeCenter.x += p.u; strokeCenter.y += p.v; strokeCenter.n++
    lastStroke = { x: p.u, y: p.v }
    wiping.last = p
    lastInteract = performance.now()
    // 뽀득: 빠르기에 맞는 조각을 고른다
    const now = performance.now()
    if (now - rubLast > clamp(150 - wiping.speed * 80, 55, 150)) {
      rubLast = now
      const g = RUB[Math.floor(Math.random() * RUB.length)]
      const dur = Math.min(g[1] - g[0], 0.09 + Math.random() * 0.1)
      sfx.play('mirror-rub', { offset: g[0] + rand(0, g[1] - g[0] - dur), duration: dur, gain: clamp(0.18 + wiping.speed * 0.5, 0.18, 0.75), rate: rand(0.9, 1.12) * (1 + smooth(0.3, 1.2, wiping.speed) * 0.12), pan: (p.u - 0.5) * 0.7, fade: 0.015 })
    }
    wake()
  }
  function endStroke() {
    strokes += 1
    strokesSinceReply += 1
    lastStrokeEnd = performance.now()
    if (!firstStrokeEnd) firstStrokeEnd = lastStrokeEnd
    wake()
  }
  function onUp(e) {
    if (!wiping || e.pointerId !== wiping.id) return
    wiping = null
    endStroke()
  }
  // 손가락 대신(버튼·키보드): 손바닥으로 한 줄을 가로질러 훔친다. 누를 때마다 다른 높이
  let band = null
  let bandN = 0
  function wipeBand() {
    sfx.unlock(); sfx.reverb(1.1, 3.2, 0.7)
    if (band) return
    const v = BANDS[bandN % BANDS.length]
    band = { t: 0, v, dir: bandN % 2 ? -1 : 1, last: null, rub: 0 }
    bandN += 1
    lastInteract = performance.now()
    wake()
  }
  function stepBand(dt, now) {
    band.t = Math.min(1, band.t + dt / 0.8)
    const e = smooth(0, 1, band.t)
    const p = { u: band.dir > 0 ? 0.05 + 0.9 * e : 0.95 - 0.9 * e, v: band.v + Math.sin(e * 8) * 0.014 }
    if (band.last) {
      const seg = { x0: band.last.u, y0: band.last.v, x1: p.u, y1: p.v, r: 0.042 / MH, k: 1, type: 0, g: 0.12 }
      queue.push(seg)
      spawnDrops(seg)
      strokeCenter.x += p.u; strokeCenter.y += p.v; strokeCenter.n++
      lastStroke = { x: p.u, y: p.v }
      if (now - rubLast > 75) {
        rubLast = now
        const g = RUB[Math.floor(Math.random() * RUB.length)]
        const dur = Math.min(g[1] - g[0], 0.09 + Math.random() * 0.1)
        sfx.play('mirror-rub', { offset: g[0] + rand(0, g[1] - g[0] - dur), duration: dur, gain: 0.5, rate: rand(0.95, 1.15), pan: (p.u - 0.5) * 0.7, fade: 0.015 })
      }
    }
    band.last = p
    lastInteract = now
    if (band.t >= 1) { band = null; endStroke() }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  function toggleFaucet() {
    sfx.unlock(); sfx.reverb(1.1, 3.2, 0.7)
    faucet = !faucet
    tap = { t: 0, from: lever.rotation.y, to: faucet ? -0.9 : 0 }
    sfx.play('mirror-tap', { gain: 0.6, rate: faucet ? 1 : 0.92 })
    if (faucet) water.loop ??= sfx.loop('mirror-faucet', { gain: 0, send: 0.12 })
    lastInteract = performance.now()
    report(); wake()
  }
  const water = { loop: null, level: 0 }

  /* ---------- 카메라 ---------- */
  const lean = { x: 0, y: 0, tx: 0, ty: 0 }
  let camZ = 1.7
  function placeCamera() {
    camera.position.set(lean.x * 0.06, 1.5 + lean.y * -0.03, camZ)
    camera.lookAt(lookAt)
  }

  /* ---------- 한 프레임 ---------- */
  let W = 1, H = 1
  let raf = 0
  let paused = false
  let last = performance.now()
  let awakeUntil = 0
  let slow = 0
  let skip = false
  let shadowDirty = true
  function wake(ms = 600) { awakeUntil = Math.max(awakeUntil, performance.now() + ms); if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(frame) } }

  function frame(now) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    const sinceTouch = (now - lastInteract) / 1000
    const age = (now - born) / 1000
    const interacting = !!wiping || !!band || sinceTouch < 1.5
    // 손대지 않고 저절로 서리기만 할 땐 한 프레임 걸러 그린다(30fps)
    if (!interacting && !faucet && !palm && !reply && !flicker && Math.abs(lean.x - lean.tx) + Math.abs(lean.y - lean.ty) < 0.002) { skip = !skip; if (skip) { raf = requestAnimationFrame(frame); return } }
    const step = dt
    last = now
    if (dt > 0.026) slow++; else slow = Math.max(0, slow - 1)
    if (slow > 40 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); resizeRefl(); slow = 0 }

    // 김의 양: 방금 누가 샤워한 듯한 남은 김 + 수도
    faucetSteam = damp(faucetSteam, faucet ? 1 : 0, faucet ? 0.35 : 0.15, step)
    const residual = 0.5 * Math.exp(-age / 90) + 0.14
    simU.uSteam.value = clamp(residual + faucetSteam, 0, 1.3)
    water.level = damp(water.level, faucet ? 1 : 0, 6, step)
    water.loop?.set(water.level * 0.5, 0.1)
    streamU.uOn.value = water.level; streamU.uTime.value = age
    stream.visible = water.level > 0.02
    if (tap) { tap.t = Math.min(1, tap.t + step / 0.35); lever.rotation.y = tap.from + (tap.to - tap.from) * smooth(0, 1, tap.t); if (tap.t >= 1) tap = null; reflDirty = true; shadowDirty = true }
    // 김 덩어리
    let puffing = false
    for (const s of puffs) {
      const u = s.userData
      u.t += (step * u.speed) / 0.6
      if (u.t > 1) { u.t -= 1; u.x = rand(-0.14, 0.14); u.size = rand(0.16, 0.32) }
      const k = u.t
      s.position.set(u.x + Math.sin(k * 5 + u.size * 20) * 0.04, 0.95 + k * 0.85, 0.27 - k * 0.18)
      s.scale.setScalar(u.size * (0.6 + k * 1.4))
      s.material.opacity = Math.sin(k * Math.PI) * 0.22 * faucetSteam
      s.material.rotation = k * 1.2 + u.size * 10
      if (faucetSteam > 0.02) puffing = true
    }
    // 이상한 것들
    if (!wordsDone && firstStrokeEnd && now - firstStrokeEnd > 2500 && strokeCenter.n > 0) {
      wordsDone = true
      writeWords(FIRST_WORDS[(memory.visits - 1) % FIRST_WORDS.length], strokeCenter.x / strokeCenter.n, strokeCenter.y / strokeCenter.n, 0.16)
    } else if (wordsDone && !replied && !reply && strokesSinceReply >= 6 && !wiping && now - lastStrokeEnd > 3500) {
      // 대답: 저쪽에서 손가락으로 김 위에 쓴다(김이 두꺼운 자리를 골라, 한 글자씩)
      replied = true
      strokesSinceReply = 0
      const text = REPLIES[Math.floor(Math.random() * REPLIES.length)]
      const h = 0.12, w = (h * 512) / 160 / ASPECT
      const spots = [[0.5, 0.74], [0.5, 0.26], [0.3, 0.5], [0.7, 0.5], [0.3, 0.76], [0.7, 0.24]]
      let best = spots[0], bestFog = -1
      for (const [x, y] of spots) { let f = 0; for (let k = 0; k < 9; k++) f += fogAt(x - w / 2 + (k % 3) * (w / 2), y - h / 2 + Math.floor(k / 3) * (h / 2)); if (f > bestFog) { bestFog = f; best = [x, y] } }
      const x0 = clamp(best[0] - w / 2, 0.02, 0.98 - w), y0 = clamp(best[1] - h / 2, 0.04, 0.96 - h)
      reply = { t: 0, tex: greaseText(text), rect: [x0, y0, x0 + w, y0 + h], dur: 0.45 * text.length + 0.6, nextRub: 0 }
    }
    if (reply) {
      reply.t += step
      const prog = clamp(reply.t / reply.dur, 0, 1)
      stamp(reply.tex, reply.rect, { grease: 0.9, clear: Math.min(1, step * 9), amt: 1, prog })
      if (reply.t > reply.nextRub && prog < 1) { reply.nextRub = reply.t + rand(0.16, 0.3); const g = RUB[Math.floor(Math.random() * RUB.length)]; sfx.play('mirror-rub', { offset: g[0], duration: Math.min(0.12, g[1] - g[0]), gain: 0.22, rate: rand(1.05, 1.2), pan: (reply.rect[2] - prog * (reply.rect[2] - reply.rect[0]) - 0.5) * 0.7, send: 0.2 }) }
      if (prog >= 1 && reply.t > reply.dur + 0.3) reply = null
    }
    if (!palmDone && !palm && wordsDone && age > 26 && now - lastStrokeEnd > 4000 && avgFog() > 0.6) {
      palmDone = true
      const h = 0.42, w = (h * 256) / 320 / ASPECT
      const x0 = rand(0.3, 0.7 - w), y0 = rand(0.36, 0.56)
      palm = { t: 0, rect: [x0, y0, x0 + w, y0 + h] }
      sfx.play('mirror-palm', { gain: 0.7, pan: (x0 - 0.5) * 0.6 })
      flicker = { t: 0 }
      knockAt = now + 2600
    }
    if (palm) {
      palm.t += step
      stamp(palmTex, palm.rect, { grease: 0.65, clear: Math.min(1, step * 3.2), amt: 1 })
      // 누른 채 조금 미끄러진다
      palm.rect[1] -= step * 0.012; palm.rect[3] -= step * 0.012
      if (palm.t > 1.2) palm = null
    }
    if (knockAt && now > knockAt) { knockAt = 0; sfx.play('mirror-knock', { gain: 0.65, send: 0.25 }) }
    // 전구 깜빡임
    if (!flicker && age > nextFlicker) { flicker = { t: 0 }; nextFlicker = age + rand(40, 90) }
    let bulbK = 1
    if (flicker) {
      if (flicker.t === 0) sfx.play('mirror-buzz', { gain: 0.5, rate: rand(0.9, 1.1) })
      flicker.t += step
      const f = flicker.t
      bulbK = f < 0.06 ? 0.15 : f < 0.14 ? 0.9 : f < 0.19 ? 0.05 : f < 0.32 ? 0.7 : 1
      if (f > 0.4) { flicker = null; bulbK = 1 }
      reflDirty = true
    }
    bulbLight.intensity = 7.5 * bulbK
    bounce.intensity = 1.1 * bulbK
    bulbMat.color.setScalar(0.2 + 0.8 * bulbK)
    halo.material.opacity = 0.55 * bulbK
    mirrorU.uBulb.value = 0.25 + 0.75 * bulbK
    dropU.uBulb.value = mirrorU.uBulb.value
    // 문: 김에 가려 안 보일 때만 조금 더 열린다
    if (doorNow !== doorTarget) { doorNow = damp(doorNow, doorTarget, 0.8, step); if (Math.abs(doorNow - doorTarget) < 0.05) doorNow = doorTarget; setDoor(doorNow); reflDirty = true; shadowDirty = true }
    // 시선 기울기(진짜 시차가 거울에 생긴다)
    const lx = damp(lean.x, lean.tx, 4, step), ly = damp(lean.y, lean.ty, 4, step)
    if (Math.abs(lx - lean.x) + Math.abs(ly - lean.y) > 1e-5) { lean.x = lx; lean.y = ly; placeCamera(); reflDirty = true }

    if (band) stepBand(step, now)
    const dropsMoving = stepDrops(step)
    // 김 격자: 쌓인 길을 24개씩
    sim(step, queue)
    let extra = 0
    while (queue.length && extra++ < 4) sim(0, queue)
    mirrorU.uField.value = fieldA.texture
    mirrorU.uTime.value = age

    if (now - lastGrid > 350) {
      lastGrid = now
      readGrid()
      let clear = 0
      for (let i = 0; i < 64 * 48; i++) if (grid[i * 4] < 90) clear++
      wiped = Math.round((clear / (64 * 48)) * 100)
      stats.wiped = wiped
      if (doorFog() > 0.74 && now - lastDoorMove > 6000 && doorTarget < 58 && age > 8) {
        lastDoorMove = now
        doorTarget = Math.min(58, doorTarget + rand(3, 6))
        memory.door = doorTarget; writeMemory(memory)
      }
      stats.door = Math.round(doorTarget)
      report()
    }

    renderer.shadowMap.needsUpdate = shadowDirty // 첫 렌더가 그림자를 다시 굽고 스스로 끈다
    shadowDirty = false
    if (reflDirty) renderReflection()
    renderer.render(scene, camera)

    const growing = simU.uSteam.value > 0.2 && strokes > 0 && now - lastStrokeEnd < 70000 // 닦은 자리가 다시 서리는 동안만
    if (wiping || band || dropsMoving || faucet || puffing || palm || reply || flicker || tap || growing || doorNow !== doorTarget || now < awakeUntil) raf = requestAnimationFrame(frame)
  }
  const palmTex = palmStamp()
  function avgFog() { let s = 0; for (let i = 0; i < 64 * 48; i++) s += grid[i * 4]; return s / (64 * 48 * 255) }
  // 문이 비치는 자리(거울 위)의 김: 문 네 모서리가 거울 어디에 비치는지 계산
  function doorFog() {
    const pts = [[DX0, 0.2], [DX1, 0.2], [DX0, DH], [DX1, DH]].map(([x, y]) => {
      const dz = 2 * MZ - RD // 거울 뒤로 접은 문
      const c = camera.position
      const t = (MZ - c.z) / (dz - c.z)
      return { u: (c.x + (x - c.x) * t - (MX - MW / 2)) / MW, v: (c.y + (y - c.y) * t - (MY - MH / 2)) / MH }
    })
    const u0 = clamp(Math.min(...pts.map((p) => p.u)), 0, 1), u1 = clamp(Math.max(...pts.map((p) => p.u)), 0, 1)
    const v0 = clamp(Math.min(...pts.map((p) => p.v)), 0, 1), v1 = clamp(Math.max(...pts.map((p) => p.v)), 0, 1)
    if (u1 - u0 < 0.02 || v1 - v0 < 0.02) return 1
    let s = 0, n = 0
    for (let v = v0; v <= v1; v += 0.04) for (let u = u0; u <= u1; u += 0.04) { s += fogAt(u, v); n++ }
    return n ? s / n : 1
  }

  function resizeRefl() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    reflRT?.dispose()
    // 반사는 선형 HDR로 받아 거울 셰이더에서 같은 톤 매핑을 거친다(못 하면 8비트 sRGB)
    reflRT = new THREE.WebGLRenderTarget(Math.max(2, Math.round(size.x * 0.6)), Math.max(2, Math.round(size.y * 0.6)), floatOK
      ? { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }
      : { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace })
    mirrorU.uRefl.value = reflRT.texture
    dropU.uRefl.value = reflRT.texture
    reflDirty = true
  }

  // 첫 김(이미 서려 있다)
  sim(0, [])

  return {
    resize(w, h) {
      W = w; H = h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // 거울이 화면에 알맞게 차도록: 가로가 좁으면 시야를 넓히고 물러선다
      camera.fov = w / h < 0.8 ? 58 : small ? 46 : 36
      camera.updateProjectionMatrix()
      const vis = (fovDeg, d) => 2 * d * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)
      camZ = 1.7
      for (let k = 0; k < 50 && vis(camera.fov, camZ - MZ) * camera.aspect < MW * (w / h < 0.8 ? 1.15 : 2.3); k++) camZ += 0.08
      placeCamera()
      resizeRefl()
      shadowDirty = true
      wake()
    },
    toggleFaucet,
    wipeBand,
    setPaused(p) { paused = p; if (p) { cancelAnimationFrame(raf); raf = 0 } else wake() },
    dispose() {
      cancelAnimationFrame(raf)
      water.loop?.stop()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      for (const rt of [fieldA, fieldB, shrinkRT, reflRT]) rt?.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        for (const m of mats) { for (const val of Object.values(m)) if (val?.isTexture) val.dispose(); m.dispose() }
      })
      env?.dispose()
      renderer.dispose()
    },
  }
}

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.4)'); gr.addColorStop(0.55, 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}
// 구석 그늘 띠(밝기 = 불투명도): 한쪽 끝이 진하고 반대쪽으로 사라진다
function shadeTexture(vertical) {
  const c = document.createElement('canvas'); c.width = vertical ? 64 : 4; c.height = vertical ? 4 : 64
  const g = c.getContext('2d')
  const gr = vertical ? g.createLinearGradient(0, 0, 64, 0) : g.createLinearGradient(0, 0, 0, 64)
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#555'); gr.addColorStop(1, '#000')
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height)
  return new THREE.CanvasTexture(c)
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  for (let i = 0; i < 14; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 20 + Math.random() * 30
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  }
  return new THREE.CanvasTexture(c)
}
