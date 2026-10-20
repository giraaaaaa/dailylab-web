import { VERT, SCENE, DOWN, UP, COMPOSITE } from './shaders'

/* WebGL2 렌더러 — 장면(광선 추적)은 낮춘 해상도로 그리고, 블룸 6단을 거쳐 화면 해상도로 합성한다. */

const BLOOM_LEVELS = 6

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed')
  return s
}

function program(gl, fs) {
  const p = gl.createProgram()
  const v = compile(gl, gl.VERTEX_SHADER, VERT)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program link failed')
  const locs = new Map()
  return {
    p,
    u(name) {
      if (!locs.has(name)) locs.set(name, gl.getUniformLocation(p, name))
      return locs.get(name)
    },
  }
}

export function createHorizon(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  })
  if (!gl) throw new Error('webgl2')
  const hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
  const outScale = hdr ? 1 : 0.25
  const vao = gl.createVertexArray()
  const scene = program(gl, SCENE)
  const down = program(gl, DOWN)
  const up = program(gl, UP)
  const comp = program(gl, COMPOSITE)

  let sceneRT = null
  let levels = []

  function target(w, h) {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { tex, fb, w, h }
  }

  function free(t) {
    if (!t) return
    gl.deleteTexture(t.tex)
    gl.deleteFramebuffer(t.fb)
  }

  function allocate(w, h) {
    free(sceneRT)
    levels.forEach(free)
    sceneRT = target(w, h)
    levels = []
    let lw = w, lh = h
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      lw = Math.max(2, lw >> 1)
      lh = Math.max(2, lh >> 1)
      levels.push(target(lw, lh))
      if (lw <= 4 || lh <= 4) break
    }
  }

  function bindTex(prog, name, tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(prog.u(name), unit)
  }

  function pass(fb, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /* css 크기·dpr·렌더 배율이 바뀔 때만 버퍼를 다시 잡는다. 반환값: 장면 해상도 */
  function resize(cssW, cssH, dpr, scale) {
    const w = Math.max(2, Math.round(cssW * dpr))
    const h = Math.max(2, Math.round(cssH * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const sw = Math.max(2, Math.round(w * scale))
    const sh = Math.max(2, Math.round(h * scale))
    if (!sceneRT || sceneRT.w !== sw || sceneRT.h !== sh) allocate(sw, sh)
    return { w: sw, h: sh }
  }

  function render(s) {
    gl.bindVertexArray(vao)
    gl.disable(gl.BLEND)

    gl.useProgram(scene.p)
    gl.uniform2f(scene.u('uRes'), sceneRT.w, sceneRT.h)
    gl.uniform1f(scene.u('uTime'), s.time)
    gl.uniform3fv(scene.u('uCam'), s.cam)
    gl.uniformMatrix3fv(scene.u('uBasis'), false, s.basis)
    gl.uniform1f(scene.u('uTanFov'), s.tanFov)
    gl.uniform1f(scene.u('uDoppler'), s.doppler)
    gl.uniform1f(scene.u('uPix'), (2 * s.tanFov) / sceneRT.h)
    gl.uniform1i(scene.u('uSteps'), s.steps)
    gl.uniform1f(scene.u('uOutScale'), outScale)
    pass(sceneRT.fb, sceneRT.w, sceneRT.h)

    gl.useProgram(down.p)
    gl.uniform1f(down.u('uThresh'), 0.9 * outScale)
    let src = sceneRT
    levels.forEach((dst, i) => {
      bindTex(down, 'uSrc', src.tex, 0)
      gl.uniform2f(down.u('uTexel'), 1 / src.w, 1 / src.h)
      gl.uniform1f(down.u('uPrefilter'), i === 0 ? 1 : 0)
      pass(dst.fb, dst.w, dst.h)
      src = dst
    })

    gl.useProgram(up.p)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = levels.length - 2; i >= 0; i--) {
      const from = levels[i + 1]
      bindTex(up, 'uSrc', from.tex, 0)
      gl.uniform2f(up.u('uTexel'), 0.5 / from.w, 0.5 / from.h)
      pass(levels[i].fb, levels[i].w, levels[i].h)
    }
    gl.disable(gl.BLEND)

    gl.useProgram(comp.p)
    bindTex(comp, 'uScene', sceneRT.tex, 0)
    bindTex(comp, 'uBloom', levels[0].tex, 1)
    gl.uniform1f(comp.u('uBloomStr'), s.bloom)
    gl.uniform1f(comp.u('uExposure'), s.exposure)
    gl.uniform1f(comp.u('uTime'), s.time)
    gl.uniform1f(comp.u('uFade'), s.fade)
    gl.uniform1f(comp.u('uInScale'), 1 / outScale)
    pass(null, canvas.width, canvas.height)
  }

  function dispose() {
    free(sceneRT)
    levels.forEach(free)
    ;[scene, down, up, comp].forEach((x) => gl.deleteProgram(x.p))
    gl.deleteVertexArray(vao)
  }

  return { gl, hdr, resize, render, dispose }
}
