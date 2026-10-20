import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Room from '../components/Room'
import { createSfx } from '../components/sfx'
import { createWell } from '../components/well/engine'
import { useSoundPref } from '../sound'
import splashUrl from '../assets/sfx/well-splash.m4a'
import clackUrl from '../assets/sfx/well-clack.m4a'
import placeUrl from '../assets/sfx/well-place.m4a'
import airUrl from '../assets/sfx/well-air.m4a'
import './LabWell.css'

/* Lab — 우물. 돌을 집어 놓으면 떨어지고, 한참 뒤 물소리가 난다. 장면·물리는 components/well. */
const NOTES = [
  ['소리로 재는 깊이', '돌이 떨어지는 시간 √(2h/g)에 물소리가 올라오는 시간 h/343초를 더해, 들리는 순간을 진짜 물리로 맞췄습니다. 화면 속 우물은 7m로 줄여 그리고, 떨어지는 빠르기만 진짜 깊이에 맞춥니다.'],
  ['물결', '돌이 닿은 자리에서 퍼지는 감쇠 물결 여러 개를 합쳐, 수면에 비친 달과 별을 흔듭니다.'],
  ['돌벽', '돌 무늬는 사진이 아니라 열 때마다 코드로 그립니다. 같은 무늬로 높이 지도를 만들어 달빛이 돌 모서리에 걸리게 했습니다.'],
  ['울림', '물소리, 돌 소리, 우물 속 공기는 로컬 생성 모델로 만든 뒤 잘라 다듬었고, 깊을수록 작고 길게 울리도록 섞습니다.'],
  ['단순화한 부분', '공기 저항과 돌이 벽에 부딪히며 잃는 시간은 넣지 않았습니다. 움직이는 것이 없으면 그리기를 멈춥니다.'],
]

export default function LabWell() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const air = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ thrown: 0, heard: null, depth: 0, silent: false, returned: 0 })
  const [soundOn, toggleSound] = useSoundPref()

  useEffect(() => {
    const sfx = createSfx({ 'well-splash': splashUrl, 'well-clack': clackUrl, 'well-place': placeUrl, 'well-air': airUrl })
    sound.current = sfx
    let well
    try {
      well = createWell(canvasRef.current, { sfx, onStats: setStats })
    } catch (e) {
      console.error(e)
      setStatus('unsupported')
      return () => sfx.close()
    }
    engine.current = well
    const stage = stageRef.current
    const measure = () => { const r = stage.getBoundingClientRect(); well.resize(Math.max(1, r.width), Math.max(1, r.height)) }
    measure()
    setStatus('ready')
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    const io = new IntersectionObserver(([entry]) => well.setPaused(!entry.isIntersecting))
    io.observe(stage)
    return () => { ro.disconnect(); io.disconnect(); well.dispose(); sfx.close(); air.current = null }
  }, [])

  // 소리를 켜면 우물 속 공기가 깔린다(켜는 순간이 사용자 조작이라 오디오도 그때 연다)
  useEffect(() => {
    const sfx = sound.current
    if (!sfx) return
    sfx.setMuted(!soundOn)
    if (soundOn) {
      sfx.unlock()
      sfx.reverb(3.4, 2.4, 0.3)
      air.current ??= sfx.loop('well-air', { gain: 0.3, send: 0.2 })
    }
  }, [soundOn])

  const ready = status === 'ready'
  const note = stats.silent ? '물소리가 들리지 않았습니다' : stats.heard ? `물소리까지 ${stats.heard}초` : ''

  return <Room id="well" tone="dark" className="wl" stageRef={stageRef}
    instruction="돌을 집어 우물 위에서 놓아 보세요. 소리를 켜면 깊이를 들을 수 있어요."
    sound={{ on: soundOn, toggle: toggleSound }}
    notesTitle="어떻게 재나요?" notes={NOTES}
    hud={<dl className="wl-hud">
      <div><dt>깊이</dt><dd>{stats.heard ? <>약 {stats.depth}<small>m</small></> : '?'}</dd></div>
      <div><dt>던진 돌</dt><dd>{stats.thrown}</dd></div>
      {stats.returned > 0 && <div><dt>돌아온 돌</dt><dd>{stats.returned}</dd></div>}
    </dl>}
    controls={<div className="wl-controls">
      <button type="button" disabled={!ready} onClick={() => { sound.current?.unlock(); engine.current?.drop() }}>돌 떨어뜨리기</button>
    </div>}>
    <canvas ref={canvasRef} role="img" aria-label="위에서 내려다본 깊은 돌 우물. 바닥 수면에 달이 비칩니다. 누르면 돌을 집고, 놓으면 떨어뜨립니다." />
    <p className={`wl-note${note ? ' is-on' : ''}`} aria-live="polite">{note}</p>
    {status === 'unsupported' && <div className="wl-veil"><p>이 브라우저에서는 우물을 그릴 수 없습니다.</p><Link to="/">실험실 목록으로 →</Link></div>}
  </Room>
}
