import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Room from '../components/Room'
import { createSfx } from '../components/sfx'
import { createMirror } from '../components/mirror/engine'
import { useSoundPref } from '../sound'
import rubUrl from '../assets/sfx/mirror-rub.m4a'
import dripUrl from '../assets/sfx/mirror-drip.m4a'
import roomUrl from '../assets/sfx/mirror-room.m4a'
import faucetUrl from '../assets/sfx/mirror-faucet.m4a'
import tapUrl from '../assets/sfx/mirror-tap.m4a'
import buzzUrl from '../assets/sfx/mirror-buzz.m4a'
import palmUrl from '../assets/sfx/mirror-palm.m4a'
import knockUrl from '../assets/sfx/mirror-knock.m4a'
import './LabMirror.css'

/* Lab — 김 서린 거울. 밤 욕실, 전구 하나. 닦으면 등 뒤가 비치고, 다시 서리면 저쪽에서 쓴 것이 드러난다. 장면·김 계산은 components/mirror. */
const NOTES = [
  ['진짜 반사', '거울에 비친 욕실은 그림이 아니라, 거울 평면에 대칭인 카메라로 등 뒤의 방을 실제로 그린 것입니다. 고개(마우스)를 움직이면 거울 속 시차도 따라 변합니다. 그 방에 서 있어야 할 사람은 비치지 않습니다.'],
  ['김', '거울을 512칸 격자로 나눠 GPU가 칸마다 김의 두께, 손가락 기름, 물기를 계산합니다. 김은 세면대 쪽 아래부터, 자리마다 다른 빠르기로 다시 서리고, 기름 묻은 자리에는 잘 서리지 않습니다(실제로 일어나는 일입니다). 천천히 문지르면 손끝, 빠르게 훔치면 손바닥 굵기로 닦입니다.'],
  ['물방울', '닦은 가장자리에 방울이 맺히고, 이웃과 합쳐져 무거워지면 흘러내리며 맑은 길을 남깁니다. 방울 하나하나가 등 뒤의 방을 뒤집어 비추는 작은 렌즈입니다.'],
  ['아껴 그리기', '반사는 무언가 바뀔 때만 다시 그리고, 손대지 않고 김이 저절로 서리는 동안은 30fps로 그립니다. 김이 다 서리고 아무도 만지지 않으면 그리기를 멈춥니다. 재질은 모두 코드로 그리고, 소리는 켰을 때만 내려받습니다.'],
  ['소리', '뽀득 소리, 물방울, 수도, 전구, 그리고 몇 가지 소리는 로컬 생성 모델로 만들었습니다.'],
]

export default function LabMirror() {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const engine = useRef(null)
  const sound = useRef(null)
  const air = useRef(null)
  const [status, setStatus] = useState('loading')
  const [stats, setStats] = useState({ wiped: 0, door: 0, faucet: false })
  const [soundOn, toggleSound] = useSoundPref()

  useEffect(() => {
    const sfx = createSfx({ 'mirror-rub': rubUrl, 'mirror-drip': dripUrl, 'mirror-room': roomUrl, 'mirror-faucet': faucetUrl, 'mirror-tap': tapUrl, 'mirror-buzz': buzzUrl, 'mirror-palm': palmUrl, 'mirror-knock': knockUrl })
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
    const onVis = () => mirror.setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => { ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); mirror.dispose(); sfx.close(); air.current = null }
  }, [])

  useEffect(() => {
    const sfx = sound.current
    if (!sfx) return
    sfx.setMuted(!soundOn)
    if (soundOn) {
      sfx.unlock()
      sfx.reverb(1.1, 3.2, 0.7)
      air.current ??= sfx.loop('mirror-room', { gain: 0.3, send: 0.1 })
    }
  }, [soundOn])

  return <Room id="mirror" tone="dark" className="mr" stageRef={stageRef}
    instruction="손가락으로 김을 닦아 보세요(닦기 버튼은 한 줄씩). 천천히 쓰면 글씨, 빠르게 훔치면 넓게 닦입니다. 김이 다시 서릴 때 잘 보세요."
    sound={{ on: soundOn, toggle: toggleSound }}
    notesTitle="어떻게 비치나요?" notes={NOTES}
    hud={<dl className="mr-hud">
      <div><dt>닦은 자리</dt><dd>{stats.wiped}<small>%</small></dd></div>
      <div><dt>문</dt><dd>{stats.door}<small>°</small></dd></div>
    </dl>}
    controls={<div className="mr-controls">
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.wipeBand()} aria-label="닦기: 손바닥으로 김을 한 줄 훔칩니다">닦기</button>
      <button type="button" disabled={status !== 'ready'} aria-pressed={stats.faucet} onClick={() => engine.current?.toggleFaucet()}>{stats.faucet ? '물 잠그기' : '뜨거운 물 틀기'}</button>
    </div>}>
    <canvas ref={canvasRef} role="img" aria-label="밤 욕실, 세면대 위 김 서린 거울. 손가락으로 닦으면 등 뒤의 욕실과 살짝 열린 문이 비칩니다." />
    {status === 'unsupported' && <div className="mr-veil"><p>이 브라우저에서는 거울을 그릴 수 없습니다.</p><Link to="/">실험실 목록으로 →</Link></div>}
  </Room>
}
