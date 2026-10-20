import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMembrane, stepMembrane, spring } from './physics.mjs'

const grab = { x: 0.4, z: -0.2, dx: 0.8, dz: -0.7, lift: 1.85 }

for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.1]) {
  test(`membrane stays bounded, pins all edges, and settles after release (dt=${dt})`, () => {
    const state = createMembrane()
    for (let i = 0; i < 300; i++) stepMembrane(state, dt, grab)
    assert.ok(Math.max(...state.offsets[1]) > 1, 'A pull must visibly lift the membrane')
    for (const axis of state.offsets) {
      assert.ok(axis.every(Number.isFinite))
      assert.ok(axis.every((v) => Math.abs(v) < 2))
      for (let i = 0; i < state.n; i++) {
        assert.equal(axis[i], 0)
        assert.equal(axis[(state.n - 1) * state.n + i], 0)
        assert.equal(axis[i * state.n], 0)
        assert.equal(axis[i * state.n + state.n - 1], 0)
      }
    }
    let energy
    for (let i = 0; i < 1500; i++) energy = stepMembrane(state, dt, null)
    assert.ok(energy < 0.00001, `Release must settle; residual energy ${energy}`)
  })
}

test('reduced motion keeps direct manipulation but removes residual oscillation', () => {
  const state = createMembrane()
  stepMembrane(state, 1 / 60, grab, true)
  assert.ok(state.offsets[1].some((v) => v > 0.1))
  stepMembrane(state, 1 / 60, null, true)
  assert.ok(state.offsets.every((a) => a.every((v) => v === 0)))
  assert.ok(state.velocities.every((a) => a.every((v) => v === 0)))
})

test('tile returns to the magnet after a release at different frame rates', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.1]) {
    let position = 1.4, velocity = 4
    for (let t = 0; t < 6; t += dt) [position, velocity] = spring(position, velocity, 0, 210, 12, dt)
    assert.ok(Math.abs(position) < 1e-6)
    assert.ok(Math.abs(velocity) < 1e-5)
  }
})
