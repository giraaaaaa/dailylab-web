/* 유리 파괴 기하 — 렌더러·DOM과 무관한 순수 함수.
   유리판 좌표: y ∈ [-1, 1], x ∈ [-aspect, aspect].
   조각(shard)은 볼록 다각형이고, 꼭짓점 v.e 는 "그 꼭짓점에서 시작하는 변"의 금 정보다.
     e = { px, py, t0, len, boundary }
     (px, py)에서 t0초에 시작한 금이 반지름 len 안쪽까지만 보인다. len = 0 이면 아직 금이 아닌 경계.
   충격점 주위에 극좌표 격자로 씨앗을 뿌리고 보로노이로 자르면,
   같은 고리의 이웃끼리는 방사형 금이, 이웃 고리끼리는 동심원 금이 되어 거미줄 모양이 나온다. */

export const CRACK_SPEED = 3.2 // 판 높이(2)를 0.6초에 가로지르는 속도

export function area(poly) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function centroid(poly) {
  let cx = 0, cy = 0, s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const k = a.x * b.y - b.x * a.y
    s += k
    cx += (a.x + b.x) * k
    cy += (a.y + b.y) * k
  }
  return { x: cx / (3 * s), y: cy / (3 * s) }
}

export function contains(poly, p) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0) return false
  }
  return true
}

/* 반평면 a·x + b·y ≤ c 만 남긴다. 새로 생긴 변에는 meta를 붙인다 */
export function clip(poly, a, b, c, meta) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length]
    const da = a * A.x + b * A.y - c
    const db = a * B.x + b * B.y - c
    if (da <= 0) out.push({ x: A.x, y: A.y, e: A.e })
    if ((da <= 0) !== (db <= 0)) {
      const s = da / (da - db)
      out.push({ x: A.x + (B.x - A.x) * s, y: A.y + (B.y - A.y) * s, e: da <= 0 ? meta : A.e })
    }
  }
  return out
}

/* 볼록 다각형 안에서 씨앗들의 보로노이 칸. 새 변의 meta는 makeMeta(i, j)로 만든다 */
export function voronoi(poly, seeds, makeMeta) {
  const cells = []
  for (let i = 0; i < seeds.length; i++) {
    let cell = poly
    const s = seeds[i]
    for (let j = 0; j < seeds.length && cell.length > 2; j++) {
      if (i === j) continue
      const o = seeds[j]
      cell = clip(cell, o.x - s.x, o.y - s.y, (o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y) / 2, makeMeta(i, j))
    }
    if (cell.length > 2 && area(cell) > 1e-6) cells.push(cell)
  }
  return cells
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash2 = (i, j, k) => {
  let h = Math.imul(i * 73856093 ^ j * 19349663 ^ k * 83492791, 2654435761) >>> 0
  h ^= h >>> 13
  return (Math.imul(h, 1274126177) >>> 0) / 4294967296
}

/* 충격 하나의 씨앗 배치. force ∈ (0, 1] */
export function impactPattern(p, force, rand) {
  const R = 0.2 + force * 1.25
  const rayCount = Math.round(5 + force * 9)
  const base = rand() * Math.PI * 2
  const step = (Math.PI * 2) / rayCount
  const rays = Array.from({ length: rayCount }, (_, j) => ({
    a: base + (j + (rand() - 0.5) * 0.55) * step,
    len: R * (0.4 + rand() * 0.6),
  }))
  const seeds = []
  const ringMax = 1 + Math.round(force * 3)
  let r = 0.018 + force * 0.03
  const grow = 1.45 + rand() * 0.2
  for (let k = 0; r < R; k++, r *= grow) {
    for (let j = 0; j < rayCount; j++) {
      const a0 = rays[j].a
      const a1 = rays[(j + 1) % rayCount].a + (j === rayCount - 1 ? Math.PI * 2 : 0)
      const mid = (a0 + a1) / 2 + (rand() - 0.5) * 0.2 * (a1 - a0)
      const rr = r * (1 + (rand() - 0.5) * 0.3)
      seeds.push({ x: p.x + rr * Math.cos(mid), y: p.y + rr * Math.sin(mid), k, j })
    }
  }
  return { p, force, R, rays, seeds, ringMax }
}

/* 두 씨앗 사이 새 변이 금으로 보일 반지름. 같은 고리 이웃 = 방사형, 같은 칸 이웃 고리 = 동심원 */
function crackReach(pat, s1, s2, id) {
  const n = pat.rays.length
  if (s1.k === s2.k) {
    const d = (s2.j - s1.j + n) % n
    if (d === 1) return pat.rays[s2.j].len
    if (d === n - 1) return pat.rays[s1.j].len
  }
  if (s1.j === s2.j && Math.abs(s1.k - s2.k) === 1) {
    const k = Math.max(s1.k, s2.k)
    return k <= pat.ringMax && hash2(id, s1.j, k) < 0.78 ? pat.R : 0
  }
  return Math.min(pat.rays[s1.j].len, pat.rays[s2.j].len)
}

/* 조각 하나를 충격 패턴으로 쪼갠다. 씨앗이 2개 미만이면 그대로 */
export function fractureShard(poly, pat, t0, id) {
  const inside = pat.seeds.filter((s) => contains(poly, s))
  if (inside.length < 2) return null
  return voronoi(poly, inside, (i, j) => ({ px: pat.p.x, py: pat.p.y, t0, len: crackReach(pat, inside[i], inside[j], id), boundary: false }))
}

/* 큰 조각을 무작위 씨앗으로 잘게 — 와장창 깨질 때. 새 변은 즉시 금이 된다 */
export function shatterShard(poly, pieces, rand, p, t0) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const v of poly) { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y) }
  const seeds = []
  for (let tries = 0; seeds.length < pieces && tries < pieces * 12; tries++) {
    const s = { x: minX + rand() * (maxX - minX), y: minY + rand() * (maxY - minY) }
    if (contains(poly, s)) seeds.push(s)
  }
  if (seeds.length < 2) return [poly]
  const meta = { px: p.x, py: p.y, t0, len: 99, boundary: false }
  const cells = voronoi(poly, seeds, () => meta)
  return cells.length ? cells : [poly]
}

/* 모든 변이 끝까지 금이 갔거나 판 테두리면 떨어져 나올 수 있는 조각 */
export function isFree(poly) {
  return poly.every((v, i) => {
    if (v.e.boundary) return true
    const w = poly[(i + 1) % poly.length]
    const reach = v.e.len
    return reach > 0 && Math.hypot(v.x - v.e.px, v.y - v.e.py) <= reach && Math.hypot(w.x - v.e.px, w.y - v.e.py) <= reach
  })
}

export function pane(aspect) {
  const e = { px: 0, py: 0, t0: 0, len: 0, boundary: true }
  return [{ x: -aspect, y: -1, e }, { x: aspect, y: -1, e }, { x: aspect, y: 1, e }, { x: -aspect, y: 1, e }]
}
