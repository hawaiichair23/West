import Phaser from 'phaser'

export const PANEL_TITLE_FONT = 'Polaris'
export const PANEL_TITLE_SIZE = 16
export const PANEL_TITLE_COLOR = 0xFFFFFF
export const PANEL_TITLE_SHADOW = 0x808080
export const PANEL_TITLE_SHADOW_OFFSET = 2

export function addPanelTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: number = PANEL_TITLE_COLOR,
): Phaser.GameObjects.Container {
  const style = {
    fontFamily: PANEL_TITLE_FONT,
    fontSize: `${PANEL_TITLE_SIZE}px`,
  }
  const shadow = scene.add.text(PANEL_TITLE_SHADOW_OFFSET, PANEL_TITLE_SHADOW_OFFSET, text, {
    ...style,
    color: `#${PANEL_TITLE_SHADOW.toString(16).padStart(6, '0')}`,
  }).setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.MULTIPLY)
  const main = scene.add.text(0, 0, text, {
    ...style,
    color: `#${color.toString(16).padStart(6, '0')}`,
  }).setOrigin(0.5, 0.5)
  return scene.add.container(x, y, [shadow, main])
}
