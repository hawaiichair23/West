// Single source of truth for every tree in the world. Owns the wild-tree
// registry (regenerated deterministically from seed, not persisted) and
// mediates all access to state.plantedTrees / state.felledWorldTrees. No other
// file should read or write those two state fields directly — go through here
// so new consumers (rope, AI, pathing, …) can never see half the world.

import { state, Terrain } from '../game/state'

export type TreeStage = 'sapling' | 'mature' | 'stump' | 'dead'
export type TreeEntry = {
  x: number
  y: number
  kind: 'cottonwood'
  stage: TreeStage
  plantedAt?: number
}

const wildTrees: Map<string, TreeEntry> = new Map()

const keyOf = (x: number, y: number): string => `${x},${y}`

export function clearWildTrees(): void {
  wildTrees.clear()
}

export function addWildTree(x: number, y: number): TreeEntry {
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  const key = keyOf(tx, ty)
  const stage: TreeStage = state.felledWorldTrees.has(key) ? 'stump'
    : state.terrainAt(tx, ty) === Terrain.Grass ? 'mature'
    : 'dead'
  const entry: TreeEntry = { x: tx, y: ty, kind: 'cottonwood', stage }
  wildTrees.set(key, entry)
  return entry
}

export function plantSapling(x: number, y: number, now: number): TreeEntry {
  const entry: TreeEntry = { x, y, kind: 'cottonwood', stage: 'sapling', plantedAt: now }
  state.plantedTrees.push(entry)
  return entry
}

export function removePlantedTree(entry: TreeEntry): void {
  const idx = state.plantedTrees.indexOf(entry)
  if (idx !== -1) state.plantedTrees.splice(idx, 1)
}

export function findSaplingNear(x: number, y: number, maxDistSq: number): TreeEntry | null {
  for (let i = state.plantedTrees.length - 1; i >= 0; i--) {
    const t = state.plantedTrees[i]
    if (t.stage !== 'sapling') continue
    const dx = x - t.x
    const dy = y - t.y
    if (dx * dx + dy * dy < maxDistSq) return t
  }
  return null
}

export function markTreeFelled(entry: TreeEntry): void {
  entry.stage = 'stump'
  const key = keyOf(entry.x, entry.y)
  if (wildTrees.get(key) === entry) state.felledWorldTrees.add(key)
}

export function promoteSaplingToMature(entry: TreeEntry): void {
  entry.stage = 'mature'
  entry.plantedAt = undefined
}

export function* allTrees(): Generator<TreeEntry> {
  yield* state.plantedTrees
  yield* wildTrees.values()
}

export function* saplings(): Generator<TreeEntry> {
  for (const t of state.plantedTrees) {
    if (t.stage === 'sapling') yield t
  }
}
