import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { portalTransform, foldPose, cityLots } from './math.js'

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

test('all 64 building walls keep their length at every fold angle', () => {
  const lots = cityLots()
  assert.equal(lots.length, 64)
  for (const lot of lots) {
    let previous = 0
    for (let progress = 0; progress <= 1.001; progress += .01) {
      const pose = foldPose(progress, lot.h, lot.delay)
      close(Math.hypot(pose.rise, pose.drift), lot.h)
      assert.ok(pose.rise >= previous - 1e-9)
      previous = pose.rise
    }
    close(foldPose(0, lot.h, lot.delay).rise, 0)
    close(foldPose(1, lot.h, lot.delay).rise, lot.h)
    close(foldPose(1, lot.h, lot.delay).drift, 0)
  }
})
