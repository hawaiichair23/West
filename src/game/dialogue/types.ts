import { state } from '../state'
import type { WorldCommand } from './worldCommands'
import type Phaser from 'phaser'

export interface DialogueContext {
  state: typeof state
  npcX?: number
  npcY?: number
  events?: Phaser.Events.EventEmitter
}

export interface DialogueOption {
  label: string
  require?: (ctx: DialogueContext) => boolean
  effect?: (ctx: DialogueContext) => void
  commands?: WorldCommand[]
  goto?: string
}

export interface DialogueNode {
  speaker?: string
  text: string
  options?: DialogueOption[]
  goto?: string
  commands?: WorldCommand[]
  onEnter?: (ctx: DialogueContext) => void
}

export type NodeMap = Record<string, DialogueNode>

export interface DialogueGraph {
  nodes: NodeMap
  startNode: string | ((ctx: DialogueContext) => string)
}
