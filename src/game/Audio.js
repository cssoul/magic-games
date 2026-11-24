// 程序化音效：全部用 Web Audio 实时合成，无任何音频文件
//  - 风声：褐噪声经带通滤波，音量与音色随速度、阵风变化；高速时叠加高频呼啸
//  - 穿环：钟琴般的上行琶音（非谐泛音的钟声）+ 闪光噪声
//  - 魁地奇球门：低沉的铜锣
//  - 金色飞贼：靠近时能听到嗡嗡的振翅声（随方位左右声像）；抓住时是一串上行的魔法音阶加和弦
//  - 加速：滤波噪声扫频的"呼"声；暂停时整体变闷
export class GameAudio {
  constructor() { this.ctx = null; this.muted = false; this.t = 0 }
  init() {
    if (this.ctx) { this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    const ctx = this.ctx = new AC()
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : .9
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4
    this.out.connect(this.lp); this.lp.connect(comp); comp.connect(ctx.destination)
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(2.8, 2.3)
    const send = ctx.createGain(); send.gain.value = .4; send.connect(this.verb); this.verb.connect(this.out)
    this.sfx = ctx.createGain(); this.sfx.gain.value = .8; this.sfx.connect(this.out); this.sfx.connect(send)
    this.white = this._noise(2, false)
    const brown = this._noise(4, true)
    const w1 = ctx.createBufferSource(); w1.buffer = brown; w1.loop = true
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 400; this.windBP.Q.value = .6
    this.windG = ctx.createGain(); this.windG.gain.value = 0
    w1.connect(this.windBP); this.windBP.connect(this.windG); this.windG.connect(this.out)
    const w2 = ctx.createBufferSource(); w2.buffer = this.white; w2.loop = true; w2.playbackRate.value = .8
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = .5
    this.hissG = ctx.createGain(); this.hissG.gain.value = 0
    w2.connect(hp); hp.connect(this.hissG); this.hissG.connect(this.out)
    w1.start(); w2.start()
    // 飞贼振翅：锯齿波被 30Hz 的低频调幅，再带通成"嗡嗡"声
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 170
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.5
    const am = ctx.createGain(); am.gain.value = .5
    const lfo = ctx.createOscillator(); lfo.frequency.value = 31; const lfoG = ctx.createGain(); lfoG.gain.value = .5
    lfo.connect(lfoG); lfoG.connect(am.gain)
    this.snG = ctx.createGain(); this.snG.gain.value = 0
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    osc.connect(bp); bp.connect(am); am.connect(this.snG)
    if (this.pan) { this.snG.connect(this.pan); this.pan.connect(this.sfx) } else this.snG.connect(this.sfx)
    osc.start(); lfo.start()
    // 雨声：高通 + 低通的白噪声
    const rs = ctx.createBufferSource(); rs.buffer = this.white; rs.loop = true; rs.playbackRate.value = .9
    const rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 700
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 6500
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0
    rs.connect(rh); rh.connect(rl); rl.connect(this.rainG); this.rainG.connect(this.out); rs.start()
    // 夜虫：4.3 kHz 正弦被两个方波 LFO 先后门控，得到一串串"唧唧"声
    const co = ctx.createOscillator(); co.frequency.value = 4300
    const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = .5; g2.gain.value = .5
    const l1 = ctx.createOscillator(), l2 = ctx.createOscillator(); l1.type = l2.type = 'square'; l1.frequency.value = 23; l2.frequency.value = 1.3
    const l1g = ctx.createGain(), l2g = ctx.createGain(); l1g.gain.value = .5; l2g.gain.value = .5
    l1.connect(l1g); l1g.connect(g1.gain); l2.connect(l2g); l2g.connect(g2.gain)
    this.nightG = ctx.createGain(); this.nightG.gain.value = 0
    co.connect(g1); g1.connect(g2); g2.connect(this.nightG); this.nightG.connect(this.sfx)
    co.start(); l1.start(); l2.start()
  }
  setAmbience(rain, night, snow = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime
    this.rainG.gain.setTargetAtTime(rain * .26, t, .4)
    this.nightG.gain.setTargetAtTime(night * (1 - rain) * (1 - snow) * .016, t, .8)
    this.frogK = night * (1 - rain) * (1 - snow)
  }
  // 蛙鸣：池塘边的一群青蛙，每只有自己的音高和方位，"呱—呱"地此起彼伏；飞得越低听得越清楚
  _frogs(dt, alt) {
    const k = (this.frogK || 0) * Math.max(0, 1 - alt / 80)
    this.frogT = (this.frogT ?? 1) - dt
    if (k < .04 || this.frogT > 0) return
    if (!this.frogSet) this.frogSet = Array.from({ length: 7 }, () => ({ f: 240 + Math.random() * 520, pan: Math.random() * 1.8 - .9, n: 1 + Math.floor(Math.random() * 3), v: .45 + Math.random() * .55 }))
    this._croak(this.frogSet[Math.floor(Math.random() * this.frogSet.length)], k)
    this.frogT = .12 + Math.random() * (1.9 - k * 1.3)
  }
  _croak(fr, k) {
    const ctx = this.ctx, t0 = ctx.currentTime + .02, out = ctx.createGain(); out.gain.value = .12 * k * fr.v
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = fr.pan; out.connect(p); p.connect(this.sfx) } else out.connect(this.sfx)
    for (let i = 0; i < fr.n; i++) {
      const t = t0 + i * (.13 + Math.random() * .03), d = .08 + Math.random() * .045
      const o = ctx.createOscillator(); o.type = 'square'
      o.frequency.setValueAtTime(fr.f * 1.06, t); o.frequency.exponentialRampToValueAtTime(fr.f * .8, t + d)
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr.f * 2.4; bp.Q.value = 2.5
      const am = ctx.createGain(); am.gain.value = .5
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 32 + Math.random() * 12
      const lg = ctx.createGain(); lg.gain.value = .5; lfo.connect(lg); lg.connect(am.gain)
      const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + .008); env.gain.setValueAtTime(1, t + d * .5); env.gain.exponentialRampToValueAtTime(1e-3, t + d)
      o.connect(bp); bp.connect(am); am.connect(env); env.connect(out)
      o.start(t); lfo.start(t); o.stop(t + d + .03); lfo.stop(t + d + .03)
    }
  }
  finish() {
    if (!this.ctx) return; const t = this.ctx.currentTime
    ;[523.3, 659.3, 784, 1046.5].forEach((f, i) => this._bell(f, t + i * .14, .14, 2.2))
    ;[261.6, 329.6, 392, 523.3].forEach(f => this._tone(f, t + .55, 3, .05, 'triangle', this.sfx, .3))
  }
  _noise(sec, brown) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0)
    let last = 0
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.2 + w * .04 } else d[i] = w }
    const f = Math.min(2000, n / 4); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k) }   // 首尾交叉淡化，循环无爆音
    return b
  }
  _impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) }
    return b
  }
  _tone(f, t0, dur, gain, type = 'sine', dest = this.sfx, attack = .004) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    o.type = type; o.frequency.value = f
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur)
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + .05)
    return o
  }
  _bell(f, t0, gain, dur = 1.6) { [[1, 1], [2.76, .35], [5.4, .16], [8.93, .06]].forEach(([r, k], i) => this._tone(f * r, t0, dur / (1 + i * .8), gain * k)) }
  _burst(t0, dur, f0, f1, gain, q = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.white
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q
    bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + dur * .3); g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur)
    s.connect(bp); bp.connect(g); g.connect(this.sfx); s.start(t0); s.stop(t0 + dur + .05)
  }
  update(dt, speed, snitchDist, pan, alt = 0) {
    if (!this.ctx) return
    this._frogs(dt, alt)
    const t = this.ctx.currentTime; this.t += dt
    const k = Math.min(1, Math.max(0, (speed - 4) / 70)), gust = .75 + .25 * Math.sin(this.t * .7) * Math.sin(this.t * .31 + 1)
    this.windG.gain.setTargetAtTime((.05 + .5 * k * k) * gust, t, .15)
    this.windBP.frequency.setTargetAtTime(220 + 950 * k * gust, t, .2)
    this.hissG.gain.setTargetAtTime(.004 + .05 * k * k * k, t, .2)
    const s = snitchDist == null ? 0 : Math.max(0, 1 - snitchDist / 55)
    this.snG.gain.setTargetAtTime(s * s * .22, t, .1)
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan || 0)), t, .1)
  }
  ring() {
    if (!this.ctx) return; const t = this.ctx.currentTime
    ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => this._bell(f, t + i * .065, .16))
    this._burst(t, .5, 9000, 5000, .06, .7)
  }
  hoop() {
    if (!this.ctx) return; const t = this.ctx.currentTime
    ;[[98, .32], [196.5, .14], [291, .1], [415, .05], [147, .12]].forEach(([f, g]) => this._tone(f, t, 3.2, g, 'sine', this.sfx, .01))
    const o = this._tone(90, t, .25, .35); o.frequency.exponentialRampToValueAtTime(45, t + .2)
    this._bell(784, t + .05, .06, 2.4)
  }
  snitch() {
    if (!this.ctx) return; const t = this.ctx.currentTime
    const scale = [880, 987.8, 1108.7, 1318.5, 1480, 1760, 1975.5, 2217.5, 2637, 2960]
    for (let i = 0; i < 16; i++) this._bell(scale[Math.min(scale.length - 1, Math.floor(i * .65 + Math.random() * 1.5))], t + i * .055 + Math.random() * .02, .07, .9)
    ;[220, 277.2, 329.6, 440].forEach(f => this._tone(f, t + .1, 2.6, .05, 'triangle', this.sfx, .35))
    this._burst(t, 1.1, 3000, 11000, .05, .6)
  }
  bump() {
    if (!this.ctx) return; const t = this.ctx.currentTime
    this._burst(t, .35, 420, 90, .5, .9)
    const o = this._tone(110, t, .3, .3); o.frequency.exponentialRampToValueAtTime(50, t + .25)
  }
  thud(v) {
    if (!this.ctx) return; const t = this.ctx.currentTime
    const o = this._tone(160, t, .2, .38 * v); o.frequency.exponentialRampToValueAtTime(68, t + .14)
    this._burst(t, .1, 1100, 320, .1 * v, 1.3)
  }
  introChime() {
    if (!this.ctx) return; const t = this.ctx.currentTime
    ;[587.3, 784, 987.8, 1174.7, 1568].forEach((f, i) => this._bell(f, t + i * .09, .07, 1.8))
  }
  whoosh() { if (this.ctx) this._burst(this.ctx.currentTime, .9, 280, 1900, .3, .8) }
  setPaused(p) { if (this.ctx) this.lp.frequency.setTargetAtTime(p ? 650 : 18000, this.ctx.currentTime, .25) }
  toggleMute() {
    this.muted = !this.muted
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : .9, this.ctx.currentTime, .05)
    return this.muted
  }
}
