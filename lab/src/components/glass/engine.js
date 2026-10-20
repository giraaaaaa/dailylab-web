import { CRACK_SPEED, area, centroid, contains, fractureShard, impactPattern, isFree, mulberry32, pane, shatterShard } from './fracture.mjs'
import { drawBackdrop } from './backdrop'

/* 유리 한 장 — WebGL2 렌더러 + 조각 물리.
   판은 z=0에 놓인 두께 있는 볼록 다각형 조각들의 모음. 카메라는 판 높이(2)가 화면 높이에 꼭 맞게 둔다.
   조각 뒤 풍경은 화면 공간 텍스처를 조각의 기울기만큼 비틀어 읽어 굴절처럼 보이게 한다. */

const THICK = 0.016
const CAM_Z = 3.2
const GRAVITY = -6
const MAX_SHARDS = 520

const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec2 aPlane;
layout(location = 3) in float aEdge;
layout(location = 4) in vec4 aCrack;
layout(location = 5) in float aKind;
uniform mat4 uViewProj;
out vec3 vNrm;
out vec3 vWorld;
out vec2 vPlane;
out float vEdge;
out vec4 vCrack;
out float vKind;
void main() {
  vNrm = aNrm; vWorld = aPos; vPlane = aPlane; vEdge = aEdge; vCrack = aCrack; vKind = aKind;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`

const FS = `#version 300 es
precision highp float;
in vec3 vNrm;
in vec3 vWorld;
in vec2 vPlane;
in float vEdge;
in vec4 vCrack;   // 금의 시작점 xy, 시작 시각, 보이는 반지름
in float vKind;   // 0 = 앞뒷면, 1 = 옆면(유리 단면)
uniform sampler2D uBg;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpeed;
uniform vec3 uCam;
out vec4 o;
const vec3 L = vec3(-0.451, 0.551, 0.702);

vec3 env(vec3 r) {
  float sky = smoothstep(-0.2, 1.0, r.y);
  float box1 = smoothstep(0.86, 0.97, dot(r, vec3(-0.53, 0.64, 0.56)));
  float box2 = smoothstep(0.9, 0.985, dot(r, vec3(0.70, 0.10, 0.71)));
  return vec3(0.07, 0.1, 0.11) + vec3(0.4, 0.55, 0.6) * sky * 0.35 + vec3(1.0, 0.98, 0.95) * box1 * 1.4 + vec3(0.6, 0.95, 1.0) * box2 * 0.9;
}

void main() {
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(uCam - vWorld);
  vec2 suv = gl_FragCoord.xy / uRes;
  float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 H = normalize(L + V);

  float dP = length(vPlane - vCrack.xy);
  float reach = min(vCrack.w, (uTime - vCrack.z) * uSpeed);
  float on = clamp((reach - dP) / 0.02, 0.0, 1.0);
  float w = max(fwidth(vEdge), 1e-5);
  float line = (1.0 - smoothstep(0.0, w * 1.3, vEdge)) * on;
  float halo = (1.0 - smoothstep(0.0, w * 7.0, vEdge)) * on;

  // 기울기만큼 비틀어 읽되, 크게 돌아간 조각에서 화면 밖을 읽어 얼룩지지 않게 상한을 둔다
  vec2 off = n.xy * (0.45 + halo * 0.5);
  float ol = length(off);
  if (ol > 0.045) off *= 0.045 / ol;
  vec3 bg;
  bg.r = texture(uBg, suv + off * 0.97).r;
  bg.g = texture(uBg, suv + off).g;
  bg.b = texture(uBg, suv + off * 1.035).b;

  vec3 col;
  if (vKind < 0.5) {
    col = bg * vec3(0.88, 0.95, 0.93);
    vec3 e = env(R);
    col = mix(col, e, F * 0.85) + e * 0.03;
    col += vec3(0.6, 0.8, 0.85) * 0.04 * smoothstep(0.32, 0.0, abs(vPlane.x * 0.55 + vPlane.y * 0.8 - 0.35));
    vec3 iri = 0.72 + 0.28 * cos(6.2832 * (dP * 6.0 + vec3(0.0, 0.33, 0.67)));
    col = mix(col, iri, line * 0.9);
    col += halo * 0.05;
    col += pow(max(dot(n, H), 0.0), 380.0) * 3.0;
  } else {
    col = mix(vec3(0.05, 0.22, 0.19), vec3(0.45, 0.8, 0.7), F) + bg * 0.3;
    col += pow(max(dot(n, H), 0.0), 40.0) * 1.2;
  }
  o = vec4(col, 1.0);
}`

const VS_BG = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FS_BG = `#version 300 es
precision highp float;
uniform sampler2D uBg;
uniform vec2 uRes;
out vec4 o;
void main() { o = vec4(texture(uBg, gl_FragCoord.xy / uRes).rgb, 1.0); }`

function program(gl, vs, fs) {
  const p = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed')
    gl.attachShader(p, s)
    gl.deleteShader(s)
  }
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program link failed')
  const locs = new Map()
  return { p, u: (name) => (locs.has(name) ? locs.get(name) : locs.set(name, gl.getUniformLocation(p, name)).get(name)) }
}

const ID = [0, 0, 0, 1]
function axisAngle(ax, ay, az, angle) {
  const s = Math.sin(angle / 2)
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)]
}
function spinQuat(q, w, dt) {
  const [x, y, z, s] = q
  const h = dt / 2
  const nx = x + h * (w[0] * s + w[1] * z - w[2] * y)
  const ny = y + h * (w[1] * s + w[2] * x - w[0] * z)
  const nz = z + h * (w[2] * s + w[0] * y - w[1] * x)
  const ns = s - h * (w[0] * x + w[1] * y + w[2] * z)
  const l = Math.hypot(nx, ny, nz, ns)
  return [nx / l, ny / l, nz / l, ns / l]
}
function quatMat([x, y, z, w]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ]
}
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)

/* 조각 하나의 정점(조각 중심 기준)과 정적 속성 */
function geometry(s) {
  const { poly, c } = s
  const h = THICK / 2
  const lp = []
  const ln = []
  const st = []
  const push = (x, y, z, nx, ny, nz, edge, e, kind) => {
    lp.push(x - c.x, y - c.y, z)
    ln.push(nx, ny, nz)
    st.push(x, y, edge, e.px, e.py, e.t0, e.boundary ? 0 : e.len, kind)
  }
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], e = A.e
    const ex = B.x - A.x, ey = B.y - A.y, l = Math.hypot(ex, ey) || 1
    const dc = Math.abs((c.x - A.x) * ey - (c.y - A.y) * ex) / l
    push(c.x, c.y, h, 0, 0, 1, dc, e, 0); push(A.x, A.y, h, 0, 0, 1, 0, e, 0); push(B.x, B.y, h, 0, 0, 1, 0, e, 0)
    push(c.x, c.y, -h, 0, 0, -1, dc, e, 0); push(B.x, B.y, -h, 0, 0, -1, 0, e, 0); push(A.x, A.y, -h, 0, 0, -1, 0, e, 0)
    const nx = ey / l, ny = -ex / l
    push(A.x, A.y, h, nx, ny, 0, 1, e, 1); push(A.x, A.y, -h, nx, ny, 0, 1, e, 1); push(B.x, B.y, -h, nx, ny, 0, 1, e, 1)
    push(A.x, A.y, h, nx, ny, 0, 1, e, 1); push(B.x, B.y, -h, nx, ny, 0, 1, e, 1); push(B.x, B.y, h, nx, ny, 0, 1, e, 1)
  }
  s.lp = Float32Array.from(lp)
  s.ln = Float32Array.from(ln)
  s.st = Float32Array.from(st)
  s.count = lp.length / 3
}

function makeShard(poly) {
  const c = centroid(poly)
  let rad = 0
  for (const v of poly) rad = Math.max(rad, Math.hypot(v.x - c.x, v.y - c.y))
  return { poly, c, rad, area: area(poly), mode: 'fixed', start: 0, p: [c.x, c.y, 0], v: [0, 0, 0], q: ID, w: [0, 0, 0], tilt: null, tinked: false, lp: null }
}

export function createGlass(canvas, { sound, onStats, reduced = () => false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' })
  if (!gl) throw new Error('webgl2')
  const glass = program(gl, VS, FS)
  const back = program(gl, VS_BG, FS_BG)
  const vao = gl.createVertexArray()
  const blank = gl.createVertexArray()
  const dynBuf = gl.createBuffer()
  const statBuf = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf)
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12)
  gl.bindBuffer(gl.ARRAY_BUFFER, statBuf)
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 0)
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 8)
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 12)
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 32, 28)
  gl.bindVertexArray(null)
  const bgTex = gl.createTexture()
  const bgCanvas = document.createElement('canvas')

  const rand = mulberry32((Math.random() * 2 ** 31) | 0)
  let W = 1, H = 1, aspect = 1, paneAspect = 0
  let shards = []
  let dyn = new Float32Array(0)
  let vertCount = 0
  let time = 0, animUntil = 0
  let raf = 0, last = 0, paused = false
  let slow = null, slide = null, pendingShatter = null, newPaneAt = 0
  let damage = 0, round = 0, panes = 0, impactId = 0, shattered = false

  const stats = () => onStats?.({ pieces: shards.length, panes, shattered })
  const buzz = (pattern) => { try { navigator.vibrate?.(pattern) } catch { /* 진동 미지원 */ } }

  function rebuild() {
    let total = 0
    for (const s of shards) {
      if (!s.lp) geometry(s)
      total += s.count
    }
    const st = new Float32Array(total * 8)
    let o = 0
    for (const s of shards) { st.set(s.st, o); o += s.st.length }
    gl.bindBuffer(gl.ARRAY_BUFFER, statBuf)
    gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW)
    if (dyn.length !== total * 6) dyn = new Float32Array(total * 6)
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf)
    gl.bufferData(gl.ARRAY_BUFFER, dyn.byteLength, gl.DYNAMIC_DRAW)
    vertCount = total
    stats()
  }

  const slideY = () => (slide ? (1 - easeOutBack(Math.min(1, slide.t))) * 2.4 : 0)
  function restQuat(s) {
    if (!s.tilt) return ID
    const k = smooth((time - s.tilt.at) / 0.25)
    return k <= 0 ? ID : axisAngle(s.tilt.ax, s.tilt.ay, 0, s.tilt.angle * k)
  }

  function writeDyn() {
    let o = 0
    const sy = slideY()
    for (const s of shards) {
      const moving = s.mode === 'fall' && time >= s.start
      const q = moving ? s.q : restQuat(s)
      const px = moving ? s.p[0] : s.c.x
      const py = moving ? s.p[1] : s.c.y + sy
      const pz = moving ? s.p[2] : 0
      const m = quatMat(q)
      const { lp, ln, count } = s
      for (let i = 0; i < count * 3; i += 3) {
        const x = lp[i], y = lp[i + 1], z = lp[i + 2]
        dyn[o++] = m[0] * x + m[3] * y + m[6] * z + px
        dyn[o++] = m[1] * x + m[4] * y + m[7] * z + py
        dyn[o++] = m[2] * x + m[5] * y + m[8] * z + pz
        const a = ln[i], b = ln[i + 1], c = ln[i + 2]
        dyn[o++] = m[0] * a + m[3] * b + m[6] * c
        dyn[o++] = m[1] * a + m[4] * b + m[7] * c
        dyn[o++] = m[2] * a + m[5] * b + m[8] * c
      }
    }
  }

  function render() {
    gl.viewport(0, 0, W, H)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)

    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(back.p)
    gl.uniform1i(back.u('uBg'), 0)
    gl.uniform2f(back.u('uRes'), W, H)
    gl.bindVertexArray(blank)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    if (!vertCount) return
    writeDyn()
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn)
    gl.enable(gl.DEPTH_TEST)
    gl.useProgram(glass.p)
    const f = CAM_Z, near = 0.1, far = 20
    const A = (far + near) / (near - far), B = (2 * far * near) / (near - far)
    gl.uniformMatrix4fv(glass.u('uViewProj'), false, [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, A, -1, 0, 0, -CAM_Z * A + B, CAM_Z])
    gl.uniform1i(glass.u('uBg'), 0)
    gl.uniform2f(glass.u('uRes'), W, H)
    gl.uniform1f(glass.u('uTime'), time)
    gl.uniform1f(glass.u('uSpeed'), CRACK_SPEED)
    gl.uniform3f(glass.u('uCam'), 0, 0, CAM_Z)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, vertCount)
  }

  function drawBack() {
    drawBackdrop(bgCanvas, W, H, round)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  function freshPane(animated) {
    paneAspect = aspect + 0.12
    shards = [makeShard(pane(paneAspect))]
    shattered = false
    damage = 0
    pendingShatter = null
    slide = animated ? { t: 0 } : null
    rebuild()
  }

  /* 떨어지는 조각만 움직인다. 바닥 아래로 지나가는 순간 한 번 짤랑 */
  function step(dt) {
    let removed = false
    for (const s of shards) {
      if (s.mode !== 'fall' || time < s.start) continue
      s.v[1] += GRAVITY * dt
      const drag = Math.exp(-0.25 * dt)
      s.v[0] *= drag
      s.v[2] *= drag
      s.p[0] += s.v[0] * dt
      s.p[1] += s.v[1] * dt
      s.p[2] += s.v[2] * dt
      s.q = spinQuat(s.q, s.w, dt)
      if (!s.tinked && s.p[1] < -1.02) {
        s.tinked = true
        sound?.tink(Math.sqrt(s.area), s.p[0] / paneAspect)
      }
      if (s.p[1] < -1.5 - s.rad || s.p[2] > CAM_Z - 0.4) { s.gone = true; removed = true }
    }
    if (removed) {
      shards = shards.filter((s) => !s.gone)
      rebuild()
    }
  }

  const busy = () => !paused && (slide || pendingShatter || newPaneAt || slow || time < animUntil || shards.some((s) => s.mode === 'fall'))

  function frame(now) {
    raf = 0
    const real = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    let scale = 1
    if (slow) {
      const k = (now - slow) / 1000
      scale = k < 0.7 ? 0.28 : k < 1.4 ? 0.28 + ((k - 0.7) / 0.7) * 0.72 : 1
      if (k >= 1.4) slow = null
    }
    time += real * scale
    if (pendingShatter && time >= pendingShatter.at) { shatter(pendingShatter.p); pendingShatter = null }
    if (slide) {
      slide.t += real / 0.75
      if (slide.t >= 1) { slide = null; sound?.tink(0.3, 0) }
    }
    step(real * scale)
    if (shattered && !shards.length && !newPaneAt) newPaneAt = now + 450
    if (newPaneAt && now >= newPaneAt) {
      newPaneAt = 0
      round += 1
      drawBack()
      freshPane(true)
    }
    render()
    if (busy()) raf = requestAnimationFrame(frame)
    else last = 0
  }
  /* 조각이 떨어지거나 금이 자라는 동안만 프레임을 돌린다 */
  const kick = () => { if (!raf && !paused) { last = 0; raf = requestAnimationFrame(frame) } }

  function toPlane(clientX, clientY) {
    const r = canvas.getBoundingClientRect()
    return { x: (((clientX - r.left) / r.width) * 2 - 1) * aspect, y: 1 - ((clientY - r.top) / r.height) * 2 }
  }

  /* 한 번 치기. force ∈ (0, 1] — 꾹 누를수록 세다. 유리가 없는 곳이면 false */
  function hit(p, force) {
    if (slide || shattered || pendingShatter) return false
    if (!shards.some((s) => s.mode === 'fixed' && contains(s.poly, p))) return false
    const t0 = time
    const id = ++impactId
    const pat = impactPattern(p, force, rand)
    const next = []
    const fresh = []
    for (const s of shards) {
      const near = s.mode === 'fixed' && Math.hypot(s.c.x - p.x, s.c.y - p.y) < pat.R + s.rad
      const cells = near && next.length < MAX_SHARDS ? fractureShard(s.poly, pat, t0, id) : null
      if (!cells) { next.push(s); continue }
      for (const cell of cells) { const n = makeShard(cell); next.push(n); fresh.push(n) }
    }
    const holeR = force > 0.3 ? 0.03 + force * 0.09 : 0
    for (const s of fresh) {
      if (!isFree(s.poly)) continue
      const d = Math.hypot(s.c.x - p.x, s.c.y - p.y)
      const at = t0 + d / CRACK_SPEED
      const ax = rand() - 0.5, ay = rand() - 0.5, l = Math.hypot(ax, ay) || 1
      s.tilt = { at, ax: ax / l, ay: ay / l, angle: (0.006 + 0.022 * Math.max(0, 1 - d / pat.R)) * (0.5 + rand()) }
      if (d < holeR && s.area < 0.006 * (1 + force)) {
        s.mode = 'fall'
        s.start = at + 0.03
        s.p = [s.c.x, s.c.y, 0]
        s.q = axisAngle(s.tilt.ax, s.tilt.ay, 0, s.tilt.angle)
        s.v = [((s.c.x - p.x) / (d || 1)) * 0.25, ((s.c.y - p.y) / (d || 1)) * 0.25, -(0.4 + rand() * 0.8)]
        s.w = [(rand() - 0.5) * 9, (rand() - 0.5) * 9, (rand() - 0.5) * 3]
      }
    }
    shards = next
    rebuild()
    animUntil = Math.max(animUntil, t0 + pat.R / CRACK_SPEED + 0.45)
    damage += force
    sound?.crack(force, p.x / paneAspect)
    buzz(force > 0.6 ? 28 : 12)
    if (force > 0.96 || damage > 2.6) pendingShatter = { p, at: t0 + 0.14 }
    kick()
    return true
  }

  function shatter(p) {
    if (shattered) return
    shattered = true
    panes += 1
    const t0 = time
    const sy = slideY()
    let next = []
    for (const s of shards) {
      if (s.mode !== 'fixed') { next.push(s); continue }
      const pieces = Math.min(16, Math.floor(s.area / 0.026))
      if (pieces >= 2 && next.length < MAX_SHARDS) next = next.concat(shatterShard(s.poly, pieces, rand, p, t0).map(makeShard))
      else next.push(s)
    }
    for (const s of next) {
      if (s.mode !== 'fixed') continue
      for (const v of s.poly) {
        if (v.e.boundary) continue
        v.e = v.e.len > 0 ? { ...v.e, len: 99 } : { px: p.x, py: p.y, t0, len: 99, boundary: false }
      }
      s.lp = null
      const dx = s.c.x - p.x, dy = s.c.y - p.y, d = Math.hypot(dx, dy) || 1e-3
      const k = Math.exp(-d / 0.55)
      const push = 0.4 + 2.2 * k
      s.q = restQuat(s)
      s.tilt = null
      s.mode = 'fall'
      s.start = t0 + d / (CRACK_SPEED * 1.4) + rand() * 0.04
      s.p = [s.c.x, s.c.y + sy, 0]
      s.v = [(dx / d) * push * (0.6 + rand() * 0.6), (dy / d) * push * (0.6 + rand() * 0.6) + 0.5 * k, -(0.4 + rand() * 1.6) * k + (rand() - 0.3) * 0.9]
      const ax = rand() - 0.5, ay = rand() - 0.5, az = (rand() - 0.5) * 0.4, l = Math.hypot(ax, ay, az) || 1
      const spin = 2 + 9 * k + rand() * 4
      s.w = [(ax / l) * spin, (ay / l) * spin, (az / l) * spin]
    }
    shards = next
    rebuild()
    sound?.shatter(p.x / paneAspect)
    buzz([30, 40, 70])
    if (!reduced()) slow = performance.now()
    kick()
  }

  function resize(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = Math.max(2, Math.round(cssW * dpr))
    H = Math.max(2, Math.round(cssH * dpr))
    canvas.width = W
    canvas.height = H
    aspect = cssW / cssH
    drawBack()
    const intact = shards.length === 1 && shards[0].mode === 'fixed' && !shards[0].tilt
    if (!shards.length || intact || aspect > paneAspect - 0.02) freshPane(false)
    if (!raf) render()
  }

  document.fonts?.ready.then(() => { drawBack(); if (!raf) render() })

  return {
    tap(clientX, clientY, force) { return hit(toPlane(clientX, clientY), force) },
    /* 화면 비율 좌표(-1~1)로 치기 */
    strike(nx, ny, force) { return hit({ x: nx * aspect, y: ny }, force) },
    /* 화면 갱신 없이 시간을 진행시키고 한 장 그린다 — 썸네일 제작·점검용 */
    settle(seconds) {
      for (let k = 0; k < Math.round(seconds * 60); k++) {
        time += 1 / 60
        if (pendingShatter && time >= pendingShatter.at) { shatter(pendingShatter.p); pendingShatter = null }
        step(1 / 60)
      }
      render()
    },
    /* 키보드·버튼용 */
    tapRandom(force) {
      const p = { x: (rand() - 0.5) * aspect * 1.4, y: (rand() - 0.5) * 1.4 }
      return hit(p, force) || hit({ x: 0, y: 0 }, force)
    },
    smash() { return hit({ x: (rand() - 0.5) * 0.4 * aspect, y: (rand() - 0.5) * 0.4 }, 1) },
    renew() {
      if (slide) return
      newPaneAt = 0
      round += 1
      drawBack()
      freshPane(true)
      kick()
    },
    resize,
    setPaused(value) { paused = value; if (!paused) kick() },
    get state() { return { pieces: shards.length, panes, shattered, time } },
    destroy() {
      cancelAnimationFrame(raf)
      gl.deleteProgram(glass.p)
      gl.deleteProgram(back.p)
      gl.deleteBuffer(dynBuf)
      gl.deleteBuffer(statBuf)
      gl.deleteTexture(bgTex)
    },
  }
}
