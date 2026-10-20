import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createStudio, box } from './studio'
import { clamp, cityLots, foldPose, smooth } from './math'

function facadeMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#e8eadb', roughness: .65, side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float floors; varying float vFloors; varying vec2 vFacadeUv;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloors=floors; vFacadeUv=uv;')
    shader.fragmentShader = 'varying float vFloors; varying vec2 vFacadeUv;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 cell=fract(vFacadeUv*vec2(3.0,vFloors));
      float windowMask=step(.24,cell.x)*step(cell.x,.76)*step(.32,cell.y)*step(cell.y,.68);
      float border=step(.1,vFacadeUv.y)*step(vFacadeUv.y,.94);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.16,.14),windowMask*border*.8);
    `)
  }
  return material
}

export function createCityStudy(canvas, report, onError) {
  const studio = createStudio(canvas, onError)
  const { renderer, wake, listen, reduced } = studio
  const scene = studio.scene('#e7ede5')
  scene.fog = new THREE.Fog('#e7ede5', 45, 95)
  const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, .1, 120)
  camera.position.set(17, 16, 21); camera.lookAt(0, 1.5, 0)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 1.1, 0); controls.enableDamping = true; controls.dampingFactor = .09
  controls.enablePan = false; controls.enableZoom = false; controls.minPolarAngle = .25; controls.maxPolarAngle = 1.35; controls.enabled = false
  controls.addEventListener('change', wake)
  const dark = new THREE.MeshStandardMaterial({ color: '#244b40', roughness: .5, metalness: .2 })
  const roadMat = new THREE.MeshStandardMaterial({ color: '#92b4a0', roughness: .75 })
  const sideMat = new THREE.MeshStandardMaterial({ color: '#c0d0be', roughness: .7, side: THREE.DoubleSide })
  const padMat = new THREE.MeshStandardMaterial({ color: '#cedaca', roughness: .8 })
  const boardMat = new THREE.MeshStandardMaterial({ color: '#e1e7d8', roughness: .65 })
  const roofMat = new THREE.MeshStandardMaterial({ color: '#386e5b', roughness: .48, metalness: .15 })
  const groundMat = new THREE.MeshStandardMaterial({ color: '#e7ede5', roughness: 1 })
  const root = new THREE.Group(); scene.add(root)
  box(root, dark, 0, -.29, 0, 14.1, .34, 14.1)
  box(root, boardMat, 0, -.08, 0, 13.9, .12, 13.9)
  box(scene, groundMat, 0, -.61, 0, 200, .1, 200, { shadow: false })
  // Broad crossing avenues remain visible while every building folds down.
  box(root, roadMat, 0, .001, 0, .8, .015, 13.7, { shadow: false })
  box(root, roadMat, 0, .004, 0, 13.7, .015, .8, { shadow: false })
  const lineMat = new THREE.MeshBasicMaterial({ color: '#dce8d4' })
  for (let i = -6; i <= 6; i++) {
    box(root, lineMat, 0, .025, i, .035, .008, .35, { shadow: false })
    box(root, lineMat, i, .028, 0, .35, .008, .035, { shadow: false })
  }
  const lots = cityLots()
  const count = lots.length
  const facadeGeo = new THREE.PlaneGeometry(1, 1)
  const floors = new Float32Array(count * 2)
  lots.forEach((lot, i) => { floors[i * 2] = floors[i * 2 + 1] = Math.max(3, Math.round(lot.h * 3)) })
  facadeGeo.setAttribute('floors', new THREE.InstancedBufferAttribute(floors, 1))
  const facades = new THREE.InstancedMesh(facadeGeo, facadeMaterial(), count * 2)
  facades.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  facades.castShadow = true; facades.receiveShadow = true; facades.frustumCulled = false
  root.add(facades)
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roofMat, count)
  roofs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); roofs.castShadow = true; roofs.receiveShadow = true; roofs.frustumCulled = false
  root.add(roofs)
  const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), padMat, count)
  const temp = new THREE.Object3D()
  lots.forEach((lot, i) => {
    temp.position.set(lot.x, .007, lot.z); temp.rotation.set(0, 0, 0); temp.scale.set(1.27, .025, 1.27); temp.updateMatrix(); pads.setMatrixAt(i, temp.matrix)
    roofs.setColorAt(i, new THREE.Color().setHSL(.40 + lot.seed * .025, .18, .21 + lot.seed * .13))
  })
  pads.receiveShadow = true; root.add(pads)
  // The side closures share one dynamic buffer, rather than one draw call per building.
  const sidePositions = new Float32Array(count * 2 * 6 * 3)
  const sideGeo = new THREE.BufferGeometry()
  sideGeo.setAttribute('position', new THREE.BufferAttribute(sidePositions, 3).setUsage(THREE.DynamicDrawUsage))
  const sides = new THREE.Mesh(sideGeo, sideMat); sides.castShadow = true; sides.receiveShadow = true; sides.frustumCulled = false
  root.add(sides)
  // The central pedestrian bridges are four more hinged structures.
  const bridgeGroups = []
  for (let i = 0; i < 4; i++) {
    const hinge = new THREE.Group()
    hinge.position.set(i < 2 ? -2.6 : 2.6, .05, i % 2 === 0 ? -2.7 : 2.7)
    hinge.rotation.y = Math.PI / 2
    root.add(hinge)
    box(hinge, dark, 0, 0, 0, 2.8, .10, .55)
    box(hinge, roofMat, 0, .2, -.28, 2.8, .25, .035)
    box(hinge, roofMat, 0, .2, .28, 2.8, .25, .035)
    bridgeGroups.push(hinge)
  }
  const monument = new THREE.Group(); root.add(monument)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.45, .05, 6, 40), dark)
  ring.position.set(0, .55, 0); monument.add(ring)
  box(monument, sideMat, 0, .12, 0, .72, .24, .72)
  let current = reduced.matches ? .88 : .08, target = .88, velocity = 0, auto = false, autoTime = 0, orbit = false, drag = null, lastReport = -1, disposed = false
  let opening = reduced.matches ? 0 : 1.4
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  function updateGeometry(progress) {
    let cursor = 0
    lots.forEach((lot, i) => {
      const pose = foldPose(progress, lot.h, lot.delay)
      const { rise, angle } = pose
      const direction = lot.z > 0 ? -1 : 1
      const drift = pose.drift * direction
      for (let face = 0; face < 2; face++) {
        const baseZ = lot.z + (face ? 1 : -1) * lot.d / 2
        temp.position.set(lot.x, .045 + rise / 2, baseZ + drift / 2)
        temp.rotation.set((Math.PI / 2 - angle) * direction, face ? Math.PI : 0, 0)
        temp.scale.set(lot.w, lot.h, 1); temp.updateMatrix(); facades.setMatrixAt(i * 2 + face, temp.matrix)
      }
      temp.position.set(lot.x, .065 + rise, lot.z + drift)
      temp.rotation.set(0, 0, 0); temp.scale.set(lot.w + .07, .055, lot.d + .07); temp.updateMatrix(); roofs.setMatrixAt(i, temp.matrix)
      for (const sign of [-1, 1]) {
        const x = lot.x + sign * lot.w / 2
        v[0].set(x, .045, lot.z - lot.d / 2)
        v[1].set(x, .045, lot.z + lot.d / 2)
        v[2].set(x, .045 + rise, lot.z + lot.d / 2 + drift)
        v[3].set(x, .045 + rise, lot.z - lot.d / 2 + drift)
        for (const index of [0, 1, 2, 0, 2, 3]) { sidePositions[cursor++] = v[index].x; sidePositions[cursor++] = v[index].y; sidePositions[cursor++] = v[index].z }
      }
    })
    facades.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true
    sideGeo.attributes.position.needsUpdate = true; sideGeo.computeVertexNormals()
    bridgeGroups.forEach((bridge, i) => {
      const t = smooth((progress - .48 - i * .05) / .3)
      bridge.position.y = .05 + t * 1.4
      bridge.rotation.z = (1 - t) * Math.PI / 2
    })
    monument.scale.y = .05 + smooth(progress) * .95
  }
  function setProgress(value) { target = clamp(value, 0, 1); auto = false; opening = 0; wake() }
  function toggleAuto() {
    if (reduced.matches) { setProgress(target < .5 ? 1 : 0); return }
    auto = !auto; autoTime = Math.acos(clamp(1 - current * 2, -1, 1)); opening = 0; reportState(); wake()
  }
  function setOrbit(value) { orbit = value; controls.enabled = value; reportState(); wake() }
  function reportState() { report({ progress: Math.round(current * 100), auto, orbit, buildings: count }) }
  function reset() {
    current = .08; target = .88; velocity = 0; auto = false; autoTime = 0; opening = reduced.matches ? 0 : 1.4
    orbit = false; controls.enabled = false
    if (reduced.matches) current = .88
    camera.position.set(17, 16, 21); controls.target.set(0, 1.1, 0); controls.update(); reportState(); wake()
  }
  listen(canvas, 'pointerdown', (e) => {
    if (orbit || e.button !== 0 || drag) return
    drag = { id: e.pointerId, x: e.clientX }; auto = false; opening = 0
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'ew-resize'; reportState(); wake()
  })
  listen(canvas, 'pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return
    target = clamp(target + (e.clientX - drag.x) / Math.max(studio.size.w * .7, 240), 0, 1)
    drag.x = e.clientX; wake()
  })
  const onUp = (e) => { if (drag?.id === e.pointerId) { drag = null; canvas.style.cursor = 'grab'; wake() } }
  listen(canvas, 'pointerup', onUp); listen(canvas, 'pointercancel', onUp); listen(canvas, 'lostpointercapture', onUp)
  listen(canvas, 'keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setProgress(target + (e.key === 'ArrowLeft' ? -.08 : .08)) }
    if (e.key === ' ') { e.preventDefault(); toggleAuto() }
  })
  updateGeometry(current)
  studio.start((dt) => {
    if (opening > 0) { opening -= dt; target = .88 }
    if (auto) { autoTime += dt * .65; target = (1 - Math.cos(autoTime)) / 2 }
    if (reduced.matches) { current = target; velocity = 0; auto = false; opening = 0 }
    else {
      // A critically damped handle gives weight without overshooting the mechanical stops.
      const sub = 2, h = dt / sub
      for (let i = 0; i < sub; i++) { velocity += ((target - current) * 70 - velocity * 17) * h; current = clamp(current + velocity * h, 0, 1) }
    }
    updateGeometry(current)
    const changed = controls.update()
    renderer.render(scene, camera)
    const rounded = Math.round(current * 100)
    if (rounded !== lastReport) { lastReport = rounded; reportState() }
    return auto || opening > 0 || Math.abs(target - current) > .0001 || Math.abs(velocity) > .001 || changed
  }, (size) => {
    const width = size.aspect > 20.8 / 14 ? 14 * size.aspect : 20.8
    const height = width / size.aspect
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2
    camera.updateProjectionMatrix()
  })
  reportState()
  return { setProgress, toggleAuto, setOrbit, reset, dispose() {
    if (disposed) return; disposed = true
    controls.removeEventListener('change', wake); controls.dispose(); studio.disposeScenes([scene]); studio.dispose()
  } }
}
