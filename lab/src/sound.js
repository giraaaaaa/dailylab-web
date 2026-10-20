import { useCallback, useEffect, useState } from 'react'

/* 모든 방이 같이 쓰는 소리 설정. 기본은 꺼짐이고, 한 번 켜면 다음 방문에도 기억한다(이 브라우저에만). */
const KEY = 'dl-lab-sound'

function read() {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

export function useSoundPref() {
  const [on, setOn] = useState(read)
  useEffect(() => {
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* 저장할 수 없는 환경 */ }
  }, [on])
  const toggle = useCallback(() => setOn((v) => !v), [])
  return [on, toggle]
}
