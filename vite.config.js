import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// 开发时：npm run server 启动联机服务器（8787 端口），这里把 /ws 代理过去；host: true 让局域网设备也能访问
export default defineConfig({
  plugins: [vue()],
  server: { host: true, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } }
})
