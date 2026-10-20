import { test } from 'node:test'
import assert from 'node:assert/strict'
import { area, clip, contains, fractureShard, impactPattern, isFree, mulberry32, pane, shatterShard } from './fracture.mjs'

const total = (cells) => cells.reduce((s, c) => s + area(c), 0)

test('clip keeps the inside half and tags the new edge', () => {
  const sq = pane(1)
  const meta = { px: 0, py: 0, t0: 1, len: 5, boundary: false }
  const half = clip(sq, 1, 0, 0, meta) // x ≤ 0
  assert.ok(Math.abs(area(half) - 2) < 1e-9)
  assert.equal(half.filter((v) => v.e === meta).length, 1)
})

test('fracture splits a pane without losing or overlapping glass', () => {
  const rand = mulberry32(7)
  const glass = pane(1.6)
  const pat = impactPattern({ x: 0.2, y: -0.1 }, 0.8, rand)
  const cells = fractureShard(glass, pat, 0, 1)
  assert.ok(cells.length > 20)
  assert.ok(Math.abs(total(cells) - area(glass)) < 1e-6)
  for (const c of cells) assert.ok(area(c) > 0, 'cells stay counter-clockwise')
})

test('a light tap only cracks near the impact', () => {
  const rand = mulberry32(3)
  const pat = impactPattern({ x: 0, y: 0 }, 0.15, rand)
  const cells = fractureShard(pane(1.6), pat, 0, 1)
  const reach = Math.max(...cells.flatMap((c) => c.map((v) => (v.e.boundary ? 0 : v.e.len))))
  assert.ok(reach <= pat.R + 1e-9 && pat.R < 0.5)
})

test('pieces at the centre of a strong hit can fall out', () => {
  const rand = mulberry32(11)
  const pat = impactPattern({ x: 0, y: 0 }, 1, rand)
  const cells = fractureShard(pane(1.6), pat, 0, 1)
  const centre = cells.filter((c) => c.every((v) => Math.hypot(v.x, v.y) < 0.1))
  assert.ok(centre.length > 0 && centre.some(isFree))
  assert.ok(!isFree(pane(1.6).map((v) => ({ ...v, e: { ...v.e, boundary: false } }))))
})

test('shatter subdivides a big shard into pieces that tile it', () => {
  const rand = mulberry32(5)
  const big = pane(1)
  const pieces = shatterShard(big, 14, rand, { x: 0, y: 0 }, 0)
  assert.ok(pieces.length >= 10)
  assert.ok(Math.abs(total(pieces) - area(big)) < 1e-6)
  assert.ok(pieces.every((c) => contains(big, { x: c[0].x * 0.999, y: c[0].y * 0.999 })))
})
