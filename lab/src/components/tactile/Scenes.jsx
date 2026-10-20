import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { clamp, createMembrane, resetMembrane, spring, stepMembrane } from './physics.mjs'

const TEAL = '#064a43'
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
    camera.zoom = Math.min(size.width / 7.1, size.height / 6.1) * fit // 방에서는 틀이 들어갈 자리를 남긴다
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, fit, invalidate])
  return <>
    <ambientLight intensity={0.15} />
    <hemisphereLight args={['#ffffff', '#afc7bf', 0.5]} />
    <directionalLight position={[-3, 8, 4]} intensity={2.1} castShadow
      shadow-mapSize-width={small ? 512 : 1024} shadow-mapSize-height={small ? 512 : 1024}
      shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5}
      shadow-camera-near={0.5} shadow-camera-far={25}
      shadow-normalBias={0.02} shadow-bias={0.0001} shadow-radius={4} />
    <directionalLight position={[5, 3, -4]} intensity={0.65} color="#d7fff5" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <shadowMaterial transparent opacity={0.13} />
    </mesh>
  </>
}

function Tray({ membrane = false }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(membrane ? 5.05 : 4.94, 0.3, membrane ? 5.05 : 4.94, 3, 0.14), [membrane])
  return <mesh geometry={geometry} position={[0, -0.15, 0]} receiveShadow castShadow>
    <meshStandardMaterial color={membrane ? '#edf4f0' : '#dbece5'} roughness={0.35} metalness={0.04} />
  </mesh>
}

function localPoint(event, out) {
  event.ray.intersectPlane(rayPlane, out)
  out.x = clamp(out.x, -2.25, 2.25)
  out.z = clamp(out.z, -2.25, 2.25)
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
const nearestTile = (p) => clamp(Math.round(p.z / 1.075 + 1.5), 0, 3) * 4 + clamp(Math.round(p.x / 1.075 + 1.5), 0, 3)
const newTiles = () => tileHomes.map(() => ({ y: 0, vy: 0, x: 0, vx: 0, z: 0, vz: 0, rx: 0, vrx: 0, rz: 0, vrz: 0 }))

export function TileScene({ demo, reset, reduced, onGrab }) {
  const groups = useRef([])
  const state = useRef(newTiles())
  const drag = useRef(null)
  const hover = useRef(null)
  const demoStart = useRef(null)
  const seenTile = useRef(-1)
  const point = useMemo(() => new THREE.Vector3(), [])
  const { invalidate } = useThree()
  const geometry = useMemo(() => new RoundedBoxGeometry(0.99, 0.33, 0.99, 3, 0.09), [])
  const slotGeometry = useMemo(() => new RoundedBoxGeometry(0.21, 0.006, 0.025, 2, 0.009), [])

  useEffect(() => {
    if (demo) { demoStart.current = performance.now(); drag.current = null; invalidate() }
  }, [demo, invalidate])
  useEffect(() => {
    state.current = newTiles()
    drag.current = null
    hover.current = null
    demoStart.current = null
    seenTile.current = -1
    onGrab(false)
    invalidate()
  }, [reset, onGrab, invalidate])

  function pulse(p, strength = 1) {
    if (reduced) return
    const index = nearestTile(p)
    if (index === seenTile.current) return
    seenTile.current = index
    tileHomes.forEach((home, i) => {
      const d = Math.hypot(home.x - p.x, home.z - p.z)
      state.current[i].vy += Math.exp(-d * d / 1.1) * strength * 2.7
    })
  }

  useFrame((_, elapsed) => {
    const dt = Math.min(elapsed, 1 / 30)
    let grabbed = drag.current
    let over = hover.current
    if (demoStart.current !== null) {
      const t = (performance.now() - demoStart.current) / 1000
      if (t < 1.55) {
        over = { x: -1.7 + t * 2.3, z: Math.sin(t * 3.4) * 1.2 }
        pulse(over, 0.8)
      } else if (t < 3.8) {
        const amount = Math.sin(Math.min((t - 1.55) / 0.6, 1) * Math.PI / 2)
        grabbed = { index: 6, x: tileHomes[6].x + amount * 0.45, z: tileHomes[6].z, lift: amount * 1.05 }
      } else { demoStart.current = null; seenTile.current = -1 }
    }
    let energy = 0
    state.current.forEach((s, i) => {
      const home = tileHomes[i]
      const held = grabbed?.index === i
      const distance = over ? Math.hypot(over.x - home.x, over.z - home.z) : 100
      const depression = -0.065 * Math.exp(-distance * distance / 0.3)
      const targetY = held ? grabbed.lift : depression
      const targetX = held ? clamp(grabbed.x - home.x, -0.7, 0.7) : 0
      const targetZ = held ? clamp(grabbed.z - home.z, -0.7, 0.7) : 0
      const targetRX = held ? targetZ * 0.28 : over ? clamp((over.z - home.z) * Math.exp(-distance * distance) * 0.1, -0.1, 0.1) : 0
      const targetRZ = held ? -targetX * 0.28 : over ? clamp(-(over.x - home.x) * Math.exp(-distance * distance) * 0.1, -0.1, 0.1) : 0
      if (reduced) {
        s.y = targetY; s.x = targetX; s.z = targetZ; s.rx = targetRX; s.rz = targetRZ
        s.vy = s.vx = s.vz = s.vrx = s.vrz = 0
      } else {
        ;[s.y, s.vy] = spring(s.y, s.vy, targetY, held ? 260 : 210, held ? 23 : 12, dt)
        ;[s.x, s.vx] = spring(s.x, s.vx, targetX, 240, held ? 24 : 15, dt)
        ;[s.z, s.vz] = spring(s.z, s.vz, targetZ, 240, held ? 24 : 15, dt)
        ;[s.rx, s.vrx] = spring(s.rx, s.vrx, targetRX, 180, 13, dt)
        ;[s.rz, s.vrz] = spring(s.rz, s.vrz, targetRZ, 180, 13, dt)
      }
      // The tray is a physical stop. Rebound is deliberately small and crisp.
      if (s.y < -0.07) { s.y = -0.07; s.vy = Math.max(0, -s.vy * 0.3) }
      const g = groups.current[i]
      if (g) {
        g.position.set(home.x + s.x, 0.265 + s.y, home.z + s.z)
        g.rotation.set(s.rx, 0, s.rz)
      }
      energy += Math.abs(s.y - targetY) + Math.abs(s.vy) + Math.abs(s.x - targetX) + Math.abs(s.vx) + Math.abs(s.z - targetZ) + Math.abs(s.vz) + Math.abs(s.rx - targetRX) + Math.abs(s.vrx) + Math.abs(s.rz - targetRZ) + Math.abs(s.vrz)
    })
    if ((!reduced && energy > 0.003) || demoStart.current !== null) invalidate()
  })

  function end(event) {
    release(event)
    drag.current = null
    hover.current = null
    seenTile.current = -1
    onGrab(false)
    invalidate()
  }

  return <>
    <Tray />
    {tileHomes.map((home, i) => <group key={i} ref={(node) => { groups.current[i] = node }} position={[home.x, 0.265, home.z]}>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshPhysicalMaterial color={i === 6 ? TEAL : '#fafbf5'} roughness={0.27} metalness={i === 6 ? 0.25 : 0.02}
          clearcoat={0.5} clearcoatRoughness={0.24} />
      </mesh>
      <mesh geometry={slotGeometry} position={[0, 0.168, 0.25]}>
        <meshStandardMaterial color={i === 6 ? '#72b9ac' : '#c2d5cc'} roughness={0.4} />
      </mesh>
    </group>)}
    <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        if (drag.current || event.button !== 0) return
        capture(event)
        demoStart.current = null
        const p = localPoint(event, point)
        const index = nearestTile(p)
        drag.current = { index, x: p.x, z: p.z, lift: 0.35, startX: p.x, startZ: p.z, clientY: event.nativeEvent.clientY, pointerId: event.pointerId }
        hover.current = { x: p.x, z: p.z }
        pulse(p)
        onGrab(true)
        invalidate()
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        if (drag.current && drag.current.pointerId !== event.pointerId) return
        const p = localPoint(event, point)
        hover.current = { x: p.x, z: p.z }
        if (drag.current) {
          const d = drag.current
          d.x = p.x; d.z = p.z
          d.lift = clamp(0.35 + Math.hypot(p.x - d.startX, p.z - d.startZ) * 0.35 + (d.clientY - event.nativeEvent.clientY) * 0.004, 0.2, 1.4)
          pulse(p, 0.6)
        }
        invalidate()
      }}
      onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={() => { drag.current = null; hover.current = null; onGrab(false); invalidate() }}
      onPointerOut={() => { if (!drag.current) { hover.current = null; seenTile.current = -1; invalidate() } }}>
      <planeGeometry args={[5.5, 5.5]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide} />
    </mesh>
  </>
}

export function MembraneScene({ demo, reset, reduced, onGrab }) {
  const { invalidate } = useThree()
  const sim = useMemo(() => createMembrane(), [])
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(sim.width, sim.width, sim.n - 1, sim.n - 1)
    g.rotateX(-Math.PI / 2)
    g.attributes.position.setUsage(THREE.DynamicDrawUsage)
    return g
  }, [sim])
  const rest = useMemo(() => new Float32Array(geometry.attributes.position.array), [geometry])
  const grab = useRef(null)
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
    release(event)
    grab.current = null
    onGrab(false)
    invalidate()
  }

  return <>
    <Tray membrane />
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
        demoStart.current = null
        // Anchor on the actual surface, then project subsequent drags onto a fixed plane.
        const x = clamp(event.point.x, -1.75, 1.75)
        const z = clamp(event.point.z, -1.75, 1.75)
        const p = localPoint(event, point)
        grab.current = { x, z, dx: 0, dz: 0, lift: 0.4, startX: p.x, startZ: p.z, clientY: event.nativeEvent.clientY, pointerId: event.pointerId }
        onGrab(true)
        settled.current = false
        invalidate()
      }}
      onPointerMove={(event) => {
        if (!grab.current || grab.current.pointerId !== event.pointerId) return
        event.stopPropagation()
        const p = localPoint(event, point)
        const g = grab.current
        g.dx = clamp((p.x - g.startX) * 0.55, -0.85, 0.85)
        g.dz = clamp((p.z - g.startZ) * 0.55, -0.85, 0.85)
        const travel = Math.hypot(p.x - g.startX, p.z - g.startZ)
        g.lift = clamp(0.4 + (g.clientY - event.nativeEvent.clientY) * 0.012 + travel * 0.3, -0.3, 1.85)
        invalidate()
      }}
      onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={() => { grab.current = null; onGrab(false); invalidate() }}>
      <meshPhysicalMaterial color={TEAL} roughness={0.34} metalness={0.26} clearcoat={0.32} clearcoatRoughness={0.3}
        sheen={0.65} sheenColor="#71a99a" sheenRoughness={0.6} side={THREE.DoubleSide} />
    </mesh>
    <group ref={mark} position={[0, 0.094, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><ringGeometry args={[0.09, 0.102, 48]} /><meshBasicMaterial color="#94c7ba" transparent opacity={0.8} depthWrite={false} /></mesh>
      <mesh><circleGeometry args={[0.018, 16]} /><meshBasicMaterial color="#b9dfd4" /></mesh>
    </group>
  </>
}
