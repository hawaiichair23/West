import Phaser from 'phaser'
import { state } from '../game/state'
import { outlineIcon } from '../ui/iconOutline'
import { TOOL_RANGE } from '../game/ItemActionController'
import { damageEnemy, ENEMY_KNOCKBACK_MS, ENEMY_HOP_H, BULLET_SPEED } from '../game/combat'
import type { ItemStack } from '../items/types'
import type { Bandit } from './bandit'
import {
  createBandit,
  updateBandits,
  generateBanditName,
  generateBanditLoot,
  getBanditBodyAABB,
  BANDIT_MUZZLE_DY,
  BANDIT_MANACLE_ICON_DY,
  BODY_LOOT_RANGE,
} from './bandit'

const DEFAULT_BANDIT_SPRITE = 'player'
const DEFAULT_DEAD_SPRITE = 'bandit_dead'
const DEAD_SPRITE_SCALE = 2
const BANDIT_HIT_MARGIN = 14
const MANACLE_ICON_DEPTH = 100000

export interface BanditControllerDeps {
  scene: Phaser.Scene
  interiorKey: string | undefined
  getPlayer: () => { x: number; y: number; vx: number; vy: number }
  collidesAt: (px: number, py: number) => boolean
  blocksLineOfSight: (px: number, py: number) => boolean
  fireHostile: (bx: number, by: number, dirX: number, dirY: number) => void
  getPlayerBullets: () => Array<{ x: number; y: number; vx: number; vy: number }>
  lootRng: () => number
  dodgeRng: () => number
  identityRng: () => number
  getTetherAnchor: (banditGlobalIndex: number) => { x: number; y: number } | null
  playerSafe: () => boolean
  banditSpriteScale: number
  manacleOutlineColor: number
  banditSpriteKey?: string
  banditOutlineColor?: number
  manacleIconScale?: number
  manacleIconDY?: number
  deadSpriteKey?: string
  onBanditKilled?: (bodyId: number, wasManacled: boolean) => void
  ignoreRange?: boolean
}

export class BanditController {
  private banditSprites: Phaser.GameObjects.Sprite[] = []
  private banditManacleSprites: (Phaser.GameObjects.Sprite | null)[] = []
  private banditBodySprites: Map<number, Phaser.GameObjects.Sprite> = new Map()

  constructor(private deps: BanditControllerDeps) {}

  spawnBandit(x: number, y: number): number {
    const identity = generateBanditName(this.deps.identityRng)
    const ba = createBandit(x, y, identity.name, identity.bounty, this.deps.interiorKey)
    state.bandits.push(ba)
    this.banditSprites.push(this.makeBanditSprite(x, y))
    this.banditManacleSprites.push(null)
    return this.banditSprites.length - 1
  }

  update(dt: number): void {
    const { scoped, globalOf } = this.buildScopedView()
    const player = this.deps.getPlayer()

    updateBandits(
      scoped,
      dt,
      state.gameTime,
      this.deps.collidesAt,
      this.deps.blocksLineOfSight,
      { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
      BULLET_SPEED,
      (bi, dx, dy) => {
        const ba = scoped[bi]
        this.deps.fireHostile(ba.x, ba.y + BANDIT_MUZZLE_DY, dx, dy)
      },
      this.deps.getPlayerBullets(),
      this.deps.dodgeRng,
      (bi) => this.deps.getTetherAnchor(globalOf[bi]),
      this.deps.playerSafe(),
      this.deps.ignoreRange ?? false,
    )

    this.syncSpritesAndDeath()
  }

  tryManacle(clickX: number, clickY: number, stack: ItemStack, slotIdx: number): boolean {
    if (stack.type !== 'manacles') return false
    const player = this.deps.getPlayer()
    const dx = clickX - player.x
    const dy = clickY - player.y
    if (dx * dx + dy * dy > TOOL_RANGE * TOOL_RANGE) return false

    let scopedI = 0
    for (let i = 0; i < state.bandits.length; i++) {
      const ba = state.bandits[i]
      if (ba.interiorKey !== this.deps.interiorKey) continue
      if (ba.dying || ba.manacled) { scopedI++; continue }
      const b = getBanditBodyAABB(ba)
      if (clickX < b.x - BANDIT_HIT_MARGIN || clickX > b.x + b.w + BANDIT_HIT_MARGIN) { scopedI++; continue }
      if (clickY < b.y - BANDIT_HIT_MARGIN || clickY > b.y + b.h + BANDIT_HIT_MARGIN) { scopedI++; continue }
      ba.manacled = true
      if (!ba.contents) ba.contents = generateBanditLoot(this.deps.lootRng)
      stack.count -= 1
      if (stack.count <= 0) state.inventory[slotIdx] = null
      this.deps.scene.registry.events.emit('inventory-changed')
      this.banditManacleSprites[scopedI] = this.makeManacleSprite(ba.x, ba.y)
      return true
    }
    return false
  }

  tryClickManacled(clickX: number, clickY: number): number | null {
    let scopedI = 0
    for (let i = 0; i < state.bandits.length; i++) {
      const ba = state.bandits[i]
      if (ba.interiorKey !== this.deps.interiorKey) continue
      if (!ba.manacled || ba.dying) { scopedI++; continue }
      const b = getBanditBodyAABB(ba)
      if (clickX < b.x - BANDIT_HIT_MARGIN || clickX > b.x + b.w + BANDIT_HIT_MARGIN) { scopedI++; continue }
      if (clickY < b.y - BANDIT_HIT_MARGIN || clickY > b.y + b.h + BANDIT_HIT_MARGIN) { scopedI++; continue }
      return scopedI
    }
    return null
  }

  tryLootBody(clickX: number, clickY: number): boolean {
    const player = this.deps.getPlayer()
    const rSq = BODY_LOOT_RANGE * BODY_LOOT_RANGE
    let bestSq = rSq
    let bestId = -1
    for (const b of state.banditBodies) {
      if (b.interiorKey !== this.deps.interiorKey) continue
      if (b.carried) continue
      const dx = b.x - player.x
      const dy = b.y - player.y
      const d = dx * dx + dy * dy
      if (d <= bestSq) { bestSq = d; bestId = b.id }
    }
    if (bestId === -1) return false
    this.deps.scene.registry.events.emit('open-body', bestId)
    return true
  }

  pickUpManacled(scopedIdx: number): boolean {
    if (state.carriedBandit) return false
    const globalI = this.globalIndexOf(scopedIdx)
    if (globalI === null) return false
    const ba = state.bandits[globalI]
    if (!ba.manacled) return false
    state.carriedBandit = { name: ba.name, bounty: ba.bounty, contents: ba.contents ?? [] }
    const bs = this.banditSprites[scopedIdx]
    if (bs) bs.destroy()
    const ms = this.banditManacleSprites[scopedIdx]
    if (ms) ms.destroy()
    state.bandits.splice(globalI, 1)
    this.banditSprites.splice(scopedIdx, 1)
    this.banditManacleSprites.splice(scopedIdx, 1)
    return true
  }

  putDownCarried(x: number, y: number): boolean {
    if (!state.carriedBandit) return false
    const cb = state.carriedBandit
    const ba = createBandit(x, y, cb.name, cb.bounty, this.deps.interiorKey)
    ba.manacled = true
    ba.contents = cb.contents
    ba.active = false
    state.bandits.push(ba)
    this.banditSprites.push(this.makeBanditSprite(ba.x, ba.y))
    this.banditManacleSprites.push(this.makeManacleSprite(ba.x, ba.y))
    state.carriedBandit = null
    return true
  }

  unmanacle(scopedIdx: number): boolean {
    const globalI = this.globalIndexOf(scopedIdx)
    if (globalI === null) return false
    const ba = state.bandits[globalI]
    if (!ba.manacled) return false
    ba.manacled = false
    const ms = this.banditManacleSprites[scopedIdx]
    if (ms) { ms.destroy(); this.banditManacleSprites[scopedIdx] = null }
    return true
  }

  damageBandit(scopedIdx: number, dmg: number, knockX: number, knockY: number, ignoreInvuln = false, melee = false): boolean {
    const globalI = this.globalIndexOf(scopedIdx)
    if (globalI === null) return false
    const ba = state.bandits[globalI]
    const ref = { enemy: ba, kind: 'bandit' as const, body: getBanditBodyAABB(ba) }
    return damageEnemy(ref, dmg, knockX, knockY, ignoreInvuln, melee)
  }

  scopedBandits(): readonly Bandit[] {
    const out: Bandit[] = []
    for (const ba of state.bandits) {
      if (ba.interiorKey === this.deps.interiorKey) out.push(ba)
    }
    return out
  }

  banditAt(worldX: number, worldY: number, margin: number): number | null {
    let scopedI = 0
    for (let i = 0; i < state.bandits.length; i++) {
      const ba = state.bandits[i]
      if (ba.interiorKey !== this.deps.interiorKey) continue
      if (ba.dying) { scopedI++; continue }
      const b = getBanditBodyAABB(ba)
      if (worldX >= b.x - margin && worldX <= b.x + b.w + margin &&
          worldY >= b.y - margin && worldY <= b.y + b.h + margin) {
        return scopedI
      }
      scopedI++
    }
    return null
  }

  bodyAt(worldX: number, worldY: number, margin: number): number | null {
    let scopedI = 0
    for (const b of state.banditBodies) {
      if (b.interiorKey !== this.deps.interiorKey) continue
      if (b.carried) { scopedI++; continue }
      const dx = b.x - worldX
      const dy = b.y - worldY
      if (dx * dx + dy * dy <= margin * margin) return scopedI
      scopedI++
    }
    return null
  }

  destroy(): void {
    for (const s of this.banditSprites) s.destroy()
    for (const m of this.banditManacleSprites) { if (m) m.destroy() }
    for (const bs of this.banditBodySprites.values()) bs.destroy()
    this.banditSprites.length = 0
    this.banditManacleSprites.length = 0
    this.banditBodySprites.clear()
  }

  private buildScopedView(): { scoped: Bandit[]; globalOf: number[] } {
    const scoped: Bandit[] = []
    const globalOf: number[] = []
    for (let i = 0; i < state.bandits.length; i++) {
      if (state.bandits[i].interiorKey === this.deps.interiorKey) {
        scoped.push(state.bandits[i])
        globalOf.push(i)
      }
    }
    return { scoped, globalOf }
  }

  private globalIndexOf(scopedIdx: number): number | null {
    let count = 0
    for (let i = 0; i < state.bandits.length; i++) {
      if (state.bandits[i].interiorKey !== this.deps.interiorKey) continue
      if (count === scopedIdx) return i
      count++
    }
    return null
  }

  private makeBanditSprite(x: number, y: number): Phaser.GameObjects.Sprite {
    const key = this.deps.banditSpriteKey ?? DEFAULT_BANDIT_SPRITE
    const spr = this.deps.scene.add.sprite(x, y, key).setScale(this.deps.banditSpriteScale).setDepth(y - 8)
    if (this.deps.banditOutlineColor != null) outlineIcon(spr, this.deps.banditOutlineColor)
    return spr
  }

  private makeManacleSprite(x: number, y: number): Phaser.GameObjects.Sprite {
    const scale = this.deps.manacleIconScale ?? 1
    const dy = this.deps.manacleIconDY ?? BANDIT_MANACLE_ICON_DY
    const spr = this.deps.scene.add.sprite(x, y + dy, 'item_manacles').setScale(scale).setDepth(MANACLE_ICON_DEPTH)
    return outlineIcon(spr, this.deps.manacleOutlineColor)
  }

  rehydrateSprites(): void {
    for (const s of this.banditSprites) s.destroy()
    for (const m of this.banditManacleSprites) { if (m) m.destroy() }
    for (const bs of this.banditBodySprites.values()) bs.destroy()
    this.banditSprites.length = 0
    this.banditManacleSprites.length = 0
    this.banditBodySprites.clear()

    for (const ba of state.bandits) {
      if (ba.interiorKey !== this.deps.interiorKey) continue
      this.banditSprites.push(this.makeBanditSprite(ba.x, ba.y))
      this.banditManacleSprites.push(ba.manacled ? this.makeManacleSprite(ba.x, ba.y) : null)
    }

    const deadKey = this.deps.deadSpriteKey ?? DEFAULT_DEAD_SPRITE
    for (const b of state.banditBodies) {
      if (b.interiorKey !== this.deps.interiorKey) continue
      const spr = this.deps.scene.add.sprite(b.x, b.y, deadKey).setScale(this.deps.banditSpriteScale).setDepth(b.y - 8)
      if (this.deps.banditOutlineColor != null) outlineIcon(spr, this.deps.banditOutlineColor)
      this.banditBodySprites.set(b.id, spr)
    }
  }

  private syncSpritesAndDeath(): void {
    let scopedI = 0
    for (let i = 0; i < state.bandits.length; i++) {
      const ba = state.bandits[i]
      if (ba.interiorKey !== this.deps.interiorKey) continue
      const s = this.banditSprites[scopedI]
      if (!s) { scopedI++; continue }
      s.x = ba.x
      let hop = 0
      if (state.gameTime < ba.knockbackUntil) {
        const t = 1 - (ba.knockbackUntil - state.gameTime) / ENEMY_KNOCKBACK_MS
        hop = Math.sin(t * Math.PI) * ENEMY_HOP_H
      }
      s.y = ba.y - hop
      s.setDepth(ba.y - 8)
      s.setFlipX(!ba.facingRight)
      s.setTint(state.gameTime < ba.hurtUntil ? 0xFF3030 : 0xFFFFFF)
      const m = this.banditManacleSprites[scopedI]
      if (m) {
        m.x = ba.x
        m.y = ba.y + (this.deps.manacleIconDY ?? BANDIT_MANACLE_ICON_DY) - hop
        m.setDepth(ba.y - 7)
        m.setFlipX(!ba.facingRight)
      }
      if (ba.dying && state.gameTime >= ba.hurtUntil) {
        const wasManacled = m != null
        s.destroy()
        if (m) m.destroy()
        this.banditManacleSprites.splice(scopedI, 1)
        this.banditSprites.splice(scopedI, 1)
        state.bandits.splice(i, 1)
        const id = state.nextBanditBodyId++
        const contents = ba.contents ?? generateBanditLoot(this.deps.lootRng)
        state.banditBodies.push({ id, x: ba.x, y: ba.y, carried: false, contents, name: ba.name, bounty: ba.bounty, interiorKey: this.deps.interiorKey })
        const deadKey = this.deps.deadSpriteKey ?? DEFAULT_DEAD_SPRITE
        const deadSpr = this.deps.scene.add.sprite(ba.x, ba.y, deadKey).setScale(this.deps.banditSpriteScale).setDepth(ba.y - 8)
        if (this.deps.banditOutlineColor != null) outlineIcon(deadSpr, this.deps.banditOutlineColor)
        this.banditBodySprites.set(id, deadSpr)
        this.deps.onBanditKilled?.(id, wasManacled)
        i--
        continue
      }
      scopedI++
    }
  }

}
