import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { neighbors } from '../rooms'
import './Room.css'

/* 실험 방의 공통 틀. 실험은 화면 전체(무대)를 쓰고, 그 위 같은 자리에
   위: 실험실로·소리·원리 / 오른쪽 위: 실험별 수치 / 아래: 제목·안내, 조작, 이전·다음 을 얹는다.
   tone은 장면 밝기에 맞춘 글자색(dark = 어두운 장면 위 흰 글자). */
export default function Room({
  id, tone = 'dark', className = '', instruction, hud, controls,
  notes = [], notesTitle = '어떻게 움직이나요?', intro, sound,
  stageRef, stageClass = '', stageProps, children,
}) {
  const { room, prev, next } = neighbors(id)
  const navigate = useNavigate()
  const sheet = useRef(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const previous = document.title
    document.title = `${room.title} · Daily Lab`
    window.scrollTo(0, 0)
    return () => { document.title = previous }
  }, [room.title])

  useEffect(() => { setTouched(false) }, [id])

  // 아무 데도 포커스가 없을 때만 ←/→로 이웃 방으로. 무대나 캔버스에 포커스가 있으면 그 실험의 조작이 먼저다
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || sheet.current?.open) return
      const el = document.activeElement
      if (el && el !== document.body) return
      if (e.key === 'ArrowLeft') navigate(prev.path)
      else if (e.key === 'ArrowRight') navigate(next.path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, prev.path, next.path])

  return <main className={`room room-${tone} ${className}`}>
    <div ref={stageRef} className={`room-stage ${stageClass}`} onPointerDownCapture={() => setTouched(true)} {...stageProps}>
      {children}
    </div>

    <header className="room-top">
      <Link to="/" className="room-pill">← 실험실</Link>
      <div className="room-actions">
        {sound && <button type="button" role="switch" aria-checked={sound.on} className="room-pill room-sound" onClick={sound.toggle}>
          소리 {sound.on ? '켬' : '끔'}
        </button>}
        <button type="button" className="room-pill" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>원리</button>
      </div>
    </header>

    {hud && <div className="room-hud">{hud}</div>}

    <footer className="room-bottom">
      <div className="room-caption">
        <h1>{room.title}</h1>
        {instruction && <p className={touched ? 'is-quiet' : undefined}>{instruction}</p>}
      </div>
      {controls && <div className="room-controls">{controls}</div>}
      <nav className="room-nav" aria-label="다른 실험">
        <Link to={prev.path} className="room-pill room-step" aria-label={`이전 실험: ${prev.title}`} title={prev.title}>←</Link>
        <Link to={next.path} className="room-pill room-step" aria-label={`다음 실험: ${next.title}`} title={next.title}>→</Link>
      </nav>
    </footer>

    {/* 원리 설명. 바깥(배경)을 누르거나 Esc로 닫힌다 */}
    <dialog ref={sheet} className="room-sheet" aria-labelledby={`${id}-sheet-title`}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
      <div className="room-sheet-body">
        <div className="room-sheet-head">
          <h2 id={`${id}-sheet-title`}>{notesTitle}</h2>
          <button type="button" className="room-sheet-close" onClick={() => sheet.current?.close()}>닫기</button>
        </div>
        {intro && <p className="room-sheet-intro">{intro}</p>}
        <div className="room-sheet-grid">
          {notes.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
        </div>
        <ul className="room-tags" aria-label="쓰인 기술">{room.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
      </div>
    </dialog>
  </main>
}
