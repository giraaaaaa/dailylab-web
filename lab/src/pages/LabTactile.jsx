import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Room from '../components/Room'
import { Studio, TileScene, MembraneScene } from '../components/tactile/Scenes'
import { StageBoundary, supportsWebGL, useMedia } from '../components/support'
import { useLabSound } from '../components/useLabSound'
import './LabTactile.css'

/* Lab — 자석 타일 · 탄성 막. 목록 카드에서 돌던 손맛 실험을 화면 하나 가득 연다. 장면은 components/tactile. */
const studies = {
  tiles: {
    Scene: TileScene, shadows: true, demo: '타일 떼었다 붙이기 시연',
    instruction: '한 칸을 떼어보세요. 가까이 놓으면 착, 다시 붙습니다.',
    notes: [
      ['붙어 있을 때, 떨어졌을 때', '타일은 처음에는 짧게 버티고 기울어집니다. 충분히 당기면 분리되어 손을 따라 움직이며, 제자리 가까이에 놓으면 정렬하며 붙습니다.'],
      ['놓은 자리가 다릅니다', '멀리 옮겨 놓으면 주변 타일을 피해서 머뭅니다. 다시 집어 원래 자리 가까이 가져가면 붙일 수 있습니다.'],
    ],
  },
  surface: {
    Scene: MembraneScene, shadows: false, demo: '탄성 막 당기기 시연',
    instruction: '표면을 집어 늘려보세요. 천천히 놓거나, 툭 놓거나.',
    notes: [
      ['표면에 걸리는 힘', '가장자리를 고정한 45 × 45 격자를 사용하고, 기울기가 커지는 구간은 장력을 높여 계산합니다. 놓는 속도도 첫 진동에 전달합니다. 정밀한 고무의 재료 모델은 아닙니다.'],
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
  const { audio, sound } = useLabSound()
  const onGrab = useCallback((value) => setGrabbed(value), [])

  return <Room id={mode} tone="light" className="tactile-room" stageClass={grabbed ? 'is-grabbed' : ''} sound={sound}
    instruction={grabbed ? mode === 'tiles' ? '가까이 놓으면 다시 붙습니다' : '놓는 빠르기를 바꿔보세요' : study.instruction} notes={study.notes}
    controls={<div className="tactile-controls">
      <button type="button" disabled={!glSupported} aria-label={study.demo} onClick={() => { setGrabbed(false); setDemo((n) => n + 1) }}>자동 시연</button>
      <button type="button" disabled={!glSupported} onClick={() => { setGrabbed(false); setReset((n) => n + 1) }}>처음으로</button>
    </div>}>
    {glSupported ? <StageBoundary><Canvas key={mode} orthographic camera={{ position: [6, 8.5, 9], zoom: 60, near: 0.1, far: 200 }}
      shadows={study.shadows} dpr={small ? [1, 1.5] : [1, 1.75]} frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-label={`${study.instruction} 아래 자동 시연 버튼으로도 움직임을 볼 수 있습니다.`}
      onCreated={({ gl }) => { gl.setClearColor('#000000', 0); gl.toneMappingExposure = 1.08 }}>
      <Studio wake={wake} small={small} fit={small ? 0.95 : 0.9} />
      <Scene demo={demo} reset={reset} reduced={reduced} onGrab={onGrab} audio={audio} />
    </Canvas></StageBoundary> : <div className="touch-fallback">이 브라우저에서는 3D 화면을 지원하지 않습니다.</div>}
  </Room>
}
