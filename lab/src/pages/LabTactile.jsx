import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Room from '../components/Room'
import { Studio, TileScene, MembraneScene } from '../components/tactile/Scenes'
import { StageBoundary, supportsWebGL, useMedia } from '../components/support'
import './LabTactile.css'

/* Lab — 자석 타일 · 탄성 막. 목록 카드에서 돌던 손맛 실험을 화면 하나 가득 연다. 장면은 components/tactile. */
const studies = {
  tiles: {
    Scene: TileScene, shadows: true, demo: '타일 물결 시연',
    instruction: '쓸어 넘기거나, 한 칸을 잡아 당겨보세요.',
    notes: [
      ['감쇠 스프링', '각 타일의 위치와 기울기를 감쇠 스프링으로 계산합니다. 당기는 동안 따라오고, 놓으면 제자리로 돌아갑니다.'],
      ['딸깍 맞물림', '받침은 단단한 멈춤 면이라 되튀는 폭을 일부러 작고 또렷하게 잡았습니다. 쓸어 넘기면 지나간 칸부터 차례로 들썩입니다.'],
    ],
  },
  surface: {
    Scene: MembraneScene, shadows: false, demo: '탄성 막 당기기 시연',
    instruction: '표면을 잡고 위로 당겼다가 놓아보세요.',
    notes: [
      ['탄성 격자', '가장자리를 고정한 45 × 45 격자에서 변형을 전달합니다. 실제 유체나 고무의 정밀 시뮬레이션이 아닌, 손맛을 위한 탄성 모델입니다.'],
      ['멈추면 쉰다', '움직임이 잦아들면 격자를 원래대로 되돌리고 그리기를 멈춥니다. 다시 만지면 그때부터 계산합니다.'],
    ],
  },
}

export default function LabTactile({ mode }) {
  const study = studies[mode]
  const { Scene } = study
  const small = useMedia('(max-width: 760px)')
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const glSupported = useMemo(supportsWebGL, [])
  const wake = useRef(null)
  const [demo, setDemo] = useState(0)
  const [reset, setReset] = useState(0)
  const [grabbed, setGrabbed] = useState(false)
  const onGrab = useCallback((value) => setGrabbed(value), [])

  return <Room id={mode} tone="light" className="tactile-room" stageClass={grabbed ? 'is-grabbed' : ''}
    instruction={grabbed ? '놓으면 돌아와요' : study.instruction} notes={study.notes}
    controls={<div className="tactile-controls">
      <button type="button" disabled={!glSupported} aria-label={study.demo} onClick={() => { setGrabbed(false); setDemo((n) => n + 1) }}>자동 시연</button>
      <button type="button" disabled={!glSupported} onClick={() => { setGrabbed(false); setReset((n) => n + 1) }}>처음으로</button>
    </div>}>
    {glSupported ? <StageBoundary><Canvas key={mode} orthographic camera={{ position: [6, 8.5, 9], zoom: 60, near: 0.1, far: 200 }}
      shadows={study.shadows} dpr={small ? [1, 1.5] : [1, 1.75]} frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-label={`${study.instruction} 아래 자동 시연 버튼으로도 움직임을 볼 수 있습니다.`}
      onCreated={({ gl }) => { gl.setClearColor('#000000', 0); gl.toneMappingExposure = 1.08 }}>
      <Studio wake={wake} small={small} fit={small ? 0.95 : 0.78} />
      <Scene demo={demo} reset={reset} reduced={reduced} onGrab={onGrab} />
    </Canvas></StageBoundary> : <div className="touch-fallback">이 브라우저에서는 3D 화면을 지원하지 않습니다.</div>}
  </Room>
}
