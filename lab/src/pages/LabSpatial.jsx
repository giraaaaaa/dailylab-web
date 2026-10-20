import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createPortalStudy } from '../components/spatial/portal'
import { createCityStudy } from '../components/spatial/city'
import './LabSpatial.css'

const studies = {
  portal: { number: '04', title: '불가능한 방', english: 'IMPOSSIBLE ROOM', subtitle: '문 하나를 옮겼을 뿐인데,\n다른 중력이 보인다.', hint: '문을 좌우로 밀기 · 빈 공간을 끌어 시점 바꾸기', other: '/city', otherName: '접히는 도시',
    notes: [ ['문 너머에도 공간이 있습니다', '문 안쪽은 사진이나 영상이 아닙니다. 현재 시점을 반대편 문의 좌표계로 옮긴 카메라로, 다른 방을 한 번 더 그립니다. 문을 옮기면 원근과 가려지는 부분도 함께 바뀝니다.'], ['건너갈 때 시점도 건너갑니다', '두 문 사이의 위치·방향 변환을 카메라에 적용합니다. 건너간 뒤에는 다음 조작을 위해 문을 바라보는 시점으로 돌아섭니다. 무한 재귀 대신 한 단계의 포털만 계산합니다.'] ] },
  city: { number: '05', title: '접히는 도시', english: 'A CITY, UNFOLDED', subtitle: '한 장의 풍경이,\n다시 도시가 되는 순간.', hint: '좌우로 밀어 접고 펼치기 · 시점 버튼으로 회전하기', other: '/portal', otherName: '불가능한 방',
    notes: [ ['벽에서 지붕까지, 하나의 움직임', '64개 건물의 앞·뒤 벽은 같은 길이를 유지하며 경첩을 중심으로 회전합니다. 지붕은 그 끝을 따라 움직이고, 중심과 외곽이 차례로 펼쳐집니다. 충돌을 푸는 정밀한 종이 물리 시뮬레이션은 아닙니다.'], ['많은 건물, 적은 그리기 호출', '건물 외벽과 지붕은 인스턴싱으로 묶고, 창문은 셰이더에서 만듭니다. 좌우의 이동량을 접힘에 연결해 중간에서 멈추거나 되돌릴 수 있습니다.'] ] },
}

export default function LabSpatial({ mode }) {
  const config = studies[mode]
  const canvas = useRef(null), api = useRef(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [state, setState] = useState({ room: 1, crossings: 0, moving: false, progress: 88, auto: false, orbit: false })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const previous = document.title
    window.scrollTo(0, 0)
    document.title = `${config.title} — Daily Lab`
    let instance
    const onError = (message) => { setError(message); setStatus('error') }
    try {
      instance = (mode === 'portal' ? createPortalStudy : createCityStudy)(canvas.current, (next) => setState((old) => ({ ...old, ...next })), onError)
      api.current = instance
      setStatus('ready')
    } catch (e) {
      console.error(e)
      onError('3D 화면을 준비하지 못했습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.')
    }
    return () => { api.current = null; instance?.dispose(); document.title = previous }
  }, [mode, config.title, retry])
  const ready = status === 'ready'
  const portal = mode === 'portal'
  return <main className={`spatial-study spatial-${mode}${portal && state.room === 2 ? ' spatial-bright' : ''}`}>
    <div className="spatial-stage">
      <canvas key={`${mode}-${retry}`} ref={canvas} tabIndex={0} aria-label={portal ? '불가능한 방. 문을 끌어서 옮깁니다. 방향키로도 옮기고 Enter로 통과할 수 있습니다.' : '접히는 도시. 좌우로 끌어 접거나 펼칩니다. 방향키로도 조절할 수 있습니다.'} />
      <header className="spatial-heading">
        <Link to="/" className="spatial-back">← DAILY LAB <span>/ {config.number}</span></Link>
        <span className="spatial-english">{config.english}</span>
        <h1>{config.title}</h1>
        <p>{config.subtitle}</p>
      </header>
      <div className="spatial-readout" aria-live={portal ? 'polite' : 'off'}>
        <span>{portal ? 'CURRENT CHAMBER' : 'UNFOLDED'}</span>
        <strong>{portal ? `0${state.room}` : `${state.progress}`}<small>{portal ? '/ 02' : '%'}</small></strong>
        <p>{portal ? `${state.crossings}번의 공간 이동` : '64개의 연결된 건축물'}</p>
      </div>
      <div className="spatial-bottom">
        <p className="spatial-hint">{state.moving ? '공간을 건너는 중…' : config.hint}</p>
        {portal ? <div className="spatial-controls">
          <div className="spatial-secondary"><button type="button" disabled={!ready || state.moving} onClick={() => api.current?.rotate()}>문 90° 돌리기</button><button type="button" disabled={!ready} onClick={() => api.current?.reset()}>처음으로</button></div>
          <button type="button" className="spatial-primary" disabled={!ready || state.moving} onClick={() => api.current?.transfer()}>{state.moving ? '건너는 중…' : '문 통과하기'} <span>↗</span></button>
        </div> : <div className="spatial-city-controls">
          <div className="spatial-fold-handle"><span>접기</span><input aria-label="도시 펼침 정도" type="range" min="0" max="100" step="1" value={state.progress} disabled={!ready} onChange={(e) => api.current?.setProgress(Number(e.target.value) / 100)} /><span>펼치기</span></div>
          <div className="spatial-controls"><div className="spatial-secondary"><button type="button" disabled={!ready} aria-pressed={state.orbit} onClick={() => api.current?.setOrbit(!state.orbit)}>{state.orbit ? '접힘 조작으로' : '시점 돌려보기'}</button><button type="button" disabled={!ready} onClick={() => api.current?.reset()}>처음으로</button></div><button type="button" className="spatial-primary" disabled={!ready} aria-pressed={state.auto} onClick={() => api.current?.toggleAuto()}>{state.auto ? '시연 멈추기' : '천천히 자동 시연'} <span>{state.auto ? 'Ⅱ' : '↔'}</span></button></div>
        </div>}
      </div>
      {status !== 'ready' && <div className="spatial-fallback" role="status"><p>{status === 'loading' ? '공간을 준비하고 있습니다.' : error}</p>{status === 'error' && <button type="button" onClick={() => { setStatus('loading'); setRetry((n) => n + 1) }}>다시 열기</button>}<Link to="/">실험실로 돌아가기</Link></div>}
    </div>
    <section className="spatial-notes"><div className="spatial-notes-label"><span>BEHIND THE SCENE</span><h2>어떻게 움직이나요?</h2></div><div>{config.notes.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}<p className="spatial-performance-note">움직임이 멈추면 렌더링도 멈춥니다. 화면 밖과 백그라운드에서는 쉬고, 동작 줄이기 설정에서는 자동 이동을 줄입니다.</p><Link to={config.other}>다른 공간: {config.otherName} ↗</Link><a href="/">오늘 앱 보기 ↗</a></div></section>
  </main>
}
