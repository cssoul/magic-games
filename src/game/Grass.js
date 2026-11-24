import * as THREE from 'three'
import { LOW } from './Quality.js'
import { addSnow, envU } from './EnvU.js'
import { SITES, siteCenter, TILE } from './Sites.js'
import { pathTex, PATH_MAX, FLOWER_GLSL } from './Paths.js'

// 近景草地：GPU 实例化草叶，围绕镜头按世界网格生成（位置稳定不"游动"）。
// 高度取自与地形网格完全相同的三角插值，草根贴地；颜色沿用地形的画法，草根与地面融为一体。
const NOISE = `
float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
`
function bladeGeometry(rows) {
  const pos = [], idx = []
  for (let r = 0; r < rows; r++) { const t = r / rows; pos.push(-1, t, 0, 1, t, 0) }
  pos.push(0, 1, 0)
  for (let r = 0; r < rows - 1; r++) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  const a = (rows - 1) * 2; idx.push(a, a + 1, a + 2)
  return { pos: new Float32Array(pos), idx }
}

export function createGrass(scene, heightAt, o) {
  const STEP = o.step, TN = 72
  const data = new Float32Array(TN * TN)
  const tex = new THREE.DataTexture(data, TN, TN, THREE.RedFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true
  const shared = {
    uTime: { value: 0 }, tHeight: { value: tex }, uHOrigin: { value: new THREE.Vector2() }, uHStep: { value: STEP }, uHRes: { value: TN },
    uCenter: { value: new THREE.Vector2() }, uCamPos: { value: new THREE.Vector3() }, uPlayer: { value: new THREE.Vector4() },
    uWind: { value: new THREE.Vector2(0.8, 0.45).normalize() }, tPath: { value: pathTex },
    uC0: { value: o.colors[0] }, uC1: { value: o.colors[1] }, uC2: { value: o.colors[2] }, uC3: { value: o.colors[3] },
    uPitch: { value: new THREE.Vector4(o.pitch.x, o.pitch.z, 97, 47) }, uSites: { value: SITES.map(() => new THREE.Vector3()) }
  }

  function layer({ cell, n, rows, height, width, fade, salt, tufts }) {
    const { pos, idx } = bladeGeometry(rows)
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx)
    const cells = new Float32Array(n * n * 2); let k = 0
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { cells[k++] = i - n / 2; cells[k++] = j - n / 2 }
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2)); g.instanceCount = n * n
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, side: THREE.DoubleSide })
    const local = { uCell: { value: cell }, uHeight: { value: height }, uWidth: { value: width }, uFade: { value: new THREE.Vector2(...fade) }, uSalt: { value: salt }, uTufts: { value: tufts } }
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, shared, local)
      sh.vertexShader = `
        attribute vec2 aCell;
        uniform float uTime, uHStep, uHRes, uCell, uHeight, uWidth, uSalt, uTufts;
        uniform sampler2D tHeight, tPath; uniform vec2 uHOrigin, uCenter, uWind, uFade; uniform vec3 uCamPos, uC0, uC1, uC2, uC3; uniform vec3 uSites[${SITES.length}]; uniform vec4 uPlayer, uPitch;
        varying vec3 vGrassCol;
        ${NOISE}
        float hT(ivec2 c){ c = clamp(c, ivec2(0), ivec2(int(uHRes) - 1)); return texelFetch(tHeight, c, 0).r; }
        // 与地形 PlaneGeometry 相同的三角剖分插值（对角线 fx + fz = 1）
        float groundAt(vec2 xz){
          vec2 g = xz / uHStep - uHOrigin, i = floor(g), f = g - i; ivec2 c = ivec2(i);
          float A = hT(c), B = hT(c + ivec2(0, 1)), C = hT(c + ivec2(1, 1)), D = hT(c + ivec2(1, 0));
          return f.x + f.y <= 1. ? A + (D - A) * f.x + (B - A) * f.y : C + (B - C) * (1. - f.x) + (D - C) * (1. - f.y);
        }
        vec3 landColor(float h){
          float t = (h + 10.) / 160.;
          if (t < .15) return uC0; if (t < .4) return mix(uC0, uC1, (t - .15) / .25);
          if (t < .7) return mix(uC1, uC2, (t - .4) / .3); return mix(uC2, uC3, min(1., (t - .7) / .15));
        }
      ` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `
          vec2 cell = floor(uCenter / uCell + .5) + aCell;
          vec4 r = vec4(h2(cell + uSalt), h2(cell + uSalt + 17.31), h2(cell + uSalt + 41.77), h2(cell + uSalt + 73.13));
          vec2 xz = (cell + r.xy) * uCell;
          float gy = groundAt(xz);
          float dist = distance(vec3(xz.x, gy, xz.y), uCamPos);
          float live = 1. - smoothstep(uFade.x, uFade.y, dist + r.z * (uFade.y - uFade.x) * .6);
          float tl = (gy + 10.) / 160.;
          live *= smoothstep(2.6, 4.0, gy) * (1. - smoothstep(.5, .62, tl));                       // 水里、岩石雪顶不长草
          live *= smoothstep(1.0, 1.08, length((xz - uPitch.xy) / uPitch.zw));                     // 球场草坪
          for (int si = 0; si < ${SITES.length}; si++) live *= smoothstep(uSites[si].z, uSites[si].z + 12., distance(xz, uSites[si].xy));  // 城堡台地
          float patchN = vn(xz * .045 + uSalt);
          live *= smoothstep(.05, .22, patchN + .2 - r.w * .2);                                     // 成片生长，有空地
          // 小路上不长草，路边的草被踩矮
          float pd = textureLod(tPath, xz / ${TILE}.0, 0.).r * ${PATH_MAX}.0;
          float pw = 1.2 + .6 * vn(xz * .05), pn = (vn(xz * .9) - .5) * .55;
          live *= smoothstep(pw - .1, pw + .9, pd + pn);
          float pathShort = mix(.45, 1., smoothstep(pw, pw + 3., pd + pn));
          float h = pathShort * uHeight * mix(.55, 1.25, r.w) * mix(.6, 1.2, patchN) * step(.001, live) * mix(.4, 1., live);

          // 风：两层随风移动的阵风 + 每根草自己的颤动
          float gust = vn((xz - uWind * uTime * 7.) / 23.) * .65 + vn((xz - uWind * uTime * 4.) / 7.) * .35;
          float yaw = r.z * 6.2832;
          vec2 L = vec2(cos(yaw), sin(yaw)) * mix(.12, .45, r.x);
          L += uWind * (.18 + .75 * smoothstep(.3, .8, gust));
          L += vec2(-uWind.y, uWind.x) * sin(uTime * (4. + 3. * r.w) + r.x * 40.) * .07;
          // 扫帚低空掠过：草被气流压开
          vec2 dp = xz - uPlayer.xy; float dd = length(dp);
          L += dp / max(dd, .01) * uPlayer.w * (1. - smoothstep(1.5, 8., dd)) * 1.6;
          float lean = min(length(L), 1.35); vec2 dir = L / max(length(L), 1e-4);
          float s = position.y, phi = lean * s;
          float along = lean > 1e-3 ? h * (1. - cos(phi)) / lean : 0.;
          float rise  = lean > 1e-3 ? h * sin(phi) / lean : h * s;
          vec3 tangent = vec3(dir.x * sin(phi), cos(phi), dir.y * sin(phi));
          vec3 across = vec3(-dir.y, 0., dir.x);
          vec3 toCam = normalize(uCamPos - vec3(xz.x, gy, xz.y));
          vec3 facing = cross(tangent, toCam);
          if (length(facing) > 1e-3) { facing = normalize(facing); across = normalize(mix(across, facing * sign(dot(facing, across) + 1e-4), .65)); }
          float w = uWidth * mix(.7, 1.35, r.y) * mix(1., .15, s * s) * (1. + uTufts * (1. - s));
          vec3 bladePos = vec3(xz.x, gy, xz.y) + vec3(dir.x * along, rise, dir.y * along) + across * position.x * w * .5;
          vec3 nrm = normalize(cross(across, tangent)); if (nrm.y < 0.) nrm = -nrm;
          vec3 objectNormal = normalize(mix(nrm, vec3(0., 1., 0.), .8));

          // 颜色：与地形相同的画法（色斑、偏黄/偏蓝的草地块、云影），再加根暗梢亮
          vec3 col = landColor(gy);
          col = mix(col, col * vec3(1.15, 1.07, .74), (1. - smoothstep(pw, pw + 2.4, pd + pn * 1.6)) * .6);
          float n1 = vn(xz * .012), n2 = vn(xz * .07 + 7.), n3 = vn(xz * .35 + 3.);
          col *= 1. + ((n1 - .5) * .45 + (n2 - .5) * .35 + (n3 - .5) * .2) * .55;
          col = mix(col, col * vec3(1.12, 1.06, .78), smoothstep(.55, .75, n1));
          col = mix(col, col * vec3(.82, .95, 1.1), smoothstep(.62, .8, n2) * .7);
          vec2 cp = (xz + uTime * vec2(9., 3.)) * .0035;
          col *= 1. - .42 * smoothstep(.5, .6, vn(cp) * .7 + vn(cp * 2.7 + .19) * .3);
          float tip = mix(s, 1., uTufts * .6);
          col *= mix(.78, 1.32, tip) * mix(.88, 1.12, r.x) * (1. + .12 * gust);
          col = mix(col, col * vec3(1.15, 1.08, .7), smoothstep(.75, 1., r.y) * tip);              // 少数草梢偏黄
          col = mix(col, col * vec3(.8, .95, 1.08), smoothstep(.8, 1., r.x) * .8);                 // 少数偏蓝的深色草
          vGrassCol = col;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;')
      sh.fragmentShader = 'varying vec3 vGrassCol;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassCol;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); // 双面草叶：背面不翻转法线，避免发黑')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a = 0.5; // 标记为草：后期不给草叶描墨线')
    }
    const m = new THREE.Mesh(g, addSnow(mat, 0.9)); m.frustumCulled = false; m.receiveShadow = true; scene.add(m); return m
  }

  const layers = [
    layer({ cell: 0.5, n: LOW ? 150 : 230, rows: 5, height: 0.75, width: 0.085, fade: LOW ? [22, 36] : [36, 56], salt: 0, tufts: 0 }),
    layer({ cell: 1.35, n: LOW ? 140 : 210, rows: 3, height: 0.85, width: 0.16, fade: LOW ? [56, 88] : [90, 135], salt: 101, tufts: 0.6 })
  ]

  // ---- 野花：雏菊、毛茛、紫罗兰、粉花、虞美人，成片生长，每片以一种为主 ----
  const flowers = (() => {
    const pos = [], part = [], idx = []
    for (let r = 0; r <= 3; r++) { pos.push(-1, r / 3, 0, 1, r / 3, 0); part.push(0, 0) }
    for (let r = 0; r < 3; r++) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    const c0 = pos.length / 3; pos.push(0, 0, 0); part.push(2)
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, w = .5, b = pos.length / 3
      pos.push(Math.cos(a - w) * .5, 0, Math.sin(a - w) * .5, Math.cos(a), 0, Math.sin(a), Math.cos(a + w) * .5, 0, Math.sin(a + w) * .5); part.push(1, 1, 1)
      idx.push(c0, b, b + 1, c0, b + 1, b + 2)
    }
    const g = new THREE.InstancedBufferGeometry(), n = LOW ? 80 : 120
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(part), 1)); g.setIndex(idx)
    const cells = new Float32Array(n * n * 2); let k = 0
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { cells[k++] = i - n / 2; cells[k++] = j - n / 2 }
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2)); g.instanceCount = n * n
    const mat = new THREE.MeshStandardMaterial({ roughness: .7, side: THREE.DoubleSide })
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, shared, { uCell: { value: 1.1 }, uSnowK: envU.uSnow })
      sh.vertexShader = `
        attribute vec2 aCell; attribute float aPart;
        uniform float uTime, uHStep, uHRes, uCell, uSnowK;
        uniform sampler2D tHeight, tPath; uniform vec2 uHOrigin, uCenter, uWind; uniform vec3 uCamPos; uniform vec4 uPlayer, uPitch; uniform vec3 uSites[${SITES.length}];
        varying vec3 vFCol;
        ${NOISE}
        ${FLOWER_GLSL}
        float hT(ivec2 c){ c = clamp(c, ivec2(0), ivec2(int(uHRes) - 1)); return texelFetch(tHeight, c, 0).r; }
        float groundAt(vec2 xz){
          vec2 g = xz / uHStep - uHOrigin, i = floor(g), f = g - i; ivec2 c = ivec2(i);
          float A = hT(c), B = hT(c + ivec2(0, 1)), C = hT(c + ivec2(1, 1)), D = hT(c + ivec2(1, 0));
          return f.x + f.y <= 1. ? A + (D - A) * f.x + (B - A) * f.y : C + (B - C) * (1. - f.x) + (D - C) * (1. - f.y);
        }
      ` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `
          vec2 cell = floor(uCenter / uCell + .5) + aCell;
          vec4 r = vec4(h2(cell + 3.7), h2(cell + 19.1), h2(cell + 47.3), h2(cell + 83.9));
          vec2 xz = (cell + r.xy) * uCell;
          float gy = groundAt(xz);
          float dist = distance(vec3(xz.x, gy, xz.y), uCamPos);
          float live = 1. - smoothstep(${LOW ? '24., 40.' : '38., 62.'}, dist + r.z * 16.);
          live *= smoothstep(3., 4.2, gy) * (1. - smoothstep(.42, .55, (gy + 10.) / 160.));
          live *= smoothstep(1.0, 1.08, length((xz - uPitch.xy) / uPitch.zw));
          for (int si = 0; si < ${SITES.length}; si++) live *= step(uSites[si].z + 6., distance(xz, uSites[si].xy));
          float pd = textureLod(tPath, xz / ${TILE}.0, 0.).r * ${PATH_MAX}.0;
          live *= smoothstep(1.8, 3.2, pd);
          live *= step(r.w, flowerDrift(xz) * .95 + .07);
          live *= 1. - smoothstep(.25, .7, uSnowK);
          live = step(.01, live);
          int kind = flowerKind(xz); if (r.z > .86) kind = int(floor(r.x * 4.99));
          float h = mix(.3, .6, r.z) * live;
          float gust = vn((xz - uWind * uTime * 7.) / 23.) * .65 + vn((xz - uWind * uTime * 4.) / 7.) * .35;
          float yaw = r.w * 6.2832;
          vec2 L = vec2(cos(yaw), sin(yaw)) * .15 + uWind * (.12 + .5 * smoothstep(.3, .8, gust)) + vec2(-uWind.y, uWind.x) * sin(uTime * (3. + 2. * r.x) + r.y * 30.) * .08;
          vec2 dp = xz - uPlayer.xy; float dd = length(dp);
          L += dp / max(dd, .01) * uPlayer.w * (1. - smoothstep(1.5, 8., dd)) * 1.4;
          float lean = min(length(L), 1.2); vec2 dir = L / max(length(L), 1e-4);
          float s = aPart < .5 ? position.y : 1.;
          float phi = lean * s;
          float along = lean > 1e-3 ? h * (1. - cos(phi)) / lean : 0.;
          float rise = lean > 1e-3 ? h * sin(phi) / lean : h * s;
          vec3 base = vec3(xz.x, gy, xz.y);
          vec3 tangent = vec3(dir.x * sin(phi), cos(phi), dir.y * sin(phi));
          vec3 toCam = normalize(uCamPos - base);
          vec3 fPos; vec3 nrm;
          if (aPart < .5) {
            vec3 across = normalize(cross(tangent, toCam) + vec3(1e-4, 0., 0.));
            fPos = base + vec3(dir.x * along, rise, dir.y * along) + across * position.x * .011 * live;
            nrm = vec3(0., 1., 0.);
            vFCol = vec3(.1, .22, .06) * mix(.7, 1.15, s);
          } else {
            vec3 up = normalize(tangent + toCam * .45 + vec3(0., .3, 0.));
            vec3 e1 = normalize(cross(up, vec3(.37, .11, .93))); vec3 e2 = cross(up, e1);
            float sz = mix(.085, .15, r.y) * live;
            fPos = base + vec3(dir.x * along, rise, dir.y * along) + (e1 * position.x + e2 * position.z) * sz + up * (aPart > 1.5 ? .012 : 0.) * live;
            nrm = up;
            vFCol = aPart > 1.5 ? flowerHeart(kind) : flowerPetal(kind) * mix(.85, 1.1, r.x);
          }
          vec3 objectNormal = normalize(mix(nrm, vec3(0., 1., 0.), .4));`)
        .replace('#include <begin_vertex>', 'vec3 transformed = fPos;')
      sh.fragmentShader = 'varying vec3 vFCol;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vFCol;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vFCol * .1;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a = 0.5;')
    }
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.receiveShadow = true; scene.add(m); return m
  })()

  let ox = null, oz = null
  function rebuild(px, pz) {
    const ix = Math.round(px / STEP) - TN / 2, iz = Math.round(pz / STEP) - TN / 2
    if (ox !== null && Math.abs(ix - ox) < 4 && Math.abs(iz - oz) < 4) return
    ox = ix; oz = iz
    for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) data[j * TN + i] = heightAt((ix + i) * STEP, (iz + j) * STEP)
    shared.uHOrigin.value.set(ix, iz); tex.needsUpdate = true
  }

  return {
    update(t, player, cam) {
      rebuild(cam.x, cam.z)
      SITES.forEach((st, i) => { const c = siteCenter(i, cam.x, cam.z); shared.uSites.value[i].set(c.x, c.z, Math.max(st.rx, st.rz) * 0.9) })
      shared.uTime.value = t
      shared.uCenter.value.set(cam.x, cam.z)
      shared.uCamPos.value.copy(cam)
      const above = player.y - heightAt(player.x, player.z)
      shared.uPlayer.value.set(player.x, player.z, 0, 1 - THREE.MathUtils.smoothstep(above, 4, 15))
      const high = cam.y - heightAt(cam.x, cam.z) > 150
      layers.forEach(l => (l.visible = !high)); flowers.visible = !high
    }
  }
}
