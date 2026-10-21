import * as THREE from 'three'

/* 우물 장면의 재질. 사진은 하나도 받지 않고 열 때마다 캔버스로 그린다(내려받는 데이터 0).
   색은 흑백(비바람에 바랜 회색 나무, 회색 돌, 어두운 흙). 높이로 쓸 밝기에서 법선 지도를 같이 굽는다. */

const rnd = (a, b) => a + Math.random() * (b - a)
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })] }

// 밝기(높이)에서 법선 지도
function normalFrom(c, strength = 2.5) {
  const w = c.width, h = c.height
  const src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const [n, g] = canvas(w, h)
  const out = g.createImageData(w, h)
  const L = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength
    const l = Math.hypot(dx, dy, 1), o = (y * w + x) * 4
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255
  }
  g.putImageData(out, 0, 0)
  return n
}
function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
function blobs(g, w, h, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = rnd(0, w), y = rnd(0, h), r = rnd(rMin, rMax)
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
      const c = colorFn()
      gr.addColorStop(0, c); gr.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'))
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
    }
  }
}
function grain(g, w, h, amt) {
  const img = g.getImageData(0, 0, w, h), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n }
  g.putImageData(img, 0, 0)
}

/* 비바람에 바랜 나무: 결은 u 방향. 갈라진 틈과 옹이 */
export function woodMaps(size = 512) {
  const [c, g] = canvas(size)
  g.fillStyle = '#6a6762'; g.fillRect(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    const v = Math.sin(y * 0.31 + Math.sin(y * 0.047) * 4) * 0.5 + Math.sin(y * 0.11 + 1.3) * 0.5
    const t = 122 + v * 20 + rnd(-6, 6)
    g.fillStyle = `rgb(${t},${t - 2},${t - 5})`; g.fillRect(0, y, size, 1)
  }
  for (let i = 0; i < 90; i++) { // 결을 따라 짧게 끊기는 어두운 줄
    const y = rnd(0, size), x = rnd(0, size), len = rnd(40, 260)
    g.strokeStyle = `rgba(30,28,26,${rnd(0.15, 0.45)})`; g.lineWidth = rnd(0.6, 1.6)
    g.beginPath(); g.moveTo(x, y); for (let k = 0; k <= len; k += 12) g.lineTo(x + k, y + Math.sin((x + k) * 0.02) * 1.5 + rnd(-0.4, 0.4)); g.stroke()
  }
  for (let i = 0; i < 6; i++) { // 깊은 틈
    const y = rnd(0, size), x = rnd(0, size * 0.5), len = rnd(120, 380)
    g.strokeStyle = 'rgba(14,13,12,.8)'; g.lineWidth = rnd(1.4, 2.6)
    g.beginPath(); g.moveTo(x, y); for (let k = 0; k <= len; k += 10) g.lineTo(x + k, y + rnd(-0.8, 0.8)); g.stroke()
  }
  for (let i = 0; i < 3; i++) { // 옹이
    const x = rnd(0, size), y = rnd(0, size), r = rnd(6, 14)
    for (let k = 4; k >= 0; k--) { g.strokeStyle = `rgba(28,26,24,${0.25 + k * 0.08})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, r + k * 5, (r + k * 5) * 0.45, 0, 0, Math.PI * 2); g.stroke() }
    g.fillStyle = 'rgba(24,22,20,.8)'; g.beginPath(); g.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); g.fill()
  }
  blobs(g, size, size, 18, 40, 140, () => `rgba(${Math.random() < 0.6 ? '190,188,182' : '40,38,36'},${rnd(0.05, 0.12)})`)
  grain(g, size, size, 14)
  return { map: tex(c), normalMap: tex(normalFrom(c, 3.2), { srgb: false }) }
}

/* 꼰 삼베 밧줄: 비스듬한 가닥 */
export function ropeMaps() {
  const W = 64, H = 256
  const [c, g] = canvas(W, H)
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = ((x / W) * 3 + y / 21.3) % 1 // 세 가닥이 감긴 줄
    const ridge = Math.sin(p * Math.PI) ** 0.7
    const fiber = Math.sin((x * 1.7 + y * 4.1)) * 0.5 + 0.5
    const t = 84 + ridge * 52 + fiber * 12 + rnd(-7, 7)
    const o = (y * W + x) * 4
    img.data[o] = t; img.data[o + 1] = t * 0.97; img.data[o + 2] = t * 0.9; img.data[o + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return { map: tex(c), normalMap: tex(normalFrom(c, 4), { srgb: false }) }
}

/* 다져진 흙 바닥: 큰 얼룩, 작은 자갈 점, 이끼 낀 자리 */
export function dirtMaps(size = 512) {
  const [c, g] = canvas(size)
  g.fillStyle = '#262627'; g.fillRect(0, 0, size, size)
  blobs(g, size, size, 40, 60, 200, () => `rgba(${Math.random() < 0.5 ? '60,60,62' : '10,10,11'},${rnd(0.15, 0.35)})`)
  blobs(g, size, size, 120, 8, 40, () => `rgba(${Math.random() < 0.5 ? '72,72,74' : '14,14,15'},${rnd(0.15, 0.35)})`)
  for (let i = 0; i < 1800; i++) { const t = Math.random() < 0.4 ? rnd(46, 66) : rnd(8, 18); g.fillStyle = `rgba(${t},${t},${t + 2},${rnd(0.35, 0.8)})`; g.beginPath(); g.arc(rnd(0, size), rnd(0, size), rnd(0.5, 1.8), 0, Math.PI * 2); g.fill() }
  grain(g, size, size, 18)
  return { map: tex(c), normalMap: tex(normalFrom(c, 2.2), { srgb: false }) }
}

/* 화강암 같은 돌 표면(우물 둘레 돌에 인스턴스 색을 곱해 돌마다 다르게) */
export function speckleMaps(size = 256) {
  const [c, g] = canvas(size)
  g.fillStyle = '#9a9a9c'; g.fillRect(0, 0, size, size)
  blobs(g, size, size, 30, 20, 70, () => `rgba(${Math.random() < 0.5 ? '170,170,172' : '60,60,62'},${rnd(0.1, 0.25)})`)
  for (let i = 0; i < 3000; i++) { const t = Math.random() < 0.55 ? rnd(30, 70) : rnd(170, 220); g.fillStyle = `rgba(${t},${t},${t},${rnd(0.3, 0.8)})`; g.fillRect(rnd(0, size), rnd(0, size), rnd(0.6, 2), rnd(0.6, 2)) }
  for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(40,40,42,.35)'; g.lineWidth = rnd(0.6, 1.4); g.beginPath(); let x = rnd(0, size), y = rnd(0, size); g.moveTo(x, y); for (let k = 0; k < 20; k++) { x += rnd(-12, 12); y += rnd(-12, 12); g.lineTo(x, y) } g.stroke() }
  grain(g, size, size, 20)
  return { map: tex(c), normalMap: tex(normalFrom(c, 2.8), { srgb: false }) }
}

/* 보로노이 자연석 벽(우물 안). 같은 거리장으로 높이를 만들어 법선까지 */
export function stoneWallMaps(size, { cellsX, cellsY, base = 96, spread = 26, mortar = 0.055 }) {
  const pts = []
  for (let j = 0; j < cellsY; j++) for (let i = 0; i < cellsX; i++) pts.push({ x: (i + 0.15 + Math.random() * 0.7) / cellsX, y: (j + 0.15 + Math.random() * 0.7) / cellsY, tone: base + (Math.random() - 0.5) * spread * 2, rough: Math.random() })
  const [color, cg] = canvas(size)
  const cimg = cg.createImageData(size, size)
  const height = new Float32Array(size * size)
  const cw = 1 / cellsX, ch = 1 / cellsY
  for (let py = 0; py < size; py++) {
    const v = py / size
    for (let px = 0; px < size; px++) {
      const u = px / size
      const ci = Math.floor(u * cellsX), cj = Math.floor(v * cellsY)
      let d1 = 9, d2 = 9, best = null
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const p = pts[((cj + dj + cellsY) % cellsY) * cellsX + ((ci + di + cellsX) % cellsX)]
        let dx = p.x - u, dy = p.y - v
        dx -= Math.round(dx); dy -= Math.round(dy)
        const d = Math.hypot(dx / cw, dy / ch)
        if (d < d1) { d2 = d1; d1 = d; best = p } else if (d < d2) d2 = d
      }
      const edge = d2 - d1
      const hgt = Math.min(1, Math.max(0, (edge - mortar) / 0.35))
      const bump = Math.sqrt(hgt) * (0.85 + best.rough * 0.15)
      height[py * size + px] = bump
      const shade = edge < mortar ? 22 + Math.random() * 8 : best.tone * (0.74 + 0.26 * bump) + (Math.random() - 0.5) * 16
      const o = (py * size + px) * 4
      cimg.data[o] = shade; cimg.data[o + 1] = shade; cimg.data[o + 2] = shade + 2; cimg.data[o + 3] = 255
    }
  }
  cg.putImageData(cimg, 0, 0)
  const [hc, hg] = canvas(size)
  const himg = hg.createImageData(size, size)
  for (let i = 0; i < height.length; i++) { const t = height[i] * 255; himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = t; himg.data[i * 4 + 3] = 255 }
  hg.putImageData(himg, 0, 0)
  return { map: tex(color), normalMap: tex(normalFrom(hc, 3.2), { srgb: false }) }
}

/* 빛 번짐(등불 둘레, 우물 안에서 새어 나오는 빛) */
export function glowTexture() {
  const [c, g] = canvas(128)
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.45)'); gr.addColorStop(0.5, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  return tex(c, { repeat: false })
}

/* 땅 위에 낮게 깔리는 안개(밝기 = 알파) */
export function mistTexture() {
  const [c, g] = canvas(256)
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256)
  blobs(g, 256, 256, 26, 30, 90, () => `rgba(255,255,255,${rnd(0.1, 0.3)})`)
  return tex(c, { srgb: false })
}

/* 두레박 널빤지: 세로로 16장, 사이 홈은 어둡게 */
export function staveMaps() {
  const W = 512, H = 256
  const [c, g] = canvas(W, H)
  g.fillStyle = '#5f5c58'; g.fillRect(0, 0, W, H)
  const n = 16, sw = W / n
  for (let i = 0; i < n; i++) {
    const t = 122 + rnd(-16, 16)
    g.fillStyle = `rgb(${t},${t - 2},${t - 5})`; g.fillRect(i * sw, 0, sw, H)
    for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(30,28,26,${rnd(0.12, 0.35)})`; g.lineWidth = rnd(0.6, 1.3); const x = i * sw + rnd(2, sw - 2); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd(-3, 3), H * 0.3, x + rnd(-3, 3), H * 0.7, x + rnd(-2, 2), H); g.stroke() }
    g.fillStyle = 'rgba(10,9,8,.85)'; g.fillRect(i * sw, 0, 1.6, H)
  }
  // 물에 잠겼던 아랫부분은 더 어둡게
  const wet = g.createLinearGradient(0, 0, 0, H); wet.addColorStop(0, 'rgba(10,10,10,.45)'); wet.addColorStop(0.55, 'rgba(10,10,10,0)')
  g.fillStyle = wet; g.fillRect(0, 0, W, H)
  grain(g, W, H, 14)
  return { map: tex(c), normalMap: tex(normalFrom(c, 3), { srgb: false }) }
}
