export type WorldCommand =
  | { kind: 'npc_walk_to'; npcId: string; x: number; y: number; speed?: number; then?: WorldCommand }
  | { kind: 'npc_despawn'; npcId: string }
  | { kind: 'npc_set_sprite'; npcId: string; sprite: string }
