import Phaser from 'phaser'
import { state } from '../state'
import type { DialogueContext, DialogueGraph } from './types'

interface DialogueLine {
  text: string
  speaker?: string
  options?: { label: string; act: () => void }[]
}

export function runDialogue(
  events: Phaser.Events.EventEmitter,
  graph: DialogueGraph,
  ctxExtra?: Partial<DialogueContext>,
) {
  const ctx: DialogueContext = { state, events, ...ctxExtra }
  let currentId: string | null = typeof graph.startNode === 'function' ? graph.startNode(ctx) : graph.startNode
  let running = false

  const step = () => {
    running = true
    while (currentId !== null) {
      const node = graph.nodes[currentId]
      if (!node) { currentId = null; break }
      if (node.onEnter) node.onEnter(ctx)

      const line: DialogueLine = { text: node.text, speaker: node.speaker }
      const hasOptions = node.options && node.options.length > 0
      const nodeCommands = node.commands ?? []

      if (hasOptions) {
        const available = node.options!.filter(o => !o.require || o.require(ctx))
        line.options = available.map(o => ({
          label: o.label,
          act: () => {
            if (o.effect) o.effect(ctx)
            for (const c of nodeCommands) events.emit('world_command', c)
            if (o.commands) for (const c of o.commands) events.emit('world_command', c)
            currentId = o.goto ?? null
            if (currentId !== null && !running) step()
          },
        }))
        currentId = null
        events.emit('open-dialogue', [line])
        break
      }

      const nextId = node.goto ?? null
      currentId = nextId
      events.once('dialogue-closed', () => {
        for (const c of nodeCommands) events.emit('world_command', c)
        if (currentId !== null && !running) step()
      })
      events.emit('open-dialogue', [line])
      break
    }
    running = false
  }

  step()
}

