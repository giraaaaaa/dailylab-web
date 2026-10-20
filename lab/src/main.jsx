import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '../../public/assets/tokens.css' // 홈과 같은 색·글꼴(빌드 때 묶임)
import './base.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* v7_startTransition은 켜지 않는다: 이동이 transition으로 미뤄지면 View Transition 콜백 안에서 새 화면을 그릴 수 없다(nav.jsx) */}
    <BrowserRouter basename="/lab" future={{ v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
