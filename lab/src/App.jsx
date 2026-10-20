import { lazy, Suspense } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

/* 실험마다 three.js·셰이더 무게가 달라 페이지 단위로 나눠 받는다 */
const Lab = lazy(() => import('./pages/Lab'))
const LabHorizon = lazy(() => import('./pages/LabHorizon'))
const LabGlass = lazy(() => import('./pages/LabGlass'))
const LabSpatial = lazy(() => import('./pages/LabSpatial'))

const page = (el) => <Suspense fallback={<main className="lab-loading" aria-busy="true" />}>{el}</Suspense>

export default function App() {
  return <>
    <header className="lab-header">
      <div className="lab-header-inner">
        <a className="lab-logo" href="/" aria-label="Daily Lab 홈">
          <img src="/img/icons/icon-192.png" width="30" height="30" alt="" />
          <span>Daily Lab</span>
        </a>
        <NavLink to="/" end className="lab-section">실험실</NavLink>
        <a className="lab-app-link" href="/">오늘 앱 보기</a>
      </div>
    </header>
    <Routes>
      <Route path="/horizon" element={page(<LabHorizon />)} />
      <Route path="/glass" element={page(<LabGlass />)} />
      <Route path="/portal" element={page(<LabSpatial key="portal" mode="portal" />)} />
      <Route path="/city" element={page(<LabSpatial key="city" mode="city" />)} />
      <Route path="*" element={page(<Lab />)} />
    </Routes>
    <footer className="lab-footer">
      <p>© 2026 Daily Lab · 실험실의 작품들은 앱 ‘오늘’과 별개인 웹 기술 실험입니다.</p>
      <nav aria-label="하단 메뉴"><a href="/">오늘 앱</a><a href="mailto:dailylab.apps@gmail.com">문의</a></nav>
    </footer>
  </>
}
