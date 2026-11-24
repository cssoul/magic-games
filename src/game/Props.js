import * as THREE from 'three'
import { createPitch } from './Pitch.js'
import { createForest } from './Trees.js'
import { createRocks } from './Rocks.js'

// 场景物件：禁林、岩石、魁地奇球场（含可穿越的球门）、飘浮灯笼
export function createProps(scene, heightAt, origin) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler()

  // ---------- 禁林（见 Trees.js） ----------
  const S = 1400
  const forest = createForest(scene, heightAt, origin, S)

  // ---------- 岩石（见 Rocks.js） ----------
  const stones = createRocks(scene, heightAt, origin, S)

  const wrap = (b, p) => b + Math.floor((p - b + S / 2) / S) * S
  function relayout(p) {
    forest.relayout(p)
    stones.relayout(p)
  }

  // ---------- 魁地奇球场（见 Pitch.js） ----------
  const field = createPitch(scene, heightAt, origin.pitch)
  const hoops = field.hoops

  // ---------- 飘浮灯笼（城堡附近） ----------
  const LN = 120, C = origin.castle
  const lanternG = new THREE.CylinderGeometry(0.5, 0.4, 1.2, 8)
  const lanterns = new THREE.InstancedMesh(lanternG, new THREE.MeshBasicMaterial({ color: 0xffc06a }), LN)
  scene.add(lanterns)
  const lData = Array.from({ length: LN }, () => ({ x: C.x + (Math.random() - .5) * 220, y: C.y + 20 + Math.random() * 90, z: C.z + (Math.random() - .5) * 220, ph: Math.random() * 6.28, sp: 0.5 + Math.random() }))
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,210,130,1)'); gr.addColorStop(1, 'rgba(255,150,60,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
  const glowGeo = new THREE.BufferGeometry(), gp = new Float32Array(LN * 3)
  glowGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3))
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTex, size: 7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  glow.frustumCulled = false; scene.add(glow)

  return {
    forest,
    relayout,
    update(dt, t, p, running) {
      field.update(t); forest.update(t); stones.update(t)
      lData.forEach((l, i) => {
        const y = l.y + Math.sin(t * l.sp + l.ph) * 2
        m4.compose(v.set(l.x, y, l.z), q.identity(), s.setScalar(1)); lanterns.setMatrixAt(i, m4)
        gp[i * 3] = l.x; gp[i * 3 + 1] = y; gp[i * 3 + 2] = l.z
      })
      lanterns.instanceMatrix.needsUpdate = true; glowGeo.attributes.position.needsUpdate = true
      let hoop = false
      for (const h of hoops) {
        h.cd -= dt
        h.mesh.material.emissiveIntensity = 1 + Math.sin(t * 3) * 0.5
        if (running && h.cd <= 0 && h.world.distanceTo(p) < 4.2) { hoop = true; h.cd = 3 }
      }
      return hoop
    }
  }
}
