// Seeded loot tables for world containers. Deterministic from a seed so a given
// chest in a given world always rolls the same contents, but differs per house
// and per world. Minecraft-style: weighted tiers, one of which is "empty".

import { makeRng } from '../world/gen'
import { ITEMS, rollRarity, BAR_TYPES, type ItemType, type Rarity } from './types'

// A single possible drop: an item type, a stack-count range, and a weight.
// weight is relative within the table (not a percentage).
interface LootEntry {
  type: ItemType   // the item dropped
  min: number      // min stack count
  max: number      // max stack count
  weight: number   // relative likelihood
}

const DUD_CHANCE = 0.05
const MIN_ITEMS = 2
const MAX_ITEMS = 4
const UNIQUE_PER_CHEST: ReadonlySet<ItemType> = new Set<ItemType>(['whiskey', 'silver_key'])
const DEDUPE_MAX_RETRIES = 8

function isUniquePerChest(type: ItemType): boolean {
  if (UNIQUE_PER_CHEST.has(type)) return true
  return ITEMS[type]?.maxStack === 1
}

const ABANDONED_HOUSE_TABLE: LootEntry[] = [
  { type: 'sausage',    min: 1, max: 3, weight: 9 },
  { type: 'bread',      min: 1, max: 3, weight: 8 },
  { type: 'kolache',    min: 1, max: 2, weight: 6 },
  { type: 'snake_oil',  min: 1, max: 1, weight: 4 },
  { type: 'whiskey',    min: 1, max: 1, weight: 2 },

  { type: 'hemp',       min: 4, max: 8, weight: 6 },
  { type: 'wood',       min: 4, max: 8, weight: 6 },
  { type: 'stone',      min: 4, max: 8, weight: 5 },
  { type: 'clay',       min: 4, max: 8, weight: 4 },
  { type: 'leather',    min: 2, max: 5, weight: 4 },
  { type: 'twine',      min: 4, max: 8, weight: 3 },
  { type: 'post',       min: 4, max: 6, weight: 3 },
  { type: 'cedar_post', min: 4, max: 6, weight: 2 },
  { type: 'canvas',     min: 1, max: 3, weight: 3 },
  { type: 'barrel',     min: 1, max: 2, weight: 3 },
  { type: 'coke',       min: 2, max: 4, weight: 2 },
  { type: 'cottonwood_sapling', min: 1, max: 2, weight: 2 },

  { type: 'coal',       min: 2, max: 4, weight: 6 },
  { type: 'iron',       min: 1, max: 3, weight: 5 },
  { type: 'copper',     min: 1, max: 3, weight: 4 },
  { type: 'silver',     min: 1, max: 2, weight: 2 },
  { type: 'gold',       min: 1, max: 1, weight: 1 },
  { type: 'wheel',      min: 1, max: 1, weight: 2 },
  { type: 'colt_ammo',  min: 1, max: 5, weight: 4 },

  { type: 'iron_bar',   min: 1, max: 3, weight: 3 },
  { type: 'copper_bar', min: 1, max: 2, weight: 2 },
  { type: 'silver_bar', min: 1, max: 2, weight: 1 },
  { type: 'gold_bar',   min: 1, max: 1, weight: 1 },
  { type: 'steel',      min: 1, max: 1, weight: 1 },

  { type: 'shovel',     min: 1, max: 1, weight: 1 },
  { type: 'rope',       min: 2, max: 3, weight: 3 },
  { type: 'bag',        min: 1, max: 1, weight: 2 },
  { type: 'medium_bag', min: 1, max: 1, weight: 1 },
  { type: 'sack',       min: 1, max: 1, weight: 1 },
  { type: 'quirt',      min: 1, max: 1, weight: 1 },
  { type: 'brand',      min: 1, max: 1, weight: 1 },
  { type: 'silver_key', min: 1, max: 1, weight: 0.22 },

  { type: 'axe',        min: 1, max: 1, weight: 1 },
  { type: 'pickaxe',    min: 1, max: 1, weight: 1 },
]

// Pick one entry from a table by weight, using the provided 0..1 roll.
function pickWeighted(table: LootEntry[], roll: number): LootEntry {
  const total = table.reduce((s, e) => s + e.weight, 0)
  let t = roll * total
  for (const e of table) {
    t -= e.weight
    if (t <= 0) return e
  }
  return table[table.length - 1]
}

export function rollAbandonedHouseChest(
  seed: number,
): { x: number; y: number; type: ItemType; count: number; rarity?: Rarity }[] {
  const rng = makeRng(seed)
  if (rng() < DUD_CHANCE) return []
  const itemCount = MIN_ITEMS + Math.floor(rng() * (MAX_ITEMS - MIN_ITEMS + 1))
  const out: { x: number; y: number; type: ItemType; count: number; rarity?: Rarity }[] = []
  const taken = new Set<ItemType>()
  for (let i = 0; i < itemCount; i++) {
    let entry = pickWeighted(ABANDONED_HOUSE_TABLE, rng())
    let retries = 0
    while (isUniquePerChest(entry.type) && taken.has(entry.type) && retries < DEDUPE_MAX_RETRIES) {
      entry = pickWeighted(ABANDONED_HOUSE_TABLE, rng())
      retries++
    }
    if (isUniquePerChest(entry.type) && taken.has(entry.type)) continue
    taken.add(entry.type)
    const span = entry.max - entry.min
    const count = entry.min + Math.floor(rng() * (span + 1))
    const rarity = BAR_TYPES.has(entry.type) ? rollRarity(entry.type, rng()) : undefined
    out.push({ x: 0, y: 0, type: entry.type, count, rarity })
  }
  return out
}

// ---- LOCKBOX TOOL POOLS ----
// One tool per lockbox — opening it is the prize. Silver has the basic divergent
// tools; gold has the rarer ones AND can fall through to silver, so a gold box
// is never strictly worse than a silver one, only has the upside of the better
// pool. Weights are equal within each pool to start.

const SILVER_LOCKBOX_POOL: ItemType[] = ['double_jack', 'paul_bunyan']
const GOLD_LOCKBOX_POOL: ItemType[] = ['toledo_pick', 'wild_bill', 'damascus_pick', 'greedy', 'widower']

// Probability a gold lockbox rolls from the gold pool (vs falling through to
// the silver pool). 0.7 = most gold pulls are gold-tier, but a silver-tier
// consolation can land.
const GOLD_PRIMARY_CHANCE = 0.7

export function rollLockboxContents(
  itemType: 'silver_lockbox' | 'gold_lockbox',
  seed: number,
): ItemType {
  const rng = makeRng(seed)
  if (itemType === 'silver_lockbox') {
    return SILVER_LOCKBOX_POOL[Math.floor(rng() * SILVER_LOCKBOX_POOL.length)]
  }
  // gold: chance to roll the gold pool, else the silver pool
  const pool = rng() < GOLD_PRIMARY_CHANCE ? GOLD_LOCKBOX_POOL : SILVER_LOCKBOX_POOL
  return pool[Math.floor(rng() * pool.length)]
}
