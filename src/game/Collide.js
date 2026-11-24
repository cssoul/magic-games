// 碰撞：把场景里的实体简化成圆柱（k0）、圆锥（k1）、带旋转的长方体（k2）、球（k3），放进网格加速查询。
// 角色视为一个球，被推出到表面之外：撞墙会沿墙滑开，落在平顶上可以站住。
export class Grid {
  constructor(cell = 16) { this.cell = cell; this.m = new Map() }
  clear() { this.m.clear() }
  add(c) {
    const r = c.k === 2 ? Math.hypot(c.hx, c.hz) : c.r, s = this.cell
    for (let i = Math.floor((c.x - r) / s); i <= Math.floor((c.x + r) / s); i++)
      for (let j = Math.floor((c.z - r) / s); j <= Math.floor((c.z + r) / s); j++) {
        const key = i * 73856 + j; let a = this.m.get(key); if (!a) this.m.set(key, a = []); a.push(c)
      }
  }
  near(x, z, out) { const a = this.m.get(Math.floor(x / this.cell) * 73856 + Math.floor(z / this.cell)); if (a) for (const c of a) out.push(c) }
}
const sources = [], ZERO = { x: 0, y: 0, z: 0 }, UPN = { x: 0, y: 1, z: 0 }
export const addSource = (grid, offset = null) => sources.push({ grid, offset })
const clamp = (v, a, b) => v < a ? a : v > b ? b : v

function push(c, p, R) {
  if (c.k === 3) {
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz), rr = c.r + R
    if (d >= rr) return null
    const n = d > 1e-4 ? { x: dx / d, y: dy / d, z: dz / d } : UPN
    p.x += n.x * (rr - d); p.y += n.y * (rr - d); p.z += n.z * (rr - d); return n
  }
  if (p.y > c.y1 + R || p.y < c.y0 - R) return null
  let nx, nz, pen
  if (c.k === 2) {
    const dx = p.x - c.x, dz = p.z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c
    const ex = lx - clamp(lx, -c.hx, c.hx), ez = lz - clamp(lz, -c.hz, c.hz), d = Math.hypot(ex, ez)
    let ax, az
    if (d > 1e-5) { if (d >= R) return null; pen = R - d; ax = ex / d; az = ez / d }
    else {
      const fx = c.hx - Math.abs(lx), fz = c.hz - Math.abs(lz)
      if (fx < fz) { pen = fx + R; ax = Math.sign(lx) || 1; az = 0 } else { pen = fz + R; ax = 0; az = Math.sign(lz) || 1 }
    }
    nx = ax * c.c + az * c.s; nz = -ax * c.s + az * c.c
  } else {
    if (c.k === 1 && p.y > c.y1) return null
    const r = c.k === 1 ? c.r * (1 - clamp((p.y - c.y0) / (c.y1 - c.y0), 0, 1)) : c.r
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz)
    if (d >= r + R) return null
    pen = r + R - d; if (d > 1e-5) { nx = dx / d; nz = dz / d } else { nx = 1; nz = 0 }
  }
  if (c.k !== 1) {   // 平顶：从上方落下时站在顶上
    const up = c.y1 + R - p.y
    if (up > 0 && up < pen && p.y > c.y1 - R * .3) { p.y += up; return UPN }
  }
  p.x += nx * pen; p.z += nz * pen; return { x: nx, y: 0, z: nz }
}

const list = []
export function collide(pos, R) {
  let hit = null
  for (let it = 0; it < 3; it++) {
    let any = false
    for (const s of sources) {
      const o = s.offset ? s.offset() : ZERO, p = { x: pos.x - o.x, y: pos.y - o.y, z: pos.z - o.z }
      list.length = 0; s.grid.near(p.x, p.z, list)
      for (const c of list) { const n = push(c, p, R); if (n) { any = true; hit = n } }
      pos.x = p.x + o.x; pos.y = p.y + o.y; pos.z = p.z + o.z
    }
    if (!any) break
  }
  return hit
}
