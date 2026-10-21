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

/* 비바람에 바랜 나무: 결은 u 방향. 갈라진 틈과 옹이, 은빛으로 바랜 자리와 빗물에 젖어 어두운 자리, 못 자국.
   base로 판마다 밝기를 달리한다(기둥은 바래서 밝고, 굴대·손잡이는 손때로 어둡다) */
export function woodMaps(size = 512, { base = 122 } = {}) {
  const [c, g] = canvas(size)
  g.fillStyle = '#6a6762'; g.fillRect(0, 0, size, size)
  const ph = rnd(0, 6)
  for (let y = 0; y < size; y++) {
    const v = Math.sin(y * 0.31 + Math.sin(y * 0.047 + ph) * 4) * 0.5 + Math.sin(y * 0.11 + 1.3 + ph) * 0.5
    const t = base + v * 20 + rnd(-6, 6)
    g.fillStyle = `rgb(${t},${t - 2},${t - 5})`; g.fillRect(0, y, size, 1)
  }
  // 결 따라 길게 바랜 띠와 젖은 띠(나뭇결 방향으로 번진다)
  for (let i = 0; i < 26; i++) {
    const y = rnd(0, size), hgt = rnd(4, 26), light = Math.random() < 0.55
    const gr = g.createLinearGradient(0, y - hgt, 0, y + hgt)
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, light ? `rgba(205,203,198,${rnd(0.08, 0.2)})` : `rgba(18,17,16,${rnd(0.1, 0.25)})`); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, y - hgt, size, hgt * 2)
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
  for (let i = 0; i < 5; i++) { // 못 자국: 쇠가 녹아 번진 어두운 얼룩과 박힌 머리
    const x = rnd(0, size), y = rnd(0, size)
    const gr = g.createRadialGradient(x, y, 0, x, y, rnd(8, 18)); gr.addColorStop(0, 'rgba(20,19,18,.55)'); gr.addColorStop(1, 'rgba(20,19,18,0)')
    g.fillStyle = gr; g.fillRect(x - 20, y - 20, 40, 40)
    g.fillStyle = 'rgba(70,70,72,.9)'; g.beginPath(); g.arc(x, y, rnd(2, 3.2), 0, Math.PI * 2); g.fill()
  }
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

/* 둘레 돌(갓돌·쌓은 돌): 여러 겹의 얼룩, 광물 알갱이, 비에 팬 작은 구멍, 하얗게 핀 지의류, 가는 석영 줄, 빗물 얼룩.
   거칠기 지도도 같이(지의류는 꺼끌, 닳은 자리는 매끈). 돌마다 세계 좌표로 다른 자리를 읽어 쓴다 */
export function stoneMaps(size = 512) {
  const [c, g] = canvas(size)
  const [hc, hg] = canvas(size)
  const [rc, rg] = canvas(size)
  g.fillStyle = '#9b9b9d'; g.fillRect(0, 0, size, size)
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, size, size)
  rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, size, size)
  const k = size / 256
  blobs(g, size, size, 14, 70 * k, 160 * k, () => `rgba(${Math.random() < 0.5 ? '178,178,180' : '58,58,60'},${rnd(0.12, 0.28)})`)
  blobs(g, size, size, 60, 14 * k, 50 * k, () => `rgba(${Math.random() < 0.5 ? '186,186,188' : '50,50,52'},${rnd(0.1, 0.26)})`)
  blobs(hg, size, size, 50, 20 * k, 70 * k, () => `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.08, 0.2)})`)
  blobs(rg, size, size, 20, 30 * k, 90 * k, () => `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,120,120'},${rnd(0.15, 0.35)})`)
  // 광물 알갱이
  for (let i = 0; i < 4200 * k * k; i++) { const t = Math.random() < 0.55 ? rnd(55, 95) : rnd(150, 200); g.fillStyle = `rgba(${t},${t},${t},${rnd(0.15, 0.5)})`; g.fillRect(rnd(0, size), rnd(0, size), rnd(0.5, 1.8) * k, rnd(0.5, 1.6) * k) }
  // 비에 팬 구멍: 가운데 어둡고 둘레가 살짝 밝다
  for (let i = 0; i < 160 * k; i++) {
    const x = rnd(0, size), y = rnd(0, size), r = rnd(0.7, 2.6) * k
    g.fillStyle = 'rgba(200,200,202,.2)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 1.3, 0, Math.PI * 2); g.fill()
    g.fillStyle = 'rgba(30,30,32,.55)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    hg.fillStyle = 'rgba(0,0,0,.8)'; hg.beginPath(); hg.arc(x, y, r, 0, Math.PI * 2); hg.fill()
  }
  // 가는 석영 줄
  for (let i = 0; i < 4; i++) {
    let x = rnd(0, size), y = rnd(0, size), a = rnd(0, Math.PI)
    g.strokeStyle = `rgba(215,215,217,${rnd(0.25, 0.5)})`; g.lineWidth = rnd(0.8, 2.2) * k
    g.beginPath(); g.moveTo(x, y)
    for (let j = 0; j < 30; j++) { a += rnd(-0.25, 0.25); x += Math.cos(a) * 9 * k; y += Math.sin(a) * 9 * k; g.lineTo(x, y) }
    g.stroke()
  }
  // 갈라진 금
  for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(30,30,32,.45)'; hg.strokeStyle = 'rgba(0,0,0,.7)'; const lw = rnd(0.6, 1.5) * k; g.lineWidth = hg.lineWidth = lw; let x = rnd(0, size), y = rnd(0, size); g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y); for (let j = 0; j < 18; j++) { x += rnd(-12, 12) * k; y += rnd(-12, 12) * k; g.lineTo(x, y); hg.lineTo(x, y) } g.stroke(); hg.stroke() }
  // 지의류: 작은 딱지가 무리 지어 번진 옅은 자리(둥근 도장이 아니라 가장자리가 들쭉날쭉하게)
  for (let i = 0; i < 6; i++) {
    const x = rnd(0, size), y = rnd(0, size), r = rnd(14, 36) * k
    for (let j = 0; j < 70; j++) {
      const a = rnd(0, Math.PI * 2), d = Math.pow(Math.random(), 0.7) * r * (0.6 + 0.4 * Math.sin(a * 3 + i)), rr = rnd(1.5, 5) * k * (1 - d / (r * 1.2))
      const px = (x + Math.cos(a) * d + size) % size, py = (y + Math.sin(a) * d + size) % size
      g.fillStyle = `rgba(${Math.round(rnd(190, 225))},${Math.round(rnd(190, 225))},${Math.round(rnd(188, 222))},${rnd(0.12, 0.35)})`; g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill()
      rg.fillStyle = 'rgba(255,255,255,.5)'; rg.beginPath(); rg.arc(px, py, rr, 0, Math.PI * 2); rg.fill()
      hg.fillStyle = 'rgba(255,255,255,.2)'; hg.beginPath(); hg.arc(px, py, rr, 0, Math.PI * 2); hg.fill()
    }
  }
  // 빗물 얼룩: 아래로 흘러내린 어두운 줄
  for (let i = 0; i < 12; i++) { const x = rnd(0, size), y = rnd(0, size), len = rnd(30, 120) * k, w = rnd(3, 10) * k; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(25,25,27,.22)'); gr.addColorStop(1, 'rgba(25,25,27,0)'); g.fillStyle = gr; g.fillRect(x - w / 2, y, w, len) }
  grain(g, size, size, 18)
  grain(hg, size, size, 30)
  hg.filter = `blur(${k}px)`; hg.drawImage(hc, 0, 0); hg.filter = 'none'
  return { map: tex(c), normalMap: tex(normalFrom(hc, 2.4), { srgb: false }), roughnessMap: tex(rc, { srgb: false }) }
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
