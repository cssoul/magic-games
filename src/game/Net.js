// 联机连接：默认连当前网页所在服务器的 /ws（部署后网页与服务器同源）。
// 也可以用 ?server=wss://example.com/ws 或环境变量 VITE_WS_URL 指定其它服务器。
export class Net {
  constructor(onMessage, onClose) { this.onMessage = onMessage; this.onClose = onClose; this.ws = null; this.id = null }
  url() {
    const q = new URLSearchParams(location.search).get('server')
    if (q) return q
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
  }
  connect(hello) {
    return new Promise((resolve, reject) => {
      let done = false
      const ws = this.ws = new WebSocket(this.url())
      const timer = setTimeout(() => { if (!done) { done = true; ws.close(); reject(new Error('连接超时')) } }, 6000)
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data) } catch { return }
        if (m.t === 'welcome') { this.id = m.id; this.send({ t: 'hello', ...hello }); if (!done) { done = true; clearTimeout(timer); resolve(m.id) } return }
        this.onMessage(m)
      }
      ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('无法连接服务器')) } }
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; if (done) this.onClose && this.onClose() } }
    })
  }
  get ready() { return this.ws && this.ws.readyState === 1 }
  send(m) { if (this.ready) this.ws.send(JSON.stringify(m)) }
  close() { const ws = this.ws; this.ws = null; if (ws) ws.close() }
}
