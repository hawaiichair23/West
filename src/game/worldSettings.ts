// Data-driven world settings schema.
//
// Everything about creating a new world — seed, density knobs, enemy frequency,
// gameplay toggles — lives here. The menu reads this list and renders itself,
// save files store the resolved values alongside state, and (eventually) the
// network layer ships the same object to joining peers. Adding a new setting
// is ONE entry in WORLD_SETTINGS plus wherever gen.ts reads the value.
//
// Rules:
//   • Never read a knob as a hardcoded constant in gen.ts / gameplay files.
//     Everything tunable goes here.
//   • The resolver (`resolveSettings`) fills in defaults for any missing keys,
//     so old save files load cleanly after a new setting is added.

export type SettingType = 'seed' | 'toggle' | 'choice'

export interface ChoiceSettingDef {
  id: string
  label: string
  type: 'choice'
  default: string
  options: readonly string[]
  help?: string
}

export interface ToggleSettingDef {
  id: string
  label: string
  type: 'toggle'
  default: boolean
  help?: string
}

export interface SeedSettingDef {
  id: string
  label: string
  type: 'seed'
  default: string          // '' means "roll a random seed on create"
  help?: string
}

export type SettingDef = ChoiceSettingDef | ToggleSettingDef | SeedSettingDef

export interface SettingCategory {
  id: string
  label: string
  settings: SettingDef[]
}

// Shared option vocabularies. Keep these small — more buckets = more tuning
// per setting in gen.ts. "default" is always the neutral middle.
export const DENSITY   = ['none', 'few', 'default', 'lots', 'tons'] as const
export const FREQUENCY = ['none', 'rare', 'default', 'often', 'relentless'] as const
export const SIZE      = ['small', 'medium', 'large'] as const

// Numeric multipliers each bucket maps to. gen.ts multiplies its base density
// or frequency by this — so a setting's effect is a single table lookup, not a
// chain of ifs scattered across the codebase.
export const DENSITY_MULT: Record<string, number> = {
  none: 0, few: 0.4, default: 1, lots: 1.75, tons: 3,
}
export const FREQUENCY_MULT: Record<string, number> = {
  none: 0, rare: 0.35, default: 1, often: 2, relentless: 4,
}
export const SIZE_MULT: Record<string, number> = {
  small: 0.6, medium: 1, large: 1.6,
}

// The schema. Extend here, UI/save/network pick it up automatically.
export const WORLD_SETTINGS: SettingCategory[] = [
  {
    id: 'world',
    label: 'World',
    settings: [
      { id: 'seed', label: 'Seed', type: 'seed', default: '',
        help: 'Leave blank for a random seed.' },
      { id: 'size', label: 'World Size', type: 'choice', default: 'medium',
        options: SIZE },
      { id: 'openToFriends', label: 'Open to Friends', type: 'toggle', default: false,
        help: 'If on, generates a room code your friends can join with.' },
    ],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    settings: [
      { id: 'rocks', label: 'Rocks',      type: 'choice', default: 'default', options: DENSITY },
      { id: 'trees', label: 'Tree Cover', type: 'choice', default: 'default', options: DENSITY },
      { id: 'grass', label: 'Grass',      type: 'choice', default: 'default', options: DENSITY },
    ],
  },
  {
    id: 'enemies',
    label: 'Enemies',
    settings: [
      { id: 'peaceful', label: 'Peaceful Mode', type: 'toggle', default: false,
        help: 'No enemies spawn at all.' },
      { id: 'bandits',  label: 'Bandits',  type: 'choice', default: 'default', options: FREQUENCY },
      { id: 'coyotes',  label: 'Coyotes',  type: 'choice', default: 'default', options: FREQUENCY },
    ],
  },
]

// A flat key/value map of every setting's resolved value for a world.
// Stored verbatim on save files and (later) sent to joiners.
export type WorldSettings = Record<string, string | boolean>

// Fill in defaults for any missing keys. Call this on load so old saves — from
// before a setting existed — don't crash gen.ts with undefined.
export function resolveSettings(partial?: Partial<WorldSettings>): WorldSettings {
  const out: WorldSettings = {}
  for (const cat of WORLD_SETTINGS) {
    for (const s of cat.settings) {
      out[s.id] = partial?.[s.id] ?? s.default
    }
  }
  return out
}

// Hash a string seed to a 32-bit int for mulberry32-style RNGs. Empty string
// -> a random 32-bit int (so "" means "roll one for me" at create time).
export function seedToInt(seed: string): number {
  if (!seed) return (Math.random() * 0xFFFFFFFF) >>> 0
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
