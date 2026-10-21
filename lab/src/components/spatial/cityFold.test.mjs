import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { advanceFold, createFoldState, districtFrames, hingeTargets, DISTRICTS, FIRST_HINGE, BLOCK_LENGTH, MAX_HINGE } from './cityFold.js'

test('the street remains anchored while distant districts begin folding first', () => {
  assert.deepEqual(hingeTargets(0), Array(DISTRICTS).fill(0))
  assert.deepEqual(hingeTargets(1).slice(FIRST_HINGE), Array(8).fill(MAX_HINGE))
  const middle = hingeTargets(.35)
  assert.ok(middle.slice(0, FIRST_HINGE).every(x => x === 0))
  assert.ok(middle[11] > middle[8] && middle[8] > middle[4])
})

test('district seams remain connected and buildings retain rigid frames throughout the fold', () => {
  for (let p = 0; p <= 1; p += .01) {
    const frames = districtFrames(hingeTargets(p))
    for (let i = 0; i < DISTRICTS; i++) {
      assert.ok(Math.abs(frames[i].determinant() - 1) < 1e-9)
      if (i + 1 < DISTRICTS) {
        const end = new THREE.Vector3(0, 0, -BLOCK_LENGTH).applyMatrix4(frames[i])
        const start = new THREE.Vector3().setFromMatrixPosition(frames[i + 1])
        assert.ok(end.distanceTo(start) < 1e-9)
      }
    }
  }
  const roof = districtFrames(hingeTargets(1)).at(-1)
  assert.ok(new THREE.Vector3().setFromMatrixPosition(roof).y > 70)
  assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(roof).y < -.8)
})

test('slow frames and repeated reversals remain bounded and settle back onto the street', () => {
  for (const dt of [1 / 120, 1 / 30, .1]) {
    const state = createFoldState()
    for (let i = 0; i < 700; i++) {
      advanceFold(state, i < 350 ? Number(Math.floor(i / 40) % 2 === 0) : 0, dt)
      assert.ok([...state.angles].every(x => Number.isFinite(x) && x >= 0 && x <= MAX_HINGE))
    }
    assert.ok([...state.angles].every(x => x < .00001))
    assert.equal(advanceFold(state, 0, dt), false)
  }
})

test('reduced motion reaches the requested geometry without residual velocity', () => {
  const state = createFoldState()
  advanceFold(state, 1, .05)
  assert.equal(advanceFold(state, .6, 0, true), false)
  assert.deepEqual([...state.angles], hingeTargets(.6))
  assert.ok([...state.speeds].every(x => x === 0))
})
