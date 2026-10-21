import * as THREE from 'three'

/* 밤 욕실의 재질. 모두 열 때마다 캔버스로 그린다(내려받는 데이터 0). 색은 흑백. */

const rnd = (a, b) => a + Math.random() * (b - a)
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })] }
function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
function normalFrom(c, strength) {
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

/* 정사각 타일 벽(한 장에 4×4장). 유약 얼룩, 줄눈은 거칠고 어둡게. 거칠기 지도도 같이(타일은 반들, 줄눈은 꺼끌) */
export function tileMaps({ base = 58, spread = 10, n = 4, size = 512, grout = 0.05 } = {}) {
  const [c, g] = canvas(size)
  const [hc, hg] = canvas(size)
  const [rc, rg] = canvas(size)
  const cell = size / n, gw = cell * grout
  g.fillStyle = '#1c1c1e'; g.fillRect(0, 0, size, size)
  hg.fillStyle = '#000'; hg.fillRect(0, 0, size, size)
  rg.fillStyle = '#e6e6e6'; rg.fillRect(0, 0, size, size)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const t = base + rnd(-spread, spread)
    const x = i * cell + gw / 2, y = j * cell + gw / 2, w = cell - gw
    const gr = g.createLinearGradient(x, y, x + w, y + w)
    gr.addColorStop(0, `rgb(${t + 6},${t + 6},${t + 8})`); gr.addColorStop(1, `rgb(${t - 4},${t - 4},${t - 2})`)
    g.fillStyle = gr; g.fillRect(x, y, w, w)
    for (let k = 0; k < 5; k++) { const bx = x + rnd(0, w), by = y + rnd(0, w), br = rnd(8, w * 0.4); const b = g.createRadialGradient(bx, by, 0, bx, by, br); b.addColorStop(0, `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.02, 0.06)})`); b.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = b; g.fillRect(bx - br, by - br, br * 2, br * 2) }
    // 높이: 가장자리가 살짝 둥근 타일(흐리게 해서 모서리를 굴린다), 거칠기: 타일은 반들
    hg.fillStyle = '#d8d8d8'; hg.fillRect(x + 2, y + 2, w - 4, w - 4)
    const r = Math.round(rnd(44, 70)); rg.fillStyle = `rgb(${r},${r},${r})`; rg.fillRect(x, y, w, w)
  }
  hg.filter = 'blur(2px)'; hg.drawImage(hc, 0, 0); hg.filter = 'none'
  const img = g.getImageData(0, 0, size, size), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n2 = (Math.random() - 0.5) * 6; d[i] += n2; d[i + 1] += n2; d[i + 2] += n2 }
  g.putImageData(img, 0, 0)
  return { map: tex(c), normalMap: tex(normalFrom(hc, 2.2), { srgb: false }), roughnessMap: tex(rc, { srgb: false }) }
}

/* 김 속의 아주 작은 물방울들(빨강 = 방울 모양, 초록 = 위쪽 하이라이트). 김 낀 유리의 오돌토돌한 결 */
export function microBeads(size = 256) {
  const [c, g] = canvas(size)
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size)
  for (let i = 0; i < 2600; i++) {
    const x = rnd(0, size), y = rnd(0, size), r = Math.pow(Math.random(), 2.2) * 2.6 + 0.5
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      g.fillStyle = `rgba(${Math.round(rnd(120, 255))},0,0,1)`
      g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(255,255,0,.9)'
      g.beginPath(); g.arc(x + dx - r * 0.3, y + dy - r * 0.35, r * 0.32, 0, Math.PI * 2); g.fill()
    }
  }
  return tex(c, { srgb: false })
}

/* 샤워 커튼·수건 같은 천: 세로 결과 잔 무늬 */
export function clothMap() {
  const [c, g] = canvas(256)
  g.fillStyle = '#8d8d90'; g.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 2) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.02, 0.07)})`; g.fillRect(x, 0, 1, 256) }
  for (let y = 0; y < 256; y += 3) { g.fillStyle = `rgba(0,0,0,${rnd(0.01, 0.04)})`; g.fillRect(0, y, 256, 1) }
  return tex(c)
}

/* 거울 은박이 가장자리부터 삭은 자국(0 = 멀쩡, 1 = 삭음) */
export function desilverMap(w = 512, h = 400) {
  const [c, g] = canvas(w, h)
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
  // 가장자리에서 아주 얇게, 군데군데만(아래쪽이 조금 더: 물이 닿던 자리)
  for (let i = 0; i < 70; i++) {
    const side = Math.random() < 0.4 ? 3 : Math.floor(Math.random() * 4)
    const t = Math.random()
    const x = side === 0 ? rnd(0, 5) : side === 1 ? w - rnd(0, 5) : t * w
    const y = side === 2 ? rnd(0, 5) : side === 3 ? h - rnd(0, 7) : t * h
    const r = rnd(2, 10) * (Math.random() < 0.08 ? 2 : 1)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(255,255,255,${rnd(0.35, 0.8)})`); gr.addColorStop(0.7, `rgba(255,255,255,${rnd(0.05, 0.25)})`); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return tex(c, { srgb: false, repeat: false })
}

/* 김 위에 남는 손바닥 자국(거울 안쪽에서 누른 손: 우리 쪽에서 보면 엄지가 반대편) */
export function palmStamp() {
  const [c, g] = canvas(256, 320)
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 320)
  g.fillStyle = '#fff'
  g.filter = 'blur(3px)'
  g.beginPath(); g.ellipse(128, 210, 62, 74, 0, 0, Math.PI * 2); g.fill()
  const finger = (x, y, len, w, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.roundRect(-w / 2, -len, w, len, w / 2); g.fill(); g.restore() }
  finger(84, 160, 92, 28, -0.16); finger(116, 146, 116, 30, -0.05); finger(148, 148, 110, 30, 0.04); finger(178, 162, 88, 27, 0.15)
  finger(196, 222, 74, 30, 0.95) // 엄지(안쪽에서 누른 오른손이라 우리 눈엔 오른쪽)
  g.filter = 'none'
  // 손금·지문 결: 자국 안에 조금 남는 김
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${rnd(0.15, 0.4)})`; g.lineWidth = rnd(0.8, 1.8); g.beginPath(); g.arc(rnd(70, 190), rnd(150, 270), rnd(20, 60), rnd(0, 6), rnd(0, 6) + 0.8); g.stroke() }
  g.globalCompositeOperation = 'source-over'
  return tex(c, { srgb: false, repeat: false })
}

/* 손가락 기름 글씨: 거울 안쪽에서 쓴 것이라 좌우가 뒤집혀 있다 */
export function greaseText(text, w = 512, h = 160) {
  const [c, g] = canvas(w, h)
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
  g.translate(w, 0); g.scale(-1, 1)
  g.font = `600 ${Math.round(h * 0.62)}px "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.lineJoin = 'round'; g.lineCap = 'round'
  g.filter = 'blur(1.2px)'
  g.strokeStyle = '#fff'; g.lineWidth = h * 0.075
  g.strokeText(text, w / 2, h / 2)
  g.filter = 'none'
  return tex(c, { srgb: false, repeat: false })
}
