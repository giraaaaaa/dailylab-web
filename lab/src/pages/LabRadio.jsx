import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Room from '../components/Room'
import { createSfx } from '../components/sfx'
import { createRadio, STATION_COUNT } from '../components/radio/engine'
import { useSoundPref } from '../sound'
import clickUrl from '../assets/sfx/radio-click.m4a'
import chimeUrl from '../assets/sfx/radio-chime.m4a'
import jazzUrl from '../assets/sfx/radio-jazz.m4a'
import musicboxUrl from '../assets/sfx/radio-musicbox.m4a'
import choirUrl from '../assets/sfx/radio-choir.m4a'
import './LabRadio.css'

/* Lab — 주파수. 다이얼을 돌려 방송을 찾는다. 다이얼·소리·방송 일정은 components/radio. */
const NOTES = [
  ['원통 다이얼', '눈금은 원통에 인쇄된 것처럼 x = R·sin θ로 투영해서 양끝으로 갈수록 좁고 어두워집니다. 놓으면 관성으로 구르다가 0.1MHz 칸마다 스프링에 걸립니다. 인쇄된 눈금은 108에서 끝나지만, 다이얼은 조금 더 돌아갑니다.'],
  ['잡음과 휘파람', '잡음은 분홍 잡음에 드문 튐을 섞어 그 자리에서 만들고, 다이얼을 빨리 돌릴수록 필터가 올라가 쉭 하고 쓸리는 소리가 납니다. 방송 근처에서는 어긋난 만큼 높낮이가 바뀌는 휘파람이 섞입니다.'],
  ['방송은 계속 나갑니다', '모든 방송은 실제 시계를 따라 나가서, 맞추는 순간 중간부터 들립니다. 숫자는 브라우저의 한국어 음성이 읽고, 음성이 없으면 신호음으로 대신합니다. 숫자 방송의 첫 다섯 자리는 시계를 보면서 들어 보세요.'],
  ['스피커 망', '점 하나하나가 그 순간 라디오에서 나가는 파형의 높이만큼 켜집니다. 소리를 끈 상태에서는 같은 규칙으로 흉내 낸 파형을 씁니다.'],
  ['소리', '재즈, 오르골, 합창, 시보, 다이얼 소리는 로컬 생성 모델로 만들었고, 모두 같은 라디오 필터(대역 제한과 약한 찌그러짐)를 지납니다.'],
]

export default function LabRadio() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ freq: '—', signal: 0, found: 0, total: STATION_COUNT })
  const [rds, setRds] = useState('')
  const [rdsY, setRdsY] = useState(null)
  const [soundOn, toggleSound] = useSoundPref()

  useEffect(() => {
    const sfx = createSfx({ 'radio-click': clickUrl, 'radio-chime': chimeUrl, 'radio-jazz': jazzUrl, 'radio-musicbox': musicboxUrl, 'radio-choir': choirUrl })
    sound.current = sfx
    let radio
    try {
      radio = createRadio(canvasRef.current, { sfx, onStats: setStats, onRds: setRds, onLayout: (l) => setRdsY(l.rds) })
    } catch (e) {
      console.error(e)
      setStatus('unsupported')
      return () => sfx.close()
    }
    engine.current = radio
    const stage = stageRef.current
    const measure = () => { const r = stage.getBoundingClientRect(); radio.resize(Math.max(1, r.width), Math.max(1, r.height)) }
    measure()
    setStatus('ready')
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    const io = new IntersectionObserver(([entry]) => radio.setPaused(!entry.isIntersecting))
    io.observe(stage)
    return () => { ro.disconnect(); io.disconnect(); radio.dispose(); sfx.close() }
  }, [])

  useEffect(() => {
    const sfx = sound.current
    if (!sfx) return
    sfx.setMuted(!soundOn)
    if (soundOn) sfx.unlock()
    engine.current?.setSound(soundOn)
  }, [soundOn])

  const ready = status === 'ready'

  return <Room id="radio" tone="dark" className="rd" stageRef={stageRef}
    instruction="다이얼을 좌우로 끌어 돌려 보세요. 소리를 켜면 방송이 들립니다."
    sound={{ on: soundOn, toggle: toggleSound }}
    notesTitle="어떻게 잡히나요?" notes={NOTES}
    hud={<dl className="rd-hud">
      <div><dt>주파수</dt><dd>{stats.freq}<small>MHz</small></dd></div>
      <div><dt>신호</dt><dd className="rd-bars" aria-label={`${stats.signal} / 4`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= stats.signal ? 'is-on' : ''} />)}</dd></div>
      <div><dt>찾은 방송</dt><dd>{stats.found}<small>/ {stats.total}</small></dd></div>
    </dl>}
    controls={<div className="rd-controls">
      <button type="button" disabled={!ready} onClick={() => engine.current?.seek(-1)}>← 이전 방송</button>
      <button type="button" disabled={!ready} onClick={() => engine.current?.seek(1)}>다음 방송 →</button>
    </div>}>
    <canvas ref={canvasRef} tabIndex={0} role="slider" aria-label="주파수 다이얼" aria-valuemin={87.5} aria-valuemax={109.4}
      aria-valuenow={Number(stats.freq) || 87.5} aria-valuetext={`${stats.freq} 메가헤르츠${rds ? `, ${rds}` : ''}`} />
    {rdsY !== null && <p className={`rd-rds${rds ? ' is-on' : ''}`} style={{ top: rdsY }} aria-hidden="true"><span>RDS</span>{rds || '—'}</p>}
    {status === 'unsupported' && <div className="rd-veil"><p>이 브라우저에서는 라디오를 그릴 수 없습니다.</p><Link to="/">실험실 목록으로 →</Link></div>}
  </Room>
}
