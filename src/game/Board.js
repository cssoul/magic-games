import { SUPABASE_URL, SUPABASE_KEY } from '../config.js'

// 全球排行榜：Supabase 数据库 public.scores 表（建表 SQL 见 supabase/migrations）
const H = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }
export async function topScores(mode = 'challenge', n = 10) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/scores?select=name,char,score,rings,hoops,snitch,created_at&mode=eq.${mode}&order=score.desc,created_at.asc&limit=${n}`, { headers: H })
  if (!r.ok) throw new Error(r.status === 404 ? '全球排行榜还没有建表' : '读取失败 ' + r.status)
  return r.json()
}
export async function submitScore(rec) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/scores`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ mode: rec.mode, name: String(rec.name || '巫师').slice(0, 12), char: rec.char, score: rec.score | 0, rings: rec.rings | 0, hoops: rec.hoops | 0, snitch: rec.snitch | 0 }) })
  } catch {}
}
