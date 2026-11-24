# 飞天扫帚 · 魔法山谷（Broomstick Valley）

项目目录：magic-games

Vue3 + Three.js（WebGL）实现，所有模型 / 材质 / 天空 / 地形 / 粒子均为代码程序化生成，无外部素材。

## 运行
```bash
npm install
npm run dev
```

## 操作
- W/S 或 ↑/↓：俯冲 / 爬升；A/D 或 ←/→：转向
- 鼠标移动：直接操控方向
- Shift / 空格：加速（消耗魔力条，穿过光环可回复）

## 玩法
穿越金色魔法光环 +100，穿过魁地奇球门 +300，抓住金色飞贼 +500。

场景物件：禁林（1800 棵实例化松树）、岩石、魁地奇球场（学院色看台 + 6 个金色球门）、城堡周围的飘浮灯笼。

## 结构
- `src/App.vue` 菜单与 HUD
- `src/game/Game.js` 渲染循环、飞行物理、追尾相机
- `src/game/Wizard.js` 巫师与扫帚模型（斗篷顶点动画、围巾飘动）
- `src/game/World.js` 着色器天空、fbm 程序化地形、城堡、云、光环、金色飞贼
- `src/game/Props.js` 禁林、岩石、魁地奇球场、飘浮灯笼
- `src/game/Trail.js` GPU 魔法粒子拖尾


## 多人对抗

### 本地开发（两个终端）
```bash
npm run server   # 终端 1：联机服务器，端口 8787
npm run dev      # 终端 2：网页，http://localhost:5173（/ws 自动代理到 8787）
```
同一 Wi-Fi 下的其他设备可以用终端里显示的 Network 地址（如 http://192.168.x.x:5173）访问。

### 部署到公网（网页和联机服务在同一个端口）
**方式 A：任意云服务器（Docker）**
```bash
docker build -t broomstick-valley .
docker run -d -p 80:8787 --restart=always broomstick-valley
```
**方式 B：Render / Railway / Fly.io 等 Node 托管平台**
- Build command：`npm install && npm run build`
- Start command：`npm start`
- 平台会注入 `PORT` 环境变量，服务器会自动使用。

**方式 C：自己的服务器 + Nginx（HTTPS）**
```bash
npm install && npm run build && PORT=8787 node server/index.js   # 建议用 pm2 守护
```
```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;     # WebSocket 必需
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 120s;
}
```
健康检查：`/health`。如果网页和服务器不在同一个域名，可以用 `?server=wss://你的域名/ws` 或打包时设置 `VITE_WS_URL` 指定服务器。

### 规则
- 房主创建房间获得 6 位房间号，其他人输入房间号加入（最多 8 人）；房主控制开始、时间和天气。
- 倒计时 4 秒开局；金色飞贼开局 15 秒后出现，有人靠近时会急转加速逃开。
- 光环 +100（先到先得，6 秒后在别处重新出现），魁地奇球门 +300（每人 3 秒冷却），抓到金色飞贼 +500 并立即结束比赛；10 分钟内没人抓到则按时结束。总分最高者获胜。
- 光环、飞贼的位置和所有得分都由服务器判定；树木、岩石用固定种子生成，所有设备看到的世界一致。
