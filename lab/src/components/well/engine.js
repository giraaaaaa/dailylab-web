import * as THREE from 'three'

/* 우물. 위에서 깊은 돌 우물을 내려다본다. 돌을 집어 놓으면 떨어지고, 한참 뒤 아래에서 물소리가 난다.
   - 시간은 진짜 물리: 떨어지는 시간 √(2h/g) + 소리가 올라오는 시간 h/343. 깊이 h는 방문마다 다르다.
   - 화면 속 우물은 7m로 줄여 그리고, 진짜 깊이에 맞춰 떨어지는 속도만 맞춘다(가속하며 작아지는 모습은 그대로).
   - 열네 번째 돌은 물소리가 나지 않는다. 대신 한참 뒤 파란 돌 하나가 올라와 우물 가장자리에 놓인다. */

const R = 1 // 우물 안쪽 반지름(m)
const SHAFT = 7 // 화면에 그리는 우물 깊이(m)
const G = 9.81
const SOUND = 343
const RETURN_AFTER = 13
const MEMORY = 'dl-well'

const rand = (a, b) => a + Math.random() * (b - a)

function readMemory() {
  try { return { returned: 0, visits: 0, ...JSON.parse(localStorage.getItem(MEMORY) || '{}') } } catch { return { returned: 0, visits: 0 } }
}
function writeMemory(m) {
  try { localStorage.setItem(MEMORY, JSON.stringify(m)) } catch { /* 저장 불가 */ }
}

/* 돌벽 무늬: 보로노이로 크기·모양이 제각각인 자연석을 쌓고, 사이에 어두운 줄눈. 이어 붙여도 이음매가 없게 둘레를 감싼다.
   같은 거리장으로 높이(돌 가운데가 볼록)를 만들어 법선 지도까지 굽는다 */
function stoneMaps(size, { cellsX, cellsY, stretch = 1, base = 96, spread = 26, mortar = 0.055 }) {
  const pts = []
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      pts.push({ x: (i + 0.15 + Math.random() * 0.7) / cellsX, y: (j + 0.15 + Math.random() * 0.7) / cellsY, tone: base + (Math.random() - 0.5) * spread * 2, rough: Math.random() })
    }
  }
  const color = document.createElement('canvas'), nrm = document.createElement('canvas')
  color.width = color.height = nrm.width = nrm.height = size
  const cimg = color.getContext('2d').createImageData(size, size)
  const height = new Float32Array(size * size)
  const cw = 1 / cellsX, ch = 1 / cellsY
  for (let py = 0; py < size; py++) {
    const v = py / size
    for (let px = 0; px < size; px++) {
      const u = px / size
      const ci = Math.floor(u * cellsX), cj = Math.floor(v * cellsY)
      let d1 = 9, d2 = 9, best = null
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + cellsX) % cellsX, jj = (cj + dj + cellsY) % cellsY
          const p = pts[jj * cellsX + ii]
          let dx = p.x - u, dy = p.y - v
          dx -= Math.round(dx); dy -= Math.round(dy) // 감싸기
          const d = Math.hypot(dx / cw / stretch, dy / ch)
          if (d < d1) { d2 = d1; d1 = d; best = p } else if (d < d2) d2 = d
        }
      }
      const edge = d2 - d1 // 경계에서 0
      const h = Math.min(1, Math.max(0, (edge - mortar) / 0.35))
      const bump = Math.sqrt(h) * (0.85 + best.rough * 0.15)
      height[py * size + px] = bump
      const grain = (Math.random() - 0.5) * 16
      const shade = edge < mortar ? 26 + Math.random() * 8 : best.tone * (0.78 + 0.22 * bump) + grain
      const o = (py * size + px) * 4
      cimg.data[o] = shade; cimg.data[o + 1] = shade; cimg.data[o + 2] = shade + 2; cimg.data[o + 3] = 255
    }
  }
  color.getContext('2d').putImageData(cimg, 0, 0)
  const nimg = nrm.getContext('2d').createImageData(size, size)
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3.2, dy = (at(x, y + 1) - at(x, y - 1)) * 3.2
      const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4
      nimg.data[o] = (-dx / l * 0.5 + 0.5) * 255; nimg.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; nimg.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; nimg.data[o + 3] = 255
    }
  }
  nrm.getContext('2d').putImageData(nimg, 0, 0)
  const map = new THREE.CanvasTexture(color), normalMap = new THREE.CanvasTexture(nrm)
  map.colorSpace = THREE.SRGBColorSpace
  for (const tex of [map, normalMap]) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4 }
  return { map, normalMap }
}

const WATER_VERT = `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const WATER_FRAG = `
uniform float uTime, uR, uGlint;
uniform vec4 uDrops[8];
varying vec2 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 p = vP / uR;
  float r = length(p);
  vec2 disp = vec2(0.0);
  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 d = uDrops[i];
    float age = uTime - d.z;
    if (d.w <= 0.0 || age < 0.0 || age > 7.0) continue;
    vec2 q = p - d.xy / uR;
    float dist = length(q) + 1e-4;
    float front = age * 0.42;
    float x = dist - front;
    float env = exp(-x * x * 55.0) * exp(-age * 0.75) * d.w;
    float h = sin(x * 48.0) * env;
    disp += (q / dist) * h * 0.035;
    ring += abs(h);
  }
  vec2 uv = p + disp;
  // 물에 비친 하늘: 우물 입구 원, 달 하나, 별 조금
  vec3 sky = vec3(0.008, 0.009, 0.012);
  vec2 m = vec2(0.32, -0.22);
  float md = length(uv - m);
  sky += vec3(0.95, 0.96, 1.0) * smoothstep(0.085, 0.07, md) * 0.9;
  sky += vec3(0.62, 0.64, 0.7) * exp(-md * 14.0) * 0.12;
  vec2 cell = floor(uv * 34.0);
  float s = hash(cell);
  vec2 sp = fract(uv * 34.0) - 0.5;
  sky += vec3(0.8) * step(0.987, s) * smoothstep(0.12, 0.0, length(sp)) * (0.4 + 0.6 * hash(cell + 7.0));
  // 비친 우물 입구 테두리 바깥은 어두운 벽
  vec3 col = sky * smoothstep(0.98, 0.62, r);
  col += vec3(0.75, 0.78, 0.85) * ring * 0.12 * smoothstep(1.0, 0.4, r);
  col += vec3(0.6, 0.7, 1.0) * uGlint * 0.12 * smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function createWell(canvas, { sfx, onStats }) {
  const small = window.matchMedia('(max-width: 760px)').matches
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('webgl')
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#050506')
  scene.fog = new THREE.Fog('#050506', 2.4, 8.2)
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40)
  camera.up.set(0, 0, -1)
  const eye = new THREE.Vector3(0, 1.9, 0)

  scene.add(new THREE.HemisphereLight('#c4c6cc', '#050506', 0.42))
  const moon = new THREE.DirectionalLight('#eceef2', 2.6)
  moon.position.set(0.7, 3, 0.35)
  scene.add(moon)

  // 우물 안 벽: 옆으로 긴 자연석(둘레 한 바퀴에 돌 14개쯤, 높이 7m에 28줄쯤 → 돌 하나 약 45 × 25cm)
  const shaft = stoneMaps(small ? 384 : 512, { cellsX: 7, cellsY: 7, base: 88, spread: 22 })
  shaft.map.repeat.set(2, 4); shaft.normalMap.repeat.set(2, 4)
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, SHAFT, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: shaft.map, normalMap: shaft.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.94, side: THREE.BackSide }),
  )
  wall.position.y = -SHAFT / 2
  scene.add(wall)

  // 우물 가장자리: 둥근 납작돌을 둘러 깐 고리 + 안쪽 모서리 턱
  const top = stoneMaps(small ? 384 : 512, { cellsX: 7, cellsY: 7, base: 70, spread: 18, mortar: 0.07 })
  top.map.repeat.set(1.6, 1.6); top.normalMap.repeat.set(1.6, 1.6)
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(R, R + 1.4, 96, 3),
    new THREE.MeshStandardMaterial({ map: top.map, normalMap: top.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.95, color: '#a4a4a8' }),
  )
  rim.rotation.x = -Math.PI / 2
  scene.add(rim)
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.045, 10, 96), new THREE.MeshStandardMaterial({ color: '#3c3c41', roughness: 0.9 }))
  lip.rotation.x = Math.PI / 2
  lip.position.y = -0.01
  scene.add(lip)

  const drops = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0))
  let dropIndex = 0
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.998, 96),
    new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: false,
      uniforms: { uTime: { value: 0 }, uR: { value: R }, uDrops: { value: drops }, uGlint: { value: 0 } } }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = -SHAFT
  scene.add(water)

  const pebbleGeo = new THREE.IcosahedronGeometry(0.05, 0)
  const pebbleMat = new THREE.MeshStandardMaterial({ color: '#8f8f95', roughness: 0.8, flatShading: true })
  const blueMat = new THREE.MeshStandardMaterial({ color: '#2a4bff', roughness: 0.45, flatShading: true })

  // 이 방문의 우물. 깊이는 방문마다 다르고, 열 번에 한 번쯤은 물이 없다
  const memory = readMemory()
  memory.visits += 1
  writeMemory(memory)
  const depth = Math.round(rand(16, 58))
  const dry = Math.random() < 0.09
  const stats = { thrown: 0, depth, heard: null, silent: false, returned: memory.returned }

  // 지난 방문들에 돌아온 파란 돌들은 가장자리에 그대로 있다
  const keepers = []
  const placeBlue = (i) => {
    const a = Math.PI * 0.62 + i * 0.3
    const m = new THREE.Mesh(pebbleGeo, blueMat)
    m.position.set(Math.cos(a) * (R + 0.09), 0.04, -Math.sin(a) * (R + 0.09))
    m.scale.setScalar(1.25)
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6))
    scene.add(m)
    keepers.push(m)
    return m
  }
  for (let i = 0; i < Math.min(memory.returned, 6); i++) placeBlue(i)

  const pebbles = []
  let held = null
  let returning = null
  let silentUntil = 0
  let time = 0
  let paused = false
  let raf = 0
  let last = 0
  const lean = new THREE.Vector2(), leanTo = new THREE.Vector2() // 마우스 쪽으로 몸을 살짝 기울여 들여다보기

  function report() { onStats?.({ ...stats }) }
  report()

  function pointOnRim(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const t = (0.18 - ray.ray.origin.y) / ray.ray.direction.y
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t)
    const r = Math.hypot(p.x, p.z), max = R * 0.86
    if (r > max) { p.x *= max / r; p.z *= max / r }
    return p
  }

  function release(x, z, vx, vz) {
    sfx.unlock()
    sfx.reverb(3.4, 2.4, 0.3) // 우물 울림(처음 한 번만 만든다)
    stats.thrown += 1
    const n = stats.thrown
    const mesh = new THREE.Mesh(pebbleGeo, pebbleMat)
    mesh.scale.setScalar(rand(0.8, 1.25))
    mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6))
    scene.add(mesh)
    const fall = Math.sqrt((2 * depth) / G)
    const p = { mesh, x, z, vx, vz, t: 0, fall, spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), lastHit: -1, swallowed: n === RETURN_AFTER + 1 && !returning }
    pebbles.push(p)
    report()
    wake()
  }

  function splash(p) {
    const at = depth / SOUND
    const far = Math.min(1, depth / 60)
    if (dry || p.swallowed) {
      if (p.swallowed) beginReturn()
      stats.silent = true // 이미 잰 깊이는 그대로 둔다
      report()
      return
    }
    drops[dropIndex].set(p.x, -p.z, time, 1)
    dropIndex = (dropIndex + 1) % drops.length
    water.material.uniforms.uGlint.value = 1
    sfx.play('well-splash', { gain: 0.95 - far * 0.45, rate: rand(0.92, 1.08) - far * 0.06, pan: p.x * 0.35, send: 0.35 + far * 0.5, at })
    if (Math.random() < 0.04) sfx.play('well-splash', { gain: 0.25, rate: rand(0.8, 0.9), send: 0.9, at: at + rand(0.8, 1.3) }) // 가끔 두 번
    stats.heard = Math.round((p.fall + at) * 10) / 10
    stats.silent = false
    report()
  }

  // 아무도 던지지 않은 돌이 올라온다
  function beginReturn() {
    silentUntil = time + rand(5.5, 7.5)
    const mesh = new THREE.Mesh(pebbleGeo, blueMat)
    mesh.visible = false
    mesh.scale.setScalar(1.25)
    scene.add(mesh)
    const slot = Math.min(memory.returned, 5)
    const a = Math.PI * 0.62 + slot * 0.3
    returning = { mesh, start: silentUntil, dur: 3.2, to: new THREE.Vector3(Math.cos(a) * (R + 0.09), 0.04, -Math.sin(a) * (R + 0.09)), ticks: 0 }
  }

  function step(dt) {
    time += dt
    water.material.uniforms.uTime.value = time
    water.material.uniforms.uGlint.value *= Math.exp(-dt * 2.5)
    for (let i = pebbles.length - 1; i >= 0; i--) {
      const p = pebbles[i]
      p.t += dt
      // 옆으로 움직이다 벽에 닿으면 튕긴다(진짜 깊이에 맞춰 느리게)
      const lateral = SHAFT / depth
      p.x += p.vx * dt * lateral
      p.z += p.vz * dt * lateral
      p.vx *= Math.exp(-dt * 0.4); p.vz *= Math.exp(-dt * 0.4)
      const r = Math.hypot(p.x, p.z), lim = R - 0.06
      if (r > lim) {
        const nx = p.x / r, nz = p.z / r, vn = p.vx * nx + p.vz * nz
        p.x = nx * lim; p.z = nz * lim
        if (vn > 0) {
          p.vx -= 1.55 * vn * nx; p.vz -= 1.55 * vn * nz
          if (p.t - p.lastHit > 0.08) {
            const deep = Math.min(1, (0.5 * G * p.t * p.t) / depth)
            sfx.play('well-clack', { gain: Math.min(0.8, 0.15 + vn * 0.6) * (1 - deep * 0.75), rate: rand(0.9, 1.2), pan: nx * 0.6, send: 0.3 + deep * 0.6 })
            p.lastHit = p.t
          }
        }
      }
      const s = Math.min(1, (0.5 * G * p.t * p.t) / depth) // 진짜 깊이 중 얼마나 떨어졌나
      p.mesh.position.set(p.x, 0.18 - s * (SHAFT + 0.2), p.z)
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt
      if (p.t >= p.fall) {
        scene.remove(p.mesh)
        pebbles.splice(i, 1)
        splash(p)
      }
    }

    if (returning && time >= returning.start) {
      const q = Math.min(1, (time - returning.start) / returning.dur)
      const m = returning.mesh
      m.visible = true
      const ease = 1 - Math.pow(1 - q, 3)
      const from = new THREE.Vector3(0, -SHAFT, 0)
      m.position.lerpVectors(from, returning.to, ease)
      m.position.y += Math.sin(q * Math.PI) * 0.35
      m.rotation.x += dt * 2.2; m.rotation.z += dt * 1.4
      // 올라오며 벽을 긁는 소리, 점점 가까이
      const tick = Math.floor(q * 6)
      if (tick > returning.ticks && q < 0.9) {
        returning.ticks = tick
        sfx.play('well-clack', { gain: 0.08 + q * 0.4, rate: rand(0.75, 0.95), pan: rand(-0.3, 0.3), send: 0.8 - q * 0.5 })
      }
      if (q >= 1) {
        sfx.play('well-place', { gain: 0.9, rate: 0.96, pan: returning.to.x * 0.4, send: 0.15 })
        keepers.push(m)
        memory.returned += 1
        writeMemory(memory)
        stats.returned = memory.returned
        stats.silent = false
        returning = null
        report()
      }
    }

    // 손에 든 돌은 살짝 흔들린다
    if (held) held.mesh.position.y = 0.2 + Math.sin(time * 3) * 0.004
    lean.lerp(leanTo, 1 - Math.exp(-dt * 4))
  }

  function render() {
    camera.position.set(eye.x + lean.x * 0.16, eye.y, eye.z + lean.y * 0.16)
    camera.lookAt(lean.x * 0.05, -10, lean.y * 0.05)
    renderer.render(scene, camera)
  }

  function busy() {
    return !!(pebbles.length || held || returning || time < silentUntil || lean.distanceTo(leanTo) > 0.002 || drops.some((d) => d.w > 0 && time - d.z < 7))
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

  // 손: 누르면 돌을 집고, 끌면 따라오고, 놓으면 떨어진다(튕기듯 놓으면 옆으로 던진다)
  let trail = []
  const onDown = (e) => {
    if (e.button > 0 || held) return
    sfx.unlock()
    try { canvas.setPointerCapture(e.pointerId) } catch { /* 캡처 불가 */ }
    const p = pointOnRim(e.clientX, e.clientY)
    const mesh = new THREE.Mesh(pebbleGeo, pebbleMat)
    mesh.scale.setScalar(1.1)
    mesh.position.set(p.x, 0.2, p.z)
    scene.add(mesh)
    held = { id: e.pointerId, mesh }
    trail = [{ x: p.x, z: p.z, t: performance.now() }]
    wake()
  }
  const onMove = (e) => {
    if (e.pointerType === 'mouse' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const rect = canvas.getBoundingClientRect()
      leanTo.set(((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1)
      wake()
    }
    if (!held || held.id !== e.pointerId) return
    const p = pointOnRim(e.clientX, e.clientY)
    held.mesh.position.x = p.x; held.mesh.position.z = p.z
    trail.push({ x: p.x, z: p.z, t: performance.now() })
    if (trail.length > 6) trail.shift()
    wake()
  }
  const onUp = (e) => {
    if (!held || held.id !== e.pointerId) return
    const a = trail[0], b = trail[trail.length - 1]
    const dt = Math.max(16, b.t - a.t) / 1000
    let vx = (b.x - a.x) / dt, vz = (b.z - a.z) / dt
    const v = Math.hypot(vx, vz), cap = 2.4
    if (v > cap) { vx *= cap / v; vz *= cap / v }
    scene.remove(held.mesh)
    const { x, z } = held.mesh.position
    held = null
    release(x, z, vx * 0.9, vz * 0.9)
  }
  const onCancel = (e) => { if (held && held.id === e.pointerId) { scene.remove(held.mesh); held = null; wake() } }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)
  const onLeave = () => { leanTo.set(0, 0); wake() }
  canvas.addEventListener('pointerleave', onLeave)

  function resize(w, h) {
    renderer.setSize(w, h, false)
    const aspect = w / h
    camera.aspect = aspect
    // 짧은 쪽으로도 우물 가장자리가 조금 보이게 화각을 맞춘다
    const half = 1.14 / eye.y
    camera.fov = Math.min(96, (2 * Math.atan(aspect >= 1 ? half : half / aspect) * 180) / Math.PI)
    camera.updateProjectionMatrix()
    render()
  }

  return {
    resize,
    drop() {
      const a = rand(0, Math.PI * 2), r = rand(0, R * 0.5)
      release(Math.cos(a) * r, Math.sin(a) * r, rand(-0.4, 0.4), rand(-0.4, 0.4))
    },
    setPaused(value) { paused = value; if (!value) wake() },
    dispose() {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('pointerleave', onLeave)
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.normalMap?.dispose(); m.dispose() }) })
      renderer.dispose()
    },
  }
}
