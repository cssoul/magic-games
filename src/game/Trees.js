import * as THREE from 'three'
import { addSnow } from './EnvU.js'
import { Grid, addSource } from './Collide.js'
import { siteClear } from './Sites.js'
import { pathDist } from './Paths.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 程序化树木：5 种树型（3 种阔叶、2 种松杉）各自合并成一个几何体，再用 InstancedMesh 种满山谷。
// 阔叶树冠由若干噪声扰动的叶团组成，法线在"叶团球"与"整个树冠球"之间混合，得到柔和、成团的明暗；
// 风在顶点着色器里让整棵树摇摆，叶团再各自轻颤；颜色带笔触色斑和随风移动的云影，与地形一致。
let rnd = Math.random   // createForest 里换成固定种子，保证每台设备生成同一片森林
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0)
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const C = h => new THREE.Color(h)
const BARK0 = C('#2e2219'), BARK1 = C('#5c4332')
const L0 = C('#243d1d'), L1 = C('#4a782c'), L2 = C('#a3bd52')
const P0 = C('#183025'), P1 = C('#355f37'), P2 = C('#7c9a4a')

function finish(g, colorFn) {
  g = g.index ? g.toNonIndexed() : g
  if (g.attributes.uv) g.deleteAttribute('uv')
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color(), pv = V(), nv = V()
  for (let i = 0; i < p.count; i++) { pv.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i); colorFn(pv, nv, col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g
}
function limb(a, b, r0, r1, seg = 7) {
  const d = b.clone().sub(a), L = d.length()
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 2, true); g.translate(0, L / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate(a.x, a.y, a.z); return g
}
const barkColor = (p, n, c) => c.copy(BARK0).lerp(BARK1, THREE.MathUtils.clamp((p.y + 0.6) / 4, 0, 1) * (0.7 + 0.3 * Math.max(n.y + 0.5, 0)))

// 花树、果树的树冠配色
const PINK = [C('#b05476'), C('#ec93b4'), C('#ffd9e6')], ROSE = [C('#8a3458'), C('#d8648f'), C('#f6aac6')]
const APPLE = C('#c4261d'), ORANGE = C('#f0901c')

function broadleaf(seed, pal = [L0, L1, L2], fruit = null) {
  const r = rng(seed), wood = [], leaf = []
  const th = 3 + r() * 1.4, lx = (r() - 0.5) * 0.9, lz = (r() - 0.5) * 0.9
  const p0 = V(0, -0.6, 0), p1 = V(lx * 0.4, th * 0.55, lz * 0.4), p2 = V(lx, th, lz)
  wood.push(limb(p0, p1, 0.42, 0.3), limb(p1, p2, 0.3, 0.2), limb(V(0, -0.6, 0), V(0, 0.5, 0), 0.75, 0.38, 8))
  const R = 2.6 + r() * 1.1, Cc = p2.clone().add(V(0, R * 0.8, 0))
  const k = 6 + Math.floor(r() * 3), centers = [[Cc.clone().add(V(0, R * 0.4, 0)), R * 0.62]]
  for (let i = 0; i < k; i++) {
    const a = i / k * Math.PI * 2 + r() * 0.6, e = (r() - 0.35) * 0.9
    centers.push([Cc.clone().add(V(Math.cos(a) * R * 0.62, e * R * 0.5, Math.sin(a) * R * 0.62)), R * (0.42 + r() * 0.2)])
  }
  centers.forEach(([c], i) => { if (i % 2) wood.push(limb(p1.clone().lerp(p2, 0.5 + r() * 0.5), c.clone().lerp(Cc, 0.35), 0.13, 0.05, 5)) })
  const bottom = Cc.y - R * 0.45, ph = r() * 10
  for (const [c, rr] of centers) {
    const g = new THREE.IcosahedronGeometry(rr, 1), p = g.attributes.position, n = g.attributes.normal, v = V(), w = V()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); w.copy(v).add(c)
      const d = 1 + 0.17 * Math.sin(w.x * 2.1 + ph) * Math.sin(w.y * 1.7 + ph * 0.7) * Math.sin(w.z * 2.3) + 0.08 * Math.sin(w.x * 5.3 + w.z * 4.1 + ph)
      w.copy(c).addScaledVector(v, d)
      if (w.y < bottom) w.y = bottom + (w.y - bottom) * 0.35   // 树冠底部收平
      p.setXYZ(i, w.x, w.y, w.z)
      const nc = v.normalize().lerp(w.clone().sub(Cc).normalize(), 0.55).normalize(); n.setXYZ(i, nc.x, nc.y, nc.z)
    }
    leaf.push(finish(g, (pp, nn, col) => {
      const t = THREE.MathUtils.clamp((pp.y - bottom) / (R * 1.5), 0, 1)
      col.copy(pal[0]).lerp(pal[1], Math.min(1, t * 1.4))
      if (t > 0.5) col.lerp(pal[2], (t - 0.5) * 1.1 * Math.max(0, nn.y))
      col.multiplyScalar(0.9 + 0.2 * Math.sin(pp.x * 3.1 + pp.z * 2.7 + ph))
    }))
  }
  if (fruit) {   // 果子：挂在树冠外沿，下半部更多
    const fr = rng(seed + 7)
    for (const [c, rr] of centers) for (let i = 0; i < 8; i++) {
      const v = V(fr() * 2 - 1, fr() * 1.3 - .95, fr() * 2 - 1).normalize(), p = c.clone().addScaledVector(v, rr * .98)
      if (p.y < bottom + .2) p.y = bottom + .25
      const g = new THREE.SphereGeometry(.15 + fr() * .06, 7, 5); g.translate(p.x, p.y, p.z)
      leaf.push(finish(g, (pp, nn, col) => col.copy(fruit).multiplyScalar(.7 + .4 * Math.max(nn.y, 0))))
    }
  }
  return { wood: mergeGeometries(wood.map(g => finish(g, barkColor))), leaf: mergeGeometries(leaf), col: { kind: 0, top: p2.y, cy: Cc.y, r: R } }
}

function conifer(seed) {
  const r = rng(seed), H = 8 + r() * 3, leaf = [], ph = r() * 10
  const wood = [limb(V(0, -0.6, 0), V(0, H * 0.9, 0), 0.34, 0.06, 7)]
  const tiers = 5 + Math.floor(r() * 2)
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), y = 1.6 + f * (H - 3.2), rad = (1 - f) * 2.4 + 0.55, h = 2.3 + (1 - f) * 0.8
    const g = new THREE.ConeGeometry(rad, h, 12, 3).toNonIndexed(), p = g.attributes.position, n = g.attributes.normal, v = V()
    for (let j = 0; j < p.count; j++) {
      v.fromBufferAttribute(p, j)
      const ny = n.getY(j), rho = Math.hypot(v.x, v.z), a = Math.atan2(v.z, v.x), kk = (h / 2 - v.y) / h
      const jag = 1 + (0.2 * Math.sin(a * 6 + i * 1.7 + ph) + 0.08 * Math.sin(a * 13 + ph)) * kk
      v.x *= jag; v.z *= jag; v.y -= kk * kk * 0.45 * (rho / rad); v.y += y     // 层层下垂、边缘参差
      p.setXYZ(j, v.x, v.y, v.z)
      const nv = ny < -0.5 ? V(0, -1, 0) : V(Math.cos(a), 0.9, Math.sin(a)).normalize(); n.setXYZ(j, nv.x, nv.y, nv.z)
    }
    leaf.push(finish(g, (pp, nn, col) => {
      col.copy(P0).lerp(P1, 0.5 + 0.5 * nn.y)
      col.lerp(P2, f * 0.45 * Math.max(0, nn.y)).multiplyScalar(0.9 + 0.2 * Math.sin(pp.y * 2.3 + Math.atan2(pp.z, pp.x) * 5 + ph))
    }))
  }
  return { wood: mergeGeometries(wood.map(g => finish(g, barkColor))), leaf: mergeGeometries(leaf), col: { kind: 1, H } }
}

const NOISE = `
float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
`
const uTime = { value: 0 }
function windMat(leaf) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: leaf ? 0.85 : 0.95 })
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime
    sh.vertexShader = 'uniform float uTime;\nvarying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(0.);
      #ifdef USE_INSTANCING
        ip = instanceMatrix[3].xyz;
      #endif
      float ph = ip.x * .045 + ip.z * .031;
      float gust = .6 + .4 * sin(uTime * .35 + ip.x * .01 + ip.z * .013);
      float hy = max(transformed.y, 0.);
      vec2 sway = vec2(.8, .45) * (sin(uTime * 1.25 + ph) * .6 + .6) * gust + vec2(-.45, .8) * sin(uTime * .9 + ph * 1.7) * .25;
      transformed.xz += sway * hy * hy * .0035;
      ${leaf ? 'transformed += vec3(sin(uTime * 3.1 + transformed.y * 1.7 + ph), sin(uTime * 2.7 + transformed.x * 1.9 + ph) * .6, cos(uTime * 3.3 + transformed.z * 1.6 + ph)) * .045 * smoothstep(1.5, 6., hy);' : ''}
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
      #else
        vWPos = (modelMatrix * vec4(transformed, 1.)).xyz;
      #endif`)
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vWPos;\n' + NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dab = vn(vWPos.xz * .9 + vWPos.y * .7) * .6 + vn(vWPos.xz * 2.3 - vWPos.y * 1.3) * .4;
        diffuseColor.rgb *= .84 + dab * .32;
        vec2 cp = (vWPos.xz + uTime * vec2(9., 3.)) * .0035;
        diffuseColor.rgb *= 1. - .42 * smoothstep(.5, .6, vn(cp) * .7 + vn(cp * 2.7 + .19) * .3);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (leaf ? 'totalEmissiveRadiance += diffuseColor.rgb * .12; // 叶片透光' : ''))
  }
  return m
}

export function createForest(scene, heightAt, origin, S = 1400, N = 2200) {
  rnd = rng(20241124)
  const kinds = [broadleaf(11), broadleaf(23), broadleaf(37), conifer(5), conifer(19),
    broadleaf(41, PINK), broadleaf(53, PINK), broadleaf(61, undefined, APPLE), broadleaf(71, undefined, ORANGE)]   // 5–8：花树、果树
  const woodMat = addSnow(windMat(false)), leafMat = addSnow(windMat(true)), white = new THREE.Color(1, 1, 1)
  const meshes = kinds.map(k => {
    const w = new THREE.InstancedMesh(k.wood, woodMat, N), l = new THREE.InstancedMesh(k.leaf, leafMat, N)
    l.setColorAt(0, white)
    for (const m of [w, l]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m) }
    return { w, l, n: 0 }
  })
  const trees = []
  for (let i = 0; i < N; i++) {
    let bx, bz
    if (i % 9 === 0) { bx = rnd() * S; bz = rnd() * S }          // 零星的孤树
    else {                                                                        // 成片的树林
      const cl = Math.floor(rnd() * 40), cx = ((Math.sin(cl * 12.9) + 1) / 2) * S, cz = ((Math.cos(cl * 7.3) + 1) / 2) * S
      const rr = Math.pow(rnd(), 0.7) * 120, a = rnd() * 6.283
      bx = (cx + Math.cos(a) * rr + S) % S; bz = (cz + Math.sin(a) * rr + S) % S
    }
    const tint = new THREE.Color(0.88 + rnd() * 0.22, 0.9 + rnd() * 0.18, 0.82 + rnd() * 0.22)
    trees.push({ bx, bz, sc: 1.15 + rnd() * 0.75, rot: rnd() * 6.28, k: rnd(), c: rnd(), sp: rnd(), tint })
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = V(), s = V()
  const wrap = (b, p) => b + Math.floor((p - b + S / 2) / S) * S
  const grid = new Grid(24); addSource(grid)
  const blossoms = [], fruits = []     // 附近的花树、果树（给花瓣飘落、落果用）
  return {
    blossoms, fruits,
    relayout(p) {
      meshes.forEach(m => (m.n = 0)); grid.clear(); blossoms.length = 0; fruits.length = 0
      for (const t of trees) {
        const x = wrap(t.bx, p.x), z = wrap(t.bz, p.z), h = heightAt(x, z)
        if (!(h > 4 && h < 95)) continue
        if (!siteClear(x, z, 10)) continue
        const pd = pathDist(x, z); if (pd < 3.5) continue
        if (Math.hypot((x - origin.pitch.x) / 150, (z - origin.pitch.z) / 95) < 1.05) continue
        const con = t.c < 0.15 + 0.7 * THREE.MathUtils.smoothstep(h, 18, 60)          // 越往高处松杉越多
        const special = !con && t.sp < (pd < 30 ? .09 : .022)         // 花树、果树只是少量点缀，路边稍多
        const ki = con ? (t.k < 0.5 ? 3 : 4) : special ? 5 + Math.min(3, Math.floor(t.k * 4)) : Math.floor(t.k * 3), m = meshes[ki]
        q.setFromEuler(e.set(0, t.rot, 0)); m4.compose(v.set(x, h - 0.2, z), q, s.setScalar(t.sc * (con ? 1.1 : 1)))
        m.w.setMatrixAt(m.n, m4); m.l.setMatrixAt(m.n, m4); m.l.setColorAt(m.n, t.tint); m.n++
        const col = kinds[ki].col, sc = t.sc * (con ? 1.1 : 1)
        if (col.kind === 0) { grid.add({ k: 0, x, z, r: .45 * sc, y0: h - 1, y1: h + col.top * sc }); grid.add({ k: 3, x, y: h + col.cy * sc, z, r: col.r * sc }) }
        else grid.add({ k: 1, x, z, r: 2.6 * sc, y0: h - 1, y1: h + col.H * sc })
        if (ki >= 5) (ki <= 6 ? blossoms : fruits).push({ x, z, cy: h + col.cy * sc, r: col.r * sc, ki })
      }
      for (const m of meshes) {
        m.w.count = m.l.count = m.n
        m.w.instanceMatrix.needsUpdate = m.l.instanceMatrix.needsUpdate = true; m.l.instanceColor.needsUpdate = true
      }
    },
    update(t) { uTime.value = t }
  }
}
