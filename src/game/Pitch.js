import * as THREE from 'three'
import { addSnow } from './EnvU.js'
import { Grid, addSource } from './Collide.js'

// 魁地奇球场：木结构脚手架看台、学院布幔、尖顶与旗帜、观众、修剪草坪、金色球门
// 所有重复构件都用 InstancedMesh 合批，整个球场约 12 次绘制
export const pitchTime = { value: 0 }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const UP = V(0, 1, 0), WHITE = new THREE.Color(1, 1, 1)
const HOUSE = [0x9a1d20, 0x1f5a33, 0x1f3f80, 0xd4a72c].map(c => new THREE.Color(c))
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V(), _s = V()

function place(T, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).premultiply(T)
}
function beam(T, a, b, t) {
  const d = b.clone().sub(a), L = d.length()
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), _q.setFromUnitVectors(UP, d.divideScalar(L)), _s.set(t, L, t)).premultiply(T)
}
class Batch {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.ms = []; this.cs = [] }
  add(m, c) { this.ms.push(m); this.cs.push(c || null) }
  build(parent, cast = true) {
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.ms.length)
    this.ms.forEach((m, i) => im.setMatrixAt(i, m))
    if (this.cs.some(c => c)) this.cs.forEach((c, i) => im.setColorAt(i, c || WHITE))
    im.castShadow = cast; im.receiveShadow = true; parent.add(im); return im
  }
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
}
// 顶点着色器里让布料随风摆：mode 0 顶部固定的布幔，mode 1 左侧固定的旗帜，mode 2 观众欢呼跳动
function animated(mat, mode) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = pitchTime
    const body = [
      'float k = 1.0 - uv.y; transformed.z += (sin(uTime * 1.6 + seed + uv.y * 5.0 + uv.x * 3.0) * 0.32 + sin(uTime * 2.9 + seed * 2.0 + uv.x * 9.0) * 0.1) * k;',
      'float k = uv.x; transformed.z += sin(uTime * 7.0 + seed - uv.x * 7.0) * 0.4 * k; transformed.y -= k * k * 0.2;',
      'transformed.y += abs(sin(uTime * 5.0 + seed * 3.0)) * 0.2 * step(0.55, fract(seed * 7.13));'
    ][mode]
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float seed = 0.0;
      #ifdef USE_INSTANCING
        seed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21 + instanceMatrix[3].y * 0.11;
      #endif
      ${body}`)
  }
  return mat
}

export function createPitch(scene, heightAt, P) {
  // 取一圈采样的最高点作为场地高度，避免被地形埋住
  let ground = heightAt(P.x, P.z)
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ground += heightAt(P.x + Math.cos(a) * 70, P.z + Math.sin(a) * 35) }
  ground = ground / 17 + 0.2
  const pitch = new THREE.Group(); pitch.position.set(P.x, ground, P.z); scene.add(pitch)
  const grid = new Grid(24); addSource(grid)

  // ---- 草坪：修剪条纹 + 白线 ----
  const grassTex = canvasTex(2048, 1024, (g, w, h) => {
    g.fillStyle = '#5b8d3c'; g.fillRect(0, 0, w, h)
    const n = 24; g.fillStyle = '#6ea248'
    for (let i = 1; i < n; i += 2) g.fillRect(i * w / n, 0, w / n, h)
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(35,65,25,${Math.random() * 0.12})` : `rgba(170,200,100,${Math.random() * 0.1})`
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 2 + Math.random() * 7)
    }
    g.strokeStyle = 'rgba(246,243,232,0.92)'; g.lineWidth = 7
    const ell = (cx, rx, ry, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.ellipse(cx, h / 2, rx, ry, 0, a0, a1); g.stroke() }
    ell(w / 2, w / 2 * 0.965, h / 2 * 0.965)
    ell(w / 2, w / 2 * 7 / 95, h / 2 * 7 / 45)
    g.beginPath(); g.moveTo(w / 2, h * 0.025); g.lineTo(w / 2, h * 0.975); g.stroke()
    for (const s of [-1, 1]) ell(w / 2 + s * w / 2 * 80 / 95, w / 2 * 22 / 95, h / 2 * 22 / 45, s < 0 ? -Math.PI / 2 : Math.PI / 2, s < 0 ? Math.PI / 2 : Math.PI * 1.5)
  })
  const grass = new THREE.Mesh(new THREE.CircleGeometry(1, 96), addSnow(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 })))
  grass.scale.set(95, 45, 1); grass.rotation.x = -Math.PI / 2; grass.position.y = 0.4; grass.receiveShadow = true; pitch.add(grass)
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.7, 30, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x6f9440, roughness: 1 }))
  plinth.scale.set(128, 1, 74); plinth.position.y = -14.7; plinth.receiveShadow = true; pitch.add(plinth)
  const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 64), plinth.material); cap.scale.set(128, 74, 1); cap.rotation.x = -Math.PI / 2; cap.position.y = 0.3; cap.receiveShadow = true; pitch.add(cap)

  // ---- 材质与批次 ----
  const box = new THREE.BoxGeometry(1, 1, 1)
  const drapeTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#c4c4c4'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.84); g.lineTo(w / 2, h); g.lineTo(0, h * 0.84); g.closePath(); g.fill()
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = '#7c7c7c'; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, 0, w * 0.07, h); g.fillRect(w * 0.93, 0, w * 0.07, h)
    g.fillStyle = '#ffffff'; g.beginPath() // 盾形纹章
    g.moveTo(w * 0.3, h * 0.24); g.lineTo(w * 0.7, h * 0.24); g.lineTo(w * 0.7, h * 0.44); g.quadraticCurveTo(w * 0.7, h * 0.56, w * 0.5, h * 0.62); g.quadraticCurveTo(w * 0.3, h * 0.56, w * 0.3, h * 0.44); g.closePath(); g.fill()
    for (let i = 0; i < 7; i++) { // 褶皱明暗
      const x0 = i * w / 7, gr = g.createLinearGradient(x0, 0, x0 + w / 7, 0)
      gr.addColorStop(0, 'rgba(0,0,0,0.16)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)')
      g.fillStyle = gr; g.fillRect(x0, 0, w / 7, h)
    }
  })
  const flagTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h / 2); g.lineTo(0, h); g.closePath(); g.fill() })
  const drapeGeo = new THREE.PlaneGeometry(1, 1, 6, 10); drapeGeo.translate(0, -0.5, 0)
  const flagGeo = new THREE.PlaneGeometry(3.2, 1.6, 8, 2); flagGeo.translate(1.6, 0, 0)
  const B = {
    wood: new Batch(box, new THREE.MeshStandardMaterial({ color: 0x75522f, roughness: 0.95 })),
    plank: new Batch(box, new THREE.MeshStandardMaterial({ color: 0xa07a4e, roughness: 0.9 })),
    cloth: new Batch(box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })),
    gold: new Batch(box, new THREE.MeshStandardMaterial({ color: 0xd9ad4a, metalness: 0.8, roughness: 0.35 })),
    ball: new Batch(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0b450, metalness: 0.9, roughness: 0.25 })),
    roof: new Batch(new THREE.ConeGeometry(6.4, 5.8, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })),
    drape: new Batch(drapeGeo, animated(new THREE.MeshStandardMaterial({ map: drapeTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }), 0)),
    flag: new Batch(flagGeo, animated(new THREE.MeshStandardMaterial({ map: flagTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 1)),
    crowd: new Batch(new THREE.CapsuleGeometry(0.26, 0.45, 3, 8), animated(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 2))
  }
  const crowdCols = [...HOUSE, new THREE.Color(0x1d1b25), new THREE.Color(0x2a2a33), new THREE.Color(0xe7d7b8)]

  // ---- 看台塔 ----
  function tower(T, h, house) {
    const w = 3.5
    for (const [x, z] of [[-w, -w], [w, -w], [-w, w], [w, w]]) B.wood.add(beam(T, V(x, -2, z), V(x, h + 6.5, z), 0.55))
    const lv = []; for (let y = 4; y < h - 2; y += 5.5) lv.push(y); lv.push(h)
    lv.forEach((y, i) => {
      B.wood.add(place(T, 0, y, -w, 2 * w, 0.35, 0.35)); B.wood.add(place(T, 0, y, w, 2 * w, 0.35, 0.35))
      B.wood.add(place(T, -w, y, 0, 0.35, 0.35, 2 * w)); B.wood.add(place(T, w, y, 0, 0.35, 0.35, 2 * w))
      const y0 = i ? lv[i - 1] : 0, f = i % 2 ? 1 : -1
      B.wood.add(beam(T, V(-w * f, y0, -w), V(w * f, y, -w), 0.24)); B.wood.add(beam(T, V(-w * f, y0, w), V(w * f, y, w), 0.24))
      B.wood.add(beam(T, V(-w, y0, -w * f), V(-w, y, w * f), 0.24)); B.wood.add(beam(T, V(w, y0, -w * f), V(w, y, w * f), 0.24))
    })
    // 平台与阶梯座位
    B.plank.add(place(T, 0, h + 0.3, 0.3, 8.6, 0.5, 9.2))
    for (let r = 0; r < 3; r++) {
      const z = 1.9 - r * 1.9, th = 0.45 + r * 0.7
      B.plank.add(place(T, 0, h + 0.55 + th / 2, z, 7.2, th, 1.5))
      for (let x = -3; x <= 3.01; x += 0.86) if (Math.random() < 0.85)
        B.crowd.add(place(T, x + (Math.random() - 0.5) * 0.2, h + 0.55 + th + 0.48, z, 1, 0.9 + Math.random() * 0.25, 1), crowdCols[Math.random() < 0.55 ? HOUSE.indexOf(house) : (Math.random() * crowdCols.length) | 0])
    }
    // 学院色围挡 + 金色扶手
    B.cloth.add(place(T, 0, h + 1.25, w + 0.15, 7.8, 1.5, 0.15), house)
    for (const s of [-1, 1]) B.cloth.add(place(T, s * (w + 0.15), h + 1.25, 0, 0.15, 1.5, 7.8), house)
    B.cloth.add(place(T, 0, h + 3.3, -w - 0.1, 7.8, 5.6, 0.2), house)
    B.gold.add(place(T, 0, h + 2.05, w + 0.2, 8.0, 0.16, 0.16))
    B.gold.add(place(T, 0, h + 0.02, w + 0.45, 8.7, 0.24, 0.12))
    // 尖顶与旗帜
    B.wood.add(place(T, 0, h + 6.6, 0, 8.8, 0.45, 8.8))
    B.roof.add(place(T, 0, h + 6.8 + 2.9, 0, 1, 1, 1), house)
    B.ball.add(place(T, 0, h + 12.7, 0, 1, 1, 1))
    B.wood.add(beam(T, V(0, h + 12.6, 0), V(0, h + 16.4, 0), 0.12))
    B.flag.add(place(T, 0.06, h + 15.6, 0, 1, 1, 1), house)
    // 正面垂下的布幔
    B.drape.add(place(T, 0, h - 0.15, w + 0.4, 7.4, Math.min(h * 0.55, 13), 1), house)
  }
  const NTW = 20
  for (let i = 0; i < NTW; i++) {
    const a = (i + 0.5) / NTW * Math.PI * 2, x = Math.cos(a) * 112, z = Math.sin(a) * 60
    const T = new THREE.Matrix4().compose(V(x, 0, z), _q.setFromEuler(_e.set(0, Math.atan2(-x, -z), 0)), V(1, 1, 1))
    const th = 18 + ((i * 7) % 4) * 3 + (i % 5 === 0 ? 6 : 0)
    tower(T, th, HOUSE[i % 4])
    grid.add({ k: 0, x: P.x + x, z: P.z + z, r: 5.6, y0: ground - 3, y1: ground + th + 6.8 })
    grid.add({ k: 1, x: P.x + x, z: P.z + z, r: 6.4, y0: ground + th + 6.8, y1: ground + th + 12.6 })
  }

  // ---- 场边围栏 ----
  const I = new THREE.Matrix4(), NF = 96
  for (let i = 0; i < NF; i++) {
    const a0 = i / NF * Math.PI * 2, a1 = (i + 1) / NF * Math.PI * 2
    const x0 = Math.cos(a0) * 98, z0 = Math.sin(a0) * 48, x1 = Math.cos(a1) * 98, z1 = Math.sin(a1) * 48
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx)
    B.cloth.add(place(I, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, L + 0.05, 1.5, 0.3, 0, ry), HOUSE[Math.floor(i / 6) % 4])
    B.gold.add(place(I, (x0 + x1) / 2, 1.9, (z0 + z1) / 2, L + 0.05, 0.12, 0.4, 0, ry))
  }

  // ---- 球门：两端各三个 ----
  const goldM = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.9, roughness: 0.22, emissive: 0x3a2500 })
  const hoopGeo = new THREE.TorusGeometry(4, 0.32, 14, 56), innerGeo = new THREE.TorusGeometry(3.55, 0.07, 8, 56)
  const hoops = []
  for (const side of [-1, 1]) for (const [dz, h] of [[-14, 30], [0, 40], [14, 30]]) {
    const x = side * 80
    B.plank.add(place(I, x, 1.2, dz, 2.4, 2.4, 2.4, 0, Math.PI / 4))
    B.gold.add(place(I, x, 2.5, dz, 1.6, 0.3, 1.6, 0, Math.PI / 4))
    B.gold.add(beam(I, V(x, 2.5, dz), V(x, h, dz), 0.42))
    for (let k = 1; k < 4; k++) B.ball.add(place(I, x, h * k / 4, dz, 0.9, 0.5, 0.9))
    const hoop = new THREE.Mesh(hoopGeo, goldM); hoop.position.set(x, h + 4, dz); hoop.rotation.y = Math.PI / 2; hoop.castShadow = true
    const inner = new THREE.Mesh(innerGeo, goldM); hoop.add(inner)
    pitch.add(hoop)
    hoops.push({ mesh: hoop, world: V(P.x + x, ground + h + 4, P.z + dz), cd: 0 })
    grid.add({ k: 0, x: P.x + x, z: P.z + dz, r: .6, y0: ground, y1: ground + h - .3 })
  }

  for (const k in B) B[k].build(pitch, k !== 'crowd')
  return { group: pitch, hoops, update(t) { pitchTime.value = t } }
}
