/* DL-009 주파수. 원통에 인쇄된 눈금이 바늘 아래로 돌아가는 옛 라디오 다이얼.
   - 다이얼: 끌면 돌고, 놓으면 관성으로 구르다 0.1MHz 칸에 '딸깍' 걸린다. 108 너머는 뻑뻑하지만 조금 더 돌아간다.
   - 소리: 잡음·맥놀이 휘파람·험은 Web Audio로 그 자리에서 만들고, 방송(재즈·오르골·합창)과 시보는 생성 모델로 만든 m4a.
     모든 방송은 같은 라디오 필터(대역 제한 + 약한 찌그러짐)를 지난다.
   - 방송은 실제 시계를 따라 계속 나간다. 맞추는 순간 중간부터 들린다.
   - 숫자 방송과 '끝 너머'는 브라우저 음성(한국어)이 읽는다. 한국어 음성이 없으면 신호음으로 대신한다.
   - 화면 아래 스피커 망은 실제 출력 파형(소리를 켰을 때) 또는 같은 규칙으로 흉내 낸 파형으로 점이 켜진다. */

const MEMORY = 'dl-radio'
const MIN = 87.5
const DIAL_END = 108 // 인쇄된 눈금의 끝
const MAX = 109.4 // 실제로 돌아가는 끝
const COBALT = [42, 75, 255]
const DIGITS = ['공', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']

const STATIONS = [
  { id: 'hour', f: 88.8, kind: 'hour' },
  { id: 'jazz', f: 91.9, kind: 'loop', sound: 'radio-jazz', level: 0.85, lines: ['밤의 재즈', '녹음된 날짜 모름', '신청곡을 받지 않습니다'] },
  { id: 'lullaby', f: 95.3, kind: 'loop', sound: 'radio-musicbox', level: 1.15, lines: ['자장가', '302호 아이에게', '잘 자'] },
  { id: 'choir', f: 99.1, kind: 'loop', sound: 'radio-choir', level: 0.9, fading: true, lines: ['먼 곳', '신호 약함', '아직 부르고 있습니다'] },
  { id: 'numbers', f: 104.3, kind: 'numbers' },
  { id: 'beyond', f: 108.7, kind: 'beyond' },
]
export const STATION_COUNT = STATIONS.length

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const read = (key, fallback) => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return { ...fallback } } }
const pad = (n, len) => String(Math.max(0, Math.floor(n)) % 10 ** len).padStart(len, '0')

/* 숫자 방송의 한 바퀴(28초): 시보 → 다섯 자리 세 묶음. 첫 묶음은 지금 시각, 둘째는 우물에 던진 돌, 셋째는 날짜로 정해지는 수 */
const NUM_CYCLE = 28
const NUM_START = 4.2
const NUM_STEP = 0.95
const NUM_GAP = 1.5
function numberGroups(cycleStart, memory) {
  const d = new Date(cycleStart * 1000)
  const well = read('dl-well', { thrown: 0 })
  let seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()
  seed = (seed * 2654435761) >>> 0
  return [
    pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + (memory.visits % 10),
    pad(well.thrown, 5),
    pad(seed % 100000, 5),
  ]
}
const digitTime = (g, i) => NUM_START + g * (5 * NUM_STEP + NUM_GAP) + i * NUM_STEP

/* '끝 너머'에서 읽는 문장. 다른 방에 남긴 흔적(이 브라우저의 localStorage)만 읽는다 */
function beyondLines(memory) {
  const well = read('dl-well', { thrown: 0, returned: 0, visits: 0 })
  const mirror = read('dl-mirror', { visits: 0 })
  const now = new Date()
  const lines = ['여기는 눈금이 끝난 곳입니다.']
  lines.push(memory.visits > 1 ? `이 라디오를 켠 건 ${memory.visits}번째입니다.` : '처음 오셨군요.')
  if (well.thrown) lines.push(`우물에 돌을 ${well.thrown}개 던졌습니다.`)
  if (well.returned) lines.push(`파란 돌 ${well.returned}개는 저희가 올려 보냈습니다.`)
  if (mirror.visits) lines.push(`거울 앞에는 ${mirror.visits}번 섰습니다.`)
  if (!well.visits && !mirror.visits) lines.push('아직 우물에도, 거울에도 가지 않았습니다.')
  lines.push(`지금은 ${now.getHours()}시 ${now.getMinutes()}분입니다.`)
  lines.push('이 주파수를 듣는 사람은 지금 둘입니다.')
  return lines
}
const BEYOND_STEP = 5.2

export function createRadio(canvas, { sfx, onStats, onRds, onLayout }) {
  const g = canvas.getContext('2d')
  if (!g) throw new Error('2d canvas unavailable')

  const memory = read(MEMORY, { visits: 0, found: [], last: 90.4 })
  memory.visits += 1
  const save = () => { try { localStorage.setItem(MEMORY, JSON.stringify(memory)) } catch { /* 저장 불가 */ } }
  save()

  let W = 1, H = 1, dpr = 1
  let f = clamp(Number(memory.last) || 90.4, MIN, MAX)
  let v = 0
  let seekTarget = null
  let drag = null
  let paused = false
  let raf = 0
  let last = performance.now()
  let lamp = 0 // 다이얼 등이 켜지는 정도(처음 켤 때 한두 번 깜빡이며 들어온다)
  const born = performance.now()
  let soundOn = false
  let lastDetent = Math.round(f * 10)
  let lastClick = 0
  let lockTime = 0
  let stats = {}
  let rdsShown = ''
  let rdsAt = 0
  const strengths = Object.fromEntries(STATIONS.map((s) => [s.id, 0]))

  /* ---------- 음성 ---------- */
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  let voice = null
  const pickVoice = () => { voice = synth?.getVoices?.().find((x) => x.lang?.toLowerCase().startsWith('ko')) || null }
  pickVoice()
  synth?.addEventListener?.('voiceschanged', pickVoice)
  let speakingFor = null
  function say(text, station, { rate = 0.85, pitch = 0.7 } = {}) {
    if (!synth || !voice || !soundOn) return false
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice; u.lang = voice.lang; u.rate = rate; u.pitch = pitch; u.volume = 0.85
    synth.speak(u)
    speakingFor = station
    return true
  }
  const hush = () => { if (speakingFor) { synth?.cancel(); speakingFor = null } }

  /* ---------- 소리 사슬 ---------- */
  let audio = null
  function ensureAudio() {
    if (audio || !sfx.ctx || !sfx.out) return audio
    const ctx = sfx.ctx
    const bus = ctx.createGain()
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170; hp.Q.value = 0.6
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4300; lp.Q.value = 0.8
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.7) / Math.tanh(1.7) }
    shaper.curve = curve
    const out = ctx.createGain(); out.gain.value = 0.9
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0
    bus.connect(hp); hp.connect(lp); lp.connect(shaper); shaper.connect(out); out.connect(sfx.out); out.connect(analyser)

    // 잡음: 분홍빛 잡음에 드문드문 '틱' 하는 튐을 섞어 4초짜리를 만들어 돌린다
    const len = ctx.sampleRate * 4
    const nb = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = nb.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, pop = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913
      if (Math.random() < 0.00012) pop = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8)
      pop *= 0.93
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16 + pop
    }
    for (let i = 0; i < 2000; i++) { const k = i / 2000; d[i] = d[i] * k + d[len - 2000 + i] * (1 - k) } // 이음매
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2000; band.Q.value = 0.5
    const staticGain = ctx.createGain(); staticGain.gain.value = 0
    noise.connect(band); band.connect(staticGain); staticGain.connect(bus); noise.start()

    // 휘파람: 방송 근처를 지날 때 높낮이가 미끄러지는 맥놀이 소리
    const whistle = ctx.createOscillator(); whistle.type = 'sine'; whistle.frequency.value = 1200
    const whistleGain = ctx.createGain(); whistleGain.gain.value = 0
    whistle.connect(whistleGain); whistleGain.connect(bus); whistle.start()

    // 방송마다 문(gain) 하나. 다이얼이 가까울수록 열린다
    const doors = {}
    for (const s of STATIONS) { const n = ctx.createGain(); n.gain.value = 0; n.connect(bus); doors[s.id] = n }
    // 합창은 더 멀리서: 한 번 더 깎고 잔향을 보낸다
    const far = ctx.createBiquadFilter(); far.type = 'lowpass'; far.frequency.value = 2400; far.connect(doors.choir)
    sfx.reverb(2.6, 2.4, 0.35)
    const loops = {}
    for (const s of STATIONS) if (s.kind === 'loop') loops[s.id] = sfx.loop(s.sound, { gain: s.level, dest: s.id === 'choir' ? far : doors[s.id], send: s.id === 'choir' ? 0.25 : 0 })

    // 88.8의 빈 반송파: 아주 낮은 험. 끝 너머: 맥놀이하는 두 사인
    const hum = ctx.createGain(); hum.gain.value = 0.022; hum.connect(doors.hour)
    for (const [hz, a] of [[60, 1], [120, 0.5], [180, 0.25]]) { const o = ctx.createOscillator(); o.frequency.value = hz; const gg = ctx.createGain(); gg.gain.value = a; o.connect(gg); gg.connect(hum); o.start() }
    const pad = ctx.createGain(); pad.gain.value = 0.035; pad.connect(doors.beyond)
    for (const hz of [110, 110.6, 164.9]) { const o = ctx.createOscillator(); o.frequency.value = hz; o.connect(pad); o.start() }

    audio = { ctx, bus, analyser, band, staticGain, whistle, whistleGain, doors, loops, buf: new Float32Array(analyser.fftSize) }
    return audio
  }

  function tone(dest, at, hz, dur, gain = 0.12) {
    if (!audio) return
    const { ctx } = audio
    const t0 = ctx.currentTime + at
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = hz * 0.006
    vib.connect(vg); vg.connect(o.frequency)
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(gain, t0 + 0.02); e.gain.setValueAtTime(gain, t0 + dur - 0.05); e.gain.linearRampToValueAtTime(0, t0 + dur)
    o.connect(e); e.connect(dest)
    o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05)
  }

  /* ---------- 방송 일정(실제 시계를 따른다) ---------- */
  const activity = Object.fromEntries(STATIONS.map((s) => [s.id, 0])) // 그림용: 지금 말하거나 울리는 중인지
  const prevPhase = {}
  let beyond = beyondLines(memory)
  let numbers = { cycle: -1, groups: [] }

  function crossed(id, phase, t) {
    const p = prevPhase[id]
    if (p === undefined) return false
    return p <= phase ? t > p && t <= phase : t > p || t <= phase
  }

  function broadcast(now) {
    const sec = now / 1000
    // 숫자 방송
    const cyc = Math.floor(sec / NUM_CYCLE)
    if (cyc !== numbers.cycle) numbers = { cycle: cyc, groups: numberGroups(cyc * NUM_CYCLE, memory) }
    const np = sec % NUM_CYCLE
    const sN = strengths.numbers
    let act = np < 3.4 ? 0.7 : 0
    if (crossed('numbers', np, 0.01) && audio && sN > 0.02) sfx.play('radio-chime', { gain: 0.9, dest: audio.doors.numbers })
    for (let gi = 0; gi < 3; gi++) for (let i = 0; i < 5; i++) {
      const t = digitTime(gi, i)
      if (np >= t && np < t + 0.5) act = 1
      if (!crossed('numbers', np, t)) continue
      const digit = Number(numbers.groups[gi][i])
      if (!(sN > 0.6 && say(DIGITS[digit], 'numbers', { rate: 0.8, pitch: 0.55 })) && audio && sN > 0.02) tone(audio.doors.numbers, 0, 520 * 2 ** (digit / 12), 0.42)
    }
    activity.numbers = act
    prevPhase.numbers = np

    // 끝 너머
    const bl = 3 + beyond.length * BEYOND_STEP + 4
    const bp = sec % bl
    if (prevPhase.beyond !== undefined && bp < prevPhase.beyond) beyond = beyondLines(memory) // 한 바퀴 돌면 시각을 새로 읽는다
    const sB = strengths.beyond
    activity.beyond = 0
    beyond.forEach((line, i) => {
      const t = 3 + i * BEYOND_STEP
      if (bp >= t && bp < t + line.length * 0.16) activity.beyond = 1
      if (!crossed('beyond', bp, t)) return
      if (!(sB > 0.6 && say(line, 'beyond', { rate: 0.82, pitch: 0.62 })) && audio && sB > 0.02) {
        // 음성이 없으면 글자 수만큼 낮게 떨리는 신호음
        let hz = 300
        for (let k = 0; k < Math.min(18, line.replace(/\s/g, '').length); k++) { hz *= 2 ** ((Math.random() - 0.5) * 0.4); tone(audio.doors.beyond, k * 0.17, hz, 0.14, 0.1) }
      }
    })
    prevPhase.beyond = bp

    // 88.8: 평소엔 빈 반송파, 정각(매시 0~2분)에만 방송
    const minute = new Date().getMinutes()
    const hp = sec % 20
    const sH = strengths.hour
    activity.hour = 0
    if (minute < 3) {
      if (crossed('hour', hp, 0.01) && audio && sH > 0.02) sfx.play('radio-chime', { gain: 0.9, rate: 0.84, dest: audio.doors.hour })
      if (hp < 3.4) activity.hour = 0.7
      if (crossed('hour', hp, 4.2) && sH > 0.6) say('정각입니다.', 'hour', { rate: 0.8, pitch: 0.6 })
      if (crossed('hour', hp, 6.4) && sH > 0.6) say('지금 이 주파수를 듣는 사람은, 당신까지 둘입니다.', 'hour', { rate: 0.8, pitch: 0.6 })
      if ((hp > 4.2 && hp < 5.4) || (hp > 6.4 && hp < 10.5)) activity.hour = 1
    }
    prevPhase.hour = hp
  }

  function rdsText(now) {
    // 가장 가까운 방송
    let best = STATIONS[0], bs = 0
    for (const s of STATIONS) if (strengths[s.id] > bs) { bs = strengths[s.id]; best = s }
    if (bs < 0.3) return ''
    const sec = Math.floor(now / 1000)
    let text = ''
    if (best.kind === 'loop') text = best.lines[Math.floor(sec / 4) % best.lines.length]
    else if (best.kind === 'numbers') {
      const np = (now / 1000) % NUM_CYCLE
      text = np < NUM_START - 0.6 ? '· · ·' : numbers.groups.map((grp, gi) => grp.split('').map((c, i) => (np >= digitTime(gi, i) ? c : '')).join('')).filter(Boolean).join('  ')
    } else if (best.kind === 'beyond') {
      const bl = 3 + beyond.length * BEYOND_STEP + 4
      const bp = (now / 1000) % bl
      const i = Math.floor((bp - 3) / BEYOND_STEP)
      text = i >= 0 && i < beyond.length && bp - 3 - i * BEYOND_STEP < BEYOND_STEP - 0.4 ? beyond[i] : ''
    } else {
      const hp = (now / 1000) % 20
      text = new Date().getMinutes() < 3 ? (hp < 4.2 ? '· · ·' : hp < 6.4 ? '정각입니다.' : '지금 이 주파수를 듣는 사람은, 당신까지 둘입니다.') : '정각에.'
    }
    // 신호가 약하면 글자가 깨진다
    const broken = 1 - smooth(0.3, 0.85, bs)
    if (broken > 0.02) text = text.split('').map((c) => (c !== ' ' && Math.random() < broken * 0.8 ? '▯·_░'[Math.floor(Math.random() * 4)] : c)).join('')
    return text
  }

  /* ---------- 다이얼 물리 ---------- */
  function pxPerMHz() { return clamp(dial().w / 7, 70, 150) }
  function click(speed) {
    const now = performance.now()
    if (now - lastClick < 34) return
    lastClick = now
    sfx.play('radio-click', { gain: clamp(0.5 - speed * 0.02, 0.18, 0.5), rate: 0.92 + Math.random() * 0.16 })
  }
  function step(dt) {
    const prev = f
    if (drag) {
      // 손을 따라간다(위치는 포인터에서 바로 정해진다)
    } else if (seekTarget !== null) {
      const want = clamp((seekTarget - f) * 3.2, -7, 7)
      const min = 0.7 * Math.sign(seekTarget - f)
      v += ((Math.abs(want) < 0.7 ? min : want) - v) * Math.min(1, dt * 5)
      f += v * dt
      if (Math.abs(seekTarget - f) < 0.02 || Math.sign(seekTarget - f) !== Math.sign(v)) { f = seekTarget; seekTarget = null; v = 0 }
    } else if (Math.abs(v) > 0.35) {
      f += v * dt
      v *= Math.exp(-dt * (f > DIAL_END && v > 0 ? 7 : 2.3)) // 108 너머는 뻑뻑하다
    } else {
      // 칸에 걸린다(스프링)
      const target = Math.round(f * 10) / 10
      const k = 170
      v += (k * (target - f) - 2 * 0.85 * Math.sqrt(k) * v) * dt
      f += v * dt
      if (Math.abs(target - f) < 0.0004 && Math.abs(v) < 0.003) { f = target; v = 0 }
    }
    if (f < MIN) { f = MIN; if (v < -0.5) click(0); v = Math.abs(v) * 0.2 }
    if (f > MAX) { f = MAX; if (v > 0.5) click(0); v = -Math.abs(v) * 0.2 }
    const det = Math.round(f * 10)
    if (det !== lastDetent) { click(Math.abs(f - prev) / Math.max(dt, 1e-3)); lastDetent = det }
  }

  /* ---------- 그리기 ---------- */
  const isSmall = () => W < 640
  function dial() {
    const w = Math.min(W * (isSmall() ? 0.92 : 0.8), 1060)
    const h = clamp(H * 0.16, 96, 150)
    const y = isSmall() ? Math.max(170, H * 0.27) : clamp(H * 0.24, 130, 260)
    return { x: (W - w) / 2, y, w, h }
  }
  function grille() {
    const D = dial()
    const top = D.y + D.h + (isSmall() ? 70 : 84)
    const bottom = H - (isSmall() ? 190 : 120)
    const w = Math.min(W * (isSmall() ? 0.92 : 0.64), 760)
    return { x: (W - w) / 2, y: top, w, h: Math.max(60, bottom - top) }
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
  }

  function drawDial() {
    const D = dial()
    const R = D.w / 2
    const cx = D.x + R
    const ppm = pxPerMHz()
    const L = lamp

    // 창 바깥 그림자와 테
    g.save()
    g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 40; g.shadowOffsetY = 14
    roundRect(D.x, D.y, D.w, D.h, 14); g.fillStyle = '#121214'; g.fill()
    g.restore()

    // 등에 비친 원통: 가운데가 밝고 양끝으로 둥글게 어두워진다
    g.save()
    roundRect(D.x, D.y, D.w, D.h, 14); g.clip()
    const cyl = g.createLinearGradient(D.x, 0, D.x + D.w, 0)
    const lit = (a) => `rgb(${Math.round(18 + (232 - 18) * a * L)},${Math.round(18 + (229 - 18) * a * L)},${Math.round(20 + (222 - 20) * a * L)})`
    for (let i = 0; i <= 12; i++) { const u = i / 12; cyl.addColorStop(u, lit(Math.pow(Math.sin(u * Math.PI), 0.9) * 0.96 + 0.04)) }
    g.fillStyle = cyl; g.fillRect(D.x, D.y, D.w, D.h)
    const vert = g.createLinearGradient(0, D.y, 0, D.y + D.h)
    vert.addColorStop(0, 'rgba(0,0,0,.28)'); vert.addColorStop(0.18, 'rgba(0,0,0,0)'); vert.addColorStop(0.8, 'rgba(0,0,0,0)'); vert.addColorStop(1, 'rgba(0,0,0,.32)')
    g.fillStyle = vert; g.fillRect(D.x, D.y, D.w, D.h)

    // 눈금(원통에 인쇄): x = R·sin(θ), θ = 호의 길이/R. 가장자리로 갈수록 좁아지고 옅어진다
    const span = (R * Math.PI / 2) / ppm
    const base = D.y + D.h * 0.8
    const ink = (a) => `rgba(22,22,24,${(a * L).toFixed(3)})`
    for (let k = Math.ceil((f - span) * 10); k <= Math.floor((f + span) * 10); k++) {
      const fr = k / 10
      if (fr < MIN - 1e-6 || fr > MAX + 1e-6) continue
      const th = ((fr - f) * ppm) / R
      if (Math.abs(th) > Math.PI / 2 * 0.985) continue
      const c = Math.cos(th)
      const x = cx + R * Math.sin(th)
      const major = k % 10 === 0, mid = k % 5 === 0
      const beyondDial = fr > DIAL_END + 1e-6
      const fade = beyondDial ? Math.max(0, 1 - (fr - DIAL_END) * 0.9) * 0.55 : 1
      const len = D.h * (major ? 0.34 : mid ? 0.22 : 0.13)
      g.strokeStyle = ink(Math.pow(c, 0.7) * (major ? 0.95 : 0.7) * fade)
      g.lineWidth = (major ? 1.6 : 1.1) * (0.35 + 0.65 * c)
      g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - len); g.stroke()
      if (major && !beyondDial) {
        g.save(); g.translate(x, D.y + D.h * 0.3); g.scale(Math.max(0.05, c), 1)
        g.fillStyle = ink(Math.pow(c, 0.9) * 0.92)
        g.font = `600 ${Math.round(D.h * 0.2)}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText(String(Math.round(fr)), 0, 0)
        g.restore()
      }
    }
    // 찾아 둔 방송: 원통에 연필로 찍은 점(코발트)
    for (const s of STATIONS) {
      if (!memory.found.includes(s.id)) continue
      const th = ((s.f - f) * ppm) / R
      if (Math.abs(th) > Math.PI / 2 * 0.95) continue
      const c = Math.cos(th)
      g.fillStyle = `rgba(${COBALT.join(',')},${(0.85 * c * L).toFixed(3)})`
      g.beginPath(); g.ellipse(cx + R * Math.sin(th), base + D.h * 0.09, 3 * c + 0.5, 3, 0, 0, Math.PI * 2); g.fill()
    }
    // 유리: 위쪽 반사와 가장자리 그늘
    const glass = g.createLinearGradient(0, D.y, 0, D.y + D.h)
    glass.addColorStop(0, 'rgba(255,255,255,.22)'); glass.addColorStop(0.32, 'rgba(255,255,255,.04)'); glass.addColorStop(0.33, 'rgba(255,255,255,0)')
    g.fillStyle = glass; g.fillRect(D.x, D.y, D.w, D.h)
    g.restore()

    // 바늘: 창 가운데 고정
    const strong = Math.max(...Object.values(strengths))
    g.save()
    g.shadowColor = `rgba(${COBALT.join(',')},${0.5 + strong * 0.4})`; g.shadowBlur = 10 + strong * 10
    g.strokeStyle = `rgb(${COBALT.join(',')})`; g.lineWidth = 2.2
    g.beginPath(); g.moveTo(cx, D.y + 6); g.lineTo(cx, D.y + D.h - 6); g.stroke()
    g.restore()
    g.fillStyle = `rgb(${COBALT.join(',')})`
    g.beginPath(); g.moveTo(cx - 5, D.y); g.lineTo(cx + 5, D.y); g.lineTo(cx, D.y + 7); g.fill()
    g.beginPath(); g.moveTo(cx - 5, D.y + D.h); g.lineTo(cx + 5, D.y + D.h); g.lineTo(cx, D.y + D.h - 7); g.fill()

    // 테두리, 창 밖 표시
    roundRect(D.x + 0.5, D.y + 0.5, D.w - 1, D.h - 1, 14); g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; g.stroke()
    g.font = '600 11px "Pretendard Variable", Pretendard, -apple-system, sans-serif'
    g.textBaseline = 'bottom'
    g.fillStyle = 'rgba(255,255,255,.38)'
    g.textAlign = 'left'; g.fillText('FM', D.x + 2, D.y - 12)
    g.textAlign = 'right'; g.fillText('MHz', D.x + D.w - 2, D.y - 12)
    // 수신 등
    const lx = D.x + 34, ly = D.y - 18
    g.fillStyle = strong > 0.8 ? `rgba(${COBALT.join(',')},${0.6 + 0.4 * strong})` : 'rgba(255,255,255,.12)'
    if (strong > 0.8) { g.save(); g.shadowColor = `rgb(${COBALT.join(',')})`; g.shadowBlur = 10 }
    g.beginPath(); g.arc(lx, ly, 3, 0, Math.PI * 2); g.fill()
    if (strong > 0.8) g.restore()
    g.textAlign = 'left'; g.fillStyle = strong > 0.8 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.3)'
    g.fillText('수신', lx + 9, D.y - 12)
  }

  // 스피커 망: 점 하나하나가 그 순간 파형의 높이만큼 켜진다
  let glow = null
  let cols = 0, rows = 0
  const simPhase = { t: 0 }
  function columnLevels(now, n) {
    const out = new Float32Array(n)
    const strong = Math.max(...Object.values(strengths))
    if (audio && soundOn && audio.ctx.state === 'running') {
      audio.analyser.getFloatTimeDomainData(audio.buf)
      const chunk = Math.floor(audio.buf.length / n)
      for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < chunk; j++) m = Math.max(m, Math.abs(audio.buf[i * chunk + j])); out[i] = clamp(m * 2.4, 0, 1) }
      return out
    }
    // 소리를 끈 상태: 같은 규칙으로 흉내 낸 파형
    simPhase.t += 1 / 60
    const t = simPhase.t
    const noise = 0.5 * (1 - strong * 0.95)
    let body = 0
    for (const s of STATIONS) {
      const a = strengths[s.id]
      if (a < 0.01) continue
      if (s.kind === 'loop') body += a * (s.fading ? 0.35 + 0.3 * Math.sin(t * 0.7) : 0.55) * (0.75 + 0.25 * Math.sin(t * 2.3 + s.f))
      else body += a * activity[s.id] * 0.75 + (s.id === 'hour' ? a * 0.03 : 0)
    }
    for (let i = 0; i < n; i++) {
      const wave = 0.55 + 0.45 * Math.sin(i * 0.31 + t * 8.5) * Math.sin(i * 0.071 - t * 2.7)
      out[i] = clamp(noise * Math.pow(Math.random(), 2.2) * 0.9 + body * wave * (0.7 + Math.random() * 0.3), 0, 1)
    }
    return out
  }

  function drawGrille(now) {
    const G = grille()
    const pitch = isSmall() ? 9 : 10
    const n = Math.floor(G.w / pitch), m = Math.max(5, Math.floor(G.h / pitch) | 1)
    if (n !== cols || m !== rows || !glow) { cols = n; rows = m; glow = new Float32Array(n * m) }
    const levels = columnLevels(now, n)
    const strong = Math.max(...Object.values(strengths))
    const ox = G.x + (G.w - (n - 1) * pitch) / 2, oy = G.y + (G.h - (m - 1) * pitch) / 2
    const mid = (m - 1) / 2
    const BINS = 7
    const paths = Array.from({ length: BINS }, () => new Path2D())
    const base = new Path2D()
    const rDot = pitch * 0.23
    for (let i = 0; i < n; i++) {
      const h = levels[i] * (mid + 0.6)
      for (let j = 0; j < m; j++) {
        const k = j * n + i
        const target = clamp(h - Math.abs(j - mid) + 0.5, 0, 1)
        glow[k] = Math.max(target, glow[k] * 0.8)
        const x = ox + i * pitch, y = oy + j * pitch
        const b = glow[k]
        if (b < 0.06) { base.moveTo(x + rDot, y); base.arc(x, y, rDot, 0, Math.PI * 2); continue }
        const bin = Math.min(BINS - 1, Math.floor(b * BINS))
        paths[bin].moveTo(x + rDot * 1.05, y); paths[bin].arc(x, y, rDot * 1.05, 0, Math.PI * 2)
      }
    }
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fill(base)
    const lit = [Math.round(205 + (COBALT[0] + 40 - 205) * strong), Math.round(206 + (COBALT[1] + 40 - 206) * strong), Math.round(210 + (255 - 210) * strong)]
    for (let b = 0; b < BINS; b++) {
      const a = (b + 1) / BINS
      g.fillStyle = `rgba(${lit[0]},${lit[1]},${lit[2]},${(0.12 + 0.88 * a) * lamp * (0.55 + 0.45 * strong)})` // 잡음은 흐리게, 방송은 또렷하게
      g.fill(paths[b])
    }
  }

  function draw(now) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const bg = g.createRadialGradient(W / 2, dial().y + dial().h / 2, 10, W / 2, H * 0.45, Math.max(W, H) * 0.75)
    bg.addColorStop(0, `rgb(${Math.round(24 + 10 * lamp)},${Math.round(24 + 10 * lamp)},${Math.round(27 + 10 * lamp)})`)
    bg.addColorStop(1, '#060607')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
    drawGrille(now)
    drawDial()
  }

  /* ---------- 한 프레임 ---------- */
  function updateAudio(now) {
    if (!audio && soundOn) ensureAudio()
    for (const s of STATIONS) strengths[s.id] = 1 - smooth(0.035, 0.2, Math.abs(f - s.f))
    if (!audio) return
    const { ctx, doors, staticGain, band, whistle, whistleGain } = audio
    const T = ctx.currentTime
    let strong = 0, whistleAmt = 0, whistleD = 0.1
    for (const s of STATIONS) {
      const a = strengths[s.id]
      strong = Math.max(strong, a)
      let open = Math.pow(a, 1.4)
      if (s.fading) open *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 1000 * 0.45) * Math.sin(now / 1000 * 0.13 + 1))
      doors[s.id].gain.setTargetAtTime(open, T, 0.04)
      if (s.kind !== 'hour' && s.kind !== 'beyond') {
        const d = Math.abs(f - s.f)
        const w = Math.exp(-(((d - 0.11) / 0.05) ** 2))
        if (w > whistleAmt) { whistleAmt = w; whistleD = d }
      }
    }
    const speed = Math.min(Math.abs(v), 12)
    staticGain.gain.setTargetAtTime(0.12 * (1 - strong * 0.96) * (0.85 + speed * 0.03), T, 0.03)
    band.frequency.setTargetAtTime(1500 + speed * 420, T, 0.05)
    whistle.frequency.setTargetAtTime(220 + whistleD * 14000, T, 0.02)
    whistleGain.gain.setTargetAtTime(0.03 * whistleAmt, T, 0.03)
    if (speakingFor && strengths[speakingFor] < 0.45) hush()
  }

  function report(now, dt) {
    const strong = Math.max(...Object.values(strengths))
    // 오래 맞춰 두면 '찾은 방송'으로 남는다
    let near = null
    for (const s of STATIONS) if (strengths[s.id] > 0.85) near = s
    lockTime = near ? lockTime + dt : 0
    if (near && lockTime > 1.2 && !memory.found.includes(near.id)) { memory.found.push(near.id); save() }
    const next = { freq: f.toFixed(1), signal: Math.round(strong * 4), found: memory.found.length, total: STATIONS.length }
    if (next.freq !== stats.freq || next.signal !== stats.signal || next.found !== stats.found) { stats = next; onStats?.(next) }
    if (now - rdsAt > 140) {
      rdsAt = now
      const t = rdsText(Date.now()) // 방송 일정과 같은 시계
      if (t !== rdsShown) { rdsShown = t; onRds?.(t) }
    }
  }

  let lastSave = 0
  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    // 다이얼 등: 처음 1.6초 동안 두 번 깜빡이며 켜진다
    const age = (now - born) / 1000
    lamp = age > 1.6 ? Math.min(1, lamp + dt * 2) : Math.min(1, age / 1.4) * (age > 0.35 && age < 0.45 ? 0.3 : age > 0.62 && age < 0.68 ? 0.5 : 1)
    step(dt)
    updateAudio(now)
    broadcast(Date.now())
    report(now, dt)
    draw(now)
    if (now - lastSave > 1500 && Math.abs(v) < 0.01) { lastSave = now; if (memory.last !== Number(f.toFixed(1))) { memory.last = Number(f.toFixed(1)); save() } }
  }

  /* ---------- 입력 ---------- */
  const samples = []
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    sfx.unlock()
    canvas.setPointerCapture?.(e.pointerId)
    drag = { x: e.clientX, id: e.pointerId }
    seekTarget = null
    v = 0
    samples.length = 0
    samples.push({ x: e.clientX, t: performance.now() })
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    drag.x = e.clientX
    let df = -dx / pxPerMHz()
    if (f > DIAL_END && df > 0) df *= 0.35
    f = clamp(f + df, MIN, MAX)
    samples.push({ x: e.clientX, t: performance.now() })
    while (samples.length > 2 && performance.now() - samples[0].t > 90) samples.shift()
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return
    const a = samples[0], b = samples[samples.length - 1]
    const dt = (b.t - a.t) / 1000
    v = dt > 0.008 && performance.now() - b.t < 60 ? clamp(-(b.x - a.x) / dt / pxPerMHz(), -24, 24) : 0
    drag = null
  }
  function onWheel(e) {
    e.preventDefault()
    seekTarget = null
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    v = clamp(v + d * 0.012, -18, 18)
  }
  function onKey(e) {
    const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }
    if (e.key in steps) { e.preventDefault(); nudge(steps[e.key]) }
    else if (e.key === 'Home') { e.preventDefault(); seekTarget = MIN }
    else if (e.key === 'End') { e.preventDefault(); seekTarget = DIAL_END }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('keydown', onKey)

  function nudge(n) {
    sfx.unlock()
    const base = seekTarget ?? Math.round(f * 10) / 10
    seekTarget = clamp(Math.round((base + n * 0.1) * 10) / 10, MIN, MAX)
  }
  // 다음/이전 방송으로 훑어 간다(눈금 끝 너머는 손으로만 갈 수 있다)
  function seek(dir) {
    sfx.unlock()
    const list = STATIONS.filter((s) => s.f <= DIAL_END).map((s) => s.f).sort((a, b) => a - b)
    const from = seekTarget ?? f
    let t = dir > 0 ? list.find((x) => x > from + 0.05) : [...list].reverse().find((x) => x < from - 0.05)
    if (t === undefined) t = dir > 0 ? list[0] : list[list.length - 1]
    seekTarget = t
  }

  raf = requestAnimationFrame(frame)

  return {
    resize(w, h) {
      W = w; H = h
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      glow = null
      const D = dial(), G = grille()
      onLayout?.({ rds: (D.y + D.h + G.y) / 2 }) // 방송 글자(RDS) 줄은 다이얼과 스피커 망 사이
    },
    seek,
    nudge,
    setSound(on) {
      soundOn = on
      if (on) ensureAudio()
      else { hush() }
    },
    setPaused(p) {
      if (p === paused) return
      paused = p
      if (p) { cancelAnimationFrame(raf); hush() } else { last = performance.now(); raf = requestAnimationFrame(frame) }
    },
    dispose() {
      cancelAnimationFrame(raf)
      hush()
      synth?.removeEventListener?.('voiceschanged', pickVoice)
      for (const l of Object.values(audio?.loops || {})) l.stop()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('keydown', onKey)
      memory.last = Number(f.toFixed(1)); save()
    },
  }
}
