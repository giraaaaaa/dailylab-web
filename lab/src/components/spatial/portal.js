import * as THREE from 'three'
import { createStudio, box, labelTexture } from './studio'
import { clamp, portalTransform } from './math.js'
import { APERTURE, BALL_RADIUS, createPortalBall, crossBall, stepPortalBall } from './portalBall.js'

const vertex = `varying vec4 vClip; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);vClip=gl_Position;}`
const fragment = `uniform sampler2D uView; varying vec4 vClip; void main(){gl_FragColor=texture2D(uView,vClip.xy/vClip.w*.5+.5);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`

export function createPortalStudy(canvas, report, onError, audio) {
  const studio = createStudio(canvas, onError)
  const { renderer, wake, listen, reduced } = studio
  renderer.localClippingEnabled = true
  const camera = new THREE.PerspectiveCamera(43, 1, .06, 90), virtual = new THREE.PerspectiveCamera()
  const rt = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true })
  const screen = new THREE.ShaderMaterial({ uniforms: { uView: { value: rt.texture } }, vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide })
  const scenes = [studio.scene('#111215'), studio.scene('#d7d8d4')]
  const portals = [], surfaces = [], textures = [], ballMeshes = [], shadows = []
  const white = new THREE.MeshStandardMaterial({ color: '#e7e7e1', roughness: .56 })
  const graphite = new THREE.MeshStandardMaterial({ color: '#1c1e23', roughness: .58, metalness: .18 })
  const metal = new THREE.MeshStandardMaterial({ color: '#969a9c', roughness: .25, metalness: .88 })
  const ink = new THREE.MeshStandardMaterial({ color: '#292b30', roughness: .55 })
  const light = new THREE.MeshBasicMaterial({ color: '#ededdf' })
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 40, 28), seamGeo = new THREE.TorusGeometry(BALL_RADIUS * 1.002, .009, 5, 72)
  const planes = [new THREE.Plane(), new THREE.Plane()]
  const floorTexture = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256
    const g = c.getContext('2d'); g.fillStyle = '#8e9091'; g.fillRect(0, 0, 256, 256)
    g.strokeStyle = '#a8aaab'; g.lineWidth = 1; g.strokeRect(.5, .5, 255, 255)
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${.015 + (i % 4) * .01})`; g.fillRect((i * 16807) % 255, (i * 73) % 256, 1, 1) }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(16, 16); t.colorSpace = THREE.SRGBColorSpace; textures.push(t); return t
  })()
  scenes.forEach((scene, index) => {
    scene.fog = new THREE.Fog(index ? '#d7d8d4' : '#111215', 16, 34)
    scene.environmentIntensity = index ? .7 : .42
    const floorMat = new THREE.MeshStandardMaterial({ color: index ? '#dbddd6' : '#393c40', map: floorTexture, roughness: .64, metalness: .17 })
    box(scene, floorMat, 0, -.02, 0, 28, .36, 26)
    box(scene, index ? white : graphite, 0, 3.8, -16, 24, 8, .3)
    if (index) {
      // Receiving floor: gravity points left, so the ball lands on this wall.
      box(scene, floorMat, -2.32, 3.1, -2.8, .34, 6.2, 10)
      for (let i = 0; i < 12; i++) box(scene, metal, -2.135, .5 + i * .46, -3.7, .02, .015, 7, { shadow: false })
      box(scene, ink, -2.08, 3.1, -5.8, .14, 4.4, .12)
      for (let i = 0; i < 5; i++) box(scene, ink, -.9 + i * .65, 5.8, -6.2, .09, .09, 2)
      box(scene, light, .5, 5.72, -6, 5, .025, .24, { shadow: false })
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.78, .035, 8, 96), ink)
      ring.position.set(.8, 3.3, -7.65); scene.add(ring)
      for (let k = -3; k <= 3; k++) box(scene, metal, k * .8, 2.9, -7.81, .012, 5.5, .012, { shadow: false })
    } else {
      for (const x of [-3.8, 3.8]) box(scene, graphite, x, .31, -.2, 1.7, .28, 7)
      for (const x of [-3.3, 3.3]) {
        box(scene, graphite, x, 2.7, -1.7, .17, 5.1, .24)
        box(scene, light, x, 3.6, -1.55, .025, 2.7, .02, { shadow: false })
      }
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(.46, .55, 2.12, 48), graphite)
      stand.position.set(0, 1.23, 2.45); stand.castShadow = stand.receiveShadow = true; scene.add(stand)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.42, .025, 8, 64), metal)
      rim.rotation.x = Math.PI / 2; rim.position.set(0, 2.3, 2.45); scene.add(rim)
      for (let z = .6; z < 2.3; z += .32) box(scene, metal, 0, .18, z, .035, .005, .12, { shadow: false })
    }
    const p = new THREE.Group(); p.position.set(0, 2.55, 0)
    if (index) p.rotation.set(0, Math.PI, 0)
    scene.add(p); portals.push(p)
    const { width: w, height: h } = APERTURE
    for (const x of [-1, 1]) {
      box(p, graphite, x * (w / 2 + .13), 0, -.08, .26, h + .52, .34)
      box(p, metal, x * (w / 2 + .018), 0, .12, .036, h + .08, .045)
      box(p, light, x * (w / 2 + .11), 0, .105, .018, h - .25, .015, { shadow: false })
      for (const y of [-1, 1]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(.033, .033, .015, 12), metal)
        screw.rotation.x = Math.PI / 2; screw.position.set(x * (w / 2 + .13), y * (h / 2 + .1), .1); p.add(screw)
      }
    }
    for (const y of [-1, 1]) {
      box(p, graphite, 0, y * (h / 2 + .13), -.08, w, .26, .34)
      box(p, metal, 0, y * (h / 2 + .018), .12, w, .036, .045)
    }
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screen)
    surface.position.z = .002; p.add(surface); surfaces.push(surface)
    const plaque = labelTexture(index ? '02  /  GRAVITY ←' : '01  /  GRAVITY ↓', index ? '#747773' : '#979a9d')
    textures.push(plaque)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, .5), new THREE.MeshBasicMaterial({ map: plaque, transparent: true, depthWrite: false }))
    sign.position.set(index ? 1.5 : -2.6, index ? 4.7 : .65, -1.5); scene.add(sign)
    const group = new THREE.Group()
    const material = new THREE.MeshPhysicalMaterial({ color: '#2A4BFF', roughness: .21, metalness: .22, clearcoat: .9, clearcoatRoughness: .16, clippingPlanes: [planes[index]], clipShadows: true })
    const sphere = new THREE.Mesh(ballGeo, material); sphere.castShadow = sphere.receiveShadow = true; group.add(sphere)
    const seam = new THREE.Mesh(seamGeo, new THREE.MeshStandardMaterial({ color: '#121b65', roughness: .48, clippingPlanes: [planes[index]] }))
    seam.rotation.y = .45; group.add(seam); scene.add(group); ballMeshes.push(group)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.55, 48), new THREE.MeshBasicMaterial({ color: '#08090d', transparent: true, opacity: .2, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .165; scene.add(shadow); shadows.push(shadow)
  })

  let ball = createPortalBall(), active = 0, angle = 0, targetAngle = 0, drag = null, look = 0, lookTarget = 0, travel = null, disposed = false, reported = ''
  const matrices = () => portals.map((p) => { p.updateMatrixWorld(true); return p.matrixWorld })
  const map = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4()
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), grabPlane = new THREE.Plane(), hit = new THREE.Vector3()
  function send() {
    const phase = drag?.kind === 'ball' ? 'held' : ball.flying ? ball.room ? 'falling' : 'rolling' : ball.room ? 'landed' : 'ready'
    const next = JSON.stringify([active, ball.crossings, phase, !!travel])
    if (next !== reported) { reported = next; report({ room: active + 1, crossings: ball.crossings, phase, moving: !!travel }) }
  }
  function reset() { ball = createPortalBall(); active = 0; drag = travel = null; angle = targetAngle = look = lookTarget = 0; send(); wake() }
  function launch() { audio?.unlock(); ball = createPortalBall(); ball.flying = true; ball.velocity.set(.04, 1.38, -2.65); drag = null; send(); wake() }
  function rotate() { if (travel || ball.flying || drag) return; targetAngle += Math.PI / 2; wake() }
  function home(index, out = camera) {
    const roll = portals[index].rotation.z
    const fitWidth = (Math.abs(Math.cos(roll)) * (APERTURE.width + .52) + Math.abs(Math.sin(roll)) * (APERTURE.height + .52)) * 1.25
    const d = Math.max(9.3, fitWidth / (2 * Math.tan(THREE.MathUtils.degToRad(43 / 2)) * studio.size.aspect))
    portals[index].updateMatrixWorld(true)
    out.position.copy(new THREE.Vector3(look * .9 + .9, .55, d).applyMatrix4(portals[index].matrixWorld))
    const center = portals[index].position.clone(); center.y -= .08
    out.up.set(0, 1, 0); out.lookAt(center)
  }
  function transfer() {
    if (travel) return
    active = 1 - active
    if (reduced.matches) { home(active); send(); wake(); return }
    travel = { t: 0, from: camera.position.clone(), q: camera.quaternion.clone() }; send(); wake()
  }
  function setPointer(e) {
    const r = canvas.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(pointer, camera)
  }
  listen(canvas, 'pointerdown', (e) => {
    if (e.button !== 0 || drag || travel) return
    audio?.unlock()
    setPointer(e)
    const ballHit = ball.room === active && ray.intersectObjects(ballMeshes[active].children).length
    if (ballHit) {
      ball.flying = false; grabPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), ball.position); ray.ray.intersectPlane(grabPlane, hit)
      drag = { kind: 'ball', id: e.pointerId, offset: ball.position.clone().sub(hit), last: performance.now() }
    } else drag = { kind: 'look', id: e.pointerId, x: e.clientX }
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; send(); wake()
  })
  listen(canvas, 'pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return
    if (drag.kind === 'look') { lookTarget = clamp(lookTarget + (e.clientX - drag.x) * .008, -1.6, 1.6); drag.x = e.clientX }
    else {
      setPointer(e)
      if (ray.ray.intersectPlane(grabPlane, hit)) {
        const prev = ball.position.clone(), now = performance.now(), dt = Math.max(.016, (now - drag.last) / 1000)
        ball.position.copy(hit).add(drag.offset); ball.position.x = clamp(ball.position.x, -1.8, 1.8); ball.position.z = clamp(ball.position.z, -.65, 4.5)
        ball.velocity.copy(ball.position).sub(prev).divideScalar(dt).clampLength(0, 4); drag.last = now
        if (crossBall(ball, prev, matrices())) { ball.flying = true; drag = null; canvas.style.cursor = 'grab' }
      }
    }
    send(); wake()
  })
  function up(e) {
    if (!drag || drag.id !== e.pointerId) return
    if (drag.kind === 'ball') { ball.flying = true; if (ball.velocity.length() < .2) ball.velocity.set(0, .3, -2.4) }
    drag = null; canvas.style.cursor = 'grab'; send(); wake()
  }
  listen(canvas, 'pointerup', up); listen(canvas, 'pointercancel', up); listen(canvas, 'lostpointercapture', up)
  listen(canvas, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); launch() }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); lookTarget = clamp(lookTarget + (e.key === 'ArrowLeft' ? -.3 : .3), -1.6, 1.6); wake() }
  })
  function updateBall() {
    const world = matrices()
    portals.forEach((p, i) => planes[i].setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion), p.position))
    const local = ball.position.clone().applyMatrix4(world[ball.room].clone().invert())
    ballMeshes[ball.room].visible = true; ballMeshes[ball.room].position.copy(ball.position); ballMeshes[ball.room].quaternion.copy(ball.rotation)
    const other = 1 - ball.room
    const straddling = Math.abs(local.z) < BALL_RADIUS + .015 && Math.abs(local.x) < APERTURE.width / 2 && Math.abs(local.y) < APERTURE.height / 2
    ballMeshes[other].visible = straddling
    ballMeshes.forEach((group, i) => group.children.forEach((mesh) => { mesh.material.clippingPlanes = i !== ball.room || straddling ? [planes[i]] : [] }))
    portalTransform(world[ball.room], world[other], map)
    ballMeshes[other].position.copy(ball.position).applyMatrix4(map)
    ballMeshes[other].quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(map)).multiply(ball.rotation)
    shadows.forEach((s, i) => {
      s.visible = i === ball.room
      if (!s.visible) return
      if (i === 0) { s.rotation.set(-Math.PI / 2, 0, 0); s.position.set(ball.position.x, .166, ball.position.z); s.material.opacity = .25 / (1 + ball.position.y * .7) }
      else { s.rotation.set(0, Math.PI / 2, 0); s.position.set(-2.145, ball.position.y, ball.position.z); s.material.opacity = .3 / (1 + Math.abs(ball.position.x + 2.15)) }
    })
  }
  function render() {
    const entry = portals[active], exit = portals[1 - active]
    camera.updateMatrixWorld(true); portalTransform(entry.matrixWorld, exit.matrixWorld, map)
    virtual.matrixWorld.multiplyMatrices(map, camera.matrixWorld); virtual.matrixWorld.decompose(virtual.position, virtual.quaternion, virtual.scale)
    virtual.matrixWorldInverse.copy(virtual.matrixWorld).invert(); virtual.projectionMatrix.copy(camera.projectionMatrix)
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(exit.quaternion), exit.position).applyMatrix4(virtual.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const m = virtual.projectionMatrix.elements
    q.set((Math.sign(clip.x) + m[8]) / m[0], (Math.sign(clip.y) + m[9]) / m[5], -1, (1 + m[10]) / m[14])
    if (Math.abs(clip.dot(q)) > .0001) { clip.multiplyScalar(2 / clip.dot(q)); m[2] = clip.x; m[6] = clip.y; m[10] = clip.z + 1 - .002; m[14] = clip.w }
    virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert()
    surfaces[1 - active].visible = false; renderer.setRenderTarget(rt); renderer.render(scenes[1 - active], virtual); renderer.setRenderTarget(null)
    surfaces[1 - active].visible = true; renderer.render(scenes[active], camera)
  }
  studio.start((dt) => {
    angle += (targetAngle - angle) * (reduced.matches ? 1 : 1 - Math.exp(-dt * 9)); portals[0].rotation.z = angle
    look += (lookTarget - look) * (reduced.matches ? 1 : 1 - Math.exp(-dt * 7))
    const before = ball.crossings
    const moving = stepPortalBall(ball, dt, matrices(), (speed, room) => audio?.play('impact', { gain: Math.min(.4, speed * .12), rate: room ? .72 : 1.1, pan: room ? -.5 : 0 }))
    if (ball.crossings !== before) audio?.play('click', { gain: .15, rate: .7 })
    updateBall()
    if (travel) {
      travel.t += dt
      const goal = new THREE.PerspectiveCamera(); home(active, goal)
      const t = Math.min(1, travel.t / .65), k = t * t * (3 - 2 * t)
      camera.position.lerpVectors(travel.from, goal.position, k); camera.quaternion.slerpQuaternions(travel.q, goal.quaternion, k)
      if (t === 1) travel = null
    } else home(active)
    render(); send()
    return moving || !!drag || !!travel || Math.abs(angle - targetAngle) > .0001 || Math.abs(look - lookTarget) > .0001
  }, (size) => {
    camera.aspect = size.aspect; camera.updateProjectionMatrix()
    const dpr = renderer.getPixelRatio(); rt.setSize(Math.max(2, Math.round(size.w * dpr)), Math.max(2, Math.round(size.h * dpr))); home(active)
  })
  return { launch, rotate, transfer, reset, dispose() {
    if (disposed) return; disposed = true
    studio.disposeScenes(scenes); textures.forEach((t) => t.dispose()); rt.dispose(); studio.dispose()
  } }
}
