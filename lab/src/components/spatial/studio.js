import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function createStudio(canvas, onError) {
  const small = window.matchMedia('(max-width: 760px)').matches
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(room, 0.04)
  room.dispose()
  pmrem.dispose()
  const size = { w: 1, h: 1, aspect: 1 }
  let run = null, resize = null, raf = 0, last = 0, disposed = false, lost = false, onScreen = true, dirty = true
  const cleanups = []
  function tick(now) {
    raf = 0
    if (disposed || lost || !onScreen || document.hidden) return
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60
    last = now
    dirty = false
    let keep = false
    try { keep = run?.(dt, now / 1000) === true } catch (error) {
      console.error(error)
      lost = true
      onError?.('화면을 그리지 못했습니다. 다시 열어 주세요.')
      return
    }
    if (keep || dirty) wake()
    else last = 0
  }
  function wake() {
    dirty = true
    if (!raf && !disposed && !lost && onScreen && !document.hidden) raf = requestAnimationFrame(tick)
  }
  function measure() {
    const rect = canvas.getBoundingClientRect()
    size.w = Math.max(1, Math.round(rect.width)); size.h = Math.max(1, Math.round(rect.height)); size.aspect = size.w / size.h
    renderer.setSize(size.w, size.h, false)
    resize?.(size)
    wake()
  }
  const ro = new ResizeObserver(measure)
  ro.observe(canvas)
  const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; last = 0; wake() })
  io.observe(canvas)
  const onVisibility = () => { last = 0; wake() }
  document.addEventListener('visibilitychange', onVisibility)
  const onLost = (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; onError?.('그래픽 장치 연결이 끊겼습니다. 다시 열어 주세요.') }
  canvas.addEventListener('webglcontextlost', onLost)
  reduced.addEventListener('change', wake)
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options)
    cleanups.push(() => target.removeEventListener(event, handler, options))
  }
  function scene(background) {
    const s = new THREE.Scene()
    s.background = new THREE.Color(background)
    s.environment = env.texture
    s.environmentIntensity = 0.45
    const hemi = new THREE.HemisphereLight('#f2f2f0', '#3a3a3e', 1)
    s.add(hemi)
    const light = new THREE.DirectionalLight('#fff8eb', 3)
    light.position.set(-5, 12, 8)
    light.castShadow = true
    light.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024)
    Object.assign(light.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 50 })
    light.shadow.normalBias = 0.025
    light.shadow.bias = 0.0001
    s.add(light)
    const fill = new THREE.DirectionalLight('#c3cbff', 0.6)
    fill.position.set(8, 5, -6)
    s.add(fill)
    return s
  }
  function disposeScenes(scenes) {
    const geometries = new Set(), materials = new Set()
    scenes.forEach((s) => s.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry)
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m))
      if (o.isLight) o.shadow?.map?.dispose()
    }))
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose())
  }
  return {
    renderer, env, size, small, reduced, wake, listen, scene, disposeScenes,
    start(callback, onResize) { run = callback; resize = onResize; measure(); wake() },
    dispose() {
      disposed = true; cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect(); cleanups.forEach((fn) => fn())
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      reduced.removeEventListener('change', wake)
      env.dispose(); renderer.dispose()
    },
  }
}

const cube = () => new THREE.BoxGeometry(1, 1, 1)
export function box(parent, material, x, y, z, w, h, d, { shadow = true } = {}) {
  const m = new THREE.Mesh(cube(), material)
  m.position.set(x, y, z); m.scale.set(w, h, d)
  m.castShadow = shadow; m.receiveShadow = true
  parent.add(m)
  return m
}

export function labelTexture(text, color = '#a8a8ae') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = color; ctx.font = '500 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 64)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
