import * as THREE from 'three'

/* 두레박에 담겨 올라오는 것들. 대부분은 물이고, 가끔 우물 바닥에 있던 물건이 딸려 온다.
   물건은 모두 캔버스로 그린 그림을 얇은 판·작은 모형에 붙인 것(내려받는 데이터 없음). */

// 이 우물에서 몇 번째 두레박에 무엇이 올라오는가(방문을 넘어 이어진다). 그 뒤로는 대개 물
export const SCHEDULE = ['water', 'water', 'letter', 'water', 'heavy', 'watch', 'water', 'photo', 'nametag', 'blue', 'key']
export const COLLECTIBLES = ['letter', 'watch', 'photo', 'nametag', 'blue', 'key']

export function contentFor(haul) {
  if (haul < SCHEDULE.length) return SCHEDULE[haul]
  return Math.random() < 0.12 ? 'heavy' : 'water'
}

const WATER_LINES = ['물. 달이 비친다.', '물. 생각보다 따뜻하다.', '물. 아주 차갑다.', '물. 달이 두 개 비친다.']
export function caption(kind, { haul, thrown, now = new Date() }) {
  switch (kind) {
    case 'water': return haul === 0 ? WATER_LINES[0] : haul === 1 ? WATER_LINES[1] : haul > 11 && Math.random() < 0.3 ? WATER_LINES[3] : WATER_LINES[2]
    case 'letter': return '젖은 편지. “거기 위는 아직 밤인가요”'
    case 'heavy': return '빈 두레박. 올라오는 내내 무거웠다.'
    case 'watch': return `멈춘 손목시계. ${now.getHours()}시 ${String(now.getMinutes()).padStart(2, '0')}분에 서 있다.`
    case 'photo': return '사진 한 장. 아래에서 올려다본 우물 입구.'
    case 'nametag': return '명찰. 3학년 2반. 이름은 물에 번졌다.'
    case 'blue': return thrown > 0 ? '파란 돌. 전에 던진 돌일까.' : '파란 돌.'
    case 'key': return '열쇠. 꼬리표에 ‘뚜껑’이라고 적혀 있다.'
    default: return ''
  }
}
export const TWO_MOONS = WATER_LINES[3]

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')] }
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
const rnd = (a, b) => a + Math.random() * (b - a)
const hand = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif'

function letterTexture() {
  const [c, g] = canvas(512, 384)
  g.fillStyle = '#a8a397'; g.fillRect(0, 0, 512, 384)
  for (let i = 0; i < 14; i++) { const x = rnd(0, 512), y = rnd(0, 384), r = rnd(30, 120); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(90,86,80,.22)'); gr.addColorStop(1, 'rgba(90,86,80,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2) }
  g.strokeStyle = 'rgba(80,90,110,.25)'; g.lineWidth = 1
  for (let y = 70; y < 384; y += 38) { g.beginPath(); g.moveTo(30, y); g.lineTo(482, y); g.stroke() }
  const lines = [['거기 위는', 0.85], ['아직 밤인가요', 0.85], ['여기는 계속', 0.35], ['물이 ', 0.2], ['줄을 끊지 마세요', 0.7]]
  g.font = `600 38px ${hand}`; g.textBaseline = 'alphabetic'
  lines.forEach(([t, a], i) => {
    for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(16,20,34,${(a * (k ? 0.22 : 0.92)).toFixed(2)})`; g.fillText(t, 46 + rnd(-2, 2) + k * 1.5, 62 + i * 38 + rnd(-1, 1) + k * 2.2) } // 번진 잉크
  })
  return canvasTex(c)
}
function watchTexture(now) {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#dedad2'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(80,70,50,.18)'; g.beginPath(); g.arc(150, 160, 90, 0, Math.PI * 2); g.fill() // 물 얼룩
  g.strokeStyle = '#2a2a2c'
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 108 : 98; g.lineWidth = i % 5 ? 2 : 5; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); g.stroke() }
  const h = (now.getHours() % 12) + now.getMinutes() / 60, m = now.getMinutes()
  const handLine = (a, len, w) => { g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke() }
  g.strokeStyle = '#1a1a1c'; handLine((h / 12) * Math.PI * 2, 58, 8); handLine((m / 60) * Math.PI * 2, 88, 5)
  g.fillStyle = '#1a1a1c'; g.beginPath(); g.arc(128, 128, 7, 0, Math.PI * 2); g.fill()
  // 유리에 김
  const gr = g.createRadialGradient(90, 80, 10, 128, 128, 130); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill()
  return canvasTex(c)
}
// 우물 바닥에서 올려다본 사진: 둥근 밤하늘, 달, 그리고 테두리에서 내려다보는 사람 머리
function photoTexture() {
  const [c, g] = canvas(320, 380)
  g.fillStyle = '#e4e1da'; g.fillRect(0, 0, 320, 380)
  g.fillStyle = '#0b0b0c'; g.fillRect(20, 20, 280, 280)
  g.save(); g.beginPath(); g.rect(20, 20, 280, 280); g.clip()
  // 위로 좁아지는 돌벽(동심원)
  for (let r = 200; r > 60; r -= 9) { g.strokeStyle = `rgba(120,120,124,${(0.05 + (200 - r) / 1400).toFixed(3)})`; g.lineWidth = 3; g.beginPath(); g.arc(160, 150, r, 0, Math.PI * 2); g.stroke() }
  const sky = g.createRadialGradient(160, 150, 0, 160, 150, 62); sky.addColorStop(0, '#5e6168'); sky.addColorStop(1, '#30323a')
  g.fillStyle = sky; g.beginPath(); g.arc(160, 150, 58, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#d8dae0'; g.beginPath(); g.arc(186, 128, 6, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#0b0b0c' // 머리와 어깨 실루엣
  g.beginPath(); g.ellipse(138, 104, 15, 18, -0.3, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.ellipse(124, 92, 30, 12, -0.5, 0, Math.PI * 2); g.fill()
  g.restore()
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0, 0.08)})`; g.fillRect(rnd(20, 300), rnd(20, 300), 1.2, 1.2) }
  g.fillStyle = 'rgba(60,60,64,.55)'; g.font = `500 18px ${hand}`; g.fillText('위', 150, 340)
  return canvasTex(c)
}
function nametagTexture() {
  const [c, g] = canvas(320, 128)
  g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, 320, 128)
  g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, 320, 30)
  g.fillStyle = '#e8e6e0'; g.font = `700 18px ${hand}`; g.fillText('3학년 2반', 16, 22)
  g.fillStyle = 'rgba(30,30,34,.85)'; g.font = `800 44px ${hand}`; g.fillText('김', 26, 92)
  g.filter = 'blur(5px)'; g.fillStyle = 'rgba(30,30,34,.55)'; g.fillText('○○', 86, 94); g.filter = 'none'
  return canvasTex(c)
}
function tagTexture() {
  const [c, g] = canvas(160, 96)
  g.fillStyle = '#d6d1c4'; g.fillRect(0, 0, 160, 96)
  g.fillStyle = 'rgba(30,30,34,.85)'; g.font = `700 36px ${hand}`; g.fillText('뚜껑', 30, 62)
  return canvasTex(c)
}

/* 물건 모형(가로 약 0.2m). 두레박 안에서 보여 주고, 그 뒤 우물 둘레 돌 위에 놓인다 */
export function makeItem(kind, { now = new Date(), blueMat } = {}) {
  const group = new THREE.Group()
  const paper = (map, w, h, bend = 0.02) => {
    const geo = new THREE.PlaneGeometry(w, h, 12, 4)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * Math.PI * 2) * bend + Math.random() * 0.002)
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.92, side: THREE.DoubleSide }))
    m.rotation.x = -Math.PI / 2
    return m
  }
  if (kind === 'letter') group.add(paper(letterTexture(), 0.2, 0.15, 0.012))
  else if (kind === 'photo') group.add(paper(photoTexture(), 0.11, 0.13, 0.004))
  else if (kind === 'nametag') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.045), [
      new THREE.MeshStandardMaterial({ color: '#d0cec8', roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#d0cec8', roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: nametagTexture(), roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: '#d0cec8', roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: '#d0cec8', roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#d0cec8', roughness: 0.4 }),
    ])
    group.add(m)
  } else if (kind === 'watch') {
    const metal = new THREE.MeshStandardMaterial({ color: '#8c8c90', metalness: 0.85, roughness: 0.35 })
    const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.011, 32), metal)
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.027, 32), new THREE.MeshStandardMaterial({ map: watchTexture(now), roughness: 0.25 }))
    face.rotation.x = -Math.PI / 2; face.position.y = 0.0058
    const strap = new THREE.MeshStandardMaterial({ color: '#2c2b2a', roughness: 0.8 })
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.075), strap); b.position.set(0, -0.002, s * 0.065); b.rotation.x = s * 0.12; group.add(b) }
    group.add(caseM, face)
  } else if (kind === 'blue') {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), blueMat)
    m.scale.set(1, 0.7, 0.85)
    group.add(m)
  } else if (kind === 'key') {
    const iron = new THREE.MeshStandardMaterial({ color: '#555558', metalness: 0.8, roughness: 0.55 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 24), iron); ring.rotation.x = Math.PI / 2; ring.position.x = -0.05
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.08, 8), iron); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.005
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.02), iron); bit.position.set(0.038, 0, 0.012)
    const tag = paper(tagTexture(), 0.05, 0.03, 0.002); tag.position.set(-0.05, 0.001, 0.035); tag.rotation.z = 0.5
    group.add(ring, shaft, bit, tag)
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  group.userData.kind = kind
  return group
}
