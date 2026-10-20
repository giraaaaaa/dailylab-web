import * as THREE from 'three'

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t) }
export const turn = new THREE.Matrix4().makeRotationY(Math.PI)

// A camera travels from the entry's coordinate frame through to the exit's frame.
export function portalTransform(entry, exit, out = new THREE.Matrix4()) {
  return out.copy(exit).multiply(turn).multiply(new THREE.Matrix4().copy(entry).invert())
}

// Two opposite walls and their roof form a parallelogram linkage: wall length is invariant.
export function foldPose(progress, height, delay = 0) {
  const t = smooth((progress - delay) / (1 - delay))
  const angle = t * Math.PI / 2
  return { angle, rise: Math.sin(angle) * height, drift: Math.cos(angle) * height }
}

export function cityLots() {
  const lots = []
  for (let row = -4; row <= 4; row++) for (let col = -4; col <= 4; col++) {
    if (row === 0 || col === 0) continue
    const seed = Math.abs(Math.sin(row * 127.1 + col * 311.7))
    const distance = Math.hypot(row, col)
    const height = 0.65 + seed * 1.8 + Math.max(0, 4.3 - distance) * 1.05
    lots.push({ x: col * 1.4, z: row * 1.4, w: 0.7 + seed * 0.27, d: 0.78 + (1 - seed) * 0.22,
      h: height, delay: (Math.abs(row) + Math.abs(col)) * 0.025, seed })
  }
  return lots
}
