import { useEffect, useRef, useState } from 'react'
import { MorphLink, useMorph } from '../nav'
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
  const morph = useMorph()
  const sheet = useRef(null)
  const [touched, setTouched] = useState(false)
  const [veiled, setVeiled] = useState(true)

  useEffect(() => {
    const previous = document.title
    document.title = `${room.title} · Daily Lab`
    window.scrollTo(0, 0)
    return () => { document.title = previous }
  }, [room.title])

  // 장면이 첫 화면을 그릴 시간 동안 녹화해 둔 첫 장면을 덮어 둔다(목록 칸에서 커져 들어올 때 이어지는 그림)
  useEffect(() => {
    setTouched(false)
    setVeiled(true)
    const t = setTimeout(() => setVeiled(false), 650)
    return () => clearTimeout(t)
  }, [id])

  // 아무 데도 포커스가 없을 때만 ←/→로 이웃 방으로. 무대나 캔버스에 포커스가 있으면 그 실험의 조작이 먼저다
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || sheet.current?.open) return
      const el = document.activeElement
      if (el && el !== document.body) return
      if (e.key === 'ArrowLeft') morph(prev.path)
      else if (e.key === 'ArrowRight') morph(next.path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [morph, prev.path, next.path])

  return <main className={`room room-${tone} ${className}${new URLSearchParams(window.location.search).has('capture') ? ' room-capture' : ''}`}>
    <div ref={stageRef} className={`room-stage ${stageClass}`} onPointerDownCapture={() => setTouched(true)} {...stageProps}>
      {children}
      {room.still && <img className={`room-still${veiled ? '' : ' is-gone'}`} src={room.still} alt="" aria-hidden="true" decoding="async" />}
    </div>

    <header className="room-top">
      <MorphLink to="/" state={{ from: id }} className="room-pill">← 실험실</MorphLink>
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
        <MorphLink to={prev.path} className="room-pill room-step" aria-label={`이전 실험: ${prev.title}`} title={prev.title}>←</MorphLink>
        <MorphLink to={next.path} className="room-pill room-step" aria-label={`다음 실험: ${next.title}`} title={next.title}>→</MorphLink>
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
