import horizonThumb from './assets/horizon-thumb.webp'
import portalThumb from './assets/portal-thumb.jpg'
import cityThumb from './assets/city-thumb.jpg'
import glassThumb from './assets/glass-thumb.webp'

/* 실험실의 방 목록. 이 순서가 목록 순서이자 방 안의 이전/다음 순서다.
   summary는 목록 카드에 쓰는 설명, 방 안의 한 줄 안내는 각 페이지가 정한다. */
export const ROOMS = [
  { id: 'tiles', title: '자석 타일', feel: '딸깍, 착.', summary: '쓸어 넘기거나, 한 칸을 잡아 당겨보세요.', tags: ['관성', '스프링 복원'] },
  { id: 'surface', title: '탄성 막', feel: '쭉, 탱글.', summary: '표면을 잡고 위로 당겼다가 놓아보세요.', tags: ['탄성 격자', '고정된 가장자리'] },
  { id: 'horizon', title: '사건의 지평선', feel: '휘고, 빨려들고.', thumb: horizonThumb,
    summary: '블랙홀 곁을 지나는 빛이 어떻게 휘는지 픽셀마다 실시간으로 계산합니다. 돌고, 다가가고, 뛰어들어 보세요.', tags: ['광선 추적', '도플러 빔', '시간 지연'] },
  { id: 'portal', title: '불가능한 방', feel: '옮기고, 건너고.', thumb: portalThumb,
    summary: '문 너머에는 다른 중력의 방이 있습니다. 문을 옮기고 돌린 뒤, 반대편으로 건너가 보세요.', tags: ['포털 렌더링', '시점 변환'] },
  { id: 'city', title: '접히는 도시', feel: '한 장에서, 도시로.', thumb: cityThumb,
    summary: '64개의 건물이 순서대로 일어나고 다시 접힙니다. 좌우로 밀어 중간에서 멈추거나 되돌려 보세요.', tags: ['경첩 구조', '인스턴싱'] },
  { id: 'glass', title: '유리 한 장', feel: '쩍, 와장창.', thumb: glassThumb,
    summary: '톡 치면 금이 가고, 꾹 눌렀다 놓을수록 세게 칩니다. 소리를 켜고 해보세요.', tags: ['보로노이 파괴', '굴절', '효과음'] },
].map((room) => ({ ...room, path: `/${room.id}` }))

export function neighbors(id) {
  const i = ROOMS.findIndex((room) => room.id === id)
  const n = ROOMS.length
  return { room: ROOMS[i], prev: ROOMS[(i - 1 + n) % n], next: ROOMS[(i + 1) % n] }
}
