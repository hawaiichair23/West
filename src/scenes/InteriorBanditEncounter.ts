import Phaser from 'phaser'
import { COLORS } from '../colors'
import { state } from '../game/state'
import { BanditController } from '../world/banditController'
import { makeRng } from '../world/gen'
import type { WalkableInteriorHandle } from './WalkableInterior'

const BANDIT_SPAWN_CHANCE = 0.06
const BANDIT_CORNER_INSET = 10
const BANDIT_WAKE_DELAY_MS = 1500
const MANACLED_INTERACT_RANGE = 80
const MANACLED_RANGE_SQ = MANACLED_INTERACT_RANGE * MANACLED_INTERACT_RANGE
const BODY_LOOT_RANGE_SQ = 80 * 80
const BULLET_DAMAGE = 5
const BULLET_HIT_SQ = 24 * 24

export function attachInteriorBandits(
  scene: Phaser.Scene,
  handle: WalkableInteriorHandle,
  stateKey: string,
  structureIndex: number,
  moduleUpdates: (() => void)[],
  moduleCleanups: (() => void)[],
) {
  const banditSpawnRng = makeRng(state.worldSeed + structureIndex * 53 + 11)
  const lootRng = makeRng(state.worldSeed + structureIndex * 59 + 13)
  const dodgeRng = makeRng(state.worldSeed + structureIndex * 67 + 17)
  const identityRng = makeRng(state.worldSeed + structureIndex * 71 + 19)

  const banditCtrl = new BanditController({
    scene,
    interiorKey: stateKey,
    getPlayer: handle.getPlayer,
    collidesAt: handle.collidesAt,
    blocksLineOfSight: () => false,
    fireHostile: handle.fireHostile,
    getPlayerBullets: handle.getPlayerBullets,
    lootRng,
    dodgeRng,
    identityRng,
    getTetherAnchor: () => null,
    playerSafe: () => false,
    ignoreRange: true,
    banditSpriteScale: 4,
    manacleOutlineColor: COLORS.worldBg,
    banditOutlineColor: COLORS.black,
    manacleIconScale: 2,
    manacleIconDY: -32,
    onBanditKilled: (id, wasManacled) => {
      if (wasManacled) {
        const body = state.banditBodies.find(b => b.id === id)
        if (body) handle.dropItem(body.x, body.y, 'manacles', 1)
      }
    },
  })

  if (!state.interiorBanditRolled[stateKey]) {
    state.interiorBanditRolled[stateKey] = true
    if (banditSpawnRng() < BANDIT_SPAWN_CHANCE) {
      const fb = handle.floorBounds
      const corners = [
        { x: fb.left + BANDIT_CORNER_INSET, y: fb.top + BANDIT_CORNER_INSET },
        { x: fb.right - BANDIT_CORNER_INSET, y: fb.top + BANDIT_CORNER_INSET },
        { x: fb.left + BANDIT_CORNER_INSET, y: fb.bottom - BANDIT_CORNER_INSET },
        { x: fb.right - BANDIT_CORNER_INSET, y: fb.bottom - BANDIT_CORNER_INSET },
      ]
      const corner = corners[Math.floor(banditSpawnRng() * corners.length)]
      banditCtrl.spawnBandit(corner.x, corner.y)
      const scoped = banditCtrl.scopedBandits()
      if (scoped.length > 0) {
        scoped[0].active = true
        scoped[0].wakeDelayUntil = state.gameTime + BANDIT_WAKE_DELAY_MS
      }
    }
  } else {
    banditCtrl.rehydrateSprites()
    const scoped = banditCtrl.scopedBandits()
    for (const ba of scoped) {
      if (!ba.manacled && !ba.dying) ba.wakeDelayUntil = state.gameTime + BANDIT_WAKE_DELAY_MS
    }
  }

  handle.setBulletHitTest((b) => {
    const scoped = banditCtrl.scopedBandits()
    for (let si = 0; si < scoped.length; si++) {
      const ba = scoped[si]
      if (ba.dying) continue
      const cdx = b.x - ba.x
      const cdy = b.y - (ba.y - 8)
      if (cdx * cdx + cdy * cdy <= BULLET_HIT_SQ) {
        banditCtrl.damageBandit(si, BULLET_DAMAGE, b.x - b.vx, b.y - b.vy, true, false)
        return true
      }
    }
    return false
  })

  moduleUpdates.push(() => {
    handle.update(scene.game.loop.delta)
    banditCtrl.update(scene.game.loop.delta)
  })
  moduleCleanups.push(() => {
    handle.onCleanup()
    banditCtrl.destroy()
  })

  handle.clickInterceptors.push((wx, wy, _pointer) => {
    const slotIdx = state.selectedInventorySlot
    const stack = state.inventory[slotIdx]
    if (stack && banditCtrl.tryManacle(wx, wy, stack, slotIdx)) return true

    if (banditCtrl.tryLootBody(wx, wy)) return true

    const scopedIdx = banditCtrl.tryClickManacled(wx, wy)
    if (scopedIdx !== null) {
      const pp = handle.getPlayer()
      const scoped = banditCtrl.scopedBandits()
      const ba = scoped[scopedIdx]
      if (!ba) return true
      const dx = ba.x - pp.x
      const dy = ba.y - pp.y
      if (dx * dx + dy * dy > MANACLED_RANGE_SQ) return true
      openManacledMenu(scene, banditCtrl, handle, scopedIdx, ba.x, ba.y)
      return true
    }
    return false
  })

  handle.ePromptScanners.push((px, py) => {
    for (const b of state.banditBodies) {
      if (b.interiorKey !== stateKey) continue
      if (b.carried) continue
      const dx = b.x - px
      const dy = b.y - py
      const distSq = dx * dx + dy * dy
      if (distSq <= BODY_LOOT_RANGE_SQ) return { x: b.x, y: b.y, topOffset: 12, distSq }
    }
    const scoped = banditCtrl.scopedBandits()
    for (let i = 0; i < scoped.length; i++) {
      const ba = scoped[i]
      if (!ba.manacled || ba.dying) continue
      const dx = ba.x - px
      const dy = ba.y - py
      const distSq = dx * dx + dy * dy
      if (distSq <= MANACLED_RANGE_SQ) return { x: ba.x, y: ba.y, topOffset: 24, distSq }
    }
    return null
  })

  handle.eKeyInterceptors.push((px, py) => {
    if (state.carriedBandit) {
      if (banditCtrl.putDownCarried(px, py + 16)) {
        handle.destroyCarriedVisual()
        return true
      }
    }
    return false
  })

  handle.eKeyInterceptors.push((px, py) => {
    for (const b of state.banditBodies) {
      if (b.interiorKey !== stateKey) continue
      if (b.carried) continue
      const dx = b.x - px
      const dy = b.y - py
      if (dx * dx + dy * dy <= BODY_LOOT_RANGE_SQ) {
        scene.registry.events.emit('open-body', b.id)
        return true
      }
    }
    const scoped = banditCtrl.scopedBandits()
    for (let i = 0; i < scoped.length; i++) {
      const ba = scoped[i]
      if (!ba.manacled || ba.dying) continue
      const dx = ba.x - px
      const dy = ba.y - py
      if (dx * dx + dy * dy <= MANACLED_RANGE_SQ) {
        openManacledMenu(scene, banditCtrl, handle, i, ba.x, ba.y)
        return true
      }
    }
    return false
  })
}

function openManacledMenu(
  scene: Phaser.Scene,
  banditCtrl: BanditController,
  handle: WalkableInteriorHandle,
  scopedIdx: number,
  bx: number,
  by: number,
) {
  const cam = scene.cameras.main
  const sx = bx - cam.scrollX
  const sy = by - 24 - cam.scrollY
  scene.registry.events.emit('open-interact-menu', [
    { label: 'Inspect', act: () => {
      const cur = banditCtrl.scopedBandits()[scopedIdx]
      if (!cur || !cur.contents) return
      scene.registry.events.emit('open-live-contents', cur.contents, cur.name, cur.x, cur.y)
    }},
    { label: 'Pick Up', act: () => {
      if (banditCtrl.pickUpManacled(scopedIdx)) handle.spawnCarriedVisual()
    }},
    { label: 'Remove Manacles', act: () => {
      if (banditCtrl.unmanacle(scopedIdx)) {
        state.inventoryAddAnywhere({ type: 'manacles', count: 1 })
        scene.registry.events.emit('inventory-changed')
      }
    }},
  ], sx, sy)
}