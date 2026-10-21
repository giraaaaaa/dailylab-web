import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { woodMaps, ropeMaps, dirtMaps, speckleMaps, stoneWallMaps, staveMaps, glowTexture, mistTexture } from './textures'
import { makeItem, contentFor, caption, COLLECTIBLES, TWO_MOONS } from './items'

/* 우물. 밤, 달빛, 도르래가 달린 돌 우물. 손잡이를 돌려 두레박을 끌어올린다.
   - 두레박을 놓으면 밧줄이 풀리며 떨어지고(관성), 깊은 물에 첨벙 빠져 물이 찬다. 손잡이를 돌리면 래칫이 딸깍이며 감기고, 물이 찬 만큼 무겁다.
   - 두레박이 내려가는 동안 카메라는 우물 위로 올라가 등불을 내려다보고, 끌어올릴 때는 손잡이가 보이는 비스듬한 자리로 돌아온다.
   - 물에서 올라오는 것: 대개 물. 가끔 우물 바닥에 있던 물건(편지, 멈춘 시계, 사진, 명찰, 파란 돌, 열쇠). 건진 물건은 둘레 돌 위에 놓여 다음에도 남는다.
   - 돌 떨어뜨리기: 우물 입구를 누르면 돌이 떨어지고, √(2h/g) + h/343초 뒤에 물소리가 난다(깊이는 방문마다 다르다).
   - 예산: 움직이는 것이 없으면 그리지 않는다. 그림자는 물체가 움직일 때만 다시 굽는다. 프레임이 자꾸 늦으면 해상도를 스스로 낮춘다. 재질은 모두 코드로 그린다. */

const R = 0.62 // 우물 안쪽 반지름
const R2 = 0.94 // 둘레 돌담 바깥
const RIM_H = 0.74
const DV = 10 // 화면 속 물까지 깊이(진짜 깊이는 소리·시간에만 쓴다)
const WATER_Y = -DV
const AXLE_Y = 1.5
const POST_X = 1.1
const ARM = 0.34
const LIFT = 0.36 // 손잡이 1라디안에 감기는 진짜 밧줄 길이(m)
const BASE_TOP = RIM_H + 0.1 // 끝까지 감았을 때 두레박 바닥 높이
const G = 9.81
const SOUND = 343
const MEMORY = 'dl-well'
const RATCHET = [0.056, 0.121, 0.246, 0.331, 0.391, 1.046, 1.141, 1.271, 1.346, 1.441, 1.651, 2.026, 2.166, 2.336, 2.396, 2.651, 2.726]
const CREAKS = [[1.64, 1.84], [2.76, 2.96], [3.6, 3.72], [3.76, 3.92], [4.4, 4.68], [5.44, 5.64], [6.24, 6.4]]
const COBALT = '#2a4bff'

const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

function readMemory() {
  try { return { visits: 0, thrown: 0, returned: 0, hauls: 0, found: [], ...JSON.parse(localStorage.getItem(MEMORY) || '{}') } } catch { return { visits: 0, thrown: 0, returned: 0, hauls: 0, found: [] } }
}
function writeMemory(m) { try { localStorage.setItem(MEMORY, JSON.stringify(m)) } catch { /* 저장 불가 */ } }

// 깊은 곳까지 달빛·하늘빛이 닿지 않게(등불 빛은 그대로). 우물 안에 들어가는 재질에 쓴다
const LIGHTS = THREE.ShaderChunk.lights_fragment_begin
  .replace(/(#if \( NUM_DIR_LIGHTS > 0 \) && defined\( RE_Direct \)[\s\S]*?)(RE_Direct\( directLight)/, '$1directLight.color *= moonReach;\n\t\t$2')
  .replace('irradiance += getHemisphereLightIrradiance(', 'irradiance += moonReach * getHemisphereLightIrradiance(')
function deepen(material) {
  material.onBeforeCompile = (s) => {
    s.vertexShader = 'varying float vWorldY;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;')
    s.fragmentShader = 'varying float vWorldY;\n' + s.fragmentShader.replace('#include <lights_fragment_begin>', 'float moonReach = smoothstep(-2.6, 0.35, vWorldY);\n' + LIGHTS)
  }
  material.customProgramCacheKey = () => 'deep'
  return material
}

const WATER_VERT = `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const WATER_FRAG = `
uniform float uTime, uR, uFade, uLamp, uSky, uMoons, uBright;
uniform vec2 uLampP;
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
    vec2 q = p - d.xy;
    float dist = length(q) + 1e-4;
    float x = dist - age * 0.42;
    float env = exp(-x * x * 55.0) * exp(-age * 0.75) * d.w;
    float h = sin(x * 48.0) * env;
    disp += (q / dist) * h * 0.035;
    ring += abs(h);
  }
  vec2 uv = p + disp;
  // 물에 비친 우물 입구(밤하늘 원), 달, 별
  vec2 c = vec2(0.06, -0.04);
  float skyD = length(uv - c);
  float inSky = smoothstep(uSky, uSky * 0.8, skyD);
  vec3 sky = vec3(0.03, 0.032, 0.04) * inSky;
  vec2 m1 = c + vec2(0.16, -0.1) * uSky;
  sky += vec3(0.95, 0.96, 1.0) * smoothstep(0.075, 0.06, length(uv - m1)) * 0.95;
  sky += vec3(0.6) * exp(-length(uv - m1) * 16.0) * 0.18;
  vec2 m2 = c - vec2(0.2, -0.04) * uSky;
  sky += vec3(0.85, 0.88, 1.0) * smoothstep(0.06, 0.048, length(uv - m2)) * 0.9 * step(1.5, uMoons);
  vec2 cell = floor(uv * 30.0);
  sky += vec3(0.8) * step(0.986, hash(cell)) * smoothstep(0.12, 0.0, length(fract(uv * 30.0) - 0.5)) * inSky;
  // 등불: 물 위에 비친 밝은 점과 둘레로 번지는 빛
  float ld = length(uv - uLampP);
  vec3 lamp = vec3(1.0, 0.96, 0.9) * (smoothstep(0.09, 0.0, ld) * 1.4 + exp(-ld * 3.5) * 0.35) * uLamp;
  vec3 col = sky * uBright + lamp + vec3(0.8, 0.82, 0.88) * ring * (0.08 + 0.4 * uLamp);
  col *= smoothstep(1.02, 0.85, r) * 0.85 + 0.15;
  gl_FragColor = vec4(col * uFade, 1.0);
  #include <colorspace_fragment>
}`

export function createWell(canvas, { sfx, onStats, onNote }) {
  const small = window.matchMedia('(max-width: 760px)').matches
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('webgl')
  const maxDpr = Math.min(window.devicePixelRatio || 1, small ? 1.6 : 1.5)
  let dpr = maxDpr
  renderer.setPixelRatio(dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false // 물체가 움직일 때만 다시 굽는다

  const memory = readMemory()
  memory.visits += 1
  if (!Array.isArray(memory.found)) memory.found = []
  writeMemory(memory)
  const depth = Math.round(rand(12, 22) * 10) / 10 // 이 방문의 진짜 깊이(m)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#050506')
  scene.fog = new THREE.FogExp2('#050506', 0.07)
  const camera = new THREE.PerspectiveCamera(small ? 42 : 34, 1, 0.05, 60)

  /* ---------- 빛 ---------- */
  scene.add(new THREE.HemisphereLight('#8e95a2', '#060607', 0.32))
  const moon = new THREE.DirectionalLight('#e1e5ee', 1.85)
  moon.position.set(-2.6, 6.2, 3.4)
  moon.castShadow = true
  moon.shadow.mapSize.set(1024, 1024)
  Object.assign(moon.shadow.camera, { left: -2.8, right: 2.8, top: 2.8, bottom: -2.8, near: 1, far: 30 })
  moon.shadow.bias = -0.0005
  moon.shadow.normalBias = 0.03
  scene.add(moon, moon.target)
  const rim = new THREE.DirectionalLight('#9aa4b8', 0.65) // 뒤쪽에서 실루엣을 떼어 내는 빛(그림자 없음)
  rim.position.set(2.4, 2.8, -4.2)
  scene.add(rim)

  /* ---------- 재질(모두 코드로 그림) ---------- */
  const wood = woodMaps(small ? 256 : 512)
  const rot = (t, r, rx, ry) => { const c = t.clone(); c.center.set(0.5, 0.5); c.rotation = r; c.repeat.set(rx, ry); return c }
  const woodMat = new THREE.MeshStandardMaterial({ map: rot(wood.map, Math.PI / 2, 1, 3), normalMap: rot(wood.normalMap, Math.PI / 2, 1, 3), roughness: 0.88 })
  const axleMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.8 })
  const rope = ropeMaps()
  const coilMat = new THREE.MeshStandardMaterial({ map: rot(rope.map, Math.PI / 2, 26, 1), normalMap: rot(rope.normalMap, Math.PI / 2, 26, 1), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 })
  const ropeMat = deepen(new THREE.MeshStandardMaterial({ map: rope.map, normalMap: rope.normalMap, roughness: 0.95 }))
  const stoneTex = speckleMaps(small ? 128 : 256)
  const rimMat = new THREE.MeshStandardMaterial({ map: stoneTex.map, normalMap: stoneTex.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92 })
  const shaftTex = stoneWallMaps(small ? 256 : 512, { cellsX: 8, cellsY: 6, base: 84, spread: 22 })
  shaftTex.map.repeat.set(3, 12); shaftTex.normalMap.repeat.set(3, 12)
  const shaftMat = deepen(new THREE.MeshStandardMaterial({ map: shaftTex.map, normalMap: shaftTex.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.95, side: THREE.BackSide, shadowSide: THREE.DoubleSide }))
  const dirt = dirtMaps(small ? 256 : 512)
  dirt.map.repeat.set(14, 14); dirt.normalMap.repeat.set(14, 14)
  const flag = stoneWallMaps(small ? 256 : 512, { cellsX: 6, cellsY: 6, base: 70, spread: 20, mortar: 0.08 })
  flag.map.repeat.set(1.2, 1.2); flag.normalMap.repeat.set(1.2, 1.2)
  const staves = staveMaps()
  const bucketMat = deepen(new THREE.MeshStandardMaterial({ map: staves.map, normalMap: staves.normalMap, roughness: 0.85, side: THREE.DoubleSide }))
  const ironMat = deepen(new THREE.MeshStandardMaterial({ color: '#3a3a3d', metalness: 0.75, roughness: 0.5 }))
  const blueMat = new THREE.MeshStandardMaterial({ color: COBALT, roughness: 0.4, emissive: COBALT, emissiveIntensity: 0.08 })
  const glow = glowTexture()

  /* ---------- 땅과 돌담 ---------- */
  const ground = new THREE.Mesh(new THREE.RingGeometry(R2 - 0.02, 26, 96, 1), new THREE.MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normalMap, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  const flags = new THREE.Mesh(new THREE.RingGeometry(R2 - 0.02, R2 + 0.7, 72, 2), new THREE.MeshStandardMaterial({ map: flag.map, normalMap: flag.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.95, color: '#8a8a8e' }))
  flags.rotation.x = -Math.PI / 2
  flags.position.y = 0.006
  flags.receiveShadow = true
  scene.add(ground, flags)

  // 둘레 돌: 둥근 상자를 조금씩 찌그러뜨린 세 가지 모양을 엇갈려 쌓는다(인스턴스 세 번이면 끝)
  const variants = [0, 1, 2].map(() => {
    const geo = new RoundedBoxGeometry(1, 1, 1, 4, 0.085)
    const p = geo.attributes.position
    const k = Array.from({ length: 6 }, () => rand(0, 6))
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const n = 1 + 0.05 * Math.sin(x * 5 + k[0]) * Math.sin(y * 4 + k[1]) + 0.035 * Math.sin(z * 9 + k[2] + x * 4) + 0.02 * Math.sin(x * 17 + y * 13 + k[3])
      p.setXYZ(i, x * n, y * (1 + 0.07 * Math.sin(x * 6 + k[4]) + 0.03 * Math.sin(z * 11 + k[5])), z * n)
    }
    geo.computeVertexNormals()
    return geo
  })
  const placements = [[], [], []]
  const Rm = (R + R2) / 2
  const courses = [{ y: 0, h: 0.25, n: 12 }, { y: 0.25, h: 0.2, n: 15 }, { y: 0.45, h: 0.19, n: 13 }, { y: 0.64, h: 0.095, n: 15, cap: true }]
  courses.forEach((c, ci) => {
    // 길이가 제각각인 돌을 한 바퀴에 맞춰 차례로 놓는다(사이에 줄눈 틈)
    const lens = Array.from({ length: c.n }, () => rand(0.55, 1.45))
    const sum = lens.reduce((a, b) => a + b, 0)
    let a = rand(0, Math.PI * 2)
    for (let i = 0; i < c.n; i++) {
      const span = (lens[i] / sum) * Math.PI * 2
      const mid = a + span / 2
      a += span
      placements[(i + ci) % 3].push({ a: mid, y: c.y + c.h / 2 + rand(-0.01, 0.01), len: span * Rm * 0.955, h: c.h * rand(0.84, 0.98), d: (c.cap ? rand(0.36, 0.46) : R2 - R) * rand(0.92, 1.04), dr: rand(-0.018, 0.018), tone: rand(0.5, 1.05) * (c.cap ? 0.95 : 1), rot: rand(-0.07, 0.07) })
    }
  })
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  placements.forEach((list, vi) => {
    const mesh = new THREE.InstancedMesh(variants[vi], rimMat, list.length)
    list.forEach((s, i) => {
      dummy.position.set(Math.sin(s.a) * (Rm + s.dr), s.y, Math.cos(s.a) * (Rm + s.dr))
      dummy.rotation.set(s.rot * 0.5, s.a + s.rot, s.rot * 0.4)
      dummy.scale.set(s.len, s.h, s.d)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.setScalar(s.tone))
    })
    mesh.castShadow = mesh.receiveShadow = true
    scene.add(mesh)
  })
  // 바닥에 흩어진 자갈
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), rimMat, 70)
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), r = R2 + rand(0.05, 1.9) * Math.pow(Math.random(), 0.6)
    const s = rand(0.012, 0.04)
    dummy.position.set(Math.sin(a) * r, s * 0.4, Math.cos(a) * r); dummy.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6)); dummy.scale.set(s, s * 0.6, s * rand(0.8, 1.2)); dummy.updateMatrix()
    gravel.setMatrixAt(i, dummy.matrix); gravel.setColorAt(i, color.setScalar(rand(0.22, 0.48)))
  }
  gravel.castShadow = gravel.receiveShadow = true
  scene.add(gravel)

  // 우물 안 벽과 바닥 물
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, DV + 0.4, 48, 1, true), shaftMat)
  shaft.position.y = -(DV + 0.4) / 2 + 0.05
  shaft.castShadow = shaft.receiveShadow = true
  scene.add(shaft)
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0))
  let rippleIdx = 0
  const waterU = { uTime: { value: 0 }, uR: { value: R }, uDrops: { value: ripples }, uFade: { value: 1 }, uLamp: { value: 0 }, uLampP: { value: new THREE.Vector2() }, uSky: { value: 0.55 }, uMoons: { value: 1 }, uBright: { value: 1 } }
  const water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.02, 64), new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: waterU }))
  water.rotation.x = -Math.PI / 2
  water.position.y = WATER_Y
  scene.add(water)

  // 우물 안에서 새어 나오는 등불 빛(입구 바로 아래 얇은 빛판)
  const leak = new THREE.Mesh(new THREE.CircleGeometry(R, 32), new THREE.MeshBasicMaterial({ map: glow, color: '#f2ebe0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
  leak.rotation.x = -Math.PI / 2
  leak.position.y = 0.12
  scene.add(leak)

  // 땅 위에 낮게 깔린 안개 두 장(그릴 때만 조금씩 흐른다)
  const mistTex = mistTexture()
  mistTex.repeat.set(2, 2)
  const mists = [0.12, 0.34].map((y, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ alphaMap: i ? mistTex.clone() : mistTex, color: '#9aa0ab', transparent: true, opacity: 0.09 - i * 0.03, depthWrite: false }))
    m.rotation.x = -Math.PI / 2
    m.position.y = y
    scene.add(m)
    return m
  })

  /* ---------- 도르래 ---------- */
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.16, AXLE_Y + 0.32, 0.16, 2, 0.025), woodMat)
    post.position.set(s * POST_X, (AXLE_Y + 0.32) / 2, 0)
    post.castShadow = post.receiveShadow = true
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.06, 0.22, 2, 0.02), woodMat)
    cap.position.set(s * POST_X, AXLE_Y + 0.35, 0)
    cap.castShadow = true
    const foot = new THREE.Mesh(variants[1], rimMat)
    foot.scale.set(0.3, 0.12, 0.3); foot.position.set(s * POST_X, 0.05, 0)
    foot.castShadow = foot.receiveShadow = true
    scene.add(post, cap, foot)
  }
  const drum = new THREE.Group()
  drum.position.set(0, AXLE_Y, 0)
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, POST_X * 2 + 0.24, 20), axleMat)
  axle.rotation.z = Math.PI / 2
  axle.castShadow = true
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.46, 28, 1, true), coilMat)
  coil.rotation.z = Math.PI / 2
  coil.castShadow = true
  drum.add(axle, coil)
  scene.add(drum)
  const crank = new THREE.Group()
  crank.position.set(POST_X + 0.13, AXLE_Y, 0)
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.045, ARM + 0.05, 0.06, 2, 0.012), woodMat)
  arm.position.y = ARM / 2
  const handleMat = new THREE.MeshStandardMaterial({ map: wood.map, color: '#c9c6c0', roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0 })
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 14), handleMat)
  handle.rotation.z = Math.PI / 2
  handle.position.set(0.1, ARM, 0)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), ironMat)
  hub.rotation.z = Math.PI / 2
  crank.add(arm, handle, hub)
  crank.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(crank)
  const crankHit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ visible: false }))
  handle.add(crankHit)
  const handleSpot = new THREE.Vector3()
  const ropeLine = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 8, 1, true).translate(0, -0.5, 0), ropeMat)
  ropeLine.castShadow = true
  scene.add(ropeLine)

  /* ---------- 두레박과 등불 ---------- */
  const rig = new THREE.Group() // 두레박 바닥 가운데가 원점
  const profile = [[0, 0], [0.128, 0], [0.134, 0.006], [0.158, 0.27], [0.165, 0.278], [0.157, 0.286], [0.148, 0.272], [0.124, 0.02], [0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y))
  const bucket = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), bucketMat)
  bucket.castShadow = bucket.receiveShadow = true
  rig.add(bucket)
  for (const y of [0.05, 0.23]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.134 + 0.024 * (y / 0.27) + 0.003, 0.0055, 6, 40), ironMat)
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y; hoop.castShadow = true
    rig.add(hoop)
  }
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.005, 6, 28, Math.PI), ironMat)
  bail.position.y = 0.27
  bail.castShadow = true
  rig.add(bail)
  const BAIL_TOP = 0.27 + 0.168
  const bucketWaterU = THREE.UniformsUtils.clone(waterU)
  bucketWaterU.uDrops.value = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0))
  bucketWaterU.uR.value = 0.15; bucketWaterU.uSky.value = 0.7; bucketWaterU.uBright.value = 1.6
  bucketWaterU.uLamp.value = 0.45; bucketWaterU.uLampP.value.set(0.33, 0.05)
  const bucketWater = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: bucketWaterU }))
  bucketWater.rotation.x = -Math.PI / 2
  bucketWater.visible = false
  rig.add(bucketWater)
  // 등불: 두레박 손잡이 위 밧줄에 매단다
  const lantern = new THREE.Group()
  lantern.position.set(0.05, BAIL_TOP + 0.22, 0)
  const lampGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.075, 6), new THREE.MeshBasicMaterial({ color: '#f6efe4', transparent: true, opacity: 0.95, fog: false }))
  const lampTop = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.04, 6), ironMat); lampTop.position.y = 0.057
  const lampBot = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 6), ironMat); lampBot.position.y = -0.043
  const lampHook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 4, 12), ironMat); lampHook.position.y = 0.085
  const lampLight = new THREE.PointLight('#f2ebdf', 2.6, 7, 2)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#f4ede2', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
  halo.scale.setScalar(0.42)
  lantern.add(lampGlass, lampTop, lampBot, lampHook, lampLight, halo)
  rig.add(lantern)
  scene.add(rig)

  // 건져 올린 물건이 놓이는 자리(둘레 돌 위, 카메라 쪽 반 바퀴)
  const slots = COLLECTIBLES.map((_, i) => { const a = 0.55 + i * 0.32; return new THREE.Vector3(Math.sin(a) * (Rm + 0.02), RIM_H + 0.012, Math.cos(a) * (Rm + 0.02)) })
  const shelf = []
  const flights = []
  function placeOnRim(kind, animateFrom) {
    const idx = COLLECTIBLES.indexOf(kind)
    if (idx < 0) return
    const item = makeItem(kind, { blueMat })
    item.scale.setScalar(0.85)
    item.rotation.y = rand(-0.6, 0.6) + idx
    const to = slots[idx].clone()
    if (kind === 'blue') to.y += 0.03
    if (animateFrom) { item.position.copy(animateFrom); flights.push({ item, from: animateFrom.clone(), to, t: 0 }) } else item.position.copy(to)
    scene.add(item)
    shelf.push(item)
  }
  for (const k of memory.found) placeOnRim(k)

  /* ---------- 상태 ---------- */
  let L = 0 // 풀린 진짜 밧줄 길이(m)
  let v = 0 // 밧줄 풀리는 속도(m/s)
  let theta = 0 // 손잡이 각도(라디안, 클수록 감김)
  let phase = 'top' // top | free | fill | down | reveal
  let fill = 0
  let content = null // 물에 닿은 순간 정해진다
  let load = 0.35
  let heavyDropped = false
  let auto = false
  let grab = null
  const swing = { x: 0, z: 0, vx: 0, vz: 0 }
  let spinY = 0
  let lastTooth = 0
  let creakAcc = 0
  let creakNext = rand(1.2, 2.4)
  let dripT = 0
  let revealT = 0
  let revealItem = null
  let hinting = false
  const pebbles = []
  const pebbleMat = new THREE.MeshStandardMaterial({ color: '#8f8f95', roughness: 0.8, flatShading: true })
  const pebbleGeo = new THREE.IcosahedronGeometry(0.035, 0)
  const stats = { hauls: memory.hauls, found: memory.found.length, total: COLLECTIBLES.length, depth: null, phase, ropeDepth: 0 }
  let lastSig = ''
  function report() {
    Object.assign(stats, { phase, found: memory.found.length, hauls: memory.hauls, ropeDepth: Math.round(L) })
    const sig = `${phase}|${stats.ropeDepth}|${stats.hauls}|${stats.found}|${stats.depth}`
    if (sig !== lastSig) { lastSig = sig; onStats?.({ ...stats }) }
  }
  const note = (t) => onNote?.(t)

  /* ---------- 소리 ---------- */
  let whirr = null
  const air = () => sfx.reverb(3.4, 2.4, 0.3)
  function heard(at) { // 물소리를 들은 순간 깊이를 안다
    setTimeout(() => { if (stats.depth === null) { stats.depth = depth; report() } }, at * 1000)
  }
  function splashBig(strength) {
    const at = depth / SOUND
    sfx.play('well-plunge', { gain: clamp(0.35 + strength * 0.5, 0.35, 0.9), rate: rand(0.92, 1.04), send: 0.7, at })
    sfx.play('well-glug', { gain: 0.32, send: 0.6, at: at + 0.45 })
    heard(at)
  }
  function drip() { // 두레박에서 떨어진 물방울: 남은 깊이만큼 늦게 들린다
    const h = Math.max(0.3, depth - L)
    const at = Math.sqrt((2 * h) / G) + h / SOUND
    sfx.play('mirror-drip', { gain: rand(0.08, 0.2), rate: rand(0.75, 1.15), send: 0.85, at, pan: rand(-0.2, 0.2) })
  }

  /* ---------- 카메라 ---------- */
  const look = { yaw: 0.52, pitch: 0.66, dist: 5.3, tx: 0.08, ty: 0.85, tz: 0 }
  const cam = { ...look }
  let userYaw = 0
  let lean = { x: 0, y: 0 }
  function aim() {
    const sc = W / H < 0.8 ? 1.45 : small ? 1.25 : 1
    if (phase === 'reveal') Object.assign(look, { yaw: 0.42, pitch: 0.95, dist: 2.3 * sc, tx: 0, ty: BASE_TOP + 0.15, tz: 0.1 })
    else if (phase === 'free' || phase === 'fill') Object.assign(look, { yaw: 0.3, pitch: 1.36, dist: 6.4 * sc, tx: 0, ty: -0.6, tz: 0.05 })
    else Object.assign(look, { yaw: 0.52, pitch: 0.66, dist: 5.3 * sc, tx: 0.08, ty: 0.85, tz: 0 })
  }
  function placeCamera(dt) {
    aim()
    const k = phase === 'reveal' ? 2.2 : 1.7
    let moving = 0
    for (const key of Object.keys(look)) { cam[key] = damp(cam[key], look[key], k, dt); moving = Math.max(moving, Math.abs(cam[key] - look[key])) }
    const yaw = cam.yaw + userYaw + lean.x * 0.04, pitch = clamp(cam.pitch + lean.y * 0.03, 0.2, 1.5)
    camera.position.set(cam.tx + Math.sin(yaw) * Math.cos(pitch) * cam.dist, cam.ty + Math.sin(pitch) * cam.dist, cam.tz + Math.cos(yaw) * Math.cos(pitch) * cam.dist)
    camera.lookAt(cam.tx, cam.ty, cam.tz)
    return moving > 0.002
  }

  /* ---------- 장면 갱신 ---------- */
  const coilR = () => 0.07 + 0.006 + 0.03 * clamp(1 - L / 24, 0, 1)
  const baseY = () => BASE_TOP - (L / depth) * (BASE_TOP - (WATER_Y - 0.1)) - fill * 0.08
  const top = new THREE.Vector3(), bottom = new THREE.Vector3(), dir = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0)
  function pose(time) {
    const cr = coilR()
    coil.scale.set(cr, 1, cr)
    drum.rotation.x = -theta
    crank.rotation.x = -theta
    const y = baseY()
    rig.position.set(swing.x, y, cr + swing.z)
    rig.rotation.set(swing.z * 1.2, spinY + Math.sin(time * 0.4) * 0.03, -swing.x * 1.2)
    top.set(0, AXLE_Y, cr)
    bottom.set(swing.x, y + BAIL_TOP, cr + swing.z)
    dir.subVectors(bottom, top)
    const len = dir.length()
    ropeLine.position.copy(top)
    ropeLine.quaternion.setFromUnitVectors(down, dir.normalize())
    ropeLine.scale.set(1, len, 1)
    ropeMat.map.repeat.set(1, len * 9); ropeMat.normalMap.repeat.set(1, len * 9)
    // 등불: 깊이 들어갈수록 안개 너머로 흐려지고, 입구로 빛이 샌다
    const below = -(y + BAIL_TOP)
    lampLight.intensity = (y > 0 ? 1.4 : 2.6) * (0.93 + 0.07 * Math.sin(time * 13.1) * Math.sin(time * 7.3)) // 위에서는 눈부시지 않게
    leak.material.opacity = below > 0.4 ? 0.32 * Math.exp(-below / 5) : 0
    // 바닥 물: 등불이 가까우면 밝게
    const lampH = Math.max(0, y + BAIL_TOP + 0.22 - WATER_Y)
    waterU.uLamp.value = 1.6 / (1 + lampH * lampH * 0.9)
    waterU.uLampP.value.set((rig.position.x + 0.05) / R, -rig.position.z / R)
    waterU.uFade.value = Math.exp(-Math.pow(camera.position.distanceTo(water.position) * 0.05, 2)) * 1.4
    waterU.uTime.value = time
    bucketWaterU.uTime.value = time
    bucketWater.position.y = 0.03 + fill * 0.2
  }

  function ripple(x, z, strength) {
    ripples[rippleIdx].set(x / R, -z / R, waterU.uTime.value, strength)
    rippleIdx = (rippleIdx + 1) % ripples.length
  }

  /* ---------- 물리 ---------- */
  function release() { // 두레박을 놓는다: 밧줄이 풀리며 떨어진다
    if (phase !== 'top' && phase !== 'down') return
    sfx.unlock(); air()
    if (phase === 'top') { content = null; fill = 0; bucketWater.visible = false; load = 0.35; heavyDropped = false; note('') }
    if (revealItem) { rig.remove(revealItem); revealItem = null }
    phase = 'free'
    auto = false
    v = Math.max(v, 0.4)
    swing.vx += rand(-0.15, 0.15); swing.vz += rand(-0.1, 0.1)
    whirr ??= sfx.loop('well-whirr', { gain: 0, send: 0.1 })
    report(); wake()
  }
  function reel() { // 손잡이를 저절로 돌린다(버튼·키보드)
    if (phase !== 'down') return
    sfx.unlock(); air()
    auto = true
    wake()
  }

  function crankTo(dTheta, dt) {
    // dTheta > 0: 감기(무게만큼 느리다), < 0: 손으로 천천히 풀기
    if (dTheta > 0) {
      if (hinting) { hinting = false; handleMat.emissiveIntensity = 0; note('') }
      dTheta = Math.min(dTheta, (7.5 / Math.pow(load, 0.6)) * dt)
      L -= dTheta * LIFT
      theta += dTheta
      const tooth = Math.floor(theta / ((Math.PI * 2) / 12))
      if (tooth !== lastTooth) {
        lastTooth = tooth
        sfx.play('well-ratchet', { offset: RATCHET[Math.floor(Math.random() * RATCHET.length)], duration: 0.07, gain: 0.32 + load * 0.15, rate: rand(0.94, 1.06), pan: 0.35 })
      }
      creakAcc += dTheta * load
      if (creakAcc > creakNext) {
        creakAcc = 0; creakNext = rand(1.2, 2.4)
        const [a, b] = CREAKS[Math.floor(Math.random() * CREAKS.length)]
        sfx.play('well-windlass', { offset: a, duration: b - a, gain: clamp(0.15 + load * 0.35, 0.15, 0.7), rate: rand(0.88, 1.08), pan: 0.25 })
      }
    } else if (dTheta < 0) {
      L -= dTheta * LIFT
      theta += dTheta
      lastTooth = Math.floor(theta / ((Math.PI * 2) / 12))
    }
    if (L <= 0) arrive()
    else if (L >= depth && content === null && phase === 'down') { L = depth; touchWater(0.25) }
    L = clamp(L, 0, depth)
  }

  function touchWater(strength) {
    phase = 'fill'
    fill = 0
    content = contentFor(memory.hauls)
    v = 0
    whirr?.set(0, 0.08)
    splashBig(strength)
    ripple(rig.position.x, rig.position.z, 1)
    ripple(rig.position.x + 0.1, rig.position.z - 0.05, 0.6)
    swing.vx += rand(-0.2, 0.2); swing.vz += rand(-0.2, 0.2)
    note('물이 차오른다')
    report()
  }

  function arrive() {
    L = 0
    auto = false
    if (phase !== 'down') return
    sfx.play('well-knock', { gain: 0.6, rate: rand(0.95, 1.05) })
    swing.vx += 0.25
    if (content) {
      const kind = content
      phase = 'reveal'
      revealT = 0
      memory.hauls += 1
      const cap = caption(kind, { haul: memory.hauls - 1, thrown: memory.thrown })
      bucketWaterU.uMoons.value = cap === TWO_MOONS ? 2 : 1
      bucketWater.visible = kind !== 'heavy'
      if (kind !== 'water' && kind !== 'heavy') {
        revealItem = makeItem(kind, { blueMat })
        revealItem.position.set(0, 0.03 + fill * 0.2 + 0.006, 0)
        revealItem.rotation.y = rand(-0.5, 0.5)
        rig.add(revealItem)
        if (!memory.found.includes(kind)) { memory.found.push(kind); if (kind === 'blue') memory.returned += 1 }
      }
      writeMemory(memory)
      note(cap)
      content = null
    } else { phase = 'top'; note('') }
    report()
  }

  function finishReveal() {
    phase = 'top'
    if (revealItem) {
      const from = new THREE.Vector3()
      revealItem.getWorldPosition(from)
      const kind = revealItem.userData.kind
      rig.remove(revealItem)
      revealItem = null
      if (!shelf.some((s) => s.userData.kind === kind)) placeOnRim(kind, from)
    }
    report()
  }

  function step(dt, time) {
    if (phase === 'free') {
      const a = G * 0.62 - 0.08 * v * Math.abs(v) // 드럼 관성과 밧줄 마찰
      v += a * dt
      L += v * dt
      theta -= (v / LIFT) * dt
      spinY += v * dt * 0.08
      whirr?.set(clamp(v / 9, 0, 0.6), 0.05); whirr?.rate(0.7 + clamp(v / 12, 0, 0.6), 0.05)
      if (L >= depth) { L = depth; touchWater(clamp(v / 10, 0, 1)) }
    } else if (phase === 'fill') {
      fill = Math.min(1, fill + dt / 1.9)
      load = content === 'heavy' ? 1.9 : 0.35 + fill * 0.75
      bucketWater.visible = content !== 'heavy' && fill > 0.15
      if (fill >= 1) { phase = 'down'; hinting = true; handleMat.emissiveIntensity = 0.22; note('손잡이를 돌려 끌어올리세요'); report() } // 잡을 곳을 살짝 밝힌다
    } else if (phase === 'down') {
      if (auto) crankTo(2 * Math.PI * dt, dt)
      else if (grab) { const d = grab.target - theta; if (Math.abs(d) > 1e-4) crankTo(d, dt) }
      if (content && content !== 'heavy' && L < depth - 0.5) {
        dripT -= dt
        if (dripT <= 0) { dripT = rand(0.18, 0.5) * (1 + (1 - L / depth)); drip() }
      }
      // 무거운 두레박: 반쯤 올라왔을 때 아래에서 무언가 놓고 간다
      if (content === 'heavy' && !heavyDropped && L < depth * 0.45) {
        heavyDropped = true
        load = 0.35
        sfx.play('well-plunge', { gain: 0.5, rate: 0.85, send: 0.85, at: (depth - L) / SOUND + 0.05 })
        swing.vx += 0.35; swing.vz -= 0.2
        note('갑자기 가벼워졌다')
      }
      report()
    } else if (phase === 'reveal') {
      revealT += dt
      if (revealItem) revealItem.rotation.y += dt * 0.25
      if (revealT > 4.2) finishReveal()
    }
    spinY *= Math.exp(-dt * (phase === 'free' ? 0.2 : 1.5))
    // 흔들림(밧줄 길이만큼 느린 진자)
    const len = Math.max(0.2, AXLE_Y - (baseY() + BAIL_TOP))
    const w2 = G / (len * 1.6)
    swing.vx += -w2 * swing.x * dt; swing.vz += -w2 * swing.z * dt
    swing.vx *= Math.exp(-dt * 0.9); swing.vz *= Math.exp(-dt * 0.9)
    swing.x = clamp(swing.x + swing.vx * dt, -0.25, 0.25); swing.z = clamp(swing.z + swing.vz * dt, -0.25, 0.25)
    // 날아가는 물건(두레박 → 둘레 돌)
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]
      f.t = Math.min(1, f.t + dt / 0.9)
      const e = f.t * f.t * (3 - 2 * f.t)
      f.item.position.lerpVectors(f.from, f.to, e)
      f.item.position.y += Math.sin(e * Math.PI) * 0.25
      if (f.t >= 1) { flights.splice(i, 1); sfx.play('well-place', { gain: 0.4, rate: rand(1.1, 1.3) }) }
    }
    // 떨어지는 돌
    for (let i = pebbles.length - 1; i >= 0; i--) {
      const p = pebbles[i]
      p.t += dt
      const k = Math.min(1, p.t / p.fall)
      p.mesh.position.y = p.y0 + (WATER_Y - p.y0) * k * k
      p.mesh.rotation.x += dt * p.spin; p.mesh.rotation.z += dt * p.spin * 0.7
      if (!p.clacked && k > 0.35 && Math.random() < 0.012) { p.clacked = true; sfx.play('well-clack', { gain: 0.35 * (1 - k), rate: rand(0.9, 1.2), send: 0.6, at: (depth * k) / SOUND }) }
      if (k >= 1) {
        scene.remove(p.mesh)
        pebbles.splice(i, 1)
        ripple(p.mesh.position.x, p.mesh.position.z, 0.7)
        const at = depth / SOUND
        sfx.play('well-splash', { gain: 0.7, rate: rand(0.94, 1.08), send: 0.75, at })
        heard(at)
      }
    }
    pose(time)
    const ripplesLive = ripples.some((r) => r.w > 0 && time - r.z < 7)
    return phase !== 'top' || auto || !!grab || flights.length > 0 || pebbles.length > 0 || ripplesLive || Math.abs(swing.vx) + Math.abs(swing.vz) + Math.abs(swing.x) + Math.abs(swing.z) > 0.004
  }

  function dropStone(x = rand(-0.25, 0.25), z = rand(-0.2, 0.3)) {
    sfx.unlock(); air()
    if (pebbles.length >= 6) return
    const mesh = new THREE.Mesh(pebbleGeo, pebbleMat)
    mesh.position.set(x, RIM_H + 0.05, z)
    mesh.castShadow = true
    scene.add(mesh)
    pebbles.push({ mesh, y0: RIM_H + 0.05, t: 0, fall: Math.sqrt((2 * depth) / G), spin: rand(4, 9), clacked: false })
    memory.thrown += 1
    writeMemory(memory)
    wake()
  }

  /* ---------- 입력 ---------- */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const opening = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(RIM_H + 0.02))
  const hitPoint = new THREE.Vector3()
  const centerS = new THREE.Vector3()
  const toScreen = (v3) => { const p = v3.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H } }
  // 손잡이를 화면에서 돌리는 방향과 실제 회전 방향을 맞춘다(손잡이가 손가락을 따라오게)
  function screenAngleOfHandle(th) {
    const keep = crank.rotation.x
    crank.rotation.x = -th; crank.updateMatrixWorld(true)
    handle.getWorldPosition(handleSpot)
    crank.rotation.x = keep; crank.updateMatrixWorld(true)
    const c = toScreen(centerS.set(POST_X + 0.23, AXLE_Y, 0)), h = toScreen(handleSpot)
    return Math.atan2(h.y - c.y, h.x - c.x)
  }
  function pointerAngle(e) {
    const r = canvas.getBoundingClientRect()
    const c = toScreen(centerS.set(POST_X + 0.23, AXLE_Y, 0))
    return Math.atan2(e.clientY - r.top - c.y, e.clientX - r.left - c.x)
  }
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a))
  let orbit = null
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    sfx.unlock(); air()
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    canvas.setPointerCapture?.(e.pointerId)
    // 끌어올릴 차례엔 화면 어디서든 원을 그리면 손잡이가 돈다. 맨 위에선 손잡이 근처만(거꾸로 돌려 놓기)
    handle.getWorldPosition(handleSpot)
    const hs = toScreen(handleSpot)
    const nearCrank = Math.hypot(e.clientX - r.left - hs.x, e.clientY - r.top - hs.y) < Math.max(70, W * 0.07) || ray.intersectObject(crankHit, false).length > 0
    if (phase === 'down' || (phase === 'top' && nearCrank)) {
      grab = { id: e.pointerId, last: pointerAngle(e), target: theta, t: performance.now() }
      auto = false
      canvas.style.cursor = 'grabbing'
      wake(); return
    }
    if (ray.ray.intersectPlane(opening, hitPoint) && Math.hypot(hitPoint.x, hitPoint.z) < R * 0.88) { dropStone(hitPoint.x, hitPoint.z); return }
    orbit = { id: e.pointerId, x: e.clientX, yaw: userYaw }
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect()
    if (!grab) lean = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 }
    if (grab && e.pointerId === grab.id) {
      const a = pointerAngle(e)
      const da = wrapA(a - grab.last)
      grab.last = a
      // 손가락 각도 변화 → 손잡이 각도 변화(비스듬히 보여 납작해진 원만큼 보정)
      const eps = 0.05
      const slope = wrapA(screenAngleOfHandle(theta + eps) - screenAngleOfHandle(theta)) / eps
      const k = Math.abs(slope) < 0.25 ? Math.sign(slope || 1) * 4 : 1 / slope
      let dth = clamp(da * k, -0.9, 0.9)
      if (phase === 'top' && dth < 0) { // 맨 위에서 거꾸로 돌리면 놓는다
        if (dth < -0.15) { grab = null; canvas.style.cursor = ''; release(); return }
        dth = 0
      }
      if (phase === 'top') dth = Math.min(dth, 0)
      grab.target += dth
      const now = performance.now()
      const speed = dth / Math.max(0.008, (now - grab.t) / 1000)
      grab.t = now
      if (phase === 'down' && speed < -9) { grab = null; canvas.style.cursor = ''; release() } // 거꾸로 세게 돌리면 래칫이 풀린다
      wake()
    } else if (orbit && e.pointerId === orbit.id) {
      userYaw = clamp(orbit.yaw + (e.clientX - orbit.x) * 0.004, -0.5, 0.5)
      wake()
    } else if (!small) wake(400)
  }
  function onUp(e) {
    if (grab && e.pointerId === grab.id) { grab = null; canvas.style.cursor = '' }
    if (orbit && e.pointerId === orbit.id) orbit = null
    wake()
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  /* ---------- 그리기(필요할 때만) ---------- */
  let W = 1, H = 1
  let raf = 0
  let paused = false
  let last = performance.now()
  let awakeUntil = 0
  let slow = 0
  let shadowDirty = true
  const t0 = performance.now()
  function wake(ms = 600) { awakeUntil = Math.max(awakeUntil, performance.now() + ms); if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(frame) } }
  function frame(now) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    // 느린 기기: 프레임이 자꾸 늦으면 해상도를 한 단계 낮춘다
    if (dt > 0.026) slow++; else slow = Math.max(0, slow - 1)
    if (slow > 40 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); slow = 0 }
    last = now
    const time = (now - t0) / 1000
    const busy = step(dt, time)
    const camMoving = placeCamera(dt)
    mists[0].material.alphaMap.offset.set(time * 0.004, time * 0.003)
    mists[1].material.alphaMap.offset.set(-time * 0.003, time * 0.002)
    renderer.shadowMap.needsUpdate = busy || shadowDirty
    shadowDirty = false
    renderer.render(scene, camera)
    if (busy || camMoving || now < awakeUntil) raf = requestAnimationFrame(frame)
  }

  report()
  placeCamera(10)
  pose(0)

  return {
    resize(w, h) {
      W = w; H = h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.fov = w / h < 0.8 ? 46 : small ? 42 : 34
      camera.updateProjectionMatrix()
      shadowDirty = true
      placeCamera(10)
      wake()
    },
    lower: release,
    reel,
    drop: () => dropStone(),
    setPaused(p) {
      paused = p
      if (p) { cancelAnimationFrame(raf); raf = 0 } else wake()
    },
    dispose() {
      cancelAnimationFrame(raf)
      whirr?.stop()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        for (const m of mats) { for (const val of Object.values(m)) if (val?.isTexture) val.dispose(); m.dispose() }
      })
      renderer.dispose()
    },
  }
}
