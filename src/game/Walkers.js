import * as THREE from 'three'
import { paths } from './Paths.js'
import { TILE } from './Sites.js'

// 小路上的行人：穿长袍、戴尖帽的巫师村民，沿路慢慢走，偶尔停下歇歇，走到尽头折返。夜里提着的灯会亮起来。
const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a2c18, emissive: 0xffb456, emissiveIntensity: .15, roughness: .5 })
export function setWalkerGlow(k) { lampMat.emissiveIntensity = .15 + k * 5 }

export function createWalkers(scene, heightAt, N = 42) {
  const routes = paths.map(pl => {
    const L = [0]; for (let i = 1; i < pl.length; i++) L.push(L[i - 1] + Math.hypot(pl[i].x - pl[i - 1].x, pl[i].z - pl[i - 1].z))
    return { pl, L, len: L[L.length - 1] }
  }).filter(r => r.len > 50)
  if (!routes.length) return { update() {} }
  const V2 = (x, y) => new THREE.Vector2(x, y)
  const robeG = new THREE.LatheGeometry([V2(0, 0), V2(.3, .02), V2(.27, .45), V2(.2, .95), V2(.17, 1.3), V2(.08, 1.42), V2(0, 1.44)], 12)
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, N); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m }
  const robe = mk(robeG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 }))
  const head = mk(new THREE.SphereGeometry(.125, 12, 9), new THREE.MeshStandardMaterial({ color: 0xf0c4a2, roughness: .6 }))
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85 })
  const hat = mk(new THREE.ConeGeometry(.17, .46, 12).translate(0, .23, 0), hatMat)
  const brim = mk(new THREE.CylinderGeometry(.3, .3, .025, 14), hatMat)
  const lamp = mk(new THREE.SphereGeometry(.075, 8, 6), lampMat); lamp.castShadow = false
  const COLS = ['#6b1f22', '#24452e', '#2a3b66', '#7a6a2a', '#3b3b44', '#5a4632', '#6a4a7a', '#2b2b30', '#8a6a4a', '#4a5a3a'].map(c => new THREE.Color(c))
  const r = Math.random, pick = () => COLS[Math.floor(r() * COLS.length)]
  const W = Array.from({ length: N }, (_, i) => {
    const ro = routes[i % routes.length], hc = pick()
    robe.setColorAt(i, pick()); hat.setColorAt(i, hc); brim.setColorAt(i, hc)
    return { ro, s: r() * ro.len, dir: r() < .5 ? 1 : -1, sp: 1 + r() * .5, ph: r() * 6.28, hat: r() < .6, lamp: r() < .65, h: .92 + r() * .16, rest: 0 }
  })
  robe.instanceColor.needsUpdate = hat.instanceColor.needsUpdate = brim.instanceColor.needsUpdate = true
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3()
  return {
    update(dt, t, cam) {
      W.forEach((w, i) => {
        const ro = w.ro
        if (w.rest > 0) w.rest -= dt
        else { w.s += w.dir * w.sp * dt; if (r() < dt * .012) w.rest = 2 + r() * 5 }
        if (w.s > ro.len) { w.s = ro.len; w.dir = -1; w.rest = 3 } else if (w.s < 0) { w.s = 0; w.dir = 1; w.rest = 3 }
        let lo = 0, hi = ro.L.length - 1
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ro.L[mid] <= w.s) lo = mid; else hi = mid }
        const a = ro.pl[lo], b = ro.pl[hi], f = (w.s - ro.L[lo]) / Math.max(ro.L[hi] - ro.L[lo], 1e-4)
        const dx = (b.x - a.x) * w.dir, dz = (b.z - a.z) * w.dir, dl = Math.hypot(dx, dz) || 1
        let x = a.x + (b.x - a.x) * f - dz / dl * .55, z = a.z + (b.z - a.z) * f + dx / dl * .55      // 靠路右侧走
        x += TILE * Math.round((cam.x - x) / TILE); z += TILE * Math.round((cam.z - z) / TILE)
        const y = heightAt(x, z), sc = Math.hypot(x - cam.x, z - cam.z) > 450 || y < 2.6 ? 0 : w.h
        const yaw = Math.atan2(dx, dz), walking = w.rest <= 0, ph = t * w.sp * 5.6 + w.ph
        const bob = walking ? Math.abs(Math.sin(ph)) * .045 : 0, sway = walking ? Math.sin(ph) * .035 : 0
        q.setFromEuler(e.set(0, yaw, sway)); m4.compose(v.set(x, y + bob, z), q, s.setScalar(sc)); robe.setMatrixAt(i, m4)
        m4.compose(v.set(x, y + 1.53 * sc + bob, z), q, s.setScalar(sc)); head.setMatrixAt(i, m4)
        q.setFromEuler(e.set(-.15, yaw, sway * 2)); const hs = w.hat ? sc : 0
        m4.compose(v.set(x, y + 1.61 * sc + bob, z), q, s.setScalar(hs)); hat.setMatrixAt(i, m4)
        m4.compose(v.set(x, y + 1.61 * sc + bob, z), q, s.setScalar(hs)); brim.setMatrixAt(i, m4)
        const lx = .3, lz = .1 + (walking ? Math.sin(ph) * .07 : 0), cy = Math.cos(yaw), sy = Math.sin(yaw)
        m4.compose(v.set(x + (lx * cy + lz * sy) * sc, y + (.78 + bob) * sc, z + (-lx * sy + lz * cy) * sc), q.identity(), s.setScalar(w.lamp ? sc : 0)); lamp.setMatrixAt(i, m4)
      })
      for (const m of [robe, head, hat, brim, lamp]) m.instanceMatrix.needsUpdate = true
    }
  }
}
