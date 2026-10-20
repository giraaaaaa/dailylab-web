import tilesLoop from './assets/loops/tiles.mp4'
import tilesPoster from './assets/loops/tiles.jpg'
import tilesStill from './assets/loops/tiles-still.jpg'
import surfaceLoop from './assets/loops/surface.mp4'
import surfacePoster from './assets/loops/surface.jpg'
import surfaceStill from './assets/loops/surface-still.jpg'
import horizonLoop from './assets/loops/horizon.mp4'
import horizonPoster from './assets/loops/horizon.jpg'
import portalLoop from './assets/loops/portal.mp4'
import portalPoster from './assets/loops/portal.jpg'
import cityLoop from './assets/loops/city.mp4'
import cityPoster from './assets/loops/city.jpg'
import glassLoop from './assets/loops/glass.mp4'
import glassPoster from './assets/loops/glass.jpg'

/* 실험실의 방 목록. 이 순서가 목록(선반) 순서이자 방 안의 이전/다음 순서다.
   loop·poster는 목록 칸에 쓰는 녹화 영상과 첫 장면, still은 방이 열릴 때 장면이 그려지기 전까지 깔아 두는 그림
   (타일·탄성 막은 칸용 영상을 물건 쪽으로 잘라 두어서 방에선 자르지 않은 장면을 따로 쓴다).
   영상은 각 방을 헤드리스 Chrome으로 몇 초씩 녹화한 것(README 참고). */
export const ROOMS = [
  { id: 'horizon', title: '사건의 지평선', feel: '휘고, 빨려들고.', loop: horizonLoop, poster: horizonPoster,
    summary: '블랙홀 곁을 지나는 빛이 어떻게 휘는지 픽셀마다 실시간으로 계산합니다.', tags: ['광선 추적', '도플러 빔', '시간 지연'] },
  { id: 'tiles', title: '자석 타일', feel: '딸깍, 착.', loop: tilesLoop, poster: tilesPoster, still: tilesStill,
    summary: '쓸어 넘기거나, 한 칸을 잡아 당겨보세요.', tags: ['관성', '스프링 복원'] },
  { id: 'surface', title: '탄성 막', feel: '쭉, 탱글.', loop: surfaceLoop, poster: surfacePoster, still: surfaceStill,
    summary: '표면을 잡고 위로 당겼다가 놓아보세요.', tags: ['탄성 격자', '고정된 가장자리'] },
  { id: 'glass', title: '유리 한 장', feel: '쩍, 와장창.', loop: glassLoop, poster: glassPoster,
    summary: '톡 치면 금이 가고, 꾹 눌렀다 놓을수록 세게 칩니다.', tags: ['보로노이 파괴', '굴절', '효과음'] },
  { id: 'portal', title: '불가능한 방', feel: '옮기고, 건너고.', loop: portalLoop, poster: portalPoster,
    summary: '문 너머에는 다른 중력의 방이 있습니다.', tags: ['포털 렌더링', '시점 변환'] },
  { id: 'city', title: '접히는 도시', feel: '한 장에서, 도시로.', loop: cityLoop, poster: cityPoster,
    summary: '64개의 건물이 순서대로 일어나고 다시 접힙니다.', tags: ['경첩 구조', '인스턴싱'] },
  { id: 'well', title: '우물', feel: '퐁, 그리고 한참.',
    summary: '돌을 떨어뜨리면 한참 뒤에 물소리가 납니다.', tags: ['자유낙하', '소리 지연', '물결'] },
  { id: 'mirror', title: '김 서린 거울', feel: '뽀득, 주르륵.',
    summary: '닦으면 보입니다. 다시 서리면, 저쪽에서 쓴 글씨가 보입니다.', tags: ['김 격자', '물방울 렌즈', '흐린 반사'] },
].map((room) => ({ ...room, path: `/${room.id}`, still: room.still ?? room.poster }))

export function neighbors(id) {
  const i = ROOMS.findIndex((room) => room.id === id)
  const n = ROOMS.length
  return { room: ROOMS[i], prev: ROOMS[(i - 1 + n) % n], next: ROOMS[(i + 1) % n] }
}
