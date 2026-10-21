// A pinned spring membrane. Positions are offsets from the rest grid, in world units.
// Fixed substeps keep the wave stable across pointer input and slower mobile frames.
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

export function createMembrane(n = 45, width = 4.4) {
  return {
    n, width, spacing: width / (n - 1),
    offsets: Array.from({ length: 3 }, () => new Float32Array(n * n)),
    velocities: Array.from({ length: 3 }, () => new Float32Array(n * n)),
  }
}

export function resetMembrane(s) {
  s.offsets.forEach((a) => a.fill(0))
  s.velocities.forEach((a) => a.fill(0))
}

export function stepMembrane(s, elapsed, grab, reduced = false) {
  const { n, width, spacing, offsets, velocities } = s
  const dt = clamp(elapsed, 0, 0.05)
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
  const h = dt / steps
  const coupling = 1.1 / (spacing * spacing)
  const damping = Math.exp(-3.6 * h)
  const pin = 1 - Math.exp(-100 * h)
  const target = grab ? [clamp(grab.dx, -0.85, 0.85), clamp(grab.lift, -0.5, 1.85), clamp(grab.dz, -0.85, 0.85)] : null

  if (reduced) {
    resetMembrane(s)
    if (grab) for (let row = 1; row < n - 1; row++) for (let col = 1; col < n - 1; col++) {
      const x = col * spacing - width / 2 - grab.x
      const z = row * spacing - width / 2 - grab.z
      const falloff = Math.exp(-(x * x + z * z) / 0.65)
      const edge = Math.sin(Math.PI * col / (n - 1)) * Math.sin(Math.PI * row / (n - 1))
      for (let axis = 0; axis < 3; axis++) offsets[axis][row * n + col] = target[axis] * falloff * edge
    }
    return 0
  }

  for (let step = 0; step < steps; step++) {
    // Read all old positions before updating any, to keep propagation symmetric.
    for (let axis = 0; axis < 3; axis++) {
      const q = offsets[axis], v = velocities[axis]
      for (let row = 1; row < n - 1; row++) for (let col = 1; col < n - 1; col++) {
        const i = row * n + col
        const lap = q[i - 1] + q[i + 1] + q[i - n] + q[i + n] - 4 * q[i]
        const strain = Math.abs(q[i + 1] - q[i - 1]) / (2 * spacing) + Math.abs(q[i + n] - q[i - n]) / (2 * spacing)
        const tension = 1 + Math.min(1.5, strain * .35)
        v[i] = (v[i] + (coupling * tension * lap - 3 * q[i]) * h) * damping
      }
      for (let row = 1; row < n - 1; row++) for (let col = 1; col < n - 1; col++) {
        const i = row * n + col
        q[i] += v[i] * h
      }
    }
    if (grab) for (let row = 1; row < n - 1; row++) for (let col = 1; col < n - 1; col++) {
      const x = col * spacing - width / 2 - grab.x
      const z = row * spacing - width / 2 - grab.z
      const weight = Math.exp(-(x * x + z * z) / 0.12) * pin
      if (weight < 0.0001) continue
      const i = row * n + col
      for (let axis = 0; axis < 3; axis++) {
        offsets[axis][i] += (target[axis] - offsets[axis][i]) * weight
        velocities[axis][i] *= 1 - weight
      }
    }
  }
  let energy = 0
  for (let axis = 0; axis < 3; axis++) for (let i = 0; i < n * n; i++) {
    energy += offsets[axis][i] ** 2 + velocities[axis][i] ** 2 * 0.002
  }
  return energy
}

export function releaseMembrane(s, grab, reduced = false) {
  if (!grab || reduced) return
  for (let row = 1; row < s.n - 1; row++) for (let col = 1; col < s.n - 1; col++) {
    const d = (col * s.spacing - s.width / 2 - grab.x) ** 2 + (row * s.spacing - s.width / 2 - grab.z) ** 2
    const w = Math.exp(-d / .16)
    const i = row * s.n + col
    for (let axis = 0; axis < 3; axis++) s.velocities[axis][i] += clamp(grab.speed?.[axis] || 0, -4, 4) * w * .6
  }
}

export function spring(value, velocity, target, stiffness, damping, dt) {
  const steps = Math.max(1, Math.ceil(Math.min(dt, 0.05) * 120))
  const h = Math.min(dt, 0.05) / steps
  for (let i = 0; i < steps; i++) {
    velocity += ((target - value) * stiffness - velocity * damping) * h
    value += velocity * h
  }
  return [value, velocity]
}
