// 실험실 목록 칸에 쓰는 반복 영상·첫 장면을 각 방에서 녹화한다.
//   npm run build && npm run preview   (다른 터미널, http://localhost:4173/lab)
//   npm run loops [방 id ...]          (없으면 전부)
// 헤드리스 Chrome을 --remote-debugging-pipe로 띄운다(포트 방식은 WebGL이 꺼진다). ffmpeg가 필요하다.
// 방 틀(제목·버튼)은 숨기고, 방마다 자기 시연을 돌린 화면을 30fps mp4와 첫 장면 jpg로 src/assets/loops에 쓴다.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://localhost:4173'
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/loops')
const W = 1280, H = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (label) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); b?.click(); return !!b })()`

// settle: 녹화 전 대기, length: 길이, poster: 첫 장면으로 쓸 시점(ms), crop: 물건 쪽으로 자르기, still: 자르지 않은 첫 장면도 따로(방이 열릴 때 깔 그림)
const PLANS = {
  tiles: { settle: 2500, length: 4200, poster: 0, crop: 'crop=1000:640:140:93', still: true, run: async (b) => { await sleep(250); await b.evaluate(click('자동 시연')) } },
  surface: { settle: 2500, length: 5600, poster: 1300, crop: 'crop=1000:640:140:93', still: true, run: async (b) => { await sleep(200); await b.evaluate(click('자동 시연')) } },
  horizon: { settle: 9000, length: 5000, poster: 0, run: async () => {} },
  portal: { settle: 3000, length: 4200, poster: 0, run: async (b, mouse) => {
    const x = W * 0.5, y = H * 0.5
    await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y)
    for (let i = 1; i <= 40; i++) { await mouse('mouseMoved', x - Math.sin((i / 40) * Math.PI) * 240, y); await sleep(45) }
    await mouse('mouseReleased', x, y, 0)
  } },
  // 자동 시연은 2π/0.65 ≈ 9.67초 주기라 딱 한 바퀴를 떠서 끝과 처음이 이어지게
  city: { settle: 3500, length: 9670, poster: 2600, crf: 31, run: async (b) => { await b.evaluate(click('천천히 자동 시연')) } },
  glass: { settle: 2500, length: 5600, poster: 900, crf: 32, run: async (b) => {
    await sleep(300); await b.evaluate(click('톡 치기')); await sleep(700); await b.evaluate(click('톡 치기')); await sleep(800); await b.evaluate(click('와장창'))
  } },
  // 돌 두 개: 떨어지는 동안 작아지고, 수면에 닿으면 물결
  well: { settle: 3000, length: 6200, poster: 3600, run: async (b) => {
    await sleep(200); await b.evaluate(click('돌 떨어뜨리기')); await sleep(2600); await b.evaluate(click('돌 떨어뜨리기'))
  } },
  // 김을 지그재그로 닦아 욕실이 비치게
  mirror: { settle: 2500, length: 6000, poster: 4600, run: async (b, mouse) => {
    const x0 = W * 0.24, x1 = W * 0.76, y0 = H * 0.26
    await mouse('mouseMoved', x0, y0, 0); await mouse('mousePressed', x0, y0)
    for (let r = 0; r < 8; r++) {
      const from = r % 2 ? x1 : x0, to = r % 2 ? x0 : x1, y = y0 + r * 34
      for (let i = 0; i <= 16; i++) { await mouse('mouseMoved', from + (to - from) * (i / 16), y + Math.sin(i) * 3); await sleep(18) }
    }
    await mouse('mouseReleased', x0, y0 + 272, 0)
  } },
  // 잡음에서 방송 두 곳으로 훑어 간다
  radio: { settle: 2500, length: 6400, poster: 2600, run: async (b) => {
    await sleep(300); await b.evaluate(click('다음 방송')); await sleep(3200); await b.evaluate(click('다음 방송'))
  } },
  // 한 줄씩 세 번 뜯는다(말려 올라가는 모습과 떨어지는 조각)
  wallpaper: { settle: 2500, length: 6400, poster: 900, run: async (b) => {
    await sleep(250); await b.evaluate(click('한 줄 뜯기')); await sleep(2000); await b.evaluate(click('한 줄 뜯기')); await sleep(2000); await b.evaluate(click('한 줄 뜯기'))
  } },
}

async function launch(profile) {
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  const toChrome = chrome.stdio[3], fromChrome = chrome.stdio[4]
  let id = 0, buf = ''
  const pending = new Map(), listeners = []
  fromChrome.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    for (let i; (i = buf.indexOf('\0')) >= 0;) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1)
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) }
      else listeners.forEach((fn) => fn(msg))
    }
  })
  const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); toChrome.write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0') })
  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => raw(method, params, sessionId)
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  return {
    send,
    on: (fn) => listeners.push((m) => { if (m.sessionId === sessionId) fn(m) }),
    evaluate: async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value,
    close: () => { raw('Browser.close').catch(() => {}); setTimeout(() => chrome.kill(), 500) },
  }
}

async function record(room) {
  const plan = PLANS[room]
  const work = mkdtempSync(join(tmpdir(), `loop-${room}-`))
  const b = await launch(join(work, 'profile'))
  const mouse = (type, x, y, buttons = 1) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 })
  await b.send('Page.navigate', { url: `${BASE}/lab/${room}` })
  await sleep(plan.settle)
  await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = '.room-top,.room-hud,.room-bottom,.room-still,.gx-hint,.gx-ring,.hz-stats,.hz-gauge,.hz-veil,.wl-note{display:none!important}'; document.head.append(s); return true })()`)
  await sleep(300)

  const shots = []
  b.on((m) => {
    if (m.method !== 'Page.screencastFrame') return
    shots.push({ t: m.params.metadata.timestamp, data: m.params.data })
    b.send('Page.screencastFrameAck', { sessionId: m.params.sessionId })
  })
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
  const t0 = Date.now()
  const action = plan.run(b, mouse)
  while (Date.now() - t0 < plan.length) await sleep(50)
  await action
  const tEnd = Date.now() / 1000 // 화면이 안 바뀌면 프레임이 안 오니, 마지막 프레임을 녹화 끝까지 늘린다
  await b.send('Page.stopScreencast')
  b.close()

  // 고르지 않은 화면 간격을 그대로 살려 30fps로 다시 맞춘다
  const frame = (i) => join(work, `${String(i).padStart(4, '0')}.jpg`)
  const list = shots.map((s, i) => {
    writeFileSync(frame(i), Buffer.from(s.data, 'base64'))
    const next = shots[i + 1]?.t ?? Math.max(s.t + 1 / 30, tEnd)
    return `file '${frame(i)}'\nduration ${(next - s.t).toFixed(4)}`
  })
  writeFileSync(join(work, 'list.txt'), `${list.join('\n')}\nfile '${frame(shots.length - 1)}'\n`)
  const mp4 = join(OUT, `${room}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'),
    '-vf', `${plan.crop ? plan.crop + ',' : ''}fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(plan.crf ?? 29), '-movflags', '+faststart', '-an', mp4])
  const seconds = shots.at(-1).t - shots[0].t
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(plan.poster / 1000, seconds - 0.1)), '-i', mp4, '-frames:v', '1', '-q:v', '3', join(OUT, `${room}.jpg`)])
  if (plan.still) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', frame(0), '-q:v', '3', join(OUT, `${room}-still.jpg`)])
  rmSync(work, { recursive: true, force: true })
  console.log(`${room}: ${shots.length} frames, ${seconds.toFixed(2)}s`)
}

mkdirSync(OUT, { recursive: true })
for (const room of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PLANS)) {
  if (!PLANS[room]) { console.error(`모르는 방: ${room}`); process.exitCode = 1; continue }
  await record(room)
}
