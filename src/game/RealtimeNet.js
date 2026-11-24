import { SUPABASE_URL, SUPABASE_KEY } from '../config.js'
import { RoomHost } from './RoomHost.js'

// 多人联机：基于 Supabase Realtime 的广播频道（无需自建服务器，适合部署到 Vercel）。
// 每个房间是一个频道 bv-room-<房间号>；创建房间的人是房主，由房主的浏览器运行对局逻辑。
// 房主掉线时，名单里的下一位玩家自动接任房主（进行中的这局会结束，回到大厅）。
// 对外接口与 Net.js（自建服务器版）一致：connect / send / close / onMessage。
export class RealtimeNet {
  constructor(onMessage, onClose) {
    this.onMessage = onMessage; this.onClose = onClose
    this.id = 1 + Math.floor(Math.random() * 2e9); this.seq = 0; this.wait = {}
    this.ws = null; this.topic = null; this.code = null; this.host = null; this.room = null
    this.lastS = null; this.lastLeft = 600; this.hostSeen = 0
  }
  get ready() { return this.ws && this.ws.readyState === 1 }
  connect(hello) {
    this.hello = { ...hello }
    return new Promise((resolve, reject) => {
      const url = SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(SUPABASE_KEY) + '&vsn=1.0.0'
      let done = false
      const ws = this.ws = new WebSocket(url)
      const fail = msg => { if (!done) { done = true; reject(new Error(msg)) } }
      const timer = setTimeout(() => { fail('连接超时'); ws.close() }, 8000)
      ws.onopen = () => {
        clearTimeout(timer); done = true
        this.hb = setInterval(() => this._raw('phoenix', 'heartbeat', {}), 25000)
        this.tk = setInterval(() => this._tick(), 1000)
        resolve(this.id)
      }
      ws.onerror = () => fail('无法连接联机服务')
      ws.onclose = () => { clearTimeout(timer); fail('无法连接联机服务'); if (this.ws === ws) { this._cleanup(); this.onClose && this.onClose() } }
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data) } catch { return } this._in(m) }
    })
  }
  _raw(topic, event, payload) {
    if (!this.ready) return null
    const ref = String(++this.seq)
    this.ws.send(JSON.stringify({ topic, event, payload, ref, join_ref: topic === this.topic ? this.joinRef : undefined }))
    return ref
  }
  _bc(event, payload) { if (this.topic) this._raw(this.topic, 'broadcast', { type: 'broadcast', event, payload }) }
  _in(m) {
    if (m.event === 'phx_reply' && this.wait[m.ref]) { const w = this.wait[m.ref]; delete this.wait[m.ref]; m.payload && m.payload.status === 'ok' ? w.ok() : w.no(m.payload) }
    else if (m.event === 'broadcast' && m.topic === this.topic && m.payload) this._onBc(m.payload.event, m.payload.payload || {})
  }
  _join(code) {
    this._leaveChannel()
    this.code = code; this.topic = 'realtime:bv-room-' + code
    this.joinRef = String(++this.seq)
    this.ws.send(JSON.stringify({ topic: this.topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } }, ref: this.joinRef, join_ref: this.joinRef }))
    return new Promise((ok, no) => { this.wait[this.joinRef] = { ok, no }; setTimeout(() => { if (this.wait[this.joinRef]) { delete this.wait[this.joinRef]; no('timeout') } }, 6000) })
  }
  _leaveChannel() {
    if (this.topic) { this._bc('bye', { id: this.id }); this._raw(this.topic, 'phx_leave', {}) }
    if (this.host) { this.host.dispose(); this.host = null }
    clearTimeout(this.joinTimer)
    this.topic = null; this.code = null; this.room = null; this.lastS = null
  }
  // 房主输出：发给自己的直接投递，其它的广播出去
  _out(to, m) {
    if (to === null || to === this.id) this._deliver(m)
    if (to !== this.id) this._bc('h', { to, m })
  }
  _deliver(m) {
    if (m.t === 'room') this.room = m.room
    if (m.t === 'snap') { this.lastS = m.s; this.lastLeft = m.left }
    this.onMessage(m)
  }
  _onBc(ev, p) {
    if (ev === 'st') {
      if (!p || p.id === this.id) return
      if (this.host) this.host.st(p.id, p.d)
      this.onMessage({ t: 'snap', p: [[p.id, ...p.d]], s: this.lastS, left: this.lastLeft })
    } else if (ev === 'h') {
      if (this.host || (p.to != null && p.to !== this.id)) return
      this.hostSeen = Date.now()
      const m = p.m || {}
      if (m.t === 'room') { clearTimeout(this.joinTimer); if (!m.room.players.some(q => q.id === this.id) && !this.joinTimer) return }
      if (m.t === 'reject') { this._leaveChannel(); this.onMessage({ t: 'error', msg: m.msg }); return }
      this._deliver(m)
    } else if (ev === 'c') {
      if (!this.host || !p) return
      const m = p.m || {}
      if (m.t === 'join') { const res = this.host.add(p.from, m.hello || {}); if (res !== true) this._bc('h', { to: p.from, m: { t: 'reject', msg: res } }) }
      else if (m.t === 'ping') this.host.seen(p.from)
      else this.host.handle(p.from, m)
    } else if (ev === 'bye') {
      if (this.host) this.host.remove(p.id)
      else if (this.room && p.id === this.room.host) this._migrate()
    }
  }
  _tick() {
    if (!this.topic || this.host) return
    this._bc('c', { from: this.id, m: { t: 'ping' } })
    if (this.room && Date.now() - this.hostSeen > 7000) this._migrate()
  }
  // 房主不见了：名单里的下一位接任房主，带着大家的名字和分数回到大厅
  _migrate() {
    const room = this.room; if (!room) return
    const old = room.players.find(q => q.id === room.host)
    const rest = room.players.filter(q => q.id !== room.host)
    this.hostSeen = Date.now()
    if (!rest.length || rest[0].id !== this.id) { room.host = rest.length ? rest[0].id : this.id; return }
    this.host = new RoomHost(this.code, this.id, (to, m) => this._out(to, m))
    this.host.r.env = { ...room.env }
    for (const q of rest) this.host.add(q.id, q, { name: q.name, color: q.color, score: q.score })
    if (old) this._out(null, { t: 'gone', id: old.id, name: old.name })
  }
  send(m) {
    if (!m || !this.ready) return
    switch (m.t) {
      case 'hello':
        this.hello = { name: m.name, char: m.char, broom: m.broom }
        if (this.host) this.host.add(this.id, this.hello); else if (this.topic) this._bc('c', { from: this.id, m })
        break
      case 'create': {
        const code = String(Math.floor(100000 + Math.random() * 900000))
        this._join(code).then(() => {
          this.host = new RoomHost(code, this.id, (to, msg) => this._out(to, msg))
          this.host.add(this.id, this.hello)
        }).catch(() => this.onMessage({ t: 'error', msg: '创建房间失败，请重试' }))
        break
      }
      case 'join': {
        const code = String(m.code || '').trim()
        this._join(code).then(() => {
          this.hostSeen = Date.now()
          this.joinTimer = setTimeout(() => { this.joinTimer = null; if (!this.room) { this._leaveChannel(); this.onMessage({ t: 'error', msg: '房间不存在，请检查房间号' }) } }, 4000)
          this._bc('c', { from: this.id, m: { t: 'join', hello: this.hello } })
        }).catch(() => this.onMessage({ t: 'error', msg: '加入房间失败，请重试' }))
        break
      }
      case 'leave': this._leaveChannel(); this.onMessage({ t: 'left' }); break
      case 'st':
        if (this.host) this.host.st(this.id, m.d)
        this._bc('st', { id: this.id, d: m.d.map(v => Math.round(v * 100) / 100) })
        break
      default:
        if (this.host) this.host.handle(this.id, m); else this._bc('c', { from: this.id, m })
    }
  }
  _cleanup() { clearInterval(this.hb); clearInterval(this.tk); if (this.host) { this.host.dispose(); this.host = null } this.topic = null; this.room = null }
  close() { this._leaveChannel(); const ws = this.ws; this.ws = null; this._cleanup(); if (ws) ws.close() }
}
