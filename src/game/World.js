import * as THREE from 'three'
import { addSnow } from './EnvU.js'
import { createProps } from './Props.js'
import { createGrass } from './Grass.js'
import { createClouds } from './Clouds.js'
import { createCastles } from './Castles.js'
import { flattenSites, setRawHeight, siteLevel, TILE } from './Sites.js'
import { buildPaths, pathTex, PATH_MAX, FLOWER_GLSL } from './Paths.js'
import { createWalkers } from './Walkers.js'
import { Petals } from './Petals.js'

// 简洁的 2D value noise + fbm，用于程序化地形
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
function fbm(x, y) { let f = 0, a = 0.5; for (let i = 0; i < 5; i++) { f += a * noise(x, y); x *= 2; y *= 2; a *= 0.5 } return f }
const rawHeight = (x, z) => Math.pow(fbm(x * 0.004, z * 0.004), 2.2) * 160 - 10
setRawHeight(rawHeight)
// 魁地奇球场所在处把地形压平成一块台地，边缘平滑过渡
const PITCH = { x: -260, z: -120 }
let pitchLevel = null
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }
export const heightAt = (x, z) => {
  const h = rawHeight(x, z)
  if (pitchLevel === null) {
    let s = 0; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; s += rawHeight(PITCH.x + Math.cos(a) * 90, PITCH.z + Math.sin(a) * 50) }
    pitchLevel = Math.max(s / 24, 6)
  }
  const e = Math.hypot((x - PITCH.x) / 135, (z - PITCH.z) / 80)
  return flattenSites(x, z, e > 1.8 ? h : pitchLevel + (h - pitchLevel) * smooth(1.0, 1.8, e))
}

// 地形的"画法"：大小笔触的色斑、偏黄/偏蓝的草地块、随风移动的云影
const terrainTime = { value: 0 }
function paintTerrain(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = terrainTime; sh.uniforms.tPath = { value: pathTex }
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = `varying vec3 vWPos; uniform float uTime;
      float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    uniform sampler2D tPath;
    ${FLOWER_GLSL}
    ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 P = vWPos.xz;
      float n1 = vn(P * .012), n2 = vn(P * .07 + 7.), n3 = vn(P * .35 + 3.);
      float dab = (n1 - .5) * .45 + (n2 - .5) * .35 + (n3 - .5) * .2;
      diffuseColor.rgb *= 1. + dab * .55;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.06, .78), smoothstep(.55, .75, n1));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.82, .95, 1.1), smoothstep(.62, .8, n2) * .7);
      vec2 cp = (P + uTime * vec2(9., 3.)) * .0035;
      float cl = vn(cp) * .7 + vn(cp * 2.7 + .19) * .3;
      {
        // 小路：被行人踩出来的土路，宽窄、边缘都不规则，两侧的草被踩得发黄
        float pd = texture2D(tPath, P / ${TILE}.0).r * ${PATH_MAX}.0;
        float pw = 1.2 + .6 * vn(P * .05);
        float pn = (vn(P * .9) - .5) * .55 + (vn(P * 3.1) - .5) * .25;
        float dryL = smoothstep(2.6, 3.6, vWPos.y);
        float onP = (1. - smoothstep(pw - .3, pw + .25, pd + pn)) * dryL;
        float worn = (1. - smoothstep(pw, pw + 2.4, pd + pn * 1.6)) * dryL;
        vec3 dirt = mix(vec3(.25, .17, .09), vec3(.42, .31, .18), vn(P * .6));
        dirt *= (.88 + .22 * smoothstep(pw, 0., pd)) * (.82 + .3 * vn(P * 4.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.07, .74), worn * .65);
        diffuseColor.rgb = mix(diffuseColor.rgb, dirt, onP);
        // 远处的花：花丛里点点颜色
        float tlv = (vWPos.y + 10.) / 160.;
        float fsp = flowerDrift(P) * smoothstep(.7, .88, vn(P * 2.3 + 11.)) * (1. - worn) * dryL * (1. - smoothstep(.42, .55, tlv));
        diffuseColor.rgb = mix(diffuseColor.rgb, flowerPetal(flowerKind(P)) * .8, fsp * .55);
      }
      diffuseColor.rgb *= 1. - .42 * smoothstep(.5, .6, cl);`)
  }
  return mat
}

export function createWorld(scene) {
  buildPaths(heightAt)
  // 天空：渐变着色器球
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: new THREE.Vector3(0.45, 0.35, -0.8).normalize() } },
    vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 sun; varying vec3 vP;
      void main(){ float h=vP.y; vec3 top=vec3(.16,.40,.78), mid=vec3(.47,.68,.92), hor=vec3(.93,.91,.84);
        vec3 c=mix(hor,mid,smoothstep(0.,.25,h)); c=mix(c,top,smoothstep(.25,.8,h));
        float s=max(dot(vP,sun),0.); c+=vec3(1.,.93,.8)*pow(s,400.)*4.+vec3(1.,.85,.6)*pow(s,6.)*.35;
        gl_FragColor=vec4(pow(c,vec3(2.2)),1.);}`
  }))
  scene.add(sky)
  scene.fog = new THREE.Fog(0xc6d6e0, 220, 1500)

  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x56643a, 1.0); scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.0); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 })
  scene.add(sun, sun.target)
  const lightDir = new THREE.Vector3(90, 70, -160).normalize()

  // 地形（大网格跟随玩家，按格对齐重建高度）
  const SIZE = 2400, SEG = 160
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); tg.rotateX(-Math.PI / 2)
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count * 3), 3))
  const terrain = new THREE.Mesh(tg, addSnow(paintTerrain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))))
  terrain.receiveShadow = true; scene.add(terrain)
  const base = tg.attributes.position.array.slice(), step = SIZE / SEG
  const cLow = new THREE.Color(0x4f8030), cMid = new THREE.Color(0x86a046), cHigh = new THREE.Color(0x9a9080), cSnow = new THREE.Color(0xf7f4ee), tmp = new THREE.Color()
  let lastCX = null, lastCZ = null
  function rebuild(cx, cz) {
    const p = tg.attributes.position, col = tg.attributes.color
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3] + cx, z = base[i * 3 + 2] + cz, h = heightAt(x, z)
      p.array[i * 3 + 1] = h
      const t = (h + 10) / 160
      if (t < 0.15) tmp.copy(cLow); else if (t < 0.4) tmp.lerpColors(cLow, cMid, (t - .15) / .25)
      else if (t < 0.7) tmp.lerpColors(cMid, cHigh, (t - .4) / .3); else tmp.lerpColors(cHigh, cSnow, Math.min(1, (t - .7) / .15))
      col.array[i * 3] = tmp.r; col.array[i * 3 + 1] = tmp.g; col.array[i * 3 + 2] = tmp.b
    }
    p.needsUpdate = true; col.needsUpdate = true; tg.computeVertexNormals()
    terrain.position.set(cx, 0, cz)
  }
  // 湖面
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ color: 0x6f9fc2, metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.9 }))
  water.rotation.x = -Math.PI / 2; water.position.y = 2; scene.add(water)

  // 城堡群（见 Castles.js）：霍格沃茨式主城堡、大教堂小镇、城墙要塞、尖塔城堡、古堡废墟
  const castles = createCastles(scene)
  const cxp = 120, czp = -380
  const castle = { position: new THREE.Vector3(cxp, siteLevel(0, 0, 0), czp) }
  const pitchPos = { x: -260, z: -120 }
  const grass = createGrass(scene, heightAt, { step, colors: [cLow, cMid, cHigh, cSnow], pitch: pitchPos, castle: { x: cxp, z: czp } })
  const props = createProps(scene, heightAt, { castle: { x: cxp, z: czp, y: castle.position.y }, pitch: pitchPos })

  const walkers = createWalkers(scene, heightAt)
  const petals = new Petals(scene, heightAt, props.forest)

  // 积云（见 Clouds.js）
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion()
  const clouds = createClouds(scene, { sunDir: sky.material.uniforms.sun.value, fogColor: scene.fog.color })

  // 星光尘埃
  const dustG = new THREE.BufferGeometry(), dp = new Float32Array(1500 * 3)
  for (let i = 0; i < dp.length; i++) dp[i] = (Math.random() - .5) * 400
  dustG.setAttribute('position', new THREE.BufferAttribute(dp, 3))
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ color: 0xfff0c0, size: 0.6, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
  scene.add(dust)

  // 魔法光环
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
  const ringGeo = new THREE.TorusGeometry(6, 0.35, 12, 48), glowGeo = new THREE.TorusGeometry(6, 1.2, 8, 48)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  const rings = []
  for (let i = 0; i < 14; i++) { const g = new THREE.Group(); g.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(glowGeo, glowMat)); scene.add(g); rings.push({ g, hit: 0 }) }

  // 金色飞贼
  const snitch = new THREE.Group()
  snitch.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 1, roughness: 0.2, emissive: 0x664400 })))
  const wingG = new THREE.PlaneGeometry(1.8, 0.7); wingG.translate(0.9, 0, 0)
  const wingM = new THREE.MeshBasicMaterial({ color: 0xfff6dd, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  const wl = new THREE.Mesh(wingG, wingM), wr = new THREE.Mesh(wingG, wingM); wr.rotation.y = Math.PI; snitch.add(wl, wr)
  const snLight = new THREE.PointLight(0xffcc55, 3, 30); snitch.add(snLight); scene.add(snitch)
  const sn = { target: new THREE.Vector3(), t: 0 }

  const fwd = new THREE.Vector3(), last = new THREE.Vector3()
  function placeRing(r, p, dirv) {
    const d = 150 + Math.random() * 350, a = (Math.random() - .5) * 1.4
    const x = p.x + (dirv.x * Math.cos(a) - dirv.z * Math.sin(a)) * d, z = p.z + (dirv.x * Math.sin(a) + dirv.z * Math.cos(a)) * d
    r.g.position.set(x, Math.max(heightAt(x, z) + 20, 40 + Math.random() * 80), z)
    r.g.rotation.y = Math.atan2(dirv.x, dirv.z); r.hit = 0; r.g.scale.setScalar(1)
  }
  let inited = false, localObjs = true
  return {
    heightAt,
    env: { sky, sun, hemi, water, lightDir, clouds, heightAt },
    setLocalObjects(v) { localObjs = v; rings.forEach(r => (r.g.visible = v)); snitch.visible = v },
    mapInfo: () => ({ snitch: snitch.position, rings: rings.filter(r => !r.hit).map(r => r.g.position) }),
    update(dt, t, p, running, cam) {
      if (cam) grass.update(t, p, cam)
      const res = { ring: false, snitch: false, hoop: false }; terrainTime.value = t
      fwd.subVectors(p, last); if (fwd.lengthSq() > 1e-6) fwd.setY(0).normalize(); else fwd.set(0, 0, -1); last.copy(p)
      if (!inited) { rings.forEach(r => placeRing(r, p, new THREE.Vector3(0, 0, -1))); sn.target.set(p.x, p.y + 10, p.z - 120); snitch.position.copy(sn.target); inited = true }
      const cx = Math.round(p.x / (step * 8)) * step * 8, cz = Math.round(p.z / (step * 8)) * step * 8
      if (cx !== lastCX || cz !== lastCZ) { rebuild(cx, cz); props.relayout(p); lastCX = cx; lastCZ = cz }
      water.position.x = p.x; water.position.z = p.z; sky.position.copy(p)
      sun.position.copy(p).addScaledVector(lightDir, 200); sun.target.position.copy(p)

      clouds.update(dt, t, p, cam || p)
      castles.update(t, cam || p)
      walkers.update(dt, t, cam || p)
      res.thud = petals.update(dt, t, cam || p)
      dust.position.set(Math.floor(p.x / 400) * 400, Math.floor(p.y / 400) * 400, Math.floor(p.z / 400) * 400)
      dust.rotation.y = t * 0.01

      if (localObjs) {
      for (const r of rings) {
        r.g.children[0].rotation.z = t * 0.6; r.g.children[1].scale.setScalar(1 + Math.sin(t * 3) * 0.05)
        if (r.hit) { r.hit += dt; r.g.scale.setScalar(1 + r.hit * 4); ringMat.opacity = 0.9; if (r.hit > 0.4) placeRing(r, p, fwd); continue }
        const d = r.g.position.distanceTo(p)
        if (running && d < 6.5) { r.hit = 0.001; res.ring = true }
        else if (d > 700) placeRing(r, p, fwd)
      }
      // 飞贼：在玩家前方游走
      sn.t -= dt
      if (sn.t < 0 || snitch.position.distanceTo(sn.target) < 3) {
        sn.target.set(p.x + fwd.x * 60 + (Math.random() - .5) * 60, Math.max(p.y + (Math.random() - .5) * 30, heightAt(p.x, p.z) + 15), p.z + fwd.z * 60 + (Math.random() - .5) * 60); sn.t = 2.5
      }
      snitch.position.lerp(sn.target, 1 - Math.exp(-1.2 * dt))
      snitch.position.y += Math.sin(t * 6) * 0.05
      wl.rotation.x = Math.sin(t * 60) * 0.8; wr.rotation.x = -Math.sin(t * 60) * 0.8
      snitch.lookAt(p)
      if (running && snitch.position.distanceTo(p) < 3.5) { res.snitch = true; sn.t = 0; snitch.position.add(new THREE.Vector3(0, 40, -80)) }
      if (snitch.position.distanceTo(p) > 300) snitch.position.set(p.x + fwd.x * 80, p.y + 10, p.z + fwd.z * 80)
      }
      res.hoop = props.update(dt, t, p, running)
      if (localObjs) { res.snitchDist = snitch.position.distanceTo(p); res.snitchPos = snitch.position }
      return res
    }
  }
}
