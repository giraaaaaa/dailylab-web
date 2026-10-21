import * as THREE from 'three'

export const DISTRICTS = 12
export const BLOCK_LENGTH = 18
export const FIRST_HINGE = 4
export const MAX_HINGE = .465
export const clampFold = (p) => Math.max(0, Math.min(1, p))
const ease = (t) => { t = clampFold(t); return t * t * (3 - 2 * t) }

export function hingeTargets(progress) {
  return Array.from({ length: DISTRICTS }, (_, i) => {
    if (i < FIRST_HINGE) return 0
    const onset = (DISTRICTS - 1 - i) * .043
    return MAX_HINGE * ease((clampFold(progress) - onset) / (1 - onset))
  })
}

export function createFoldState() {
  return { angles: new Float64Array(DISTRICTS), speeds: new Float64Array(DISTRICTS) }
}

export function advanceFold(state, progress, elapsed, reduced = false) {
  const targets = hingeTargets(progress)
  if (reduced) { state.angles.set(targets); state.speeds.fill(0); return false }
  const dt = Math.min(Math.max(0, elapsed), .05)
  const steps = Math.max(1, Math.ceil(dt * 180)), h = dt / steps
  for (let j = 0; j < steps; j++) for (let i = FIRST_HINGE; i < DISTRICTS; i++) {
    state.speeds[i] += ((targets[i] - state.angles[i]) * 155 - state.speeds[i] * 26) * h
    state.angles[i] = Math.max(0, Math.min(MAX_HINGE, state.angles[i] + state.speeds[i] * h))
  }
  return targets.some((t, i) => Math.abs(t - state.angles[i]) > .000015 || Math.abs(state.speeds[i]) > .00015)
}

export function districtFrames(angles, out = Array.from({ length: DISTRICTS }, () => new THREE.Matrix4())) {
  let y = 0, z = 24, angle = 0
  for (let i = 0; i < DISTRICTS; i++) {
    angle += angles[i]
    out[i].makeRotationX(angle).setPosition(0, y, z)
    y += Math.sin(angle) * BLOCK_LENGTH
    z -= Math.cos(angle) * BLOCK_LENGTH
  }
  return out
}
