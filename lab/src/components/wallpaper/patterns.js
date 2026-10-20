/* 벽지 한 겹의 무늬들. 사진 없이 열 때마다 캔버스로 그린다.
   반복 무늬(새 벽지·꽃무늬·줄무늬·종이 뒷면)는 이음매 없는 타일, 신문 초배지와 맨 벽은 화면 크기 한 장. */

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
function mk(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  return [c, c.getContext('2d')]
}
// 고운 알갱이(밝기만 흔든다)
function grain(g, w, h, amt) {
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n }
  g.putImageData(img, 0, 0)
}
// 타일 경계를 넘는 모양은 여덟 이웃 자리에 한 번 더 그려 이음매를 없앤다
function wrap(S, fn) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy) }

/* 지금 붙어 있는 새 벽지(방문할 때마다 다른 것이 발려 있다) */
export const TOPS = [
  { name: '린넨', base: [230, 226, 217], kind: 'linen' },
  { name: '헤링본', base: [221, 221, 217], kind: 'herring' },
  { name: '세이지', base: [217, 222, 211], kind: 'dots' },
  { name: '물빛', base: [215, 221, 226], kind: 'pin' },
]
export function topTile(design, S = 512) {
  const [c, g] = mk(S, S)
  const [r, gg, b] = design.base
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, S, S)
  // 짜임: 가로·세로 실
  for (let y = 0; y < S; y += 2) { g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rnd(0.01, 0.045)})` : `rgba(255,255,255,${rnd(0.02, 0.07)})`; g.fillRect(0, y, S, 1) }
  for (let x = 0; x < S; x += 2) { g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rnd(0.01, 0.035)})` : `rgba(255,255,255,${rnd(0.02, 0.05)})`; g.fillRect(x, 0, 1, S) }
  // 굵은 실 마디
  for (let i = 0; i < 240; i++) {
    const x = rnd(0, S), y = Math.floor(rnd(0, S / 2)) * 2, len = rnd(6, 34), a = rnd(0.03, 0.07)
    wrap(S, (dx, dy) => { g.fillStyle = Math.random() < 0.6 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 0.6})`; g.fillRect(x + dx, y + dy, len, 1) })
  }
  if (design.kind === 'herring') {
    const cw = S / 24
    for (let col = 0; col < 24; col++) for (let row = 0; row < S / 8; row++) {
      const x = col * cw, y = row * 8, dir = col % 2 ? 1 : -1
      g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1.2
      g.beginPath(); g.moveTo(x + (dir > 0 ? 0 : cw), y); g.lineTo(x + (dir > 0 ? cw : 0), y + cw * 0.6); g.stroke()
      g.strokeStyle = 'rgba(255,255,255,.08)'
      g.beginPath(); g.moveTo(x + (dir > 0 ? 0 : cw), y + 1.2); g.lineTo(x + (dir > 0 ? cw : 0), y + cw * 0.6 + 1.2); g.stroke()
    }
  } else if (design.kind === 'dots') {
    const step = S / 16
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const x = i * step + (j % 2 ? step / 2 : 0), y = j * step
      wrap(S, (dx, dy) => {
        g.fillStyle = 'rgba(0,0,0,.07)'; g.beginPath(); g.arc(x + dx + 0.8, y + dy + 0.8, 2.4, 0, Math.PI * 2); g.fill()
        g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x + dx, y + dy, 2.2, 0, Math.PI * 2); g.fill()
      })
    }
  } else if (design.kind === 'pin') {
    for (let x = 0; x < S; x += S / 20) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x, 0, 1.4, S); g.fillStyle = 'rgba(0,0,0,.03)'; g.fillRect(x + 1.4, 0, 1, S) }
  }
  grain(g, S, S, 9)
  return c
}

/* 1990년대 꽃무늬: 크림 바탕에 바랜 장미 다발, 반씩 엇갈린 반복 */
export function floralTile(S = 480) {
  const [c, g] = mk(S, S)
  g.fillStyle = '#E8DCC2'; g.fillRect(0, 0, S, S)
  for (let x = 0; x < S; x += 3) { g.fillStyle = `rgba(160,130,90,${rnd(0, 0.03)})`; g.fillRect(x, 0, 1, S) }
  // 무늬는 타일 한 변을 200으로 둔 단위로 그린다(타일을 화면에 몇 px로 깔든 다발 크기 비율이 같다)
  const U = 200
  g.save(); g.scale(S / U, S / U)
  const leaf = (x, y, a, len = 11) => {
    g.save(); g.translate(x, y); g.rotate(a)
    g.fillStyle = 'rgba(126,142,108,.88)'
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0); g.fill()
    g.strokeStyle = 'rgba(80,96,66,.55)'; g.lineWidth = 0.8
    g.beginPath(); g.moveTo(1, 0); g.lineTo(len * 0.85, 0); g.stroke()
    g.restore()
  }
  const rose = (x, y, r, tone) => {
    const [cr, cg, cb] = tone
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, `rgb(${cr + 30},${cg + 28},${cb + 26})`); grad.addColorStop(1, `rgb(${cr},${cg},${cb})`)
    g.fillStyle = grad
    g.beginPath()
    for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2, rr = r * (0.88 + 0.12 * Math.sin(k * 2.7)); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
    g.fill()
    // 꽃잎 소용돌이
    g.strokeStyle = `rgba(${cr - 70},${cg - 60},${cb - 55},.55)`; g.lineWidth = Math.max(0.9, r * 0.11); g.lineCap = 'round'
    let a0 = rnd(0, 6)
    for (let k = 0; k < 4; k++) { const rr = r * (0.78 - k * 0.18); g.beginPath(); g.arc(x + rnd(-0.6, 0.6), y + rnd(-0.6, 0.6), rr, a0, a0 + rnd(2.4, 3.8)); g.stroke(); a0 += 2.1 }
    g.strokeStyle = `rgba(255,240,235,.4)`; g.lineWidth = Math.max(0.7, r * 0.07)
    g.beginPath(); g.arc(x, y, r * 0.62, 3.6, 4.6); g.stroke()
  }
  const sprig = (x, y) => {
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.fillStyle = 'rgba(150,163,186,.85)'; g.beginPath(); g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.9, 0, Math.PI * 2); g.fill() }
    g.fillStyle = 'rgba(222,196,120,.9)'; g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill()
  }
  const bouquet = (x, y, s, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s)
    g.strokeStyle = 'rgba(112,128,92,.75)'; g.lineWidth = 1.6; g.lineCap = 'round'
    for (const [ex, ey] of [[-20, -14], [0, 0], [18, -9], [-4, -26]]) { g.beginPath(); g.moveTo(2, 34); g.quadraticCurveTo(ex * 0.3, 18, ex, ey); g.stroke() }
    leaf(-6, 18, -2.4, 15); leaf(4, 14, -0.6, 14); leaf(-24, 0, -2.9); leaf(26, -2, -0.2); leaf(-12, -22, -2.0, 9); leaf(10, 24, 0.5, 10)
    rose(0, 0, 13, [196, 136, 134]); rose(-20, -14, 9.5, [210, 160, 152]); rose(18, -9, 10.5, [188, 124, 122]); rose(-4, -27, 6.5, [214, 170, 160])
    sprig(-28, 12); sprig(26, 14); sprig(10, -30)
    g.restore()
  }
  // 반씩 엇갈린 두 다발 + 사이사이 작은 다발과 물망초(빈 크림 바탕이 넓지 않게)
  const motifs = [[U * 0.25, U * 0.25, 1.05, -0.25], [U * 0.75, U * 0.75, 1.05, 0.35], [U * 0.75, U * 0.25, 0.6, 2.6], [U * 0.25, U * 0.75, 0.6, -2.4]]
  const smalls = [[U * 0.5, U * 0.5], [U * 0.0, U * 0.5], [U * 0.5, U * 0.0]]
  wrap(U, (dx, dy) => {
    for (const [x, y, s, r] of motifs) bouquet(x + dx, y + dy, s, r)
    for (const [x, y] of smalls) { sprig(x + dx, y + dy); leaf(x + dx + 4, y + dy + 3, 0.7, 8); leaf(x + dx - 4, y + dy + 3, 2.4, 8) }
  })
  g.restore()
  g.fillStyle = 'rgba(232,220,194,.2)'; g.fillRect(0, 0, S, S) // 햇빛에 바램
  grain(g, S, S, 8)
  return c
}

/* 1970년대 줄무늬: 겨자·올리브·밤색, 넓은 띠 안에 작은 마름모 */
export function stripeTile(S = 320) {
  const [c, g] = mk(S, S)
  const seq = [['#C8A453', 58], ['#E4D5B1', 8], ['#7B8351', 26], ['#E4D5B1', 8], ['#94673D', 3], ['#E4D5B1', 8], ['#7B8351', 26], ['#E4D5B1', 8]]
  const total = seq.reduce((a, [, w]) => a + w, 0)
  const k = S / total / 2 // 한 타일에 두 번 반복
  let x = 0
  for (let rep = 0; rep < 2; rep++) for (const [col, w] of seq) {
    g.fillStyle = col; g.fillRect(x, 0, w * k + 0.5, S)
    if (w === 58) for (let y = 0; y < S; y += 20) {
      const cx = x + (w * k) / 2
      g.fillStyle = 'rgba(240,226,180,.5)'; g.beginPath(); g.moveTo(cx, y + 4); g.lineTo(cx + 5, y + 10); g.lineTo(cx, y + 16); g.lineTo(cx - 5, y + 10); g.fill()
      g.fillStyle = 'rgba(120,80,40,.25)'; g.fillRect(cx - 0.5, y + 8, 1, 4)
    }
    x += w * k
  }
  for (let y = 0; y < S; y++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,245,220' : '60,40,20'},${rnd(0, 0.04)})`; g.fillRect(0, y, S, 1) } // 인쇄 얼룩
  grain(g, S, S, 10)
  return c
}

/* 종이 뒷면: 펄프 섬유와 풀 자국 */
export function backTile(S = 512) {
  const [c, g] = mk(S, S)
  g.fillStyle = '#E7E0D0'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 26; i++) {
    const x = rnd(0, S), y = rnd(0, S), r = rnd(30, 110)
    wrap(S, (dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(178,160,120,${rnd(0.08, 0.16)})`); gr.addColorStop(1, 'rgba(178,160,120,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2) })
  }
  g.lineCap = 'round'
  for (let i = 0; i < 1600; i++) {
    const x = rnd(0, S), y = rnd(0, S), a = rnd(0, Math.PI), l = rnd(3, 13)
    g.strokeStyle = Math.random() < 0.5 ? `rgba(255,255,255,${rnd(0.1, 0.3)})` : `rgba(120,105,80,${rnd(0.05, 0.14)})`; g.lineWidth = rnd(0.4, 0.9)
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd(-2, 2), y + Math.sin(a) * l * 0.5 + rnd(-2, 2), x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
  }
  grain(g, S, S, 12)
  return c
}

/* 세월 얼룩(빨강 채널만 쓴다): 물 자국 테두리가 있는 커다란 번짐 */
export function stainMap(w = 320, h = 200) {
  const [c, g] = mk(w, h)
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 22; i++) {
    const x = rnd(0, w), y = rnd(0, h), r = rnd(12, 70), a = rnd(0.15, 0.55)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(255,255,255,${a * 0.6})`); gr.addColorStop(0.82, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const top = g.createLinearGradient(0, 0, 0, h)
  top.addColorStop(0, 'rgba(255,255,255,.35)'); top.addColorStop(0.2, 'rgba(255,255,255,0)')
  g.fillStyle = top; g.fillRect(0, 0, w, h)
  return c
}

/* 초배지로 바른 옛 신문. 여러 장이 조금씩 비뚤게 겹쳐 붙어 있다 */
const SYL = '의이가는을를에서고한하다와과로으지기정부국민대사회경제시장일년월발표계획전내외도군면동리위원관측결과문제해방안마련추진중새물가날씨비구름오후아침주택공사학교어린이소식알림모집안내'.split('')
const HEADS = ['물가 안정 대책 발표', '장마 전선 북상, 중부에 비', '새 아파트 입주 시작', '어린이날 행사 곳곳에서', '야간 통행금지 해제', '연탄값 내일부터 인상', '벽 속에서 소리 난다는 신고 잇따라', '시내버스 노선 바뀐다', '올림픽 준비 한창']
const word = () => Array.from({ length: Math.floor(rnd(1, 4.5)) }, () => pick(SYL)).join('')
const sentence = (n) => Array.from({ length: n }, word).join(' ')
export function newspaper(W, H, scale) {
  const [c, g] = mk(W * scale, H * scale)
  g.scale(scale, scale)
  g.fillStyle = '#A79F8F'; g.fillRect(0, 0, W, H)
  const serif = '"AppleMyungjo", "Nanum Myeongjo", "Batang", "Noto Serif KR", serif'
  const sw = Math.max(240, W * 0.36), sh = Math.max(300, H * 0.52)
  const cols = Math.ceil(W / (sw * 0.82)) + 1, rows = Math.ceil(H / (sh * 0.82)) + 1
  const sheets = []
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) sheets.push([i * sw * 0.82 - sw * 0.2 + rnd(-20, 20), j * sh * 0.82 - sh * 0.2 + rnd(-20, 20)])
  sheets.sort(() => Math.random() - 0.5)
  // 가운데 근처의 한 장에는 이상한 기사와 광고가 실려 있다
  const specialIdx = sheets.reduce((best, s, i) => (Math.hypot(s[0] + sw / 2 - W * 0.62, s[1] + sh / 2 - H * 0.5) < Math.hypot(sheets[best][0] + sw / 2 - W * 0.62, sheets[best][1] + sh / 2 - H * 0.5) ? i : best), 0)
  const order = [...sheets.keys()].filter((i) => i !== specialIdx).concat(specialIdx)
  for (const idx of order) {
    const [x, y] = sheets[idx]
    const special = idx === specialIdx
    g.save()
    g.translate(x + sw / 2, y + sh / 2); g.rotate(rnd(-0.045, 0.045)); g.translate(-sw / 2, -sh / 2)
    const tone = rnd(-10, 6)
    g.fillStyle = `rgb(${216 + tone},${207 + tone},${186 + tone})`; g.fillRect(0, 0, sw, sh)
    const edge = g.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.3, sw / 2, sh / 2, Math.max(sw, sh) * 0.75)
    edge.addColorStop(0, 'rgba(160,120,60,0)'); edge.addColorStop(1, 'rgba(160,120,60,.22)')
    g.fillStyle = edge; g.fillRect(0, 0, sw, sh)
    g.save(); g.beginPath(); g.rect(10, 10, sw - 20, sh - 20); g.clip()
    const ink = 'rgba(38,35,32,.86)'
    let cy = 16
    if (Math.random() < 0.35 || special) {
      g.fillStyle = ink; g.font = `800 26px ${serif}`; g.textBaseline = 'top'
      g.fillText(special ? '새벽일보' : pick(['새벽일보', '동네신문', '중앙시보']), 14, cy)
      g.font = `500 9px ${serif}`; g.fillText(`198${Math.floor(rnd(0, 9))}년 ${Math.floor(rnd(1, 13))}월 ${Math.floor(rnd(1, 29))}일`, sw - 110, cy + 14)
      cy += 34; g.fillRect(12, cy, sw - 24, 1.4); cy += 6
    }
    const head = special ? HEADS[6] : pick(HEADS.filter((h) => h !== HEADS[6]))
    g.fillStyle = ink; g.font = `800 ${Math.round(rnd(17, 23))}px ${serif}`; g.textBaseline = 'top'
    g.fillText(head, 14, cy + 2); cy += 32
    const ncol = 3, gap = 9, cw = (sw - 28 - gap * (ncol - 1)) / ncol
    g.font = `400 8.5px ${serif}`
    for (let k = 0; k < ncol; k++) {
      let yy = cy
      const x0 = 14 + k * (cw + gap)
      if (Math.random() < 0.25 && !special) {
        // 사진 자리: 흐린 회색 그물점
        const ph = rnd(50, 90)
        g.fillStyle = 'rgba(70,66,60,.55)'; g.fillRect(x0, yy, cw, ph)
        for (let d = 0; d < 60; d++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '230,224,210' : '30,28,26'},${rnd(0.08, 0.3)})`; g.beginPath(); g.arc(x0 + rnd(0, cw), yy + rnd(0, ph), rnd(4, 14), 0, Math.PI * 2); g.fill() }
        yy += ph + 6
      }
      while (yy < sh - 20) {
        if (Math.random() < 0.07) { g.font = `700 11px ${serif}`; g.fillStyle = ink; g.fillText(sentence(2), x0, yy); yy += 15; g.font = `400 8.5px ${serif}`; continue }
        g.fillStyle = `rgba(38,35,32,${rnd(0.62, 0.82)})`
        g.fillText(sentence(Math.ceil(cw / 30)), x0, yy, cw)
        yy += 11
      }
      if (k < ncol - 1) { g.fillStyle = 'rgba(38,35,32,.35)'; g.fillRect(x0 + cw + gap / 2, cy, 0.7, sh - cy - 20) }
    }
    if (special) {
      const bx = sw - cw - 18, by = sh - 118, bw = cw + 6, bh = 92
      g.fillStyle = `rgb(${218 + tone},${210 + tone},${190 + tone})`; g.fillRect(bx, by, bw, bh)
      g.strokeStyle = ink; g.lineWidth = 1.6; g.strokeRect(bx, by, bw, bh); g.lineWidth = 0.6; g.strokeRect(bx + 3, by + 3, bw - 6, bh - 6)
      g.fillStyle = ink; g.textAlign = 'center'
      g.font = `800 15px ${serif}`; g.fillText('찾습니다', bx + bw / 2, by + 11)
      g.font = `500 8.5px ${serif}`
      g.fillText('이 벽지를 끝까지', bx + bw / 2, by + 36)
      g.fillText('뜯어 본 분은', bx + bw / 2, by + 48)
      g.fillText('연락 바랍니다', bx + bw / 2, by + 60)
      g.font = `700 8.5px ${serif}`; g.fillText('— 관리인', bx + bw / 2, by + 76)
      g.textAlign = 'left'
    }
    g.restore()
    // 풀 자국
    for (let k = 0; k < 4; k++) { const gx = rnd(0, sw), gy = rnd(0, sh), r = rnd(20, 70); const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, 'rgba(130,100,50,.1)'); gr.addColorStop(1, 'rgba(130,100,50,0)'); g.fillStyle = gr; g.fillRect(gx - r, gy - r, r * 2, r * 2) }
    g.restore()
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  grain(g, c.width, c.height, 10)
  return c
}

/* 맨 벽: 얼룩진 회벽, 금, 그리고 연필 자국(온 날만큼 그은 바를 정 자와 메모) */
export function plaster(W, H, scale, visits) {
  const [c, g] = mk(W * scale, H * scale)
  g.scale(scale, scale)
  g.fillStyle = '#B9B1A3'; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 140; i++) {
    const x = rnd(0, W), y = rnd(0, H), r = rnd(30, 240)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    const light = Math.random() < 0.5
    gr.addColorStop(0, light ? `rgba(225,218,204,${rnd(0.04, 0.1)})` : `rgba(120,110,95,${rnd(0.03, 0.08)})`); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  g.lineCap = 'round'
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(235,228,214,${rnd(0.03, 0.06)})`; g.lineWidth = rnd(10, 34); g.beginPath(); const x = rnd(0, W), y = rnd(0, H); g.arc(x, y, rnd(80, 300), rnd(0, 6), rnd(0, 6) + rnd(0.3, 0.9)); g.stroke() }
  // 금
  for (let i = 0; i < 3; i++) {
    let x = rnd(0, W), y = rnd(0, H), a = rnd(0, Math.PI * 2)
    g.strokeStyle = 'rgba(70,62,52,.45)'; g.lineWidth = 0.9
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 60; k++) { a += rnd(-0.5, 0.5); x += Math.cos(a) * rnd(3, 8); y += Math.sin(a) * rnd(3, 8); g.lineTo(x, y) }
    g.stroke()
  }
  // 물 자국
  const wx = rnd(W * 0.65, W * 0.95), wy = rnd(0, H * 0.25), wr = rnd(90, 180)
  const wgr = g.createRadialGradient(wx, wy, wr * 0.5, wx, wy, wr)
  wgr.addColorStop(0, 'rgba(140,110,70,.05)'); wgr.addColorStop(0.9, 'rgba(120,90,50,.16)'); wgr.addColorStop(1, 'rgba(120,90,50,0)')
  g.fillStyle = wgr; g.fillRect(wx - wr, wy - wr, wr * 2, wr * 2)

  // 연필
  const graphite = (a) => `rgba(52,50,56,${a})`
  const line = (x1, y1, x2, y2) => {
    for (let p = 0; p < 3; p++) {
      g.strokeStyle = graphite(p === 0 ? 0.62 : 0.22); g.lineWidth = p === 0 ? 1.3 : 0.9
      g.beginPath(); g.moveTo(x1 + rnd(-0.6, 0.6), y1 + rnd(-0.6, 0.6)); g.quadraticCurveTo((x1 + x2) / 2 + rnd(-1.2, 1.2), (y1 + y2) / 2 + rnd(-1.2, 1.2), x2 + rnd(-0.6, 0.6), y2 + rnd(-0.6, 0.6)); g.stroke()
    }
  }
  const hand = (text, x, y, size, a = 0.68) => {
    g.font = `600 ${size}px "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif`
    g.textBaseline = 'middle'
    let cx = x
    for (const ch of text) {
      const w = g.measureText(ch).width
      g.save(); g.translate(cx + w / 2, y + rnd(-1.2, 1.2)); g.rotate(rnd(-0.08, 0.08))
      g.fillStyle = graphite(a); g.fillText(ch, -w / 2, 0)
      g.fillStyle = graphite(a * 0.35); g.fillText(ch, -w / 2 + 0.5, 0.4)
      g.restore()
      cx += w * rnd(0.92, 1.04)
    }
  }
  const n = Math.max(1, Math.min(visits, 60))
  const tw = 9, th = 24
  const groups = Math.ceil(n / 5)
  const perRow = 6
  const ox = W * 0.5 - Math.min(groups, perRow) * (tw * 5 + 10) / 2, oy = H * 0.42
  hand('온 날', ox, oy - 22, 15)
  for (let i = 0; i < n; i++) {
    const gi = Math.floor(i / 5), k = i % 5
    const gx = ox + (gi % perRow) * (tw * 5 + 10), gy = oy + Math.floor(gi / perRow) * (th + 14)
    if (k < 4) line(gx + k * tw, gy, gx + k * tw + rnd(-1, 1), gy + th)
    else line(gx - 4, gy + th * 0.75, gx + tw * 3 + 4, gy + th * 0.2)
  }
  const below = oy + Math.ceil(groups / perRow) * (th + 14) + 18
  hand('더 아래에도 있음', ox, below, 14, 0.6)
  line(ox + 120, below - 6, ox + 120, below + 16); line(ox + 115, below + 10, ox + 120, below + 17); line(ox + 125, below + 10, ox + 120, below + 17)
  hand('DL-010 관측 중', W * 0.5 + 60, below + 44, 11, 0.5)
  g.setTransform(1, 0, 0, 1, 0, 0)
  grain(g, c.width, c.height, 16)
  return c
}
