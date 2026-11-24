import * as THREE from 'three'

// 魔法光尘：细小的金色、淡紫、乳白光点从扫帚尾部沿飞行轨迹连续洒出（帧间插值，不断档），
// 随气流漂浮打旋、闪烁、慢慢消散；少数是带十字星芒的亮点。按屏幕像素限制大小，远近都保持细腻。
export class Trail {
  constructor(scene, n = 1600) {
    this.n = n; this.i = 0; this.t = 0; this.acc = 0; this.last = null
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3)
    this.age = new Float32Array(n).fill(99); this.life = new Float32Array(n).fill(1); this.tt = new Float32Array(n).fill(1)
    const seed = new Float32Array(n); for (let i = 0; i < n; i++) seed[i] = Math.random()
    const g = this.geo = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aT', new THREE.BufferAttribute(this.tt, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
      vertexShader: `
        attribute float aT, aSeed; uniform float uTime, uScale;
        varying float vA, vGlint; varying vec3 vC;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          float glint = step(.86, aSeed);
          float tw = .5 + .5 * sin(uTime * (8. + aSeed * 16.) + aSeed * 60.);
          float size = mix(.03, .075, fract(aSeed * 7.31)) * mix(1., 1.9, glint) * (1. - aT * .55);
          float px = size * uScale / max(-mv.z, .1);
          gl_PointSize = clamp(px, 1.4, glint > .5 ? 9. : 5.);
          // 比 1.5 像素还小的不再缩小，而是变暗：否则会闪烁
          vA = smoothstep(0., .05, aT) * (1. - smoothstep(.4, 1., aT)) * step(aT, .999) * clamp(px / 1.5, .25, 1.)
             * mix(1., .25 + .75 * tw, .4 + .6 * glint);
          float h = fract(aSeed * 13.7);
          vC = h < .5 ? vec3(1., .8, .46) : h < .8 ? vec3(.74, .68, 1.) : vec3(1., .97, .9);
          vGlint = glint;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA, vGlint; varying vec3 vC;
        void main() {
          vec2 q = gl_PointCoord - .5; float d2 = dot(q, q) * 4.;
          float a = exp(-d2 * 7.) + vGlint * (exp(-abs(q.x) * 36.) + exp(-abs(q.y) * 36.)) * max(1. - d2, 0.) * .55;
          a *= vA; if (a < .004) discard;
          gl_FragColor = vec4(vC * mix(.75, 2.2, vGlint), a * .85);
        }`
    })
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6; scene.add(this.points)
  }
  update(dt, origin, speed) {
    this.t += dt; this.mat.uniforms.uTime.value = this.t
    this.mat.uniforms.uScale.value = Math.min(devicePixelRatio, 2) * innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(33)))
    if (!this.last) this.last = origin.clone()
    this.acc += (22 + speed * 9) * dt
    const k = Math.floor(this.acc); this.acc -= k
    const P = this.pos, Vv = this.vel
    for (let j = 0; j < k; j++) {
      const i = this.i = (this.i + 1) % this.n, f = (j + Math.random()) / k, o = i * 3
      const r = .22 * Math.cbrt(Math.random()), a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1)
      P[o] = this.last.x + (origin.x - this.last.x) * f + r * Math.sin(b) * Math.cos(a)
      P[o + 1] = this.last.y + (origin.y - this.last.y) * f + r * Math.cos(b)
      P[o + 2] = this.last.z + (origin.z - this.last.z) * f + r * Math.sin(b) * Math.sin(a)
      Vv[o] = (Math.random() - .5) * .5; Vv[o + 1] = (Math.random() - .3) * .4; Vv[o + 2] = (Math.random() - .5) * .5
      this.age[i] = 0; this.life[i] = 1 + Math.random() * 1.4
    }
    this.last.copy(origin)
    const t = this.t, drag = Math.exp(-1.1 * dt)
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { this.tt[i] = 1; continue }
      this.age[i] += dt; const o = i * 3
      Vv[o] = Vv[o] * drag + Math.sin(t * 1.7 + i * .37) * .35 * dt
      Vv[o + 1] = Vv[o + 1] * drag + (.05 + Math.cos(t * 1.3 + i * .21) * .2) * dt
      Vv[o + 2] = Vv[o + 2] * drag + Math.cos(t * 1.5 + i * .53) * .35 * dt
      P[o] += Vv[o] * dt; P[o + 1] += Vv[o + 1] * dt; P[o + 2] += Vv[o + 2] * dt
      this.tt[i] = this.age[i] / this.life[i]
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aT.needsUpdate = true
  }
}
