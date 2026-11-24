import * as THREE from 'three'

// 角色与扫帚：全部由代码生成。4 个原创角色（男女各 2）× 3 种扫帚（仅外观不同）。
export const CHARACTERS = [
  { id: 'xiao', name: '林骁', gender: '男', desc: '沉稳的找球手 · 方框眼镜', skin: '#f0c4a2', hair: '#2b1a10', style: 'messy', glasses: true,
    robe: '#1d1b25', lining: '#8c1d22', scarf: ['#9a1d20', '#d8a531'], trousers: '#34343c', height: 1, build: 1 },
  { id: 'ari', name: '阿瑞', gender: '男', desc: '高大的击球手 · 寸头短须', skin: '#8d5b3d', hair: '#120d0b', style: 'buzz', beard: true,
    robe: '#1b2620', lining: '#1f5a33', scarf: ['#1f5a33', '#b9bcc2'], trousers: '#2c2f2c', height: 1.07, build: 1.16 },
  { id: 'lin', name: '苏琳', gender: '女', desc: '冷静的追球手 · 黑长直发', skin: '#f3d3ba', hair: '#0f0c12', style: 'long', bangs: true,
    robe: '#1b2136', lining: '#1f3f80', scarf: ['#1f3f80', '#b8874a'], trousers: '#2a2d3a', height: .95, build: .86 },
  { id: 'ella', name: '艾拉', gender: '女', desc: '活泼的守门员 · 红色马尾', skin: '#f6d8c6', hair: '#a8431c', style: 'ponytail', freckles: true,
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
    skin: M(C.skin, { roughness: .6 }), robe: M(C.robe, { roughness: .9 }), lining: M(C.lining, { roughness: .8, side: THREE.BackSide }),
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
  { const p = capeG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), d = -p.getY(i) / 1.5; p.setX(i, x * (.55 + .6 * d)); p.setZ(i, x * x * .5 + .03) } }
  const capeWave = cloth(capeG, .12, .08)
  const cape = new THREE.Group(); cape.position.set(0, .7, .1); torso.add(cape)
  add(capeG, M(C.robe, { roughness: .9 }), cape); add(capeG, mats.lining, cape)

  // ---- 头部：每个角色的脸型、五官、发型都不同 ----
  const head = new THREE.Group(); head.position.set(0, .82, -.02); torso.add(head)
  add(new THREE.CylinderGeometry(.055 * (fem ? .9 : 1.1), .06, .12, 10), mats.skin, head, [0, .03, 0])
  const skull = new THREE.Group(); skull.position.set(0, .17, -.02); head.add(skull)
  const face = fem ? [.9, 1.04, .96] : C.beard ? [1, 1.02, 1] : [.95, 1.05, 1]
  add(new THREE.SphereGeometry(.17, 24, 18), mats.skin, skull, null, null, face)
  add(new THREE.SphereGeometry(.1, 14, 10), mats.skin, skull, [0, -.075, -.07], null, fem ? [.95, .8, 1] : [1.15, .85, 1.05])   // 下颌
  const nose = new THREE.ConeGeometry(fem ? .019 : .025, fem ? .045 : .062, 8); nose.rotateX(-Math.PI / 2)
  add(nose, mats.skin, skull, [0, -.015, -.185])
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(.04, 10, 8), mats.skin, skull, [s * .158, 0, 0], null, [.5, 1, .8])
    add(new THREE.SphereGeometry(.02, 10, 8), mats.white, skull, [s * .062, .025, -.152])
    add(new THREE.SphereGeometry(.012, 8, 6), mats.eye, skull, [s * .062, .025, -.168])
    add(new THREE.BoxGeometry(.055, fem ? .008 : .013, .012), mats.hair, skull, [s * .064, .062, -.158], [0, 0, s * (fem ? -.12 : .06)])
  }
  add(new THREE.BoxGeometry(.045, .01, .01), M(fem ? '#c25a62' : '#9a5a4a', { roughness: .5 }), skull, [0, -.085, -.163])
  if (C.glasses) {           // 方框眼镜
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(.046, .006, 6, 4), mats.dark, skull, [s * .064, .025, -.182], [0, 0, Math.PI / 4], [1.25, .9, 1])
      add(new THREE.BoxGeometry(.006, .006, .17), mats.dark, skull, [s * .14, .03, -.1], [0, s * .18, 0])
    }
    add(new THREE.BoxGeometry(.035, .006, .006), mats.dark, skull, [0, .03, -.186])
  }
  if (C.freckles) for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1; add(new THREE.SphereGeometry(.0045, 5, 4), M('#b06a48'), skull, [s * (.05 + Math.random() * .055), -.015 + Math.random() * .03, -.162 + Math.random() * .01]) }
  if (C.beard) add(new THREE.SphereGeometry(.1, 14, 10, 0, Math.PI * 2, Math.PI * .45, Math.PI * .55), mats.hair, skull, [0, -.055, -.055], [-.25, 0, 0], [1.2, .95, 1.1])
  // 发型
  const blobHair = (n, rad, minY, cutFront, scale) => {
    const hair = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.hair, n); hair.castShadow = true
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), d = V(); let i = 0, guard = 0
    while (i < n && guard++ < 5000) {
      d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); if (d.lengthSq() > 1) continue; d.normalize()
      if (d.y < minY || (d.z < -cutFront && d.y < .45)) continue
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3))
      m4.compose(d.clone().multiplyScalar(rad).add(V(0, .02, 0)), q, V().setScalar(scale * (.7 + Math.random() * .6))); hair.setMatrixAt(i++, m4)
    }
    skull.add(hair)
  }
  let hairSway = null
  if (C.style === 'messy') blobHair(80, .165, -.15, .35, .06)
  else if (C.style === 'buzz') add(new THREE.SphereGeometry(.177, 20, 14, 0, Math.PI * 2, 0, Math.PI * .5), M(C.hair, { roughness: 1 }), skull, [0, .012, .008], [-.2, 0, 0], [.97, 1.02, 1.02])
  else {
    add(new THREE.SphereGeometry(.183, 22, 16, 0, Math.PI * 2, 0, Math.PI * .56), mats.hair, skull, [0, .015, .012], [-.18, 0, 0], [.98, 1.04, 1.06])
    if (C.bangs) add(new THREE.SphereGeometry(.16, 16, 8, Math.PI * 1.15, Math.PI * .7, Math.PI * .2, Math.PI * .22), mats.hair, skull, [0, .03, -.02])
    if (C.style === 'long') {         // 长直发：从后脑垂下的发片，随风摆动
      const hg2 = new THREE.PlaneGeometry(.34, .62, 4, 10); hg2.translate(0, -.31, 0)
      { const p = hg2.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, x * x * 2.2) } }
      const hgr = new THREE.Group(); hgr.position.set(0, .06, .13); skull.add(hgr)
      add(hg2, M(C.hair, { roughness: .8, side: THREE.DoubleSide }), hgr)
      const wave = cloth(hg2, .06, .03)
      hairSway = (t, sp, hv) => { hgr.rotation.x = THREE.MathUtils.lerp(-(.9 + sp * .5), .1, hv) + Math.sin(t * 4) * .05; wave(t, .03 + sp * .03, 8 + sp * 5, .02) }
    } else {                          // 马尾：发圈 + 一串渐细的发束
      add(new THREE.TorusGeometry(.03, .012, 6, 14), M('#2a6fb0'), skull, [0, .07, .17])
      const tail = new THREE.Group(); tail.position.set(0, .07, .18); skull.add(tail); const segs = []
      let parent = tail
      for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.position.set(0, i ? -.09 : 0, 0); parent.add(g); add(new THREE.SphereGeometry(.05 - i * .009, 10, 8), mats.hair, g, [0, -.045, 0], null, [1, 1.6, 1]); segs.push(g); parent = g }
      hairSway = (t, sp, hv) => segs.forEach((g, i) => { g.rotation.x = THREE.MathUtils.lerp(-(.5 + sp * .35), .12, hv) * (i ? .5 : 1) + Math.sin(t * 5 - i) * .08; g.rotation.z = Math.sin(t * 3.3 - i * .7) * .12 })
    }
  }

  // ---- 四肢（IK） ----
  const limb = (r, l, mat) => add(new THREE.CapsuleGeometry(r, l, 4, 10), mat)
  const ar = fem ? .9 : 1
  const arms = [-1, 1].map(s => ({ s, up: limb(.062 * ar * bw, .3, mats.robe), fo: limb(.054 * ar * bw, .28, mats.robe),
    hand: add(new THREE.SphereGeometry(.052 * ar, 12, 10), mats.skin, rig, null, null, [1, .85, 1.25]),
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
        ik(S, T, .36, .34, P, E, H); seg(a.up, S, E); seg(a.fo, E, H); a.hand.position.copy(H)
      }
      for (const l of legs) {
        T.copy(l.target).lerp(l.rest, hv); T.z += Math.sin(t * 1.6 + l.s * 1.7) * .07 * hv; P.copy(l.pole).lerp(l.restPole, hv)
        ik(l.hip, T, .38, .36, P, E, H); seg(l.th, l.hip, E); seg(l.sh, E, H); seg(l.foot, H, V(H.x, H.y - .04, H.z - .15))
      }
      cape.rotation.x = L(-(.25 + sp * .5), .02, hv) + Math.sin(t * 3) * .03
      capeWave(t, (.06 + sp * .08) * (1 - .6 * hv), 7 + sp * 6 - 4 * hv, .03)
      scarves.forEach((s, i) => { s.mesh.rotation.x = L(-(.5 + sp * .6), .15, hv) + Math.sin(t * 5 + i) * .08; s.mesh.rotation.y = Math.sin(t * 3 + i * 2) * .2; s.wave(t + i, .08 + sp * .06, 11 + sp * 8, .05) })
      if (hairSway) hairSway(t, sp, hv)
      bristles.rotation.set(Math.sin(t * 5.1) * .01, Math.sin(t * 6) * .02, 0)
    }
  }
}
