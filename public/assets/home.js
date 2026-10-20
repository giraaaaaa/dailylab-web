// Daily Lab 홈의 워드마크. 글자는 탄성 막이라 잡아당기면 늘어나고, 놓으면 출렁이며 돌아온다.
// 화면 전체가 촘촘한 삼각형 메시 한 장이고, 꼭짓점을 변위장만큼 밀어서 막 자체를 늘인다. 조각마다
// 원래(재료) 좌표를 들고 있어서 글자 모양(SDF)과 점 격자를 그 좌표로 그리면 아무리 늘여도 깨지지 않는다.
// 변위장은 CPU의 스프링 격자(파동 방정식)로 푼다. WebGL2가 없거나 준비되기 전에는 <h1>이 그대로 보인다.

const frame = document.querySelector('.frame')
const mark = document.querySelector('.mark')
const canvas = document.querySelector('.stage')
const hint = document.querySelector('.hint')
const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
const darkMq = matchMedia('(prefers-color-scheme: dark)')

// home.css와 같은 색. ink는 부풀기 전 평면 글자색이라 <h1> 색과 정확히 같아야 바꿔치기가 보이지 않는다.
const THEMES = {
  light: { bg: '#F1F1EF', ink: '#0E0E10', accent: '#2A4BFF', metal: 0, dots: 0.12, shadow: 0.2 },
  dark: { bg: '#0B0B0D', ink: '#E4E4E1', accent: '#6680FF', metal: 1, dots: 0.14, shadow: 0.55 },
}

const DT = 1 / 120 // 물리는 고정 간격으로 돌려 화면 주사율과 무관하게 같은 촉감을 낸다
const K = {
  rest: 40, // 제자리로 돌아가려는 힘
  link: 5000, // 이웃 격자끼리 붙잡는 힘 (클수록 물결이 빨리 퍼진다)
  damp: 3.2, // 출렁임이 잦아드는 빠르기
  grab: 1700, // 잡은 부분이 손끝을 따라오는 힘
  grabDamp: 16,
  lens: 700, // 마우스 근처가 살짝 부풀어 보이는 힘
  wake: 2.4, // 마우스가 지나간 자리에 남는 물결
  poke: 520, // 톡 쳤을 때 퍼지는 파문
  plop: 240, // 처음 부풀 때 글자가 내려앉는 반동
  pull: 240, // 링크에 마우스를 올리면 글자가 그쪽으로 기우는 힘
  exitPull: 13000, // 링크를 누르면 글자가 그쪽으로 빨려 들어가는 힘
}
const INTRO = { delay: 0.08, sweep: 0.55, dur: 1.15, end: 2.2 } // 셰이더의 swell()과 같은 값
const EXIT_MS = 460

const VERT = `#version 300 es
in vec2 aRest;            // 꼭짓점의 원래 자리(css px)
uniform sampler2D uDisp;  // 변위장(css px)
uniform vec2 uSize;
out vec2 vRest;
void main() {
  vec2 p = aRest + texture(uDisp, aRest / uSize).xy;
  vRest = aRest;
  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 vRest;
out vec4 outColor;
uniform sampler2D uSdf;   // R: 글자까지의 부호 거리(css px, 안쪽이 +), G: 살짝 흐린 값(윤곽), B: 많이 흐린 값(높이)
uniform vec2 uSize;
uniform float uDpr;
uniform float uBevel, uIntro, uDrain, uMetal, uDots, uShadow;
uniform vec3 uBg, uInk, uAccent;

// 처음 부푸는 정도. 왼쪽 글자부터 차례로, 살짝 넘쳤다가 자리를 잡는 스프링 곡선
float swell(float x) {
  float u = clamp((uIntro - ${INTRO.delay} - x / uSize.x * ${INTRO.sweep}) / ${INTRO.dur}, 0.0, 1.0);
  return 1.0 - exp(-4.6 * u) * cos(9.0 * u);
}
float grow(float sw) { return max(sw - 1.0, 0.0) * uBevel * 0.5 - uDrain * uBevel * 2.4; }
// 윤곽: 평면일 땐 원래 글자 모양 그대로, 부풀수록 흐린 거리 쪽으로 옮겨가 모서리가 둥글어진다
float shape(vec2 s, float sw) {
  vec2 t = texture(uSdf, s / uSize).rg;
  return mix(t.r, t.g, smoothstep(0.0, 0.6, sw)) + grow(sw);
}
// 높이는 많이 흐린 값(B)으로 만들어 획 가운데 각진 능선 없이 젤리처럼 솟게 한다. 흐리면 모서리 끝이 음수로 꺼지므로
// 윤곽(G)의 절반을 바닥으로 받쳐(부드러운 max) 가장자리가 항상 0에서 시작하게 한다
float smax(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * 0.25; }
float soft(vec2 s, float sw) {
  vec3 t = texture(uSdf, s / uSize).rgb;
  float g = mix(t.r, t.g, smoothstep(0.0, 0.6, sw));
  return smax(t.b, g * 0.6, uBevel * 0.25) + grow(sw);
}
float height(float d, float sw) {
  float x = clamp(d / uBevel, 0.0, 1.0);
  return sqrt(1.0 - (1.0 - x) * (1.0 - x)) * uBevel * sw;
}
// 스튜디오 조명: 위쪽 큰 소프트박스(sky), 오른쪽 세로 띠(strip), 왼쪽 위 키 라이트(key), 바닥(ground)
vec4 env(vec3 r) {
  float up = -r.y;
  return vec4(smoothstep(-0.05, 0.8, up),
              smoothstep(0.45, 0.95, r.x) * smoothstep(-0.55, 0.3, up),
              pow(max(dot(r, normalize(vec3(-0.4, -0.8, 0.45))), 0.0), 36.0),
              smoothstep(0.1, -0.85, up));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // 화면에서 오른쪽·아래로 1css px 갈 때 재료 좌표가 얼마나 바뀌나(삼각형마다 일정)
  vec2 s0 = vRest;
  vec2 ex = dFdx(s0) * uDpr, ey = -dFdy(s0) * uDpr;
  vec2 sx = s0 + ex, sy = s0 + ey;
  float sw = swell(s0.x);
  float d0 = shape(s0, sw), dx = shape(sx, sw), dy = shape(sy, sw);
  float cov = clamp(d0 / max(fwidth(d0), 1e-3) + 0.5, 0.0, 1.0);
  // 늘어난 정도(그린 변형률: 돌거나 옮겨지기만 한 곳은 0). 실제로 늘어나거나 눌린 곳만 포인트 색이 돈다
  float ga = dot(ex, ex) - 1.0, gb = dot(ey, ey) - 1.0, gc = dot(ex, ey);
  float strain = smoothstep(0.2, 1.3, sqrt(ga * ga + gb * gb + 2.0 * gc * gc));

  // 바탕: 그림자와 막을 따라 휘는 점 격자
  vec3 col = uBg;
  float lift = clamp(sw, 0.0, 1.0);
  float sd = shape(s0 - vec2(5.0, 9.0) * lift, sw);
  col *= 1.0 - smoothstep(-uBevel * 1.5, uBevel * 0.6, sd) * uShadow * lift;
  vec2 g = (fract(s0 / 22.0) - 0.5) * 22.0;
  float r = length(g);
  float edge = min(min(s0.x, uSize.x - s0.x), min(s0.y, uSize.y - s0.y));
  float dotA = clamp((1.1 - r) / max(fwidth(r), 1e-3) + 0.5, 0.0, 1.0) * smoothstep(0.0, 160.0, edge);
  col = mix(col, mix(uInk, uAccent, strain), clamp(dotA * uDots * (1.0 + strain * 3.0), 0.0, 1.0));

  // 글자: 거리장을 둥근 높이로 바꿔 법선을 얻고, 밝은 쪽은 반사로 칠한다
  float h0 = height(soft(s0, sw), sw), hx = height(soft(sx, sw), sw), hy = height(soft(sy, sw), sw);
  vec3 n = normalize(vec3(h0 - hx, h0 - hy, 1.0));
  vec3 rf = reflect(vec3(0.0, 0.0, -1.0), n);
  float fres = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
  vec4 L = env(rf);
  // 라이트: 젖은 검은 젤리(반사는 가장자리로 갈수록 강해진다). 다크: 액체 크롬
  float gloss = (L.x * 0.16 + L.y * 0.24) * (1.0 + fres * 5.0) + L.z * 1.15;
  float chrome = 0.18 + L.x * 0.75 + L.y * 0.4 + L.z * 1.2 - L.w * 0.12;
  vec3 lit = mix(uInk * 0.7 + gloss, vec3(chrome), uMetal);
  lit = mix(lit, uAccent * (0.45 + mix(gloss, chrome, uMetal) * 0.9), strain * 0.7);
  vec3 mat = mix(uInk, lit, smoothstep(0.0, 0.5, sw));
  col = mix(col, mat, cov);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`

const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })

let prog, loc, sdfTex, dispTex, vao, meshBuf, indexBuf, indexCount = 0
let W = 0, H = 0, quality = 1, bevel = 20, letters = []
let GX = 0, GY = 0, cw = 1, ch = 1, px, py, vx, vy, disp
let grabR = 90, lensR = 130, reach = 220
let grab = null, hover = null, pull = null, exitAt = 0, drain = 0
let introAt = 0, plopped = 0
let raf = 0, last = 0, acc = 0, slow = 0
const reduced = () => reduceMq.matches

async function start() {
  prog = program(VERT, FRAG)
  loc = {}
  for (const name of ['uSdf', 'uDisp', 'uSize', 'uDpr', 'uBevel', 'uIntro', 'uDrain', 'uMetal', 'uDots', 'uShadow', 'uBg', 'uInk', 'uAccent']) {
    loc[name] = gl.getUniformLocation(prog, name)
  }
  gl.useProgram(prog)
  gl.uniform1i(loc.uSdf, 0)
  gl.uniform1i(loc.uDisp, 1)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  sdfTex = texture()
  dispTex = texture()
  vao = gl.createVertexArray()
  meshBuf = gl.createBuffer()
  indexBuf = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf)
  const aRest = gl.getAttribLocation(prog, 'aRest')
  gl.enableVertexAttribArray(aRest)
  gl.vertexAttribPointer(aRest, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf)

  await document.fonts.load('900 100px "Geist DL"')
  layout()
  draw(0) // 첫 프레임은 부풀기 전의 평면 글자라 <h1>과 똑같다
  frame.classList.add('gl')
  introAt = reduced() ? -1 : performance.now()
  bind()
  wake()
  setTimeout(() => hint.classList.add('show'), reduced() ? 0 : 1800)
}

// ---- 레이아웃: <h1>이 놓인 그대로 글자를 래스터화해 거리장을 만든다 -------------------------------

function layout() {
  const fr = frame.getBoundingClientRect()
  W = fr.width
  H = fr.height
  sizeCanvas()
  buildSdf(fr)
  buildGrid()
  buildMesh()
  const m = Math.min(W, H)
  grabR = clamp(m * 0.11, 56, 120)
  lensR = grabR * 1.5
  reach = m * 0.3 + 60
}

function sizeCanvas() {
  const cap = W * H > 1.4e6 ? 1.5 : 2
  const dpr = Math.min(window.devicePixelRatio || 1, cap) * quality
  canvas.width = Math.max(1, Math.round(W * dpr))
  canvas.height = Math.max(1, Math.round(H * dpr))
}

function buildSdf(fr) {
  const rs = Math.min(1, 1100 / Math.max(W, H))
  const SW = Math.max(2, Math.round(W * rs)), SH = Math.max(2, Math.round(H * rs))
  const c = document.createElement('canvas')
  c.width = SW
  c.height = SH
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.scale(rs, rs)
  const cs = getComputedStyle(mark)
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  ctx.textBaseline = 'alphabetic'
  letters = []
  const range = document.createRange()
  for (const line of mark.querySelectorAll('.line')) {
    const base = line.querySelector('.bl').getBoundingClientRect().top - fr.top
    const node = [...line.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
    for (let i = 0; i < node.data.length; i++) {
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const b = range.getBoundingClientRect()
      const x = b.left - fr.left
      ctx.fillText(node.data[i], x, base) // 자간·커닝은 브라우저가 배치한 글자 위치를 그대로 쓴다
      letters.push({ x: x + b.width / 2, y: base - b.height * 0.3 })
    }
  }
  letters.sort((a, b) => a.x - b.x) // 두 줄일 때도 부푸는 순서(왼쪽부터)와 맞춘다

  // 알파 → 부호 거리 (Felzenszwalb EDT, 경계 픽셀은 알파로 반 픽셀 보정)
  const a8 = ctx.getImageData(0, 0, SW, SH).data
  const n = SW * SH
  const outer = new Float64Array(n), inner = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = a8[i * 4 + 3] / 255
    if (a === 0) { outer[i] = INF; inner[i] = 0 }
    else if (a === 1) { outer[i] = 0; inner[i] = INF }
    else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0 }
  }
  edt(outer, SW, SH)
  edt(inner, SW, SH)
  const sdf = new Float32Array(n)
  let deepest = 0
  for (let i = 0; i < n; i++) {
    const d = (Math.sqrt(inner[i]) - Math.sqrt(outer[i])) / rs
    sdf[i] = d
    if (d > deepest) deepest = d
  }
  bevel = Math.max(4, deepest * 0.9)
  // 상자 흐림을 여러 번 겹치면 가우시안에 가깝다. 윤곽은 모서리만 살짝, 높이는 획 가운데 능선이 사라질 만큼
  const edge = blur(sdf, SW, SH, Math.max(1, Math.round(deepest * rs * 0.1)), 2)
  const soft = blur(sdf, SW, SH, Math.max(1, Math.round(deepest * rs * 0.26)), 3)
  const rgba = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) { rgba[4 * i] = sdf[i]; rgba[4 * i + 1] = edge[i]; rgba[4 * i + 2] = soft[i] }
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sdfTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SW, SH, 0, gl.RGBA, gl.FLOAT, rgba)
}

function blur(src, w, h, r, passes) {
  let out = src
  for (let i = 0; i < passes; i++) out = boxBlur(out, w, h, r)
  return out
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * k
      acc += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * k
      acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x]
    }
  }
  return out
}

const INF = 1e20
function edt(grid, w, h) {
  const len = Math.max(w, h)
  const f = new Float64Array(len), v = new Uint16Array(len), z = new Float64Array(len + 1)
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z)
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z)
}
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  f[0] = grid[offset]
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride]
    const q2 = q * q
    do {
      const r = v[k]
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2
    } while (s <= z[k] && --k > -1)
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++
    const r = v[k], qr = q - r
    grid[offset + q * stride] = f[r] + qr * qr
  }
}

function buildGrid() {
  const cell = W < 700 ? 12 : 14
  GX = Math.max(8, Math.round(W / cell))
  GY = Math.max(8, Math.round(H / cell))
  cw = W / GX
  ch = H / GY
  const n = GX * GY
  px = new Float32Array(n)
  py = new Float32Array(n)
  vx = new Float32Array(n)
  vy = new Float32Array(n)
  disp = new Float32Array(n * 2)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, dispTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, GX, GY, 0, gl.RG, gl.FLOAT, disp)
}

// 그리는 메시는 물리 격자보다 촘촘하게(꼭짓점에서 변위장을 보간해 읽는다)
function buildMesh() {
  const cell = W < 700 ? 6 : 8
  const nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1
  const verts = new Float32Array(nx * ny * 2)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      verts[(j * nx + i) * 2] = Math.min(W, i * cell)
      verts[(j * nx + i) * 2 + 1] = Math.min(H, j * cell)
    }
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6)
  let o = 0
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      idx[o++] = a; idx[o++] = c; idx[o++] = b
      idx[o++] = b; idx[o++] = c; idx[o++] = d
    }
  }
  indexCount = idx.length
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
}

// ---- 물리: 격자 한 칸 한 칸이 제자리·이웃에 스프링으로 묶여 있다 --------------------------------------

function around(cx, cy, radius, fn) {
  const r3 = radius * 3, inv = 1 / (2 * radius * radius)
  const i0 = Math.max(0, Math.floor((cx - r3) / cw)), i1 = Math.min(GX - 1, Math.ceil((cx + r3) / cw))
  const j0 = Math.max(0, Math.floor((cy - r3) / ch)), j1 = Math.min(GY - 1, Math.ceil((cy + r3) / ch))
  for (let j = j0; j <= j1; j++) {
    const dy = (j + 0.5) * ch - cy
    for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * cw - cx
      const w = Math.exp(-(dx * dx + dy * dy) * inv)
      if (w > 0.002) fn(j * GX + i, w, dx, dy)
    }
  }
}

function step(dt) {
  const kr = K.rest, kl = K.link, c = reduced() ? K.damp * 4 : K.damp
  for (let j = 0; j < GY; j++) {
    const row = j * GX, up = (j > 0 ? j - 1 : j) * GX, dn = (j < GY - 1 ? j + 1 : j) * GX
    for (let i = 0; i < GX; i++) {
      const k = row + i, l = row + (i > 0 ? i - 1 : i), r = row + (i < GX - 1 ? i + 1 : i), u = up + i, d = dn + i
      vx[k] += (kl * (px[l] + px[r] + px[u] + px[d] - 4 * px[k]) - kr * px[k] - c * vx[k]) * dt
      vy[k] += (kl * (py[l] + py[r] + py[u] + py[d] - 4 * py[k]) - kr * py[k] - c * vy[k]) * dt
    }
  }

  if (grab) {
    // 멀리 끌수록 점점 버티는 고무줄
    let ox = grab.qx - grab.gx, oy = grab.qy - grab.gy
    const len = Math.hypot(ox, oy)
    if (len > 1e-3) { const s = (reach * Math.tanh(len / reach)) / len; ox *= s; oy *= s }
    // 당긴 거리에 비해 잡은 폭이 너무 좁으면 막이 앞쪽을 타고 넘어 접힌다. 멀리 당길수록 넓게 잡는다
    const radius = Math.max(grabR, Math.hypot(ox, oy) * 0.55)
    around(grab.gx, grab.gy, radius, (k, w) => {
      vx[k] += (K.grab * w * (ox * w - px[k]) - K.grabDamp * w * vx[k]) * dt
      vy[k] += (K.grab * w * (oy * w - py[k]) - K.grabDamp * w * vy[k]) * dt
    })
  } else if (hover && !reduced()) {
    const hv = hover
    around(hv.x, hv.y, lensR, (k, w, dx, dy) => {
      vx[k] += (K.lens * w * (dx / lensR) + K.wake * w * hv.vx) * dt
      vy[k] += (K.lens * w * (dy / lensR) + K.wake * w * hv.vy) * dt
    })
    const fade = Math.exp(-dt * 7)
    hv.vx *= fade
    hv.vy *= fade
  }

  if (pull) {
    const radius = pull.exit ? Math.hypot(W, H) * 0.6 : Math.max(W, H) * 0.35
    const kp = pull.exit ? K.exitPull : K.pull
    around(pull.x, pull.y, radius, (k, w, dx, dy) => {
      const r = Math.hypot(dx, dy) + 30
      vx[k] -= kp * w * (dx / r) * dt
      vy[k] -= kp * w * (dy / r) * dt
    })
  }

  for (let k = 0, n = px.length; k < n; k++) {
    px[k] += vx[k] * dt
    py[k] += vy[k] * dt
  }
}

function poke(x, y, strength) {
  around(x, y, grabR * 0.7, (k, w, dx, dy) => {
    const r = Math.hypot(dx, dy) + 1
    vx[k] += strength * w * (dx / r)
    vy[k] += strength * w * (dy / r)
  })
}

function energy() {
  let e = 0
  for (let k = 0, n = vx.length; k < n; k++) {
    const a = Math.abs(vx[k]) + Math.abs(vy[k])
    if (a > e) e = a
  }
  return e
}

// ---- 그리기 루프: 움직일 게 없으면 멈춰서 배터리를 쓰지 않는다 -----------------------------------------

function wake() {
  if (raf) return
  last = performance.now()
  raf = requestAnimationFrame(tick)
}

function tick(now) {
  raf = 0
  const dt = Math.min((now - last) / 1000, 1 / 20)
  last = now
  const t = introAt > 0 ? (now - introAt) / 1000 : 99

  // 부풀어 오르는 글자마다 한 번씩 살짝 내려앉혀 젤리처럼 자리 잡게 한다
  while (introAt > 0 && plopped < letters.length) {
    const L = letters[plopped]
    if (t < INTRO.delay + (L.x / W) * INTRO.sweep + 0.16) break
    around(L.x, L.y, bevel * 2.4, (k, w) => { vy[k] += K.plop * w })
    plopped++
  }
  if (exitAt) {
    const u = Math.min(1, (now - exitAt) / EXIT_MS)
    drain = Math.max(0, (u - 0.35) / 0.65) ** 2
  }

  acc += dt
  let n = 0
  while (acc >= DT && n < 6) { step(DT); acc -= DT; n++ }
  if (n === 6) acc = 0
  draw(now)

  // 너무 느린 기기면 해상도를 조금씩 낮춘다
  if (dt > 0.026 && dt < 0.07) slow++ // 그보다 긴 프레임은 탭 전환·스로틀링이라 기기 성능 탓이 아니다
  else slow = Math.max(0, slow - 1)
  if (slow > 40 && quality > 0.55) { quality *= 0.8; slow = 0; sizeCanvas() }

  const e = energy()
  const busy = grab || exitAt || t < INTRO.end || (hover && now - hover.t < 900) || e > 0.5
  if (busy) { raf = requestAnimationFrame(tick); return }
  if (!hover && !pull && e < 0.5) { px.fill(0); py.fill(0); vx.fill(0); vy.fill(0); draw(now) }
}

const rgbCache = new Map()
function rgb(hex) {
  if (!rgbCache.has(hex)) rgbCache.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255))
  return rgbCache.get(hex)
}

function draw(now) {
  for (let k = 0, n = px.length; k < n; k++) { disp[2 * k] = px[k]; disp[2 * k + 1] = py[k] }
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, dispTex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GX, GY, gl.RG, gl.FLOAT, disp)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sdfTex)

  const th = THEMES[darkMq.matches ? 'dark' : 'light']
  const bg = rgb(th.bg)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clearColor(bg[0], bg[1], bg[2], 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.uniform2f(loc.uSize, W, H)
  gl.uniform1f(loc.uDpr, canvas.width / W)
  gl.uniform1f(loc.uBevel, bevel)
  gl.uniform1f(loc.uIntro, introAt === 0 ? 0 : introAt < 0 ? 99 : (now - introAt) / 1000)
  gl.uniform1f(loc.uDrain, drain)
  gl.uniform1f(loc.uMetal, th.metal)
  gl.uniform1f(loc.uDots, th.dots)
  gl.uniform1f(loc.uShadow, th.shadow)
  gl.uniform3fv(loc.uBg, bg)
  gl.uniform3fv(loc.uInk, rgb(th.ink))
  gl.uniform3fv(loc.uAccent, rgb(th.accent))
  gl.bindVertexArray(vao)
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0)
}

// ---- 입력 -----------------------------------------------------------------------------------------

function local(e) {
  const r = frame.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function bind() {
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || exitAt) return
    try { canvas.setPointerCapture(e.pointerId) } catch {}
    const p = local(e)
    grab = { id: e.pointerId, gx: p.x, gy: p.y, qx: p.x, qy: p.y, at: performance.now() }
    frame.classList.add('is-grabbing')
    wake()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!grab || e.pointerId !== grab.id) return
    const p = local(e)
    grab.qx = p.x
    grab.qy = p.y
    if (Math.hypot(p.x - grab.gx, p.y - grab.gy) > 24) hint.classList.add('gone')
  })
  const release = (e) => {
    if (!grab || e.pointerId !== grab.id) return
    const quick = performance.now() - grab.at < 220 && Math.hypot(grab.qx - grab.gx, grab.qy - grab.gy) < 8
    if (quick && !reduced()) poke(grab.gx, grab.gy, K.poke)
    grab = null
    frame.classList.remove('is-grabbing')
    wake()
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  frame.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || grab) return
    const p = local(e), now = performance.now()
    if (hover) {
      const dt = Math.max(8, now - hover.t) / 1000
      hover.vx = hover.vx * 0.6 + ((p.x - hover.x) / dt) * 0.4
      hover.vy = hover.vy * 0.6 + ((p.y - hover.y) / dt) * 0.4
      hover.x = p.x
      hover.y = p.y
      hover.t = now
    } else {
      hover = { x: p.x, y: p.y, vx: 0, vy: 0, t: now }
    }
    wake()
  })
  frame.addEventListener('pointerleave', () => { hover = null; wake() })

  // 링크 쪽으로 기울기, 누르면 그쪽으로 빨려 들어가며 사라진 뒤 이동
  for (const a of document.querySelectorAll('a[data-exit]')) {
    const toward = () => {
      if (exitAt || reduced()) return
      const b = a.getBoundingClientRect(), fr = frame.getBoundingClientRect()
      pull = { x: b.left + b.width / 2 - fr.left, y: b.top + b.height / 2 - fr.top, exit: false }
      wake()
    }
    const away = () => { if (!exitAt) { pull = null; wake() } }
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') toward() })
    a.addEventListener('pointerleave', away)
    a.addEventListener('focus', toward)
    a.addEventListener('blur', away)
    a.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduced()) return
      e.preventDefault()
      toward()
      pull.exit = true
      exitAt = performance.now()
      frame.classList.add('is-leaving')
      wake()
      setTimeout(() => location.assign(a.href), EXIT_MS)
    })
  }

  // 뒤로 가기로 돌아오면(bfcache) 빨려 들어간 상태 그대로라 원래대로 되돌린다
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return
    exitAt = 0
    drain = 0
    pull = null
    frame.classList.remove('is-leaving')
    px.fill(0); py.fill(0); vx.fill(0); vy.fill(0)
    draw(performance.now())
  })

  darkMq.addEventListener('change', () => draw(performance.now()))
  let pending = 0
  new ResizeObserver(() => {
    clearTimeout(pending)
    pending = setTimeout(() => { layout(); draw(performance.now()); wake() }, 120)
  }).observe(frame)
}

// ---- WebGL 잡일 -----------------------------------------------------------------------------------

function program(vs, fs) {
  const p = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  return p
}

function texture() {
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }

// 모듈 아래쪽 선언(let)이 다 끝난 뒤에 시작한다
if (gl) start().catch((err) => { console.warn('[home] 워드마크를 평면 글자로 둡니다:', err); frame.classList.remove('gl') })
