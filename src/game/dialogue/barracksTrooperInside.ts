import type { DialogueGraph } from './types'

const SPEAKER = 'Trooper'

export const barracksTrooperInside: DialogueGraph = {
  startNode: 'greet',
  nodes: {
    greet: {
      speaker: SPEAKER,
      text: `Linus is out; he won't miss it. Hehehe.`,
    },
  },
}
