import * as THREE from 'three'
import { TILE } from './Sites.js'

// 小路：在城堡、球场之间"走"出来的土路。
// 寻路像行人一样：朝目的地走，但避开陡坡和水面，路线带一点随意的游移；再用 Chaikin 平滑成自然的弯道。
// 结果烘焙成一张"到最近小路的距离"贴图（按 TILE 平铺，与城堡群同周期），地形、草、花、树、石头都读它。
export const PATH_RES = 1024, PATH_MAX = 12
const R = PATH_RES, data = new Uint8Array(R * R).fill(255)
export const pathTex = new THREE.DataTexture(data, R, R, THREE.RedFormat, THREE.UnsignedByteType)
pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping
pathTex.magFilter = pathTex.minFilter = THREE.LinearFilter; pathTex.generateMipmaps = false
export const paths = []

// 花的种类与颜色（线性色），地形远景色点、近景花朵共用
export const FLOWER_GLSL = `
vec3 flowerPetal(int k){ return k == 0 ? vec3(.86, .86, .8) : k == 1 ? vec3(.95, .72, .06) : k == 2 ? vec3(.36, .22, .78) : k == 3 ? vec3(.95, .45, .62) : vec3(.86, .1, .05); }
vec3 flowerHeart(int k){ return k == 0 ? vec3(.95, .72, .08) : k == 1 ? vec3(.8, .38, .02) : k == 2 ? vec3(.92, .78, .12) : k == 3 ? vec3(.98, .9, .62) : vec3(.04, .03, .03); }
int flowerKind(vec2 xz){ return int(floor(vn(xz * .011 + 2.1) * 4.99)); }
float flowerDrift(vec2 xz){ return smoothstep(.5, .75, vn(xz * .028 + 5.3)); }
`

const NODES = { hog: [120, -380, 124], cat: [-60, 300, 94], fort: [470, 140, 86], ruin: [-540, -470, 54], spire: [-560, 330, 72], fort2: [720, -660, 86], pitch: [-260, -120, 150] }
const EDGES = [['hog', 'pitch'], ['hog', 'cat'], ['hog', 'fort'], ['pitch', 'cat'], ['cat', 'spire'], ['spire', 'ruin'], ['ruin', 'pitch'], ['fort', 'fort2'], ['hog', 'fort2'], ['cat', 'fort']]
const LANES = [['cat', 160, 760], ['spire', -900, 520], ['pitch', -640, 60], ['fort', 900, 380], ['hog', -60, -840], ['ruin', -820, -760]]   // 通往山野的小径

const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }

function route(a, b, H, rnd) {
  const STEP = 5, pts = [{ x: a.x, z: a.z }]
  let x = a.x, z = a.z, hd = Math.atan2(b.z - a.z, b.x - a.x), wander = 0
  for (let i = 0; i < 800; i++) {
    const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz)
    if (d < STEP * 1.5) break
    const goal = Math.atan2(dz, dx), h0 = H(x, z)
    wander = (wander + (rnd() - .5) * .32) * .93
    let best = null, bc = 1e9
    for (let k = -4; k <= 4; k++) {
      const a2 = hd + k * .16, nx = x + Math.cos(a2) * STEP, nz = z + Math.sin(a2) * STEP, h = H(nx, nz)
      const diff = Math.atan2(Math.sin(goal + wander - a2), Math.cos(goal + wander - a2)), slope = Math.abs(h - h0) / STEP
      const c = slope * slope * 40 + Math.abs(diff) * (d < 140 ? 5 : 1.3) + Math.abs(k) * .12 + (h < 3.4 ? 40 : 0) + Math.max(0, h - 75) * .4
      if (c < bc) { bc = c; best = [a2, nx, nz] }
    }
    ;[hd, x, z] = best; pts.push({ x, z })
  }
  pts.push({ x: b.x, z: b.z }); return pts
}
function chaikin(p, n) {
  for (let k = 0; k < n; k++) {
    const q = [p[0]]
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push({ x: a.x * .75 + b.x * .25, z: a.z * .75 + b.z * .25 }, { x: a.x * .25 + b.x * .75, z: a.z * .25 + b.z * .75 }) }
    q.push(p[p.length - 1]); p = q
  }
  return p
}
function stamp(a, b) {
  const s = TILE / R, M = PATH_MAX, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-6
  const i0 = Math.floor((Math.min(a.x, b.x) - M) / s), i1 = Math.ceil((Math.max(a.x, b.x) + M) / s)
  const j0 = Math.floor((Math.min(a.z, b.z) - M) / s), j1 = Math.ceil((Math.max(a.z, b.z) + M) / s)
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = (i + .5) * s, pz = (j + .5) * s
    let t = ((px - a.x) * dx + (pz - a.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(px - a.x - dx * t, pz - a.z - dz * t); if (d >= M) continue
    const k = (((j % R) + R) % R) * R + ((i % R) + R) % R, v = Math.round(d / M * 255)
    if (v < data[k]) data[k] = v
  }
}
export function pathDist(x, z) {
  const s = TILE / R, i = ((Math.floor(x / s) % R) + R) % R, j = ((Math.floor(z / s) % R) + R) % R
  return data[j * R + i] / 255 * PATH_MAX
}
export function buildPaths(H) {
  if (paths.length) return
  const rnd = rng(2024), edge = (n, tx, tz) => { const [x, z, r] = NODES[n], d = Math.hypot(tx - x, tz - z); return { x: x + (tx - x) / d * r, z: z + (tz - z) / d * r } }
  for (const [a, b] of EDGES) { const A = NODES[a], B = NODES[b]; paths.push(chaikin(route(edge(a, B[0], B[1]), edge(b, A[0], A[1]), H, rnd), 2)) }
  for (const [a, x, z] of LANES) paths.push(chaikin(route(edge(a, x, z), { x, z }, H, rnd), 2))
  for (const p of paths) for (let i = 0; i < p.length - 1; i++) stamp(p[i], p[i + 1])
  pathTex.needsUpdate = true
}
