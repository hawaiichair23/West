import Phaser from 'phaser'
import { COLORS, FONT } from '../colors'
import { state, DEPOT_SLOT_COUNT, type BuiltType } from '../game/state'
import { registerGrabbable } from '../ui/hover'
import { PLOT_SIZE } from './plotConstants'
import { ITEMS } from '../items/types'

export interface PlotView {
  x: number
  y: number
  priceTag: Phaser.GameObjects.BitmapText
  building: Phaser.GameObjects.Sprite | null
  nameLabel: Phaser.GameObjects.Container | null
}

export interface PlotClickDeps {
  onPipeClick: (wx: number, wy: number) => void
  onDestroyPlot: (wx: number, wy: number) => boolean
}

export function createPlot(
  scene: Phaser.Scene,
  x: number,
  y: number,
  plotViews: PlotView[],
  deps: PlotClickDeps,
  preBuilt?: BuiltType,
): number {
  const plotIndex = state.plots.length
  state.plots.push({
    built: preBuilt ?? 'empty',
    level: 1,
    lastTickAt: 0,
    lastItemTickAt: 0,
    output: null,
    depotContents: preBuilt === 'depot'
      ? Array.from({ length: DEPOT_SLOT_COUNT }, () => null)
      : undefined,
  })

  const rect = scene.add.rectangle(x, y, PLOT_SIZE, PLOT_SIZE, COLORS.plotFill)
    .setStrokeStyle(2, COLORS.plotBorder)
    .setInteractive()
  registerGrabbable(rect)

  const priceTag = scene.add.bitmapText(x, y, 'main', '$', FONT.cost)
    .setOrigin(0.5, 0.5)
    .setTint(COLORS.plotPriceTag)
    .setVisible(!preBuilt)

  const view: PlotView = { x, y, priceTag, building: null, nameLabel: null }
  plotViews.push(view)

  rect.on('pointerdown', (p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
    const heldType = state.inventory[state.selectedInventorySlot]?.type

    if (heldType === 'pipe' && p.leftButtonDown() && state.plots[plotIndex].built !== 'empty') {
      ev.stopPropagation()
      deps.onPipeClick(p.worldX, p.worldY)
      return
    }

    const heldDef = heldType ? ITEMS[heldType] : null
    if (heldDef && (heldDef.chopping != null || heldDef.mining != null)) {
      if (deps.onDestroyPlot(p.worldX, p.worldY)) return
    }
    if (!p.leftButtonDown()) return
    ev.stopPropagation()
    if (state.plots[plotIndex].built === 'empty') {
      scene.registry.events.emit('open-build-menu', plotIndex)
    }
  })

  return plotIndex
}
