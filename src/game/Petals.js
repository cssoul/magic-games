import * as THREE from 'three'

// 花瓣与落果：
//  - 樱花树冠里不断有花瓣被风吹落，随阵风飘飞、翻转，落在草地或水面上，过一会儿慢慢消失；
//  - 果树偶尔掉下一个苹果或橙子，受重力下落，落地弹跳、滚动后停住；离得近能听到"咚"的一声。
const WIND = new THREE.Vector2(.8, .45).normalize()
const FRUIT_COL = { 7: new THREE.Color('#c4261d'), 8: new THREE.Color('#f0901c') }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

export class Petals {
  constructor(scene, heightAt, forest, N = 1100, NF = 40) {
    Object.assign(this, { H: heightAt, forest, N, NF, i: 0, fi: 0, acc: 0, scanT: 0, frame: 0, fT: 2, near: [], nearF: [] })
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3); this.r = new Float32Array(N * 3); this.w = new Float32Array(N * 3)
    this.st = new Uint8Array(N); this.age = new Float32Array(N); this.g = new Float32Array(N); this.ph = new Float32Array(N); this.sz = new Float32Array(N)
    const geo = new THREE.CircleGeometry(1, 8); geo.scale(1, .6, 1)
    const pa = geo.attributes.position
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, (x * x + y * y) * .28) }   // 微微卷起的花瓣
    geo.computeVertexNormals()
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .55, side: THREE.DoubleSide, emissive: 0x3a1422 }), N)
    const cols = ['#f4a6c1', '#f7bed2', '#ee8fb2', '#fbd3e1', '#e7799f'].map(c => new THREE.Color(c))
    for (let i = 0; i < N; i++) { this.mesh.setColorAt(i, cols[i % cols.length]); this.mesh.setMatrixAt(i, ZERO) }
    this.mesh.frustumCulled = false; scene.add(this.mesh)
    this.fp = new Float32Array(NF * 3); this.fv = new Float32Array(NF * 3); this.fr = new Float32Array(NF * 3)
    this.fst = new Uint8Array(NF); this.fage = new Float32Array(NF)
    this.fm = new THREE.InstancedMesh(new THREE.SphereGeometry(.17, 12, 9), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .42 }), NF)
    for (let i = 0; i < NF; i++) { this.fm.setColorAt(i, FRUIT_COL[7]); this.fm.setMatrixAt(i, ZERO) }
    this.fm.castShadow = true; this.fm.frustumCulled = false; scene.add(this.fm)
  }
  _ground(x, z) { return Math.max(this.H(x, z), 2.02) }      // 低于水面就漂在水上
  _scan(cam) {
    const d2 = (a, R) => (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 < R * R
    this.near = this.forest.blossoms.filter(b => d2(b, 120)); this.nearF = this.forest.fruits.filter(b => d2(b, 80))
  }
  update(dt, t, cam) {
    this.frame++
    if ((this.scanT -= dt) < 0) { this.scanT = .5; this._scan(cam) }
    const P = this.p, V = this.v, Rr = this.r, W = this.w, N = this.N
    // ---- 生成花瓣 ----
    const gustAll = .6 + .4 * Math.sin(t * .35) * Math.sin(t * .13 + 1.7)
    this.acc += this.near.length * 3.2 * (.35 + gustAll) * dt
    let n = Math.min(Math.floor(this.acc), 60); this.acc -= Math.floor(this.acc)
    while (n-- > 0 && this.near.length) {
      const tr = this.near[(Math.random() * this.near.length) | 0], i = this.i = (this.i + 1) % N, o = i * 3
      const a = Math.random() * 6.283, rr = tr.r * (.35 + Math.random() * .6)
      P[o] = tr.x + Math.cos(a) * rr; P[o + 1] = tr.cy - tr.r * (.1 + Math.random() * .35); P[o + 2] = tr.z + Math.sin(a) * rr
      V[o] = WIND.x * .5; V[o + 1] = -.2; V[o + 2] = WIND.y * .5
      Rr[o] = Math.random() * 6.3; Rr[o + 1] = Math.random() * 6.3; Rr[o + 2] = Math.random() * 6.3
      W[o] = (Math.random() - .5) * 7; W[o + 1] = (Math.random() - .5) * 5; W[o + 2] = (Math.random() - .5) * 7
      this.st[i] = 1; this.age[i] = 0; this.ph[i] = Math.random() * 50; this.sz[i] = .075 + Math.random() * .055
      this.g[i] = this._ground(P[o], P[o + 2])
    }
    // ---- 花瓣运动 ----
    const k = Math.min(1, dt * 2.2)
    for (let i = 0; i < N; i++) {
      const s = this.st[i]; if (!s) continue
      const o = i * 3
      if (s === 1) {
        const x = P[o], z = P[o + 2], ph = this.ph[i]
        const gust = .6 + .4 * Math.sin(t * .35 + x * .01 + z * .013), ws = 1.1 + 2.8 * gust
        const tx = WIND.x * ws + Math.sin(t * 2.1 + ph) * .7, tz = WIND.y * ws + Math.cos(t * 1.7 + ph * 1.3) * .7
        const ty = -.55 + Math.sin(t * 3.3 + ph * 2) * .3 + gust * .12
        V[o] += (tx - V[o]) * k; V[o + 1] += (ty - V[o + 1]) * k; V[o + 2] += (tz - V[o + 2]) * k
        P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += V[o + 2] * dt
        Rr[o] += W[o] * dt; Rr[o + 1] += W[o + 1] * dt; Rr[o + 2] += W[o + 2] * dt
        if ((this.frame + i) % 5 === 0) this.g[i] = this._ground(P[o], P[o + 2])
        if (P[o + 1] <= this.g[i] + .03) {                               // 落地：平躺
          P[o + 1] = this.g[i] + .03; this.st[i] = 2; this.age[i] = 0
          Rr[o] = -Math.PI / 2 + (Math.random() - .5) * .5; Rr[o + 1] = (Math.random() - .5) * .4
        }
      } else if ((this.age[i] += dt) > 10) this.st[i] = 0
      if ((P[o] - cam.x) ** 2 + (P[o + 2] - cam.z) ** 2 > 180 * 180) this.st[i] = 0
      if (!this.st[i]) { this.mesh.setMatrixAt(i, ZERO); continue }
      const sc = this.sz[i] * (this.st[i] === 2 ? Math.min(1, (10 - this.age[i]) / 2.5) : Math.min(1, this.age[i] * 4 + .3))
      if (this.st[i] === 1) this.age[i] += dt
      _m.compose(_p.set(P[o], P[o + 1], P[o + 2]), _q.setFromEuler(_e.set(Rr[o], Rr[o + 1], Rr[o + 2])), _s.setScalar(sc))
      this.mesh.setMatrixAt(i, _m)
    }
    this.mesh.instanceMatrix.needsUpdate = true

    // ---- 落果 ----
    let thud = 0
    const FP = this.fp, FV = this.fv, FR = this.fr
    if ((this.fT -= dt) < 0) {
      this.fT = 1.2 + Math.random() * 3.2
      if (this.nearF.length) {
        const tr = this.nearF[(Math.random() * this.nearF.length) | 0], i = this.fi = (this.fi + 1) % this.NF, o = i * 3, a = Math.random() * 6.283
        FP[o] = tr.x + Math.cos(a) * tr.r * .7; FP[o + 1] = tr.cy - tr.r * .35; FP[o + 2] = tr.z + Math.sin(a) * tr.r * .7
        FV[o] = FV[o + 1] = FV[o + 2] = 0; this.fst[i] = 1; this.fage[i] = 0
        this.fm.setColorAt(i, FRUIT_COL[tr.ki] || FRUIT_COL[7]); this.fm.instanceColor.needsUpdate = true
      }
    }
    for (let i = 0; i < this.NF; i++) {
      const s = this.fst[i]; if (!s) continue
      const o = i * 3
      if (s === 1) FV[o + 1] -= 9.8 * dt
      else { const f = Math.exp(-2.4 * dt); FV[o] *= f; FV[o + 2] *= f }
      FP[o] += FV[o] * dt; FP[o + 1] += FV[o + 1] * dt; FP[o + 2] += FV[o + 2] * dt
      const g = this._ground(FP[o], FP[o + 2]) + .15
      if (s === 1 && FP[o + 1] <= g) {
        FP[o + 1] = g
        const vy = -FV[o + 1], d = Math.hypot(FP[o] - cam.x, FP[o + 1] - cam.y, FP[o + 2] - cam.z)
        if (vy > 1.2) {                                                    // 弹起
          thud = Math.max(thud, Math.max(0, 1 - d / 45) * Math.min(1, vy / 6))
          FV[o + 1] = vy * .33; FV[o] += (Math.random() - .5) * 1.4; FV[o + 2] += (Math.random() - .5) * 1.4
        } else { FV[o + 1] = 0; this.fst[i] = 2 }
      }
      if (s === 2) { FP[o + 1] = g; if ((this.fage[i] += dt) > 28) this.fst[i] = 0 }
      const sp = Math.hypot(FV[o], FV[o + 2]); FR[o] += FV[o + 2] / .17 * dt; FR[o + 2] -= FV[o] / .17 * dt
      if (sp > 0 && s === 1) FR[o + 1] += dt * 2
      if (!this.fst[i]) { this.fm.setMatrixAt(i, ZERO); continue }
      const sc = this.fst[i] === 2 ? Math.min(1, (28 - this.fage[i]) / 2) : 1
      _m.compose(_p.set(FP[o], FP[o + 1], FP[o + 2]), _q.setFromEuler(_e.set(FR[o], FR[o + 1], FR[o + 2])), _s.set(sc, sc * .92, sc))
      this.fm.setMatrixAt(i, _m)
    }
    this.fm.instanceMatrix.needsUpdate = true
    return thud
  }
}
