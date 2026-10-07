import { state, WOOD_TILE } from './state'
import { ITEMS } from '../items/types'
import type { TroughKind } from '../world/troughs'

export const TOOL_RANGE = 150
export const CRATE_RANGE = 80

export type ActionKind =
  | 'untie-rope'
  | 'place-deed'
  | 'destroy-post'
  | 'destroy-crate'
  | 'destroy-plot'
  | 'destroy-pipe'
  | 'destroy-wood'
  | 'destroy-gate'
  | 'chop-tree'
  | 'mine-rock'
  | 'dig'
  | 'plant-sapling'
  | 'place-post'
  | 'place-crate'
  | 'place-plank'
  | 'place-trough'
  | 'place-gate'
  | 'throw-rope'
  | 'tool-generic'
  | 'quirt'
  | 'aim'
  | 'eat-food'
  | 'mount'
  | 'dismount'
  | 'open-crate'
  | 'toggle-gate'
  | 'talk-npc'

export type ItemAction =
  | { kind: 'untie-rope' }
  | { kind: 'place-deed'; sprite: string; scale: number }
  | { kind: 'destroy-post'; targetIndex: number }
  | { kind: 'destroy-crate'; targetIndex: number }
  | { kind: 'destroy-plot'; targetIndex: number }
  | { kind: 'destroy-pipe'; targetIndex: number }
  | { kind: 'destroy-wood' }
  | { kind: 'destroy-gate'; targetIndex: number }
  | { kind: 'chop-tree'; sprite: string; scale: number }
  | { kind: 'mine-rock'; sprite: string; scale: number }
  | { kind: 'dig'; sprite: string; scale: number }
  | { kind: 'plant-sapling'; sprite: string; scale: number }
  | { kind: 'place-post'; sprite: string; scale: number }
  | { kind: 'place-crate'; sprite: string; scale: number }
  | { kind: 'place-plank'; sprite: string; scale: number }
  | { kind: 'place-trough'; troughKind: TroughKind; sprite: string; scale: number }
  | { kind: 'place-gate'; sprite: string; scale: number }
  | { kind: 'throw-rope'; sprite: string; scale: number }
  | { kind: 'tool-generic'; sprite: string; scale: number }
  | { kind: 'quirt'; sprite: string; scale: number; gear: number }
  | { kind: 'aim'; sprite: string; scale: number; bullets?: string }
  | { kind: 'eat-food'; sprite: string; scale: number }
  | { kind: 'mount'; sprite: string; scale: number; tint: number | null; targetIndex: number }
  | { kind: 'dismount'; sprite: string; scale: number; tint: number | null; targetIndex: number }
  | { kind: 'open-crate'; targetIndex: number }
  | { kind: 'toggle-gate'; targetIndex: number }
  | { kind: 'talk-npc'; targetIndex: number }

export const ACTION_CURSOR: Record<ActionKind, { texture: string; scale: number } | 'tool'> = {
  'untie-rope':    { texture: 'cursor_x', scale: 2 },
  'place-deed':    'tool',
  'destroy-post':  { texture: 'cursor_x', scale: 2 },
  'destroy-crate': { texture: 'cursor_x', scale: 2 },
  'destroy-plot':  { texture: 'cursor_x', scale: 2 },
  'destroy-pipe':  { texture: 'cursor_x', scale: 2 },
  'destroy-wood':  { texture: 'cursor_x', scale: 2 },
  'destroy-gate':  { texture: 'cursor_x', scale: 2 },
  'chop-tree':     'tool',
  'mine-rock':     'tool',
  'dig':           'tool',
  'plant-sapling': 'tool',
  'place-post':    'tool',
  'place-crate':   'tool',
  'place-plank':   'tool',
  'place-trough':  'tool',
  'place-gate':    'tool',
  'throw-rope':    'tool',
  'tool-generic':  'tool',
  'quirt':         'tool',
  'aim':           'tool',
  'eat-food':      'tool',
  'mount':         'tool',
  'dismount':      'tool',
  'open-crate':    { texture: 'cursor_grab', scale: 2 },
  'toggle-gate':   { texture: 'item_fence_gate', scale: 2 },
  'talk-npc':      { texture: 'cursor_grab', scale: 2 },
}

export interface WorldContext {
  playerX(): number
  playerY(): number

  canDestroyCrate(wx: number, wy: number): number | null
  canDestroyPost(wx: number, wy: number): number | null
  canDestroyGate(wx: number, wy: number): number | null
  canDestroyPlot(wx: number, wy: number): number | null
  canDestroyPipe(wx: number, wy: number): number | null
  canDestroyWood(wx: number, wy: number): boolean
  canChopTree(wx: number, wy: number): boolean
  canMineRock(wx: number, wy: number): boolean
  canMount(): number | null
  canDismount(wx: number, wy: number): number | null
  canOpenCrate(wx: number, wy: number): number | null
  canToggleGate(wx: number, wy: number): number | null
  canTalkToNpc(wx: number, wy: number): number | null
  findPlantableDirtSpot(wx: number, wy: number): boolean
  isNearTiedRope(wx: number, wy: number): boolean
  isRopeAttached(): boolean
  crateReach(): number

  gunAmmo: number
  lastFireAt: number
  gunFullReloadUntil: number
  lastGunSlot: number
  horseGear: number
}

export interface ClickHandlers {
  untieRope(wx: number, wy: number): boolean
  setAxeSwung(swung: boolean): void
  eatFromSlot(): boolean
  spawnCrumbs(x: number, y: number, color: number): void
  fireBullet(tx: number, ty: number, spread: number): boolean
  throwRope(tx: number, ty: number): boolean
  tryDestroyCrate(targetIndex: number): boolean
  tryDestroyPost(targetIndex: number): boolean
  tryDestroyGate(targetIndex: number): boolean
  tryDestroyPlot(targetIndex: number): boolean
  tryDestroyPipe(targetIndex: number): boolean
  tryDestroyWood(wx: number, wy: number): boolean
  tryChop(wx: number, wy: number): boolean
  tryMine(wx: number, wy: number): boolean
  tryDig(wx: number, wy: number): boolean
  tryAxeEnemy(wx: number, wy: number): boolean
  tryPlaceCrate(wx: number, wy: number): boolean
  tryOpenCrate(targetIndex: number): boolean
  tryToggleGate(targetIndex: number): boolean
}

export function dispatchClick(
  ctx: WorldContext,
  handlers: ClickHandlers,
  action: ItemAction | null,
  clickX: number,
  clickY: number,
): boolean {
  if (!action) return false

  switch (action.kind) {
    case 'untie-rope':
      return handlers.untieRope(clickX, clickY)

    case 'eat-food':
      if (handlers.eatFromSlot()) {
        const sel = state.inventory[state.selectedInventorySlot]
        const heldType = sel?.type ?? null
        const heldDef = heldType ? ITEMS[heldType] : null
        if (heldDef?.crumbColor != null) handlers.spawnCrumbs(ctx.playerX(), ctx.playerY(), heldDef.crumbColor)
        return true
      }
      return false

    case 'chop-tree':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryChop(clickX, clickY)

    case 'mine-rock':
      handlers.setAxeSwung(true)
      return handlers.tryMine(clickX, clickY)

    case 'destroy-post':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryDestroyPost(action.targetIndex)

    case 'destroy-crate':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryDestroyCrate(action.targetIndex)

    case 'destroy-gate':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryDestroyGate(action.targetIndex)

    case 'destroy-plot':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryDestroyPlot(action.targetIndex)

    case 'destroy-pipe':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryDestroyPipe(action.targetIndex)

    case 'destroy-wood':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return handlers.tryDestroyWood(clickX, clickY)

    case 'tool-generic':
      handlers.setAxeSwung(true)
      if (handlers.tryAxeEnemy(clickX, clickY)) return true
      return false

    case 'throw-rope':
      return handlers.throwRope(clickX, clickY)

    case 'aim':
      return handlers.fireBullet(clickX, clickY, ITEMS[state.inventory[state.selectedInventorySlot]!.type].gunSpread!)

    case 'dig':
      return handlers.tryDig(clickX, clickY)

    case 'place-crate':
      return handlers.tryPlaceCrate(clickX, clickY)

    case 'open-crate':
      return handlers.tryOpenCrate(action.targetIndex)

    case 'toggle-gate':
      return handlers.tryToggleGate(action.targetIndex)

    default:
      return false
  }
}

export function resolveAction(
  ctx: WorldContext,
  worldX: number,
  worldY: number,
  isDragHolding: boolean,
): ItemAction | null {
  if (isDragHolding) return null

  const sel = state.inventory[state.selectedInventorySlot]
  const heldType = sel?.type ?? null
  const tool = state.getSelectedTool()
  const isDestroyTool = tool?.chopping != null || tool?.mining != null

  if (ctx.isNearTiedRope(worldX, worldY)) {
    return { kind: 'untie-rope' }
  }

  if (heldType !== null && ITEMS[heldType].edible) {
    return { kind: 'eat-food', sprite: ITEMS[heldType].sprite, scale: ITEMS[heldType].scale }
  }

  if (isDestroyTool) {
    const postIdx = ctx.canDestroyPost(worldX, worldY)
    if (postIdx !== null) return { kind: 'destroy-post', targetIndex: postIdx }
    const crateIdx = ctx.canDestroyCrate(worldX, worldY)
    if (crateIdx !== null) return { kind: 'destroy-crate', targetIndex: crateIdx }
    const gateIdx = ctx.canDestroyGate(worldX, worldY)
    if (gateIdx !== null) return { kind: 'destroy-gate', targetIndex: gateIdx }
    const plotIdx = ctx.canDestroyPlot(worldX, worldY)
    if (plotIdx !== null) return { kind: 'destroy-plot', targetIndex: plotIdx }
    const pipeIdx = ctx.canDestroyPipe(worldX, worldY)
    if (pipeIdx !== null) return { kind: 'destroy-pipe', targetIndex: pipeIdx }
    if (ctx.canDestroyWood(worldX, worldY)) return { kind: 'destroy-wood' }
    if (tool?.chopping != null && ctx.canChopTree(worldX, worldY)) return { kind: 'chop-tree', sprite: tool.sprite, scale: tool.scale }
  }

  if (tool?.mining != null && ctx.canMineRock(worldX, worldY)) {
    return { kind: 'mine-rock', sprite: tool.sprite, scale: tool.scale }
  }

  if (tool) {
    const dx = worldX - ctx.playerX()
    const dy = worldY - ctx.playerY()
    const reach = (heldType === 'crate' || heldType === 'chest' || heldType === 'silver_lockbox' || heldType === 'gold_lockbox') ? ctx.crateReach() : TOOL_RANGE
    const inRange = dx * dx + dy * dy <= reach * reach

    if (heldType === 'mallet') {
      return { kind: 'tool-generic', sprite: tool.sprite, scale: tool.scale }
    }
    if (tool?.digging != null && inRange) {
      return { kind: 'dig', sprite: tool.sprite, scale: tool.scale }
    }
    if (heldType === 'cottonwood_sapling') {
      if (inRange && ctx.findPlantableDirtSpot(worldX, worldY)) {
        return { kind: 'plant-sapling', sprite: tool.sprite, scale: tool.scale }
      }
      return null
    }
    if (heldType !== null && ITEMS[heldType].deedRows != null && inRange) {
      return { kind: 'place-deed', sprite: tool.sprite, scale: tool.scale }
    }
    if ((heldType === 'post' || heldType === 'cedar_post' || heldType === 'iron_post' || heldType === 'wood_wall') && inRange) {
      return { kind: 'place-post', sprite: tool.sprite, scale: tool.scale }
    }
    if ((heldType === 'crate' || heldType === 'chest') && inRange) {
      return { kind: 'place-crate', sprite: tool.sprite, scale: tool.scale }
    }
    if ((heldType === 'plank' || heldType === 'flagstone' || heldType === 'sandstone') && inRange) {
      return { kind: 'place-plank', sprite: tool.sprite, scale: tool.scale }
    }
    const troughKind: TroughKind | null =
      heldType === 'water' ? 'water' :
      heldType === 'hay' ? 'hay' :
      null
    if (troughKind && inRange) {
      const T = WOOD_TILE
      const wb = state.worldBounds
      const cx = Math.floor((worldX - wb.minX) / T) * T + wb.minX + T / 2
      const cy = Math.floor((worldY - wb.minY) / T) * T + wb.minY + T / 2
      if (!state.placedTroughs.some(t => t.x === cx && t.y === cy)) {
        return { kind: 'place-trough', troughKind, sprite: tool.sprite, scale: tool.scale }
      }
    }
    if (heldType === 'fence_gate' && inRange) {
      return { kind: 'place-gate', sprite: tool.sprite, scale: tool.scale }
    }
    if (heldType === 'rope') {
      return { kind: 'throw-rope', sprite: tool.sprite, scale: tool.scale }
    }
    if (heldType === 'quirt') {
      return { kind: 'quirt', sprite: tool.sprite, scale: tool.scale, gear: ctx.horseGear }
    }
    if (tool.gunSpread != null) {
      if (state.selectedInventorySlot !== ctx.lastGunSlot) {
        ctx.lastFireAt = 0
        ctx.gunFullReloadUntil = 0
        ctx.gunAmmo = tool.gunAmmo ?? 1
        ctx.lastGunSlot = state.selectedInventorySlot
      }
      const reloading = state.gameTime < ctx.gunFullReloadUntil
        || state.gameTime - ctx.lastFireAt < (tool.gunReloadMs ?? 0)
      const reticle = reloading ? 'crosshair_empty' : 'crosshair'
      if (tool.gunAmmo != null) {
        const shown = reloading && state.gameTime < ctx.gunFullReloadUntil ? 0 : ctx.gunAmmo
        return { kind: 'aim', sprite: reticle, scale: 3, bullets: `bullets_${shown}` }
      }
      return { kind: 'aim', sprite: reticle, scale: 3 }
    }
    if (inRange) {
      return { kind: 'tool-generic', sprite: tool.sprite, scale: tool.scale }
    }
    return null
  }

  const gateToggleIdx = ctx.canToggleGate(worldX, worldY)
  if (gateToggleIdx !== null) return { kind: 'toggle-gate', targetIndex: gateToggleIdx }

  if (state.mounted !== null) {
    const di = ctx.canDismount(worldX, worldY)
    if (di !== null) {
      const h = state.honses[di]
      return { kind: 'dismount', sprite: h.sprite, scale: 1, tint: h.tinted ? h.tint : null, targetIndex: di }
    }
  }

  if (state.mounted === null) {
    const crateOpenIdx = ctx.canOpenCrate(worldX, worldY)
    if (crateOpenIdx !== null) return { kind: 'open-crate', targetIndex: crateOpenIdx }
    const npcIdx = ctx.canTalkToNpc(worldX, worldY)
    if (npcIdx !== null) return { kind: 'talk-npc', targetIndex: npcIdx }
  }

  if (state.mounted === null && !ctx.isRopeAttached()) {
    const mi = ctx.canMount()
    if (mi !== null) {
      const h = state.honses[mi]
      return { kind: 'mount', sprite: h.sprite, scale: 1, tint: h.tinted ? h.tint : null, targetIndex: mi }
    }
  }

  return null
}