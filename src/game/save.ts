// Save/load: dumps the game `state` singleton to localStorage and reads it
// back. Each world is its own save slot keyed by a UUID. The slot metadata
// (name, seed, settings, last-played, screenshot) is kept in a small index so
// the menu can list worlds without decoding every full save.
//
// Format is intentionally simple JSON. Non-serializable bits of state
// (Phaser objects, timers, DOM refs) are not on `state` anyway — the module
// doc there says "single source of game state", and that's what we persist.

import { state } from './state'
import { resolveSettings, type WorldSettings } from './worldSettings'

const INDEX_KEY = 'west:worlds'
const SLOT_PREFIX = 'west:world:'

const RUNTIME_ONLY_KEYS = new Set<string>([
  'menuPreview',
  'pausedSlotId',
  'previewSeed',
  'previewSettings',
  'currentSlotId',
  'npcs',
  'mounted',
])

function rleEncode(a: Uint8Array): number[] {
  const out: number[] = []
  let i = 0
  while (i < a.length) {
    const v = a[i]
    let run = 1
    while (i + run < a.length && a[i + run] === v) run++
    out.push(v, run)
    i += run
  }
  return out
}

function rleDecode(pairs: number[]): Uint8Array {
  let len = 0
  for (let i = 1; i < pairs.length; i += 2) len += pairs[i]
  const out = new Uint8Array(len)
  let p = 0
  for (let i = 0; i < pairs.length; i += 2) {
    out.fill(pairs[i], p, p + pairs[i + 1])
    p += pairs[i + 1]
  }
  return out
}

function serializeSnapshot(snapshot: Record<string, unknown>): string {
  return JSON.stringify(snapshot, (_k, v) => {
    if (v instanceof Set) return { __set: Array.from(v) }
    if (v instanceof Map) return { __map: Array.from(v.entries()) }
    if (v instanceof Uint8Array) return { __u8rle: rleEncode(v) }
    return v
  })
}

function deserializeSnapshot(raw: string): Record<string, unknown> {
  return JSON.parse(raw, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('__set' in v) return new Set((v as { __set: unknown[] }).__set)
      if ('__map' in v) return new Map((v as { __map: [unknown, unknown][] }).__map)
      if ('__u8rle' in v) return rleDecode((v as { __u8rle: number[] }).__u8rle)
    }
    return v
  })
}

export interface WorldSlot {
  id: string                 // UUID
  name: string               // human-readable, editable later
  seedText: string           // the seed as the player typed it (for display)
  worldSeed: number          // the resolved 32-bit seed actually used
  settings: WorldSettings    // the full resolved settings snapshot
  createdAt: number          // Date.now() when first created
  lastPlayedAt: number       // Date.now() of last save
  screenshot?: string        // dataURL thumbnail (optional, filled on save)
}

// List of worlds, newest first. Safe to call anytime — missing index returns [].
export function listWorlds(): WorldSlot[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WorldSlot[]
    if (!Array.isArray(parsed)) return []
    return parsed.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
  } catch {
    return []
  }
}

function writeIndex(worlds: WorldSlot[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(worlds))
}

// Create a fresh slot. Does NOT save state yet — the first saveWorld() does.
export function createWorld(opts: {
  name: string
  seedText: string
  worldSeed: number
  settings: WorldSettings
}): WorldSlot {
  const slot: WorldSlot = {
    id: crypto.randomUUID(),
    name: opts.name,
    seedText: opts.seedText,
    worldSeed: opts.worldSeed,
    settings: opts.settings,
    createdAt: Date.now(),
    lastPlayedAt: Date.now(),
  }
  const worlds = listWorlds()
  worlds.unshift(slot)
  writeIndex(worlds)
  return slot
}

// Dump state to the slot. Called on menu-return, on explicit save, on
// periodic autosave — anywhere we want to checkpoint. Screenshot optional.
export function saveWorld(slotId: string, screenshot?: string) {
  const worlds = listWorlds()
  const slot = worlds.find(w => w.id === slotId)
  if (!slot) return
  slot.lastPlayedAt = Date.now()
  if (screenshot) slot.screenshot = screenshot
  writeIndex(worlds)
  // state is a class instance; serialize its own-enumerable fields only.
  // Any field prefixed with `_` is considered transient and skipped.
  // Double-cast through unknown because GameState has no index signature.
  const snapshot: Record<string, unknown> = {}
  const anyState = state as unknown as Record<string, unknown>
  for (const key of Object.keys(state)) {
    if (key.startsWith('_')) continue
    if (RUNTIME_ONLY_KEYS.has(key)) continue
    const val = anyState[key]
    if (typeof val === 'function') continue
    snapshot[key] = val
  }
  try {
    localStorage.setItem(SLOT_PREFIX + slotId, serializeSnapshot(snapshot))
  } catch (e) {
    console.error('saveWorld failed:', e)
  }
}

export function loadWorld(slotId: string): { slot: WorldSlot; hadSnapshot: boolean } | null {
  const worlds = listWorlds()
  const slot = worlds.find(w => w.id === slotId)
  if (!slot) return null

  let hadSnapshot = false
  const raw = localStorage.getItem(SLOT_PREFIX + slotId)
  if (raw) {
    try {
      const snapshot = deserializeSnapshot(raw)
      const anyState = state as unknown as Record<string, unknown>
      for (const key of Object.keys(snapshot)) {
        if (RUNTIME_ONLY_KEYS.has(key)) continue
        if (!(key in anyState)) continue
        anyState[key] = snapshot[key]
      }
      hadSnapshot = true
    } catch (e) {
      console.error('loadWorld: failed to apply snapshot:', e)
    }
  }

  slot.settings = resolveSettings(slot.settings)
  return { slot, hadSnapshot }
}

export function deleteWorld(slotId: string) {
  const worlds = listWorlds().filter(w => w.id !== slotId)
  writeIndex(worlds)
  localStorage.removeItem(SLOT_PREFIX + slotId)
}

export function renameWorld(slotId: string, name: string) {
  const worlds = listWorlds()
  const slot = worlds.find(w => w.id === slotId)
  if (!slot) return
  slot.name = name
  writeIndex(worlds)
}

export function hasAnyWorld(): boolean {
  return listWorlds().length > 0
}
