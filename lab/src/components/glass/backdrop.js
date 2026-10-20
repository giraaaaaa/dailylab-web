/* 유리 너머 풍경 — 밤의 쇼윈도 안쪽 네온사인. 글자와 타일 줄눈이 있어야 깨진 조각마다 굴절이 어긋나 보인다 */

const LINES = [
  ['깨뜨려 보세요', 'FRAGILE · 취급주의'],
  ['한 번 더?', 'ONE MORE PANE'],
  ['시원하죠', 'HANDLE WITHOUT CARE'],
  ['또 있어요', 'PLENTY OF GLASS'],
]

export const backdropLines = LINES.length

export function drawBackdrop(canvas, w, h, round) {
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  const s = Math.min(w, h)

  const bg = g.createRadialGradient(w * 0.5, h * 0.45, s * 0.05, w * 0.5, h * 0.5, Math.max(w, h) * 0.75)
  bg.addColorStop(0, '#0d2a2c')
  bg.addColorStop(0.55, '#061416')
  bg.addColorStop(1, '#020607')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)

  // 타일 벽 줄눈
  const tile = s * 0.085
  g.strokeStyle = 'rgba(160, 220, 210, 0.07)'
  g.lineWidth = Math.max(1, s * 0.0016)
  g.beginPath()
  for (let y = (h / 2) % tile; y < h; y += tile) { g.moveTo(0, y); g.lineTo(w, y) }
  for (let row = 0, y = (h / 2) % tile - tile; y < h; y += tile, row++) {
    for (let x = ((row % 2) * tile) / 2 - tile; x < w; x += tile) { g.moveTo(x, y); g.lineTo(x, y + tile) }
  }
  g.stroke()

  // 멀리 번진 불빛
  let seed = 17 + round * 31
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h * 0.9, r = s * (0.015 + rnd() * 0.06)
    const warm = rnd() < 0.45
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, warm ? 'rgba(255, 190, 130, 0.22)' : 'rgba(94, 234, 212, 0.18)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }

  const [title, sub] = LINES[round % LINES.length]
  const font = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif'
  const size = Math.min(w * 0.13 * (7 / Math.max(5, title.length)), h * 0.17)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const neon = (text, px, weight, color, core, y) => {
    g.font = `${weight} ${px}px ${font}`
    for (const [blur, alpha] of [[px * 0.9, 0.55], [px * 0.4, 0.75], [px * 0.12, 1]]) {
      g.shadowColor = color
      g.shadowBlur = blur
      g.globalAlpha = alpha
      g.fillStyle = color
      g.fillText(text, w / 2, y)
    }
    g.shadowBlur = 0
    g.globalAlpha = 1
    g.fillStyle = core
    g.fillText(text, w / 2, y)
  }
  neon(title, size, 800, '#2dd4bf', '#e9fffb', h * 0.46)
  neon(sub, size * 0.24, 600, '#ffb27a', '#fff3e6', h * 0.46 + size * 0.85)
  return canvas
}
