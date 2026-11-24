import * as THREE from 'three'
import { addSnow } from './EnvU.js'
import { Grid, addSource } from './Collide.js'
import { SITES, siteCenter, siteLevel } from './Sites.js'

// 哈利波特风格城堡群：圆塔尖顶、方塔、城墙垛口、哥特礼堂、大教堂（飞扶壁、玫瑰窗、尖塔）、钟楼、廊桥、小镇民居。
// 全部由少量单位几何体拼成，按"材质 × 几何体"合批为 InstancedMesh；石墙砌缝、瓦片在着色器里按世界坐标绘制。
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V(), _s = V()
const uTime = { value: 0 }
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const rot = (lx, lz, ry) => [lx * Math.cos(ry) + lz * Math.sin(ry), -lx * Math.sin(ry) + lz * Math.cos(ry)]
const STONE = ['#d3c8b2', '#c9bda6', '#bfb39d', '#d8cdb8']
const ROOF = ['#3e4b5f', '#46566e', '#36404f', '#4c596b']

let G = null, MAT = null
function init() {
  if (G) return
  const lancet = new THREE.Shape(); lancet.moveTo(-.5, 0); lancet.lineTo(.5, 0); lancet.lineTo(.5, .62)
  lancet.quadraticCurveTo(.5, .9, 0, 1); lancet.quadraticCurveTo(-.5, .9, -.5, .62); lancet.closePath()
  const tri = new THREE.Shape(); tri.moveTo(-.5, 0); tri.lineTo(.5, 0); tri.lineTo(0, 1); tri.closePath()
  G = {
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, .5, 0),
    half: new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI).translate(0, .5, 0),
    cone: new THREE.ConeGeometry(1, 1, 24).translate(0, .5, 0),
    halfcone: new THREE.ConeGeometry(1, 1, 14, 1, false, 0, Math.PI).translate(0, .5, 0),
    spire: new THREE.ConeGeometry(1, 1, 8).translate(0, .5, 0),
    pyr: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, .5, 0),
    prism: new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false }).translate(0, 0, -.5),
    lancet: new THREE.ShapeGeometry(lancet, 6), disc: new THREE.CircleGeometry(.5, 28), ball: new THREE.SphereGeometry(1, 12, 8)
  }
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')
  g.fillStyle = '#1a1420'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill()
  const cols = ['#2b4ea8', '#a8242e', '#d9a83a', '#2f7d5a', '#6a3aa0']
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 12; i++) {
    const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2, r0 = 22 + ring * 34, r1 = r0 + 30
    g.fillStyle = cols[(i + ring * 2) % cols.length]; g.beginPath(); g.arc(128, 128, r1, a0 + .04, a1 - .04); g.arc(128, 128, r0, a1 - .04, a0 + .04, true); g.fill()
  }
  g.fillStyle = '#e8c45a'; g.beginPath(); g.arc(128, 128, 16, 0, 7); g.fill()
  const rose = new THREE.CanvasTexture(c); rose.colorSpace = THREE.SRGBColorSpace
  MAT = {
    stone: addSnow(painted(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92 }), true)),
    roof: addSnow(painted(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .65, metalness: .05 }), false)),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: .3, metalness: .3, emissive: 0xffa94d, emissiveIntensity: .42, side: THREE.DoubleSide }),
    rose: new THREE.MeshStandardMaterial({ map: rose, emissiveMap: rose, emissive: 0xffffff, emissiveIntensity: .75, roughness: .4, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4b3424, roughness: .9, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5c5f66, metalness: .7, roughness: .4 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd6aa4c, metalness: .9, roughness: .3 }),
    clock: new THREE.MeshStandardMaterial({ color: 0xf0e7cf, roughness: .6, side: THREE.DoubleSide })
  }
}

const NOISE = `
float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
`
function painted(mat, stone) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime
    sh.vertexShader = 'varying vec3 vWPos, vWN; varying float vLY;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLY = position.y;
      #ifdef USE_INSTANCING
        mat4 cMW = modelMatrix * instanceMatrix;
      #else
        mat4 cMW = modelMatrix;
      #endif
      vWPos = (cMW * vec4(transformed, 1.)).xyz; vWN = normalize(mat3(cMW) * objectNormal);`)
    const body = stone ? `
      // 石块砌缝：每层 0.8 m，错缝
      float cy = cP.y / .8, row = floor(cy), cx = cU / 1.7 + h2(vec2(row, 3.1)), fy = fract(cy), fx = fract(cx);
      float aa = clamp(fwidth(cy) * 2.5, 0., 1.);
      float jn = max(1. - smoothstep(.03, .1, min(fy, 1. - fy)), 1. - smoothstep(.015, .06, min(fx, 1. - fx)));
      jn *= (1. - smoothstep(.55, .8, abs(cN.y))) * (1. - aa);
      diffuseColor.rgb *= mix(.94, 1.18, h2(vec2(floor(cx), row) + 7.)) * (1. - .28 * jn);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.7, .78, .6), (1. - smoothstep(0., .3, vLY)) * .5);  // 墙脚潮湿、青苔` : `
      // 石板瓦：一行行，每片颜色略不同，顶部褪色
      float cy = cP.y / .42, row = floor(cy), fy = fract(cy), aa = clamp(fwidth(cy) * 2., 0., 1.);
      float ln = (1. - smoothstep(0., .2, fy)) * (1. - aa);
      diffuseColor.rgb *= mix(.84, 1.12, h2(vec2(floor(cU / .55 + row * .5), row))) * (1. - .35 * ln);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + .02, smoothstep(.5, 1., vLY) * .25);`
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vWPos, vWN; varying float vLY;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 cP = vWPos, cN = normalize(vWN);
      vec2 cH = normalize(cN.xz + vec2(1e-4)); float cU = dot(cP.xz, vec2(-cH.y, cH.x));
      ${body}
      float dab = vn(cP.xz * .35 + cP.y * .5) * .6 + vn(cP.xz * 1.3 - cP.y * 1.1) * .4;
      diffuseColor.rgb *= .86 + dab * .28;
      vec2 cp = (cP.xz + uTime * vec2(9., 3.)) * .0035;
      diffuseColor.rgb *= 1. - .42 * smoothstep(.5, .6, vn(cp) * .7 + vn(cp * 2.7 + .19) * .3);`)
  }
  return mat
}

class Build {
  constructor(r) { this.b = new Map(); this.r = r; this.cols = [] }
  pick(a) { return a[Math.floor(this.r() * a.length)] }
  _push(mat, geo, m, col) { const k = mat + '|' + geo; if (!this.b.has(k)) this.b.set(k, { mat, geo, ms: [], cs: [] }); const e = this.b.get(k); e.ms.push(m); e.cs.push(col) }
  put(mat, geo, x, y, z, sx, sy, sz, ry = 0, col = null, rx = 0, rz = 0) {
    this._push(mat, geo, new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)), col)
    // 碰撞体：只为石墙、屋顶、木结构建立；很小的垛口忽略（墙体本身已覆盖）
    if (mat !== 'stone' && mat !== 'roof' && mat !== 'wood') return
    if (geo === 'box' || geo === 'prism') { if (sx * sy * sz > 2) this.cols.push({ k: 2, x, z, hx: sx / 2, hz: sz / 2, c: Math.cos(ry), s: Math.sin(ry), y0: y, y1: y + sy * (geo === 'prism' ? .55 : 1) }) }
    else if (geo === 'cyl' || geo === 'half') this.cols.push({ k: 0, x, z, r: Math.max(sx, sz), y0: y, y1: y + sy })
    else if (geo === 'cone' || geo === 'spire' || geo === 'halfcone') { if (sx > .8) this.cols.push({ k: 1, x, z, r: Math.max(sx, sz), y0: y, y1: y + sy }) }
    else if (geo === 'pyr') this.cols.push({ k: 1, x, z, r: sx * .6, y0: y, y1: y + sy })
  }
  beam(mat, a, b, t, col = null) {
    const d = b.clone().sub(a), L = d.length()
    this._push(mat, 'box', new THREE.Matrix4().compose(a, _q.setFromUnitVectors(UP, d.normalize()), _s.set(t, L, t)), col)
  }
  build(group) {
    for (const e of this.b.values()) {
      const im = new THREE.InstancedMesh(G[e.geo], MAT[e.mat], e.ms.length)
      e.ms.forEach((m, i) => im.setMatrixAt(i, m))
      if (e.cs.some(c => c)) e.cs.forEach((c, i) => im.setColorAt(i, new THREE.Color(c || '#ffffff')))
      im.castShadow = e.mat !== 'glass' && e.mat !== 'rose'; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im)
    }
  }
}

// ---------------- 构件 ----------------
function roundTower(B, x, z, r, h, o = {}) {
  const c = o.c || B.pick(STONE), rc = o.rc || B.pick(ROOF), base = o.base ?? -8
  B.put('stone', 'cyl', x, base, z, r, h - base, r, 0, c)
  B.put('stone', 'cyl', x, h - .6, z, r * 1.13, 1.1, r * 1.13, 0, c)          // 挑檐
  const top = h + .5
  if (o.crenel) {
    const n = Math.max(6, Math.round(r * 3))
    for (let i = 0; i < n; i++) { const a = (i + .5) / n * Math.PI * 2; B.put('stone', 'box', x + Math.cos(a) * r * 1.05, top, z + Math.sin(a) * r * 1.05, 1, 1.2, .7, -a - Math.PI / 2, c) }
  }
  if (o.roof !== false) {
    const rr = o.crenel ? r * .92 : r * 1.25, rh = r * (o.k || 2.5), y0 = o.crenel ? top + .2 : top - .3
    B.put('roof', o.oct ? 'spire' : 'cone', x, y0, z, rr, rh, rr, 0, rc)
    B.put('metal', 'spire', x, y0 + rh - .4, z, .13, 1.8 + r * .3, .13)
    B.put('gold', 'ball', x, y0 + rh + .1, z, .22, .22, .22)
  }
  const nw = r < 3 ? 2 : 3
  for (let y = 5 + B.r() * 2, k = 0; y < h - 3; y += 6.5, k++) for (let i = 0; i < nw; i++) {
    const a = i / nw * Math.PI * 2 + k * 1.1 + x * .1
    B.put('glass', 'lancet', x + Math.cos(a) * (r + .05), y, z + Math.sin(a) * (r + .05), .8, 1.8, 1, Math.PI / 2 - a)
  }
}
function squareTower(B, x, z, w, h, ry = 0, o = {}) {
  const c = o.c || B.pick(STONE), rc = o.rc || B.pick(ROOF), P = (lx, lz) => { const [a, b] = rot(lx, lz, ry); return [x + a, z + b] }
  B.put('stone', 'box', x, -8, z, w, h + 8, w, ry, c)
  B.put('stone', 'box', x, h - .7, z, w * 1.1, 1.2, w * 1.1, ry, c)
  const top = h + .5, hw = w * .55 - .4
  if (o.roof === false) {
    const n = Math.max(2, Math.round(w / 1.8))
    for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) {
      const t = -hw + (i + .5) / n * 2 * hw, l = [[t, -hw], [hw, t], [t, hw], [-hw, t]][s], [px, pz] = P(l[0], l[1])
      B.put('stone', 'box', px, top, pz, 1, 1.2, 1, ry, c)
    }
  } else if (o.spire) {
    const rh = w * (o.k || 3)
    B.put('roof', 'spire', x, top - .2, z, w * .62, rh, w * .62, ry + Math.PI / 8, rc)
    B.put('metal', 'spire', x, top + rh - .6, z, .15, 2.4, .15)
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = P(a * hw, b * hw); B.put('stone', 'spire', px, top - .3, pz, .6, 3.6, .6, ry, c) }
  } else {
    const rh = w * (o.k || 1.6)
    B.put('roof', 'pyr', x, top - .2, z, w * 1.18, rh, w * 1.18, ry, rc)
    B.put('metal', 'spire', x, top + rh - .6, z, .14, 2.2, .14)
  }
  for (let y = 5; y < h - (o.clock ? 7 : 3); y += 7) for (let s = 0; s < 4; s++) {
    const a = ry + s * Math.PI / 2, [dx, dz] = rot(0, w / 2 + .05, a); B.put('glass', 'lancet', x + dx, y, z + dz, 1, 2.2, 1, a)
  }
  if (o.clock) for (let s = 0; s < 4; s++) {
    const a = ry + s * Math.PI / 2, [dx, dz] = rot(0, w / 2 + .12, a), [hx, hz] = rot(0, w / 2 + .2, a)
    B.put('clock', 'disc', x + dx, h - 4, z + dz, w * .62, w * .62, 1, a)
    B.put('metal', 'box', x + hx, h - 4, z + hz, .22, w * .2, .06, a, null, 0, .7)
    B.put('metal', 'box', x + hx, h - 4, z + hz, .3, w * .14, .06, a, null, 0, -2.2)
  }
}
function wall(B, ax, az, bx, bz, h, t = 3, c) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), mx = (ax + bx) / 2, mz = (az + bz) / 2
  B.put('stone', 'box', mx, -8, mz, L, h + 8, t, ry, c)
  const n = Math.floor(L / 1.9)
  for (let i = 0; i < n; i++) {
    const al = -L / 2 + (i + .5) * L / n
    for (const s of [-1, 1]) { const [ox, oz] = rot(al, s * (t / 2 - .3), ry); B.put('stone', 'box', mx + ox, h, mz + oz, 1, 1.1, .6, ry, c) }
  }
}
function hall(B, x, z, w, d, h, ry, o = {}) {
  const c = o.c || B.pick(STONE), rc = o.rc || B.pick(ROOF), P = (lx, lz) => { const [a, b] = rot(lx, lz, ry); return [x + a, z + b] }
  const rh = w * (o.pitch || .7)
  B.put('stone', 'box', x, -8, z, w, h + 8, d, ry, c)
  B.put('stone', 'prism', x, h, z, w * .98, rh * .97, d, ry, c)               // 山墙
  B.put('roof', 'prism', x, h - .1, z, w * 1.12, rh * 1.02, d * .97, ry, rc)  // 陡峭屋顶
  const n = Math.max(2, Math.floor(d / 6.5))
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    let [px, pz] = P(s * (w / 2 + .05), -d / 2 + (i + .5) * d / n)
    B.put('glass', 'lancet', px, h * .22, pz, 2.1, h * .58, 1, ry + s * Math.PI / 2)    // 高耸的尖拱窗
    if (i === 0) continue
    const bz = -d / 2 + i * d / n;[px, pz] = P(s * (w / 2 + .55), bz)
    B.put('stone', 'box', px, -8, pz, 1.1, h + 7, 1.3, ry, c)                           // 扶壁
    B.put('stone', 'spire', px, h - 1, pz, .7, 3.2, .7, ry, c)
    if (o.fly) {                                                                          // 飞扶壁
      const [qx, qz] = P(s * (w / 2 + 6.5), bz)
      B.put('stone', 'box', qx, -8, qz, 1.6, h * .55 + 8, 1.8, ry, c)
      B.put('stone', 'spire', qx, h * .55, qz, .9, 3.5, .9, ry, c)
      B.beam('stone', V(qx, h * .5, qz), V(px, h * .85, pz), .75, c)
    }
  }
  for (const s of [-1, 1]) { const [px, pz] = P(0, s * (d / 2 + .05)); B.put('glass', 'lancet', px, h * .3, pz, w * .32, h * .62, 1, ry + (s > 0 ? 0 : Math.PI)) }
}
function house(B, x, z, w, d, h, ry) {
  const c = B.pick(['#e6d9bf', '#dccbaa', '#e9dfc9']), rc = B.pick(['#7a4a36', '#5d4a40', '#4a5566', '#6b3f30'])
  B.put('stone', 'box', x, -6, z, w, h + 6, d, ry, c)
  B.put('stone', 'prism', x, h, z, w * .98, w * .77, d, ry, c)
  B.put('roof', 'prism', x, h - .05, z, w * 1.15, w * .8, d * 1.06, ry, rc)
  const [cx, cz] = rot(w * .25, d * .3, ry); B.put('stone', 'box', x + cx, h, z + cz, .9, w * .8 + 1.2, .9, ry, '#8d8378')
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const [px, pz] = rot(s * (w / 2 + .04), (i - .5) * d * .45, ry); B.put('glass', 'lancet', x + px, h * .45, z + pz, .9, 1.4, 1, ry + s * Math.PI / 2) }
}
function cathedral(B, x, z, ry) {
  const c = '#c9bda6', rc = '#465468', P = (lx, lz) => { const [a, b] = rot(lx, lz, ry); return [x + a, z + b] }
  hall(B, x, z, 15, 64, 25, ry, { c, rc, fly: true, pitch: .75 })                                         // 中殿
  for (const s of [-1, 1]) { const [px, pz] = P(s * 11.5, 4); hall(B, px, pz, 8, 50, 12, ry, { c, rc, pitch: .45 }) } // 侧廊
  let [px, pz] = P(0, 16); hall(B, px, pz, 14, 46, 23, ry + Math.PI / 2, { c, rc, pitch: .75 })          // 十字翼
  squareTower(B, px, pz, 11, 36, ry, { c, rc, spire: true, k: 3.4 })                                     // 交叉处尖塔
  ;[px, pz] = P(0, 32); B.put('stone', 'half', px, -8, pz, 7.5, 33, 7.5, ry - Math.PI / 2, c)          // 半圆后殿
  B.put('roof', 'halfcone', px, 25, pz, 8.3, 8, 8.3, ry - Math.PI / 2, rc)
  for (const s of [-1, 1]) { const [qx, qz] = P(s * 10.5, -33); squareTower(B, qx, qz, 10, 42, ry, { c, rc, spire: true, k: 2.8 }) } // 西立面双塔
  ;[px, pz] = P(0, -33.2); B.put('stone', 'box', px, -8, pz, 11.5, 38, 3, ry, c); B.put('stone', 'prism', px, 30, pz, 11.5, 7, 3, ry, c)
  const [fx, fz] = P(0, -34.75)
  B.put('rose', 'disc', fx, 20, fz, 8, 8, 1, ry + Math.PI)                                               // 玫瑰窗
  B.put('wood', 'lancet', fx, 0, fz, 4.2, 9, 1, ry + Math.PI)                                             // 正门
  for (const s of [-1, 1]) { const [qx, qz] = P(s * 10.5, -38.1); B.put('wood', 'lancet', qx, 0, qz, 2.6, 6, 1, ry + Math.PI) }
}

// ---------------- 各处城堡 ----------------
const BUILD = {
  hogwarts(B) {
    const c = '#d0c3a9', rc = '#3f4b60'
    const ring = [[-62, -40], [-16, -60], [38, -54], [68, -16], [62, 34], [22, 64], [-28, 60], [-66, 18]]
    ring.forEach(([x, z], i) => { const [nx, nz] = ring[(i + 1) % ring.length]; wall(B, x, z, nx, nz, 15, 3.4, c) })
    ring.forEach(([x, z], i) => roundTower(B, x, z, 5 + (i % 3) * .8, 28 + (i * 7) % 12, { c, rc, k: 2.3 + (i % 2) * .6, crenel: i % 3 === 1 }))
    hall(B, 0, 4, 18, 52, 24, 0, { c, rc })                                  // 大礼堂
    squareTower(B, 0, -26, 12, 38, 0, { c, rc, k: 1.9 })                     // 入口塔楼
    roundTower(B, 34, -24, 7, 66, { c, rc, k: 2.9 })                         // 天文塔
    squareTower(B, -34, 20, 10, 46, .2, { c, rc, clock: true, k: 1.7 })      // 钟楼
    hall(B, -30, -18, 13, 30, 18, Math.PI / 2, { c, rc })
    hall(B, 30, 22, 12, 30, 17, .5, { c, rc })
    hall(B, 4, 46, 11, 28, 15, Math.PI / 2, { c, rc })
    ;[[18, -4, 4.2, 48], [-16, -34, 4.5, 44], [22, 40, 4, 40], [-20, 40, 3.6, 36], [46, 0, 3.5, 38], [-46, -10, 4, 34], [10, 26, 3, 54]]
      .forEach(([x, z, r, h]) => roundTower(B, x, z, r, h, { c, rc, k: 2.6 }))
    for (let i = 0; i < 6; i++) B.put('stone', 'box', 76 + i * 9, -50, -16, 3, 62, 4, 0, c)              // 廊桥
    B.put('stone', 'box', 98, 11, -16, 52, 2.2, 5, 0, c)
    B.put('wood', 'prism', 98, 13.2, -16, 5.6, 3, 52, Math.PI / 2)
    roundTower(B, 128, -16, 4.5, 26, { c, rc, k: 2.4, base: -50 })
  },
  cathedral(B) {
    cathedral(B, 0, 0, .3)
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + B.r() * .2, rr = 52 + B.r() * 8
      house(B, Math.cos(a) * rr * 1.12, Math.sin(a) * rr * .82, 6 + B.r() * 3, 8 + B.r() * 5, 6 + B.r() * 4, -a)
    }
    roundTower(B, -58, 22, 3.5, 30, { k: 2.8 })
  },
  fortress(B) {
    const c = B.pick(['#b0a690', '#a99f8a']), rc = B.pick(ROOF), n = 8, R = 54
    const pts = Array.from({ length: n }, (_, i) => { const a = (i + .5) / n * Math.PI * 2; return [Math.cos(a) * R, Math.sin(a) * R] })
    pts.forEach(([x, z], i) => { const [nx, nz] = pts[(i + 1) % n]; wall(B, x, z, nx, nz, 14, 4, c) })
    pts.forEach(([x, z], i) => roundTower(B, x, z, 5.5, 22, { c, rc, crenel: i % 2 === 0, roof: i % 2 === 0 ? false : undefined, k: 2.2 }))
    const [ax, az] = pts[5], [bx, bz] = pts[6], mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az)
    const ux = (bx - ax) / L, uz = (bz - az) / L, ox = mx / R, oz = mz / R
    for (const s of [-1, 1]) roundTower(B, mx + ux * 6 * s, mz + uz * 6 * s, 4.5, 24, { c, rc, crenel: true, k: 2 })  // 城门塔
    B.put('wood', 'lancet', mx + ox * 2.1, 0, mz + oz * 2.1, 5, 8.5, 1, Math.atan2(ox, oz))
    squareTower(B, 0, 0, 22, 32, 0, { c, roof: false })                                                    // 主堡
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) roundTower(B, a * 11, b * 11, 2.8, 40, { c, rc, k: 3 })
    hall(B, -28, 20, 12, 24, 13, .5, { c, rc }); hall(B, 26, -22, 10, 20, 11, -.4, { c, rc })
  },
  ruin(B) {
    const c = '#9d9585', pts = [[-30, -26], [18, -34], [34, 6], [10, 34], [-28, 22]]
    pts.forEach(([x, z], i) => {
      if (i === 2) return
      const [nx, nz] = pts[(i + 1) % pts.length], mx = x + (nx - x) * .55, mz = z + (nz - z) * .55
      wall(B, x, z, mx, mz, 6 + B.r() * 6, 3, c)
      if (B.r() < .6) wall(B, mx + (nx - mx) * .3, mz + (nz - mz) * .3, nx, nz, 3 + B.r() * 5, 3, c)
    })
    roundTower(B, -30, -26, 6, 22, { c, roof: false, crenel: true })
    roundTower(B, 10, 34, 4, 12, { c, roof: false, crenel: true })
    squareTower(B, 2, -2, 12, 18, .3, { c, roof: false })
    for (let i = 0; i < 26; i++) B.put('stone', 'box', B.r() * 60 - 30, -.4, B.r() * 60 - 30, 1 + B.r() * 1.5, .8 + B.r(), 1 + B.r() * 1.5, B.r() * 3, c, B.r() * .4, B.r() * .4)
  },
  spires(B) {
    const c = '#cfc6b6', rc = ['#5f8f80', '#4f7d72', '#6a9a88']   // 铜绿屋顶
    roundTower(B, 0, 0, 9, 38, { c, rc: rc[0], k: 2.3 })
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, rr = 22 + (i % 2) * 8, x = Math.cos(a) * rr, z = Math.sin(a) * rr
      roundTower(B, x, z, 2.6 + B.r(), 46 + B.r() * 26, { c, rc: rc[i % 3], k: 3.6, oct: i % 2 === 0 })
      if (i % 2 === 0) B.beam('stone', V(Math.cos(a) * 9.5, 26, Math.sin(a) * 9.5), V(Math.cos(a) * (rr - 2.5), 26, Math.sin(a) * (rr - 2.5)), 2.2, c)
    }
    const n = 10; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; wall(B, Math.cos(a0) * 44, Math.sin(a0) * 44, Math.cos(a1) * 44, Math.sin(a1) * 44, 7, 2.5, c) }
  }
}

// 窗户灯光强度：0 白天，1 深夜
export function setWindowGlow(k) {
  if (!MAT) return
  MAT.glass.emissiveIntensity = .35 + k * 2.6; MAT.rose.emissiveIntensity = .7 + k * 1.9
}

export function createCastles(scene) {
  init()
  const groups = SITES.map((s, i) => {
    const g = new THREE.Group(), B = new Build(rng(1000 + i * 77)); BUILD[s.kind](B); B.build(g); scene.add(g)
    const grid = new Grid(16); B.cols.forEach(c => grid.add(c)); addSource(grid, () => g.position)
    return g
  })
  return {
    update(t, p) {
      uTime.value = t
      groups.forEach((g, i) => { const c = siteCenter(i, p.x, p.z); g.position.set(c.x, siteLevel(i, c.tx, c.tz), c.z) })
    }
  }
}
