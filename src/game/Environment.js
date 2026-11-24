import * as THREE from 'three'
import { envU } from './EnvU.js'
import { setWindowGlow } from './Castles.js'
import { setWalkerGlow } from './Walkers.js'
import { Fireflies } from './Fireflies.js'

// 昼夜与天气：太阳按时刻运行；天空（渐变、晚霞、星空、月亮、阴天）、光照、雾、云色、曝光、窗户灯光一起过渡。
// 雨、雪是围绕镜头的 GPU 粒子（顶点着色器里下落并循环，CPU 零开销）；下雪时地面、屋顶、树冠逐渐积雪，雨天地面变深。
const TIMES = { day: 14, dusk: 17.8, night: 23 }
const TORDER = ['day', 'dusk', 'night', 'auto'], WORDER = ['clear', 'rain', 'snow']
const v3 = (a, b, c) => new THREE.Vector3(a, b, c), C = h => new THREE.Color(h)
const SKY = {
  day: [v3(.16, .40, .78), v3(.47, .68, .92), v3(.93, .91, .84)],
  dusk: [v3(.2, .24, .5), v3(.68, .48, .58), v3(1., .63, .38)],
  night: [v3(.012, .02, .05), v3(.03, .05, .11), v3(.08, .1, .17)]
}
const PAL = {
  day: { sun: C(0xfff0d6), sunI: 3.0, sky: C(0xcfe2ff), gnd: C(0x56643a), hemiI: 1.0, fog: C(0xc6d6e0), near: 220, far: 1500, exp: 1.05, cloud: v3(1, 1, 1), disc: v3(1, .93, .8) },
  dusk: { sun: C(0xffa262), sunI: 2.5, sky: C(0xd8aaa6), gnd: C(0x4a3a2c), hemiI: .72, fog: C(0xdca58a), near: 200, far: 1400, exp: 1.1, cloud: v3(1., .72, .6), disc: v3(1, .62, .32) },
  night: { sun: C(0x9db2ff), sunI: .6, sky: C(0x3a4c82), gnd: C(0x10141e), hemiI: .5, fog: C(0x1a2338), near: 140, far: 1150, exp: 1.35, cloud: v3(.17, .2, .3), disc: v3(.6, .7, 1) }
}
const ss = THREE.MathUtils.smoothstep

const SKY_FS = `
uniform vec3 sun, uMoon, uZen, uMid, uHor, uDisc; uniform float uStars, uOver, uTime, uGlow;
varying vec3 vP;
float hsh(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 stars(vec3 d, float sc) {
  vec2 uv = vec2(atan(d.z, d.x) * sc / 3.1416, d.y * sc);
  vec2 id = floor(uv), f = fract(uv) - .5;
  float r = hsh(id); if (r < .955) return vec3(0.);
  vec2 o = vec2(hsh(id + 1.3), hsh(id + 7.1)) - .5;
  float b = smoothstep(.1, 0., length(f - o * .7)) * (r - .955) / .045;
  float tw = .55 + .45 * sin(uTime * (1.5 + r * 5.) + r * 90.);
  return b * tw * mix(vec3(.75, .82, 1.), vec3(1., .88, .72), hsh(id + 3.));
}
void main(){
  float h = vP.y;
  vec3 c = mix(uHor, uMid, smoothstep(0., .25, h)); c = mix(c, uZen, smoothstep(.25, .8, h));
  if (h < 0.) c = mix(uHor, uHor * .55, smoothstep(0., -.3, h));
  float s = max(dot(vP, sun), 0.);
  c += uDisc * (pow(s, 8.) * .35 + pow(s, 3.) * uGlow * (1. - smoothstep(-.05, .45, h))) * (1. - uOver * .7);
  c += uDisc * pow(s, 420.) * 5. * (1. - uOver);
  vec3 st = stars(vP, 70.) + stars(vP * vec3(1., 1.01, 1.), 150.) * .55;
  c += st * uStars * smoothstep(-.02, .3, h) * (1. - uOver);
  c += vec3(.5, .6, 1.) * .05 * uStars * smoothstep(.3, 0., abs(dot(vP, normalize(vec3(.3, .5, .8))))) * (1. - uOver);  // 淡淡的银河
  float m = dot(vP, uMoon);
  c += vec3(.96, .94, .86) * smoothstep(.99955, .99972, m) * 1.6 * uStars * (1. - uOver * .85) + vec3(.45, .55, .85) * pow(max(m, 0.), 60.) * .22 * uStars;
  float l = dot(c, vec3(.3, .5, .2));
  c = mix(c, vec3(l) * vec3(.94, .98, 1.04) * .85 + .02, uOver * .85);
  gl_FragColor = vec4(pow(max(c, 0.), vec3(2.2)), 1.);
}`

class Precip {
  constructor(scene, rain) {
    const N = rain ? 7000 : 9000, verts = rain ? 2 : 1, a = new Float32Array(N * verts * 4)
    for (let i = 0; i < N; i++) { const s = [Math.random(), Math.random(), Math.random()]; for (let k = 0; k < verts; k++) a.set([...s, k], (i * verts + k) * 4) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * verts * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(a, 4))
    this.u = { uCam: { value: v3(0, 0, 0) }, uB: { value: rain ? v3(70, 50, 70) : v3(70, 44, 70) }, uTime: { value: 0 }, uK: { value: 0 }, uWind: { value: new THREE.Vector2(4, 2) }, uLum: { value: 1 }, uScale: { value: 800 } }
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.u,
      vertexShader: `
        attribute vec4 aSeed; uniform vec3 uCam, uB; uniform float uTime, uK, uScale; uniform vec2 uWind; varying float vA;
        void main() {
          ${rain ? `
          vec3 v = vec3(uWind.x, -(24. + aSeed.x * 10.), uWind.y);
          vec3 p = aSeed.xyz * uB + v * uTime;` : `
          vec3 v = vec3(uWind.x * .35, -(1.1 + aSeed.x * .9), uWind.y * .35);
          vec3 p = aSeed.xyz * uB + v * uTime;
          p.x += sin(uTime * .8 + aSeed.y * 30.) * 1.3; p.z += cos(uTime * .7 + aSeed.z * 30.) * 1.3;`}
          vec3 w = uCam + mod(p - uCam, uB) - uB * .5;
          ${rain ? 'w -= normalize(v) * aSeed.w * (.6 + aSeed.y * .6);' : ''}
          vec3 q = abs(w - uCam) / (uB * .5);
          vA = step(fract(aSeed.z * 13.1 + aSeed.x * 7.7), uK) * (1. - smoothstep(.55, 1., max(q.x, max(q.y, q.z))));
          vec4 mv = viewMatrix * vec4(w, 1.);
          ${rain ? '' : 'gl_PointSize = clamp((.07 + aSeed.y * .06) * uScale / max(-mv.z, .1), 1.2, 8.);'}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: rain ? `
        uniform float uLum; varying float vA;
        void main() { if (vA < .01) discard; gl_FragColor = vec4(vec3(.72, .78, .88) * uLum, vA * .32); }` : `
        uniform float uLum; varying float vA;
        void main() { vec2 q = gl_PointCoord - .5; float a = smoothstep(.5, .15, length(q)) * vA; if (a < .01) discard; gl_FragColor = vec4(vec3(.97, .98, 1.) * uLum, a * .9); }`
    })
    this.obj = rain ? new THREE.LineSegments(g, mat) : new THREE.Points(g, mat)
    this.obj.frustumCulled = false; this.obj.renderOrder = 7; this.obj.visible = false; scene.add(this.obj)
  }
  update(t, cam, k, lum) {
    this.obj.visible = k > .005
    if (!this.obj.visible) return
    this.u.uTime.value = t % 2000; this.u.uCam.value.copy(cam); this.u.uK.value = k; this.u.uLum.value = lum
    this.u.uScale.value = Math.min(devicePixelRatio, 2) * innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(32)))
  }
}

export class Environment {
  constructor(scene, w, post, audio, state) {
    Object.assign(this, { scene, w, post, audio, state })
    this.hour = TIMES.day; this.tod = 'day'; this.weather = 'clear'; this.rainK = 0; this.snowK = 0; this.cover = 0
    this.sunV = w.sky.material.uniforms.sun.value                 // 与云共享同一个太阳方向
    this.moon = v3(0, 1, 0)
    this.skyU = {
      sun: { value: this.sunV }, uMoon: { value: this.moon }, uZen: { value: v3(0, 0, 0) }, uMid: { value: v3(0, 0, 0) }, uHor: { value: v3(0, 0, 0) },
      uDisc: { value: v3(1, 1, 1) }, uStars: { value: 0 }, uOver: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0 }
    }
    w.sky.material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: this.skyU, vertexShader: w.sky.material.vertexShader, fragmentShader: SKY_FS })
    this.rain = new Precip(scene, true); this.snow = new Precip(scene, false)
    this.flies = new Fireflies(scene, w.heightAt)
    this.tmp = { c1: new THREE.Color(), c2: new THREE.Color(), v: v3(0, 0, 0) }
    state.tod = 'day'; state.weather = 'clear'
  }
  setTime(n) { this.tod = n; this.state.tod = n }
  setWeather(n) { this.weather = n; this.state.weather = n }
  cycleTime() { this.setTime(TORDER[(TORDER.indexOf(this.tod) + 1) % TORDER.length]) }
  cycleWeather() { this.setWeather(WORDER[(WORDER.indexOf(this.weather) + 1) % WORDER.length]) }
  _mix(key, kd, kn) {
    const a = PAL.dusk[key], b = PAL.day[key], c = PAL.night[key]
    if (typeof a === 'number') return (a + (b - a) * kd) * (1 - kn) + c * kn
    return a.clone().lerp(b, kd).lerp(c, kn)
  }
  update(dt, t, cam) {
    // ---- 时刻：总是向前推进到目标时刻（夜→昼会经过黎明） ----
    if (this.tod === 'auto') this.hour = (this.hour + dt * 24 / 360) % 24
    else { const d = (TIMES[this.tod] - this.hour + 24) % 24; if (d > .01) this.hour = (this.hour + Math.min(d, (2.5 + d * .9) * dt)) % 24 }
    const th = (this.hour - 6) / 12 * Math.PI
    this.sunV.set(-Math.cos(th) * .78, Math.sin(th) * .8, -.62).normalize()
    this.moon.set(Math.cos(th) * .6 + .2, Math.max(-this.sunV.y, 0) * .7 + .3, .5).normalize()
    const e = this.sunV.y, kd = ss(e, .06, .4), kn = ss(-e, -.02, .22)

    // ---- 天气 ----
    const kr = 1 - Math.exp(-dt * .45)
    this.rainK += ((this.weather === 'rain' ? 1 : 0) - this.rainK) * kr
    this.snowK += ((this.weather === 'snow' ? 1 : 0) - this.snowK) * kr
    const ov = Math.max(this.rainK, this.snowK * .85)
    this.cover += ((this.weather === 'snow' ? 1 : 0) - this.cover) * (1 - Math.exp(-dt / (this.weather === 'snow' ? 16 : 9)))
    envU.uSnow.value = this.cover; envU.uWet.value += (this.rainK - envU.uWet.value) * (1 - Math.exp(-dt / 4))

    // ---- 天空 ----
    const S = this.skyU, sk = (i, u) => u.value.copy(SKY.dusk[i]).lerp(SKY.day[i], kd).lerp(SKY.night[i], kn)
    sk(0, S.uZen); sk(1, S.uMid); sk(2, S.uHor)
    S.uDisc.value.copy(this._mix('disc', kd, kn)); S.uGlow.value = (1 - kd) * (1 - kn) * .9
    S.uStars.value = ss(-e, -.05, .25); S.uOver.value = ov; S.uTime.value = t

    // ---- 光照、雾、曝光 ----
    const W = this.w, T = this.tmp
    const sunAbove = T.v.copy(this.sunV); sunAbove.y = Math.max(sunAbove.y, .06)
    W.lightDir.copy(sunAbove.normalize()).lerp(this.moon, kn).normalize()
    W.sun.color.copy(this._mix('sun', kd, kn)); W.sun.intensity = this._mix('sunI', kd, kn) * (1 - .8 * ov)
    W.hemi.color.copy(this._mix('sky', kd, kn)); W.hemi.groundColor.copy(this._mix('gnd', kd, kn)); W.hemi.intensity = this._mix('hemiI', kd, kn) * (1 + .15 * ov)
    const fog = this.scene.fog, fc = T.c1.copy(this._mix('fog', kd, kn))
    const lum = fc.r * .3 + fc.g * .5 + fc.b * .2
    fog.color.copy(fc.lerp(T.c2.setRGB(lum * .92, lum * .97, lum * 1.05), ov * .8))
    W.hemi.color.lerp(fog.color, ov * .5)
    fog.near = this._mix('near', kd, kn) * (1 - .65 * ov); fog.far = this._mix('far', kd, kn) * (1 - .5 * ov)
    this.post.final.uniforms.uExposure.value = this._mix('exp', kd, kn) * (1 + .08 * ov)
    W.clouds.mat.uniforms.uLight.value.copy(this._mix('cloud', kd, kn)).multiplyScalar(1 - .42 * ov)

    // ---- 窗户灯光：黄昏渐亮，夜里通明 ----
    setWindowGlow(Math.min(1, ss(-e, -.3, .05) + ov * .25))
    setWalkerGlow(ss(-e, -.3, .05))
    // 萤火虫：天黑后出现，雨雪天躲起来
    this.flies.update(dt, t, cam, ss(-e, -.04, .2) * (1 - this.rainK) * (1 - this.snowK))

    // ---- 降水粒子与声音 ----
    const light = .35 + .65 * (1 - kn) * (1 - .3 * ov)
    this.rain.update(t, cam, this.rainK, light); this.snow.update(t, cam, this.snowK, light)
    this.audio.setAmbience && this.audio.setAmbience(this.rainK, kn, this.snowK)
  }
}
