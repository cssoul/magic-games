import * as THREE from 'three'

// 体积感积云：每朵云由 15~30 个面向镜头的"云团"组成，单次绘制。
// 每个云团在着色器里被当作一个球来打光（朝阳面亮、背光面偏蓝灰），
// 边缘被噪声侵蚀得蓬松，底部被切平；逆光时边缘泛暖色银边；飞近时淡出，可以穿云而过。
function noiseTexture(N = 128) {
  const hash = (x, y, p) => { x = ((x % p) + p) % p; y = ((y % p) + p) % p; const s = Math.sin(x * 127.1 + y * 311.7 + p * 7.7) * 43758.5453; return s - Math.floor(s) }
  const vnoise = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi, p), b = hash(xi + 1, yi, p), c = hash(xi, yi + 1, p), d = hash(xi + 1, yi + 1, p)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const data = new Uint8Array(N * N * 4)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let f = 0, amp = 0.5, tot = 0
    for (const p of [4, 8, 16, 32]) { f += amp * vnoise(i / N * p, j / N * p, p); tot += amp; amp *= 0.5 }
    const g = vnoise(i / N * 6 + 3.1, j / N * 6, 6)
    const k = (j * N + i) * 4; data[k] = (f / tot) * 255; data[k + 1] = g * 255; data[k + 2] = 0; data[k + 3] = 255
  }
  const t = new THREE.DataTexture(data, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true
  return t
}

export function createClouds(scene, { sunDir, fogColor, count = 46, span = 1900 }) {
  // ---- 生成云的形状：穹顶状分布，中间高大、边缘低矮 ----
  const clouds = [], puffs = []
  for (let c = 0; c < count; c++) {
    const W = 35 + Math.random() * 65, D = W * (0.55 + Math.random() * 0.3), H = W * (0.45 + Math.random() * 0.35)
    const cloud = { x: (Math.random() - 0.5) * span, z: (Math.random() - 0.5) * span, y: 125 + Math.random() * 85, sp: 0.6 + Math.random() * 0.8, bright: 0.9 + Math.random() * 0.15 }
    clouds.push(cloud)
    const n = Math.round(12 + W / 5)
    for (let i = 0; i < n; i++) {
      const ux = (Math.random() + Math.random() - 1), uz = (Math.random() + Math.random() - 1)
      const dome = Math.sqrt(Math.max(0, 1 - ux * ux - uz * uz))
      const r = (W * 0.2 + 6) * (0.55 + 0.6 * dome) * (0.75 + Math.random() * 0.45)
      const y = r * 0.35 + Math.random() * H * dome * 0.75
      puffs.push({ cloud, ox: ux * W, oy: y, oz: uz * D, r, seed: Math.random() })
    }
    // 底部几缕薄云
    for (let i = 0; i < 4; i++) puffs.push({ cloud, ox: (Math.random() - 0.5) * W * 2.2, oy: 3, oz: (Math.random() - 0.5) * D * 1.6, r: W * 0.18 + 4, seed: Math.random() + 10 })
  }
  const N = puffs.length

  const geo = new THREE.InstancedBufferGeometry()
  const quad = new THREE.PlaneGeometry(2, 2)
  geo.setAttribute('position', quad.attributes.position); geo.setIndex(quad.index)
  const aPuff = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage)
  const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aPuff', aPuff); geo.setAttribute('aMisc', aMisc); geo.instanceCount = N

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tNoise: { value: noiseTexture() }, uSun: { value: sunDir }, uFogColor: { value: fogColor }, uTime: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: `
      attribute vec4 aPuff;  // 世界坐标中心 xyz，半径
      attribute vec4 aMisc;  // 云底高度，随机数，亮度，薄云标记
      varying vec2 vUv; varying vec3 vWorld; varying float vBase, vSeed, vR, vFog, vNear, vBright, vWisp;
      void main() {
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float wisp = aMisc.w;
        vec2 sz = aPuff.w * vec2(1.0 + wisp * 1.6, 1.0 - wisp * 0.55);   // 薄云压扁拉长
        vWorld = aPuff.xyz + right * position.x * sz.x + up * position.y * sz.y;
        vUv = position.xy * 0.5 + 0.5;
        vBase = aMisc.x; vSeed = aMisc.y; vR = aPuff.w; vBright = aMisc.z; vWisp = wisp;
        float d = distance(cameraPosition, aPuff.xyz);
        vFog = clamp((d - 380.0) / 1300.0, 0.0, 0.8);
        vNear = smoothstep(aPuff.w * 0.5, aPuff.w * 2.2 + 12.0, d);      // 飞近时淡出，可穿云而过
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tNoise; uniform vec3 uSun, uFogColor, uLight; uniform float uTime;
      varying vec2 vUv; varying vec3 vWorld; varying float vBase, vSeed, vR, vFog, vNear, vBright, vWisp;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r2 = dot(p, p); if (r2 > 1.0) discard;
        float ang = vSeed * 6.2832; mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        vec2 q = rot * p;
        float n1 = texture2D(tNoise, q * 0.32 + vSeed * 3.7 + uTime * 0.002).r;
        float n2 = texture2D(tNoise, q * 0.8 + vSeed * 1.3 - uTime * 0.004).r;
        float n = n1 * 0.6 + n2 * 0.4;
        // 蓬松的边缘：球形衰减被噪声侵蚀
        float edge = 1.0 - r2;
        float a = smoothstep(0.0, 0.5, edge - (n - 0.5) * 0.75 - 0.05);
        // 平底
        a *= smoothstep(vBase - 1.0, vBase + vR * 0.4, vWorld.y);
        a *= mix(1.0, 0.55, vWisp) * vNear;
        if (a < 0.01) discard;
        // 把云团当作球来打光，噪声扰动法线，形成一团团的"花椰菜"起伏
        vec3 nv = normalize(vec3(p + (vec2(n1, n2) - 0.5) * 0.7, sqrt(max(edge, 0.0)) + 0.15));
        vec3 nw = normalize(transpose(mat3(viewMatrix)) * nv);
        float sunL = dot(nw, uSun) * 0.5 + 0.5;
        float hL = smoothstep(vBase, vBase + vR * 2.6, vWorld.y);          // 越往上越亮，底部背光
        float L = clamp(sunL * 0.62 + hL * 0.5 - 0.08 + (n - 0.5) * 0.25, 0.0, 1.0);
        vec3 shadow = vec3(0.46, 0.54, 0.68), mid = vec3(0.78, 0.82, 0.88), lit = vec3(1.0, 0.97, 0.91);
        vec3 col = L < 0.5 ? mix(shadow, mid, L * 2.0) : mix(mid, lit, (L - 0.5) * 2.0);
        col *= vBright * uLight;
        // 逆光银边
        vec3 V = normalize(vWorld - cameraPosition);
        float toSun = pow(max(dot(V, uSun), 0.0), 6.0);
        col += vec3(1.0, 0.86, 0.62) * toSun * pow(1.0 - edge, 2.0) * 1.3;
        col = mix(col, uFogColor, vFog);
        gl_FragColor = vec4(col, a * 0.96);
      }`
  })
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh)

  const wind = new THREE.Vector2(0.8, 0.45).normalize()
  const wx = new Float32Array(N), wy = new Float32Array(N), wz = new Float32Array(N), dist = new Float32Array(N)
  const order = Array.from({ length: N }, (_, i) => i)
  let frame = 0
  return {
    mat,
    update(dt, t, player, cam) {
      mat.uniforms.uTime.value = t
      const half = span / 2
      for (const c of clouds) {
        c.x += wind.x * c.sp * 6 * dt; c.z += wind.y * c.sp * 6 * dt
        if (c.x - player.x > half) c.x -= span; else if (player.x - c.x > half) c.x += span
        if (c.z - player.z > half) c.z -= span; else if (player.z - c.z > half) c.z += span
      }
      for (let i = 0; i < N; i++) {
        const p = puffs[i]; wx[i] = p.cloud.x + p.ox; wy[i] = p.cloud.y + p.oy; wz[i] = p.cloud.z + p.oz
        const dx = wx[i] - cam.x, dy = wy[i] - cam.y, dz = wz[i] - cam.z; dist[i] = dx * dx + dy * dy + dz * dz
      }
      if ((frame++ & 3) === 0) order.sort((a, b) => dist[b] - dist[a])   // 由远到近，保证半透明叠加正确
      const P = aPuff.array, M = aMisc.array
      for (let k = 0; k < N; k++) {
        const i = order[k], p = puffs[i], o = k * 4
        P[o] = wx[i]; P[o + 1] = wy[i]; P[o + 2] = wz[i]; P[o + 3] = p.r
        M[o] = p.cloud.y; M[o + 1] = p.seed % 1; M[o + 2] = p.cloud.bright; M[o + 3] = p.seed >= 10 ? 1 : 0
      }
      aPuff.needsUpdate = true; aMisc.needsUpdate = true
    }
  }
}
