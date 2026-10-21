import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { portalTransform } from './math.js'
import { createPortalBall, crossBall, stepPortalBall } from './portalBall.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('passing through a portal and back preserves position and orientation', () => {
  const entry = new THREE.Matrix4().compose(new THREE.Vector3(2, 3, -1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .3, .8)), new THREE.Vector3(1, 1, 1))
  const exit = new THREE.Matrix4().compose(new THREE.Vector3(-3, 2, 4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, Math.PI / 2)), new THREE.Vector3(1, 1, 1))
  const forward = portalTransform(entry, exit)
  const back = portalTransform(exit, entry)
  const roundtrip = back.clone().multiply(forward)
  roundtrip.elements.forEach((value, i) => close(value, new THREE.Matrix4().elements[i]))
  const p = new THREE.Vector3(1, 2, 7)
  const result = p.clone().applyMatrix4(forward).applyMatrix4(back)
  close(p.distanceTo(result), 0)
})

test('crossing changes the entry back side to the exit front side', () => {
  const entry = new THREE.Matrix4().makeTranslation(2, 3, 0)
  const exit = new THREE.Matrix4().makeRotationZ(Math.PI / 2)
  const incoming = new THREE.Vector3(0, 0, -.25).applyMatrix4(entry)
  const localExit = incoming.applyMatrix4(portalTransform(entry, exit)).applyMatrix4(exit.clone().invert())
  close(localExit.z, .25)
})

const pair = () => [new THREE.Matrix4().makeTranslation(0, 2.55, 0), new THREE.Matrix4().compose(new THREE.Vector3(0, 2.55, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1))]

test('a moving ball crosses once, keeps its speed and lands on the receiving wall', () => {
  for (const dt of [1 / 120, 1 / 30, .1]) {
    const b = createPortalBall(); b.velocity.set(.04, 1.38, -2.65); b.flying = true
    for (let i = 0; i < 1400; i++) stepPortalBall(b, dt, pair())
    assert.equal(b.room, 1); assert.equal(b.crossings, 1); assert.equal(b.flying, false)
    assert.ok(Math.abs(b.position.x - (-2.15 + .31)) < .005)
    assert.ok(b.position.toArray().every(Number.isFinite))
  }
})

test('the doorway rejects an out-of-aperture crossing and maps velocity when rotated', () => {
  const p = pair(); p[1].multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
  const b = createPortalBall(); b.position.set(0, 2.55, -.05); b.velocity.set(1, 2, -3)
  const speed = b.velocity.length()
  assert.equal(crossBall(b, new THREE.Vector3(0, 2.55, .05), p), true)
  close(b.velocity.length(), speed)
  const outside = createPortalBall(); outside.position.set(4, 2.55, -.1)
  assert.equal(crossBall(outside, new THREE.Vector3(4, 2.55, .1), p), false)
  assert.equal(outside.room, 0)
})
