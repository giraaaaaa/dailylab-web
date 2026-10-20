import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { Studio, TileScene, MembraneScene } from '../components/tactile/Scenes'
import horizonThumb from '../assets/horizon-thumb.webp'
import portalThumb from '../assets/portal-thumb.jpg'
import cityThumb from '../assets/city-thumb.jpg'
import glassThumb from '../assets/glass-thumb.webp'
import './Lab.css'

function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

class StageBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    return this.state.error ? <div className="touch-fallback">3D 화면을 열지 못했습니다.<br />브라우저를 새로고침해 주세요.</div> : this.props.children
  }
}

function Arrow({ play = false }) {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    {play ? <path d="m7 4 9 6-9 6V4Z" fill="currentColor" /> : <><path d="M16 8a6 6 0 1 0 0 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M16 3v5h-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>
}

const experiments = [
  { id: 'tiles', title: '자석 타일', feel: '딸깍, 착.',
    instruction: '쓸어 넘기거나, 한 칸을 잡아 당겨보세요.', action: '타일 물결 시연', tags: ['관성', '스프링 복원'], Scene: TileScene },
  { id: 'surface', title: '탄성 막', feel: '쭉, 탱글.',
    instruction: '표면을 잡고 위로 당겼다가 놓아보세요.', action: '탄성 막 당기기 시연', tags: ['탄성 격자', '고정된 가장자리'], Scene: MembraneScene },
  { id: 'horizon', title: '사건의 지평선', feel: '휘고, 빨려들고.',
    instruction: '블랙홀 곁을 지나는 빛이 어떻게 휘는지 픽셀마다 실시간으로 계산합니다. 돌고, 다가가고, 뛰어들어 보세요.', action: '사건의 지평선 열기', tags: ['광선 추적', '도플러 빔', '시간 지연'], to: '/horizon', thumb: horizonThumb },
  { id: 'portal', title: '불가능한 방', feel: '옮기고, 건너고.',
    instruction: '문 너머에는 다른 중력의 방이 있습니다. 문을 옮기고 돌린 뒤, 반대편으로 건너가 보세요.', action: '불가능한 방 열기', tags: ['포털 렌더링', '시점 변환'], to: '/portal', thumb: portalThumb },
  { id: 'city', title: '접히는 도시', feel: '한 장에서, 도시로.',
    instruction: '64개의 건물이 순서대로 일어나고 다시 접힙니다. 좌우로 밀어 중간에서 멈추거나 되돌려 보세요.', action: '접히는 도시 열기', tags: ['경첩 구조', '인스턴싱'], to: '/city', thumb: cityThumb },
  { id: 'glass', title: '유리 한 장', feel: '쩍, 와장창.',
    instruction: '톡 치면 금이 가고, 꾹 눌렀다 놓을수록 세게 칩니다. 소리를 켜고 해보세요.', action: '유리 한 장 열기', tags: ['보로노이 파괴', '굴절', '효과음'], to: '/glass', thumb: glassThumb },
]

function Experiment({ experiment, small, reduced, glSupported }) {
  const { id, title, feel, instruction, action, tags, Scene } = experiment
  const stage = useRef(null)
  const wake = useRef(null)
  const [visible, setVisible] = useState(true)
  const [demo, setDemo] = useState(0)
  const [reset, setReset] = useState(0)
  const [grabbed, setGrabbed] = useState(false)
  const onGrab = useCallback((value) => setGrabbed(value), [])
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      const shown = entry.isIntersecting && !document.hidden
      setVisible(shown)
      if (shown) wake.current?.()
    }, { rootMargin: '60px' })
    observer.observe(stage.current)
    const onVisibility = () => {
      const rect = stage.current?.getBoundingClientRect()
      const shown = !document.hidden && rect && rect.bottom > -60 && rect.top < window.innerHeight + 60
      setVisible(!!shown)
      if (shown) wake.current?.()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  return <section className={`touch-experiment touch-${id}`} aria-labelledby={`${id}-title`}>
    <div className="touch-card-heading">
      <h2 id={`${id}-title`}>{title}</h2>
      <span className="touch-feel">{feel}</span>
    </div>
    <div ref={stage} className={`touch-stage${grabbed ? ' is-grabbed' : ''}`}>
      {glSupported ? <StageBoundary><Canvas orthographic camera={{ position: [6, 8.5, 9], zoom: 60, near: 0.1, far: 200 }}
        shadows={id === 'tiles'} dpr={small ? [1, 1.5] : [1, 1.75]} frameloop={visible ? 'demand' : 'never'}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        aria-label={`${title}. ${instruction} 아래 자동 시연 버튼으로도 움직임을 볼 수 있습니다.`}
        onCreated={({ gl }) => { gl.setClearColor('#f1f6f3', 0); gl.toneMappingExposure = 1.08 }}>
        <Studio wake={wake} small={small} />
        <Scene demo={demo} reset={reset} reduced={reduced} onGrab={onGrab} />
      </Canvas></StageBoundary> : <div className="touch-fallback">이 브라우저에서는 3D 화면을 지원하지 않습니다.<br /><a href="/">Daily Lab 홈으로 →</a></div>}
      <span className="touch-stage-note" aria-hidden="true"><span />{grabbed ? '놓으면 돌아와요' : '직접 만져보세요'}</span>
    </div>
    <div className="touch-card-bottom">
      <p>{instruction}</p>
      <div className="touch-card-controls">
        <div className="touch-material-tags" aria-label="움직임 특징">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="touch-actions">
          <button type="button" disabled={!glSupported} onClick={() => { setGrabbed(false); setDemo((n) => n + 1) }} aria-label={action}><Arrow play />자동 시연</button>
          <button type="button" disabled={!glSupported} className="touch-reset" aria-label={`${title} 처음으로`} title="처음으로" onClick={() => { setGrabbed(false); setReset((n) => n + 1) }}><Arrow /></button>
        </div>
      </div>
    </div>
  </section>
}

/* 03은 무거운 레이트레이서라 카드 안에서 돌리지 않고, 실제 렌더 한 장을 썸네일로 보여준 뒤 전용 페이지로 보낸다 */
function LinkExperiment({ experiment }) {
  const { id, title, feel, instruction, action, tags, to, thumb } = experiment
  return <section className={`touch-experiment touch-${id}`} aria-labelledby={`${id}-title`}>
    <div className="touch-card-heading">
      <h2 id={`${id}-title`}>{title}</h2>
      <span className="touch-feel">{feel}</span>
    </div>
    <Link to={to} className="touch-stage touch-stage-link" tabIndex={-1} aria-hidden="true">
      <img src={thumb} alt="" width="1920" height="700" loading="lazy" decoding="async" />
      <span className="touch-stage-note"><span />눌러서 들어가기</span>
    </Link>
    <div className="touch-card-bottom">
      <p>{instruction}</p>
      <div className="touch-card-controls">
        <div className="touch-material-tags" aria-label="계산하는 것">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="touch-actions"><Link to={to} aria-label={action}><Arrow play />들어가기</Link></div>
      </div>
    </div>
  </section>
}

export default function Lab() {
  const small = useMedia('(max-width: 760px)')
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const [selected, setSelected] = useState('tiles')
  const glSupported = useMemo(supportsWebGL, [])
  useEffect(() => {
    const previous = document.title
    document.title = '실험실 · Daily Lab'
    return () => { document.title = previous }
  }, [])
  return <main className="touch-lab">
    <header className="touch-intro">
      <h1>별일 없이,<br className="touch-mobile-break" /> 자꾸 만지게.</h1>
      <p>딸깍 맞물리거나, 탱글하게 돌아오거나.<br />잡고, 당기고, 놓아보세요.</p>
    </header>
    {small && <div className="touch-tabs" role="group" aria-label="실험 선택">{experiments.map((experiment) => <button type="button" key={experiment.id} aria-pressed={selected === experiment.id} onClick={() => setSelected(experiment.id)}>{experiment.title}</button>)}</div>}
    <div className="touch-grid">
      {experiments.filter((experiment) => !small || selected === experiment.id).map((experiment) => experiment.to
        ? <LinkExperiment key={experiment.id} experiment={experiment} />
        : <Experiment key={experiment.id} experiment={experiment} small={small} reduced={reduced} glSupported={glSupported} />)}
    </div>
    <div className="touch-colophon"><p>{reduced ? '동작 줄이기 설정에 맞춰 잔진동을 줄였습니다' : '손을 놓으면 쉬어가는 작은 물리 실험'}</p></div>
    <details className="touch-build-notes"><summary>어떻게 움직이나요?</summary><div><p><b>자석 타일</b>각 타일의 위치와 기울기를 감쇠 스프링으로 계산합니다. 당기는 동안 따라오고, 놓으면 제자리로 돌아갑니다.</p><p><b>탄성 막</b>가장자리를 고정한 45 × 45 격자에서 변형을 전달합니다. 실제 유체나 고무의 정밀 시뮬레이션이 아닌, 손맛을 위한 탄성 모델입니다.</p><p><b>사건의 지평선</b>픽셀마다 광선을 쏘아 블랙홀 곁에서 빛이 휘는 길을 적분합니다. 원반 밝기와 색은 도플러 효과·중력 적색편이로 계산하고, 시점이 바뀔 때마다 다시 그립니다.</p><p><b>유리 한 장</b>친 자리를 중심으로 극좌표 보로노이로 유리판을 잘라 거미줄 금을 만들고, 조각마다 다르게 기울여 너머 풍경이 어긋나 보이게 합니다. 효과음은 로컬 생성 모델로 만들었습니다.</p><p><b>화면이 멈추면 렌더링도 쉽니다.</b>화면 밖에서는 정지하고, 휴대폰에서는 선택한 실험 하나만 엽니다. 자동 시연 버튼은 키보드로도 사용할 수 있습니다.</p></div></details>
  </main>
}
