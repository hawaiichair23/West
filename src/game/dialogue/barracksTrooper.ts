import type { DialogueGraph } from './types'

const SPEAKER = 'Trooper'
const HORSE_NEAR_RANGE = 200

export const barracksTrooper: DialogueGraph = {
  startNode: (ctx) => {
    if (ctx.npcX === undefined || ctx.npcY === undefined) return 'intro_solo'
    const near = ctx.state.honses.some(h => {
      const dx = h.x - ctx.npcX!
      const dy = h.y - ctx.npcY!
      return dx * dx + dy * dy <= HORSE_NEAR_RANGE * HORSE_NEAR_RANGE
    })
    return near ? 'intro' : 'intro_solo'
  },
  nodes: {
    intro: {
      speaker: SPEAKER,
      text: `Morning, friend. That's a hard-used animal you got there. You come far?`,
      options: [
        { label: 'Yes.', goto: 'ask_tobacco' },
        { label: `I'm from Las Salinas.`, goto: 'ask_tobacco' },
      ],
    },
    intro_solo: {
      speaker: SPEAKER,
      text: `Morning, friend. You look all worn-out. You come far?`,
      options: [
        { label: 'Yes.', goto: 'ask_tobacco' },
        { label: `I'm from Las Salinas.`, goto: 'ask_tobacco' },
      ],
    },
    ask_tobacco: {
      speaker: SPEAKER,
      text: `Huh. You got any tobacco on you, sir? I'll show you a little secret.`,
      options: [
        {
          label: 'Yes.',
          require: (ctx) => ctx.state.countItem('tobacco') >= 1,
          effect: (ctx) => {
            ctx.state.consumeItem('tobacco', 1)
            ctx.state.flags.add('barracks_trooper_bribed')
            ctx.events?.emit('inventory-changed')
          },
          goto: 'follow_me',
        },
        {
          label: 'Yes.',
          require: (ctx) => ctx.state.countItem('tobacco') < 1,
          goto: 'bluff_called',
        },
        { label: 'No.', goto: 'no_tobacco' },
      ],
    },
    bluff_called: {
      speaker: SPEAKER,
      text: `No the hell you don't.`,
    },
    follow_me: {
      speaker: SPEAKER,
      text: 'Follow me.',
      commands: [
        { kind: 'npc_set_sprite', npcId: 'barracks_trooper', sprite: 'cavalry_trooper_upright' },
        {
          kind: 'npc_walk_to',
          npcId: 'barracks_trooper',
          x: -51319, y: 1909,
          speed: 40,
          then: { kind: 'npc_despawn', npcId: 'barracks_trooper' },
        },
      ],
    },
    no_tobacco: {
      speaker: SPEAKER,
      text: 'Come back when you got some, then.',
    },
  },
}
