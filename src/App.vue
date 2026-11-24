<template>
  <div class="wrap" :class="{ touch: isTouch }">
    <div ref="host" class="host"></div>
    <div class="loading" :class="{ gone: state.ready }"></div>

    <!-- 主菜单 -->
    <transition name="fade">
      <div v-if="screen === 'menu' && !state.started && state.ready && !showBoard" class="menu">
        <h1>Broomstick Valley</h1>
        <p class="cn">飞 天 扫 帚 · 魔 法 山 谷</p>
        <p class="sub">骑上扫帚，飞越城堡、湖泊与开满野花的山谷</p>
        <p class="hello">你好，{{ profile.name }} · {{ charOf(profile.char).name }} · {{ broomOf(profile.broom).name }}<a @click.stop="screen = 'name'">改名</a></p>
        <div class="modes">
          <button @click.stop="start('free')"><b>自由飞行</b><span>随心穿越山谷与城堡</span></button>
          <button @click.stop="start('challenge')"><b>限时挑战</b><span>10 分钟 · 穿环、球门、抓飞贼</span></button>
          <button @click.stop="openMp"><b>多人对抗</b><span>房间号联机 · 先抓飞贼者胜</span></button>
          <button @click.stop="openDress('menu')"><b>角色与扫帚</b><span>4 位角色 · 3 种扫帚</span></button>
          <button @click.stop="showBoard = true"><b>排行榜</b><span>{{ records.length ? '最高分 ' + records[0].score : '暂无记录' }}</span></button>
        </div>
        <p v-if="isTouch" class="keys">左下摇杆控制方向 · 右下按住加速 · 右上暂停 · 横屏体验更佳</p>
        <p v-else class="keys">W S 俯仰 · A D 转向 · 鼠标操控 · Shift / 空格 加速 · P 暂停 · T 时间 · Y 天气 · M 静音</p>
      </div>
    </transition>

    <!-- 用户名 -->
    <transition name="fade">
      <div v-if="screen === 'name' && state.ready" class="panel" @click.stop>
        <h2>你的名字</h2>
        <p class="hint">多人对抗时，其他玩家会在你头顶看到这个名字</p>
        <input v-model="nameInput" class="field" maxlength="12" placeholder="输入用户名（最多 12 个字）" @keydown.enter="saveName" />
        <p class="err">{{ err }}</p>
        <div class="row"><button class="ghost" @click="saveName">确定</button></div>
      </div>
    </transition>

    <!-- 角色与扫帚（右侧是实时 3D 预览） -->
    <transition name="fade">
      <div v-if="screen === 'dress'" class="dress" @click.stop>
        <h2>选择角色</h2>
        <div class="cards">
          <button v-for="c in CHARACTERS" :key="c.id" :class="{ on: profile.char === c.id }" @click="pick('char', c.id)">
            <i :style="{ background: `linear-gradient(135deg, ${c.scarf[0]} 50%, ${c.scarf[1]} 50%)` }"></i><b>{{ c.name }}<em>{{ c.gender }}</em></b><span>{{ c.desc }}</span>
          </button>
        </div>
        <h2>选择扫帚</h2>
        <div class="cards">
          <button v-for="b in BROOMS" :key="b.id" :class="{ on: profile.broom === b.id }" @click="pick('broom', b.id)">
            <i :style="{ background: `linear-gradient(135deg, ${b.wood} 55%, ${b.metal} 55%)` }"></i><b>{{ b.name }}</b><span>{{ b.desc }}</span>
          </button>
        </div>
        <p class="hint">拖动画面旋转查看 · 滚轮缩放 · 三种扫帚只有外观不同</p>
        <div class="row"><button class="ghost" @click="closeDress">完成</button></div>
      </div>
    </transition>

    <!-- 多人对抗：创建 / 加入房间 -->
    <transition name="fade">
      <div v-if="screen === 'mp'" class="panel" @click.stop>
        <h2>多人对抗</h2>
        <p class="hint">金色飞贼会在开局 15 秒后出现。先抓到它的人 +500 分并立即结束比赛，总分最高者获胜</p>
        <div class="row"><button class="ghost" :disabled="busy" @click="createRoom">创建房间</button></div>
        <p class="or">或输入房间号加入</p>
        <div class="row">
          <input v-model="codeInput" class="field code" maxlength="6" inputmode="numeric" placeholder="6 位房间号" @keydown.enter="joinRoom" />
          <button class="ghost" :disabled="busy" @click="joinRoom">加入</button>
        </div>
        <p class="err">{{ busy ? '正在连接服务器…' : err }}</p>
        <div class="row"><button class="ghost dim" @click="backToMenu">返回</button></div>
      </div>
    </transition>

    <!-- 房间大厅 -->
    <transition name="fade">
      <div v-if="screen === 'lobby' && room && !state.started" class="panel lobby" @click.stop>
        <h2>房间号</h2>
        <div class="big code" @click="copyCode">{{ room.code }}</div>
        <p class="hint">{{ copied ? '已复制房间号' : '点击复制，发给朋友一起来玩' }}</p>
        <table>
          <tr><th>玩家</th><th>角色</th><th>扫帚</th></tr>
          <tr v-for="p in room.players" :key="p.id" :class="{ me: p.id === myId }">
            <td><i class="dot" :style="{ background: p.color }"></i>{{ p.name }}<span v-if="p.id === room.host" class="crown">房主</span></td>
            <td>{{ charOf(p.char).name }}</td><td>{{ broomOf(p.broom).name }}</td>
          </tr>
        </table>
        <p class="hint">{{ room.players.length < 2 ? '等待其他玩家加入…（一个人也可以先开始试玩）' : room.players.length + ' 名玩家 · 最多 8 人' }}</p>
        <p class="err">{{ err }}</p>
        <div class="row">
          <button v-if="isHost" class="ghost" @click="startRoom">开始比赛</button>
          <span v-else class="hint wait">等待房主开始…</span>
          <button class="ghost" @click="openDress('lobby')">换角色</button>
          <button class="ghost dim" @click="leaveRoom">离开房间</button>
        </div>
      </div>
    </transition>

    <!-- 多人：开局倒计时 -->
    <div v-if="state.mode === 'mp' && state.started && state.countdown >= 0" :key="state.countdown" class="count">{{ state.countdown || '开始！' }}</div>

    <!-- 多人：结算 -->
    <transition name="fade">
      <div v-if="state.mpEnd" class="panel result" @click.stop>
        <h2>{{ state.mpEnd.reason === 'catch' ? nameOf(state.mpEnd.winner) + ' 抓住了金色飞贼！' : '时间到' }}</h2>
        <p class="rank">{{ state.mpEnd.ranking[0] && state.mpEnd.ranking[0].id === myId ? '你赢了！' : '冠军：' + (state.mpEnd.ranking[0] ? state.mpEnd.ranking[0].name : '') }}</p>
        <table>
          <tr><th>名次</th><th>玩家</th><th>得分</th><th>光环</th><th>球门</th><th>飞贼</th></tr>
          <tr v-for="(r, i) in state.mpEnd.ranking" :key="r.id" :class="{ me: r.id === myId }">
            <td>{{ i + 1 }}</td><td><i class="dot" :style="{ background: r.color }"></i>{{ r.name }}</td><td class="sc">{{ r.score }}</td><td>{{ r.rings }}</td><td>{{ r.hoops }}</td><td>{{ r.snitch }}</td>
          </tr>
        </table>
        <div class="row">
          <button v-if="isHost" class="ghost" @click="again">再来一局</button>
          <span v-else class="hint wait">等待房主开始下一局…</span>
          <button class="ghost dim" @click="leaveRoom">离开房间</button>
        </div>
      </div>
    </transition>

    <!-- 排行榜 -->
    <transition name="fade">
      <div v-if="showBoard" class="panel" @click.stop>
        <h2>排行榜 · 限时挑战</h2>
        <div class="tabs"><button :class="{ on: boardTab === 'global' }" @click="boardTab = 'global'">全球</button><button :class="{ on: boardTab === 'local' }" @click="boardTab = 'local'">本机</button></div>
        <template v-if="boardTab === 'global'">
          <table v-if="globalRows.length">
            <tr><th>名次</th><th>玩家</th><th>得分</th><th>光环</th><th>球门</th><th>飞贼</th></tr>
            <tr v-for="(r, i) in globalRows" :key="i" :class="{ me: r.name === profile.name }"><td>{{ i + 1 }}</td><td>{{ r.name }}</td><td class="sc">{{ r.score }}</td><td>{{ r.rings }}</td><td>{{ r.hoops }}</td><td>{{ r.snitch }}</td></tr>
          </table>
          <p v-else class="empty">{{ globalErr || '还没有人上榜，去挑战一次吧' }}</p>
        </template>
        <template v-else>
        <table v-if="records.length">
          <tr><th>名次</th><th>得分</th><th>光环</th><th>球门</th><th>飞贼</th><th>时间</th></tr>
          <tr v-for="(r, i) in records" :key="r.t" :class="{ me: r.t === lastT }">
            <td>{{ i + 1 }}</td><td class="sc">{{ r.score }}</td><td>{{ r.rings }}</td><td>{{ r.hoops }}</td><td>{{ r.snitch }}</td><td>{{ fmt(r.t) }}</td>
          </tr>
        </table>
        <p v-else class="empty">还没有记录，去挑战一次吧</p>
        </template>
        <div class="row">
          <button class="ghost" @click="showBoard = false">返回</button>
          <button v-if="records.length && boardTab === 'local'" class="ghost dim" @click="clearRecords">清空本机记录</button>
        </div>
      </div>
    </transition>

    <!-- 挑战结算 -->
    <transition name="fade">
      <div v-if="state.finished && !showBoard && state.mode !== 'mp'" class="panel result" @click.stop>
        <h2>时间到</h2>
        <div class="big">{{ state.score }}</div>
        <p>光环 {{ state.rings }} · 球门 {{ state.hoops }} · 飞贼 {{ state.snitch }}</p>
        <p class="rank">{{ rankText }}</p>
        <div class="row">
          <button class="ghost" @click="start('challenge')">再来一次</button>
          <button class="ghost" @click="showBoard = true">排行榜</button>
          <button class="ghost" @click="toMenu">主菜单</button>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="state.paused" class="paused">
        <b>暂停中</b>
        <span>拖动鼠标旋转视角 · 滚轮缩放 · 按 P 或 Esc 继续飞行</span>
        <button class="ghost small" @click.stop="toMenu">返回主菜单</button>
      </div>
    </transition>

    <div class="note" :class="{ on: state.noteOn }">{{ state.note }}</div>

    <transition name="fade">
      <div v-if="state.started && !state.intro" class="hud">
        <canvas ref="compassEl" class="compass"></canvas>
        <div v-if="state.mode === 'challenge' || state.mode === 'mp'" class="timer" :class="{ hurry: state.timeLeft <= 30 }">{{ timeText }}</div>
        <div class="score">{{ state.score }}</div>
        <div v-if="state.mode === 'mp' && room" class="live">
          <div v-for="(p, i) in liveRank" :key="p.id" :class="{ me: p.id === myId }"><i class="dot" :style="{ background: p.color }"></i>{{ i + 1 }}. {{ p.name }}<b>{{ p.score }}</b></div>
          <div v-if="!state.snitchOut" class="hint">金色飞贼即将出现…</div>
        </div>
        <div class="tally">光环 {{ state.rings }}<i>·</i>球门 {{ state.hoops }}<i>·</i>飞贼 {{ state.snitch }}</div>
        <div class="boost"><span :style="{ transform: `scaleX(${state.boost})` }"></span></div>
        <div class="fps">{{ state.fps }} fps</div>
        <button class="round" @click.stop="togglePause">{{ state.paused ? '▶' : 'Ⅱ' }}</button>
        <button class="round mute" :class="{ off: state.muted }" @click.stop="toggleMute">♪</button>
        <div class="minimap">
          <canvas ref="mapEl"></canvas>
          <div class="coord">{{ coord }}</div>
        </div>
      </div>
    </transition>

    <!-- 触屏操控：左下虚拟摇杆、右下加速键 -->
    <template v-if="isTouch && state.started && !state.paused && !state.finished && !state.mpEnd">
      <div class="stick" @pointerdown.stop.prevent="stickDown" @pointermove.stop.prevent="stickMove" @pointerup.stop.prevent="stickUp" @pointercancel.stop="stickUp">
        <i :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"></i>
      </div>
      <button class="boostBtn" :class="{ on: boosting }" @pointerdown.stop.prevent="setBoost(true)" @pointerup.stop.prevent="setBoost(false)" @pointercancel.stop="setBoost(false)" @pointerleave="setBoost(false)" @contextmenu.prevent>加速</button>
    </template>

    <!-- 时间与天气 -->
    <div v-if="state.ready && !showBoard && !state.intro && screen !== 'dress' && screen !== 'name' && !(isTouch && state.started)" class="env" :class="{ locked: envLocked }" @click.stop>
      <div><label>{{ envLocked ? '房主' : '时间' }}</label><button v-for="o in TOD" :key="o[0]" :class="{ on: state.tod === o[0] }" @click="setTime(o[0])" :disabled="envLocked">{{ o[1] }}</button></div>
      <div><label>天气</label><button v-for="o in WEA" :key="o[0]" :class="{ on: state.weather === o[0] }" @click="setWeather(o[0])" :disabled="envLocked">{{ o[1] }}</button></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Game } from './game/Game.js'
import { CHARACTERS, BROOMS, charById as charOf, broomById as broomOf } from './game/Wizard.js'
import { Net } from './game/Net.js'
import { RealtimeNet } from './game/RealtimeNet.js'
import { topScores, submitScore } from './game/Board.js'
// 默认走 Supabase Realtime（可部署到 Vercel）；带 ?server=wss://... 或设置 VITE_WS_URL 时改用自建的 server/index.js
const NetImpl = new URLSearchParams(location.search).get('server') || import.meta.env.VITE_WS_URL ? Net : RealtimeNet
// 本地存储：隐私模式或被禁用时静默失败，不影响游戏
const store = { get: k => { try { return window.localStorage ? window.localStorage.getItem(k) : null } catch { return null } }, set: (k, v) => { try { window.localStorage && window.localStorage.setItem(k, v) } catch {} }, del: k => { try { window.localStorage && window.localStorage.removeItem(k) } catch {} } }

const TOD = [['day', '白天'], ['dusk', '黄昏'], ['night', '夜晚'], ['auto', '循环']]
const WEA = [['clear', '晴'], ['rain', '雨'], ['snow', '雪']]
const host = ref(null), mapEl = ref(null), compassEl = ref(null)
const state = reactive({ ready: false, started: false, mode: 'free', score: 0, rings: 0, hoops: 0, snitch: 0, boost: 1, fps: 60, note: '', noteOn: false,
  paused: false, muted: false, intro: false, countdown: -1, mpEnd: null, snitchOut: false, finished: false, timeLeft: 600, tod: 'day', weather: 'clear' })
let game = null, raf = 0, frame = 0

// ---------------- 排行榜（本地存储） ----------------
const KEY = 'magic-games-records'
const load = () => { try { return JSON.parse(store.get(KEY)) || [] } catch { return [] } }
const records = ref(load()), showBoard = ref(false), lastT = ref(0), rankText = ref('')
const fmt = t => new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function clearRecords() { records.value = []; store.del(KEY) }
watch(() => state.finished, v => {
  if (!v || state.mode === 'mp') return
  const rec = { score: state.score, rings: state.rings, hoops: state.hoops, snitch: state.snitch, t: Date.now() }
  const all = [...records.value, rec].sort((a, b) => b.score - a.score || a.t - b.t).slice(0, 10)
  records.value = all; store.set(KEY, JSON.stringify(all)); lastT.value = rec.t
  submitScore({ mode: 'challenge', name: profile.name, char: profile.char, ...rec }).then(loadGlobal)
  const i = all.findIndex(r => r.t === rec.t)
  rankText.value = i === 0 ? (all.length > 1 ? '新纪录！排名第 1' : '首个记录！') : i > 0 ? `排名第 ${i + 1} · 最高分 ${all[0].score}` : `未进入前 10 · 最高分 ${all[0].score}`
})
// 全球排行榜（Supabase）
const globalRows = ref([]), globalErr = ref(''), boardTab = ref('global')
async function loadGlobal() { try { globalRows.value = await topScores('challenge'); globalErr.value = '' } catch (e) { globalErr.value = e.message } }
watch(showBoard, v => { if (v) loadGlobal() })
watch(() => state.mpEnd, e => {
  if (!e) return
  const me = e.ranking.find(r => r.id === myId.value)
  if (me) submitScore({ mode: 'mp', name: me.name, char: me.char, score: me.score, rings: me.rings, hoops: me.hoops, snitch: me.snitch })
})
const timeText = computed(() => { const s = Math.max(0, state.timeLeft); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') })

function start(mode) { showBoard.value = false; if (!game) return; game.setPreview(false); game.start(mode) }
function toMenu() { showBoard.value = false; if (state.mode === 'mp') { leaveRoom(); backToMenu(); return } game && game.toMenu(); screen.value = 'menu' }

// ---------------- 用户名、角色、扫帚（保存在本机） ----------------
const PKEY = 'bv-profile'
const profile = reactive(Object.assign({ name: '', char: 'xiao', broom: 'classic' }, (() => { try { return JSON.parse(store.get(PKEY)) || {} } catch { return {} } })()))
const saveProfile = () => store.set(PKEY, JSON.stringify(profile))
const screen = ref(profile.name ? 'menu' : 'name'), nameInput = ref(profile.name), err = ref('')
let dressFrom = 'menu'
function saveName() {
  const n = nameInput.value.trim()
  if (!n) { err.value = '请输入用户名'; return }
  profile.name = n.slice(0, 12); saveProfile(); err.value = ''
  if (net) net.send({ t: 'hello', ...hello() })
  screen.value = 'menu'
}
function openDress(from) { dressFrom = from; screen.value = 'dress'; game && game.setPreview(true) }
function closeDress() { game && game.setPreview(false); screen.value = dressFrom }
function pick(kind, id) { profile[kind] = id; game && game.setLook(profile.char, profile.broom); saveProfile(); if (net) net.send({ t: 'hello', ...hello() }) }

// ---------------- 多人对抗 ----------------
let net = null
const room = ref(null), myId = ref(0), busy = ref(false), codeInput = ref(''), copied = ref(false)
const isHost = computed(() => !!room.value && room.value.host === myId.value)
const envLocked = computed(() => !!room.value && !isHost.value)
const liveRank = computed(() => room.value ? [...room.value.players].sort((a, b) => b.score - a.score) : [])
const hello = () => ({ name: profile.name, char: profile.char, broom: profile.broom })
const nameOf = id => { const p = room.value && room.value.players.find(q => q.id === id); return p ? p.name : '有人' }
function openMp() { err.value = ''; screen.value = 'mp' }
async function ensureNet() {
  if (net && net.ready) return true
  busy.value = true; err.value = ''
  net = new NetImpl(onNet, onNetClose)
  try { myId.value = await net.connect(hello()); return true }
  catch (e) { err.value = e.message + '，请检查网络后重试'; net = null; return false }
  finally { busy.value = false }
}
async function createRoom() { game && game.audio.init(); if (await ensureNet()) net.send({ t: 'create' }) }
async function joinRoom() {
  game && game.audio.init()      // 手机浏览器必须在点按时开启声音
  const c = codeInput.value.trim()
  if (!/^\d{6}$/.test(c)) { err.value = '请输入 6 位数字房间号'; return }
  if (await ensureNet()) net.send({ t: 'join', code: c })
}
function onNet(m) {
  if (m.t === 'room') {
    room.value = m.room; err.value = ''
    if (m.room.state === 'lobby' && game.mode === 'mp' && game.running) game.leaveMatch()
    if (screen.value === 'mp' || (screen.value !== 'dress' && !state.started)) screen.value = 'lobby'
    if (game.multi) game.multi.roster(m.room.players, myId.value)
    if (m.room.env.tod !== state.tod) game.env.setTime(m.room.env.tod)
    if (m.room.env.weather !== state.weather) game.env.setWeather(m.room.env.weather)
  } else if (m.t === 'error') err.value = m.msg
  else if (m.t === 'go') {
    showBoard.value = false; if (screen.value === 'dress') closeDress()
    screen.value = 'lobby'; game.startMulti(net, myId.value, m); game.multi.roster(room.value.players, myId.value)
  } else if (m.t === 'score') {
    const p = room.value && room.value.players.find(q => q.id === m.id); if (p) p.score = m.total
    game.onNet(m)
  } else if (m.t === 'gone') { if (state.started) game._note(m.name + ' 离开了房间') }
  else if (m.t === 'left') room.value = null
  else game.onNet(m)
}
function onNetClose() {
  net = null
  if (game.mode === 'mp') game.leaveMatch()
  if (room.value) { room.value = null; screen.value = 'mp'; err.value = '与服务器的连接断开了' }
}
function startRoom() { net && net.send({ t: 'start' }) }
function again() { net && net.send({ t: 'again' }) }
function leaveRoom() { if (net) net.send({ t: 'leave' }); room.value = null; if (game.mode === 'mp') game.leaveMatch(); screen.value = 'mp' }
function backToMenu() { err.value = ''; if (net) { net.close(); net = null } room.value = null; screen.value = 'menu' }
function copyCode() { if (!room.value) return; navigator.clipboard && navigator.clipboard.writeText(room.value.code).catch(() => {}); copied.value = true; setTimeout(() => (copied.value = false), 1500) }
function setTime(n) { if (room.value) { if (isHost.value) net.send({ t: 'env', tod: n }); return } game && game.env.setTime(n) }
function setWeather(n) { if (room.value) { if (isHost.value) net.send({ t: 'env', weather: n }); return } game && game.env.setWeather(n) }
function togglePause() { game && game.togglePause() }
function toggleMute() { if (game) state.muted = game.audio.toggleMute() }

// ---------------- 小地图 ----------------
const MR = 420                       // 小地图半径（米）
const terr = document.createElement('canvas'), TN = 112
terr.width = terr.height = TN
let terrAt = null
const coord = ref('')
const PALETTE = [[0, [79, 128, 48]], [.15, [79, 128, 48]], [.4, [134, 160, 70]], [.7, [154, 144, 128]], [.85, [247, 244, 238]]]
function landRGB(h) {
  if (h < 2.6) return [118, 160, 196]
  const t = (h + 10) / 160
  for (let i = 1; i < PALETTE.length; i++) if (t < PALETTE[i][0]) {
    const [a, ca] = PALETTE[i - 1], [b, cb] = PALETTE[i], k = (t - a) / (b - a)
    return ca.map((v, j) => v + (cb[j] - v) * k)
  }
  return PALETTE[PALETTE.length - 1][1]
}
function rebuildTerrain(x, z) {
  const H = game.world.heightAt, ext = MR * 1.5, step = ext * 2 / TN, hs = new Float32Array((TN + 1) * (TN + 1))
  for (let j = 0; j <= TN; j++) for (let i = 0; i <= TN; i++) hs[j * (TN + 1) + i] = H(x - ext + i * step, z - ext + j * step)
  const g = terr.getContext('2d'), img = g.createImageData(TN, TN)
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const h = hs[j * (TN + 1) + i], dx = hs[j * (TN + 1) + i + 1] - h, dz = hs[(j + 1) * (TN + 1) + i] - h
    const c = landRGB(h), sh = h < 2.6 ? 1 : Math.max(.6, Math.min(1.3, 1 - (dx * .7 + dz * .5) / step * 1.4)), o = (j * TN + i) * 4
    img.data[o] = c[0] * sh; img.data[o + 1] = c[1] * sh; img.data[o + 2] = c[2] * sh; img.data[o + 3] = 255
  }
  g.putImageData(img, 0, 0); terrAt = { x, z }
}
function sized(c, w, h) {
  const d = Math.min(devicePixelRatio, 2)
  if (c.width !== w * d) { c.width = w * d; c.height = h * d }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h); return g
}
function rel(m) { const cy = Math.cos(m.yaw), sy = Math.sin(m.yaw); return (x, z) => { const dx = x - m.x, dz = z - m.z; return [dx * cy - dz * sy, dx * sy + dz * cy] } }
const dist = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'
function drawCastle(g, x, y, s, col) {
  g.fillStyle = col; g.beginPath()
  g.moveTo(x - s, y + s); g.lineTo(x - s, y - s * .2); g.lineTo(x - s * .6, y - s); g.lineTo(x - s * .2, y - s * .2); g.lineTo(x + s * .2, y - s * .2)
  g.lineTo(x + s * .6, y - s); g.lineTo(x + s, y - s * .2); g.lineTo(x + s, y + s); g.closePath(); g.fill(); g.stroke()
}
function drawMap(m) {
  const S = 180, g = sized(mapEl.value, S, S), c = S / 2, R = c - 3, k = R / MR, P = rel(m)
  if (!terrAt || Math.hypot(m.x - terrAt.x, m.z - terrAt.z) > 80) rebuildTerrain(m.x, m.z)
  g.save(); g.beginPath(); g.arc(c, c, R, 0, 7); g.clip()
  g.translate(c, c); g.rotate(m.yaw); g.scale(k, k)
  g.drawImage(terr, terrAt.x - MR * 1.5 - m.x, terrAt.z - MR * 1.5 - m.z, MR * 3, MR * 3)
  g.restore()
  const rg = g.createRadialGradient(c, c, R * .6, c, c, R); rg.addColorStop(0, 'rgba(20,30,45,0)'); rg.addColorStop(1, 'rgba(20,30,45,.35)')
  g.fillStyle = rg; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill()
  const at = (x, z, edge = true) => {
    let [sx, sy] = P(x, z); sx *= k; sy *= k; const d = Math.hypot(sx, sy), lim = R - 9
    const out = d > lim; if (out) { if (!edge) return null; sx *= lim / d; sy *= lim / d }
    return [c + sx, c + sy, out]
  }
  g.lineWidth = 1; g.strokeStyle = 'rgba(30,25,20,.7)'
  for (const r of m.rings) { const p = at(r.x, r.z, false); if (p) { g.strokeStyle = '#ffd36b'; g.lineWidth = 1.6; g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.stroke() } }
  g.lineWidth = 1; g.strokeStyle = 'rgba(30,25,20,.7)'
  for (const pl of m.places) {
    const p = at(pl.x, pl.z); const s = p[2] ? 4 : 6
    if (pl.kind === 'pitch') { g.fillStyle = '#e6c25a'; g.beginPath(); g.ellipse(p[0], p[1], s * 1.2, s * .7, 0, 0, 7); g.fill(); g.stroke() }
    else drawCastle(g, p[0], p[1], s, p[2] ? 'rgba(240,232,214,.75)' : '#f2ead8')
  }
  for (const o of m.others || []) { const p = at(o.x, o.z); g.fillStyle = o.color; g.strokeStyle = 'rgba(20,30,45,.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p[0], p[1], 4.2, 0, 7); g.fill(); g.stroke() }
  if (m.snitch) { const sp = at(m.snitch.x, m.snitch.z), pulse = 3.5 + Math.sin(performance.now() / 160) * 1.2
  g.fillStyle = 'rgba(255,210,80,.35)'; g.beginPath(); g.arc(sp[0], sp[1], pulse + 3, 0, 7); g.fill()
  g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(sp[0], sp[1], 3.2, 0, 7); g.fill() }
  // 北
  const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw)
  g.font = '11px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = 'rgba(20,30,45,.55)'; g.beginPath(); g.arc(c + sy * (R - 10), c - cy * (R - 10), 8, 0, 7); g.fill()
  g.fillStyle = '#fff'; g.fillText('北', c + sy * (R - 10), c - cy * (R - 10) + .5)
  // 自己
  g.save(); g.translate(c, c); g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(20,30,45,.8)'; g.lineWidth = 1.5
  g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore()
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke()
  coord.value = `X ${Math.round(m.x)} · Z ${Math.round(m.z)} · 离地 ${Math.max(0, Math.round(m.y - m.ground))} m`
}
// ---------------- 顶部罗盘 ----------------
function drawCompass(m) {
  const W = 520, H = 66, g = sized(compassEl.value, W, H), used = [], P = rel(m), HALF = Math.PI / 2
  const ang = (x, z) => { const [sx, sy] = P(x, z); return Math.atan2(sx, -sy) }
  const X = a => W / 2 + a / HALF * (W / 2 - 18)
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(20,50,80,.6)'; g.shadowBlur = 6
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(18, 30); g.lineTo(W - 18, 30); g.stroke()
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  for (let d = 0; d < 360; d += 15) {
    const b = d * Math.PI / 180, a = ang(m.x + Math.sin(b), m.z - Math.cos(b)); if (Math.abs(a) > HALF) continue
    const x = X(a), major = d % 45 === 0
    g.strokeStyle = 'rgba(255,255,255,' + (major ? .95 : .5) + ')'; g.beginPath(); g.moveTo(x, 30); g.lineTo(x, major ? 22 : 26); g.stroke()
    if (major) { g.fillStyle = d === 0 ? '#ffd36b' : '#fff'; g.font = (d % 90 === 0 ? '14px' : '11px') + ' Georgia, serif'; g.fillText(names[d / 45], x, 13) }
  }
  const mark = (x, z, label, col, shape) => {
    let a = ang(x, z); const out = Math.abs(a) > HALF * .97; a = Math.max(-HALF * .97, Math.min(HALF * .97, a))
    const px = X(a); g.fillStyle = col
    g.beginPath()
    if (shape === 'dot') g.arc(px, 38, 4, 0, 7); else { g.moveTo(px, 33); g.lineTo(px + 5, 41); g.lineTo(px - 5, 41) }
    g.fill()
    g.font = '11px Georgia, serif'; g.fillStyle = '#fff'
    const text = (out && a < 0 ? '‹ ' : '') + label + (out && a > 0 ? ' ›' : ''), tw = g.measureText(text).width, lx = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, px))
    const row = used.some(u => Math.abs(u.x - lx) < (u.w + tw) / 2 + 8) ? 1 : 0; used.push({ x: lx, w: tw })
    g.fillText(text, lx, 49 + row * 14)
  }
  const near = m.places.reduce((a, b) => Math.hypot(b.x - m.x, b.z - m.z) < Math.hypot(a.x - m.x, a.z - m.z) ? b : a)
  mark(near.x, near.z, near.name + ' ' + dist(Math.hypot(near.x - m.x, near.z - m.z)), '#f2ead8', 'tri')
  if (m.snitch) mark(m.snitch.x, m.snitch.z, '飞贼 ' + dist(Math.hypot(m.snitch.x - m.x, m.snitch.z - m.z)), '#ffcc33', 'dot')
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(W / 2, 31); g.lineTo(W / 2 + 5, 37); g.lineTo(W / 2 - 5, 37); g.fill()
}
function loop() {
  raf = requestAnimationFrame(loop)
  if (!game || !state.started || (frame++ & 1)) return
  if (!mapEl.value || !compassEl.value) return
  const m = game.mapInfo(); drawMap(m); drawCompass(m)
}

// ---------------- 触屏操控 ----------------
const isTouch = ref(typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
addEventListener('touchstart', () => { isTouch.value = true }, { once: true, passive: true })
watch(isTouch, v => game && game.setTouchMode(v))
const knob = reactive({ x: 0, y: 0 }), boosting = ref(false), STICK_R = 52
let stick = null
function stickDown(e) {
  const r = e.currentTarget.getBoundingClientRect()
  stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  stickMove(e)
}
function stickMove(e) {
  if (!stick || e.pointerId !== stick.id) return
  let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy; const L = Math.hypot(dx, dy)
  if (L > STICK_R) { dx *= STICK_R / L; dy *= STICK_R / L }
  knob.x = dx; knob.y = dy; game && game.setTouch(dx / STICK_R, dy / STICK_R)
}
function stickUp(e) {
  if (e && stick && e.pointerId !== stick.id) return
  stick = null; knob.x = knob.y = 0; game && game.setTouch(0, 0, false)
}
function setBoost(v) { boosting.value = v; game && game.setTouchBoost(v) }
watch(() => state.started && !state.paused && !state.finished && !state.mpEnd, v => { if (!v) { stickUp(); setBoost(false) } })

onMounted(() => { game = new Game(host.value, state, profile); game.setTouchMode(isTouch.value); loop() })
onBeforeUnmount(() => { cancelAnimationFrame(raf); game && game.dispose() })
</script>

<style scoped>
.wrap, .host { position: absolute; inset: 0 }
.loading { position: absolute; inset: 0; background: #dfeaf0; transition: opacity 1.2s; pointer-events: none }
.loading.gone { opacity: 0 }
.menu, .paused, .note, .hud { position: absolute; left: 0; right: 0; text-align: center; color: #fff; letter-spacing: .06em; text-shadow: 0 1px 10px rgba(20, 50, 80, .55); pointer-events: none }
.menu { top: 14vh }
.menu h1 { font-weight: 400; font-size: 48px; letter-spacing: .14em }
.menu .cn { margin-top: 8px; font-size: 18px; letter-spacing: .3em }
.menu .sub { margin-top: 10px; font-size: 16px; opacity: .9 }
.modes { display: flex; justify-content: center; gap: 12px; margin-top: 38vh; flex-wrap: wrap }
.modes button, .ghost, .round, .env button { pointer-events: auto; cursor: pointer; color: #fff; font-family: Georgia, "Songti SC", serif; text-shadow: inherit;
  background: rgba(255, 255, 255, .14); border: 1px solid rgba(255, 255, 255, .7); backdrop-filter: blur(6px); transition: background .2s, transform .2s }
.modes button { width: 172px; padding: 14px 0; border-radius: 4px; letter-spacing: .08em }
.modes button b { display: block; font-weight: 400; font-size: 19px }
.modes button span { display: block; margin-top: 4px; font-size: 12px; opacity: .85 }
.modes button:hover, .ghost:hover, .round:hover, .env button:hover { background: rgba(255, 255, 255, .3) }
.modes button:hover { transform: translateY(-2px) }
.keys { margin-top: 20px; font-size: 12px; opacity: .8 }
.panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 460px; padding: 28px 34px; text-align: center; color: #fff;
  background: rgba(24, 36, 52, .55); border: 1px solid rgba(255, 255, 255, .45); backdrop-filter: blur(10px); border-radius: 6px; letter-spacing: .05em; text-shadow: 0 1px 8px rgba(0, 0, 0, .35) }
.panel h2 { font-weight: 400; font-size: 22px; letter-spacing: .16em; margin-bottom: 16px }
.panel table { width: 100%; border-collapse: collapse; font-size: 14px }
.panel th { font-weight: 400; font-size: 12px; opacity: .7; padding: 6px 8px; border-bottom: 1px solid rgba(255, 255, 255, .3) }
.panel td { padding: 7px 8px; border-bottom: 1px solid rgba(255, 255, 255, .1) }
.panel td.sc { font-size: 16px }
.panel tr.me td { color: #ffd36b }
.panel .empty { opacity: .8; padding: 20px 0 }
.panel .big { font-size: 56px; margin: 4px 0 8px }
.panel .rank { margin-top: 8px; color: #ffd36b }
.row { display: flex; justify-content: center; gap: 12px; margin-top: 22px }
.ghost { padding: 8px 22px; border-radius: 3px; font-size: 14px; letter-spacing: .1em }
.ghost.dim { opacity: .65 }
.ghost.small { margin-top: 14px; padding: 5px 16px; font-size: 12px }
.paused { bottom: 9vh }
.paused b { display: block; font-weight: 400; font-size: 22px; letter-spacing: .2em }
.paused span { display: block; margin-top: 6px; font-size: 13px; opacity: .85 }
.note { top: 15vh; font-size: 19px; opacity: 0; transition: opacity .6s }
.note.on { opacity: 1; transition: opacity .15s }
.hud { inset: 0; text-align: left }
.compass { position: absolute; top: 10px; left: 50%; width: 520px; height: 66px; margin-left: -260px }
.timer { position: absolute; top: 78px; left: 0; right: 0; text-align: center; font-size: 24px; letter-spacing: .12em }
.timer.hurry { color: #ffb37a; animation: pulse 1s infinite }
@keyframes pulse { 50% { opacity: .45 } }
.score { position: absolute; top: 26px; left: 32px; font-size: 30px }
.tally { position: absolute; top: 66px; left: 33px; font-size: 13px; opacity: .9 }
.tally i { font-style: normal; margin: 0 8px; opacity: .6 }
.boost { position: absolute; bottom: 7vh; left: 50%; width: 220px; margin-left: -110px; height: 2px; background: rgba(255, 255, 255, .3) }
.boost span { display: block; height: 100%; background: #fff; transform-origin: left; box-shadow: 0 0 8px rgba(255, 255, 255, .8); transition: transform .1s }
.fps { position: absolute; top: 28px; right: 32px; font-size: 12px; opacity: .6 }
.round { position: absolute; top: 50px; right: 28px; width: 34px; height: 34px; border-radius: 50%; font-size: 13px }
.mute { top: 92px }
.mute.off { opacity: .45; text-decoration: line-through }
.minimap { position: absolute; right: 24px; bottom: 24px; width: 180px; text-align: center }
.minimap canvas { width: 180px; height: 180px; display: block; filter: drop-shadow(0 2px 10px rgba(20, 50, 80, .45)) }
.coord { margin-top: 6px; font-size: 11px; opacity: .9; white-space: nowrap }
.env { position: absolute; left: 24px; bottom: 24px; color: #fff; font-size: 12px; text-shadow: 0 1px 8px rgba(20, 50, 80, .6); letter-spacing: .06em }
.env div { display: flex; align-items: center; gap: 6px; margin-top: 6px }
.env label { width: 30px; opacity: .85 }
.env button { padding: 3px 10px; border-radius: 12px; font-size: 12px }
.env button.on { background: rgba(255, 255, 255, .85); color: #2a3a48; text-shadow: none }
.hello { margin-top: 14px; font-size: 13px; opacity: .92 }
.hello a { margin-left: 10px; pointer-events: auto; cursor: pointer; text-decoration: underline; opacity: .85 }
.field { pointer-events: auto; width: 280px; padding: 9px 14px; margin-top: 14px; border-radius: 3px; border: 1px solid rgba(255,255,255,.6); background: rgba(255,255,255,.12);
  color: #fff; font: 16px Georgia, "Songti SC", serif; letter-spacing: .05em; outline: none; text-align: center }
.field::placeholder { color: rgba(255,255,255,.6) }
.field:focus { background: rgba(255,255,255,.2); border-color: #fff }
.field.code { width: 170px; margin: 0; font-size: 20px; letter-spacing: .3em }
.panel .hint { font-size: 12px; opacity: .8; line-height: 1.6; max-width: 420px; margin: 0 auto }
.panel .hint.wait, .row .hint { align-self: center }
.panel .or { margin: 18px 0 -8px; font-size: 12px; opacity: .7 }
.err { min-height: 18px; margin-top: 10px; font-size: 13px; color: #ffb37a }
.ghost:disabled, .env button:disabled { opacity: .4; cursor: default }
.lobby .code { cursor: pointer; letter-spacing: .25em; font-size: 46px; margin: 0 }
.lobby table { margin-top: 14px }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; box-shadow: 0 0 0 1px rgba(0,0,0,.25) }
.crown { margin-left: 8px; padding: 1px 6px; border-radius: 8px; font-size: 11px; background: rgba(255,211,107,.85); color: #3a2a10; text-shadow: none }
.dress { position: absolute; left: 24px; top: 50%; transform: translateY(-50%); width: 400px; padding: 22px 24px; color: #fff; text-align: left;
  background: rgba(24,36,52,.55); border: 1px solid rgba(255,255,255,.45); backdrop-filter: blur(10px); border-radius: 6px; text-shadow: 0 1px 8px rgba(0,0,0,.35) }
.dress h2 { font-weight: 400; font-size: 17px; letter-spacing: .14em; margin: 4px 0 10px }
.dress .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px }
.dress .cards button { position: relative; text-align: left; padding: 10px 10px 10px 40px; border-radius: 4px; cursor: pointer; color: #fff; font-family: inherit; text-shadow: inherit;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.3); transition: background .2s, border-color .2s }
.dress .cards button:hover { background: rgba(255,255,255,.18) }
.dress .cards button.on { background: rgba(255,255,255,.26); border-color: #ffd36b; box-shadow: 0 0 0 1px #ffd36b inset }
.dress .cards i { position: absolute; left: 10px; top: 12px; width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,.6) }
.dress .cards b { display: block; font-weight: 400; font-size: 15px }
.dress .cards em { font-style: normal; font-size: 11px; opacity: .7; margin-left: 6px }
.dress .cards span { display: block; margin-top: 3px; font-size: 11px; opacity: .8 }
.dress .hint { font-size: 12px; opacity: .75 }
.dress .row { justify-content: flex-start; margin-top: 14px }
.count { position: absolute; left: 0; right: 0; top: 30vh; text-align: center; font-size: 96px; color: #fff; pointer-events: none;
  text-shadow: 0 4px 24px rgba(20,50,80,.6); animation: pop 1s ease-out both }
@keyframes pop { 0% { transform: scale(1.6); opacity: 0 } 20% { transform: scale(1); opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
.live { position: absolute; top: 96px; left: 33px; font-size: 13px; min-width: 170px }
.live div { padding: 2px 0 }
.live div.me { color: #ffd36b }
.live b { font-weight: 400; float: right; margin-left: 16px }
.live .hint { opacity: .75; font-size: 12px; margin-top: 4px }
.env.locked { opacity: .7 }
.stick { position: absolute; left: calc(28px + env(safe-area-inset-left)); bottom: calc(28px + env(safe-area-inset-bottom)); width: 128px; height: 128px; border-radius: 50%;
  pointer-events: auto; touch-action: none; background: radial-gradient(circle, rgba(255,255,255,.06), rgba(255,255,255,.2)); border: 1.5px solid rgba(255,255,255,.6); backdrop-filter: blur(4px) }
.stick i { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; pointer-events: none;
  background: rgba(255,255,255,.78); box-shadow: 0 2px 10px rgba(20,50,80,.4) }
.boostBtn { position: absolute; right: calc(28px + env(safe-area-inset-right)); bottom: calc(34px + env(safe-area-inset-bottom)); width: 92px; height: 92px; border-radius: 50%;
  pointer-events: auto; touch-action: none; color: #fff; font: 16px Georgia, "Songti SC", serif; letter-spacing: .1em; text-shadow: 0 1px 6px rgba(20,50,80,.6);
  background: rgba(255,211,107,.22); border: 1.5px solid rgba(255,230,170,.85); backdrop-filter: blur(4px); transition: background .1s, transform .1s; -webkit-user-select: none; user-select: none }
.boostBtn.on { background: rgba(255,211,107,.6); transform: scale(.93) }
.touch .minimap { right: calc(20px + env(safe-area-inset-right)); bottom: calc(142px + env(safe-area-inset-bottom)); width: 118px }
.touch .minimap canvas { width: 118px; height: 118px }
.touch .coord { display: none }
.touch .boost { bottom: calc(18px + env(safe-area-inset-bottom)); width: 150px; margin-left: -75px }
.touch .compass { width: min(520px, 84vw); height: auto; margin-left: 0; transform: translateX(-50%) }
.touch .score { top: calc(14px + env(safe-area-inset-top)); left: calc(20px + env(safe-area-inset-left)); font-size: 24px }
.touch .tally { top: calc(48px + env(safe-area-inset-top)); left: calc(21px + env(safe-area-inset-left)); font-size: 12px }
.touch .live { top: calc(70px + env(safe-area-inset-top)); left: calc(21px + env(safe-area-inset-left)); font-size: 12px; min-width: 130px }
.touch .fps { display: none }
.touch .round { top: calc(14px + env(safe-area-inset-top)); right: calc(18px + env(safe-area-inset-right)); width: 40px; height: 40px }
.touch .mute { top: calc(62px + env(safe-area-inset-top)) }
.touch .timer { top: 64px; font-size: 20px }
@media (max-width: 760px) {
  .panel { min-width: 0; width: calc(100vw - 28px); padding: 20px 14px; max-height: 88vh; overflow-y: auto }
  .panel table { font-size: 12px } .panel td, .panel th { padding: 5px 4px }
  .panel .big { font-size: 42px }
  .dress { left: 10px; right: 10px; top: auto; bottom: calc(10px + env(safe-area-inset-bottom)); transform: none; width: auto; max-height: 50vh; overflow-y: auto; padding: 14px }
  .dress .cards b { font-size: 14px } .dress .cards span { font-size: 10px }
  .menu { top: 7vh } .menu h1 { font-size: 30px; letter-spacing: .08em } .menu .sub { font-size: 13px }
  .modes { margin-top: 24vh; padding: 0 12px } .modes button { width: calc(50vw - 20px) }
  .field { width: 100% }
  .env { bottom: calc(12px + env(safe-area-inset-bottom)) }
}
@media (max-height: 500px) {
  .menu { top: 3vh } .menu h1 { font-size: 28px } .menu .cn, .menu .sub { margin-top: 4px; font-size: 12px }
  .modes { margin-top: 8vh } .modes button { width: 150px; padding: 8px 0 } .modes button b { font-size: 16px }
  .keys { margin-top: 10px }
  .panel { max-height: 92vh; overflow-y: auto; padding: 16px 20px }
  .dress { max-height: 90vh; overflow-y: auto }
  .count { top: 18vh; font-size: 72px }
}
.tabs { display: flex; justify-content: center; gap: 8px; margin: -6px 0 12px }
.tabs button { pointer-events: auto; cursor: pointer; padding: 3px 16px; border-radius: 12px; font: 13px Georgia, "Songti SC", serif; color: #fff; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.5) }
.tabs button.on { background: rgba(255,255,255,.85); color: #2a3a48 }
.fade-enter-active, .fade-leave-active { transition: opacity .8s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
