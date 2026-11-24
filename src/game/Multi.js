import * as THREE from 'three'
import { createWizard } from './Wizard.js'

// 多人对抗：其他玩家的角色（插值平滑显示 + 头顶名字）、服务器统一放置的光环和金色飞贼。
const DELAY = 170          // 远程玩家延迟 130 ms 显示，在两次快照之间插值，动作才流畅
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k

function nameTag(text, color) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 256; c.height = 64
  g.font = '30px Georgia, "Songti SC", serif'; const w = Math.min(240, g.measureText(text).width + 44)
  g.fillStyle = 'rgba(20,30,45,.6)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill()
  g.fillStyle = color; g.beginPath(); g.arc((256 - w) / 2 + 20, 32, 7, 0, 7); g.fill()
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128 + 9, 33)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }))
  s.scale.set(.2, .05, 1); s.renderOrder = 20; s.center.set(.5, 0); return s
}

export class Multi {
  constructor(game) {
    this.g = game; this.scene = game.scene; this.H = game.world.heightAt
    this.av = new Map(); this.rings = new Map(); this.me = null
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: .9, blending: THREE.AdditiveBlending })
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false })
    this.ringGeo = new THREE.TorusGeometry(6, .35, 12, 48); this.glowGeo = new THREE.TorusGeometry(6, 1.2, 8, 48)
    const sn = this.snitch = new THREE.Group()
    sn.add(new THREE.Mesh(new THREE.SphereGeometry(.6, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 1, roughness: .2, emissive: 0x664400 })))
    const wg = new THREE.PlaneGeometry(1.8, .7); wg.translate(.9, 0, 0)
    const wm = new THREE.MeshBasicMaterial({ color: 0xfff6dd, transparent: true, opacity: .75, side: THREE.DoubleSide })
    this.wl = new THREE.Mesh(wg, wm); this.wr = new THREE.Mesh(wg, wm); this.wr.rotation.y = Math.PI; sn.add(this.wl, this.wr)
    sn.add(new THREE.PointLight(0xffcc55, 3, 30)); sn.visible = false; this.scene.add(sn)
    this.sn = { has: false, tgt: V(), cur: V(), first: true }
    this.catchSent = false
  }
  roster(players, myId) {
    this.me = myId; const seen = new Set()
    for (const p of players) {
      if (p.id === myId) continue
      seen.add(p.id); let a = this.av.get(p.id); const look = p.char + '/' + p.broom + '/' + p.name
      if (a && a.look !== look) { this._drop(p.id); a = null }
      if (!a) {
        const w = createWizard({ char: p.char, broom: p.broom }), tag = nameTag(p.name, p.color || '#fff')
        tag.position.y = 2.05; w.root.add(tag); w.root.visible = false; this.scene.add(w.root)
        a = { w, tag, look, buf: [], name: p.name, color: p.color, pos: V(), seen: false }; this.av.set(p.id, a)
      }
    }
    for (const id of [...this.av.keys()]) if (!seen.has(id)) this._drop(id)
  }
  _drop(id) { const a = this.av.get(id); if (!a) return; this.scene.remove(a.w.root); a.w.dispose(); a.tag.material.map.dispose(); this.av.delete(id) }
  snap(m) {
    const now = performance.now()
    for (const d of m.p) { const a = this.av.get(d[0]); if (!a) continue; a.buf.push({ t: now, d }); if (a.buf.length > 24) a.buf.shift() }
    if (m.s) { this.sn.has = true; this.sn.tgt.set(m.s[0], m.s[1], m.s[2]) } else this.sn.has = false
  }
  _ringGroup(r) {
    let g = this.rings.get(r.id)
    if (!g) { g = new THREE.Group(); g.add(new THREE.Mesh(this.ringGeo, this.ringMat), new THREE.Mesh(this.glowGeo, this.glowMat)); this.scene.add(g); this.rings.set(r.id, g) }
    g.position.set(r.x, Math.max(r.y, this.H(r.x, r.z) + 18), r.z); g.rotation.y = r.yaw
    g.visible = r.on; g.userData = { hit: 0, sent: false, on: r.on }; g.scale.setScalar(1)
  }
  setRings(list) { for (const g of this.rings.values()) this.scene.remove(g); this.rings.clear(); list.forEach(r => this._ringGroup(r)) }
  ringOff(id) { const g = this.rings.get(id); if (g) { g.userData.on = false; g.userData.hit = .001 } }
  ringOn(r) { this._ringGroup(r) }
  update(dt, t, me, active) {
    const res = { ring: null, catch: false, snitchPos: null, snitchDist: null }
    const now = performance.now() - DELAY
    for (const a of this.av.values()) {
      const b = a.buf; if (!b.length) continue
      let i = b.length - 1; while (i > 0 && b[i - 1].t > now) i--
      const s1 = b[i], s0 = b[Math.max(0, i - 1)], k = s1 === s0 ? 1 : THREE.MathUtils.clamp((now - s0.t) / (s1.t - s0.t), 0, 1)
      const d0 = s0.d, d1 = s1.d, L = (j) => d0[j] + (d1[j] - d0[j]) * k
      const r = a.w.root; r.visible = true
      a.pos.set(L(1), L(2), L(3)); r.position.lerp(a.pos, a.seen ? Math.min(1, dt * 20) : 1); a.seen = true
      r.rotation.order = 'YXZ'; r.rotation.y = lerpAng(d0[4], d1[4], k); r.rotation.x = L(5); r.rotation.z = L(6)
      a.w.animate(t, L(7), L(6), L(8))
      a.tag.visible = r.position.distanceTo(this.g.camera.position) < 600
    }
    for (const g of this.rings.values()) {
      const u = g.userData; g.children[0].rotation.z = t * .6; g.children[1].scale.setScalar(1 + Math.sin(t * 3) * .05)
      if (u.hit) { u.hit += dt; g.scale.setScalar(1 + u.hit * 4); if (u.hit > .4) { g.visible = false; u.hit = 0 } continue }
      if (u.sent && performance.now() - u.sent > 1500) u.sent = false       // 服务器没确认就允许重试
      if (active && u.on && !u.sent && g.position.distanceTo(me) < 6.5) { u.sent = performance.now(); res.ring = [...this.rings.entries()].find(e => e[1] === g)[0] }
    }
    const sn = this.snitch, S = this.sn
    sn.visible = S.has
    if (S.has) {
      if (S.first) { S.cur.copy(S.tgt); S.first = false }
      S.cur.lerp(S.tgt, 1 - Math.exp(-8 * dt))
      sn.position.set(S.cur.x, Math.max(S.cur.y, this.H(S.cur.x, S.cur.z) + 10) + Math.sin(t * 6) * .3, S.cur.z)
      this.wl.rotation.x = Math.sin(t * 60) * .8; this.wr.rotation.x = -Math.sin(t * 60) * .8; sn.lookAt(me)
      const d = sn.position.distanceTo(me); res.snitchPos = sn.position; res.snitchDist = d
      if (active && !this.catchSent && d < 3.5) { this.catchSent = true; res.catch = true; setTimeout(() => (this.catchSent = false), 800) }
    }
    return res
  }
  others() { return [...this.av.values()].filter(a => a.seen).map(a => ({ x: a.w.root.position.x, z: a.w.root.position.z, name: a.name, color: a.color })) }
  dispose() {
    for (const id of [...this.av.keys()]) this._drop(id)
    for (const g of this.rings.values()) this.scene.remove(g); this.rings.clear()
    this.scene.remove(this.snitch)
  }
}
