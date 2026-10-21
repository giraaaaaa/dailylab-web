import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createStudio } from './studio'
import { advanceFold, createFoldState, districtFrames, DISTRICTS, BLOCK_LENGTH, FIRST_HINGE, MAX_HINGE, clampFold } from './cityFold.js'

// A street, seen from inside. One continuous chain of rigid neighbourhoods
// curls up and over the viewer; buildings retain their local coordinates.
function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .78, metalness: .05 })
  m.onBeforeCompile = (s) => {
    s.vertexShader = 'attribute vec4 aBuilding; varying vec3 vLocal; varying vec3 vFace; varying vec4 vBuilding; varying vec3 vCityNormal;\n' + s.vertexShader
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal=position*aBuilding.xyz; vFace=normal; vBuilding=aBuilding; vCityNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*(normal/aBuilding.xyz));')
    s.fragmentShader = 'varying vec3 vLocal; varying vec3 vFace; varying vec4 vBuilding; varying vec3 vCityNormal;\n' + s.fragmentShader
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float style=vBuilding.w;
      vec2 p=abs(vFace.z)>.5 ? vec2(vLocal.x+vBuilding.x*.5,vLocal.y+vBuilding.y*.5) : vec2(vLocal.z+vBuilding.z*.5,vLocal.y+vBuilding.y*.5);
      vec2 cells=p/vec2(2.45,3.05);
      vec2 f=fract(cells);
      float facade=1.-step(.5,abs(vFace.y));
      float panes=step(.15,f.x)*step(f.x,.81)*step(.19,f.y)*step(f.y,.79);
      float glassWall=step(.045,f.x)*step(f.x,.955)*step(.035,f.y)*step(f.y,.965);
      panes=mix(panes,glassWall,step(1.5,style))*facade*step(.5,style);
      float cellSeed=fract(sin(dot(floor(cells),vec2(12.9898,78.233))+vBuilding.y*7.13)*43758.5453);
      vec3 glass=mix(vec3(.035,.052,.06),vec3(.27,.33,.35),cellSeed*.4+smoothstep(0.,vBuilding.y,p.y)*.35+max(vCityNormal.y,0.)*.35);
      float grit=fract(sin(dot(floor(vLocal.xy*12.)+floor(vLocal.z),vec2(34.17,71.31)))*43758.54);
      float floorLine=(1.-smoothstep(.015,.055,f.y))*facade*step(.5,style);
      diffuseColor.rgb*=mix(.68,1.,smoothstep(0.,5.,p.y))*(.97+grit*.055);
      diffuseColor.rgb=mix(diffuseColor.rgb,glass,panes);
      diffuseColor.rgb*=1.-floorLine*.22;
    `)
    s.fragmentShader = s.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.24,panes);')
  }
  return m
}

function asphaltTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d'), data = g.createImageData(256, 256)
  let n = 157
  for (let i = 0; i < data.data.length; i += 4) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0
    const k = 93 + (n % 25)
    data.data[i] = k; data.data[i + 1] = k + 1; data.data[i + 2] = k; data.data[i + 3] = 255
  }
  g.putImageData(data, 0, 0)
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 8); t.colorSpace = THREE.SRGBColorSpace
  return t
}

const film = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    void main(){
      vec3 c=texture2D(tDiffuse,vUv).rgb;
      float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,.84);
      float v=dot((vUv-.5)*vec2(.85,1.),(vUv-.5)*vec2(.85,1.));
      c*=1.-v*.55;
      float grain=fract(sin(dot(vUv*vec2(1919.,1087.)+mod(time,17.),vec2(12.9898,78.233)))*43758.5453)-.5;
      c+=grain*.006;
      gl_FragColor=vec4(max(c,vec3(0.)),1.);
    }`,
}

export function createCityStudy(canvas, report, onError, audio) {
  const studio = createStudio(canvas, onError), { renderer, wake, listen, reduced, small } = studio
  renderer.toneMappingExposure = 1.12
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#bdc4c5')
  scene.fog = new THREE.FogExp2('#bdc4c5', .0046)
  scene.environment = null
  const camera = new THREE.PerspectiveCamera(56, 1, .15, 1100)
  const hemi = new THREE.HemisphereLight('#e5e9e9', '#35383c', 1.15); scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff3dc', 3.5)
  sun.position.set(-90, 125, 75); sun.target.position.set(0, 27, -50)
  sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -105, right: 105, top: 115, bottom: -90, near: 1, far: 390 })
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .06; sun.shadow.radius = 2
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight('#d7e1e7', .45); fill.position.set(80, 50, -120); scene.add(fill)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDir; void main(){vec3 d=normalize(vDir);float t=smoothstep(-.05,.85,d.y);vec3 c=mix(vec3(.73,.77,.77),vec3(.31,.39,.44),t);float s=pow(max(dot(d,normalize(vec3(-.5,.6,-.75))),0.),140.);gl_FragColor=vec4(c+vec3(.27,.24,.17)*s,1.);}`,
  })); sky.renderOrder = -10; scene.add(sky)
  const tex = asphaltTexture()
  const bodyMat = facadeMaterial()
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .86 })
  const metalMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .4, metalness: .48 })
  const glassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .18, metalness: .35 })
  const asphalt = new THREE.MeshStandardMaterial({ color: '#5d6263', roughness: .95, map: tex })
  const lampMat = new THREE.MeshStandardMaterial({ color: '#e4e2d6', emissive: '#e4e2d6', emissiveIntensity: .75, roughness: .4 })
  const batches = new Map()
  function add(kind, segment, position, size, color, style = 0, rotation = 0) {
    if (!batches.has(kind)) batches.set(kind, { entries: [], material: ({ body: bodyMat, stone: stoneMat, metal: metalMat, glass: glassMat, road: asphalt, lamps: lampMat })[kind] })
    const o = new THREE.Object3D(); o.position.set(...position); o.scale.set(...size); o.rotation.y = rotation; o.updateMatrix()
    batches.get(kind).entries.push({ segment, local: o.matrix.clone(), color: new THREE.Color(color), size, style })
  }
  let seed = 671923
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const tones = ['#b0b0a8', '#8d9392', '#bdc0ba', '#727c80', '#ccc9be', '#536168']
  let buildingCount = 0
  function building(segment, x, z, w, h, d, kind, color, accent = false) {
    const podium = kind === 1 ? Math.min(7, h * .28) : 0
    add('body', segment, [x, .4 + h / 2, z], [w, h, d], color, kind === 2 ? 2 : 1)
    if (podium) {
      add('body', segment, [x, .4 + podium / 2, z], [w + 1, podium, d + .7], color, 1)
      add('stone', segment, [x, podium + .48, z], [w + 1.3, .22, d + 1], '#b1b4af')
    }
    add('stone', segment, [x, h + .58, z], [w + .28, .30, d + .3], '#b1b5b1')
    // Recessed glazing, real cornices and rooftop plant give the fold a readable scale.
    for (let y = 6.5; y < h - 1; y += 6.1) add('stone', segment, [x, y, z], [w + .12, .12, d + .14], color)
    if (kind !== 2) for (const s of [-1, 1]) add('stone', segment, [x + s * (w / 2 - .16), .4 + h / 2, z + d / 2 + .04], [.20, h, .17], '#a8aea9')
    if (accent) {
      add('metal', segment, [x - Math.sign(x) * (w / 2 + .035), h * .6, z], [.075, h * .7, d * .72], '#2a4bff')
      add('metal', segment, [x, h + .78, z], [w + .3, .12, d + .3], '#2a4bff')
    }
    if (h > 11) {
      add('metal', segment, [x + w * .16, h + 1, z - .5], [Math.min(w * .45, 2.8), .7, Math.min(d * .55, 2.6)], '#646e70')
      add('metal', segment, [x - w * .27, h + 1.1, z + .5], [.5, 1, .5], '#495458')
    }
    buildingCount++
  }
  for (let i = 0; i < DISTRICTS; i++) {
    add('stone', i, [0, -.24, -9], [104, .42, BLOCK_LENGTH], '#858e8e')
    add('road', i, [0, .005, -9], [12, .045, BLOCK_LENGTH], '#ffffff')
    add('road', i, [0, .012, -16.2], [104, .045, 3.6], '#ffffff')
    for (const s of [-1, 1]) {
      add('stone', i, [s * 7.4, .15, -7.1], [2.8, .29, 14.2], '#a2aaa7')
      add('stone', i, [s * 6.05, .24, -7.1], [.17, .16, 14.2], '#c5cbc4')
      for (let z = -1.1; z > -13.5; z -= .9) add('stone', i, [s * 7.4, .302, z], [2.65, .008, .012], '#8e9691')
      for (const z of [-2.3, -11]) {
        const w = 8 + rand() * 2.6, d = 5.7 + rand() * .9
        const h = i < 4 ? 12 + rand() * 16 : 10 + rand() * 11
        building(i, s * (9.8 + w / 2), z - 2.5, w, h, d, Math.floor(rand() * 3), tones[Math.floor(rand() * tones.length)], i === 6 && s === 1 && z === -2.3)
      }
      for (const row of [27, 42]) for (const z of [-4.5, -12]) {
        const h = i < 4 ? 17 + rand() * 17 : 12 + rand() * 9
        building(i, s * (row + rand() * 1.4), z, 7 + rand() * 5, h, 5.5 + rand() * .7, Math.floor(rand() * 3), tones[Math.floor(rand() * tones.length)])
      }
      // A second street sets the neighbourhoods into an urban grid.
      add('road', i, [s * 35, .01, -9], [4.1, .045, BLOCK_LENGTH], '#ffffff')
      const lampZ = -8
      add('metal', i, [s * 7.1, 2.65, lampZ], [.085, 5.25, .085], '#38464b')
      add('metal', i, [s * 6.55, 5.25, lampZ], [1.15, .075, .10], '#38464b')
      add('lamps', i, [s * 6.05, 5.19, lampZ], [.52, .035, .19], '#ffffff')
      if ((i + (s > 0 ? 1 : 0)) % 3 === 0) {
        const z = -8.6
        add('metal', i, [s * 4.9, .75, z], [1.85, .9, 4.1], '#aab2b3')
        add('glass', i, [s * 4.9, 1.39, z - .25], [1.65, .52, 2.05], '#263941')
        add('metal', i, [s * 4.9, 1.68, z - .35], [1.62, .08, 1.85], '#c4c7c2')
        for (const xx of [-.82, .82]) for (const zz of [-1.28, 1.28]) add('metal', i, [s * 4.9 + xx, .4, z + zz], [.22, .56, .6], '#242d31')
      }
    }
    // Lane dashes and zebra crossings provide the human-scale foreground.
    for (let z = -.4; z > -13.5; z -= 3.5) for (const x of [-.12, .12]) add('stone', i, [x, .037, z], [.045, .012, 1.6], '#d9d8c5')
    for (let x = -5.6; x < 6; x += 1) for (const z of [-13.2, -17.6]) add('stone', i, [x, .046, z], [.5, .015, 1.1], '#c7cec6')
    for (const x of [-3, 3]) {
      add('stone', i, [x, .045, -9], [.11, .01, 1.6], '#aebbb5')
      add('stone', i, [x - .18, .045, -9.55], [.48, .01, .13], '#aebbb5')
    }
  }
  // Far silhouettes continue the city beyond the fold's last cross street.
  for (let i = 0; i < 72; i++) {
    const x = (rand() - .5) * 310, h = 15 + rand() ** 2 * 85, z = -230 - rand() * 100
    add('body', -1, [x, h / 2, z], [6 + rand() * 12, h, 7 + rand() * 12], tones[i % tones.length], 1)
  }
  const sharedBox = new THREE.BoxGeometry(1, 1, 1)
  for (const [kind, batch] of batches) {
    const geometry = kind === 'body' ? new RoundedBoxGeometry(1,1,1,1,.009) : sharedBox
    if (kind === 'body') {
      const sizes = new Float32Array(batch.entries.length * 4)
      batch.entries.forEach((e, i) => sizes.set([...e.size, e.style], i * 4))
      geometry.setAttribute('aBuilding', new THREE.InstancedBufferAttribute(sizes, 4))
    }
    const mesh = new THREE.InstancedMesh(geometry, batch.material, batch.entries.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = kind === 'body' || kind === 'metal' || kind === 'stone'
    mesh.receiveShadow = kind !== 'lamps'; mesh.frustumCulled = false
    batch.entries.forEach((e, i) => mesh.setColorAt(i, e.color))
    batch.mesh = mesh; scene.add(mesh)
  }
  const state = createFoldState(), frames = districtFrames(state.angles), matrix = new THREE.Matrix4()
  function updateCity() {
    districtFrames(state.angles, frames)
    for (const batch of batches.values()) {
      batch.entries.forEach((e, i) => { matrix.copy(e.local); if (e.segment >= 0) matrix.multiplyMatrices(frames[e.segment], e.local); batch.mesh.setMatrixAt(i, matrix) })
      batch.mesh.instanceMatrix.needsUpdate = true
    }
  }
  const composer = new EffectComposer(renderer)
  composer.renderTarget1.samples = Math.min(small ? 2 : 4, renderer.capabilities.maxSamples)
  composer.renderTarget2.samples = composer.renderTarget1.samples
  const renderPass = new RenderPass(scene, camera), grade = new ShaderPass(film), output = new OutputPass()
  composer.addPass(renderPass); composer.addPass(grade); composer.addPass(output)
  let target = 0, current = 0, auto = false, autoTime = 0, drag = null, pan = 0, panTarget = 0, time = 0, last = '', disposed = false, journey = null
  const easeJourney = (t) => t*t*t*(t*(t*6-15)+10)
  let closeView = true
  function setProgress(p) { audio?.unlock(); target = clampFold(p); auto = false; journey = null; wake() }
  function goTo(value, seconds = 6) {
    audio?.unlock(); auto = false
    if (reduced.matches) { target = value; journey = null }
    else journey = { from: target, to: value, t: 0, duration: Math.max(.8, seconds*Math.abs(value-target)) }
    wake()
  }
  function toggleFold() { goTo((journey?.to ?? target) < .5 ? 1 : 0) }
  function toggleAuto() { audio?.unlock(); if (reduced.matches) { toggleFold(); return }; auto = !auto; journey = null; autoTime = 0; send(); wake() }
  function reset() { goTo(0, 3); drag = null; panTarget = 0; closeView = true; wake() }
  function setOrbit(value) { closeView = !value; wake() }
  function send() {
    const progress = Math.round(current * 100)
    const phase = current > .87 ? 'overhead' : current > .06 ? 'folding' : 'street'
    const next = JSON.stringify([progress, auto, closeView, phase])
    if (next !== last) { last = next; report({ progress, auto, orbit: !closeView, phase, buildings: buildingCount }) }
  }
  function poseCamera() {
    const p = current * current * (3 - 2 * current)
    const portrait = studio.size.aspect < .8
    camera.fov = (portrait ? 66 : 56) + p * 8
    if (closeView) {
      camera.position.set(1.6 + pan * 2.8, 3.05 + p * 1.25, 14 + p * 1.5)
      camera.lookAt(pan * 1.4 - 2.2, 9 + p * 27, -70 + p * 14)
    } else {
      camera.position.set(105 + pan * 20, 78, 80); camera.lookAt(0, 25, -55); camera.fov = 55
    }
    camera.updateProjectionMatrix()
  }
  listen(canvas, 'pointerdown', (e) => {
    if (drag || e.button !== 0) return
    audio?.unlock(); auto = false; journey = null
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; wake()
  })
  listen(canvas, 'pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return
    target = clampFold(target + (drag.y - e.clientY) / Math.max(300, studio.size.h * .63))
    panTarget = Math.max(-1, Math.min(1, panTarget + (e.clientX - drag.x) / Math.max(250, studio.size.w * 1.7)))
    drag.x = e.clientX; drag.y = e.clientY; wake()
  })
  function release(e) { if (drag?.id === e.pointerId) { drag = null; canvas.style.cursor = 'grab'; send(); wake() } }
  listen(canvas, 'pointerup', release); listen(canvas, 'pointercancel', release); listen(canvas, 'lostpointercapture', release)
  listen(canvas, 'wheel', (e) => { e.preventDefault(); setProgress(target + e.deltaY * .0012) }, { passive: false })
  listen(canvas, 'keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(e.key)) {
      e.preventDefault()
      if (e.key === ' ') toggleFold()
      else if (e.key === 'Home') setProgress(0)
      else if (e.key === 'End') setProgress(1)
      else setProgress(target + (e.key === 'ArrowUp' ? .08 : -.08))
    }
  })
  updateCity()
  studio.start((dt) => {
    time += dt
    if (journey) {
      journey.t += dt
      const t = Math.min(1, journey.t/journey.duration)
      target = THREE.MathUtils.lerp(journey.from, journey.to, easeJourney(t))
      if (t === 1) journey = null
    }
    if (auto) {
      autoTime += dt
      const t = autoTime % 15.6
      target = t < 6 ? easeJourney(t / 6) : t < 8 ? 1 : t < 14 ? 1 - easeJourney((t - 8) / 6) : 0
    }
    const moving = advanceFold(state, target, dt, reduced.matches)
    const mean = state.angles.slice(FIRST_HINGE).reduce((a, b) => a + b, 0) / ((DISTRICTS - FIRST_HINGE) * MAX_HINGE)
    const a = reduced.matches ? 1 : 1 - Math.exp(-dt * 7)
    current += (mean - current) * a; pan += (panTarget - pan) * a
    if (moving || reduced.matches || Math.abs(current - mean) > .00001) updateCity()
    poseCamera()
    // The closing canopy itself casts the changing shade on the street.
    const enclosure = Math.max(0, (current - .55) / .45)
    hemi.intensity = 1.15 - enclosure * .32
    renderer.toneMappingExposure = 1.12 + enclosure * .10
    grade.uniforms.time.value = time
    composer.render(dt)
    const speed = state.speeds.reduce((a, b) => a + Math.abs(b), 0)
    audio?.motion(speed < .004 ? 0 : Math.min(.35, speed * .18))
    send()
    return auto || !!journey || moving || !!drag || Math.abs(current - mean) > .00003 || Math.abs(panTarget - pan) > .0001
  }, (size) => { camera.aspect = size.aspect; poseCamera(); composer.setSize(size.w, size.h) })
  return { setProgress, toggleFold, toggleAuto, setOrbit, reset, dispose() {
    if (disposed) return; disposed = true
    audio?.motion(0)
    renderPass.dispose(); grade.dispose(); output.dispose(); composer.dispose(); tex.dispose(); studio.disposeScenes([scene]); studio.dispose()
  } }
}
