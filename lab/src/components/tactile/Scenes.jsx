import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { clamp, createMembrane, resetMembrane, spring, stepMembrane, releaseMembrane } from './physics.mjs'

const ACCENT = '#2A4BFF' // Daily Lab 포인트 색(코발트). 장면마다 한 군데만 쓴다
const INK = '#17171B'
const rayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.12)

// No HDR downloads: the reflections are generated once from local geometry.
export function Studio({ wake, small, fit = 1 }) {
  const { gl, scene, camera, size, invalidate } = useThree()
  useEffect(() => {
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(gl)
    const target = pmrem.fromScene(room, 0.04)
    scene.environment = target.texture
    scene.environmentIntensity = 0.55
    wake.current = invalidate
    invalidate()
    return () => {
      scene.environment = null
      target.dispose()
      room.dispose()
      pmrem.dispose()
      wake.current = null
    }
  }, [gl, scene, invalidate, wake])
  useEffect(() => {
    camera.position.set(...(small ? [2.5, 10, 5.5] : [6, 8.5, 9]))
    camera.lookAt(0, 0, 0)
    camera.zoom = Math.min(size.width / (small ? 6.6 : 7.1), size.height / 6.1) * fit // 방에서는 틀이 들어갈 자리를 남긴다
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, fit, invalidate, small])
  return <>
    <ambientLight intensity={0.15} />
    <hemisphereLight args={['#ffffff', '#bdbdba', 0.5]} />
    <directionalLight position={[-3, 8, 4]} intensity={2.1} castShadow
      shadow-mapSize-width={small ? 512 : 1024} shadow-mapSize-height={small ? 512 : 1024}
      shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5}
      shadow-camera-near={0.5} shadow-camera-far={25}
      shadow-normalBias={0.02} shadow-bias={0.0001} shadow-radius={4} />
    <directionalLight position={[5, 3, -4]} intensity={0.65} color="#e6ebff" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <shadowMaterial transparent opacity={0.13} />
    </mesh>
  </>
}

function Tray({ membrane = false }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(membrane ? 5.05 : 4.94, 0.3, membrane ? 5.05 : 4.94, 3, 0.14), [membrane])
  return <mesh geometry={geometry} position={[0, -0.15, 0]} receiveShadow castShadow>
    <meshStandardMaterial color={membrane ? '#3b3e44' : '#25282f'} roughness={0.34} metalness={0.35} />
  </mesh>
}

function localPoint(event, out) {
  event.ray.intersectPlane(rayPlane, out)
  out.x = clamp(out.x, -3.3, 3.3)
  out.z = clamp(out.z, -3.3, 3.3)
  return out
}

function capture(event) {
  event.stopPropagation()
  event.target.setPointerCapture(event.pointerId)
}

function release(event) {
  event.stopPropagation()
  if (event.target.hasPointerCapture?.(event.pointerId)) event.target.releasePointerCapture(event.pointerId)
}

const tileHomes = Array.from({ length: 16 }, (_, i) => ({ x: (i % 4 - 1.5) * 1.075, z: (Math.floor(i / 4) - 1.5) * 1.075 }))
const newTiles = () => tileHomes.map(() => ({ attached: true, freeX: 0, freeZ: 0, y: 0, vy: 0, x: 0, vx: 0, z: 0, vz: 0, rx: 0, vrx: 0, rz: 0, vrz: 0 }))

export function TileScene({ demo, reset, reduced, onGrab, audio }) {
  const groups = useRef([]), state = useRef(newTiles()), drag = useRef(null), hover = useRef(null), demoStart = useRef(null)
  const point = useMemo(() => new THREE.Vector3(), [])
  const { invalidate } = useThree()
  const geometry = useMemo(() => new RoundedBoxGeometry(.98, .28, .98, 4, .065), [])
  const slotGeometry = useMemo(() => new RoundedBoxGeometry(.22, .005, .023, 2, .008), [])
  useEffect(() => { if (demo) { demoStart.current = performance.now(); drag.current = null; invalidate() } }, [demo, invalidate])
  useEffect(() => { state.current = newTiles(); drag.current = hover.current = demoStart.current = null; onGrab(false); invalidate() }, [reset, onGrab, invalidate])

  useFrame((_, elapsed) => {
    const dt = Math.min(elapsed, 1 / 30)
    let held = drag.current
    if (demoStart.current !== null) {
      const t = (performance.now() - demoStart.current) / 1000
      if (t < 3.2) {
        const lift = t < 1.1 ? Math.sin(t / 1.1 * Math.PI / 2) : t < 2 ? 1 : Math.max(0, 1 - (t - 2) / 1.2)
        held = { index: 6, x: tileHomes[6].x + Math.sin(t / 3.2 * Math.PI) * .22, z: tileHomes[6].z, lift: lift * 1.3, detached: t > .26 }
      } else { state.current[6].attached = true; demoStart.current = null }
    }
    let energy = 0
    state.current.forEach((s, i) => {
      const home = tileHomes[i], holding = held?.index === i
      const attached = s.attached !== false
      let tx = attached ? 0 : s.freeX, tz = attached ? 0 : s.freeZ, ty = attached ? 0 : -.405
      let rx = 0, rz = 0
      if (holding) {
        const dx = held.x - home.x, dz = held.z - home.z
        if (held.detached) { tx = dx; tz = dz; ty = held.lift; rx = dz * .09; rz = -dx * .09 }
        else { tx = clamp(dx, -.09, .09); tz = clamp(dz, -.09, .09); ty = Math.min(.08, held.lift * .22); rx = dz * .16; rz = -dx * .16 }
      } else if (attached && hover.current) {
        const d = Math.hypot(home.x - hover.current.x, home.z - hover.current.z)
        ty = -.045 * Math.exp(-d * d / .28)
        rx = clamp((hover.current.z - home.z) * Math.exp(-d * d) * .12, -.1, .1)
        rz = clamp(-(hover.current.x - home.x) * Math.exp(-d * d) * .12, -.1, .1)
      }
      if (!holding && !attached) {
        // Free tiles settle beside their neighbours, never through them.
        let x = home.x + tx, z = home.z + tz
        for (let j = 0; j < tileHomes.length; j++) {
          if (j === i) continue
          const other = state.current[j], ox = tileHomes[j].x + other.x, oz = tileHomes[j].z + other.z
          const dx = x - ox, dz = z - oz
          if (Math.abs(dx) < 1.03 && Math.abs(dz) < 1.03) {
            if (Math.abs(dx) > Math.abs(dz)) x = ox + Math.sign(dx || home.x || 1) * 1.035
            else z = oz + Math.sign(dz || home.z || 1) * 1.035
          }
        }
        if (Math.abs(x) < 3.02 && Math.abs(z) < 3.02) {
          if (Math.abs(x) > Math.abs(z)) x = Math.sign(x || 1) * 3.02
          else z = Math.sign(z || 1) * 3.02
        }
        s.freeX = tx = clamp(x, -3.25, 3.25) - home.x
        s.freeZ = tz = clamp(z, -3.25, 3.25) - home.z
      }
      if (reduced) { s.y = ty; s.x = tx; s.z = tz; s.rx = rx; s.rz = rz; s.vy = s.vx = s.vz = s.vrx = s.vrz = 0 }
      else {
        ;[s.y, s.vy] = spring(s.y, s.vy, ty, holding ? 420 : 600, holding ? 32 : 35, dt)
        ;[s.x, s.vx] = spring(s.x, s.vx, tx, 450, 34, dt)
        ;[s.z, s.vz] = spring(s.z, s.vz, tz, 450, 34, dt)
        ;[s.rx, s.vrx] = spring(s.rx, s.vrx, rx, 240, 24, dt)
        ;[s.rz, s.vrz] = spring(s.rz, s.vrz, rz, 240, 24, dt)
      }
      if (!holding && s.armed && s.y < .025) { audio?.play('click', { gain: .45, rate: .85, pan: home.x * .2 }); s.armed = false }
      const stop = attached || holding ? -.052 : -.405
      if (s.y < stop) { s.y = stop; s.vy = Math.max(0, -s.vy * .15) }
      if (groups.current[i]) { groups.current[i].position.set(home.x + s.x, .225 + s.y, home.z + s.z); groups.current[i].rotation.set(s.rx, 0, s.rz) }
      energy += Math.abs(s.y - ty) + Math.abs(s.vy) + Math.abs(s.x - tx) + Math.abs(s.vx) + Math.abs(s.z - tz) + Math.abs(s.vz) + Math.abs(s.rx - rx) + Math.abs(s.vrx) + Math.abs(s.rz - rz) + Math.abs(s.vrz)
    })
    if ((!reduced && energy > .004) || demoStart.current !== null) invalidate()
  })
  function end(event) {
    const d = drag.current
    if (d) {
      const s = state.current[d.index], home = tileHomes[d.index]
      s.attached = Math.hypot(d.x - home.x, d.z - home.z) < .72
      s.freeX = d.x - home.x; s.freeZ = d.z - home.z; s.armed = d.detached
    }
    release(event); drag.current = hover.current = null; onGrab(false); invalidate()
  }
  return <>
    <Tray />
    {tileHomes.map((home, i) => <group key={i}>
      <mesh position={[home.x, .005, home.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.025, 1.025]} /><meshStandardMaterial color="#111319" roughness={.6} />
      </mesh>
      <mesh position={[home.x, .022, home.z]}><cylinderGeometry args={[.14, .14, .025, 32]} /><meshStandardMaterial color="#777e87" metalness={.9} roughness={.24} /></mesh>
      <group ref={(node) => { groups.current[i] = node }} position={[home.x, .225, home.z]}>
        <mesh geometry={geometry} receiveShadow castShadow><meshPhysicalMaterial color={i === 6 ? ACCENT : '#eeeee8'} roughness={.29} metalness={i === 6 ? .22 : .04} clearcoat={.7} clearcoatRoughness={.23} /></mesh>
        <mesh geometry={slotGeometry} position={[0, .142, .24]}><meshStandardMaterial color={i === 6 ? '#9aafff' : '#b7b8b2'} roughness={.5} /></mesh>
        <mesh position={[0, -.145, 0]}><cylinderGeometry args={[.14, .14, .018, 32]} /><meshStandardMaterial color="#969ca4" metalness={.9} roughness={.2} /></mesh>
      </group>
    </group>)}
    <mesh position={[0, .1, 0]} rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        if (drag.current || event.button !== 0) return
        capture(event); audio?.unlock(); demoStart.current = null
        const p = localPoint(event, point)
        let index = 0, best = Infinity
        state.current.forEach((s, i) => { const dist = Math.hypot(tileHomes[i].x + s.x - p.x, tileHomes[i].z + s.z - p.z); if (dist < best) { best = dist; index = i } })
        if (best > .8) { release(event); return }
        const s = state.current[index], h = tileHomes[index]
        drag.current = { index, x: h.x + s.x, z: h.z + s.z, offsetX: h.x + s.x - p.x, offsetZ: h.z + s.z - p.z, lift: s.y, startLift: s.y, clientY: event.nativeEvent.clientY, detached: s.attached === false, pointerId: event.pointerId }
        onGrab(true); invalidate()
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        const p = localPoint(event, point)
        if (drag.current) {
          const d = drag.current
          if (d.pointerId !== event.pointerId) return
          d.x = p.x + d.offsetX; d.z = p.z + d.offsetZ
          d.lift = clamp(d.startLift + (d.clientY - event.nativeEvent.clientY) * .009 + Math.hypot(d.x - tileHomes[d.index].x, d.z - tileHomes[d.index].z) * .2, -.405, 1.65)
          if (!d.detached && (d.lift > .28 || Math.hypot(d.x - tileHomes[d.index].x, d.z - tileHomes[d.index].z) > .35)) {
            d.detached = true; audio?.play('click', { gain: .16, rate: 1.5 })
          }
        } else hover.current = { x: p.x, z: p.z }
        invalidate()
      }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={(event) => { if (drag.current) end(event) }}
      onPointerOut={() => { if (!drag.current) { hover.current = null; invalidate() } }}>
      <planeGeometry args={[8, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide} />
    </mesh>
  </>
}

export function MembraneScene({ demo, reset, reduced, onGrab, audio }) {
  const { invalidate, camera } = useThree()
  const sim = useMemo(() => createMembrane(), [])
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(sim.width, sim.width, sim.n - 1, sim.n - 1)
    g.rotateX(-Math.PI / 2)
    g.attributes.position.setUsage(THREE.DynamicDrawUsage)
    return g
  }, [sim])
  const rest = useMemo(() => new Float32Array(geometry.attributes.position.array), [geometry])
  const grab = useRef(null)
  const dragPlane = useMemo(() => new THREE.Plane(), [])
  const surfaceMaterial = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({ color: INK, roughness: .39, metalness: .12, clearcoat: .6, clearcoatRoughness: .22, side: THREE.DoubleSide })
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec2 vWeave; varying float vLift;\n" + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvWeave = uv; vLift = position.y;")
      shader.fragmentShader = "varying vec2 vWeave; varying float vLift;\n" + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        vec2 g = abs(fract(vWeave * 22.0 - .5) - .5) / max(fwidth(vWeave * 22.0), vec2(.001));
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float stretch = smoothstep(.16, 1.35, vLift);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24,.27,.31), line * .25);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.025,.09,.65), stretch * .6);
      `)
    }
    return material
  }, [])
  useEffect(() => () => surfaceMaterial.dispose(), [surfaceMaterial])
  const demoStart = useRef(null)
  const point = useMemo(() => new THREE.Vector3(), [])
  const settled = useRef(false)
  const mark = useRef()

  useEffect(() => {
    if (demo) { demoStart.current = performance.now(); grab.current = null; settled.current = false; invalidate() }
  }, [demo, invalidate])
  useEffect(() => {
    resetMembrane(sim)
    grab.current = null
    demoStart.current = null
    settled.current = false
    onGrab(false)
    invalidate()
  }, [reset, sim, onGrab, invalidate])

  useFrame((_, elapsed) => {
    let held = grab.current
    if (demoStart.current !== null) {
      const t = (performance.now() - demoStart.current) / 1000
      if (t < 3.5) {
        const rise = Math.sin(Math.min(t / 0.7, 1) * Math.PI / 2)
        held = { x: 0.35, z: 0.15, dx: Math.sin(t * 2.2) * 0.4, dz: -rise * 0.2, lift: rise * 1.65 }
      } else demoStart.current = null
    }
    const energy = stepMembrane(sim, Math.min(elapsed, 1 / 30), held, reduced)
    if (!held && energy < 0.00003 && !settled.current) { resetMembrane(sim); settled.current = true }
    if (held) settled.current = false
    const positions = geometry.attributes.position.array
    for (let i = 0; i < sim.n * sim.n; i++) {
      const x = rest[i * 3], z = rest[i * 3 + 2]
      const k = i
      const sag = -0.035 * Math.cos(x / sim.width * Math.PI) * Math.cos(z / sim.width * Math.PI)
      positions[i * 3] = x + sim.offsets[0][k]
      positions[i * 3 + 1] = 0.12 + sag + sim.offsets[1][k]
      positions[i * 3 + 2] = z + sim.offsets[2][k]
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
    // Bounds must include the pulled surface for correct picking and frustum culling.
    geometry.computeBoundingSphere()
    if (mark.current) {
      mark.current.visible = !held && energy < 0.002
    }
    if ((!reduced && energy > 0.00003) || demoStart.current !== null) invalidate()
  })

  function end(event) {
    if (grab.current) audio?.play('impact', { gain: .08, rate: .55 })
    releaseMembrane(sim, grab.current, reduced)
    release(event)
    grab.current = null
    onGrab(false)
    invalidate()
  }

  return <>
    <Tray membrane />
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => <mesh key={`${x}-${z}`} position={[x * 2.36, .014, z * 2.36]}>
      <cylinderGeometry args={[.045, .045, .012, 16]} /><meshStandardMaterial color="#a2a4a6" roughness={.28} metalness={.9} />
    </mesh>))}
    <mesh position={[0, -0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[7, 7]} />
      <shaderMaterial transparent depthWrite={false}
        vertexShader={'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'}
        fragmentShader={'varying vec2 vUv; void main(){ vec2 p=(vUv-0.5)*3.0; float a=0.13*exp(-dot(p,p)*2.5); gl_FragColor=vec4(0.18,0.29,0.24,a); }'} />
    </mesh>
    <mesh geometry={geometry} receiveShadow
      onPointerDown={(event) => {
        if (grab.current || event.button !== 0) return
        capture(event)
        audio?.unlock()
        demoStart.current = null
        const x = clamp((event.uv.x - .5) * sim.width, -1.95, 1.95)
        const z = clamp((.5 - event.uv.y) * sim.width, -1.95, 1.95)
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), event.point)
        const base = .12 - .035 * Math.cos(x / sim.width * Math.PI) * Math.cos(z / sim.width * Math.PI)
        grab.current = { x, z, dx: event.point.x - x, dz: event.point.z - z, lift: event.point.y - base, base, last: performance.now(), speed: [0, 0, 0], pointerId: event.pointerId }
        onGrab(true)
        settled.current = false
        invalidate()
      }}
      onPointerMove={(event) => {
        if (!grab.current || grab.current.pointerId !== event.pointerId) return
        event.stopPropagation()
        if (!event.ray.intersectPlane(dragPlane, point)) return
        const g = grab.current
        const next = [clamp(point.x - g.x, -.85, .85), clamp(point.y - g.base, -.3, 1.85), clamp(point.z - g.z, -.85, .85)]
        const now = performance.now(), dt = Math.max(.016, (now - g.last) / 1000)
        const before = [g.dx, g.lift, g.dz]
        g.speed = next.map((v, i) => g.speed[i] * .5 + (v - before[i]) / dt * .5)
        ;[g.dx, g.lift, g.dz] = next
        if (now - (g.soundAt || 0) > 110 && Math.hypot(...g.speed) > .25) {
          audio?.play('rub', { gain: Math.min(.17, Math.hypot(...g.speed) * .025), rate: .7, offset: .1, duration: .13, fade: .025 }); g.soundAt = now
        }
        g.last = now
        invalidate()
      }}
      onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={() => { grab.current = null; onGrab(false); invalidate() }}>
      <primitive object={surfaceMaterial} attach="material" />
    </mesh>
    <group ref={mark} position={[0, 0.094, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><ringGeometry args={[0.09, 0.102, 48]} /><meshBasicMaterial color="#8fa2ff" transparent opacity={0.85} depthWrite={false} /></mesh>
      <mesh><circleGeometry args={[0.018, 16]} /><meshBasicMaterial color="#e8ebff" /></mesh>
    </group>
  </>
}
