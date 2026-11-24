import * as THREE from 'three'

// 后期：HDR 场景 → 泛光（降采样链）→ 油画笔触（Kuwahara）+ 墨线描边 + 调色
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false })

export class PostFX {
  constructor(renderer) {
    this.r = renderer
    this._s = new THREE.Vector2(); this.w = 0; this.h = 0
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    this.rt.depthTexture = new THREE.DepthTexture(1, 1); this.rt.depthTexture.type = THREE.UnsignedIntType
    this.down = []; this.up = []
    for (let i = 0; i < 5; i++) { this.down.push(new THREE.WebGLRenderTarget(1, 1, opt)); this.up.push(new THREE.WebGLRenderTarget(1, 1, opt)) }
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false
    this.qs = new THREE.Scene(); this.qs.add(this.quad)
    const T = () => ({ value: null }), V = () => ({ value: new THREE.Vector2() })

    this.bright = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      vec3 pick(vec3 c){ float l = max(c.r, max(c.g, c.b)); return c * max(l - 0.85, 0.0) / max(l, 1e-4); }
      void main(){ vec3 c = pick(texture2D(tSrc, vUv + uTexel * vec2(-1., -1.)).rgb) + pick(texture2D(tSrc, vUv + uTexel * vec2(1., -1.)).rgb)
        + pick(texture2D(tSrc, vUv + uTexel * vec2(-1., 1.)).rgb) + pick(texture2D(tSrc, vUv + uTexel * vec2(1., 1.)).rgb);
        gl_FragColor = vec4(c * 0.25, 1.0); }`, { tSrc: T(), uTexel: V() })
    this.dn = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0
        + texture2D(tSrc, vUv + uTexel * vec2(-1., -1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., -1.)).rgb
        + texture2D(tSrc, vUv + uTexel * vec2(-1., 1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., 1.)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0); }`, { tSrc: T(), uTexel: V() })
    this.upM = mk(`uniform sampler2D tSrc, tPrev; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tPrev, vUv + uTexel * vec2(-1., 0.)).rgb + texture2D(tPrev, vUv + uTexel * vec2(1., 0.)).rgb
        + texture2D(tPrev, vUv + uTexel * vec2(0., -1.)).rgb + texture2D(tPrev, vUv + uTexel * vec2(0., 1.)).rgb;
        gl_FragColor = vec4(c * 0.25 * 0.85 + texture2D(tSrc, vUv).rgb, 1.0); }`, { tSrc: T(), tPrev: T(), uTexel: V() })

    this.final = mk(`uniform sampler2D tHdr, tBloom, tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uBloom, uBrush, uExposure, uPaintK;
      varying vec2 vUv;
      float lin(vec2 uv){ float z = texture2D(tDepth, uv).r * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      // 油画笔触：四个重叠区域里取最"平静"的颜色，边缘保留、中间抹平
      vec3 painted(vec2 uv){
        vec3 m0 = vec3(0.), m1 = vec3(0.), m2 = vec3(0.), m3 = vec3(0.), s0 = vec3(0.), s1 = vec3(0.), s2 = vec3(0.), s3 = vec3(0.);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
          vec3 c = texture2D(tHdr, uv + vec2(float(i), float(j)) * uTexel * uBrush).rgb; c = c / (1.0 + c); vec3 cc = c * c;
          if (i <= 0 && j <= 0) { m0 += c; s0 += cc; } if (i >= 0 && j <= 0) { m1 += c; s1 += cc; }
          if (i <= 0 && j >= 0) { m2 += c; s2 += cc; } if (i >= 0 && j >= 0) { m3 += c; s3 += cc; }
        }
        vec3 sum = vec3(0.); float tot = 0.;
        #define Q(M,S) { vec3 mu = M / 9.0; vec3 va = abs(S / 9.0 - mu * mu); float v = va.r + va.g + va.b; float w = 1.0 / (1e-4 + v * v * v * 1e8); sum += mu * w; tot += w; }
        Q(m0,s0) Q(m1,s1) Q(m2,s2) Q(m3,s3)
        vec3 o = sum / tot; return o / (1.0 - min(o, vec3(0.985)));
      }
      vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        float d = lin(vUv);
        vec3 base = texture2D(tHdr, vUv).rgb;
        float paint = uPaintK * smoothstep(10.0, 35.0, d) * (1.0 - smoothstep(500.0, 1200.0, d));
        vec3 c = paint > 0.02 ? mix(base, painted(vUv), paint * 0.9) : base;
        // 墨线：深度突变处，颜色本身压暗偏暖，而不是纯黑
        float e = 0.0; bool solid = texture2D(tHdr, vUv).a > 0.75;
        e = max(e, (lin(vUv + vec2(uTexel.x, 0.) * uBrush) - d) / d); e = max(e, (lin(vUv - vec2(uTexel.x, 0.) * uBrush) - d) / d);
        e = max(e, (lin(vUv + vec2(0., uTexel.y) * uBrush) - d) / d); e = max(e, (lin(vUv - vec2(0., uTexel.y) * uBrush) - d) / d);
        float ink = (solid ? 1.0 : 0.0) * smoothstep(0.05, 0.16, e) * (1.0 - smoothstep(90.0, 220.0, d));
        c = mix(c, min(c, vec3(1.2)) * vec3(0.22, 0.15, 0.16), ink * 0.85);
        c += texture2D(tBloom, vUv).rgb * uBloom;
        vec2 q = vUv - 0.5; c *= 1.0 - 0.22 * dot(q, q) * 1.6;
        c *= uExposure;
        // 画家的曲线：白以下保持原色，只柔化最亮处
        vec3 hi = max(c - 0.62, 0.0); c = min(c, 0.62) + 0.38 * (1.0 - exp(-hi / 0.38));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(l), c, 1.08), 0.0);
        c = toSrgb(c);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);
      }`, { tHdr: T(), tBloom: T(), tDepth: T(), uTexel: V(), uNear: { value: 0.5 }, uFar: { value: 3000 }, uBloom: { value: 0.6 }, uBrush: { value: 1 }, uExposure: { value: 1.05 }, uPaintK: { value: 1 } })
  }
  setSize() { this.w = 0 }
  _resize(w, h) {
    this.w = w; this.h = h; this.rt.setSize(w, h)
    let a = w, b = h
    for (let i = 0; i < 5; i++) { a = Math.max(1, a >> 1); b = Math.max(1, b >> 1); this.down[i].setSize(a, b); this.up[i].setSize(a, b) }
  }
  _pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam) }
  render(scene, camera) {
    const r = this.r; r.getDrawingBufferSize(this._s)
    if (this._s.x !== this.w || this._s.y !== this.h) this._resize(this._s.x, this._s.y)
    r.setRenderTarget(this.rt); r.render(scene, camera)
    const tx = t => new THREE.Vector2(1 / t.width, 1 / t.height)
    this.bright.uniforms.tSrc.value = this.rt.texture; this.bright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h); this._pass(this.bright, this.down[0])
    for (let i = 1; i < 5; i++) { this.dn.uniforms.tSrc.value = this.down[i - 1].texture; this.dn.uniforms.uTexel.value.copy(tx(this.down[i - 1])); this._pass(this.dn, this.down[i]) }
    for (let i = 3; i >= 0; i--) {
      const prev = i === 3 ? this.down[4] : this.up[i + 1]
      this.upM.uniforms.tSrc.value = this.down[i].texture; this.upM.uniforms.tPrev.value = prev.texture; this.upM.uniforms.uTexel.value.copy(tx(prev))
      this._pass(this.upM, this.up[i])
    }
    const f = this.final.uniforms
    f.tHdr.value = this.rt.texture; f.tBloom.value = this.up[0].texture; f.tDepth.value = this.rt.depthTexture
    f.uTexel.value.set(1 / this.w, 1 / this.h); f.uNear.value = camera.near; f.uFar.value = camera.far; f.uBrush.value = Math.max(1, this.h / 1080)
    this._pass(this.final, null)
  }
}
