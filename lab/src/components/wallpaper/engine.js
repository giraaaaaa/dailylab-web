import * as THREE from 'three'
import { TOPS, topTile, floralTile, stripeTile, backTile, stainMap, newspaper, plaster } from './patterns'

/* DL-010 벽지 한 겹. 화면 전체가 벽이고, 어디든 잡아 끌면 그 자리부터 벽지가 찢기며 말려 올라간다.
   - 말림: 잡은 점 P0와 손가락 P의 한가운데에 접는 선을 두고, P0~접는 선 사이의 종이를 선 너머로 뒤집어 그린다(책장 넘김과 같은 원리).
   - 찢긴 모양: 사인파 몇 개를 겹친 식 하나(tearDist). 셰이더와 캔버스가 같은 식을 써서 놓는 순간 모양이 그대로 남는다.
   - 겹: 새 벽지 → (지난번 벽지) → 꽃무늬 → 줄무늬 → 신문 초배지 → 맨 벽. 겹마다 남은 자리를 RGBA 마스크 한 장의 채널에 담는다.
   - 다음에 오면 새 벽지가 발려 있고, 지난번에 뜯은 자리는 그 아래 겹에 그대로 남아 있다(localStorage에 작은 PNG로).
   - 맨 벽에는 연필로 그은 자국이 있다. 개수는 이 방에 온 날 수. */

const MEMORY = 'dl-wallpaper'
const PEEL_GRAINS = [[0.0, 0.44], [0.48, 0.88], [1.92, 2.44], [4.04, 4.2]]
const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const FRAG = /* glsl */`
uniform sampler2D uMask, uT1, uT2, uT3, uT4, uPlaster, uBack, uStain;
uniform vec2 uRes, uP0, uDir;
uniform vec3 uS, uPhA, uPhB, uFlapTint;
uniform vec4 uAge, uRim, uKSel, uAbove;
uniform float uActive, uW0, uSpread, uAmp, uLh, uEmboss, uWipe, uFlapPrint;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

// 찢기는 띠 안쪽까지의 거리(+면 안). JS의 tearPolygon과 같은 식
float tearDist(vec2 p) {
  if (uActive < 0.5) return -100.0;
  vec2 q = p - uP0;
  float s = dot(q, uDir);
  float t = dot(q, vec2(-uDir.y, uDir.x));
  vec3 ph = t >= 0.0 ? uPhA : uPhB;
  float n = 0.5 * sin(s * 0.07 + ph.x) + 0.3 * sin(s * 0.19 + ph.y) + 0.2 * sin(s * 0.47 + ph.z);
  float hw = max(0.0, min(s * 1.6 + 2.0, uW0 * 0.5 + s * uSpread) + n * uAmp);
  return min(min(hw - abs(t), s), uLh - s);
}
vec4 present(vec2 p) {
  vec4 m = texture2D(uMask, p / uRes);
  return m * (1.0 - smoothstep(-0.8, 0.8, tearDist(p)) * uKSel);
}
vec3 full(sampler2D t, vec2 p) { return texture2D(t, vec2(p.x / uRes.x, 1.0 - p.y / uRes.y)).rgb; }
vec3 tile(sampler2D t, vec2 p, float s) { return texture2D(t, vec2(p.x, -p.y) / s).rgb; }
vec3 aged(vec3 c, vec2 p, float age, vec2 off) {
  float st = texture2D(uStain, vec2(p.x / uRes.x, 1.0 - p.y / uRes.y) * 0.85 + off).r;
  return c * mix(vec3(1.0), vec3(0.84, 0.74, 0.56), st * age);
}
// 말려 올라간 종이가 p를 덮는 정도. pr: 뒤집기 전 종이 위의 점, s: 접는 선에서 떨어진 거리
float flapCov(vec2 p, out vec2 pr, out float s) {
  vec2 M = uP0 + uDir * uLh;
  s = dot(p - M, uDir);
  pr = p - 2.0 * max(s, 0.0) * uDir;
  float d = smoothstep(-0.8, 0.8, tearDist(pr));
  vec4 m = texture2D(uMask, pr / uRes);
  vec4 a = 1.0 - m * uAbove;
  return step(0.0, s) * uActive * d * dot(m, uKSel) * a.x * a.y * a.z * a.w;
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec4 m = present(p);
  vec4 r1 = present(p + vec2(2.5, 0.0)), r2 = present(p - vec2(2.5, 0.0)), r3 = present(p + vec2(0.0, 2.5)), r4 = present(p - vec2(0.0, 2.5));
  vec4 mn = min(min(r1, r2), min(r3, r4));
  vec4 sh = (present(p - vec2(1.5, 2.5)) + present(p - vec2(3.0, 5.0)) + present(p - vec2(5.0, 8.5))) / 3.0;
  float fib = vnoise(p * 0.45) * 0.65 + hash(floor(p)) * 0.35;
  vec3 fiber = lin(vec3(0.96, 0.95, 0.91));

  vec3 col = full(uPlaster, p);
  // 4: 신문 초배지
  float a4 = smoothstep(0.35, 0.65, m.w);
  col *= 1.0 - 0.38 * sh.w * (1.0 - a4);
  vec3 c4 = aged(full(uT4, p), p, uAge.w, vec2(0.31, 0.17));
  c4 = mix(c4, fiber * vec3(0.95, 0.92, 0.85), a4 * (1.0 - smoothstep(0.2, 0.8, mn.w)) * mix(0.4, 1.0, fib) * uRim.w);
  col = mix(col, c4, a4);
  // 3
  float a3 = smoothstep(0.35, 0.65, m.z);
  col *= 1.0 - 0.42 * sh.z * (1.0 - a3);
  vec3 c3 = aged(tile(uT3, p, uS.z), p, uAge.z, vec2(0.57, 0.71));
  c3 = mix(c3, fiber * vec3(0.97, 0.94, 0.87), a3 * (1.0 - smoothstep(0.2, 0.8, mn.z)) * mix(0.45, 1.0, fib) * uRim.z);
  col = mix(col, c3, a3);
  // 2
  float a2 = smoothstep(0.35, 0.65, m.y);
  col *= 1.0 - 0.42 * sh.y * (1.0 - a2);
  vec3 c2 = aged(tile(uT2, p, uS.y), p, uAge.y, vec2(0.13, 0.43));
  c2 = mix(c2, fiber, a2 * (1.0 - smoothstep(0.2, 0.8, mn.y)) * mix(0.5, 1.0, fib) * uRim.y);
  col = mix(col, c2, a2);
  // 1: 지금 붙어 있는 새 벽지(다시 바를 때는 위에서부터 내려온다)
  float edgeY = uWipe * (uRes.y + 80.0) - 40.0 + 6.0 * sin(p.x * 0.013);
  float a1 = smoothstep(0.35, 0.65, m.x) * smoothstep(-1.0, 1.0, edgeY - p.y);
  col *= 1.0 - 0.45 * sh.x * (1.0 - a1);
  col *= 1.0 - 0.3 * exp(-max(p.y - edgeY, 0.0) / 9.0) * step(edgeY, p.y) * step(uWipe, 1.0);
  vec3 c1 = tile(uT1, p, uS.x);
  c1 *= 1.0 + uEmboss * 0.09 * ((r1.y - r2.y) + (r3.y - r4.y)); // 아래 겹의 옛 구멍 위로 살짝 꺼진 자국
  c1 = mix(c1, fiber, a1 * (1.0 - smoothstep(0.2, 0.8, mn.x)) * mix(0.6, 1.0, fib) * uRim.x);
  col = mix(col, c1, a1);

  // 들린 종이 아래 그림자: 접는 선 가까운 구멍 안쪽, 그리고 종이가 벽에 떨어뜨리는 그림자
  vec4 mc = texture2D(uMask, p / uRes);
  vec4 ab = 1.0 - mc * uAbove;
  float lifted = smoothstep(-0.8, 0.8, tearDist(p)) * dot(mc, uKSel) * ab.x * ab.y * ab.z * ab.w;
  float sf = dot(p - (uP0 + uDir * uLh), uDir);
  col *= 1.0 - 0.38 * exp(min(sf, 0.0) / 20.0) * lifted;
  vec2 pr, pr2; float s, s2;
  float fc = flapCov(p, pr, s);
  float lift = 1.0 + clamp(s, 0.0, 140.0) / 28.0;
  float fs = flapCov(p - vec2(2.0, 3.5) * lift, pr2, s2);
  col *= 1.0 - 0.42 * fs * (1.0 - fc);
  if (fc > 0.001) {
    vec3 bc = tile(uBack, pr, 256.0) * uFlapTint;
    float ink = dot(full(uT4, pr), vec3(0.33));
    bc *= mix(1.0, clamp(ink * 1.9, 0.5, 1.1), uFlapPrint * 0.45); // 신문 뒷면에 비치는 글자
    float shade = 0.6 + 0.4 * smoothstep(0.0, 28.0, s);
    bc = bc * shade + 0.2 * exp(-pow((s - 8.0) / 6.0, 2.0));
    bc = mix(bc, fiber, (1.0 - smoothstep(0.4, 2.4, tearDist(pr))) * 0.85);
    col = mix(col, bc, fc);
  }

  // 방 조명: 왼쪽 위에서 오는 빛, 가장자리 어둠
  col *= 0.88 + 0.16 * (1.0 - smoothstep(0.0, 1.3, distance(vUv, vec2(0.15, 1.05))));
  col *= 1.0 - 0.24 * pow(length((vUv - 0.5) * vec2(1.0, 0.9)) * 1.25, 2.6);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(p + 0.31) - 0.5) / 255.0;
}
`

function readMemory() {
  try { return { visits: 0, top: 0, holes: null, torn: 0, ...JSON.parse(localStorage.getItem(MEMORY) || '{}') } } catch { return { visits: 0, top: 0, holes: null, torn: 0 } }
}

export function createWallpaper(canvas, overlay, { sfx, onStats }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  const ctx2 = overlay.getContext('2d')

  const memory = readMemory()
  const prevHoles = memory.holes
  const prevTop = memory.top
  memory.visits += 1
  let curTop = memory.visits === 1 ? 0 : (prevTop + 1) % TOPS.length
  memory.top = curTop
  const writeMemory = () => { try { localStorage.setItem(MEMORY, JSON.stringify(memory)) } catch { /* 저장 불가 */ } }
  writeMemory()

  const tex = (c, { repeat = false } = {}) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping }
    t.anisotropy = 4
    return t
  }
  const floralTex = tex(floralTile(), { repeat: true })
  const layers = memory.visits === 1
    ? [
        { name: '새 벽지', tex: tex(topTile(TOPS[curTop]), { repeat: true }), size: 256, age: 0, rim: 1 },
        { name: '꽃무늬 벽지', tex: floralTex, size: 170, age: 0.55, rim: 0.85 },
        { name: '줄무늬 벽지', tex: tex(stripeTile(), { repeat: true }), size: 160, age: 0.7, rim: 0.75 },
      ]
    : [
        { name: '새 벽지', tex: tex(topTile(TOPS[curTop]), { repeat: true }), size: 256, age: 0, rim: 1 },
        { name: '지난번 벽지', tex: tex(topTile(TOPS[prevTop]), { repeat: true }), size: 256, age: 0.12, rim: 1 },
        { name: '꽃무늬 벽지', tex: floralTex, size: 170, age: 0.55, rim: 0.85 },
      ]
  const NAMES = () => [...layers.map((l) => l.name), '신문지 초배지', '맨 벽']
  const TINTS = [[1, 1, 1], [0.97, 0.94, 0.87], [0.94, 0.88, 0.76], [0.9, 0.86, 0.76]]

  const uniforms = {
    uMask: { value: null }, uT1: { value: layers[0].tex }, uT2: { value: layers[1].tex }, uT3: { value: layers[2].tex },
    uT4: { value: null }, uPlaster: { value: null }, uBack: { value: tex(backTile(), { repeat: true }) }, uStain: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uP0: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(0, 1) },
    uS: { value: new THREE.Vector3(256, 170, 160) }, uPhA: { value: new THREE.Vector3() }, uPhB: { value: new THREE.Vector3() }, uFlapTint: { value: new THREE.Vector3(1, 1, 1) },
    uAge: { value: new THREE.Vector4() }, uRim: { value: new THREE.Vector4() }, uKSel: { value: new THREE.Vector4() }, uAbove: { value: new THREE.Vector4() },
    uActive: { value: 0 }, uW0: { value: 60 }, uSpread: { value: 0.3 }, uAmp: { value: 5 }, uLh: { value: 0 },
    uEmboss: { value: memory.visits === 1 ? 0 : 1 }, uWipe: { value: 2 }, uFlapPrint: { value: 0 },
  }
  const stain = new THREE.CanvasTexture(stainMap())
  stain.wrapS = stain.wrapT = THREE.RepeatWrapping
  uniforms.uStain.value = stain
  function syncLayers() {
    uniforms.uT1.value = layers[0].tex; uniforms.uT2.value = layers[1].tex; uniforms.uT3.value = layers[2].tex
    uniforms.uS.value.set(layers[0].size, layers[1].size, layers[2].size)
    uniforms.uAge.value.set(0, layers[1].age, layers[2].age, 0.4)
    uniforms.uRim.value.set(layers[0].rim, layers[1].rim, layers[2].rim, 0.55)
    uniforms.uEmboss.value = layers[1].name === '지난번 벽지' ? 1 : 0
  }
  syncLayers()
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false })))

  /* ---------- 겹마다 남은 자리(마스크) ---------- */
  let W = 0, H = 0, ms = 1, MW = 1, MH = 1
  let masks = [] // 캔버스 4장(알파 = 남아 있음)
  let packed = null
  let maskTex = null
  let region = null
  let built = false
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  function buildMasks(keep) {
    const old = masks
    masks = [0, 1, 2, 3].map((i) => {
      const c = mkCanvas(MW, MH)
      const g = c.getContext('2d', { willReadFrequently: true })
      if (keep && old[i]) g.drawImage(old[i], 0, 0, MW, MH)
      else { g.fillStyle = '#fff'; g.fillRect(0, 0, MW, MH) }
      return c
    })
    region = mkCanvas(MW, MH)
    packed = new Uint8Array(MW * MH * 4)
    maskTex?.dispose()
    maskTex = new THREE.DataTexture(packed, MW, MH, THREE.RGBAFormat)
    maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter
    maskTex.generateMipmaps = false
    uniforms.uMask.value = maskTex
    repack([0, 1, 2, 3])
  }
  function repack(list) {
    for (const i of list) {
      const d = masks[i].getContext('2d', { willReadFrequently: true }).getImageData(0, 0, MW, MH).data
      for (let j = 0, n = MW * MH; j < n; j++) packed[j * 4 + i] = d[j * 4 + 3]
    }
    maskTex.needsUpdate = true
    dirty = true
  }
  function loadHoles(url, into) {
    const img = new Image()
    img.onload = () => {
      const g = masks[into].getContext('2d', { willReadFrequently: true })
      g.clearRect(0, 0, MW, MH); g.drawImage(img, 0, 0, MW, MH)
      repack([into]); kick()
    }
    img.src = url
  }

  /* ---------- 찢기 ---------- */
  let tear = null
  let dirty = true
  let raf = 0
  let paused = false
  let last = performance.now()
  let dead = false // 저절로 끊긴 뒤 손을 뗄 때까지
  let auto = null
  const pieces = []
  const dust = []
  const stats = { torn: 0, deepest: 1 }
  let saveTimer = 0
  let topTorn = 0
  let wipe = null

  const scaleF = () => clamp(Math.min(W, H) / 800, 0.6, 1.3)
  function layerAt(x, y) {
    const i = (clamp(Math.floor(y * ms), 0, MH - 1) * MW + clamp(Math.floor(x * ms), 0, MW - 1)) * 4
    for (let k = 0; k < 4; k++) if (packed[i + k] > 127) return k
    return 4
  }
  function report() { onStats?.({ torn: stats.torn, deepest: stats.deepest, deepestName: NAMES()[stats.deepest - 1] }) }

  function startTear(x, y) {
    const k = layerAt(x, y)
    if (k >= 4) { // 맨 벽: 긁히며 가루만 떨어진다
      sfx.play('paper-dust', { gain: 0.3, rate: rand(1.1, 1.3), pan: (x / W - 0.5) * 0.6 })
      for (let i = 0; i < 10; i++) dust.push(mote(x + rand(-6, 6), y + rand(-4, 4), true))
      kick()
      return
    }
    const s = scaleF()
    tear = {
      k, p0: [x, y], target: [x, y], p: [x, y], dir: [0, 1], hasDir: false, lh: 0, lastLh: 0, acc: 0, lastGrain: 0,
      w0: rand(56, 100) * s, spread: rand(0.18, 0.4), amp: rand(3.5, 7.5), endAmp: rand(4, 9),
      phA: [rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)], phB: [rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)],
      max: rand(150, 430) * s,
    }
    uniforms.uKSel.value.set(...[0, 1, 2, 3].map((i) => (i === k ? 1 : 0)))
    uniforms.uAbove.value.set(...[0, 1, 2, 3].map((i) => (i < k ? 1 : 0)))
    uniforms.uFlapTint.value.set(...TINTS[k])
    uniforms.uFlapPrint.value = k === 3 ? 1 : 0
    uniforms.uP0.value.set(x, y)
    uniforms.uW0.value = tear.w0; uniforms.uSpread.value = tear.spread; uniforms.uAmp.value = tear.amp
    uniforms.uPhA.value.set(...tear.phA); uniforms.uPhB.value.set(...tear.phB)
    uniforms.uLh.value = 0
    uniforms.uActive.value = 0
    sfx.play('paper-peel', { gain: 0.25, rate: rand(1.1, 1.3), offset: PEEL_GRAINS[3][0], duration: PEEL_GRAINS[3][1] - PEEL_GRAINS[3][0], pan: (x / W - 0.5) * 0.6 })
    kick()
  }

  // 셰이더의 tearDist와 같은 식으로 찢긴 띠의 테두리를 점으로 만든다(끝 쪽은 조금 더 들쭉날쭉)
  function tearPolygon(T) {
    const perp = [-T.dir[1], T.dir[0]]
    const hw = (s, ph) => { const n = 0.5 * Math.sin(s * 0.07 + ph[0]) + 0.3 * Math.sin(s * 0.19 + ph[1]) + 0.2 * Math.sin(s * 0.47 + ph[2]); return Math.max(0, Math.min(s * 1.6 + 2, T.w0 * 0.5 + s * T.spread) + n * T.amp) }
    const endS = (t) => T.lh + T.endAmp * (0.6 * Math.sin(t * 0.11 + T.phA[0] * 2) + 0.4 * Math.sin(t * 0.29 + T.phB[1] * 3))
    const A = [], B = []
    const limit = T.lh + T.endAmp + 4
    for (let s = 0; s <= limit; s += 1.5) { const t = hw(s, T.phA); if (s > endS(t)) break; A.push([s, t]) }
    for (let s = 0; s <= limit; s += 1.5) { const t = -hw(s, T.phB); if (s > endS(t)) break; B.push([s, t]) }
    const tA = A.length ? A[A.length - 1][1] : 0, tB = B.length ? B[B.length - 1][1] : 0
    const end = []
    for (let t = tA; t > tB; t -= 1.5) end.push([endS(t), t])
    return [...A, ...end, ...B.reverse()].map(([s, t]) => [T.p0[0] + s * T.dir[0] + t * perp[0], T.p0[1] + s * T.dir[1] + t * perp[1]])
  }

  function commit() {
    const T = tear
    tear = null
    uniforms.uActive.value = 0
    dirty = true
    if (!T || !T.hasDir || T.lh < 5) return
    const poly = tearPolygon(T)
    const rg = region.getContext('2d', { willReadFrequently: true })
    rg.globalCompositeOperation = 'source-over'
    rg.clearRect(0, 0, MW, MH)
    rg.fillStyle = '#fff'
    rg.beginPath(); poly.forEach(([x, y], i) => (i ? rg.lineTo(x * ms, y * ms) : rg.moveTo(x * ms, y * ms))); rg.closePath(); rg.fill()
    rg.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < T.k; i++) rg.drawImage(masks[i], 0, 0)
    rg.globalCompositeOperation = 'destination-in'
    rg.drawImage(masks[T.k], 0, 0)
    rg.globalCompositeOperation = 'source-over'
    // 실제로 떨어진 넓이
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
    const bx = clamp(Math.floor(minX * ms), 0, MW - 1), by = clamp(Math.floor(minY * ms), 0, MH - 1)
    const bw = clamp(Math.ceil(maxX * ms) - bx + 1, 1, MW - bx), bh = clamp(Math.ceil(maxY * ms) - by + 1, 1, MH - by)
    const d = rg.getImageData(bx, by, bw, bh).data
    let area = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 127) area++
    area /= ms * ms
    if (area < 30) return
    makePiece(T, poly)
    const mg = masks[T.k].getContext('2d', { willReadFrequently: true })
    mg.globalCompositeOperation = 'destination-out'; mg.drawImage(region, 0, 0); mg.globalCompositeOperation = 'source-over'
    repack([T.k])
    stats.torn += 1
    memory.torn += 1
    if (T.k === 0) topTorn += 1
    stats.deepest = Math.max(stats.deepest, T.k + 2)
    report()
    // 소리: 찢어지는 소리(오래된 종이일수록 바삭하게), 깊은 겹이면 부스러기
    const pan = ((minX + maxX) / 2 / W - 0.5) * 0.7
    sfx.play('paper-rip', { gain: clamp(0.35 + area / 40000, 0.4, 1), rate: rand(0.92, 1.08) * (1 + T.k * 0.06), pan })
    if (T.k >= 2) sfx.play('paper-dust', { gain: 0.25 + T.k * 0.08, rate: rand(0.9, 1.1), pan, at: 0.08 })
    const motes = T.k >= 2 ? 16 + Math.min(30, area / 600) : 6
    for (let i = 0; i < motes; i++) { const [x, y] = poly[Math.floor(Math.random() * poly.length)]; dust.push(mote(x, y, T.k >= 3)) }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveHoles, 700)
  }

  // 떨어져 나간 조각: 뒷면이 보이게 뒤집힌 모양 그대로 떨어진다
  function makePiece(T, poly) {
    const M = [T.p0[0] + T.dir[0] * T.lh, T.p0[1] + T.dir[1] * T.lh]
    const [dx, dy] = T.dir
    const refl = ([x, y]) => { const s = (x - M[0]) * dx + (y - M[1]) * dy; return [x - 2 * s * dx, y - 2 * s * dy] }
    const rp = poly.map(refl)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of rp) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
    const pw = Math.ceil(maxX - minX) + 4, ph = Math.ceil(maxY - minY) + 4
    if (pw < 2 || ph < 2 || pw > 4000 || ph > 4000) return
    const c = mkCanvas(pw, ph)
    const g = c.getContext('2d')
    const mdot = M[0] * dx + M[1] * dy
    // 마스크 픽셀 → 반사 → 조각 캔버스
    g.setTransform((1 - 2 * dx * dx) / ms, (-2 * dx * dy) / ms, (-2 * dx * dy) / ms, (1 - 2 * dy * dy) / ms, 2 * mdot * dx - minX + 2, 2 * mdot * dy - minY + 2)
    g.drawImage(region, 0, 0)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-in'
    const pat = g.createPattern(backCanvas, 'repeat')
    pat?.setTransform?.(new DOMMatrix().scale(0.5))
    const [tr, tg, tb] = TINTS[T.k]
    g.fillStyle = pat || '#E7E0D0'; g.fillRect(0, 0, pw, ph)
    g.globalCompositeOperation = 'multiply'
    g.fillStyle = `rgb(${Math.round(255 * tr)},${Math.round(255 * tg)},${Math.round(255 * tb)})`; g.fillRect(0, 0, pw, ph)
    // 접힌 쪽(M 근처)이 어둡다
    const fx = M[0] - minX + 2, fy = M[1] - minY + 2
    const grad = g.createLinearGradient(fx, fy, fx + dx * 60, fy + dy * 60)
    grad.addColorStop(0, 'rgba(90,80,70,1)'); grad.addColorStop(1, 'rgba(255,255,255,1)')
    g.fillStyle = grad; g.fillRect(0, 0, pw, ph)
    g.globalCompositeOperation = 'destination-in'
    g.setTransform((1 - 2 * dx * dx) / ms, (-2 * dx * dy) / ms, (-2 * dx * dy) / ms, (1 - 2 * dy * dy) / ms, 2 * mdot * dx - minX + 2, 2 * mdot * dy - minY + 2)
    g.drawImage(region, 0, 0)
    pieces.push({ c, x: minX - 2 + pw / 2, y: minY - 2 + ph / 2, vx: dx * 140 + rand(-40, 40), vy: dy * 140 - 90, rot: 0, vr: rand(-2.2, 2.2), t: 0, ph: rand(0, 6) })
  }

  function mote(x, y, plasterDust) {
    return { x, y, vx: rand(-35, 35), vy: rand(-30, 30), t: 0, life: rand(0.9, 2.2), r: rand(0.6, plasterDust ? 2 : 1.4), c: plasterDust ? (Math.random() < 0.5 ? '170,160,145' : '205,198,184') : '238,234,224' }
  }

  function saveHoles() {
    if (!built) return
    if (topTorn === 0) { memory.holes = null; writeMemory(); return }
    const w = 320, h = Math.max(1, Math.round((320 * MH) / MW))
    const c = mkCanvas(w, h)
    c.getContext('2d').drawImage(masks[0], 0, 0, w, h)
    try { memory.holes = c.toDataURL('image/png') } catch { memory.holes = null }
    writeMemory()
  }

  /* ---------- 새 벽지 바르기 ---------- */
  function repaper() {
    if (!built || wipe) return
    if (tear) { tear = null; uniforms.uActive.value = 0 }
    saveHoles()
    curTop = (curTop + 1) % TOPS.length
    memory.top = curTop
    // 지금 벽지가 한 겹 아래로 내려가고(뜯은 자리 그대로), 그 위에 새 벽지. 그 아래는 꽃무늬와 신문
    const old = [...layers]
    layers[1] = { ...old[0], name: '지난번 벽지', age: 0.12 }
    layers[0] = { name: '새 벽지', tex: tex(topTile(TOPS[curTop]), { repeat: true }), size: 256, age: 0, rim: 1 }
    layers[2] = { name: '꽃무늬 벽지', tex: floralTex, size: 170, age: 0.55, rim: 0.85 }
    for (const l of old) if (!layers.some((x) => x.tex === l.tex)) l.tex.dispose()
    const g1 = masks[1].getContext('2d', { willReadFrequently: true })
    g1.clearRect(0, 0, MW, MH); g1.drawImage(masks[0], 0, 0)
    for (const i of [0, 2, 3]) { const g = masks[i].getContext('2d', { willReadFrequently: true }); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, MW, MH) }
    repack([0, 1, 2, 3])
    syncLayers()
    topTorn = 0
    stats.deepest = 1
    memory.holes = null
    writeMemory()
    report()
    wipe = { t: 0 }
    uniforms.uWipe.value = 0
    sfx.play('paper-peel', { gain: 0.35, rate: 0.62, offset: PEEL_GRAINS[0][0], duration: PEEL_GRAINS[0][1] - PEEL_GRAINS[0][0] })
    sfx.play('paper-peel', { gain: 0.3, rate: 0.55, offset: PEEL_GRAINS[1][0], duration: PEEL_GRAINS[1][1] - PEEL_GRAINS[1][0], at: 0.42 })
    kick()
  }

  // 버튼으로 한 줄 뜯기(키보드·화면 읽기 사용자, 그리고 목록 영상 녹화용)
  function peelOnce() {
    if (!built || tear || auto) return
    sfx.unlock()
    for (let tries = 0; tries < 12; tries++) {
      const x = rand(W * 0.25, W * 0.75), y = rand(H * 0.22, H * 0.62)
      if (layerAt(x, y) >= 4) continue
      const a = rand(0.15, 0.85) * Math.PI
      startTear(x, y)
      auto = { from: [x, y], dir: [Math.cos(a), Math.sin(a)], len: rand(300, 520) * scaleF(), t: 0 }
      return
    }
  }

  /* ---------- 한 프레임 ---------- */
  let backCanvas = null
  function frame(now) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (auto && tear) {
      auto.t += dt / 0.95
      const e = auto.t < 1 ? 1 - Math.pow(1 - auto.t, 2.2) : 1
      tear.target = [auto.from[0] + auto.dir[0] * auto.len * e, auto.from[1] + auto.dir[1] * auto.len * e]
      if (auto.t >= 1.12) { auto = null; commit() }
    } else if (auto && !tear) auto = null
    if (tear) {
      const k = 1 - Math.exp(-dt * 26)
      tear.p[0] += (tear.target[0] - tear.p[0]) * k
      tear.p[1] += (tear.target[1] - tear.p[1]) * k
      const vx = tear.p[0] - tear.p0[0], vy = tear.p[1] - tear.p0[1]
      const len = Math.hypot(vx, vy)
      if (len > 8) {
        const nx = vx / len, ny = vy / len
        if (!tear.hasDir) { tear.dir = [nx, ny]; tear.hasDir = true } else {
          const b = 1 - Math.exp(-dt * 10)
          const ax = tear.dir[0] + (nx - tear.dir[0]) * b, ay = tear.dir[1] + (ny - tear.dir[1]) * b, al = Math.hypot(ax, ay) || 1
          tear.dir = [ax / al, ay / al]
        }
      }
      tear.lh = tear.hasDir ? len / 2 : 0
      uniforms.uActive.value = tear.hasDir ? 1 : 0
      uniforms.uDir.value.set(tear.dir[0], tear.dir[1])
      uniforms.uLh.value = tear.lh
      // 뜯는 소리: 찢김이 나아간 만큼 조각을 이어 튼다
      const grow = Math.max(0, tear.lh - tear.lastLh)
      tear.lastLh = tear.lh
      tear.acc += grow
      if (tear.acc > 5 && now - tear.lastGrain > 75) {
        const speed = tear.acc / Math.max(0.016, (now - tear.lastGrain) / 1000)
        const gr = PEEL_GRAINS[Math.floor(Math.random() * 3)]
        const dur = Math.min(gr[1] - gr[0], 0.12 + Math.random() * 0.2)
        sfx.play('paper-peel', { gain: clamp(speed / 500, 0.12, 0.85), rate: rand(0.9, 1.1) * (1 + tear.k * 0.07), offset: gr[0] + rand(0, gr[1] - gr[0] - dur), duration: dur, fade: 0.02, pan: (tear.p0[0] / W - 0.5) * 0.6 })
        tear.acc = 0
        tear.lastGrain = now
      }
      if (tear.lh > tear.max) { dead = !auto; commit() } // 너무 길게 당기면 저절로 끊긴다
      dirty = true
    }
    if (wipe) {
      wipe.t += dt / 0.9
      uniforms.uWipe.value = Math.min(1.001, 1 - Math.pow(1 - Math.min(1, wipe.t), 2.4))
      if (wipe.t >= 1) { uniforms.uWipe.value = 2; wipe = null }
      dirty = true
    }
    if (dirty) { renderer.render(scene, camera); dirty = false }
    drawOverlay(dt)
    if (tear || wipe || pieces.length || dust.length || dirty) raf = requestAnimationFrame(frame)
  }
  function kick() { if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(frame) } }

  let odpr = 1
  function drawOverlay(dt) {
    ctx2.setTransform(odpr, 0, 0, odpr, 0, 0)
    ctx2.clearRect(0, 0, W, H)
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]
      p.t += dt
      p.vy += 1600 * dt
      p.vx *= Math.exp(-dt * 1.5)
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
      const alpha = 1 - clamp((p.t - 0.55) / 0.5, 0, 1)
      if (alpha <= 0 || p.y - p.c.height > H) { pieces.splice(i, 1); continue }
      ctx2.save()
      ctx2.globalAlpha = alpha
      ctx2.translate(p.x, p.y); ctx2.rotate(p.rot); ctx2.scale(1, 0.55 + 0.45 * Math.cos(p.t * 5 + p.ph))
      ctx2.shadowColor = 'rgba(0,0,0,.25)'; ctx2.shadowBlur = 12; ctx2.shadowOffsetY = 8
      ctx2.drawImage(p.c, -p.c.width / 2, -p.c.height / 2)
      ctx2.restore()
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const m = dust[i]
      m.t += dt
      if (m.t > m.life) { dust.splice(i, 1); continue }
      m.vy += 240 * dt; m.vx *= Math.exp(-dt * 2); m.vy *= Math.exp(-dt * 0.8)
      m.x += m.vx * dt; m.y += m.vy * dt
      ctx2.fillStyle = `rgba(${m.c},${(1 - m.t / m.life) * 0.9})`
      ctx2.beginPath(); ctx2.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx2.fill()
    }
  }

  /* ---------- 입력 ---------- */
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  let pointer = null
  function onDown(e) {
    if (!built || auto || (e.button !== undefined && e.button !== 0)) return
    sfx.unlock()
    canvas.setPointerCapture?.(e.pointerId)
    pointer = e.pointerId
    dead = false
    const [x, y] = local(e)
    startTear(x, y)
  }
  function onMove(e) {
    if (e.pointerId !== pointer || !tear || dead || auto) return
    tear.target = local(e)
    kick()
  }
  function onUp(e) {
    if (e.pointerId !== pointer) return
    pointer = null
    if (!dead && !auto) commit()
    dead = false
    kick()
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  const onHide = () => saveHoles()
  window.addEventListener('pagehide', onHide)

  report()

  return {
    resize(w, h) {
      const first = !built
      W = w; H = h
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      odpr = Math.min(window.devicePixelRatio || 1, 2)
      overlay.width = Math.round(w * odpr); overlay.height = Math.round(h * odpr)
      uniforms.uRes.value.set(w, h)
      const nms = Math.min(1, 1300 / Math.max(w, h))
      const nMW = Math.max(1, Math.round(w * nms)), nMH = Math.max(1, Math.round(h * nms))
      if (first || nMW !== MW || nMH !== MH) { ms = nms; MW = nMW; MH = nMH; buildMasks(!first) }
      if (first) {
        // 화면 한 장짜리 무늬는 처음 크기에 맞춰 한 번만 그린다(크기가 바뀌면 늘여 쓴다)
        const sc = Math.min(1.5, 2400 / Math.max(w, h))
        const news = new THREE.CanvasTexture(newspaper(w, h, sc)); news.colorSpace = THREE.SRGBColorSpace
        const wall = new THREE.CanvasTexture(plaster(w, h, sc, memory.visits)); wall.colorSpace = THREE.SRGBColorSpace
        uniforms.uT4.value = news; uniforms.uPlaster.value = wall
        backCanvas = uniforms.uBack.value.image
        built = true
        if (memory.visits > 1 && prevHoles) loadHoles(prevHoles, 1)
      }
      dirty = true
      kick()
    },
    peel: peelOnce,
    repaper,
    setPaused(p) { paused = p; if (p) { cancelAnimationFrame(raf); raf = 0 } else kick() },
    dispose() {
      cancelAnimationFrame(raf)
      clearTimeout(saveTimer)
      saveHoles()
      window.removeEventListener('pagehide', onHide)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      for (const v of Object.values(uniforms)) v.value?.dispose?.()
      for (const l of layers) l.tex.dispose()
      renderer.dispose()
    },
  }
}
