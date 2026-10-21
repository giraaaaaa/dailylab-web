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
import ratchetUrl from '../assets/sfx/well-ratchet.m4a'
import windlassUrl from '../assets/sfx/well-windlass.m4a'
import whirrUrl from '../assets/sfx/well-whirr.m4a'
import plungeUrl from '../assets/sfx/well-plunge.m4a'
import glugUrl from '../assets/sfx/well-glug.m4a'
import knockUrl from '../assets/sfx/well-knock.m4a'
import dripUrl from '../assets/sfx/mirror-drip.m4a'
import './LabWell.css'

/* Lab — 우물. 두레박을 내리고 손잡이를 돌려 끌어올린다. 장면·물리는 components/well. */
const NOTES = [
  ['두레박', '놓으면 밧줄이 드럼에서 풀리며 떨어지고(관성과 마찰), 물에 닿으면 물이 찹니다. 손잡이를 돌리면 래칫이 한 칸씩 걸리며 감기고, 물이 찬 만큼 무겁게 돕니다. 손잡이를 거꾸로 세게 돌리면 래칫이 풀립니다.'],
  ['소리로 재는 깊이', '돌이나 두레박이 떨어지는 시간 √(2h/g)에 물소리가 올라오는 시간 h/343초를 더해, 들리는 순간을 진짜 물리로 맞췄습니다. 끌어올릴 때 떨어지는 물방울도 남은 깊이만큼 늦게 들립니다. 깊이는 올 때마다 다릅니다.'],
  ['어둠', '달빛은 우물 입구 근처에서 끊기고, 그 아래는 두레박에 매단 등불만 비춥니다. 재질(돌, 나무, 밧줄, 흙)은 사진 없이 열 때마다 코드로 그립니다.'],
  ['아껴 그리기', '움직이는 것이 없으면 그리지 않고, 그림자는 물체가 움직일 때만 다시 굽습니다. 프레임이 자꾸 늦어지면 해상도를 스스로 낮춥니다. 소리는 켰을 때만 내려받습니다.'],
  ['건져 올린 것', '두레박에 가끔 물 말고 다른 것이 딸려 옵니다. 건진 것은 우물 둘레 돌 위에 놓여, 다음에 와도 그 자리에 있습니다.'],
]

const LABEL = { top: '두레박 내리기', free: '내려가는 중', fill: '물이 차는 중', down: '끌어올리기', reveal: '두레박 내리기' }

export default function LabWell() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const air = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ hauls: 0, found: 0, total: 6, depth: null, phase: 'top', ropeDepth: 0 })
  const [note, setNote] = useState('')
  const [soundOn, toggleSound] = useSoundPref()

  useEffect(() => {
    const sfx = createSfx({
      'well-splash': splashUrl, 'well-clack': clackUrl, 'well-place': placeUrl, 'well-air': airUrl, 'well-ratchet': ratchetUrl, 'well-windlass': windlassUrl,
      'well-whirr': whirrUrl, 'well-plunge': plungeUrl, 'well-glug': glugUrl, 'well-knock': knockUrl, 'mirror-drip': dripUrl,
    })
    sound.current = sfx
    let well
    try {
      well = createWell(canvasRef.current, { sfx, onStats: setStats, onNote: setNote })
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
    const onVis = () => well.setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => { ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); well.dispose(); sfx.close(); air.current = null }
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
  const busy = stats.phase === 'free' || stats.phase === 'fill'
  const main = () => {
    sound.current?.unlock()
    if (stats.phase === 'down') engine.current?.reel()
    else engine.current?.lower()
  }
  const line = note || (stats.phase === 'down' && stats.ropeDepth > 0 ? `두레박 ${stats.ropeDepth}m 아래` : '')

  return <Room id="well" tone="dark" className="wl" stageRef={stageRef}
    instruction="두레박을 내리고, 손잡이를 돌려 끌어올리세요. 우물 입구를 누르면 돌이 떨어집니다."
    sound={{ on: soundOn, toggle: toggleSound }}
    notesTitle="어떻게 움직이나요?" notes={NOTES}
    hud={<dl className="wl-hud">
      <div><dt>깊이</dt><dd>{stats.depth ? <>약 {Math.round(stats.depth)}<small>m</small></> : '?'}</dd></div>
      <div><dt>두레박</dt><dd>{stats.hauls}</dd></div>
      <div><dt>건진 것</dt><dd>{stats.found}<small>/ {stats.total}</small></dd></div>
    </dl>}
    controls={<div className="wl-controls">
      <button type="button" disabled={!ready || busy} onClick={main}>{LABEL[stats.phase] || '두레박 내리기'}</button>
      <button type="button" disabled={!ready} onClick={() => { sound.current?.unlock(); engine.current?.drop() }}>돌 떨어뜨리기</button>
    </div>}>
    <canvas ref={canvasRef} role="img" aria-label="밤의 돌 우물과 나무 도르래. 손잡이를 돌리면 두레박이 올라오고, 우물 입구를 누르면 돌이 떨어집니다." />
    <p className={`wl-note${line ? ' is-on' : ''}`} aria-live="polite">{line}</p>
    {status === 'unsupported' && <div className="wl-veil"><p>이 브라우저에서는 우물을 그릴 수 없습니다.</p><Link to="/">실험실 목록으로 →</Link></div>}
  </Room>
}
