import * as THREE from 'three'

// 角色与扫帚：全部由代码生成。4 个原创角色（男女各 2）× 3 种扫帚（仅外观不同）。
export const CHARACTERS = [
  { id: 'xiao', name: '林骁', gender: '男', desc: '沉稳的找球手 · 方框眼镜', skin: '#e9b48f', hair: '#2b1a10', style: 'messy', glasses: true, eyes: '#5a3a22', hat: '#2e3a6e', band: '#9a1d20',
    robe: '#1d1b25', lining: '#8c1d22', scarf: ['#9a1d20', '#d8a531'], trousers: '#34343c', height: 1, build: 1 },
  { id: 'ari', name: '阿瑞', gender: '男', desc: '高大的击球手 · 寸头短须', skin: '#8a5434', hair: '#120d0b', style: 'buzz', beard: true, eyes: '#2a1a10', hat: '#2c4a36', band: '#b9bcc2', hatTilt: -.06,
    robe: '#1b2620', lining: '#1f5a33', scarf: ['#1f5a33', '#b9bcc2'], trousers: '#2c2f2c', height: 1.07, build: 1.16 },
  { id: 'lin', name: '苏琳', gender: '女', desc: '温柔的追球手 · 黑长直发', skin: '#f0bf9f', hair: '#1d1622', style: 'long', bangs: true, eyes: '#4a3458', hat: '#33468c', band: '#c9a25a', star: true,
    robe: '#1b2136', lining: '#1f3f80', scarf: ['#1f3f80', '#b8874a'], trousers: '#2a2d3a', height: .95, build: .86 },
  { id: 'ella', name: '艾拉', gender: '女', desc: '活泼的守门员 · 红色马尾', skin: '#f2c2a2', hair: '#b2512a', style: 'ponytail', freckles: true, eyes: '#3f7d58', hat: '#6a2a58', band: '#d4a72c', star: true, hatTilt: .14,
    robe: '#2b251a', lining: '#d4a72c', scarf: ['#d4a72c', '#1c1c1c'], trousers: '#3a3326', height: .97, build: .9 }
]
export const BROOMS = [
  { id: 'classic', name: '经典橡木', desc: '温润木纹 · 金色箍环', wood: '#6a3d1c', metal: '#d9a840', twig: [.08, .5, .36], spread: .2, len: 1, curve: .13, count: 220 },
  { id: 'racer', name: '流星竞速', desc: '黑漆流线 · 银色尾翼', wood: '#3a1418', lacquer: true, metal: '#cfd3dc', twig: [.07, .28, .24], spread: .09, len: 1.18, curve: .03, count: 260, fins: true },
  { id: 'antique', name: '古藤老帚', desc: '虬结老枝 · 铜饰蓬尾', wood: '#9c7a50', metal: '#b8683a', twig: [.1, .42, .44], spread: .34, len: .9, curve: .24, count: 200, knots: true }
]
export const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0]
export const broomById = id => BROOMS.find(b => b.id === id) || BROOMS[0]

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const UP = V(0, 1, 0)
const texCache = {}
function woodTexture(base, lacquer) {
  const key = base + lacquer; if (texCache[key]) return texCache[key]
  const c = document.createElement('canvas'); c.width = 512; c.height = 64
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 512, 64)
  const col = new THREE.Color(base), hsl = {}; col.getHSL(hsl)
  for (let i = 0; i < (lacquer ? 30 : 90); i++) {
    const y = Math.random() * 64, l = hsl.l * 100 * (.6 + Math.random() * .8)
    g.strokeStyle = `hsla(${hsl.h * 360 + Math.random() * 10 - 5},${hsl.s * 100}%,${l}%,${lacquer ? .2 : .25 + Math.random() * .4})`
    g.lineWidth = .5 + Math.random() * 1.8; g.beginPath(); g.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * .02 + i) * 1.5)
    g.stroke()
  }
  if (lacquer) { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(.3, 'rgba(255,255,255,0)'); gr.addColorStop(.45, 'rgba(255,255,255,.25)'); gr.addColorStop(.6, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 64) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(3, 1)
  return (texCache[key] = t)
}
function ik(S, H, l1, l2, pole, mid, end) {
  const d = H.clone().sub(S), len = Math.min(Math.max(d.length(), 1e-3), (l1 + l2) * .999); d.normalize()
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0))
  const pp = pole.clone().addScaledVector(d, -pole.dot(d)).normalize()
  mid.copy(S).addScaledVector(d, a).addScaledVector(pp, h); end.copy(S).addScaledVector(d, len)
}
const _d = V()
function seg(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(.5)
  _d.copy(b).sub(a); const L = _d.length(); _d.divideScalar(L || 1)
  mesh.quaternion.setFromUnitVectors(UP, _d)
  if (mesh.userData.stretch) mesh.scale.y = L
}
const _w = V(), _qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
function segBase(mesh, a, b) {
  _d.copy(b).sub(a); const L = _d.length(); _d.divideScalar(L || 1)
  mesh.position.copy(a); mesh.quaternion.setFromUnitVectors(UP, _d); mesh.scale.y = L
}
function cloth(geo, sag, lift) {
  const base = geo.attributes.position.array.slice(), len = geo.parameters.height
  return (t, amp, freq, sideAmp) => {
    const p = geo.attributes.position.array
    for (let i = 0; i < p.length; i += 3) {
      const bx = base[i], by = base[i + 1], bz = base[i + 2], d = -by / len
      p[i] = bx + Math.sin(t * freq * .7 + d * 5 + bx) * sideAmp * d
      p[i + 2] = bz + lift * d + d * d * sag + Math.sin(t * freq + d * 6.5 + bx * 3) * amp * d + Math.sin(t * freq * 1.7 + d * 13 - bx * 2) * amp * .3 * d
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals()
  }
}

export function createWizard(opts = {}) {
  const C = charById(opts.char), B = broomById(opts.broom)
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig)
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .75, ...o })
  const mats = {
    skin: M(C.skin, { roughness: .7, emissive: new THREE.Color(C.skin).lerp(new THREE.Color('#ff8f70'), .35).multiplyScalar(.13) }),
    glove: M('#5b3a25', { roughness: .62 }), sweater: M(C.lining, { roughness: .95 }), shirt: M('#f1ece2', { roughness: .8 }), robe: M(C.robe, { roughness: .9 }), lining: M(C.lining, { roughness: .8, side: THREE.BackSide }),
    trousers: M(C.trousers), boot: M(0x24170e, { roughness: .5 }), hair: M(C.hair, { roughness: .9 }),
    metal: M(B.metal, { metalness: .9, roughness: .3 }), dark: M(0x141414, { metalness: .5, roughness: .35 }),
    cord: M(0x3a2414, { roughness: 1 }), eye: M(0x1a1410, { roughness: .3 }), white: M(0xf4efe8, { roughness: .4 })
  }
  const add = (geo, mat, parent = rig, pos, rot, scl) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true
    if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scl) m.scale.set(...scl)
    parent.add(m); return m
  }

  // ================= 扫帚 =================
  const broom = new THREE.Group(); rig.add(broom)
  const cv = B.curve, kn = B.knots ? .03 : 0
  const handleCurve = new THREE.CatmullRomCurve3([V(0, cv, -2.25), V(kn, cv * .4, -1.9), V(-kn, 0, -1.2), V(kn, -.005, -.4), V(0, -.005, 0), V(0, -.02, .98)])
  const SEG = 64, RAD = 10, hg = new THREE.TubeGeometry(handleCurve, SEG, B.lacquer ? .045 : .05, RAD)
  { const p = hg.attributes.position, c = V(), v = V()
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG; handleCurve.getPointAt(t, c)
      let k = (B.lacquer ? .7 : .55) + (B.lacquer ? .3 : .45) * Math.pow(t, .7)
      if (B.knots) k *= 1 + .18 * Math.max(0, Math.sin(t * 37)) ** 6
      for (let j = 0; j <= RAD; j++) { const idx = i * (RAD + 1) + j; v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c); p.setXYZ(idx, v.x, v.y, v.z) }
    }
    hg.computeVertexNormals() }
  add(hg, M(0xffffff, { map: woodTexture(B.wood, B.lacquer), roughness: B.lacquer ? .22 : .5, metalness: B.lacquer ? .1 : 0 }), broom)
  add(new THREE.SphereGeometry(B.lacquer ? .028 : .034, 12, 10), mats.metal, broom, [0, cv, -2.25])
  for (const z of [-2.12, .72, .8, .88]) add(new THREE.TorusGeometry(z < 0 ? .03 : .056, .011, 8, 24), mats.metal, broom, [0, z < 0 ? cv * .9 : -.018, z])
  if (B.lacquer) for (const z of [-1.5, -.9]) add(new THREE.TorusGeometry(.04, .006, 6, 20), mats.metal, broom, [0, handleCurve.getPointAt((z + 2.25) / 3.23).y, z])
  if (B.knots) for (const t of [.18, .42, .63]) { const q = handleCurve.getPointAt(t); add(new THREE.SphereGeometry(.045, 8, 6), M(B.wood, { roughness: .8 }), broom, [q.x + .03, q.y + .02, q.z], null, [1, .7, 1.3]) }
  // 扫帚尾
  const core = new THREE.LatheGeometry([[.055, 0], [.11, .25], [.18, .62], [.2, .9], [.12, 1.04], [0, 1.07]].map(([r, y]) => new THREE.Vector2(r * (1 + B.spread), y * B.len)), 16)
  core.rotateX(Math.PI / 2)
  const tc = new THREE.Color().setHSL(B.twig[0], B.twig[1], B.twig[2] * .8)
  add(core, M(tc, { roughness: 1 }), broom, [0, -.02, .92])
  for (const z of [.98, 1.07]) add(new THREE.TorusGeometry(.075 + (z - .98) * .5, .013, 6, 24), B.lacquer ? mats.metal : mats.cord, broom, [0, -.02, z])
  const bristles = new THREE.Group(); bristles.position.set(0, -.02, .93); broom.add(bristles)
  const twigG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, .012, .5 * B.len), V(0, -.015, 1.05 * B.len)]), 6, .009, 3)
  const NT = B.count, twigs = new THREE.InstancedMesh(twigG, M(0xffffff, { roughness: .9 }), NT); twigs.castShadow = true
  { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color()
    for (let i = 0; i < NT; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()), s = r * B.spread + Math.random() * .04
      e.set(-Math.sin(a) * s, Math.cos(a) * s, B.knots ? (Math.random() - .5) * .3 : 0); q.setFromEuler(e)
      m4.compose(V(Math.cos(a) * r * .05, Math.sin(a) * r * .05, 0), q, V(1, 1, .85 + Math.random() * .3))
      twigs.setMatrixAt(i, m4); twigs.setColorAt(i, c.setHSL(B.twig[0] + Math.random() * .03, B.twig[1] + Math.random() * .15, B.twig[2] * (.75 + Math.random() * .5)))
    } }
  bristles.add(twigs)
  if (B.fins) for (const s of [-1, 1]) {   // 竞速扫帚的银色尾翼
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(.34, .1); sh.lineTo(.3, .34); sh.lineTo(0, .05)
    const f = add(new THREE.ShapeGeometry(sh), M(B.metal, { metalness: .9, roughness: .25, side: THREE.DoubleSide }), broom, [0, .02, .62], [0, -Math.PI / 2, 0])
    f.rotation.z = s * .55
  }
  const rodG = new THREE.CylinderGeometry(.008, .008, 1, 6), stir = []
  for (const s of [-1, 1]) {
    const rod = add(rodG, mats.metal, broom); rod.userData.stretch = true; seg(rod, V(s * .03, -.03, .45), V(s * .16, -.34, .45))
    add(new THREE.CylinderGeometry(.01, .01, .1, 6), mats.metal, broom, [s * .18, -.345, .45], [0, 0, Math.PI / 2])
    stir.push(V(s * .17, -.29, .43))
  }

  // ================= 骑手 =================
  const bw = C.build
  add(new THREE.SphereGeometry(1, 16, 12), mats.robe, rig, [0, .13, .28], null, [.2 * bw, .12, .19])
  const torso = new THREE.Group(); torso.position.set(0, .14, .27); rig.add(torso)
  const fem = C.gender === '女'
  const prof = fem ? [[.27, -.14], [.25, .05], [.2, .28], [.19, .45], [.2, .6], [.15, .72], [.065, .8], [0, .81]] : [[.27, -.14], [.26, .05], [.23, .3], [.22, .5], [.21, .63], [.16, .73], [.07, .8], [0, .81]]
  add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20), mats.robe, torso, null, null, [1.12 * bw, 1, .8 * Math.sqrt(bw)])
  add(new THREE.SphereGeometry(1, 14, 10), mats.robe, torso, [0, .74, .13], null, [.16 * bw, .08, .1])
  { const pr = prof.filter(([, y]) => y > .05 && y < .76).map(([r, y]) => new THREE.Vector2(r * 1.012, y))
    const vest = add(new THREE.LatheGeometry(pr, 12, Math.PI - .46, .92), mats.sweater, torso, null, null, [1.12 * bw, 1, .8 * Math.sqrt(bw)])
    for (const sd of [-1, 1]) {   // 长袍前襟的翻边
      const lp = add(new THREE.LatheGeometry(pr, 3, sd < 0 ? Math.PI - .56 : Math.PI + .46, .1), M(new THREE.Color(C.robe).multiplyScalar(1.6), { roughness: .9 }), torso, null, null, [1.125 * bw, 1, .805 * Math.sqrt(bw)])
    }
    for (const sd of [-1, 1]) { const c = add(new THREE.ConeGeometry(.035, .07, 3), mats.shirt, torso, [sd * .045, .7, -.15], [-.35, 0, sd * 2.3]) }
    for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(.011, 8, 6), mats.metal, torso, [0, .58 - k * .11, -.168 - k * .004 + (k === 2 ? .006 : 0)])
  }
  const scarfC = C.scarf.map(c => new THREE.Color(c))
  add(new THREE.TorusGeometry(.1, .045, 8, 20), M(scarfC[0], { roughness: .85 }), torso, [0, .79, -.01], [Math.PI / 2, 0, 0], [1, 1.1, 1])
  const scarfMat = M(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: .9 })
  const scarves = [.05, -.04].map((x, k) => {
    const g = new THREE.PlaneGeometry(.1, .8 - k * .15, 1, 16); g.translate(0, -g.parameters.height / 2, 0)
    const col = new Float32Array(g.attributes.position.count * 3), cr = scarfC[0].clone().convertSRGBToLinear(), cg = scarfC[1].clone().convertSRGBToLinear()
    for (let i = 0; i < g.attributes.position.count; i++) { const d = -g.attributes.position.getY(i) / .8, c = Math.floor(d * 8) % 2 ? cg : cr; col.set([c.r, c.g, c.b], i * 3) }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return { mesh: add(g, scarfMat, torso, [x, .78, .09]), wave: cloth(g, .05, .02) }
  })
  const capeG = new THREE.PlaneGeometry(.85 * bw, 1.5, 10, 20); capeG.translate(0, -.75, 0)
  { const p = capeG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), d = -p.getY(i) / 1.5; p.setX(i, x * (.55 + .6 * d)); p.setZ(i, x * x * .9 + .03 + Math.sin(x * 22) * .022 * (.3 + d) - (1 - d) * Math.abs(x) * .08) } capeG.computeVertexNormals() }
  const capeWave = cloth(capeG, .12, .08)
  const cape = new THREE.Group(); cape.position.set(0, .7, .1); torso.add(cape)
  add(capeG, M(C.robe, { roughness: .9 }), cape); add(capeG, mats.lining, cape)

  // ---- 头部：圆润的脸、带高光的大眼睛、各自的发型，戴巫师帽 ----
  const LERP = THREE.MathUtils.lerp
  const head = new THREE.Group(); head.position.set(0, .82, -.02); torso.add(head)
  add(new THREE.CylinderGeometry(fem ? .047 : .062, fem ? .054 : .068, .12, 12), mats.skin, head, [0, .03, 0])
  const skull = new THREE.Group(); skull.position.set(0, .17, -.02); head.add(skull)
  const HR = .165, SX = fem ? .95 : .97, SY = fem ? 1.02 : 1.04, FZ = fem ? .97 : 1
  const TX = fem ? .3 : .17, TZ = fem ? .14 : .1                 // 下半张脸收窄的程度
  const taperX = y => { const t = Math.max(0, -y / (HR * SY)); return 1 - TX * t * t }, taperZ = y => { const t = Math.max(0, -y / (HR * SY)); return 1 - TZ * t * t }
  { const g = new THREE.SphereGeometry(HR, 36, 28); g.scale(SX, SY, FZ); const pa = g.attributes.position
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setX(i, pa.getX(i) * taperX(y)); pa.setZ(i, pa.getZ(i) * taperZ(y)); if (!fem && y < -HR * .78) pa.setY(i, -HR * .78 + (y + HR * .78) * .4) }
    g.computeVertexNormals(); const m = add(g, mats.skin, skull); m.userData.face = true }
  const mesh = (geo, mat, scl) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; if (scl) m.scale.set(...scl); return m }
  const NZ = V(0, 0, -1), _n = V()
  // 贴在脸上的部件：放在脸面上，朝外
  const place = (obj, x, y, out = 0) => {
    const xu = x / taperX(y), z = -Math.sqrt(Math.max(HR * HR - (xu / SX) ** 2 - (y / SY) ** 2, 1e-4)) * FZ * taperZ(y)
    _n.set(xu / SX, y / SY, z / FZ).normalize()
    obj.position.set(x, y, z).addScaledVector(_n, out); obj.quaternion.setFromUnitVectors(NZ, _n)
    skull.add(obj); return obj
  }
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(.036, 12, 9), mats.skin, skull, [s * .154, -.005, .005], null, [.45, 1, .75])

  // 眼睛：眼白 + 彩色虹膜 + 瞳孔 + 高光；女生眼睛更大、有睫毛和细弯眉
  const ER = fem ? .026 : .022
  const scleraM = M('#fffdf8', { roughness: .35, emissive: new THREE.Color('#fffdf8').multiplyScalar(.25) }), irisM = M(C.eyes || '#3a2a20', { roughness: .25 }), pupilM = M('#0b080a', { roughness: .2 })
  const shineM = new THREE.MeshBasicMaterial({ color: 0xffffff }), lashM = M('#140e12', { roughness: .7 }), browM = M(C.hair, { roughness: .9 })
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); place(eye, s * (fem ? .058 : .056), fem ? .008 : .014, -.002)
    eye.add(mesh(new THREE.SphereGeometry(ER, 18, 14), scleraM, [1.05, fem ? .9 : .76, .42]))
    const ir = mesh(new THREE.SphereGeometry(ER * .8, 16, 12), irisM, [1, 1.1, .38]); ir.position.set(-s * ER * .04, -ER * .02, -ER * .3); eye.add(ir)
    const pu = mesh(new THREE.SphereGeometry(ER * .4, 12, 10), pupilM, [1, 1.1, .38]); pu.position.set(-s * ER * .04, -ER * .02, -ER * .41); eye.add(pu)
    const hl = mesh(new THREE.SphereGeometry(ER * .15, 8, 6), shineM); hl.position.set(ER * .22, ER * .3, -ER * .5); eye.add(hl)
    const hl2 = mesh(new THREE.SphereGeometry(ER * .07, 6, 5), shineM); hl2.position.set(-ER * .2, -ER * .25, -ER * .48); eye.add(hl2)
    // 上眼睑：肤色的半球盖住眼睛上缘，眼神更柔和；下面一条眼线（女生粗一些，外眼角微微上挑）
    const lidG = new THREE.SphereGeometry(ER * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI * .5); const lidM = mesh(lidG, mats.skin, [1.16, fem ? .4 : .5, .5]); lidM.position.set(0, ER * (fem ? .52 : .38), -ER * .02); eye.add(lidM)
    const line = mesh(new THREE.TorusGeometry(ER * 1.14, fem ? .0042 : .003, 5, 20, Math.PI * .92), lashM, [1, fem ? .62 : .55, 1]); line.position.set(0, ER * (fem ? .42 : .32), -ER * .3); line.rotation.z = Math.PI * .04 - s * (fem ? .12 : .04); eye.add(line)
    if (fem) {
      const wing = mesh(new THREE.ConeGeometry(.0034, .012, 5), lashM); wing.position.set(s * ER * 1.12, ER * .62, -ER * .3); wing.rotation.z = -s * 1.05; eye.add(wing)
      const b = mesh(new THREE.TorusGeometry(ER * 2.3, .0032, 4, 16, Math.PI * .4), browM); b.position.set(s * ER * .1, ER * 1.75 - ER * 2.3, -ER * .1); b.rotation.z = Math.PI * .3 - s * .07; eye.add(b)
    } else {
      const b = mesh(new THREE.BoxGeometry(ER * 2.3, C.beard ? .014 : .011, .012), browM); b.position.set(s * ER * .1, ER * 1.75, -ER * .15); b.rotation.z = -s * .09; eye.add(b)
    }
  }
  if (fem) {   // 腮红
    const bc = new THREE.Color(C.skin).lerp(new THREE.Color('#ff8a90'), .3), bl = M(bc, { roughness: .9, emissive: bc.clone().multiplyScalar(.16) })
    for (const s of [-1, 1]) place(mesh(new THREE.SphereGeometry(.019, 12, 8), bl, [1.3, .62, .22]), s * .078, -.03, -.0035)
  }
  if (C.freckles) { const fm = M(new THREE.Color(C.skin).lerp(new THREE.Color('#a8603e'), .55)); for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1; place(mesh(new THREE.SphereGeometry(.0026, 5, 4), fm, [1, 1, .4]), s * (.045 + Math.random() * .04), -.02 - Math.random() * .018, -.0012) } }
  // 鼻子、嘴
  if (fem) place(mesh(new THREE.SphereGeometry(.0062, 10, 8), mats.skin, [1.2, .75, .7]), 0, -.034, -.001)
  else { const ng = new THREE.SphereGeometry(.014, 12, 10); ng.scale(.9, 1.1, 1.15); place(mesh(ng, mats.skin), 0, -.028, -.002) }
  if (fem) { const sm = place(new THREE.Group(), 0, -.064, -.001), lip = mesh(new THREE.TorusGeometry(.0145, .0036, 6, 18, Math.PI * .62), M('#cc6070', { roughness: .45, emissive: new THREE.Color('#cc6070').multiplyScalar(.2) })); lip.rotation.z = Math.PI * 1.19; sm.add(lip) }
  else { const sm = place(new THREE.Group(), 0, -.066, -.001), lip = mesh(new THREE.TorusGeometry(.018, .0032, 6, 18, Math.PI * .5), M(new THREE.Color(C.skin).multiplyScalar(.6))); lip.rotation.z = Math.PI * 1.25; sm.add(lip) }
  if (C.beard) {
    const bm = M(new THREE.Color(C.hair).lerp(new THREE.Color(C.skin), .28), { roughness: 1 })
    const bg = new THREE.SphereGeometry(HR + .004, 36, 14, Math.PI * 1.5 - 1.5, 3, Math.PI * .62, Math.PI * .3); bg.scale(SX, SY, FZ)
    { const pa = bg.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setX(i, pa.getX(i) * taperX(y)); pa.setZ(i, pa.getZ(i) * taperZ(y)); if (y < -HR * .78) pa.setY(i, -HR * .78 + (y + HR * .78) * .4) } bg.computeVertexNormals() }
    skull.add(mesh(bg, bm))
    for (const s of [-1, 1]) { const ms = place(mesh(new THREE.CapsuleGeometry(.0055, .022, 3, 6), bm), s * .015, -.051, .001); ms.rotateZ(Math.PI / 2 + s * .25) }
  }
  if (C.glasses) {   // 方框眼镜
    const gm = M('#2a2420', { metalness: .6, roughness: .35 })
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(.036, .0032, 6, 24), gm, skull, [s * .057, .013, -.172], null, [1.2, .9, 1])
      add(new THREE.BoxGeometry(.0035, .0035, .15), gm, skull, [s * .128, .02, -.1], [0, s * .22, 0])
    }
    add(new THREE.BoxGeometry(.024, .0035, .0035), gm, skull, [0, .02, -.18])
  }

  // ---- 发型 ----
  const hairM = mats.hair, sway = []
  const cap = (r, P, tilt, scl = [1, 1, 1.03]) => add(new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, Math.PI * P), hairM, skull, [0, .008, .01], [tilt, 0, 0], scl)
  // 发帘：贴着额头的一片头发，下缘带细碎的发丝起伏；sweep 让刘海斜向一侧
  const fringe = (arc, depth, sweep) => {
    const r = HR + .013, g = new THREE.SphereGeometry(r, 56, 14, Math.PI * 1.5 - arc / 2, arc, 0, Math.PI * depth), pa = g.attributes.position
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), th = Math.acos(Math.max(-1, Math.min(1, y / r)))
      if (th > Math.PI * depth * .72) pa.setY(i, y - .007 * (.5 + .5 * Math.sin(Math.atan2(z, x) * 26)) * (th / (Math.PI * depth)))
    }
    g.scale(SX, SY, FZ); g.computeVertexNormals()
    const grp = new THREE.Group(); grp.rotation.z = sweep; skull.add(grp); grp.add(mesh(g, hairM))
  }
  const lock = (x, y, len, rz, w = .03) => { const m = place(mesh(new THREE.SphereGeometry(1, 12, 10), hairM, [w, len, .016]), x, y, .007); m.rotateZ(rz); return m }
  if (C.style === 'messy') {
    cap(.178, .52, .55)
    for (let i = 0; i < 16; i++) {          // 乱翘的发梢，从帽檐下露出来
      const az = (i / 16) * Math.PI * 2, el = .15 + Math.random() * .55
      if (Math.cos(az) < -.55) continue     // 脸的正前方不长
      const d = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
      const c = mesh(new THREE.ConeGeometry(.034, .085, 6), hairM); c.position.copy(d).multiplyScalar(.172).add(V(0, .01, .01))
      c.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().add(V(0, -.35, .2)).normalize()); skull.add(c)
    }
    for (let i = -2; i <= 2; i++) lock(i * .032, .094, .034, i * .18 + (Math.random() - .5) * .2, .026)
  } else if (C.style === 'buzz') {
    cap(.171, .5, .55, [1, 1, 1.02])
  } else if (C.style === 'long') {      // 黑长直：齐刘海 + 一圈垂到肩膀的发束，遮住耳朵
    cap(.18, .55, .55)
    fringe(3.6, .4, 0)
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - .5) * 3.7, len = .42 - Math.abs(a) * .045
      const g = new THREE.Group(); g.position.set(Math.sin(a) * .158, .03, .015 + Math.cos(a) * .14); g.rotation.y = a; skull.add(g)
      const cg = new THREE.CapsuleGeometry(.043, len, 4, 10); cg.translate(0, -len / 2 - .02, 0)
      g.add(mesh(cg, hairM, [1, 1, .55])); sway.push({ g, a })
    }
  } else {                              // 马尾：斜刘海 + 发圈 + 渐细的马尾 + 两侧碎发
    cap(.178, .53, .6)
    fringe(3.4, .39, .14)
    for (const s of [-1, 1]) { const m = place(mesh(new THREE.SphereGeometry(1, 10, 8), hairM, [.011, .05, .009]), s * .128, .01, .004); m.rotateZ(s * .1) }
    add(new THREE.TorusGeometry(.028, .011, 8, 16), M('#2a6fb0', { roughness: .5 }), skull, [0, .03, .168], [.3, 0, 0])
    const tailRoot = new THREE.Group(); tailRoot.position.set(0, .03, .176); skull.add(tailRoot); let par = tailRoot
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group(); g.position.set(0, i ? -.075 : 0, 0); par.add(g); par = g
      const m = mesh(new THREE.SphereGeometry(.048 - i * .007, 12, 10), hairM, [1, 1.75, .9]); m.position.y = -.04; g.add(m)
      sway.push({ g, i, tail: true })
    }
  }
  const hairSway = sway.length ? (t, sp, hv) => sway.forEach((o, k) => {
    if (o.tail) o.g.rotation.set((o.i ? .3 : 1) * LERP(-(.7 + sp * .5), .1, hv) + Math.sin(t * 5 - o.i) * .07, 0, Math.sin(t * 3.3 - o.i * .7) * .1)
    else o.g.rotation.set(LERP(-(.25 + sp * .6), -.04, hv) + Math.sin(t * 4 + k) * .04, o.a, Math.sin(t * 3 + k) * .02)
  }) : null

  // ---- 巫师帽：微翘的宽帽檐、分三节可弯折的尖顶（随风向后飘）、帽带和饰扣 ----
  const hatM = M(C.hat || '#222', { roughness: .8, side: THREE.DoubleSide, emissive: new THREE.Color(C.hat || '#222').multiplyScalar(.12) }), bandM = M(C.band || '#999', { roughness: .55, side: THREE.DoubleSide })
  const hat = new THREE.Group(); hat.position.set(0, .11, .018); hat.rotation.set(.2, 0, C.hatTilt || 0); skull.add(hat)
  hat.add(mesh(new THREE.LatheGeometry([[.13, .012], [.19, .004], [.232, .006], [.258, .024], [.262, .016], [.232, -.006], [.19, -.009], [.13, -.004]].map(([r, y]) => new THREE.Vector2(r, y)), 40), hatM))
  const inner = mesh(new THREE.CircleGeometry(.15, 24), M(new THREE.Color(C.hat || '#222').multiplyScalar(.5), { side: THREE.DoubleSide })); inner.rotation.x = Math.PI / 2; inner.position.y = .003; hat.add(inner)
  const hatSegs = []; let hp = hat, hy = 0
  for (const [rb, rt, h] of [[.15, .118, .15], [.118, .084, .14], [.084, .05, .13]]) {
    const g = new THREE.Group(); g.position.y = hy; hp.add(g)
    const cg = new THREE.CylinderGeometry(rt, rb, h, 24, 1, true); cg.translate(0, h / 2, 0); g.add(mesh(cg, hatM))
    const j = mesh(new THREE.SphereGeometry(rt, 18, 8), hatM, [1, .35, 1]); j.position.y = h; g.add(j)
    hatSegs.push(g); hp = g; hy = h
  }
  { const g = new THREE.Group(); g.position.y = hy; hp.add(g); const tg = new THREE.ConeGeometry(.05, .13, 20); tg.translate(0, .065, 0); g.add(mesh(tg, hatM)); hatSegs.push(g) }
  const bg = new THREE.CylinderGeometry(.1475, .1505, .036, 28, 1, true); bg.translate(0, .02, 0); hat.add(mesh(bg, bandM))
  const goldM = M('#e2b857', { metalness: .85, roughness: .3, side: THREE.DoubleSide })
  if (C.star) {
    const st = new THREE.Shape(); for (let k = 0; k < 10; k++) { const r = k % 2 ? .009 : .022, a = k / 10 * Math.PI * 2 + Math.PI / 2; k ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r) }
    const sm = mesh(new THREE.ShapeGeometry(st), goldM); sm.position.set(0, .021, -.153); hat.add(sm)
  } else { const bk = mesh(new THREE.TorusGeometry(.019, .0045, 4, 4), goldM); bk.rotation.z = Math.PI / 4; bk.position.set(0, .02, -.153); hat.add(bk) }
  hat.traverse(o => { if (o.isMesh) o.castShadow = false })
  skull.traverse(o => { if (o.isMesh) o.receiveShadow = false })
  const hatSway = (t, sp, hv) => {
    const b = LERP(.14 + sp * .3, .06, hv), w = Math.sin(t * 2.6) * (.03 + sp * .05)
    hatSegs[1].rotation.set(b + w, 0, Math.sin(t * 1.7) * .03)
    hatSegs[2].rotation.set(b * 1.25 + w * 1.3, 0, Math.sin(t * 1.9 + .5) * .04)
    hatSegs[3].rotation.set(b * 1.5 + w * 1.6, 0, Math.sin(t * 2.1 + 1) * .05)
  }

  // ---- 四肢（IK） ----
  const limb = (r, l, mat) => add(new THREE.CapsuleGeometry(r, l, 4, 10), mat)
  const ar = fem ? .9 : 1
  const sleeve = () => { const g = new THREE.CylinderGeometry(.078 * ar * bw, .052 * ar * bw, 1, 14, 1, true); g.translate(0, .5, 0); const m = add(g, M(C.robe, { roughness: .9, side: THREE.DoubleSide })); m.userData.base = true; m.userData.stretch = true; return m }
  const glove = () => { const g = new THREE.Group(); rig.add(g); const pm = add(new THREE.SphereGeometry(.042 * ar, 12, 10), mats.glove, g, null, null, [1, .78, 1.25]); add(new THREE.SphereGeometry(.017 * ar, 8, 6), mats.glove, g, [.03, .012, .005], null, [1, 1, 1.5]); add(new THREE.TorusGeometry(.04 * ar, .012, 6, 14), mats.glove, g, [0, 0, -.04], null, [1, .85, 1]); return g }
  const arms = [-1, 1].map(s => ({ s, up: limb(.062 * ar * bw, .3, mats.robe), fo: sleeve(),
    hand: glove(),
    sh: V(s * .2 * bw, .68, -.02), target: V(s * .055, .06, s < 0 ? -.66 : -.5), pole: V(s, -.6, .4).normalize(),
    rest: V(s * .15, .2, -.22), restPole: V(s, -.2, .6).normalize() }))
  const legs = [-1, 1].map((s, k) => ({ s, th: limb(.07 * bw, .3, mats.trousers), sh: limb(.058, .3, mats.boot), foot: limb(.052, .12, mats.boot),
    hip: V(s * .12, .12, .3), target: stir[k], pole: V(s * .35, -.15, -1).normalize(), rest: V(s * .22, -.36, -.2), restPole: V(s * .2, .9, -1).normalize() }))
  const S = V(), E = V(), H = V(), T = V(), P = V()

  root.scale.setScalar(1.2 * C.height)
  const tailLocal = V(0, -.02, 1.95)
  return {
    root, char: C, broomStyle: B,
    tailWorld: () => rig.localToWorld(tailLocal.clone()),
    dispose() { root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }) },
    animate(t, speed, roll = 0, hover = 0) {
      const sp = THREE.MathUtils.clamp((speed - 20) / 55, 0, 1), hv = hover * hover * (3 - 2 * hover), L = THREE.MathUtils.lerp
      rig.position.y = Math.sin(t * 2.2) * .1 * (1 - hv) + Math.sin(t * 1.2) * .09 * hv
      rig.rotation.z = Math.sin(t * 1.3) * .025 + Math.sin(t * .8) * .03 * hv
      rig.rotation.x = Math.sin(t * 1.2 + 1) * .025 * hv
      torso.rotation.set(L(-.8 - sp * .12, -.35, hv) + Math.sin(t * 2.2 + .6) * .02, Math.sin(t * .4) * .08 * hv, -roll * .12)
      head.rotation.set(L(.85 + sp * .1, .28 + Math.sin(t * .3) * .08, hv), Math.sin(t * .37) * (.25 + .35 * hv) + roll * .3, Math.sin(t * .5) * .05)
      torso.updateMatrix()
      for (const a of arms) {
        S.copy(a.sh).applyMatrix4(torso.matrix); T.copy(a.target).lerp(a.rest, hv); P.copy(a.pole).lerp(a.restPole, hv)
        ik(S, T, .36, .34, P, E, H); seg(a.up, S, E); _w.copy(H).sub(E).multiplyScalar(.9).add(E); segBase(a.fo, E, _w); a.hand.position.copy(H); a.hand.quaternion.copy(a.fo.quaternion).multiply(_qh)
      }
      for (const l of legs) {
        T.copy(l.target).lerp(l.rest, hv); T.z += Math.sin(t * 1.6 + l.s * 1.7) * .07 * hv; P.copy(l.pole).lerp(l.restPole, hv)
        ik(l.hip, T, .38, .36, P, E, H); seg(l.th, l.hip, E); seg(l.sh, E, H); seg(l.foot, H, V(H.x, H.y - .04, H.z - .15))
      }
      cape.rotation.x = L(-(.25 + sp * .5), .02, hv) + Math.sin(t * 3) * .03
      capeWave(t, (.06 + sp * .08) * (1 - .6 * hv), 7 + sp * 6 - 4 * hv, .03)
      scarves.forEach((s, i) => { s.mesh.rotation.x = L(-(.5 + sp * .6), .15, hv) + Math.sin(t * 5 + i) * .08; s.mesh.rotation.y = Math.sin(t * 3 + i * 2) * .2; s.wave(t + i, .08 + sp * .06, 11 + sp * 8, .05) })
      if (hairSway) hairSway(t, sp, hv)
      hatSway(t, sp, hv)
      bristles.rotation.set(Math.sin(t * 5.1) * .01, Math.sin(t * 6) * .02, 0)
    }
  }
}
