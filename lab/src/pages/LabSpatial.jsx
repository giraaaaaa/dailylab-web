import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Room from '../components/Room'
import { useLabSound } from '../components/useLabSound'
import { createPortalStudy } from '../components/spatial/portal'
import { createCityStudy } from '../components/spatial/city'
import './LabSpatial.css'

const studies = {
  portal: { tone: 'dark', subtitle: '이쪽의 아래는,\n저쪽의 옆입니다.', hint: '파란 공을 문 쪽으로 밀어보세요. 저쪽에서는 옆으로 떨어집니다.',
    notes: [ ['공 하나, 두 공간', '문에 걸친 공을 경계면으로 잘라 양쪽 방에 나눠 그립니다. 공의 중심이 문을 지나는 순간 위치·속도·회전을 함께 옮깁니다.'], ['저쪽의 아래', '첫 번째 방에서는 아래로, 두 번째 방에서는 왼쪽 벽으로 중력이 작용합니다. 문 안 풍경은 반대편 공간을 실시간으로 그린 것입니다.'], ['다른 쪽에서 보기', '관찰 위치를 바꾸면 같은 공을 다른 방에서 볼 수 있습니다. 공 굴리기로 언제든 처음 궤적을 다시 실험할 수 있습니다.'] ] },
  city: { tone: 'dark', subtitle: '위가,\n아래가 되는 곳.', hint: '위로 밀어보세요. 도시가 머리 위로 접혀옵니다.',
    notes: [ ['이어진 거리', '도로와 건물은 열두 구역에 나뉘어 있습니다. 서로 연결된 지면이 접히고, 건물과 가로등은 자기 구역의 위치와 방향을 유지합니다.'], ['먼 곳에서 오는 움직임', '먼 교차로부터 순서대로 반응합니다. 각 연결부가 별도의 관성과 감쇠를 갖고, 손을 멈추거나 되돌리면 그 위치에서 다시 이어집니다.'], ['빛도 함께 바뀝니다', '머리 위로 넘어온 구역이 빛을 가리고, 실제 그림자가 거리 위로 이동합니다. 건물의 창문은 절차적 재질이며, 반복되는 구조물은 인스턴싱으로 묶었습니다.'] ] },
}

export default function LabSpatial({ mode }) {
  const config = studies[mode]
  const canvas = useRef(null), api = useRef(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [state, setState] = useState({ room: 1, crossings: 0, phase: 'ready', moving: false, progress: 0, auto: false, orbit: false })
  const [retry, setRetry] = useState(0)
  const { audio, sound } = useLabSound(mode)
  useEffect(() => {
    let instance
    const onError = (message) => { setError(message); setStatus('error') }
    try {
      instance = (mode === 'portal' ? createPortalStudy : createCityStudy)(canvas.current, (next) => setState((old) => ({ ...old, ...next })), onError, audio)
      api.current = instance
      setStatus('ready')
    } catch (e) {
      console.error(e)
      onError('3D 화면을 준비하지 못했습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.')
    }
    return () => { api.current = null; instance?.dispose() }
  }, [mode, retry, audio])
  const ready = status === 'ready'
  const portal = mode === 'portal'
  const bright = portal && state.room === 2 // 두 번째 방은 밝아서 틀도 밝은 쪽 글자색으로
  return <Room id={mode} tone={bright ? 'light' : config.tone} className={`spatial-study spatial-${mode}${bright ? ' spatial-bright' : ''}`} sound={sound}
    instruction={state.moving ? '다른 쪽에서 바라보는 중…' : portal && state.phase === 'falling' ? '같은 공인데, 옆으로 떨어집니다.' : config.hint}
    intro={config.subtitle} notes={config.notes}
    hud={portal ? <div className="spatial-readout" aria-live={portal ? 'polite' : 'off'}>
      <span>{portal ? '지금 있는 방' : '펼쳐진 정도'}</span>
      <strong>{portal ? `0${state.room}` : `${state.progress}`}<small>{portal ? '/ 02' : '%'}</small></strong>
      <p>{portal ? state.phase === 'ready' ? '공 하나 · 두 개의 중력' : state.phase === 'landed' ? '저쪽 벽에 닿았습니다' : state.crossings ? '공이 문을 건넜습니다' : '문 쪽으로' : '한 장으로 이어진 도시'}</p>
    </div> : null}
    controls={portal ? <div className="spatial-controls">
      <button type="button" disabled={!ready || state.moving || ['rolling', 'falling', 'held'].includes(state.phase)} onClick={() => api.current?.rotate()}>문 90° 돌리기</button>
      <button type="button" disabled={!ready} onClick={() => api.current?.reset()}>처음으로</button>
      <button type="button" disabled={!ready || state.moving} onClick={() => api.current?.transfer()}>다른 쪽에서 보기 ↗</button>
      <button type="button" className="spatial-primary" disabled={!ready || state.moving} onClick={() => api.current?.launch()}>공 굴리기 <span>↗</span></button>
    </div> : <div className="spatial-controls city-controls">
      <button type="button" disabled={!ready} onClick={() => api.current?.reset()}>처음 거리로</button>
      <button type="button" disabled={!ready} aria-pressed={state.auto} onClick={() => api.current?.toggleAuto()}>{state.auto ? '시연 멈추기' : '시연'}</button>
      <button type="button" className="spatial-primary" disabled={!ready} onClick={() => api.current?.toggleFold()}>{state.progress > 55 ? '다시 펼치기' : '도시 접어보기'} <span>↑</span></button>
    </div>}>
    <canvas key={`${mode}-${retry}`} ref={canvas} tabIndex={0} aria-label={portal ? '불가능한 방. 파란 공을 문으로 밀면 다른 중력의 방으로 건너갑니다. Enter로 공을 굴리고 방향키로 시점을 바꿉니다.' : '접히는 도시. 위로 끌면 먼 거리가 솟아올라 머리 위로 접힙니다. 위아래 방향키로 조절하고 Home으로 펼치거나 End로 접을 수 있습니다.'} />
    {status !== 'ready' && <div className="spatial-fallback" role="status"><p>{status === 'loading' ? '공간을 준비하고 있습니다.' : error}</p>{status === 'error' && <button type="button" onClick={() => { setStatus('loading'); setRetry((n) => n + 1) }}>다시 열기</button>}<Link to="/">실험실로 돌아가기</Link></div>}
  </Room>
}
