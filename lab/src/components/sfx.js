/* 방들이 같이 쓰는 작은 소리 엔진(Web Audio).
   효과음은 로컬 생성 모델로 만든 뒤 잘라·다듬은 m4a(assets/sfx). 높낮이·세기·좌우·잔향을 바꿔 매번 다르게 들리게 쓴다.
   브라우저 정책상 AudioContext는 첫 터치(또는 소리 켜기) 때 연다. 끄면 마스터만 0으로 내린다. */

export function createSfx(sources, { level = 0.9 } = {}) {
  let ctx = null
  let master = null
  let wet = null
  let muted = false
  const buffers = {}
  let loading = null

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : level
      master.connect(ctx.destination)
      loading = Promise.all(Object.entries(sources).map(([name, url]) =>
        fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { buffers[name] = buf })
          .catch(() => {})))
    }
    if (ctx.state === 'suspended') ctx.resume()
  }

  /* 잔향: 노이즈를 지수적으로 줄인 임펄스 응답(동굴·우물·욕실 같은 공간). 방마다 길이와 밝기를 다르게 */
  function reverb(seconds = 2.5, decay = 3, brightness = 0.5) {
    if (!ctx) return null
    if (wet) return wet
    const len = Math.floor(ctx.sampleRate * seconds)
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const t = i / len
        lp += (Math.random() * 2 - 1 - lp) * (0.08 + brightness * 0.9 * (1 - t)) // 뒤로 갈수록 어두워지는 꼬리
        d[i] = lp * Math.pow(1 - t, decay)
      }
    }
    const conv = ctx.createConvolver()
    conv.buffer = ir
    wet = ctx.createGain()
    wet.gain.value = 1
    wet.connect(conv)
    conv.connect(master)
    return wet
  }

  function route(node, { pan = 0, send = 0 }) {
    let out = node
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      out.connect(p)
      out = p
    }
    out.connect(master)
    if (send && wet) {
      const s = ctx.createGain()
      s.gain.value = send
      out.connect(s)
      s.connect(wet)
    }
  }

  /* 한 번 재생. at: 몇 초 뒤, offset/duration: 파일의 일부만(질감 조각) */
  function play(name, { gain = 1, rate = 1, pan = 0, send = 0, at = 0, offset = 0, duration, fade = 0.012 } = {}) {
    if (!ctx || muted) return
    const buf = buffers[name]
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    const t0 = ctx.currentTime + Math.max(0, at)
    if (duration) {
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(gain, t0 + fade)
      g.gain.setValueAtTime(gain, t0 + Math.max(fade, duration / rate - fade))
      g.gain.linearRampToValueAtTime(0, t0 + duration / rate)
    } else g.gain.value = gain
    src.connect(g)
    route(g, { pan, send })
    src.start(t0, offset, duration)
  }

  /* 계속 도는 소리(배경음·라디오 방송). 겹친 루프라 처음과 끝이 이어진다. 세기·높낮이를 부드럽게 바꿀 수 있다 */
  function loop(name, { gain = 0.5, rate = 1, send = 0 } = {}) {
    let src = null
    let g = null
    const start = () => {
      if (src || !ctx || !buffers[name]) return
      src = ctx.createBufferSource()
      src.buffer = buffers[name]
      src.loop = true
      src.playbackRate.value = rate
      g = ctx.createGain()
      g.gain.value = 0
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 1.2)
      src.connect(g)
      route(g, { send })
      src.start(0, Math.random() * buffers[name].duration)
    }
    loading?.then(start)
    return {
      set(value, ramp = 0.15) {
        gain = value
        if (g) g.gain.setTargetAtTime(value, ctx.currentTime, ramp / 3)
      },
      rate(value, ramp = 0.15) { if (src) src.playbackRate.setTargetAtTime(value, ctx.currentTime, ramp / 3) },
      stop() { try { src?.stop() } catch { /* 이미 멈춤 */ } src = null },
      get node() { return g },
    }
  }

  return {
    unlock,
    play,
    loop,
    reverb,
    get ctx() { return ctx },
    get ready() { return loading },
    setMuted(value) {
      muted = value
      if (master) master.gain.setTargetAtTime(value ? 0 : level, ctx.currentTime, 0.05)
    },
    close() { ctx?.close(); ctx = null },
  }
}
