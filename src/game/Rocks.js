import * as THREE from 'three'
import { addSnow } from './EnvU.js'
import { Grid, addSource } from './Collide.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { siteClear } from './Sites.js'
import { pathDist } from './Paths.js'

// 长青苔的圆润石头：细分二十面体经 3D 噪声塑形（平底、压扁、圆润），平滑法线；
// 朝天的一面长青苔、侧面零星黄色地衣、贴地处偏暗；着色器里再加画笔色斑与云影，与地形、树木同一画法。
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }
function vn3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  let u = x - xi, v = y - yi, w = z - zi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w)
  const L = (a, b, t) => a + (b - a) * t, c = (i, j, k) => h3(xi + i, yi + j, zi + k)
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w)
}
const STONE0 = new THREE.Color('#7f7a70'), STONE1 = new THREE.Color('#aca596'), MOSS0 = new THREE.Color('#4c6b28'), MOSS1 = new THREE.Color('#88a548'), LICHEN = new THREE.Color('#c4b463')
const ss = THREE.MathUtils.smoothstep

function rockGeometry(seed) {
  const r = rng(seed)
  let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g)
  const p = g.attributes.position, v = new THREE.Vector3(), o = seed * 3.17, sq = .5 + r() * .35, st = .85 + r() * .5
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = vn3(v.x * 1.3 + o, v.y * 1.3, v.z * 1.3) * .6 + vn3(v.x * 3 + o, v.y * 3 - o, v.z * 3) * .28 + vn3(v.x * 7, v.y * 7 + o, v.z * 7) * .12
    v.multiplyScalar(.7 + n * .6); v.x *= st; v.y *= sq
    if (v.y < -.2) v.y = -.2 + (v.y + .2) * .3
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  const nrm = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), m = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n1 = vn3(v.x * 2.2 + o, v.y * 2.2, v.z * 2.2), n2 = vn3(v.x * 6 - o, v.y * 6, v.z * 6 + o)
    c.copy(STONE0).lerp(STONE1, n1 * .8 + n2 * .2)
    const moss = ss(nrm.getY(i) + (n1 - .5) * .8 + (n2 - .5) * .3, .2, .65)
    c.lerp(m.copy(MOSS0).lerp(MOSS1, n2), moss)
    if (moss < .3 && n2 > .72) c.lerp(LICHEN, (n2 - .72) * 2.5)
    c.multiplyScalar(THREE.MathUtils.lerp(.6, 1, ss(v.y, -.2, .15)))
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

const uTime = { value: 0 }
function rockMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 })
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
      #else
        vWPos = (modelMatrix * vec4(transformed, 1.)).xyz;
      #endif`)
    sh.fragmentShader = `uniform float uTime; varying vec3 vWPos;
      float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float dab = vn(vWPos.xz * 1.1 + vWPos.y * .9) * .6 + vn(vWPos.xz * 3.1 - vWPos.y * 2.3) * .4;
      diffuseColor.rgb *= .84 + dab * .32;
      vec2 cp = (vWPos.xz + uTime * vec2(9., 3.)) * .0035;
      diffuseColor.rgb *= 1. - .42 * smoothstep(.5, .6, vn(cp) * .7 + vn(cp * 2.7 + .19) * .3);`)
  }
  return m
}

export function createRocks(scene, heightAt, origin, S = 1400) {
  const kinds = [1, 2, 3, 4, 5, 6].map(rockGeometry), mat = addSnow(rockMaterial()), r = rng(99), data = []
  for (let c = 0; c < 80; c++) {                       // 成组的大石头，周围散落小石块
    const cx = r() * S, cz = r() * S, big = 2.2 + r() * 3; data.push({ bx: cx, bz: cz, s: big })
    const m = 2 + Math.floor(r() * 4)
    for (let i = 0; i < m; i++) { const a = r() * 6.28, d = big * (.9 + r() * 1.4); data.push({ bx: (cx + Math.cos(a) * d + S) % S, bz: (cz + Math.sin(a) * d + S) % S, s: .45 + r() * 1.1 }) }
  }
  for (let i = 0; i < 160; i++) data.push({ bx: r() * S, bz: r() * S, s: .35 + r() * 1.2 })
  data.forEach(d => { d.k = Math.floor(r() * kinds.length); d.ry = r() * 6.28; d.tx = (r() - .5) * .35; d.tz = (r() - .5) * .35; d.sy = .8 + r() * .35; d.tint = new THREE.Color().setHSL(.1, .06, .8 + r() * .2) })
  const meshes = kinds.map((g, k) => {
    const im = new THREE.InstancedMesh(g, mat, Math.max(1, data.filter(d => d.k === k).length))
    im.setColorAt(0, new THREE.Color(1, 1, 1)); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); return im
  })
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3()
  const wrap = (b, p) => b + Math.floor((p - b + S / 2) / S) * S
  const grid = new Grid(16); addSource(grid)
  return {
    relayout(p) {
      const n = kinds.map(() => 0); grid.clear()
      for (const d of data) {
        const x = wrap(d.bx, p.x), z = wrap(d.bz, p.z)
        if (!siteClear(x, z, 4) || pathDist(x, z) < 2.6 || Math.hypot((x - origin.pitch.x) / 140, (z - origin.pitch.z) / 85) < 1.05) continue
        const h = heightAt(x, z), im = meshes[d.k]
        m4.compose(v.set(x, h - .22 * d.s, z), q.setFromEuler(e.set(d.tx, d.ry, d.tz)), s.set(d.s, d.s * d.sy, d.s))
        im.setMatrixAt(n[d.k], m4); im.setColorAt(n[d.k], d.tint); n[d.k]++
        if (d.s > .7) grid.add({ k: 0, x, z, r: d.s * 1.05, y0: h - 2, y1: h - .22 * d.s + d.s * d.sy * .75 })
      }
      meshes.forEach((im, k) => { im.count = n[k]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true })
    },
    update(t) { uTime.value = t }
  }
}
