import type { DialogueGraph } from './types'
import { barracksTrooper } from './barracksTrooper'
import { barracksTrooperInside } from './barracksTrooperInside'
import { miner } from './miner'

export const DIALOGUE_GRAPHS: Record<string, DialogueGraph> = {
  barracks_trooper: barracksTrooper,
  barracks_trooper_inside: barracksTrooperInside,
  miner: miner,
}
