import { lazy, Suspense } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

/* 실험마다 three.js·셰이더 무게가 달라 페이지 단위로 나눠 받는다 */
const Lab = lazy(() => import('./pages/Lab'))
const LabTactile = lazy(() => import('./pages/LabTactile'))
const LabHorizon = lazy(() => import('./pages/LabHorizon'))
const LabGlass = lazy(() => import('./pages/LabGlass'))
const LabSpatial = lazy(() => import('./pages/LabSpatial'))

const page = (el) => <Suspense fallback={<main className="lab-loading" aria-busy="true" />}>{el}</Suspense>

/* 목록에만 사이트 머리·꼬리가 붙는다. 실험 방은 화면 전체를 쓰고 자기 틀(components/Room)을 갖는다 */
function IndexPage() {
  return <>
    <header className="lab-header">
      <div className="lab-header-inner">
        <a className="lab-mark" href="/" aria-label="Daily Lab 홈">Daily Lab</a>
        <NavLink to="/" end className="lab-section">실험실</NavLink>
      </div>
    </header>
    {page(<Lab />)}
    <footer className="lab-footer">
      <p>© 2026 Daily Lab</p>
      <nav aria-label="하단 메뉴"><a href="/">홈</a><a href="mailto:dailylab.apps@gmail.com">문의</a></nav>
    </footer>
  </>
}

export default function App() {
  return <Routes>
    <Route path="/tiles" element={page(<LabTactile key="tiles" mode="tiles" />)} />
    <Route path="/surface" element={page(<LabTactile key="surface" mode="surface" />)} />
    <Route path="/horizon" element={page(<LabHorizon />)} />
    <Route path="/glass" element={page(<LabGlass />)} />
    <Route path="/portal" element={page(<LabSpatial key="portal" mode="portal" />)} />
    <Route path="/city" element={page(<LabSpatial key="city" mode="city" />)} />
    <Route path="*" element={<IndexPage />} />
  </Routes>
}
