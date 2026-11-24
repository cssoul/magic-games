// Broomstick Valley 多人对抗服务器：纯 Node.js，零依赖。
// 同一端口：HTTP 提供打包后的网页（dist/），/ws 提供 WebSocket 实时通信。
// 服务器是权威方：房间、光环、金色飞贼的位置与得分都在这里判定，客户端只上报自己的飞行状态。
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = +process.env.PORT || 8787
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }

// ---------------- HTTP：静态文件 ----------------
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0]
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: conns.size })) }
  let p; try { p = decodeURIComponent(url) } catch { p = '/' }
  if (p === '/') p = '/index.html'
  const file = path.join(DIST, path.normalize(p))
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  fs.stat(file, (e, st) => {
    const f = !e && st.isFile() ? file : path.join(DIST, 'index.html')
    fs.readFile(f, (e2, buf) => {
      if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('页面尚未打包：请先运行 npm run build') }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': f.includes(path.sep + 'assets' + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache' })
      res.end(buf)
    })
  })
})

// ---------------- 极简 WebSocket（RFC 6455） ----------------
const conns = new Set()
class Conn {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = []; this.alive = Date.now(); this.open = true
    sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); try { this._parse() } catch { this.close() } })
    sock.on('close', () => this._gone()); sock.on('error', () => this._gone())
  }
  _parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], op = b0 & 15, fin = b0 & 128, masked = b1 & 128
      let len = b1 & 127, off = 2
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4 }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10 }
      if (len > 1 << 20) return this.close()
      const need = off + (masked ? 4 : 0) + len; if (this.buf.length < need) return
      let data = this.buf.subarray(off + (masked ? 4 : 0), need)
      if (masked) { const m = this.buf.subarray(off, off + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3] }
      this.buf = this.buf.subarray(need); this.alive = Date.now()
      if (op === 8) return this.close()
      if (op === 9) { this._frame(10, data); continue }
      if (op === 10) continue
      if (op === 1 || op === 0) {
        this.frag.push(data)
        if (fin) { const s = Buffer.concat(this.frag).toString('utf8'); this.frag = []; let m; try { m = JSON.parse(s) } catch { continue } this.onmessage && this.onmessage(m) }
      }
    }
  }
  _frame(op, payload) {
    if (!this.open) return
    const n = payload.length, head = n < 126 ? Buffer.from([128 | op, n]) : n < 65536 ? Buffer.from([128 | op, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([128 | op, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b })()])
    this.sock.write(Buffer.concat([head, payload]))
  }
  send(obj) { this._frame(1, Buffer.from(JSON.stringify(obj))) }
  close() { if (this.open) { try { this._frame(8, Buffer.alloc(0)) } catch {} this.sock.end() } this._gone() }
  _gone() { if (!this.open) return; this.open = false; conns.delete(this); this.onclose && this.onclose() }
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']
  if (!(req.url || '').startsWith('/ws') || !key) return sock.destroy()
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n')
  sock.setNoDelay(true)
  const c = new Conn(sock); conns.add(c); onConnect(c)
})
setInterval(() => { const now = Date.now(); for (const c of conns) { if (now - c.alive > 45000) c.close(); else c._frame(9, Buffer.alloc(0)) } }, 15000)

// ---------------- 游戏规则 ----------------
const COUNTDOWN = 4, DURATION = 600, RELEASE = 15, HZ = 15, MAXP = 8, NRINGS = 18
const CENTER = { x: -90, z: -230 }, AREA = 480
const COLORS = ['#ffd36b', '#7ec8ff', '#ff8fa3', '#9be37a', '#c49bff', '#ffb067', '#6ee0d2', '#f2f2f2']
const CHARS = ['xiao', 'ari', 'lin', 'ella'], BROOMS = ['classic', 'racer', 'antique']
const rooms = new Map()
let nextId = 1
const rnd = (a, b) => a + Math.random() * (b - a)
const r2 = v => Math.round(v * 100) / 100

function view(r) {
  return { code: r.code, host: r.host, state: r.state, env: r.env,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, char: p.char, broom: p.broom, color: p.color, score: p.score })) }
}
const bcast = (r, m) => { const s = JSON.stringify(m), b = Buffer.from(s); for (const p of r.players.values()) p.c._frame(1, b) }
const pushRoom = r => bcast(r, { t: 'room', room: view(r) })
function newCode() { let c; do c = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(c)); return c }
function ringAt(id) {
  const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * AREA
  return { id, x: r2(CENTER.x + Math.cos(a) * d), y: r2(rnd(45, 125)), z: r2(CENTER.z + Math.sin(a) * d), yaw: r2(Math.random() * Math.PI), on: true }
}
function uniqueName(r, name) {
  const used = new Set([...r.players.values()].map(p => p.name)); if (!used.has(name)) return name
  for (let i = 2; ; i++) if (!used.has(name + i)) return name + i
}

function onConnect(c) {
  const me = { id: nextId++, c, name: '巫师', char: 'xiao', broom: 'classic', room: null, score: 0, st: null }
  c.send({ t: 'welcome', id: me.id })
  c.onclose = () => leave(me)
  c.onmessage = m => {
    if (!m || typeof m.t !== 'string') return
    const r = me.room
    switch (m.t) {
      case 'hello':
        me.name = String(m.name || '').trim().slice(0, 12) || '巫师'
        if (CHARS.includes(m.char)) me.char = m.char
        if (BROOMS.includes(m.broom)) me.broom = m.broom
        if (r) pushRoom(r); break
      case 'create': {
        leave(me)
        const room = { code: newCode(), host: me.id, state: 'lobby', players: new Map(), env: { tod: 'day', weather: 'clear' }, rings: [], sn: null }
        rooms.set(room.code, room); join(me, room); break
      }
      case 'join': {
        const room = rooms.get(String(m.code || '').trim())
        if (!room) return c.send({ t: 'error', msg: '房间不存在，请检查房间号' })
        if (room === r) return
        if (room.players.size >= MAXP) return c.send({ t: 'error', msg: '房间已满（最多 ' + MAXP + ' 人）' })
        if (room.state !== 'lobby') return c.send({ t: 'error', msg: '比赛进行中，请等这一局结束再加入' })
        leave(me); join(me, room); break
      }
      case 'leave': leave(me); c.send({ t: 'left' }); break
      case 'env':
        if (r && r.host === me.id) { if (['day', 'dusk', 'night', 'auto'].includes(m.tod)) r.env.tod = m.tod; if (['clear', 'rain', 'snow'].includes(m.weather)) r.env.weather = m.weather; pushRoom(r) }
        break
      case 'start': if (r && r.host === me.id && r.state === 'lobby') startMatch(r); break
      case 'again': if (r && r.host === me.id && r.state === 'ended') { r.state = 'lobby'; for (const p of r.players.values()) { p.score = 0; p.st = null } pushRoom(r) } break
      case 'st':
        if (r && r.state === 'playing' && Array.isArray(m.d) && m.d.length === 8 && m.d.every(Number.isFinite)) me.st = m.d.map(r2)
        break
      case 'ring': {
        if (!r || !live(r)) return
        const g = r.rings[m.id]; if (!g || !g.on || !me.st) return
        if (Math.hypot(me.st[0] - g.x, me.st[2] - g.z) > 14) return
        g.on = false; bcast(r, { t: 'ringOff', id: g.id, by: me.id }); award(r, me, 100, 'rings')
        setTimeout(() => { if (r.rings[g.id] === g && r.state === 'playing') { const n = ringAt(g.id); r.rings[g.id] = n; bcast(r, { t: 'ringOn', ring: n }) } }, 6000)
        break
      }
      case 'hoop':
        if (!r || !live(r)) return
        if (Date.now() - (me.hoopT || 0) < 3000) return
        me.hoopT = Date.now(); award(r, me, 300, 'hoops'); break
      case 'catch': {
        if (!r || !live(r) || !r.sn.out || !me.st) return
        const s = r.sn
        if (Math.hypot(me.st[0] - s.x, me.st[2] - s.z) > 12 || Math.abs(me.st[1] - s.y) > 45) return
        award(r, me, 500, 'snitch'); endMatch(r, 'catch', me.id); break
      }
    }
  }
}
const live = r => r.state === 'playing' && Date.now() >= r.startAt
function award(r, p, pts, kind) { p.score += pts; p[kind] = (p[kind] || 0) + 1; bcast(r, { t: 'score', id: p.id, name: p.name, pts, kind, total: p.score }) }
function join(p, r) {
  p.room = r; p.score = 0; p.st = null
  p.name = uniqueName(r, p.name)
  const used = new Set([...r.players.values()].map(q => q.color)); p.color = COLORS.find(c => !used.has(c)) || COLORS[0]
  r.players.set(p.id, p); pushRoom(r)
}
function leave(p) {
  const r = p.room; if (!r) return
  r.players.delete(p.id); p.room = null
  if (!r.players.size) return rooms.delete(r.code)
  if (r.host === p.id) r.host = r.players.keys().next().value
  bcast(r, { t: 'gone', id: p.id, name: p.name })
  pushRoom(r)
}
function startMatch(r) {
  r.state = 'playing'; r.startAt = Date.now() + COUNTDOWN * 1000; r.result = null
  r.rings = Array.from({ length: NRINGS }, (_, i) => ringAt(i))
  r.sn = { out: false, x: CENTER.x, y: 70, z: CENTER.z, vx: 0, vy: 0, vz: 0, tx: 0, ty: 70, tz: 0, t: 0 }
  let i = 0
  for (const p of r.players.values()) { p.score = 0; p.rings = p.hoops = p.snitch = 0; p.st = null; p.slot = i++ }
  pushRoom(r)
  for (const p of r.players.values()) p.c.send({ t: 'go', countdown: COUNTDOWN, duration: DURATION, release: RELEASE, slot: p.slot, rings: r.rings })
}
function endMatch(r, reason, winner) {
  if (r.state !== 'playing') return
  r.state = 'ended'
  const ranking = [...r.players.values()].sort((a, b) => b.score - a.score).map(p => ({ id: p.id, name: p.name, char: p.char, color: p.color, score: p.score, rings: p.rings || 0, hoops: p.hoops || 0, snitch: p.snitch || 0 }))
  bcast(r, { t: 'end', reason, winner: winner ?? (ranking[0] && ranking[0].id), ranking })
  pushRoom(r)
}
// 金色飞贼：在场地上空游荡；有人靠近时急转、加速逃开
function snitchStep(r, dt) {
  const s = r.sn, el = (Date.now() - r.startAt) / 1000
  if (!s.out) {
    if (el < RELEASE) return
    s.out = true; const a = Math.random() * 6.283; s.x = CENTER.x + Math.cos(a) * 150; s.z = CENTER.z + Math.sin(a) * 150; s.y = 80
    bcast(r, { t: 'snitchOut' })
  }
  let near = null, nd = 1e9
  for (const p of r.players.values()) if (p.st) { const d = Math.hypot(p.st[0] - s.x, p.st[1] - s.y, p.st[2] - s.z); if (d < nd) { nd = d; near = p } }
  let speed = 11
  s.t -= dt
  if (near && nd < 30) {
    speed = 24 + (30 - nd) * .5
    if (s.t < 0) {
      const ax = s.x - near.st[0], ay = s.y - near.st[1], az = s.z - near.st[2], L = Math.hypot(ax, ay, az) || 1
      const side = Math.random() < .5 ? -1 : 1
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
setInterval(() => {
  const dt = 1 / HZ
  for (const r of rooms.values()) {
    if (r.state !== 'playing') continue
    const el = (Date.now() - r.startAt) / 1000
    if (el > 0) snitchStep(r, dt)
    if (el >= DURATION) { endMatch(r, 'time'); continue }
    const ps = []; for (const p of r.players.values()) if (p.st) ps.push([p.id, ...p.st])
    bcast(r, { t: 'snap', p: ps, s: r.sn.out ? [r2(r.sn.x), r2(r.sn.y), r2(r.sn.z)] : null, left: Math.ceil(DURATION - Math.max(0, el)) })
  }
}, 1000 / HZ)

server.listen(PORT, () => console.log(`Broomstick Valley 服务器已启动：http://localhost:${PORT}  （WebSocket: /ws）`))
