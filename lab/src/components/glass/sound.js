import crackUrl from '../../assets/sfx/glass-crack.m4a'
import shatterUrl from '../../assets/sfx/glass-shatter.m4a'
import tinkUrl from '../../assets/sfx/glass-tink.m4a'

/* 효과음 3개(로컬 생성 모델로 만든 뒤 다듬은 것)를 높낮이·세기·좌우를 바꿔 재사용한다.
   브라우저 정책상 AudioContext는 첫 터치 때 연다. 파일은 소리가 켜져 있을 때만 내려받는다 */
export function createSound() {
  let ctx = null
  let master = null
  let buffers = Promise.resolve(null)
  let loaded = false
  let muted = false

  function load() {
    if (loaded || !ctx || muted) return
    loaded = true
    buffers = Promise.all([crackUrl, shatterUrl, tinkUrl].map((url) =>
      fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)))).catch(() => null)
  }
  let lastTink = 0

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.85
      master.connect(ctx.destination)
    }
    load()
    if (ctx.state === 'suspended') ctx.resume()
  }

  function play(index, gain, rate, pan) {
    if (muted || !ctx) return
    buffers.then((list) => {
      if (!list || muted) return
      const src = ctx.createBufferSource()
      src.buffer = list[index]
      src.playbackRate.value = rate
      const g = ctx.createGain()
      g.gain.value = gain
      src.connect(g)
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner()
        p.pan.value = Math.max(-1, Math.min(1, pan))
        g.connect(p)
        p.connect(master)
      } else g.connect(master)
      src.start()
    })
  }

  return {
    unlock,
    crack(force, pan) { play(0, 0.35 + 0.65 * force, 1.12 - 0.22 * force + (Math.random() - 0.5) * 0.08, pan) },
    shatter(pan) { play(1, 1, 0.95 + Math.random() * 0.1, pan * 0.5) },
    /* 작은 조각일수록 높고 가볍게. 한꺼번에 쏟아질 때 뭉개지지 않게 간격을 둔다 */
    tink(size, pan) {
      const now = performance.now()
      if (now - lastTink < 32) return
      lastTink = now
      play(2, Math.min(0.55, 0.1 + size * 1.1), Math.max(0.7, Math.min(1.9, 1.7 - size * 3)) + (Math.random() - 0.5) * 0.25, pan)
    },
    setMuted(value) { muted = value; load() },
    close() { ctx?.close() },
  }
}
