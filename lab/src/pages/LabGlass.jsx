import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createGlass } from '../components/glass/engine'
import { createSound } from '../components/glass/sound'
import './LabGlass.css'

/* Lab — 유리 한 장.
   톡 치면 금이 가고, 꾹 눌렀다 놓을수록 세게 친다. 다 깨지면 새 유리가 내려온다.
   기하·물리·렌더링은 components/glass, 효과음은 assets/sfx. */

const CHARGE_SECONDS = 0.9
const forceOf = (held) => Math.min(1, 0.14 + (held / CHARGE_SECONDS) * 0.86)

function readMuted() {
  try { return localStorage.getItem('lab-glass-muted') === '1' } catch { return false }
}

export default function LabGlass() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const ringRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ pieces: 1, panes: 0, shattered: false })
  const [muted, setMuted] = useState(readMuted)

  useEffect(() => {
    const previous = document.title
    document.title = '유리 한 장 — Daily Lab'
    return () => { document.title = previous }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    const ring = ringRef.current
    const sfx = createSound()
    sfx.setMuted(readMuted())
    sound.current = sfx
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    let glass
    try {
      glass = createGlass(canvas, { sound: sfx, onStats: setStats, reduced: () => reducedMq.matches })
    } catch (e) {
      console.error(e)
      setStatus(e.message === 'webgl2' ? 'unsupported' : 'error')
      return () => sfx.close()
    }
    engine.current = glass
    if (import.meta.env.DEV) window.__glass = glass
    const measure = () => {
      const r = stage.getBoundingClientRect()
      glass.resize(Math.max(1, r.width), Math.max(1, r.height))
    }
    measure()
    setStatus('ready')
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    const io = new IntersectionObserver(([entry]) => glass.setPaused(!entry.isIntersecting))
    io.observe(stage)

    /* 누르고 있는 동안 링이 커진다 = 힘을 모은다 */
    let hold = null
    let ringRaf = 0
    const grow = () => {
      if (!hold) return
      const k = forceOf((performance.now() - hold.at) / 1000)
      ring.style.setProperty('--k', k.toFixed(3))
      ring.classList.toggle('is-full', k >= 1)
      ringRaf = requestAnimationFrame(grow)
    }
    const onDown = (e) => {
      if (e.button > 0) return
      sfx.unlock()
      try { canvas.setPointerCapture(e.pointerId) } catch { /* 캡처 불가 포인터 */ }
      const r = stage.getBoundingClientRect()
      hold = { id: e.pointerId, at: performance.now(), x: e.clientX, y: e.clientY }
      ring.style.left = `${e.clientX - r.left}px`
      ring.style.top = `${e.clientY - r.top}px`
      ring.style.setProperty('--k', '0.14')
      ring.classList.add('is-on')
      cancelAnimationFrame(ringRaf)
      ringRaf = requestAnimationFrame(grow)
    }
    const release = (e, fire) => {
      if (!hold || hold.id !== e.pointerId) return
      const force = forceOf((performance.now() - hold.at) / 1000)
      const { x, y } = hold
      hold = null
      cancelAnimationFrame(ringRaf)
      ring.classList.remove('is-on', 'is-full')
      if (fire) glass.tap(x, y, force)
    }
    const onUp = (e) => release(e, true)
    const onCancel = (e) => release(e, false)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)

    return () => {
      cancelAnimationFrame(ringRaf)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      glass.destroy()
      sfx.close()
      if (window.__glass === glass) delete window.__glass
    }
  }, [])

  const act = (fn) => () => { sound.current?.unlock(); fn(engine.current) }
  const toggleSound = () => {
    const next = !muted
    sound.current?.setMuted(next)
    if (!next) sound.current?.unlock()
    try { localStorage.setItem('lab-glass-muted', next ? '1' : '0') } catch { /* 저장 불가 환경 */ }
    setMuted(next)
  }
  const ready = status === 'ready'

  return <main className="gx">
    <div ref={stageRef} className="gx-stage">
      <canvas ref={canvasRef} role="img" aria-label="밤의 쇼윈도 유리. 누르면 금이 가고 세게 치면 깨집니다. 아래 버튼으로도 칠 수 있습니다." />
      <span ref={ringRef} className="gx-ring" aria-hidden="true"><span /></span>

      {status !== 'ready' && status !== 'loading' && <div className="gx-veil">
        <p>{status === 'unsupported' ? '이 브라우저는 WebGL2를 지원하지 않아 유리를 그릴 수 없습니다.' : '그래픽을 준비하지 못했습니다. 새로고침해 주세요.'}</p>
        <Link to="/">실험실 목록으로 →</Link>
      </div>}

      <header className="gx-title">
        <span className="gx-eyebrow">DAILY LAB · 06 — GLASS</span>
        <h1>유리 한 장</h1>
        <p>톡 치면 금이 가고, 꾹 눌렀다 놓을수록 세게 칩니다.</p>
      </header>

      <dl className="gx-hud">
        <div><dt>조각</dt><dd>{stats.pieces.toLocaleString('ko-KR')}</dd></div>
        <div><dt>깬 유리</dt><dd>{stats.panes}<small>장</small></dd></div>
      </dl>

      <p className="gx-hint" aria-hidden="true">{stats.shattered ? '새 유리가 내려옵니다' : '꾹 누를수록 세게'}</p>

      <div className="gx-controls">
        <button type="button" disabled={!ready} onClick={act((g) => g.tapRandom(0.35))}>톡 치기</button>
        <button type="button" disabled={!ready} onClick={act((g) => g.smash())} className="gx-smash">와장창</button>
        <button type="button" disabled={!ready} onClick={act((g) => g.renew())}>새 유리</button>
        <button type="button" role="switch" aria-checked={!muted} className="gx-sound" onClick={toggleSound}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 8h3l4-3.5v11L7 12H4V8Z" fill="currentColor" />{muted
            ? <path d="m14 8 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            : <path d="M14 7.5a3.5 3.5 0 0 1 0 5M15.8 5.2a6.5 6.5 0 0 1 0 9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}</svg>
          소리 {muted ? '끔' : '켬'}
        </button>
      </div>
    </div>

    <section className="gx-notes" aria-labelledby="gx-notes-title">
      <h2 id="gx-notes-title">어떻게 깨지나요?</h2>
      <div className="gx-note-grid">
        <article><b>거미줄 금</b><p>친 자리를 중심으로 동심원과 방사선 모양으로 씨앗을 뿌리고, 유리판을 보로노이 칸으로 자릅니다. 같은 고리끼리는 방사형 금이, 이웃 고리끼리는 동심원 금이 됩니다. 금은 친 자리에서 바깥으로 자라납니다.</p></article>
        <article><b>조각마다 어긋나는 풍경</b><p>금으로 둘러싸인 조각은 아주 조금씩 기울어집니다. 유리 너머 네온사인을 조각의 기울기만큼 비틀어 그려서, 깨진 유리처럼 글자가 어긋나 보입니다. 단면은 실제 유리처럼 초록빛입니다.</p></article>
        <article><b>와장창</b><p>세게 치거나 여러 번 치면, 남은 큰 조각을 더 잘게 쪼갠 뒤 친 자리에서 퍼지는 순서대로 떨어뜨립니다. 깨지는 순간엔 시간이 느려지고, 바닥을 지나는 조각마다 크기에 맞는 높이로 짤랑거립니다.</p></article>
        <article><b>소리와 손끝</b><p>금 가는 소리, 깨지는 소리, 조각 소리 세 개를 로컬 생성 모델로 만들어 다듬은 뒤 높낮이와 세기를 바꿔 매번 다르게 들리게 했습니다. 안드로이드 휴대폰에서는 진동도 함께 옵니다.</p></article>
        <article><b>단순화한 부분</b><p>실제 파괴역학을 푼 것이 아니라 손맛을 위한 모델입니다. 조각끼리는 부딪히지 않고, 굴절은 화면 공간에서 흉내 냅니다. 새 라이브러리 없이 WebGL2로 그리고, 움직임이 없으면 그리기를 멈춥니다.</p></article>
      </div>
      <div className="gx-links"><Link to="/">실험실 목록</Link><Link to="/horizon">사건의 지평선</Link><a href="/">오늘 앱 보기 →</a></div>
    </section>
  </main>
}
