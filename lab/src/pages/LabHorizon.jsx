import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createHorizon } from '../components/horizon/renderer'
import './LabHorizon.css'

/* Lab — 사건의 지평선.
   슈바르츠실트 블랙홀 주변에서 빛이 휘는 경로를 픽셀마다 실시간으로 적분한다(셰이더는 components/horizon).
   메인 화면과 무관한 기술 데모라 라우트 단위로 지연 로딩하고, 화면 밖에서는 계산을 멈춘다. */

const PRESETS = [
  { id: 'film', label: '원반 높이에서', dist: 19, el: 0.075 },
  { id: 'top', label: '위에서 내려다보기', dist: 24, el: 1.18 },
  { id: 'near', label: '광자구 가까이', dist: 2.6, el: 0.1 },
]
const MIN_DIST = 1.3
const MAX_DIST = 45
const DIVE_SECONDS = 11
const LOG_MAX = Math.log(MAX_DIST)
const TICKS = [[1, '사건의 지평선'], [1.5, '광자구'], [3, '최내곽 안정 궤도'], [15, '원반 바깥 끝']]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (t) => t * t * (3 - 2 * t)

/* 가까워질수록 그림자가 시야보다 커진다(4 Rs에서 반지름 약 34°).
   그래서 가까이 갈수록 화각을 넓히고, 시선을 다가오는 쪽 원반으로 돌려 그림자 가장자리가 보이게 한다 */
const closeness = (dist) => smooth(clamp((8 - dist) / 6.8, 0, 1))

function frame(az, el, dist) {
  const ce = Math.cos(el)
  const pos = [dist * ce * Math.cos(az), dist * Math.sin(el), dist * ce * Math.sin(az)]
  const f0 = [-pos[0] / dist, -pos[1] / dist, -pos[2] / dist]
  const rl = Math.hypot(f0[2], f0[0]) || 1
  const r0 = [-f0[2] / rl, 0, f0[0] / rl]               // forward × (0,1,0)
  const u = [r0[1] * f0[2] - r0[2] * f0[1], r0[2] * f0[0] - r0[0] * f0[2], r0[0] * f0[1] - r0[1] * f0[0]]
  const yaw = closeness(dist) * 0.95
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const f = f0.map((v, i) => v * cy + r0[i] * sy)
  const r = r0.map((v, i) => v * cy - f0[i] * sy)
  return { pos, basis: new Float32Array([...r, ...u, ...f]) }
}

const dilation = (r) => 1 / Math.sqrt(Math.max(1e-4, 1 - 1 / r))
function farHour(factor) {
  if (factor > 50) return `${Math.round(factor)}시간 넘게`
  const mins = Math.round(60 * factor)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}
function clock(sec) {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function zone(r) {
  if (r < 1.5) return '광자구 안쪽 · 빛도 궤도를 못 돈다'
  if (r < 3) return '안정 궤도 없음 · 물질이 곧장 떨어진다'
  if (r < 15) return '강착원반 안'
  return '원반 바깥'
}

export default function LabHorizon() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const hud = useRef({})
  const cam = useRef({
    az: -1.25, el: 0.075, dist: 34, tEl: 0.075, tDist: 19, vaz: 0, dragging: false, idle: 0,
    doppler: 1, tDoppler: 1, fade: 0, dive: null, gone: false, here: 0, far: 0,
  })
  const [status, setStatus] = useState('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [doppler, setDoppler] = useState(true)
  const [preset, setPreset] = useState('film')
  const [phase, setPhase] = useState('orbit')
  const [gone, setGone] = useState(null)

  useEffect(() => {
    const previous = document.title
    document.title = '사건의 지평선 · Daily Lab'
    return () => { document.title = previous }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    const c = cam.current
    let hz
    try { hz = createHorizon(canvas) } catch (e) {
      console.error(e)
      setStatus(e.message === 'webgl2' ? 'unsupported' : 'error')
      return undefined
    }
    const small = window.matchMedia('(max-width: 760px)').matches
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const dprCap = small ? 2 : 1.5
    const q = { scale: small ? 0.5 : 0.72, ceiling: small ? 0.8 : 1, steps: small ? 240 : 320, frames: 0, acc: 0, hold: 0, warm: 1.2, fps: 60 }
    let cssW = 1, cssH = 1, raf = 0, last = 0, time = 0, hudT = 1, first = true, size = { w: 0, h: 0 }

    const measure = () => {
      const r = stage.getBoundingClientRect()
      cssW = Math.max(1, r.width)
      cssH = Math.max(1, r.height)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)

    const stepCamera = (dt, reduced) => {
      if (c.dive) {
        const d = c.dive
        d.t = Math.min(1, d.t + dt / DIVE_SECONDS)
        const k = Math.pow(d.t, 1.7)
        c.dist = Math.exp(lerp(Math.log(d.from), Math.log(1.012), k))
        c.el = lerp(d.fromEl, 0.03, smooth(d.t))
        c.az += dt * (0.04 + 1.1 * k * k)
        c.fade = d.t < 0.88 ? 1 : 1 - (d.t - 0.88) / 0.12
        if (d.t >= 1) {
          c.dive = null
          c.gone = true
          c.fade = 0
          setGone({ here: c.here, far: c.far })
          setPhase('gone')
        }
      } else if (!c.gone) {
        const a = 1 - Math.exp(-dt * 4.5)
        c.dist = Math.exp(lerp(Math.log(c.dist), Math.log(c.tDist), a))
        c.el += (c.tEl - c.el) * a
        if (!c.dragging) {
          c.az += c.vaz * dt
          c.vaz *= Math.exp(-dt * 2.2)
          c.idle += dt
          if (c.idle > 3 && !reduced) c.az += dt * 0.035 * Math.min(1, (c.idle - 3) / 2)
        }
        c.fade = Math.min(1, c.fade + dt / 1.4)
      }
      c.doppler += (c.tDoppler - c.doppler) * (1 - Math.exp(-dt * 4))
      if (!c.gone) {
        c.here += dt
        c.far += dt * dilation(c.dist)
      }
    }

    /* 프레임이 밀리면 해상도부터 낮추고, 바닥이면 적분 단계를 줄인다. 떨어졌던 배율 위로는 다시 올리지 않는다.
       낮췄는데도 fps가 그대로면 GPU가 아니라 화면 주사율 제한(저전력 모드 30fps 등)이라 원래대로 되돌린다 */
    const adapt = (dt) => {
      q.frames += 1
      q.acc += dt
      q.warm -= dt
      if (q.acc < 0.75) return
      const fps = q.frames / q.acc
      q.fps = fps
      q.hold -= q.acc
      q.frames = 0
      q.acc = 0
      if (q.warm > 0) return
      if (q.trial) {
        if (fps < q.trial.fps * 1.12) Object.assign(q, { scale: q.trial.scale, steps: q.trial.steps, ceiling: q.trial.ceiling, capped: true })
        q.trial = null
        q.hold = 3
        return
      }
      if (fps < 46 && !q.capped) {
        q.trial = { fps, scale: q.scale, steps: q.steps, ceiling: q.ceiling }
        if (q.scale > 0.32) {
          q.ceiling = Math.max(0.3, q.scale - 0.05)
          q.scale = Math.max(0.3, q.scale - 0.1)
        } else q.steps = Math.max(150, q.steps - 40)
      } else if (fps > 56) {
        q.capped = false
        if (q.hold <= 0 && q.scale < q.ceiling) q.scale = Math.min(q.ceiling, q.scale + 0.04)
      }
    }

    const writeHud = () => {
      const h = hud.current
      const f = dilation(c.dist)
      if (h.dist) h.dist.textContent = c.dist.toFixed(c.dist < 10 ? 2 : 1)
      if (h.dil) h.dil.textContent = `×${f.toFixed(f < 2 ? 3 : 2)}`
      if (h.hour) h.hour.textContent = farHour(f)
      if (h.here) h.here.textContent = clock(c.here)
      if (h.far) h.far.textContent = clock(c.far)
      if (h.zone) h.zone.textContent = zone(c.dist)
      if (h.rays) h.rays.textContent = (size.w * size.h).toLocaleString('ko-KR')
      if (h.steps) h.steps.textContent = q.steps
      if (h.fps) h.fps.textContent = Math.round(q.fps)
      if (h.marker) h.marker.style.bottom = `${(Math.log(c.dist) / LOG_MAX) * 100}%`
    }

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
      last = now
      const reduced = reducedMq.matches
      time += dt * (reduced ? 0.35 : 1)
      stepCamera(dt, reduced)
      adapt(dt)
      size = hz.resize(cssW, cssH, Math.min(window.devicePixelRatio || 1, dprCap), q.scale)
      const { pos, basis } = frame(c.az, c.el, c.dist)
      hz.render({
        time, cam: pos, basis, tanFov: Math.max(0.5, 0.36 / (cssW / cssH)) * (1 + 1.4 * closeness(c.dist)),
        doppler: c.doppler, steps: q.steps, bloom: 0.13, exposure: lerp(1, 0.5, closeness(c.dist)), fade: c.fade,
      })
      hudT += dt
      if (hudT > 0.1) { hudT = 0; writeHud() }
      if (first) { first = false; setStatus('ready') }
    }
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick) } }
    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    let onScreen = true
    const sync = () => (onScreen && !document.hidden ? start() : stop())
    const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
    io.observe(stage)
    document.addEventListener('visibilitychange', sync)

    /* 드래그로 돌기, 휠·핀치로 거리 조절 */
    const pointers = new Map()
    let pinch = 0
    const spread = () => {
      const [a, b] = [...pointers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    const locked = () => c.dive || c.gone
    const onDown = (e) => {
      if (locked()) return
      canvas.setPointerCapture?.(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp })
      c.dragging = true
      c.idle = 0
      c.vaz = 0
      if (pointers.size === 2) pinch = spread()
      stage.classList.add('is-dragging')
    }
    const onMove = (e) => {
      const p = pointers.get(e.pointerId)
      if (!p || locked()) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      const dtE = Math.max(0.008, (e.timeStamp - p.t) / 1000)
      Object.assign(p, { x: e.clientX, y: e.clientY, t: e.timeStamp })
      if (pointers.size >= 2) {
        const s = spread()
        if (pinch > 0 && s > 0) c.tDist = clamp(c.tDist * (pinch / s), MIN_DIST, MAX_DIST)
        pinch = s
        return
      }
      const k = 4 / Math.max(360, Math.min(cssW, cssH) * 1.4)
      c.az += dx * k
      c.tEl = clamp(c.tEl + dy * k, -1.3, 1.3)
      c.el = c.tEl
      c.vaz = c.vaz * 0.5 + ((dx * k) / dtE) * 0.5
    }
    const onUp = (e) => {
      const p = pointers.get(e.pointerId)
      if (p && e.timeStamp - p.t > 90) c.vaz = 0
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = 0
      if (!pointers.size) {
        c.dragging = false
        c.idle = 0
        stage.classList.remove('is-dragging')
      }
    }
    const onWheel = (e) => {
      if (locked()) return
      e.preventDefault()
      c.tDist = clamp(c.tDist * Math.exp(e.deltaY * 0.0011), MIN_DIST, MAX_DIST)
      c.idle = 0
    }
    const onLost = (e) => { e.preventDefault(); stop(); setStatus('lost') }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('webglcontextlost', onLost)
    sync()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('webglcontextlost', onLost)
      hz.dispose()
    }
  }, [reloadKey])

  const choose = (p) => {
    const c = cam.current
    if (c.dive || c.gone) return
    c.tDist = p.dist
    c.tEl = p.el
    c.idle = 0
    setPreset(p.id)
  }
  const toggleDoppler = () => {
    const next = !doppler
    cam.current.tDoppler = next ? 1 : 0
    setDoppler(next)
  }
  const dive = () => {
    const c = cam.current
    if (c.dive || c.gone) return
    c.dive = { t: 0, from: c.dist, fromEl: c.el }
    c.vaz = 0
    setPhase('dive')
  }
  const comeBack = () => {
    Object.assign(cam.current, { gone: false, dist: 42, tDist: 19, el: 0.075, tEl: 0.075, fade: 0, here: 0, far: 0, idle: 0 })
    setPreset('film')
    setGone(null)
    setPhase('orbit')
  }
  const onKey = (e) => {
    const c = cam.current
    if (c.dive || c.gone) return
    const map = {
      ArrowLeft: () => { c.az -= 0.14 }, ArrowRight: () => { c.az += 0.14 },
      ArrowUp: () => { c.tEl = clamp(c.tEl + 0.1, -1.3, 1.3) }, ArrowDown: () => { c.tEl = clamp(c.tEl - 0.1, -1.3, 1.3) },
      '+': () => { c.tDist = clamp(c.tDist / 1.25, MIN_DIST, MAX_DIST) }, '=': () => { c.tDist = clamp(c.tDist / 1.25, MIN_DIST, MAX_DIST) },
      '-': () => { c.tDist = clamp(c.tDist * 1.25, MIN_DIST, MAX_DIST) },
    }
    if (map[e.key]) { e.preventDefault(); map[e.key](); c.idle = 0 }
  }
  const setHud = (key) => (el) => { hud.current[key] = el }
  const usable = status === 'ready' || status === 'loading'

  return <main className="hz">
    <div ref={stageRef} className={`hz-stage is-${phase}`} tabIndex={0} onKeyDown={onKey}
      aria-label="블랙홀 시뮬레이션. 드래그나 방향키로 돌고, 휠·핀치나 +/- 키로 다가갈 수 있습니다.">
      <canvas key={reloadKey} ref={canvasRef} role="img" aria-label="강착원반이 빛나는 블랙홀. 원반 뒤쪽의 빛이 중력에 휘어 블랙홀 위아래로 고리처럼 보입니다." />

      {status === 'loading' && <div className="hz-veil"><span className="hz-pulse" />시공간 계산 준비 중</div>}
      {(status === 'unsupported' || status === 'error' || status === 'lost') && <div className="hz-veil hz-veil-solid">
        <p>{status === 'unsupported' ? '이 브라우저는 WebGL2를 지원하지 않아 블랙홀을 그릴 수 없습니다.' : status === 'lost' ? '그래픽 장치가 초기화됐습니다.' : '그래픽 셰이더를 준비하지 못했습니다.'}</p>
        {status === 'unsupported' ? <Link to="/">실험실 목록으로 →</Link>
          : <button type="button" onClick={() => { setStatus('loading'); setReloadKey((n) => n + 1) }}>다시 그리기</button>}
      </div>}

      <header className="hz-title">
        <span className="hz-eyebrow">상대론적 광선 추적</span>
        <h1>사건의 지평선</h1>
        <p>블랙홀 곁을 지나는 빛이 어떻게 휘는지,<br />화면의 모든 픽셀마다 실시간으로 계산합니다.</p>
      </header>

      <dl className="hz-hud" aria-live="off">
        <div><dt>블랙홀까지 거리</dt><dd><b ref={setHud('dist')}>19.0</b><small>Rs</small></dd><span className="hz-zone" ref={setHud('zone')}>원반 바깥</span></div>
        <div><dt>시간 지연</dt><dd><b ref={setHud('dil')}>×1.027</b></dd><span className="hz-zone">여기서 1시간 = 바깥 <i ref={setHud('hour')}>1시간 2분</i></span></div>
        <div className="hz-clock"><dt>머문 시간 / 바깥 시간</dt><dd><b ref={setHud('here')}>0:00</b><small>/</small><b ref={setHud('far')}>0:00</b></dd></div>
      </dl>

      <div className="hz-gauge" aria-hidden="true">
        <div className="hz-gauge-rail">
          {TICKS.map(([r, label]) => <span key={r} className="hz-tick" style={{ bottom: `${(Math.log(r) / LOG_MAX) * 100}%` }}><em>{r} Rs</em>{label}</span>)}
          <span className="hz-marker" ref={setHud('marker')} />
        </div>
      </div>

      <div className="hz-controls">
        <div className="hz-chips" role="group" aria-label="시점">
          {PRESETS.map((p) => <button type="button" key={p.id} aria-pressed={preset === p.id} disabled={!usable || phase !== 'orbit'} onClick={() => choose(p)}>{p.label}</button>)}
          <button type="button" role="switch" aria-checked={doppler} className="hz-switch" disabled={!usable || phase === 'gone'} onClick={toggleDoppler}>
            <span className="hz-switch-track"><span /></span>도플러 효과 {doppler ? '켬' : '끔'}
          </button>
        </div>
        <button type="button" className="hz-dive" disabled={!usable || phase !== 'orbit'} onClick={dive}>
          {phase === 'dive' ? '떨어지는 중…' : '지평선으로 뛰어들기'}
        </button>
      </div>

      <p className="hz-stats" aria-hidden="true">광선 <b ref={setHud('rays')}>0</b>개 / 프레임 · 최대 <b ref={setHud('steps')}>320</b>단계 적분 · <b ref={setHud('fps')}>60</b> fps</p>
      <p className="hz-hint" aria-hidden="true"><span className="hz-hint-fine">드래그로 돌기 · 휠로 다가가기</span><span className="hz-hint-touch">밀어서 돌기 · 두 손가락으로 다가가기</span></p>

      {phase === 'gone' && gone && <div className="hz-gone" role="dialog" aria-label="사건의 지평선 통과">
        <span className="hz-eyebrow">r &lt; 1 Rs</span>
        <h2>지평선을 넘었습니다.</h2>
        <p>이제 여기서 나가는 빛은 없습니다. 바깥에서는 당신이 지평선 앞에서<br className="hz-wide" /> 점점 느려지다 멈춘 채 붉게 사라지는 모습만 보입니다.</p>
        <p className="hz-gone-time">머문 시간 <b>{clock(gone.here)}</b> · 그동안 바깥에서 흐른 시간 <b>{clock(gone.far)}</b></p>
        <button type="button" onClick={comeBack} autoFocus>다시 바깥에서 시작</button>
      </div>}
    </div>

    <section className="hz-notes" aria-labelledby="hz-notes-title">
      <h2 id="hz-notes-title">어떻게 그리나요?</h2>
      <div className="hz-note-grid">
        <article><b>빛을 거꾸로 쏩니다</b><p>픽셀마다 카메라에서 광선을 하나씩 쏘고, 블랙홀 곁 시공간에서 빛이 지나는 길(널 측지선)을 매 프레임 수백 단계로 적분합니다. 미리 그려 둔 이미지나 영상은 없습니다.</p></article>
        <article><b>원반이 머리띠처럼 보이는 이유</b><p>블랙홀 뒤쪽 원반에서 나온 빛이 중력에 휘어 위아래로 넘어옵니다. 그래서 평평한 원반이 블랙홀을 감싸는 고리처럼 보입니다. 그림자 바로 바깥의 가는 고리는 블랙홀을 한 바퀴 넘게 돌고 나온 빛입니다.</p></article>
        <article><b>그림자는 지평선보다 큽니다</b><p>지평선은 1 Rs지만, 광자구(1.5 Rs) 안쪽으로 들어온 빛은 모두 빨려 들어갑니다. 그래서 검은 그림자의 반지름은 약 2.6 Rs(3√3/2)로 보입니다.</p></article>
        <article><b>한쪽만 밝은 이유</b><p>원반 안쪽 끝은 광속의 절반 속도로 돕니다. 다가오는 쪽은 도플러 효과로 밝고 푸르게, 멀어지는 쪽은 어둡고 붉게 보입니다. 영화 〈인터스텔라〉 제작진은 관객이 헷갈리지 않도록 이 효과를 뺐습니다. 아래 스위치로 두 모습을 비교해 보세요.</p></article>
        <article><b>시간이 느려집니다</b><p>블랙홀 가까이 멈춰 선 사람의 시간은 √(1 − Rs/r)배로 느리게 흐릅니다. 오른쪽 위 숫자는 지금 거리에서 계산한 값입니다.</p></article>
        <article><b>단순화한 부분</b><p>회전하지 않는 블랙홀(슈바르츠실트)과 두께 없는 원반을 가정했습니다. 원반 밝기는 표준 원반 이론(Novikov–Thorne)의 온도 분포를 단순화했고, 지평선 바로 앞 시야는 근사입니다. 새 라이브러리 없이 WebGL2 셰이더로 그리고, 기기 성능에 맞춰 해상도를 스스로 조절하며, 화면 밖에서는 계산을 멈춥니다.</p></article>
      </div>
      <div className="hz-links"><Link to="/">실험실 목록</Link><Link to="/glass">유리 한 장</Link></div>
    </section>
  </main>
}
