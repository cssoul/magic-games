// Supabase 配置。publishable key 本来就是给浏览器用的公开密钥，可以放进前端代码；
// 数据库连接串（含密码）绝不能放进前端或提交到 GitHub。
// 也可以在 Vercel 的 Environment Variables 里用 VITE_SUPABASE_URL / VITE_SUPABASE_KEY 覆盖。
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://umkwakonenjrgqygsqae.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_5IiRkSnBdb24cxoH1Uhy9w_UvlzQ3rL'
