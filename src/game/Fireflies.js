import * as THREE from 'three'

// 萤火虫：夜里在镜头周围的草地、林边、水面上方飘飞，一明一暗地闪；亮度超过泛光阈值，会晕出柔光。
export class Fireflies {
  constructor(scene, heightAt, n = 520) {
    Object.assign(this, { H: heightAt, n, B: 96, inited: false })
    this.ax = new Float32Array(n); this.az = new Float32Array(n); this.ay = new Float32Array(n); this.ph = new Float32Array(n)
    this.pos = new Float32Array(n * 3); this.alive = new Float32Array(n)
    const seed = new Float32Array(n); for (let i = 0; i < n; i++) { seed[i] = Math.random(); this.ph[i] = Math.random() * 100 }
    const g = this.geo = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aAlive', new THREE.BufferAttribute(this.alive, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.u = { uTime: { value: 0 }, uK: { value: 0 }, uScale: { value: 800 } }
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.u,
      vertexShader: `
        attribute float aSeed, aAlive; uniform float uTime, uK, uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          float w = 1.1 + fract(aSeed * 7.3) * 1.7;
          float b = smoothstep(.6, .97, sin(uTime * w + aSeed * 40.) * .5 + .5);
          float px = .26 * uScale / max(-mv.z, .1);
          gl_PointSize = clamp(px, 3.5, 22.);
          vA = max(b, .03) * aAlive * uK * clamp(px / 2.5, .3, 1.) * (1. - smoothstep(38., 50., -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord - .5; float d2 = dot(q, q) * 4.;
          float a = exp(-d2 * 5.) * vA; if (a < .003) discard;
          gl_FragColor = vec4(vec3(.8, 1., .3) * (2.2 + 5. * exp(-d2 * 26.)), a);
        }`
    }))
    this.points.frustumCulled = false; this.points.renderOrder = 6; this.points.visible = false; scene.add(this.points)
  }
  _ground(i) {
    const g = this.H(this.ax[i], this.az[i])
    this.alive[i] = g > 1.5 && g < 72 && Math.random() < .8 ? 1 : 0
    this.ay[i] = Math.max(g, 2.1) + .3 + Math.random() * 2.2
  }
  update(dt, t, cam, k) {
    k *= 1 - THREE.MathUtils.smoothstep(cam.y - this.H(cam.x, cam.z), 60, 140)
    this.points.visible = k > .01; if (!this.points.visible) return
    this.u.uTime.value = t; this.u.uK.value = k
    this.u.uScale.value = Math.min(devicePixelRatio, 2) * innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(32)))
    const B = this.B, half = B / 2, P = this.pos
    for (let i = 0; i < this.n; i++) {
      let moved = !this.inited
      if (moved) { this.ax[i] = cam.x + (Math.random() - .5) * B; this.az[i] = cam.z + (Math.random() - .5) * B }
      if (this.ax[i] - cam.x > half) { this.ax[i] -= B; moved = true } else if (cam.x - this.ax[i] > half) { this.ax[i] += B; moved = true }
      if (this.az[i] - cam.z > half) { this.az[i] -= B; moved = true } else if (cam.z - this.az[i] > half) { this.az[i] += B; moved = true }
      if (moved) this._ground(i)
      const ph = this.ph[i], o = i * 3
      P[o] = this.ax[i] + Math.sin(t * .31 + ph) * 1.7 + Math.sin(t * 1.3 + ph * 3) * .25
      P[o + 1] = this.ay[i] + Math.sin(t * .47 + ph * 2) * .55
      P[o + 2] = this.az[i] + Math.cos(t * .27 + ph) * 1.7 + Math.cos(t * 1.1 + ph * 2) * .25
    }
    this.inited = true
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aAlive.needsUpdate = true
  }
}
