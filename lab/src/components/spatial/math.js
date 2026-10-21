import * as THREE from 'three'

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t) }
export const turn = new THREE.Matrix4().makeRotationY(Math.PI)

// A camera travels from the entry's coordinate frame through to the exit's frame.
export function portalTransform(entry, exit, out = new THREE.Matrix4()) {
  return out.copy(exit).multiply(turn).multiply(new THREE.Matrix4().copy(entry).invert())
}
