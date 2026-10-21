import * as THREE from 'three'
import { portalTransform } from './math.js'

export const BALL_RADIUS = .31
export const APERTURE = { width: 3.2, height: 4.6 }
export function createPortalBall() {
  return { room: 0, position: new THREE.Vector3(0, 2.65, 2.45), velocity: new THREE.Vector3(), rotation: new THREE.Quaternion(), flying: false, crossings: 0 }
}

export function crossBall(ball, previous, portals) {
  const entry = portals[ball.room], exit = portals[1 - ball.room]
  const inv = entry.clone().invert()
  const before = previous.clone().applyMatrix4(inv), after = ball.position.clone().applyMatrix4(inv)
  if (before.z < 0 || after.z >= 0 || before.z === after.z) return false
  const at = before.clone().lerp(after, before.z / (before.z - after.z))
  if (Math.abs(at.x) > APERTURE.width / 2 - BALL_RADIUS || Math.abs(at.y) > APERTURE.height / 2 - BALL_RADIUS) return false
  const map = portalTransform(entry, exit), rotation = new THREE.Quaternion().setFromRotationMatrix(map)
  ball.position.applyMatrix4(map); ball.velocity.applyQuaternion(rotation); ball.rotation.premultiply(rotation)
  ball.room = 1 - ball.room; ball.crossings++
  return true
}

export function stepPortalBall(ball, elapsed, portals, onImpact) {
  if (!ball.flying) return false
  const count = Math.max(1, Math.ceil(Math.min(elapsed, .05) * 120)), dt = Math.min(elapsed, .05) / count
  for (let i = 0; i < count; i++) {
    const previous = ball.position.clone()
    if (ball.room === 0) ball.velocity.y -= 1.5 * dt
    else ball.velocity.x -= 3.4 * dt
    ball.position.addScaledVector(ball.velocity, dt)
    crossBall(ball, previous, portals)
    const hit = (axis, limit, normal) => {
      if ((ball.position[axis] - limit) * normal >= 0) return
      ball.position[axis] = limit
      const speed = Math.abs(ball.velocity[axis]); ball.velocity[axis] *= -.48
      for (const other of ['x', 'y', 'z']) if (other !== axis) ball.velocity[other] *= .86
      if (speed > .45) onImpact?.(speed, ball.room)
    }
    if (ball.room === 0) hit('y', .17 + BALL_RADIUS, 1)
    else { hit('x', -2.15 + BALL_RADIUS, 1); hit('y', .17 + BALL_RADIUS, 1); hit('y', 6 - BALL_RADIUS, -1) }
    hit('z', -4.8 + BALL_RADIUS, 1); hit('z', 6 - BALL_RADIUS, -1); hit('x', 4 - BALL_RADIUS, -1)
    if (ball.room === 0) hit('x', -4 + BALL_RADIUS, 1)
    const resting = ball.room === 0 ? ball.position.y <= .17 + BALL_RADIUS + .004 : ball.position.x <= -2.15 + BALL_RADIUS + .004
    if (resting) {
      ball.velocity.multiplyScalar(Math.exp(-dt * 2.6))
      if (ball.velocity.lengthSq() < .012) { ball.velocity.set(0, 0, 0); ball.flying = false }
    }
    const axis = new THREE.Vector3(ball.velocity.z, 0, -ball.velocity.x)
    if (axis.lengthSq() > .00001) ball.rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), ball.velocity.length() * dt / BALL_RADIUS))
  }
  return ball.flying
}
