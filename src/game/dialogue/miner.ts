import type { DialogueGraph } from './types'

const SPEAKER = 'Miner'

export const miner: DialogueGraph = {
  startNode: (ctx) => ctx.state.flags.has('miner_intro_done') ? 'options_after' : 'greet',
  nodes: {
    greet: {
      speaker: SPEAKER,
      text: 'How do you do.',
      options: [
        { label: `How'd you get the eyepatch?`, goto: 'eyepatch' },
        { label: '...', goto: 'leaving' },
      ],
    },
    eyepatch: {
      speaker: SPEAKER,
      text: `Runnin' faster than my dreams could carry me.`,
      goto: 'leaving',
    },
    leaving: {
      speaker: SPEAKER,
      text: `You leavin' the salt flats anytime soon?`,
      options: [
        { label: 'Yes.', goto: 'fw_speech' },
        { label: 'No.', goto: 'fw_speech' },
      ],
    },
    fw_speech: {
      speaker: SPEAKER,
      text: `Heading back west myself to Fort Worth. There's not much to the place besides the stockyards, and about a hundred tin soldiers prancing around with rifles.`,
      goto: 'fw_speech_2',
    },
    fw_speech_2: {
      speaker: SPEAKER,
      text: `I called one of those prigs El Pequeno, and I didn't mean the gun.`,
      goto: 'fw_speech_3',
    },
    fw_speech_3: {
      speaker: SPEAKER,
      text: `That's not how I got the eyepatch.`,
      options: [
        { label: `And what's got you out here?`, goto: 'out_here' },
      ],
    },
    out_here: {
      speaker: SPEAKER,
      text: `I got ran out of town, ended up here. I reckon I'll sell my ores, and the salt from here too, once I've got the money for some oxen.`,
      onEnter: (ctx) => { ctx.state.flags.add('miner_intro_done') },
      options: [
        { label: `What else is in Fort Worth?`, goto: 'fw_details' },
        { label: `How can I get a horse?`, goto: 'accepted' },
        { label: 'Bye.' },
      ],
    },
    fw_details: {
      speaker: SPEAKER,
      text: `Let's see, a fort. A jeweler, a prospector, he buys ores from you. Stockyards, too many men, not enough women. A lawman. A land office. Why don't you go find out yourself?`,
      goto: 'fw_details_2',
    },
    fw_details_2: {
      speaker: SPEAKER,
      text: `A guy on foot in the salt is a short story. You should get the hell out of here like me.`,
      goto: 'fw_details_3',
    },
    fw_details_3: {
      speaker: SPEAKER,
      text: `If you break a horse in for me, a good one, I'll pay you $500 for it. How about that?`,
      options: [
        {
          label: 'Yes.',
          effect: (ctx) => { ctx.state.flags.add('miner_horse_offer_accepted') },
          goto: 'accepted',
        },
        { label: 'No.', goto: 'declined' },
      ],
    },
    accepted: {
      speaker: SPEAKER,
      text: `You might go about making a corral, chasing 'em in.`,
      goto: 'options_after',
    },
    options_after: {
      speaker: SPEAKER,
      text: '...',
      options: [
        { label: `What else is in Fort Worth?`, goto: 'fw_details' },
        { label: `How can I get a horse?`, goto: 'accepted' },
        { label: 'Bye.' },
      ],
    },
    declined: {
      speaker: SPEAKER,
      text: 'Suit yourself.',
    },
  },
}
