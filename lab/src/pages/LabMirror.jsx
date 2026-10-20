import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Room from '../components/Room'
import { createSfx } from '../components/sfx'
import { createMirror } from '../components/mirror/engine'
import { useSoundPref } from '../sound'
import rubUrl from '../assets/sfx/mirror-rub.m4a'
import dripUrl from '../assets/sfx/mirror-drip.m4a'
import roomUrl from '../assets/sfx/mirror-room.m4a'
import './LabMirror.css'

/* Lab — 김 서린 거울. 닦으면 보이고, 다시 서리면 저쪽에서 쓴 글씨가 보인다. 장면·김 계산은 components/mirror. */
const NOTES = [
  ['김과 물방울', '거울을 작은 격자로 나눠 칸마다 김의 두께를 계산합니다. 손가락이 지나간 자리는 김이 걷히고, 그 가장자리에 물이 모여 방울이 됩니다. 무거워진 방울은 흘러내리며 지나간 자리를 투명하게 남깁니다.'],
  ['흐린 거울', '거울에 비친 욕실은 따로 그린 3D 장면이고, 김이 두꺼운 칸일수록 그 장면을 더 흐리게(밉맵을 높여) 읽어 뿌옇게 보이게 합니다. 물방울은 작은 렌즈처럼 장면을 굴절시킵니다.'],
  ['다시 서리는 김', '김은 자리마다 조금씩 다른 빠르기로 다시 서립니다. 손가락 기름이 묻은 자리는 김이 잘 서리지 않는데, 실제 거울에서도 일어나는 일입니다.'],
  ['소리', '뽀득 소리와 물방울, 욕실 공기는 로컬 생성 모델로 만들었습니다. 문지르는 빠르기에 맞춰 짧은 조각을 골라 이어 붙입니다.'],
]

export default function LabMirror() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const air = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ wiped: 0, drops: 0 })
  const [soundOn, toggleSound] = useSoundPref()

  useEffect(() => {
    const sfx = createSfx({ 'mirror-rub': rubUrl, 'mirror-drip': dripUrl, 'mirror-room': roomUrl })
    sound.current = sfx
    let mirror
    try {
      mirror = createMirror(canvasRef.current, { sfx, onStats: setStats })
    } catch (e) {
      console.error(e)
      setStatus('unsupported')
      return () => sfx.close()
    }
    engine.current = mirror
    const stage = stageRef.current
    const measure = () => { const r = stage.getBoundingClientRect(); mirror.resize(Math.max(1, r.width), Math.max(1, r.height)) }
    measure()
    setStatus('ready')
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    const io = new IntersectionObserver(([entry]) => mirror.setPaused(!entry.isIntersecting))
    io.observe(stage)
    return () => { ro.disconnect(); io.disconnect(); mirror.dispose(); sfx.close(); air.current = null }
  }, [])

  useEffect(() => {
    const sfx = sound.current
    if (!sfx) return
    sfx.setMuted(!soundOn)
    if (soundOn) {
      sfx.unlock()
      sfx.reverb(1.1, 3.2, 0.7)
      air.current ??= sfx.loop('mirror-room', { gain: 0.35, send: 0.1 })
    }
  }, [soundOn])

  return <Room id="mirror" tone="light" className="mr" stageRef={stageRef}
    instruction="손가락으로 김을 닦아 보세요. 김이 다시 서릴 때 잘 보세요."
    sound={{ on: soundOn, toggle: toggleSound }}
    notesTitle="어떻게 서리나요?" notes={NOTES}
    hud={<dl className="mr-hud">
      <div><dt>닦은 자리</dt><dd>{stats.wiped}<small>%</small></dd></div>
      <div><dt>흘러내린 방울</dt><dd>{stats.drops}</dd></div>
    </dl>}
    controls={<div className="mr-controls">
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.steam()}>김 다시 서리게</button>
    </div>}>
    <canvas ref={canvasRef} role="img" aria-label="김이 서린 욕실 거울. 손가락으로 닦으면 뒤쪽 욕실이 비쳐 보이고, 물방울이 흘러내립니다." />
    {status === 'unsupported' && <div className="mr-veil"><p>이 브라우저에서는 거울을 그릴 수 없습니다.</p><Link to="/">실험실 목록으로 →</Link></div>}
  </Room>
}
