import * as THREE from 'three'

/* 김 서린 거울. 화면 전체가 욕실 거울이고, 손가락으로 김을 닦으면 길이 나며 물방울이 맺혀 흘러내린다.
   - 거울에 비친 건 타일 벽과 뒤쪽 문이 있는 욕실. 거울 앞에 서 있어야 할 사람은 비치지 않는다.
   - 김(R), 물방울(G), 손자국 기름(B)을 작은 격자에 CPU로 계산해 텍스처로 올리고, 셰이더가 비친 장면을 김만큼 흐리게 섞는다.
   - 기름 묻은 자리는 김이 잘 안 서린다(진짜 현상). 그래서 김이 다시 서릴 때, 저쪽에서 손가락으로 쓴 글씨가 거울상으로 떠오른다.
   - 많이 쓰면(닦으면) 저쪽에서 대답을 쓴다. 문은 방문할 때마다 조금 더 열려 있다. */

const MEMORY = 'dl-mirror'
const rand = (a, b) => a + Math.random() * (b - a)
const FIRST_WORDS = ['안녕', '여기', '보여요?', '또 왔네', '쉿']
const REPLIES = ['뭐라고 썼어요?', '나도 보여요', '거기 추워요?', '천천히 닦아요', '뒤에 누구예요?']

function readMemory() {
  try { return { visits: 0, ...JSON.parse(localStorage.getItem(MEMORY) || '{}') } } catch { return { visits: 0 } }
}

/* 욕실 타일: 10cm 정사각 타일, 옅은 줄눈, 타일마다 아주 조금 다른 밝기 */
function tileTexture(size = 256, n = 8) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = '#a9a9a6'; g.fillRect(0, 0, size, size)
  const t = size / n
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 226 + Math.floor(rand(-6, 6))
    g.fillStyle = `rgb(${v},${v},${v - 2})`
    g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

const COMP_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const COMP_FRAG = `
varying vec2 vUv;
uniform sampler2D uRefl, uFog;
uniform vec2 uTexel, uRes;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 fu = vec2(vUv.x, 1.0 - vUv.y); // 김 격자는 위에서부터 줄을 센다
  vec4 F = texture(uFog, fu);
  float fog = F.r, water = F.g, grease = F.b;
  // 물방울은 작은 렌즈: 두께 기울기(오른쪽·아래로 +)만큼 비친 장면을 굴절시키고, 왼쪽 위에 하이라이트
  float wx = texture(uFog, fu + vec2(uTexel.x, 0.0)).g - texture(uFog, fu - vec2(uTexel.x, 0.0)).g;
  float wy = texture(uFog, fu + vec2(0.0, uTexel.y)).g - texture(uFog, fu - vec2(0.0, uTexel.y)).g;
  vec2 bend = vec2(wx, -wy) * 0.06;
  float f = smoothstep(0.02, 0.98, fog) * (1.0 - smoothstep(0.05, 0.5, water)); // 물방울 속은 김 없이 투명
  vec3 refl = textureLod(uRefl, vUv - bend, f * 5.5).rgb;
  // 김: 잘게 맺힌 물알갱이가 빛을 흩어 뿌옇다
  vec2 cell = floor(vUv * uRes / 2.0);
  float speck = hash(cell) * 0.08 + hash(cell + 13.1) * 0.04;
  vec3 haze = vec3(0.80, 0.81, 0.82) + speck + refl * 0.22;
  vec3 col = mix(refl, haze, f * 0.9);
  // 기름 자국으로 비친 글씨는 아주 옅게 차갑다(저쪽에서 쓴 것)
  col = mix(col, col * vec3(0.88, 0.92, 1.12), grease * (1.0 - f) * 0.35);
  float light = clamp(wx * 0.6 + wy * 0.8, 0.0, 1.0);
  col += vec3(1.0) * pow(light, 1.6) * 1.1;
  float rim = water * (1.0 - water) * 4.0;
  col -= vec3(0.13) * rim * (1.0 - light);
  // 거울 가장자리는 살짝 어둡고 흐리다
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.35;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function createMirror(canvas, { sfx, onStats }) {
  const small = window.matchMedia('(max-width: 760px)').matches
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('webgl')
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // ---- 거울에 비친 욕실 ----
  const room = new THREE.Scene()
  room.background = new THREE.Color('#1a1a1b')
  room.fog = new THREE.Fog('#c9c9c7', 2.2, 7)
  const eye = new THREE.PerspectiveCamera(48, 1, 0.05, 30)
  const tiles = tileTexture()
  const wallMat = (rx, ry) => { const m = tiles.clone(); m.needsUpdate = true; m.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: m, roughness: 0.32, metalness: 0.02 }) }
  const W = 2.6, Hh = 2.5, D = 3.2
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), wallMat(W / 0.8, Hh / 0.8)); back.position.set(0, Hh / 2, -D); room.add(back)
  const left = new THREE.Mesh(new THREE.PlaneGeometry(D, Hh), wallMat(D / 0.8, Hh / 0.8)); left.rotation.y = Math.PI / 2; left.position.set(-W / 2, Hh / 2, -D / 2); room.add(left)
  const right = new THREE.Mesh(new THREE.PlaneGeometry(D, Hh), wallMat(D / 0.8, Hh / 0.8)); right.rotation.y = -Math.PI / 2; right.position.set(W / 2, Hh / 2, -D / 2); room.add(right)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#77777a', roughness: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -D / 2); room.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#d8d8d5', roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, Hh, -D / 2); room.add(ceil)
  // 뒤쪽 문: 문틀, 그 너머 어둠, 경첩에 달린 문짝
  const doorW = 0.82, doorH = 2.02, doorX = 0.5
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), new THREE.MeshBasicMaterial({ color: '#030303' })); dark.position.set(doorX, doorH / 2, -D + 0.003); room.add(dark)
  const frameMat = new THREE.MeshStandardMaterial({ color: '#e6e6e3', roughness: 0.6 })
  for (const [x, y, w, h] of [[doorX - doorW / 2 - 0.035, doorH / 2, 0.07, doorH + 0.07], [doorX + doorW / 2 + 0.035, doorH / 2, 0.07, doorH + 0.07], [doorX, doorH + 0.035, doorW + 0.14, 0.07]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat); b.position.set(x, y, -D + 0.025); room.add(b)
  }
  const hinge = new THREE.Group(); hinge.position.set(doorX - doorW / 2, 0, -D + 0.02); room.add(hinge)
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.04), new THREE.MeshStandardMaterial({ color: '#dcdcd8', roughness: 0.55 }))
  leaf.position.set(doorW / 2, doorH / 2, 0); hinge.add(leaf)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: '#9a9a9e', metalness: 0.8, roughness: 0.25 }))
  knob.position.set(doorW - 0.08, 1.0, 0.04); leaf.add(knob)
  // 왼쪽 벽 수건걸이와 수건
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#a9a9ad', metalness: 0.8, roughness: 0.3 }))
  bar.rotation.x = Math.PI / 2; bar.position.set(-W / 2 + 0.06, 1.25, -1.9); room.add(bar)
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.42), new THREE.MeshStandardMaterial({ color: '#c8c8c4', roughness: 1 }))
  towel.position.set(-W / 2 + 0.07, 0.95, -1.9); room.add(towel)
  // 천장 등
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: '#fffaf0' })); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, Hh - 0.005, -1.3); room.add(lamp)
  const bulb = new THREE.PointLight('#fff4e6', 6, 9, 1.6); bulb.position.set(0, Hh - 0.2, -1.3); room.add(bulb)
  room.add(new THREE.AmbientLight('#ffffff', 0.35))

  const memory = readMemory()
  memory.visits += 1
  try { localStorage.setItem(MEMORY, JSON.stringify(memory)) } catch { /* 저장 불가 */ }
  const doorTarget = THREE.MathUtils.degToRad(Math.min(memory.visits - 1, 7) * 6) // 올 때마다 6°씩
  hinge.rotation.y = doorTarget

  let reflTarget = new THREE.WebGLRenderTarget(4, 4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace })

  // ---- 김·물방울·기름 격자 ----
  let GW = 1, GH = 1, fog, water, grease, grow, data, fogTex
  const comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: COMP_VERT, fragmentShader: COMP_FRAG, depthTest: false,
    uniforms: { uRefl: { value: reflTarget.texture }, uFog: { value: null }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() } },
  }))
  const compScene = new THREE.Scene(); compScene.add(comp)
  const compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  let wW = 1, wH = 1
  const drops = []
  let wipes = 0, wiped = 0, fallen = 0, replied = false, lastStroke = null
  let boost = 0, time = 0, raf = 0, last = 0, paused = false, frame = 0
  const lean = new THREE.Vector2(), leanTo = new THREE.Vector2()

  function writeGrease(text, cx, cy, height) {
    // 저쪽에서 쓴 글씨라 좌우가 뒤집힌 손글씨(굵은 손가락 획)로 그린다
    const c = document.createElement('canvas'); c.width = GW; c.height = GH
    const g = c.getContext('2d')
    g.translate(cx * GW, cy * GH); g.scale(-1, 1); g.rotate(rand(-0.06, 0.06))
    g.font = `600 ${Math.round(height * GH)}px "Pretendard Variable", Pretendard, sans-serif`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineJoin = 'round'; g.lineCap = 'round'
    g.filter = 'blur(0.7px)'
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, height * GH * 0.085)
    g.strokeText(text, 0, 0)
    const px = g.getImageData(0, 0, GW, GH).data
    for (let i = 0; i < GW * GH; i++) grease[i] = Math.max(grease[i], px[i * 4 + 3] / 255)
  }

  function setupGrid(aspect) {
    GW = small ? 260 : 420
    GH = Math.max(40, Math.round(GW / aspect))
    const n = GW * GH
    fog = new Float32Array(n).fill(1)
    water = new Float32Array(n)
    grease = new Float32Array(n)
    grow = new Float32Array(n)
    // 김 서리는 빠르기: 큰 얼룩(낮은 해상도 무작위를 부드럽게 키움) + 아주 옅은 알갱이
    const cx = Math.ceil(GW / 14) + 1, cy = Math.ceil(GH / 14) + 1
    const coarse = Float32Array.from({ length: cx * cy }, () => Math.random())
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const u = i / 14, v = j / 14, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0
      const s = (a, b) => coarse[Math.min(cy - 1, b) * cx + Math.min(cx - 1, a)]
      const sm = (x) => x * x * (3 - 2 * x)
      const val = (s(i0, j0) * (1 - sm(fu)) + s(i0 + 1, j0) * sm(fu)) * (1 - sm(fv)) + (s(i0, j0 + 1) * (1 - sm(fu)) + s(i0 + 1, j0 + 1) * sm(fu)) * sm(fv)
      grow[j * GW + i] = 0.45 + val * 1.1 + Math.random() * 0.08
    }
    data = new Uint8Array(n * 4)
    fogTex?.dispose()
    fogTex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat, THREE.UnsignedByteType)
    fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter
    fogTex.flipY = false
    comp.material.uniforms.uFog.value = fogTex
    comp.material.uniforms.uTexel.value.set(1 / GW, 1 / GH)
    drops.length = 0
    writeGrease(FIRST_WORDS[(memory.visits - 1) % FIRST_WORDS.length], rand(0.35, 0.65), rand(0.28, 0.42), 0.12)
  }

  function brush(x0, y0, x1, y1, radius) {
    // 화면 좌표(0..1)의 선분을 따라 둥근 손가락으로 김을 걷어낸다
    const steps = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * GW, (y1 - y0) * GH) / 1.5))
    const r = radius * GW, r2 = r * r
    for (let s = 0; s <= steps; s++) {
      const cx = (x0 + (x1 - x0) * (s / steps)) * GW, cy = (y0 + (y1 - y0) * (s / steps)) * GH
      const i0 = Math.max(0, Math.floor(cx - r)), i1 = Math.min(GW - 1, Math.ceil(cx + r))
      const j0 = Math.max(0, Math.floor(cy - r)), j1 = Math.min(GH - 1, Math.ceil(cy + r))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d2 = (i - cx) ** 2 + (j - cy) ** 2
        if (d2 > r2) continue
        const w = 1 - d2 / r2
        const k = j * GW + i
        fog[k] *= 1 - Math.min(1, w * 1.6) * 0.92
      }
      // 닦은 자리 아래 가장자리에 물이 모여 방울이 맺힌다
      if (Math.random() < 0.05 && drops.length < 220) {
        const a = rand(0.12 * Math.PI, 0.88 * Math.PI)
        drops.push({ x: cx + Math.cos(a) * r * 0.97, y: cy + Math.sin(a) * r * 0.97, r: rand(0.7, 1.7) * (GW / 300), vy: 0, vx: 0, sliding: false })
      }
    }
  }

  function stepDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      const heavy = 2.6 * (GW / 300)
      if (d.r > heavy) d.sliding = true
      if (d.sliding) {
        d.vy = Math.min(d.vy + dt * 30, 6 + d.r * 5)
        d.vx += (Math.random() - 0.5) * dt * 30 // 유리 위 작은 얼룩에 걸리며 비틀비틀
        d.vx *= Math.exp(-dt * 4)
        const dy = d.vy * dt
        d.y += dy
        d.x += d.vx * dt
        d.r = Math.max(heavy * 0.55, d.r - dy * 0.01) // 흐르며 물을 조금씩 남긴다
        // 지나간 자리는 좁은 투명한 물줄기(가운데일수록 맑게)
        const half = Math.max(0.8, d.r * 0.45)
        for (let j = Math.floor(d.y - dy); j <= Math.floor(d.y); j++) for (let ii = Math.floor(-half - 1); ii <= Math.ceil(half + 1); ii++) {
          const x = Math.floor(d.x) + ii
          if (x < 0 || x >= GW || j < 0 || j >= GH) continue
          const w = Math.max(0, 1 - Math.abs(x + 0.5 - d.x) / (half + 0.8))
          const k = j * GW + x
          fog[k] = Math.min(fog[k], fog[k] * (1 - w) + 0.1 * w)
        }
        if (d.r < heavy * 0.6 && Math.random() < dt * 0.8) { d.sliding = false; d.vy = 0 }
      }
      // 부딪힌 방울끼리 합친다
      for (let k = i - 1; k >= 0; k--) {
        const o = drops[k]
        if (Math.abs(o.x - d.x) < d.r + o.r && Math.abs(o.y - d.y) < d.r + o.r && Math.hypot(o.x - d.x, o.y - d.y) < (d.r + o.r) * 0.8) {
          d.r = Math.hypot(d.r, o.r); drops.splice(k, 1); i--
          break
        }
      }
      if (d.y > GH + 2) {
        drops.splice(drops.indexOf(d), 1)
        fallen += 1
        if (Math.random() < 0.5) sfx.play('mirror-drip', { gain: rand(0.12, 0.3), rate: rand(0.9, 1.25), pan: (d.x / GW - 0.5) * 0.8, send: 0.4 })
      }
    }
    // 물방울 두께를 격자에 그린다
    water.fill(0)
    for (const d of drops) {
      const r = d.r * 1.25, r2 = r * r
      for (let j = Math.floor(d.y - r); j <= Math.ceil(d.y + r); j++) for (let i = Math.floor(d.x - r); i <= Math.ceil(d.x + r); i++) {
        if (i < 0 || i >= GW || j < 0 || j >= GH) continue
        const q = 1 - ((i - d.x) ** 2 + (j - d.y) ** 2) / r2
        if (q > 0) water[j * GW + i] = Math.max(water[j * GW + i], Math.sqrt(q))
      }
    }
  }

  function step(dt) {
    time += dt
    // 김이 다시 서린다. 기름 묻은 자리는 거의 안 서린다
    const k = (0.04 + boost * 0.5) * dt
    for (let i = 0; i < fog.length; i++) fog[i] += (1 - fog[i]) * k * grow[i] * (1 - grease[i] * 0.9)
    boost = Math.max(0, boost - dt * 0.35)
    stepDrops(dt)
    // 가끔 맺힌 작은 방울이 무거워져 흐르기 시작한다
    if (drops.length && Math.random() < dt * 0.35) { const d = drops[Math.floor(Math.random() * drops.length)]; d.r += 0.3 * (GW / 300) }
    for (let i = 0; i < fog.length; i++) {
      const o = i * 4
      data[o] = fog[i] * 255; data[o + 1] = water[i] * 255; data[o + 2] = grease[i] * 255; data[o + 3] = 255
    }
    fogTex.needsUpdate = true
    lean.lerp(leanTo, 1 - Math.exp(-dt * 3))
    if (++frame % 12 === 0) {
      let s = 0
      for (let i = 0; i < fog.length; i += 7) s += fog[i]
      wiped = Math.round((1 - s / Math.ceil(fog.length / 7)) * 100)
      report()
    }
  }

  function report() { onStats?.({ wiped: Math.max(0, wiped), drops: fallen, visits: memory.visits, replied }) }

  function render() {
    eye.position.set(-lean.x * 0.18, 1.62 - lean.y * 0.08, 0)
    eye.lookAt(-lean.x * 0.05, 1.35, -D)
    renderer.setRenderTarget(reflTarget)
    renderer.render(room, eye)
    renderer.setRenderTarget(null)
    renderer.render(compScene, compCam)
  }

  function busy() {
    if (stroke || boost > 0 || drops.some((d) => d.sliding) || lean.distanceTo(leanTo) > 0.002) return true
    for (let i = 0; i < fog.length; i += 13) if (fog[i] < 0.985 - grease[i] * 0.9) return true
    return false
  }

  function tick(now) {
    raf = 0
    if (paused) return
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60
    last = now
    step(dt)
    render()
    if (busy()) raf = requestAnimationFrame(tick)
    else last = 0
  }
  function wake() { if (!raf && !paused) raf = requestAnimationFrame(tick) }

  // ---- 손 ----
  let stroke = null
  let lastGrain = 0
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: performance.now() } }
  const onDown = (e) => {
    if (e.button > 0) return
    sfx.unlock(); sfx.reverb(1.1, 3.2, 0.7)
    try { canvas.setPointerCapture(e.pointerId) } catch { /* 캡처 불가 */ }
    const p = local(e)
    stroke = { id: e.pointerId, p, len: 0 }
    brush(p.x, p.y, p.x, p.y, small ? 0.06 : 0.042)
    wake()
  }
  const onMove = (e) => {
    if (e.pointerType === 'mouse') {
      const p = local(e)
      leanTo.set(p.x * 2 - 1, p.y * 2 - 1)
      wake()
    }
    if (!stroke || stroke.id !== e.pointerId) return
    const p = local(e), q = stroke.p
    const dist = Math.hypot((p.x - q.x) * wW, (p.y - q.y) * wH)
    brush(q.x, q.y, p.x, p.y, small ? 0.06 : 0.042)
    stroke.len += dist
    // 뽀득: 빠르게 문지를수록 크고 높게, 짧은 조각을 이어 붙인다
    const speed = dist / Math.max(0.008, (p.t - q.t) / 1000)
    const now = performance.now()
    if (speed > 60 && now - lastGrain > 110) {
      const seg = GRAINS[Math.floor(Math.random() * GRAINS.length)]
      sfx.play('mirror-rub', { offset: seg[0], duration: Math.min(0.24, seg[1] - seg[0]), gain: Math.min(0.85, 0.15 + speed / 1400), rate: rand(0.94, 1.08) + Math.min(0.15, speed / 9000), pan: (p.x - 0.5) * 0.7, send: 0.25, fade: 0.02 })
      lastGrain = now
    }
    stroke.p = p
    lastStroke = p
    wake()
  }
  const onUp = (e) => {
    if (!stroke || stroke.id !== e.pointerId) return
    if (stroke.len > 40) wipes += 1
    stroke = null
    // 많이 쓰면 저쪽에서 대답한다(한 번만). 닦은 자리에 쓰니, 김이 다시 서릴 때 보인다
    if (!replied && wipes >= 7 && wiped >= 18 && lastStroke) {
      replied = true
      writeGrease(REPLIES[Math.floor(Math.random() * REPLIES.length)], Math.min(0.75, Math.max(0.25, lastStroke.x)), Math.min(0.7, Math.max(0.25, lastStroke.y)), 0.075)
      report()
    }
    wake()
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  const onLeave = () => { leanTo.set(0, 0); wake() }
  canvas.addEventListener('pointerleave', onLeave)

  function resize(w, h) {
    wW = w; wH = h
    renderer.setSize(w, h, false)
    eye.aspect = w / h
    eye.updateProjectionMatrix()
    const dpr = renderer.getPixelRatio()
    reflTarget.setSize(Math.max(2, Math.round(w * dpr * 0.6)), Math.max(2, Math.round(h * dpr * 0.6)))
    comp.material.uniforms.uRes.value.set(w, h)
    setupGrid(w / h)
    step(0)
    render()
  }

  return {
    resize,
    steam() { boost = 1; wake() },
    setPaused(value) { paused = value; if (!value) wake() },
    dispose() {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      room.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose() }) })
      comp.geometry.dispose(); comp.material.dispose(); fogTex?.dispose(); reflTarget.dispose(); tiles.dispose()
      renderer.dispose()
    },
  }
}

// 뽀득 소리 파일(mirror-rub)에서 소리가 큰 조각들(초). 효과음을 다듬을 때 에너지로 뽑은 구간
const GRAINS = [[0.36, 0.56], [2.24, 2.6], [2.8, 3.0], [3.44, 3.56], [3.88, 4.04]]
