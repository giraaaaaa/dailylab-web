import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'

/* 목록 ↔ 방, 방 ↔ 방 이동을 View Transition으로 잇는다.
   목록 칸의 영상과 방의 무대가 같은 이름(room-media)을 가져서, 누른 칸이 그대로 화면 가득 커지며 방이 된다.
   새 화면은 전환 콜백 안에서 동기로 그려져야 하므로, 페이지 코드를 먼저 받아 두고(preload) flushSync로 바꾼다. */

// React.lazy 대신: 한 번 받아 둔 페이지는 다음부터 곧바로(동기로) 그려진다
export function loadable(load) {
  let mod = null
  let pending = null
  const preload = () => (pending ??= load().then((m) => { mod = m; return m }))
  function Loadable(props) {
    if (!mod) throw preload()
    const Page = mod.default
    return <Page {...props} />
  }
  Loadable.preload = preload
  return Loadable
}

export const pages = {
  index: loadable(() => import('./pages/Lab')),
  tactile: loadable(() => import('./pages/LabTactile')),
  horizon: loadable(() => import('./pages/LabHorizon')),
  glass: loadable(() => import('./pages/LabGlass')),
  spatial: loadable(() => import('./pages/LabSpatial')),
  well: loadable(() => import('./pages/LabWell')),
  mirror: loadable(() => import('./pages/LabMirror')),
  radio: loadable(() => import('./pages/LabRadio')),
}
const pageOf = { '/tiles': pages.tactile, '/surface': pages.tactile, '/horizon': pages.horizon, '/glass': pages.glass, '/portal': pages.spatial, '/city': pages.spatial, '/well': pages.well, '/mirror': pages.mirror, '/radio': pages.radio }
export const preloadPath = (to) => (pageOf[to] ?? pages.index).preload()

export function useMorph() {
  const navigate = useNavigate()
  return useCallback(async (to, { state, media } = {}) => {
    await preloadPath(to)
    const go = () => navigate(to, { state })
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || reduce) { go(); return }
    if (media) media.style.viewTransitionName = 'room-media'
    const vt = document.startViewTransition(() => flushSync(go))
    vt.finished.catch(() => {}).finally(() => { if (media?.isConnected) media.style.viewTransitionName = '' })
  }, [navigate])
}

// 새 탭·수정키 클릭은 브라우저 기본 동작 그대로, 그냥 누르면 전환과 함께 이동
export function MorphLink({ to, state, onClick, ...rest }) {
  const morph = useMorph()
  return <Link to={to} state={state} {...rest}
    onPointerEnter={() => preloadPath(to)} onFocus={() => preloadPath(to)}
    onClick={(e) => {
      onClick?.(e)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      morph(to, { state })
    }} />
}
