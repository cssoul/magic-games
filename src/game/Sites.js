// 城堡群的选址：每处把地形压成一块台地；所有城堡按 TILE 周期在无限世界里重复出现
export const TILE = 2200
export const SITES = [
  { x: 120, z: -380, rx: 118, rz: 98, kind: 'hogwarts', lift: 18 },   // 霍格沃茨式主城堡（临湖高台）
  { x: -60, z: 300, rx: 88, rz: 68, kind: 'cathedral', lift: 3 },     // 大教堂小镇
  { x: 470, z: 140, rx: 78, rz: 78, kind: 'fortress', lift: 8 },      // 城墙要塞
  { x: -540, z: -470, rx: 48, rz: 48, kind: 'ruin', lift: 5 },        // 古堡废墟
  { x: -560, z: 330, rx: 66, rz: 66, kind: 'spires', lift: 10 },      // 尖塔城堡
  { x: 720, z: -660, rx: 78, rz: 78, kind: 'fortress', lift: 6 }
]
let raw = null
export const setRawHeight = fn => { raw = fn }
const levels = new Map()
const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }
export function siteCenter(i, x, z) {
  const s = SITES[i], tx = Math.round((x - s.x) / TILE), tz = Math.round((z - s.z) / TILE)
  return { x: s.x + tx * TILE, z: s.z + tz * TILE, tx, tz }
}
export function siteLevel(i, tx, tz) {
  const key = i + ',' + tx + ',' + tz
  if (!levels.has(key)) {
    const s = SITES[i], cx = s.x + tx * TILE, cz = s.z + tz * TILE; let sum = 0
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; sum += raw(cx + Math.cos(a) * s.rx * 1.15, cz + Math.sin(a) * s.rz * 1.15) }
    levels.set(key, Math.max(sum / 24 + s.lift, 8))
  }
  return levels.get(key)
}
export function flattenSites(x, z, h) {
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i], tx = Math.round((x - s.x) / TILE), tz = Math.round((z - s.z) / TILE)
    const e = Math.hypot((x - s.x - tx * TILE) / s.rx, (z - s.z - tz * TILE) / s.rz)
    if (e < 1.9) { const L = siteLevel(i, tx, tz); h = L + (h - L) * sm(1.0, 1.9, e) }
  }
  return h
}
export function siteClear(x, z, pad = 0) {
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i], tx = Math.round((x - s.x) / TILE), tz = Math.round((z - s.z) / TILE)
    if (Math.hypot((x - s.x - tx * TILE) / (s.rx + pad), (z - s.z - tz * TILE) / (s.rz + pad)) < 1) return false
  }
  return true
}
