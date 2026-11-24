import * as THREE from 'three'
import { LOW } from './Quality.js'
import { createWizard } from './Wizard.js'
import { Multi } from './Multi.js'
import { createWorld } from './World.js'
import { Trail } from './Trail.js'
import { PostFX } from './PostFX.js'
import { GameAudio } from './Audio.js'
import { collide } from './Collide.js'
import { Environment } from './Environment.js'
import { SITES, siteCenter, siteLevel } from './Sites.js'
const IDLE_INPUT = { x: 0, y: 0, boost: false, mouse: false, mx: 0, my: 0 }

const SITE_NAMES = { hogwarts: '霍格沃茨城堡', cathedral: '大教堂小镇', fortress: '城墙要塞', ruin: '古堡废墟', spires: '尖塔城堡' }
export const CHALLENGE_SECONDS = 600

export class Game {
  constructor(host, state, look = {}) {
    this.host = host; this.state = state; this.running = false
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    r.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2))
    r.setSize(host.clientWidth, host.clientHeight)
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
    r.toneMapping = THREE.NoToneMapping
    r.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(r.domElement)
    this.post = new PostFX(r)
    this.post.final.uniforms.uPaintK.value = LOW ? 0 : 1
    this.touch = { x: 0, y: 0, active: false, boost: false }
    this.audio = new GameAudio()
    this.orbit = 0; this.orbitEl = 0.32; this.orbitDist = 7; this.dragT = 0; this.drag = null
    if (import.meta.env && import.meta.env.DEV) window.__game = this

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(65, host.clientWidth / host.clientHeight, 0.5, 3000)
    this.world = createWorld(this.scene)
    if (LOW) this.world.env.sun.shadow.mapSize.set(1024, 1024)
    this.look = { char: look.char || 'xiao', broom: look.broom || 'classic' }
    this.player = createWizard(this.look); this.scene.add(this.player.root)
    this.player.root.position.set(0, 60, 0)
    this.trail = new Trail(this.scene)
    this.env = new Environment(this.scene, this.world.env, this.post, this.audio, this.state)

    this.vel = 30; this.yaw = 0; this.pitch = 0; this.roll = 0
    this.input = { x: 0, y: 0, boost: false, mx: 0, my: 0, mouse: false }
    this.clock = new THREE.Clock(); this.frames = 0; this.fpsT = 0
    this.camera.position.set(0, 66, 14)
    this._bind(); this._loop()
  }
  // ---------- 角色 / 扫帚 ----------
  setLook(char, broom) {
    if (char === this.look.char && broom === this.look.broom) return
    this.look = { char, broom }
    const old = this.player, w = createWizard(this.look)
    w.root.position.copy(old.root.position); w.root.rotation.copy(old.root.rotation)
    this.scene.remove(old.root); old.dispose(); this.scene.add(w.root); this.player = w
  }
  // 换装预览：人物悬停在湖边，镜头近距离环绕（可拖动）
  setPreview(on) {
    this.previewing = on
    if (on && !this.running) {
      const x = 150, z = -165, p = this.player.root.position
      p.set(x, this.world.heightAt(x, z) + 9, z); this.yaw = 2.6; this.pitch = 0; this.roll = 0; this.vel = 0; this.hover = 1
      this.orbit = Math.PI - 1.35; this.orbitEl = 0.1; this.orbitDist = 4.6; this.camHover = 1; this.dragT = performance.now()
      this.camera.position.copy(p).add(new THREE.Vector3(3, 1, 3))
    }
    this.host.style.cursor = on ? 'grab' : ''
  }
  // ---------- 多人对抗 ----------
  startMulti(net, myId, go) {
    this.audio.init(); this.setPreview(false)
    this.mode = 'mp'; this.running = true; this.paused = false; this.finished = false; this.net = net; this.myId = myId
    this.world.setLocalObjects(false)
    if (this.multi) this.multi.dispose()
    this.multi = new Multi(this); this.multi.setRings(go.rings)
    const i = go.slot || 0, x = -200 + (i % 4) * 12, z = 80 + Math.floor(i / 4) * 12
    this.player.root.position.set(x, this.world.heightAt(x, z) + 30, z)
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.vel = 0; this.hover = 1; this.camHover = 0; this.trail.last = null
    this.camera.position.copy(this.player.root.position).add(new THREE.Vector3(0, 5, 13))
    this.unfreezeAt = performance.now() + go.countdown * 1000; this.frozen = true
    Object.assign(this.state, { started: true, mode: 'mp', score: 0, rings: 0, hoops: 0, snitch: 0, boost: 1, paused: false, finished: false, timeLeft: go.duration, countdown: go.countdown, mpEnd: null, snitchOut: false })
    this.host.style.cursor = ''; this.audio.setPaused(false)
  }
  leaveMatch() {
    if (this.multi) { this.multi.dispose(); this.multi = null }
    this.world.setLocalObjects(true); this.net = null; this.frozen = false
    this.running = false; this.paused = false; this.finished = false; this.mode = 'free'
    Object.assign(this.state, { started: false, paused: false, finished: false, mpEnd: null, countdown: -1 })
    this.audio.setPaused(false)
  }
  onNet(m) {
    const st = this.state; if (!this.multi) return
    if (m.t === 'snap') { this.multi.snap(m); if (st.timeLeft !== m.left) st.timeLeft = m.left }
    else if (m.t === 'ringOff') { this.multi.ringOff(m.id); if (m.by === this.myId) { this.audio.ring(); st.boost = Math.min(1, st.boost + .3) } }
    else if (m.t === 'ringOn') this.multi.ringOn(m.ring)
    else if (m.t === 'snitchOut') { st.snitchOut = true; this._note('金色飞贼出现了！'); this.audio.whoosh() }
    else if (m.t === 'score') {
      const label = { rings: '穿过光环', hoops: '魁地奇球门', snitch: '抓住了金色飞贼' }[m.kind]
      if (m.id === this.myId) { st.score = m.total; st[m.kind]++; this._note(label + '  +' + m.pts); if (m.kind === 'hoops') this.audio.hoop() }
      else this._note(m.name + ' ' + label + '  +' + m.pts)
      if (m.kind === 'snitch') this.audio.snitch()
    }
    else if (m.t === 'end') {
      this.finished = true; this.orbit = 0; this.orbitEl = .3; this.orbitDist = 8
      this.multi.sn.has = false; this.multi.snitch.visible = false
      st.mpEnd = { reason: m.reason, winner: m.winner, ranking: m.ranking, me: this.myId }
      this.audio.setPaused(true); if (m.reason !== 'catch') this.audio.finish()
    }
  }
  // ---------- 触屏操控 ----------
  setTouchMode(v) { this.touchMode = v; if (v) this.input.mouse = false }
  setTouch(x, y, active = true) {
    const dz = v => { const a = Math.abs(v); return a < .12 ? 0 : Math.sign(v) * (a - .12) / .88 }   // 中心死区
    this.touch.x = dz(x); this.touch.y = dz(y); this.touch.active = active
  }
  setTouchBoost(v) { this.touch.boost = v }
  _note(s) { this.state.note = s; this.state.noteOn = true; clearTimeout(this._nt); this._nt = setTimeout(() => (this.state.noteOn = false), 1400) }
  togglePause() {
    if (!this.running || this.finished || this.intro) return
    this.paused = !this.paused; this.state.paused = this.paused
    this.orbit = 0; this.orbitEl = 0.32; this.orbitDist = 7; this.drag = null
    this.host.style.cursor = this.paused ? 'grab' : ''
    this.audio.setPaused(this.paused)
  }
  start(mode = 'free') {
    this.audio.init(); this.mode = mode; this.running = true; this.paused = false; this.finished = false
    this.timeLeft = CHALLENGE_SECONDS
    Object.assign(this.state, { started: true, mode, score: 0, rings: 0, hoops: 0, snitch: 0, boost: 1, paused: false, finished: false, timeLeft: CHALLENGE_SECONDS })
    this.audio.setPaused(false); this.host.style.cursor = ''
  }
  // ---------- 开场过场：镜头从霍格沃茨上空俯冲，掠过塔尖，落到骑扫帚的人物身后 ----------
  _beginIntro() {
    const L = siteLevel(0, 0, 0), C = new THREE.Vector3(SITES[0].x, L, SITES[0].z), p = this.player.root.position
    const px = C.x + 6, pz = C.z + 165
    p.set(px, Math.max(L + 52, this.world.heightAt(px, pz) + 30), pz)
    this.yaw = Math.PI; this.pitch = -0.04; this.roll = 0; this.vel = 30; this.hover = 0
    this.trail.last = null
    this.intro = { t: 0, dur: 7.5, C, fast: false, whoosh: false }
    this.state.intro = true
    this.camera.position.copy(C).add(new THREE.Vector3(-40, 175, -110))
  }
  _introCam(dt, chase, look) {
    const I = this.intro, V = (x, y, z) => new THREE.Vector3(x, y, z)
    I.t += dt * (I.fast ? 3.5 : 1)
    const k = Math.min(1, I.t / I.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, u = 1 - e
    const back = V(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const P0 = I.C.clone().add(V(-40, 175, -110)), P1 = I.C.clone().add(V(12, 122, 25))
    const P2 = chase.clone().addScaledVector(back, 55).add(V(0, 32, 0))
    this.camera.position.copy(P0).multiplyScalar(u * u * u).addScaledVector(P1, 3 * u * u * e).addScaledVector(P2, 3 * u * e * e).addScaledVector(chase, e * e * e)
    const aim = THREE.MathUtils.smoothstep(k, .28, .86)
    this.camera.lookAt(I.C.clone().add(V(0, 32, 0)).lerp(look, aim))
    if (!I.whoosh && k > .32) { I.whoosh = true; this.audio.whoosh() }
    if (k >= 1) { this.intro = null; this.state.intro = false; this.audio.introChime() }
  }
  // 限时挑战结束：扫帚悬停、镜头环绕，等待界面记录成绩
  endChallenge() {
    this.finished = true; this.paused = true; this.orbit = 0; this.orbitEl = 0.3; this.orbitDist = 8
    Object.assign(this.state, { finished: true, paused: false, timeLeft: 0 })
    this.audio.setPaused(true); this.audio.finish()
  }
  toMenu() {
    this.running = false; this.paused = false; this.finished = false; this.host.style.cursor = ''
    this.intro = null
    Object.assign(this.state, { started: false, paused: false, finished: false, intro: false })
    this.audio.setPaused(false)
  }
  // 小地图 / 罗盘需要的数据
  mapInfo() {
    const p = this.player.root.position, m = this.world.mapInfo()
    const places = SITES.map((s, i) => { const c = siteCenter(i, p.x, p.z); return { name: SITE_NAMES[s.kind], kind: 'castle', x: c.x, z: c.z } })
    places.push({ name: '魁地奇球场', kind: 'pitch', x: -260, z: -120 })
    if (this.mode === 'mp' && this.multi) {
      const mu = this.multi, out = mu.sn.has
      return { x: p.x, y: p.y, z: p.z, ground: this.world.heightAt(p.x, p.z), yaw: this.yaw, places, snitch: out ? mu.snitch.position : null,
        rings: [...mu.rings.values()].filter(g => g.visible && g.userData.on).map(g => g.position), others: mu.others() }
    }
    return { x: p.x, y: p.y, z: p.z, ground: this.world.heightAt(p.x, p.z), yaw: this.yaw, places, snitch: m.snitch, rings: m.rings, others: [] }
  }
  _bind() {
    const k = {}
    this._kd = e => { if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return
      if (this.intro) { if (this.intro.t > .3 && !e.repeat) this.intro.fast = true; return }
      k[e.code] = true; this._keys(); if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) this.togglePause(); if (e.code === 'KeyM' && !e.repeat) this.state.muted = this.audio.toggleMute(); if (e.code === 'KeyT' && !e.repeat) this.env.cycleTime(); if (e.code === 'KeyY' && !e.repeat) this.env.cycleWeather() }
    this._ku = e => { k[e.code] = false; this._keys() }
    this._keys = () => {
      this.input.x = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0)
      this.input.y = (k.KeyW || k.ArrowUp ? -1 : 0) + (k.KeyS || k.ArrowDown ? 1 : 0)
      this.input.boost = !!(k.ShiftLeft || k.Space)
    }
    this._mm = e => {
      if (this.touchMode) return             // 手机点按会模拟鼠标移动，触屏时忽略
      this.input.mouse = true
      this.input.mx = (e.clientX / innerWidth) * 2 - 1
      this.input.my = (e.clientY / innerHeight) * 2 - 1
    }
    this._rs = () => {
      const w = this.host.clientWidth, h = this.host.clientHeight
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); this.post.setSize()
    }
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku)
    // 暂停时：拖动旋转视角、滚轮缩放
    const clamp = THREE.MathUtils.clamp
    this._pd = e => { if (this.intro) { if (this.intro.t > .3) this.intro.fast = true; return }
      if (!this.paused && !this.previewing && !this.finished) return; this.drag = { x: e.clientX, y: e.clientY }; this.dragT = performance.now(); this.host.style.cursor = 'grabbing' }
    this._pm = e => {
      if (!this.drag) return
      this.orbit -= (e.clientX - this.drag.x) * 0.006; this.orbitEl = clamp(this.orbitEl + (e.clientY - this.drag.y) * 0.004, -0.12, 1.35)
      this.drag.x = e.clientX; this.drag.y = e.clientY; this.dragT = performance.now()
    }
    this._pu = () => { if (!this.drag) return; this.drag = null; this.host.style.cursor = this.paused || this.previewing ? 'grab' : '' }
    this._wh = e => { if (this.paused || this.previewing || this.finished) { this.orbitDist = clamp(this.orbitDist * (e.deltaY > 0 ? 1.1 : 0.9), 3.5, 22); this.dragT = performance.now() } }
    this.host.addEventListener('pointerdown', this._pd); addEventListener('pointermove', this._pm); addEventListener('pointerup', this._pu)
    this.host.addEventListener('wheel', this._wh, { passive: true })
    addEventListener('mousemove', this._mm); addEventListener('resize', this._rs)
  }
  _update(dt, t) {
    const p = this.player.root, inp = this.intro ? IDLE_INPUT : this.input
    this.env.update(dt, t, this.camera.position)
    if (this.mode === 'challenge' && this.running && !this.paused && !this.finished && !this.intro) {
      this.timeLeft -= dt
      const s = Math.max(0, Math.ceil(this.timeLeft)); if (s !== this.state.timeLeft) this.state.timeLeft = s
      if (this.timeLeft <= 0) this.endChallenge()
    }
    if (this.frozen) {   // 多人开局倒计时：原地悬停，不能动
      const left = (this.unfreezeAt - performance.now()) / 1000
      const c = left > 0 ? Math.ceil(left) : left > -1 ? 0 : -1; if (c !== this.state.countdown) this.state.countdown = c
      if (left <= 0) this.frozen = false
    } else if (this.state.countdown === 0 && performance.now() > this.unfreezeAt + 1000) this.state.countdown = -1
    const preview = this.previewing && !this.running
    const hold = this.paused || this.frozen || this.finished || preview
    this.hover = THREE.MathUtils.damp(this.hover || 0, hold ? 1 : 0, 2.5, dt)
    this.camHover = THREE.MathUtils.damp(this.camHover || 0, this.paused || this.finished || preview ? 1 : 0, 2.5, dt)
    if (this.running && !hold) {
      let turn = inp.x, climb = -inp.y
      if (this.touch.active && !this.intro) { turn = -this.touch.x * 1.15; climb = -this.touch.y * 1.15 }   // 摇杆：上推爬升、左右转向
      else if (inp.mouse && turn === 0 && climb === 0) {
        const dz = v => Math.abs(v) < 0.08 ? 0 : v
        turn = -dz(inp.mx) * 1.2; climb = -dz(inp.my) * 1.2
      }
      this.yaw += turn * 1.6 * dt
      this.pitch = THREE.MathUtils.damp(this.pitch, climb * 0.6, 4, dt)
      this.roll = THREE.MathUtils.damp(this.roll, turn * 0.7, 5, dt)
      const boostOn = inp.boost || (this.touch.boost && !this.intro)
      const target = boostOn && this.state.boost > 0.05 ? 75 : 38
      this.vel = THREE.MathUtils.damp(this.vel, target, 2, dt)
      if (boostOn && !this._boostWas && this.state.boost > 0.05) this.audio.whoosh()
      this._boostWas = boostOn
      this.state.boost = THREE.MathUtils.clamp(this.state.boost + (boostOn ? -0.35 : 0.15) * dt, 0, 1)
    } else if (hold) {
      // 悬停：减速至静止，扫帚放平
      this.vel = THREE.MathUtils.damp(this.vel, 0, 2.2, dt)
      this.pitch = THREE.MathUtils.damp(this.pitch, 0, 3, dt)
      this.roll = THREE.MathUtils.damp(this.roll, 0, 3, dt)
      this.state.boost = Math.min(1, this.state.boost + 0.2 * dt)
      const hoverY = this.world.heightAt(p.position.x, p.position.z) + 7
      if (p.position.y < hoverY) p.position.y += (hoverY - p.position.y) * Math.min(1, dt * 1.5)
    } else {
      this.yaw += 0.25 * dt; this.pitch = Math.sin(t * 0.5) * 0.1; this.roll = 0.25; this.vel = 25
    }
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
    p.position.addScaledVector(dir, this.vel * dt)
    const ground = this.world.heightAt(p.position.x, p.position.z) + 3.2
    if (p.position.y < ground) { p.position.y = ground; this.pitch = Math.max(this.pitch, 0.2) }
    p.position.y = Math.min(p.position.y, 260)
    // 碰撞：角色是一个半径 1.3 m 的球（中心略高于扫帚），被推出建筑、树木、岩石之外
    const body = p.position.clone(); body.y += 0.6
    const hit = collide(body, 1.3)
    if (hit) {
      p.position.set(body.x, body.y - 0.6, body.z)
      if (hit.y > 0.5) this.pitch = Math.max(this.pitch, 0.02)                    // 落在顶上
      else {
        this.vel *= Math.pow(0.15, dt)                                              // 擦撞减速
        const into = -(dir.x * hit.x + dir.z * hit.z)
        if (into > 0.75 && this.vel > 12) this.vel *= 0.5                          // 正面撞上
        if (this.running && t - (this._hitT || -9) > 0.6 && into > 0.3) { this.audio.bump(); this._hitT = t; this.shake = 0.35; navigator.vibrate && navigator.vibrate(40) }
      }
    }
    p.rotation.set(0, 0, 0, 'YXZ')
    p.rotation.order = 'YXZ'; p.rotation.y = this.yaw; p.rotation.x = this.pitch; p.rotation.z = this.roll
    this.player.animate(t, this.vel, this.roll, this.hover)

    // camera chase
    const back = new THREE.Vector3(Math.sin(this.yaw) * 13, 4.5 - this.pitch * 6, Math.cos(this.yaw) * 13)
    // 暂停时镜头缓缓环绕人物
    // （可拖动旋转、滚轮缩放；松手 3 秒后恢复缓慢自转）
    if (!this.drag && performance.now() - this.dragT > 3000) this.orbit += dt * (preview ? 0.08 : 0.18) * this.camHover
    const oa = this.yaw + 0.9 + this.orbit, oe = this.orbitEl, od = this.orbitDist
    back.lerp(new THREE.Vector3(Math.sin(oa) * Math.cos(oe) * od, Math.sin(oe) * od + 0.4, Math.cos(oa) * Math.cos(oe) * od), this.camHover)
    const camTarget = p.position.clone().add(back)
    this.camera.position.lerp(camTarget, 1 - Math.exp(-6 * dt))
    collide(this.camera.position, 0.6)                                         // 镜头不穿墙
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const k = this.shake * 0.5; this.camera.position.x += (Math.random() - .5) * k; this.camera.position.y += (Math.random() - .5) * k }
    this.camera.lookAt(p.position.clone().addScaledVector(dir, 8 * (1 - this.camHover)).add(new THREE.Vector3(0, 1.5 - (preview ? 0.9 : 0.4) * this.camHover, 0)))
    if (preview && this.camHover > 0.01) {   // 换装预览：把人物放到画面右侧，避开左边的选择面板
      const toC = this.camera.position.clone().sub(p.position); toC.y = 0; toC.normalize()
      const narrow = innerWidth < 760     // 竖屏手机：选择面板在下方，人物放在画面上半部
      this.camera.lookAt(p.position.clone().add(new THREE.Vector3(-toC.z, 0, toC.x).multiplyScalar((narrow ? 0 : 1.5) * this.camHover)).add(new THREE.Vector3(0, narrow ? -0.85 : 0.55, 0)))
    }
    if (this.intro) this._introCam(dt, camTarget, p.position.clone().addScaledVector(dir, 8).add(new THREE.Vector3(0, 1.5, 0)))
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 60 + (this.vel - 30) * 0.35, 3, dt)
    this.camera.updateProjectionMatrix()

    this.trail.update(dt, this.player.tailWorld(), this.vel)
    const res = this.world.update(dt, t, p.position, this.running && !this.paused, this.camera.position)
    if (res && res.thud) this.audio.thud(res.thud)
    if (this.mode === 'mp' && this.multi && this.running) {
      const active = !this.frozen && !this.finished
      const m = this.multi.update(dt, t, p.position, active)
      if (this.net) {
        const sendSt = () => this.net.send({ t: 'st', d: [p.position.x, p.position.y, p.position.z, this.yaw, this.pitch, this.roll, this.vel, this.hover] })
        const claim = m.ring != null || m.catch || (res && res.hoop && active)
        this._stT = (this._stT || 0) - dt
        if (this._stT <= 0 || claim) { this._stT = 1 / 15; sendSt() }        // 先上报最新位置，服务器再按这个位置判定得分
        if (m.ring != null) this.net.send({ t: 'ring', id: m.ring })
        if (m.catch) this.net.send({ t: 'catch' })
        if (res && res.hoop && active) this.net.send({ t: 'hoop' })
      }
      if (res) { res.snitchPos = m.snitchPos || p.position.clone().add(new THREE.Vector3(0, 9999, 0)); res.snitchDist = m.snitchDist ?? 9999 }
    }
    if (res && res.snitchPos) {
      const toS = res.snitchPos.clone().sub(this.camera.position).normalize()
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0)
      this.audio.update(dt, this.vel, res.snitchDist, toS.dot(right), p.position.y - this.world.heightAt(p.position.x, p.position.z))
    }
    if (this.running && res && this.mode !== 'mp') {
      if (res.ring) { this._note('穿过光环  +100'); this.audio.ring(); this.state.rings++; this.state.score += 100; this.state.boost = Math.min(1, this.state.boost + 0.3) }
      if (res.hoop) { this._note('魁地奇球门  +300'); this.audio.hoop(); this.state.hoops++; this.state.score += 300 }
      if (res.snitch) { this._note('抓住了金色飞贼  +500'); this.audio.snitch(); this.state.snitch++; this.state.score += 500 }
    }
  }
  _loop = () => {
    this.raf = requestAnimationFrame(this._loop)
    const dt = Math.min(this.clock.getDelta(), 1 / 20), t = this.clock.elapsedTime
    this._update(dt, t)
    this.post.render(this.scene, this.camera)
    if (!this.state.ready) this.state.ready = true
    this.frames++; this.fpsT += dt
    if (this.fpsT > 0.5) { this.state.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0 }
  }
  dispose() {
    cancelAnimationFrame(this.raf)
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku)
    removeEventListener('mousemove', this._mm); removeEventListener('resize', this._rs)
    this.renderer.dispose()
  }
}
