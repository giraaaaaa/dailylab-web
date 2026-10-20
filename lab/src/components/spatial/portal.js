import * as THREE from 'three'
import { createStudio, box, labelTexture } from './studio'
import { clamp, smooth, portalTransform } from './math'

const UP = new THREE.Vector3(0, 1, 0)
const screenVertex = `varying vec4 vClip;
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);vClip=gl_Position;}`
const screenFragment = `uniform sampler2D uView; varying vec4 vClip;
void main(){vec2 uv=vClip.xy/vClip.w*.5+.5;gl_FragColor=texture2D(uView,uv);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`

export function createPortalStudy(canvas, report, onError) {
  const studio = createStudio(canvas, onError)
  const { renderer, wake, listen, reduced } = studio
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 100)
  const virtual = new THREE.PerspectiveCamera()
  const rt = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true, stencilBuffer: false })
  const textureMaterial = new THREE.ShaderMaterial({ uniforms: { uView: { value: rt.texture } }, vertexShader: screenVertex, fragmentShader: screenFragment, side: THREE.DoubleSide })
  const scenes = [studio.scene('#081c1a'), studio.scene('#b8cdc1')]
  const portals = [], surfaces = [], textures = []
  const mats = {
    dark: new THREE.MeshStandardMaterial({ color: '#153f39', roughness: 0.72 }),
    stone: new THREE.MeshStandardMaterial({ color: '#dce5d7', roughness: 0.7 }),
    pale: new THREE.MeshStandardMaterial({ color: '#b6cabe', roughness: 0.65 }),
    frame: new THREE.MeshStandardMaterial({ color: '#e7ede1', roughness: 0.3, metalness: 0.28 }),
    rim: new THREE.MeshBasicMaterial({ color: '#77dbc0' }),
    ink: new THREE.MeshStandardMaterial({ color: '#1c5148', roughness: 0.4, metalness: 0.15 }),
  }
  scenes.forEach((scene, index) => {
    scene.fog = new THREE.Fog(scene.background, 18, 45)
    const floor = index === 0 ? mats.dark : mats.pale
    box(scene, floor, 0, -0.22, 0, 38, 0.4, 70)
    box(scene, index === 0 ? mats.dark : mats.stone, -8.5, 5, -8, .3, 10, 46)
    box(scene, index === 0 ? mats.dark : mats.stone, 8.5, 5, -8, .3, 10, 46)
    box(scene, floor, 0, 5, -27, 17, 10, .3)
    const lineMat = new THREE.LineBasicMaterial({ color: index ? '#7f9b8b' : '#315d51', transparent: true, opacity: .5 })
    const vertices = []
    for (let i = -12; i <= 12; i++) {
      vertices.push(-14, -.005, i * 1.5, 14, -.005, i * 1.5)
      vertices.push(i * 1.5, -.005, -19, i * 1.5, -.005, 19)
    }
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), lineMat)
    scene.add(grid)
    // Stair flights and colonnades make the destination's rotated gravity legible.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 13; i++) {
        box(scene, index ? mats.stone : mats.ink, side * 5.5, .15 + i * .15, -7 + i * .47, 2.8, .3 + i * .3, .49)
      }
      for (let i = 0; i < 5; i++) {
        box(scene, index ? mats.stone : mats.ink, side * 7.0, 3.7, -10 + i * 4, .52, 7.4, .52)
        box(scene, mats.rim, side * 7.0, 7.5, -10 + i * 4, .55, .04, .55, { shadow: false })
      }
    }
    // A floor inlay remains an orientation cue without obstructing the return doorway.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2, .055, 8, 80), index ? mats.ink : mats.pale)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, .08, -6)
    scene.add(ring)
    if (index) for (let i = 0; i < 9; i++) {
      box(scene, mats.ink, 1.65, .12 + i * .12, -4.4 - i * .45, 1.15, .24 + i * .24, .46)
    }
    for (let i = 0; i < 14; i++) {
      const h = .3 + i * .34
      box(scene, index ? mats.ink : mats.pale, -4 + i * .6, h / 2, index ? -20 : 20, .61, h, 2.4)
    }
    box(scene, index ? mats.ink : mats.pale, -4.2, .35, -6.2, 1.5, .7, 1.5)
    const sculpture = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), index ? mats.stone : mats.ink)
    sculpture.position.set(-4.2, 1.7, -6.2); sculpture.rotation.set(.3, .4, .2); sculpture.castShadow = true
    scene.add(sculpture)
    const sign = labelTexture(index ? 'CHAMBER / 02' : 'CHAMBER / 01', index ? '#33584a' : '#79ac98')
    textures.push(sign)
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, .875), new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false }))
    signMesh.position.set(-5.5, 4.7, -4.0)
    scene.add(signMesh)
    const p = new THREE.Group(); p.position.set(0, 2.85, 0)
    if (index) { p.rotation.set(0, Math.PI, Math.PI / 2) }
    scene.add(p)
    const w = 3.75, h = 5.2
    box(p, mats.frame, -(w + .22) / 2, 0, 0, .22, h + .44, .36)
    box(p, mats.frame, (w + .22) / 2, 0, 0, .22, h + .44, .36)
    box(p, mats.frame, 0, (h + .22) / 2, 0, w, .22, .36)
    box(p, mats.frame, 0, -(h + .22) / 2, 0, w, .22, .36)
    for (const x of [-1, 1]) box(p, mats.rim, x * (w / 2 + .015), 0, .19, .025, h, .025, { shadow: false })
    for (const y of [-1, 1]) box(p, mats.rim, 0, y * (h / 2 + .015), .19, w, .025, .025, { shadow: false })
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), textureMaterial)
    surface.position.z = .01; surface.frustumCulled = false
    p.add(surface)
    portals.push(p); surfaces.push(surface)
  })
  let active = 0, crossings = 0, targetX = 0, targetRoll = 0, travel = null, disposed = false
  let pointer = null, lookX = 0, lookY = 0, cameraDirty = true
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2()
  const mapping = new THREE.Matrix4(), clip = new THREE.Vector4(), q = new THREE.Vector4(), plane = new THREE.Plane()
  const target = new THREE.Vector3(), normal = new THREE.Vector3()
  const cameraHome = new THREE.Vector3()
  function homePose(index) {
    const p = portals[index]
    p.updateMatrixWorld(true)
    normal.set(0, 0, 1).applyQuaternion(p.quaternion)
    cameraHome.copy(p.position).addScaledVector(normal, studio.size.aspect < .8 ? 12.5 : 9.6)
    cameraHome.x = 0; cameraHome.y += .25
    return cameraHome
  }
  camera.position.copy(homePose(0)); camera.lookAt(portals[0].position)
  function send() { report({ room: active + 1, crossings, moving: !!travel }) }
  function transfer() {
    if (travel) return
    const source = portals[active]
    source.updateMatrixWorld(true)
    if (reduced.matches) {
      active = 1 - active; crossings++
      camera.position.copy(homePose(active)); camera.up.copy(UP); camera.lookAt(portals[active].position)
      targetX = portals[active].position.x; targetRoll = portals[active].rotation.z
      lookX = lookY = 0; cameraDirty = false; send(); wake(); return
    }
    normal.set(0, 0, 1).applyQuaternion(source.quaternion)
    const end = source.position.clone().addScaledVector(normal, -.28)
    const look = new THREE.Matrix4().lookAt(source.position.clone().addScaledVector(normal, 2), source.position, UP)
    travel = { t: 0, source: active, from: camera.position.clone(), fromQ: camera.quaternion.clone(), near: end, nearQ: new THREE.Quaternion().setFromRotationMatrix(look), crossed: false }
    pointer = null; send(); wake()
  }
  function rotate() { if (travel) return; targetRoll += Math.PI / 2; wake() }
  function reset() {
    travel = null; active = 0; crossings = 0; targetX = 0; targetRoll = 0; lookX = lookY = 0
    portals[0].position.x = 0; portals[0].rotation.z = 0
    portals[1].position.x = 0; portals[1].rotation.z = Math.PI / 2
    camera.position.copy(homePose(0)); camera.up.copy(UP); camera.lookAt(portals[0].position); cameraDirty = true
    pointer = null; send(); wake()
  }
  listen(canvas, 'pointerdown', (e) => {
    if (travel || e.button !== 0 || pointer) return
    const rect = canvas.getBoundingClientRect()
    mouse.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(mouse, camera)
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moveDoor: raycaster.intersectObject(portals[active], true).length > 0 }
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'
  })
  listen(canvas, 'pointermove', (e) => {
    if (!pointer || pointer.id !== e.pointerId) return
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y
    if (pointer.moveDoor) targetX = clamp(targetX + dx / Math.max(45, studio.size.w / 12), -2.3, 2.3)
    else { lookX = clamp(lookX - dx * .012, -2.8, 2.8); lookY = clamp(lookY + dy * .008, -.5, 1.6); cameraDirty = true }
    pointer.x = e.clientX; pointer.y = e.clientY; wake()
  })
  const up = (e) => { if (pointer?.id === e.pointerId) { pointer = null; canvas.style.cursor = 'grab' } }
  listen(canvas, 'pointerup', up); listen(canvas, 'pointercancel', up); listen(canvas, 'lostpointercapture', up)
  listen(canvas, 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); transfer() }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); targetX = clamp(targetX + (e.key === 'ArrowLeft' ? -.35 : .35), -2.3, 2.3); wake() }
  })

  function renderPortal() {
    const entry = portals[active], exit = portals[1 - active]
    entry.updateMatrixWorld(true); exit.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    portalTransform(entry.matrixWorld, exit.matrixWorld, mapping)
    virtual.matrixWorld.multiplyMatrices(mapping, camera.matrixWorld)
    virtual.matrixWorld.decompose(virtual.position, virtual.quaternion, virtual.scale)
    virtual.matrixWorldInverse.copy(virtual.matrixWorld).invert()
    virtual.projectionMatrix.copy(camera.projectionMatrix)
    virtual.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
    // Oblique near plane clips everything between the virtual camera and the exit.
    normal.set(0, 0, 1).applyQuaternion(exit.quaternion)
    plane.setFromNormalAndCoplanarPoint(normal, exit.position)
    plane.applyMatrix4(virtual.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const m = virtual.projectionMatrix.elements
    q.set((Math.sign(clip.x) + m[8]) / m[0], (Math.sign(clip.y) + m[9]) / m[5], -1, (1 + m[10]) / m[14])
    const denom = clip.dot(q)
    if (Math.abs(denom) > .0001) {
      clip.multiplyScalar(2 / denom)
      m[2] = clip.x; m[6] = clip.y; m[10] = clip.z + 1 - .003; m[14] = clip.w
    }
    virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert()
    surfaces[1 - active].visible = false
    renderer.setRenderTarget(rt)
    renderer.render(scenes[1 - active], virtual)
    renderer.setRenderTarget(null)
    surfaces[1 - active].visible = true
    renderer.render(scenes[active], camera)
  }

  studio.start((dt) => {
    const p = portals[active]
    const a = reduced.matches ? 1 : 1 - Math.exp(-dt * 10)
    p.position.x += (targetX - p.position.x) * a
    p.rotation.z += (targetRoll - p.rotation.z) * a
    let changing = Math.abs(targetX - p.position.x) + Math.abs(targetRoll - p.rotation.z) > .001
    if (travel) {
      travel.t += dt
      if (travel.t < 1.2) {
        const k = smooth(travel.t / 1.2)
        camera.position.lerpVectors(travel.from, travel.near, k)
        camera.quaternion.slerpQuaternions(travel.fromQ, travel.nearQ, k)
      } else {
        if (!travel.crossed) {
          portals[0].updateMatrixWorld(true); portals[1].updateMatrixWorld(true)
          portalTransform(portals[active].matrixWorld, portals[1 - active].matrixWorld, mapping)
          travel.exitStart = travel.near.clone().applyMatrix4(mapping)
          const qMap = new THREE.Quaternion().setFromRotationMatrix(mapping)
          travel.exitQ = qMap.multiply(travel.nearQ)
          active = 1 - active; crossings++; travel.crossed = true
          travel.exitEnd = homePose(active).clone()
          const endMatrix = new THREE.Matrix4().lookAt(travel.exitEnd, portals[active].position, UP)
          travel.endQ = new THREE.Quaternion().setFromRotationMatrix(endMatrix)
          targetX = portals[active].position.x; targetRoll = portals[active].rotation.z
          lookX = lookY = 0; send()
        }
        const k = smooth((travel.t - 1.2) / 1.4)
        camera.position.lerpVectors(travel.exitStart, travel.exitEnd, k)
        camera.quaternion.slerpQuaternions(travel.exitQ, travel.endQ, k)
        if (k >= 1) { travel = null; cameraDirty = false; send() }
      }
      changing = true
    } else if (changing || cameraDirty) {
      homePose(active); cameraHome.x += lookX; cameraHome.y += lookY
      camera.position.lerp(cameraHome, reduced.matches ? 1 : 1 - Math.exp(-dt * 5))
      target.set(0, 2.85, 0)
      camera.up.copy(UP); camera.lookAt(target)
      changing ||= camera.position.distanceTo(cameraHome) > .002
      cameraDirty = changing
    }
    renderPortal()
    return changing
  }, (size) => {
    camera.aspect = size.aspect; camera.updateProjectionMatrix()
    const dpr = renderer.getPixelRatio()
    rt.setSize(Math.max(2, Math.round(size.w * dpr * .8)), Math.max(2, Math.round(size.h * dpr * .8)))
    cameraDirty = true
  })
  send()
  return { transfer, rotate, reset, dispose() {
    if (disposed) return; disposed = true
    studio.disposeScenes(scenes); textures.forEach((t) => t.dispose()); rt.dispose(); studio.dispose()
  } }
}
