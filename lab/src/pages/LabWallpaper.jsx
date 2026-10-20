import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Room from '../components/Room'
import { createSfx } from '../components/sfx'
import { createWallpaper } from '../components/wallpaper/engine'
import { useSoundPref } from '../sound'
import peelUrl from '../assets/sfx/paper-peel.m4a'
import ripUrl from '../assets/sfx/paper-rip.m4a'
import dustUrl from '../assets/sfx/paper-dust.m4a'
import roomUrl from '../assets/sfx/paper-room.m4a'
import './LabWallpaper.css'

/* Lab — 벽지 한 겹. 잡아 끌면 벽지가 찢기며 말려 올라가고, 그 아래 더 오래된 벽지가 나온다. 장면·찢기는 components/wallpaper. */
const NOTES = [
  ['말려 올라가는 종이', '잡은 점과 손가락 사이 한가운데에 접는 선을 두고, 그 사이의 종이를 선 너머로 뒤집어 그립니다(책장 넘김 셰이더와 같은 원리). 접힌 곳 가까이는 둥글게 휜 것처럼 밝기를 바꾸고, 높이 들릴수록 그림자를 멀리 떨어뜨립니다.'],
  ['찢긴 가장자리', '찢어지는 모양은 사인파 몇 개를 겹친 식 하나로 정합니다. 화면(셰이더)과 지워지는 자리(캔버스)가 같은 식을 써서, 손을 떼는 순간에도 모양이 바뀌지 않습니다. 가장자리에는 종이 속 흰 섬유가 보입니다.'],
  ['여러 겹', '겹마다 남은 자리를 RGBA 마스크 한 장의 채널에 나눠 담습니다. 아래로 갈수록 오래된 무늬(꽃무늬, 줄무늬, 초배지로 바른 신문)이고, 모두 열 때마다 코드로 그립니다. 위 겹의 두께만큼 아래 겹에 그림자가 집니다.'],
  ['다시 오면', '다음에 오면 누군가 새 벽지를 발라 두었습니다. 지난번에 뜯은 자리는 그 아래 겹에 그대로 남아 있고, 새 벽지 위로 살짝 꺼진 자국이 보입니다.'],
  ['소리', '종이 뜯는 소리, 찢어지는 소리, 부스러기, 방 공기는 로컬 생성 모델로 만들었습니다. 찢김이 나아가는 빠르기에 맞춰 짧은 조각을 골라 이어 붙입니다.'],
]

export default function LabWallpaper() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const air = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ torn: 0, deepest: 1, deepestName: '새 벽지' })
  const [soundOn, toggleSound] = useSoundPref()

  useEffect(() => {
    const sfx = createSfx({ 'paper-peel': peelUrl, 'paper-rip': ripUrl, 'paper-dust': dustUrl, 'paper-room': roomUrl })
    sound.current = sfx
    let wall
    try {
      wall = createWallpaper(canvasRef.current, overlayRef.current, { sfx, onStats: setStats })
    } catch (e) {
      console.error(e)
      setStatus('unsupported')
      return () => sfx.close()
    }
    engine.current = wall
    const stage = stageRef.current
    const measure = () => { const r = stage.getBoundingClientRect(); wall.resize(Math.max(1, r.width), Math.max(1, r.height)) }
    measure()
    setStatus('ready')
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    const io = new IntersectionObserver(([entry]) => wall.setPaused(!entry.isIntersecting))
    io.observe(stage)
    return () => { ro.disconnect(); io.disconnect(); wall.dispose(); sfx.close(); air.current = null }
  }, [])

  useEffect(() => {
    const sfx = sound.current
    if (!sfx) return
    sfx.setMuted(!soundOn)
    if (soundOn) {
      sfx.unlock()
      air.current ??= sfx.loop('paper-room', { gain: 0.32 })
    }
  }, [soundOn])

  const ready = status === 'ready'

  return <Room id="wallpaper" tone="light" className="wp" stageRef={stageRef}
    instruction="벽 어디든 잡아 끌어 벽지를 뜯어 보세요. 그 아래에도 한 겹이 있습니다."
    sound={{ on: soundOn, toggle: toggleSound }}
    notesTitle="어떻게 뜯기나요?" notes={NOTES}
    hud={<dl className="wp-hud">
      <div><dt>뜯은 조각</dt><dd>{stats.torn}</dd></div>
      <div><dt>가장 깊은 곳</dt><dd className="wp-depth">{stats.deepestName}</dd></div>
    </dl>}
    controls={<div className="wp-controls">
      <button type="button" disabled={!ready} onClick={() => engine.current?.peel()}>한 줄 뜯기</button>
      <button type="button" disabled={!ready} onClick={() => { sound.current?.unlock(); engine.current?.repaper() }}>새 벽지 바르기</button>
    </div>}>
    <canvas ref={canvasRef} role="img" aria-label="벽지가 발린 벽. 잡아 끌면 벽지가 찢기며 말려 올라가고, 아래에 더 오래된 벽지가 드러납니다." />
    <canvas ref={overlayRef} className="wp-overlay" aria-hidden="true" />
    {status === 'unsupported' && <div className="wp-veil"><p>이 브라우저에서는 벽을 그릴 수 없습니다.</p><Link to="/">실험실 목록으로 →</Link></div>}
  </Room>
}
