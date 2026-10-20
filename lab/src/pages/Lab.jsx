import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useMedia } from '../components/support'
import { preloadPath, useMorph } from '../nav'
import { ROOMS } from '../rooms'
import './Lab.css'

/* 실험실 목록. 실험마다 칸 하나, 칸마다 그 방을 녹화한 소리 없는 반복 영상.
   여기선 3D를 하나도 돌리지 않는다. 칸을 누르면 그 영상이 화면 가득 커지며 방이 된다(nav.jsx). */
const SCROLL_KEY = 'dl-lab-scroll'

function Loop({ room, reduced, named }) {
  const video = useRef(null)
  useEffect(() => {
    const v = video.current
    if (reduced) { v.pause(); return undefined }
    // 화면에 보일 때만 재생하고, 벗어나면 멈춘다
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) v.play().catch(() => {})
      else v.pause()
    }, { threshold: 0.3 })
    io.observe(v)
    return () => io.disconnect()
  }, [reduced])
  return <div className="shelf-media" style={named ? { viewTransitionName: 'room-media' } : undefined}>
    <video ref={video} src={room.loop} poster={room.poster} muted playsInline loop preload="none" aria-hidden="true"
      onLoadedMetadata={(e) => { e.currentTarget.muted = true }} />
  </div>
}

export default function Lab() {
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const morph = useMorph()
  const from = useLocation().state?.from

  useEffect(() => {
    const previous = document.title
    document.title = '실험실 · Daily Lab'
    return () => { document.title = previous }
  }, [])

  // 방에서 돌아오면 보던 자리로(전환이 새 화면을 찍기 전에 맞춰야 해서 layout effect)
  useLayoutEffect(() => {
    if (!from) return
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0)
    window.scrollTo(0, y)
  }, [from])

  const open = (room) => (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)) } catch { /* 저장 불가 환경 */ }
    morph(room.path, { media: e.currentTarget.querySelector('.shelf-media') })
  }

  return <main className="shelf-page">
    <header className="shelf-intro">
      <h1>별일 없이, 자꾸 만지게.</h1>
      <p>딸깍 맞물리거나, 탱글하게 돌아오거나. 잡고, 당기고, 놓아보세요.</p>
    </header>
    <ul className="shelf">
      {ROOMS.map((room) => <li key={room.id} className={`shelf-cell shelf-${room.id}`}>
        <a href={`/lab${room.path}`} onClick={open(room)} onPointerEnter={() => preloadPath(room.path)} onFocus={() => preloadPath(room.path)}>
          <Loop room={room} reduced={reduced} named={from === room.id} />
          <span className="shelf-caption">
            <span className="shelf-title">{room.title}</span>
            <span className="shelf-feel">{room.feel}</span>
            <span className="shelf-go" aria-hidden="true">→</span>
          </span>
        </a>
      </li>)}
    </ul>
  </main>
}
