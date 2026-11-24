// 房主权威的对局逻辑（原 server/index.js 的规则，现在运行在房主的浏览器里）。
// 房间、光环、金色飞贼、得分都由房主判定，再通过 Supabase Realtime 广播给其他玩家。
const COUNTDOWN = 4, DURATION = 600, RELEASE = 15, MAXP = 8, NRINGS = 18
const CENTER = { x: -90, z: -230 }, AREA = 480
const COLORS = ['#ffd36b', '#7ec8ff', '#ff8fa3', '#9be37a', '#c49bff', '#ffb067', '#6ee0d2', '#f2f2f2']
const CHARS = ['xiao', 'ari', 'lin', 'ella'], BROOMS = ['classic', 'racer', 'antique']
const rnd = (a, b) => a + Math.random() * (b - a), r2 = v => Math.round(v * 100) / 100

export class RoomHost {
  constructor(code, myId, out) {
    this.me = myId; this.out = out
    this.r = { code, host: myId, state: 'lobby', env: { tod: 'day', weather: 'clear' }, rings: [], sn: null, startAt: 0 }
    this.players = new Map(); this.k = 0
    this.timer = setInterval(() => this.tick(.1), 100)
  }
  dispose() { clearInterval(this.timer) }
  view() {
    const r = this.r
    return { code: r.code, host: r.host, state: r.state, env: r.env,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, char: p.char, broom: p.broom, color: p.color, score: p.score })) }
  }
  push() { this.out(null, { t: 'room', room: this.view() }) }
  _hello(p, h) {
    if (h.name) p.name = String(h.name).trim().slice(0, 12) || p.name
    if (CHARS.includes(h.char)) p.char = h.char
    if (BROOMS.includes(h.broom)) p.broom = h.broom
  }
  add(id, hello, extra) {
    const old = this.players.get(id)
    if (old) { old.seen = Date.now(); this._hello(old, hello); this.push(); return true }
    if (this.players.size >= MAXP) return '房间已满（最多 ' + MAXP + ' 人）'
    if (this.r.state !== 'lobby' && !extra) return '比赛进行中，请等这一局结束再加入'
    const p = { id, name: '巫师', char: 'xiao', broom: 'classic', score: 0, st: null, seen: Date.now(), ...(extra || {}) }
    this._hello(p, hello)
    const names = new Set([...this.players.values()].map(q => q.name))
    if (names.has(p.name)) { let i = 2; while (names.has(p.name + i)) i++; p.name += i }
    const used = new Set([...this.players.values()].map(q => q.color))
    if (!p.color || used.has(p.color)) p.color = COLORS.find(c => !used.has(c)) || COLORS[0]
    this.players.set(id, p); this.push(); return true
  }
  remove(id) {
    const p = this.players.get(id); if (!p || id === this.me) return
    this.players.delete(id); this.out(null, { t: 'gone', id, name: p.name }); this.push()
  }
  st(id, d) { const p = this.players.get(id); if (p) { p.seen = Date.now(); if (this.r.state === 'playing' && Array.isArray(d) && d.length === 8 && d.every(Number.isFinite)) p.st = d } }
  seen(id) { const p = this.players.get(id); if (p) p.seen = Date.now() }
  live() { return this.r.state === 'playing' && Date.now() >= this.r.startAt }
  award(p, pts, kind) { p.score += pts; p[kind] = (p[kind] || 0) + 1; this.out(null, { t: 'score', id: p.id, name: p.name, pts, kind, total: p.score }) }
  ringAt(id) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * AREA; return { id, x: r2(CENTER.x + Math.cos(a) * d), y: r2(rnd(45, 125)), z: r2(CENTER.z + Math.sin(a) * d), yaw: r2(Math.random() * Math.PI), on: true } }
  handle(id, m) {
    const r = this.r, me = this.players.get(id); if (!me || !m) return
    me.seen = Date.now()
    switch (m.t) {
      case 'hello': this._hello(me, m); this.push(); break
      case 'env': if (id === r.host) { if (['day', 'dusk', 'night', 'auto'].includes(m.tod)) r.env.tod = m.tod; if (['clear', 'rain', 'snow'].includes(m.weather)) r.env.weather = m.weather; this.push() } break
      case 'start': if (id === r.host && r.state === 'lobby') this.startMatch(); break
      case 'again': if (id === r.host && r.state === 'ended') { r.state = 'lobby'; for (const p of this.players.values()) { p.score = 0; p.st = null } this.push() } break
      case 'ring': {
        if (!this.live()) return
        const g = r.rings[m.id]; if (!g || !g.on || !me.st) return
        if (Math.hypot(me.st[0] - g.x, me.st[2] - g.z) > 16) return
        g.on = false; this.out(null, { t: 'ringOff', id: g.id, by: id }); this.award(me, 100, 'rings')
        setTimeout(() => { if (r.rings[g.id] === g && r.state === 'playing') { const n = this.ringAt(g.id); r.rings[g.id] = n; this.out(null, { t: 'ringOn', ring: n }) } }, 6000)
        break
      }
      case 'hoop': if (this.live() && Date.now() - (me.hoopT || 0) > 3000) { me.hoopT = Date.now(); this.award(me, 300, 'hoops') } break
      case 'catch': {
        if (!this.live() || !r.sn.out || !me.st) return
        const s = r.sn; if (Math.hypot(me.st[0] - s.x, me.st[2] - s.z) > 14 || Math.abs(me.st[1] - s.y) > 45) return
        this.award(me, 500, 'snitch'); this.endMatch('catch', id); break
      }
    }
  }
  startMatch() {
    const r = this.r; r.state = 'playing'; r.startAt = Date.now() + COUNTDOWN * 1000
    r.rings = Array.from({ length: NRINGS }, (_, i) => this.ringAt(i))
    r.sn = { out: false, x: CENTER.x, y: 70, z: CENTER.z, vx: 0, vy: 0, vz: 0, tx: 0, ty: 70, tz: 0, t: 0 }
    let i = 0; for (const p of this.players.values()) { p.score = 0; p.rings = p.hoops = p.snitch = 0; p.st = null; p.slot = i++ }
    this.push()
    for (const p of this.players.values()) this.out(p.id, { t: 'go', countdown: COUNTDOWN, duration: DURATION, release: RELEASE, slot: p.slot, rings: r.rings })
  }
  endMatch(reason, winner) {
    const r = this.r; if (r.state !== 'playing') return
    r.state = 'ended'
    const ranking = [...this.players.values()].sort((a, b) => b.score - a.score).map(p => ({ id: p.id, name: p.name, char: p.char, color: p.color, score: p.score, rings: p.rings || 0, hoops: p.hoops || 0, snitch: p.snitch || 0 }))
    this.out(null, { t: 'end', reason, winner: winner ?? (ranking[0] && ranking[0].id), ranking })
    this.push()
  }
  snitchStep(dt) {
    const r = this.r, s = r.sn, el = (Date.now() - r.startAt) / 1000
    if (!s.out) {
      if (el < RELEASE) return
      s.out = true; const a = Math.random() * 6.283; s.x = CENTER.x + Math.cos(a) * 150; s.z = CENTER.z + Math.sin(a) * 150; s.y = 80
      this.out(null, { t: 'snitchOut' })
    }
    let near = null, nd = 1e9
    for (const p of this.players.values()) if (p.st) { const d = Math.hypot(p.st[0] - s.x, p.st[1] - s.y, p.st[2] - s.z); if (d < nd) { nd = d; near = p } }
    let speed = 11; s.t -= dt
    if (near && nd < 30) {
      speed = 24 + (30 - nd) * .5
      if (s.t < 0) {
        const ax = s.x - near.st[0], ay = s.y - near.st[1], az = s.z - near.st[2], L = Math.hypot(ax, ay, az) || 1, side = Math.random() < .5 ? -1 : 1
        s.tx = s.x + (ax / L) * 45 - (az / L) * side * 35; s.ty = Math.min(140, Math.max(35, s.y + (ay / L) * 25 + rnd(-15, 15))); s.tz = s.z + (az / L) * 45 + (ax / L) * side * 35
        s.t = rnd(.5, 1.1)
      }
    } else if (s.t < 0 || Math.hypot(s.tx - s.x, s.tz - s.z) < 5) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * AREA
      s.tx = CENTER.x + Math.cos(a) * d; s.ty = rnd(40, 130); s.tz = CENTER.z + Math.sin(a) * d; s.t = rnd(3, 6)
    }
    const dx = s.tx - s.x, dy = s.ty - s.y, dz = s.tz - s.z, L = Math.hypot(dx, dy, dz) || 1, k = 1 - Math.exp(-4 * dt)
    s.vx += (dx / L * speed - s.vx) * k; s.vy += (dy / L * speed - s.vy) * k; s.vz += (dz / L * speed - s.vz) * k
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt
    const ex = s.x - CENTER.x, ez = s.z - CENTER.z, ed = Math.hypot(ex, ez)
    if (ed > AREA * 1.15) { s.x = CENTER.x + ex / ed * AREA * 1.15; s.z = CENTER.z + ez / ed * AREA * 1.15; s.t = 0 }
  }
  tick(dt) {
    const r = this.r, now = Date.now(); this.k++
    const me = this.players.get(this.me); if (me) me.seen = now
    for (const p of [...this.players.values()]) if (now - p.seen > 9000) this.remove(p.id)     // 9 秒没消息视为掉线
    if (r.state === 'playing') {
      const el = (now - r.startAt) / 1000
      if (el > 0) this.snitchStep(dt)
      if (el >= DURATION) this.endMatch('time')
      else if (this.k % 2 === 0) this.out(null, { t: 'snap', p: [], s: r.sn.out ? [r2(r.sn.x), r2(r.sn.y), r2(r.sn.z)] : null, left: Math.ceil(DURATION - Math.max(0, el)) })
    }
    if (this.k % 20 === 0) this.push()                                                      // 每 2 秒同步一次房间
  }
}
