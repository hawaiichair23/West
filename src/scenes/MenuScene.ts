// Main menu scene. Boots before Overworld.
//
// Owns four screens, switched in-place by rebuilding display objects:
//   main   — Start Game / Join Game / Options / Quit
//   start  — world list on the left, settings panel on the right
//   join   — room code input (networking wired in a later pass)
//   options— placeholder, filled in later
//
// Why rebuild instead of multiple sub-scenes:
//   One scene = one Phaser scene lifecycle to reason about, no scene-swap
//   timing bugs during menu navigation. Each screen is a `destroyAll` + a
//   build function. Cheap; nothing here is performance-sensitive.
//
// HTML inputs vs. Phaser text:
//   Phaser has no native text input. Seed and room-code fields are real
//   <input> elements overlaid on the canvas via a floating <div>. Removed
//   from the DOM when the menu exits.

import Phaser from 'phaser'
import { state } from '../game/state'
import {
  WORLD_SETTINGS,
  resolveSettings,
  seedToInt,
  type WorldSettings,
  type SettingDef,
  type SettingCategory,
} from '../game/worldSettings'
import { populateInitialState } from '../world/gen'
import {
  listWorlds,
  createWorld,
  loadWorld,
  deleteWorld,
  renameWorld,
  type WorldSlot,
} from '../game/save'
import { loadSprites } from '../sprites/loader'
import { Overworld } from './Overworld'
import { UI } from './UI'
import { Interior } from './Interior'
import { COLORS } from '../colors'

type Screen = 'main' | 'start' | 'join' | 'options'

// Centralized palette for the menu. Keeping it local (not in colors.ts) so
// the game's gameplay palette can drift without the menu following along.
const MENU = {
  bg:        0x1E1A15,      // base dark backdrop (right side of main menu)
  leftPanel: COLORS.uiBarBg, // warm brown — shared with the HUD top bar and the canvas backdrop
  panel:     0x2A2520,      // generic panel body (start/join/options screens)
  panelLine: 0x4A3F30,      // subtle edge
  accent:    0xDAA520,      // gold — titles, hover highlights
  text:      0xF5F0E1,      // main cream text
  textMuted: 0x8A8270,      // dimmed text (disabled rows, helper text)
  danger:    0xCC4444,      // destructive (delete-world confirm)
}

// Width of the brown left panel on the main menu. All left-aligned content
// (logo, subtitle, menu items) stays inside this column.
const LEFT_PANEL_W = 380

export class MenuScene extends Phaser.Scene {
  private screen: Screen = 'main'
  private layer!: Phaser.GameObjects.Container  // everything we draw clears via this
  private domRoot!: HTMLDivElement               // floating overlay for <input>s

  // Start-screen local state
  private selectedWorldId: string | null = null  // null = "+ New World" row
  private draftSettings: WorldSettings = resolveSettings()
  private activeCategory: string = WORLD_SETTINGS[0].id
  private confirmDeleteId: string | null = null
  private draftName: string = ''
  private worldListScroll: number = 0
  private menuCursor?: Phaser.GameObjects.Sprite

  constructor() {
    super({ key: 'MenuScene' })
  }

  preload() {
    loadSprites(this)
  }

  create() {
    // Reset subscreen state on every entry. Instance fields persist across
    // scene stop/start, so without this an ESC-from-game would drop the
    // player back on whatever sub-page they were looking at before, which
    // feels buggy. Main menu is always the entry point.
    this.screen = 'main'
    this.selectedWorldId = null
    this.confirmDeleteId = null
    this.draftSettings = resolveSettings()
    this.activeCategory = WORLD_SETTINGS[0].id
    this.draftName = ''
    this.worldListScroll = 0

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown[], _dx: number, dy: number) => {
      if (this.screen !== 'start') return
      const dir = dy > 0 ? 1 : dy < 0 ? -1 : 0
      if (dir === 0) return
      const total = listWorlds().length + 1
      const visibleRows = this.worldListVisibleRows()
      const maxTop = Math.max(0, total - visibleRows)
      const next = Math.max(0, Math.min(maxTop, this.worldListScroll + dir))
      if (next === this.worldListScroll) return
      this.worldListScroll = next
      this.renderCurrent()
    })

    // The menu's right-hand background is the actual Overworld scene rendering
    // behind us. Make the camera transparent so it shows through — otherwise
    // Phaser clears to a solid color every frame and we never see it.
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)')
    this.layer = this.add.container(0, 0)

    // Ensure something's running behind the menu to actually show:
    //   • If Overworld is paused (we got here via ESC) — leave it paused and
    //     visible. The player's last frame stays on screen.
    //   • If Overworld is already active (e.g. a preview from a previous
    //     menu visit) — leave it running.
    //   • Otherwise boot a fresh "preview" world with default settings and
    //     a random seed. If the player clicks Create World without touching
    //     any setting, we promote this preview in place — zero load.
    this.ensureBackgroundWorld()

    // Floating DOM layer for inputs. Sized to the game canvas; positioned
    // on top of it. Pointer events pass through when nothing's inside.
    this.domRoot = document.createElement('div')
    this.domRoot.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-family:Polaris, sans-serif',
    ].join(';')
    const parent = this.game.canvas.parentElement
    if (parent) {
      parent.style.position = parent.style.position || 'relative'
      parent.appendChild(this.domRoot)
    }

    this.renderCurrent()

    if (this.game.canvas) this.game.canvas.style.cursor = 'none'
    this.menuCursor = this.add.sprite(this.input.activePointer.x, this.input.activePointer.y, 'cursor')
      .setOrigin(0, 0)
      .setScale(2)
      .setDepth(999999)
      .setTint(0xD4A017)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.menuCursor?.setPosition(p.x, p.y)
    })

    this.events.once('shutdown', () => this.teardownDom())
    this.events.once('destroy',  () => this.teardownDom())
  }

  update() {
    if (!this.menuCursor) return
    if (this.game.canvas && this.game.canvas.style.cursor !== 'none') {
      this.game.canvas.style.cursor = 'none'
    }
    const p = this.input.activePointer
    const over = this.input.hitTestPointer(p).length > 0
    this.menuCursor.setTexture(over ? 'cursor_grab' : 'cursor')
  }


  private teardownDom() {
    this.domRoot?.remove()
  }

  private ensureBackgroundWorld() {
    const sm = this.scene
    const anyState = state as unknown as Record<string, unknown>

    if (sm.isActive('Overworld') || sm.isPaused('Overworld')) {
      // Already running or paused — just make sure z-order is correct.
      sm.sendToBack('Overworld')
      sm.bringToTop('MenuScene')
      return
    }

    const previewSettings = resolveSettings()
    const worldSeed = seedToInt('')
    populateInitialState(worldSeed, previewSettings)
    anyState.menuPreview = true
    anyState.previewSeed = worldSeed
    anyState.previewSettings = previewSettings

    sm.launch('Overworld')
    sm.sendToBack('Overworld')
    sm.bringToTop('MenuScene')

    // Belt-and-suspenders: Overworld reads menuPreview and skips its own UI
    // launch. In case something slips through, disable its input so the
    // hidden player can't be driven with the keyboard while on the menu.
    const ow = sm.get('Overworld')
    if (ow?.input) ow.input.enabled = false
    if (ow?.input?.keyboard) ow.input.keyboard.enabled = false
  }

  // Flip the running Overworld from "menu background" to "live game".
  private promoteBackgroundToGame() {
    const sm = this.scene
    const anyState = state as unknown as Record<string, unknown>
    anyState.menuPreview = false
    anyState.pausedSlotId = null

    const ow = sm.get('Overworld')
    if (ow?.input) ow.input.enabled = true
    if (ow?.input?.keyboard) ow.input.keyboard.enabled = true

    sm.launch('UI')
    sm.stop('MenuScene')
  }

  // Clear and rerender whichever screen is active.
  private renderCurrent() {
    this.layer.removeAll(true)
    this.domRoot.innerHTML = ''
    switch (this.screen) {
      case 'main':    this.renderMain();    break
      case 'start':   this.renderStart();   break
      case 'join':    this.renderJoin();    break
      case 'options': this.renderOptions(); break
    }
  }

  private goto(screen: Screen) {
    this.screen = screen
    this.confirmDeleteId = null
    this.renderCurrent()
  }

  // ─────────────────────────────────────────────────────────────── MAIN ────
  private renderMain() {
    const h = this.scale.height

    // Brown left panel — the menu's home, like the framed side column in DST.
    // Right side is left dark so the (later) blurred-game background shows
    // through. Tumbleweeds drift across the right side as atmosphere.
    const panel = this.add.graphics()
    panel.fillStyle(MENU.leftPanel, 1).fillRect(0, 0, LEFT_PANEL_W, h)
    // Subtle inner edge where the panel meets the open space on the right.
    panel.fillStyle(0x000000, 0.25).fillRect(LEFT_PANEL_W - 2, 0, 2, h)
    this.layer.add(panel)

    const logo = this.makeText(45, 90, 'West', 114, MENU.text, 'Retrogression').setOrigin(0, 0)
    this.layer.add(logo)
    this.layer.add(this.makeText(54, 230, 'A FRONTIER GAME', 16, MENU.textMuted))

    const items: Array<{ label: string; onClick: () => void; enabled?: boolean }> = [
      { label: 'Load Game', onClick: () => this.goto('start')   },
      { label: 'Join Game', onClick: () => this.goto('join')    },
      { label: 'Options',   onClick: () => this.goto('options') },
      { label: 'Quit',      onClick: () => window.close()       },
    ]

    let y = 340
    const rowGap = 46
    for (const item of items) {
      const row = this.makeMenuRow(54, y, item.label, item.onClick, item.enabled)
      this.layer.add(row)
      y += rowGap
    }
  }

  // ───────────────────────────────────────────────────────── START GAME ────
  private static readonly LIST_X = 120
  private static readonly LIST_Y = 230
  private static readonly LIST_W = 460
  private static readonly LIST_HEADER_H = 60
  private static readonly WORLD_ROW_H = 70

  private worldListHeight(): number {
    return this.scale.height - MenuScene.LIST_Y - 120
  }

  private worldListVisibleRows(): number {
    const inner = this.worldListHeight() - MenuScene.LIST_HEADER_H
    return Math.max(1, Math.floor(inner / MenuScene.WORLD_ROW_H))
  }

  private renderStart() {
    const w = this.scale.width

    this.layer.add(this.makeBackButton(120, 80, () => this.goto('main')))
    this.layer.add(this.makeText(120, 130, 'LOAD GAME', 26, MENU.text))

    const listX = MenuScene.LIST_X
    const listY = MenuScene.LIST_Y
    const listW = MenuScene.LIST_W
    const listH = this.worldListHeight()

    const listPanel = this.add.graphics()
    listPanel.fillStyle(MENU.panel, 1).fillRect(listX, listY, listW, listH)
    listPanel.lineStyle(2, MENU.panelLine, 1).strokeRect(listX, listY, listW, listH)
    this.layer.add(listPanel)
    this.layer.add(this.makeText(listX + 20, listY + 18, 'YOUR WORLDS', 16, MENU.accent))

    const worlds = listWorlds()
    const totalRows = worlds.length + 1
    const visibleRows = this.worldListVisibleRows()
    const maxTop = Math.max(0, totalRows - visibleRows)
    this.worldListScroll = Math.max(0, Math.min(maxTop, this.worldListScroll))

    const rowStartY = listY + MenuScene.LIST_HEADER_H
    const rowW = listW - 40 - (maxTop > 0 ? 16 : 0)
    for (let i = 0; i < visibleRows; i++) {
      const idx = this.worldListScroll + i
      if (idx >= totalRows) break
      const rowY = rowStartY + i * MenuScene.WORLD_ROW_H
      if (idx < worlds.length) {
        const world = worlds[idx]
        const selected = world.id === this.selectedWorldId
        this.layer.add(this.makeWorldRow(listX + 20, rowY, rowW, world, selected))
      } else {
        const newSelected = this.selectedWorldId === null
        this.layer.add(this.makeNewWorldRow(listX + 20, rowY, rowW, newSelected))
      }
    }

    if (maxTop > 0) {
      const scrollbarW = 6
      const trackX = listX + listW - scrollbarW - 10
      const trackY = rowStartY
      const trackH = visibleRows * MenuScene.WORLD_ROW_H
      const track = this.add.graphics()
      track.fillStyle(MENU.panelLine, 0.5).fillRect(trackX, trackY, scrollbarW, trackH)
      this.layer.add(track)
      const thumbH = Math.max(16, trackH * (visibleRows / totalRows))
      const thumbY = trackY + (this.worldListScroll / maxTop) * (trackH - thumbH)
      const thumb = this.add.graphics()
      thumb.fillStyle(MENU.text, 0.9).fillRect(trackX, thumbY, scrollbarW, thumbH)
      this.layer.add(thumb)
    }

    const settingsX = listX + listW + 40
    const settingsY = listY
    const settingsW = w - settingsX - 120
    const settingsH = listH

    const sPanel = this.add.graphics()
    sPanel.fillStyle(MENU.panel, 1).fillRect(settingsX, settingsY, settingsW, settingsH)
    sPanel.lineStyle(2, MENU.panelLine, 1).strokeRect(settingsX, settingsY, settingsW, settingsH)
    this.layer.add(sPanel)

    this.layer.add(this.makeText(settingsX + 20, settingsY + 18, 'WORLD NAME', 14, MENU.accent))
    this.mountInput(settingsX + 20, settingsY + 42, settingsW - 40, 34, {
      placeholder: 'Untitled World',
      value: this.draftName,
      onChange: (v) => {
        this.draftName = v
        if (this.selectedWorldId) renameWorld(this.selectedWorldId, v)
      },
      onSubmit: () => this.renderCurrent(),
    })

    let tabX = settingsX + 20
    const tabY = settingsY + 100
    for (const cat of WORLD_SETTINGS) {
      const active = cat.id === this.activeCategory
      const tab = this.makeTab(tabX, tabY, cat.label, active, () => {
        this.activeCategory = cat.id
        this.renderCurrent()
      })
      this.layer.add(tab)
      tabX += this.tabWidth(cat.label)
    }

    const activeCat = WORLD_SETTINGS.find(c => c.id === this.activeCategory)!
    this.renderSettingsForm(activeCat, settingsX + 20, settingsY + 160, settingsW - 40)

    const isNew = this.selectedWorldId === null
    const buttonLabel = isNew ? 'Create World' : 'Load World'
    const buttonW = 280
    this.layer.add(this.makeActionButton(
      settingsX + settingsW - buttonW - 20,
      settingsY + settingsH - 70,
      buttonW, 50,
      buttonLabel,
      () => this.onStartWorld(),
    ))
  }

  private renderSettingsForm(cat: SettingCategory, x: number, y: number, w: number) {
    let rowY = y
    for (const setting of cat.settings) {
      // When an existing world is selected, settings are read-only (they
      // were locked in at creation).
      const editable = this.selectedWorldId === null
      this.layer.add(this.makeSettingRow(x, rowY, w, setting, editable))
      // Row height grows if there's a help subtitle, so the spacing is
      // consistent whether or not a setting has one.
      rowY += setting.help ? 78 : 56
    }
  }

  // Build one row for a setting. Label on left, control on right.
  // Help text (if present) is placed well below the label with air between
  // them — previously it was crammed right under.
  private makeSettingRow(
    x: number, y: number, w: number,
    setting: SettingDef,
    editable: boolean,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const labelColor = editable ? MENU.text : MENU.textMuted
    c.add(this.makeText(0, 12, setting.label, 20, labelColor))

    if (setting.help) {
      // ~30px gap from the label baseline — the previous 22px felt stacked.
      c.add(this.makeText(0, 46, setting.help, 12, MENU.textMuted))
    }

    const controlX = w - 280
    switch (setting.type) {
      case 'seed': {
        if (editable) {
          this.mountInput(x + controlX, y + 10, 260, 32, {
            placeholder: 'random',
            value: String(this.draftSettings[setting.id] ?? ''),
            onChange: (v) => { this.draftSettings[setting.id] = v },
          })
        } else {
          c.add(this.makeText(controlX, 16, String(this.draftSettings[setting.id] || '(random)'), 18, MENU.textMuted))
        }
        break
      }
      case 'toggle': {
        const on = !!this.draftSettings[setting.id]
        c.add(this.makeToggle(controlX, 16, on, (next) => {
          if (!editable) return
          this.draftSettings[setting.id] = next
          this.renderCurrent()
        }))
        break
      }
      case 'choice': {
        const value = String(this.draftSettings[setting.id] ?? setting.default)
        c.add(this.makeChoice(controlX, 16, setting.options as readonly string[], value, (next) => {
          if (!editable) return
          this.draftSettings[setting.id] = next
          this.renderCurrent()
        }))
        break
      }
    }
    return c
  }

  // ───────────────────────────────────────────────────────── JOIN GAME ────
  private renderJoin() {
    this.layer.add(this.makeBackButton(120, 80, () => this.goto('main')))
    this.layer.add(this.makeText(120, 130, 'JOIN GAME', 26, MENU.text))

    const centerX = this.scale.width / 2
    const y = 360

    this.layer.add(this.makeText(centerX, y, 'Enter room code', 22, MENU.text).setOrigin(0.5))
    this.layer.add(this.makeText(centerX, y + 36, 'Ask the host for their code.', 14, MENU.textMuted).setOrigin(0.5))

    let codeValue = ''
    this.mountInput(centerX - 200, y + 70, 400, 44, {
      placeholder: 'prairie-4829',
      value: '',
      onChange: (v) => { codeValue = v },
      center: true,
      big: true,
    })

    this.layer.add(this.makeActionButton(
      centerX - 110, y + 150, 220, 52,
      'Join',
      () => this.onJoin(codeValue),
    ))

    this.layer.add(this.makeText(centerX, y + 240,
      'Multiplayer connection is wired in the next pass.', 14, MENU.textMuted,
    ).setOrigin(0.5))
  }

  // ─────────────────────────────────────────────────────────── OPTIONS ────
  private renderOptions() {
    this.layer.add(this.makeBackButton(120, 80, () => this.goto('main')))
    this.layer.add(this.makeText(120, 130, 'OPTIONS', 26, MENU.text))
    this.layer.add(this.makeText(120, 230, 'Settings go here (sound, controls, fullscreen).',
      18, MENU.textMuted))
  }

  //   • Load World             → destroy preview Overworld, restore slot, boot fresh
  //   • Create World (changed) → destroy preview Overworld, populate state, boot fresh
  //   • Create World (unchanged from preview) → promote the preview in place
  private onStartWorld() {
    const sm = this.scene
    const anyState = state as unknown as Record<string, unknown>

    if (this.selectedWorldId !== null) {
      const loaded = loadWorld(this.selectedWorldId)
      if (!loaded) return
      if (loaded.hadSnapshot) {
        state.worldSeed = loaded.slot.worldSeed
      } else {
        populateInitialState(loaded.slot.worldSeed, loaded.slot.settings)
      }
      anyState.currentSlotId = loaded.slot.id
      anyState.menuPreview = false
      anyState.pausedSlotId = null
      this.restartOverworld()
      return
    }

    const draft = resolveSettings(this.draftSettings)
    const previewSettings = anyState.previewSettings as WorldSettings | undefined
    const previewSeed = anyState.previewSeed as number | undefined
    const sameAsPreview = !!previewSettings
      && JSON.stringify(draft) === JSON.stringify(previewSettings)
    const inPreview = !!anyState.menuPreview
      && sm.isActive('Overworld')
      && previewSeed !== undefined

    if (inPreview && sameAsPreview) {
      const seedText = String(draft.seed ?? '')
      const slot = createWorld({
        name: this.draftName.trim() || seedText || 'Untitled World',
        seedText,
        worldSeed: previewSeed!,
        settings: draft,
      })
      anyState.currentSlotId = slot.id
      this.promoteBackgroundToGame()
      return
    }

    const seedText = String(draft.seed ?? '')
    const worldSeed = seedToInt(seedText)
    const slot = createWorld({
      name: this.draftName.trim() || seedText || 'Untitled World',
      seedText,
      worldSeed,
      settings: draft,
    })
    populateInitialState(worldSeed, draft)
    anyState.currentSlotId = slot.id
    anyState.menuPreview = false
    anyState.pausedSlotId = null
    this.restartOverworld()
  }

  // Destroy the current Overworld scene instance and boot a fresh one in its
  // place. Textures, bitmap fonts, and decoded spritesheets stay in the global
  // TextureManager — only the scene instance is recycled. This is what makes
  // load/create-with-changed-settings fast: no browser reload, no re-parsing
  // the JS bundle, no asset re-decode. Fresh instance means every private
  // field starts at its declared initial value, so stale pointers from the
  // preview world never leak into the loaded world.
  private restartOverworld() {
    const sm = this.game.scene
    sm.remove('UI')
    sm.remove('Interior')
    sm.remove('Overworld')
    sm.add('Interior', Interior, false)
    sm.add('Overworld', Overworld, true)
    sm.add('UI', UI, true)
    this.scene.stop('MenuScene')
  }

  private onJoin(code: string) {
    // Networking lives in the next pass. For now, log the intent so the
    // menu wiring can be tested without the transport.
    const trimmed = code.trim()
    if (!trimmed) {
      console.log('[join] empty room code')
      return
    }
    console.log(`[join] would connect to room "${trimmed}"`)
  }

  // ─────────────────────────────────────── primitive UI helpers ────────
  private makeText(x: number, y: number, text: string, size: number, color: number, fontFamily: string = 'Polaris') {
    const t = this.add.text(x, y, text, {
      fontFamily,
      fontSize: `${size}px`,
      color: `#${color.toString(16).padStart(6, '0')}`,
    })
    return t
  }

  private makeMenuRow(
    x: number, y: number,
    label: string,
    onClick: () => void,
    enabled = true,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const color = enabled ? MENU.text : MENU.textMuted
    const text = this.makeText(0, 0, label, 22, color)
    c.add(text)
    if (!enabled) return c

    const colt = this.add.sprite(text.width + 12, text.height / 2 + 3, 'item_colt')
      .setScale(2)
      .setOrigin(0, 0.5)
      .setFlipX(true)
      .setTint(MENU.accent)
      .setTintMode(Phaser.TintModes.FILL)
      .setVisible(false)
    c.add(colt)

    text.setInteractive({ useHandCursor: true })
    text.on('pointerover', () => {
      text.setColor(`#${MENU.accent.toString(16).padStart(6, '0')}`)
      colt.setVisible(true)
    })
    text.on('pointerout', () => {
      text.setColor(`#${color.toString(16).padStart(6, '0')}`)
      colt.setVisible(false)
    })
    text.on('pointerup', onClick)
    return c
  }

  private makeBackButton(x: number, y: number, onClick: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const text = this.makeText(0, 0, '< back', 18, MENU.textMuted)
    c.add(text)
    text.setInteractive({ useHandCursor: true })
    text.on('pointerover', () => text.setColor(`#${MENU.accent.toString(16).padStart(6, '0')}`))
    text.on('pointerout',  () => text.setColor(`#${MENU.textMuted.toString(16).padStart(6, '0')}`))
    text.on('pointerup',   onClick)
    return c
  }

  private tabWidth(label: string): number {
    return Math.max(100, label.length * 14 + 40)
  }

  private makeTab(x: number, y: number, label: string, active: boolean, onClick: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const w = this.tabWidth(label) - 10
    const g = this.add.graphics()
    if (active) {
      g.fillStyle(MENU.accent, 1).fillRect(0, 0, w, 36)
    } else {
      g.lineStyle(2, MENU.panelLine, 1).strokeRect(0, 0, w, 36)
    }
    c.add(g)
    const color = active ? MENU.bg : MENU.text
    const text = this.makeText(w / 2, 18, label, 16, color).setOrigin(0.5)
    c.add(text)
    g.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, 36), Phaser.Geom.Rectangle.Contains)
    g.on('pointerup', onClick)
    this.input.setDraggable(g, false)
    return c
  }

  private makeToggle(x: number, y: number, value: boolean, onChange: (v: boolean) => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const w = 64, h = 28
    const g = this.add.graphics()
    const fill = value ? MENU.accent : MENU.panelLine
    g.fillStyle(fill, 1).fillRect(0, 0, w, h)
    g.lineStyle(2, MENU.panelLine, 1).strokeRect(0, 0, w, h)
    const knobX = value ? w - 22 : 4
    g.fillStyle(MENU.text, 1).fillRect(knobX, 4, 18, h - 8)
    c.add(g)
    g.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains)
    g.on('pointerup', () => onChange(!value))
    return c
  }

  private makeChoice(x: number, y: number, options: readonly string[], value: string, onChange: (v: string) => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const w = 220, h = 32
    const g = this.add.graphics()
    g.fillStyle(MENU.panelLine, 1).fillRect(0, 0, w, h)
    g.lineStyle(2, MENU.panel, 1).strokeRect(0, 0, w, h)
    c.add(g)

    const idx = Math.max(0, options.indexOf(value))
    const label = this.makeText(w / 2, h / 2, options[idx], 16, MENU.text).setOrigin(0.5)
    c.add(label)

    const prev = this.makeText(8, h / 2 - 10, '<', 18, MENU.text)
    const next = this.makeText(w - 20, h / 2 - 10, '>', 18, MENU.text)
    prev.setInteractive({ useHandCursor: true })
    next.setInteractive({ useHandCursor: true })
    prev.on('pointerup', () => onChange(options[(idx - 1 + options.length) % options.length]))
    next.on('pointerup', () => onChange(options[(idx + 1) % options.length]))
    c.add(prev); c.add(next)
    return c
  }

  private makeActionButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const g = this.add.graphics()
    const redraw = (hover: boolean) => {
      g.clear()
      g.fillStyle(hover ? MENU.accent : MENU.panelLine, 1).fillRect(0, 0, w, h)
      g.lineStyle(2, MENU.accent, 1).strokeRect(0, 0, w, h)
    }
    redraw(false)
    c.add(g)
    // Properly center the label — the previous -12 offset was leftover from
    // an earlier font-metric experiment and made the text sit above center.
    const text = this.makeText(w / 2, h / 2, label, 20, MENU.text).setOrigin(0.5)
    c.add(text)
    g.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains)
    g.on('pointerover', () => { redraw(true); text.setColor(`#${MENU.bg.toString(16).padStart(6, '0')}`) })
    g.on('pointerout',  () => { redraw(false); text.setColor(`#${MENU.text.toString(16).padStart(6, '0')}`) })
    g.on('pointerup', onClick)
    return c
  }

  private makeWorldRow(x: number, y: number, w: number, world: WorldSlot, selected: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const h = 60
    const g = this.add.graphics()
    g.fillStyle(selected ? MENU.accent : MENU.panelLine, selected ? 0.35 : 0.5).fillRect(0, 0, w, h)
    g.lineStyle(2, selected ? MENU.accent : MENU.panelLine, 1).strokeRect(0, 0, w, h)
    c.add(g)
    c.add(this.makeText(12, 6, world.name, 20, MENU.text))
    const sub = `seed: ${world.seedText || '(random)'}   ·   ${timeAgo(world.lastPlayedAt)}`
    c.add(this.makeText(12, 32, sub, 12, MENU.textMuted))

    const armed = this.confirmDeleteId === world.id
    const del = armed
      ? this.makeText(w - 72, 8, 'delete?', 14, MENU.danger)
      : this.makeText(w - 20, 6, '×', 20, MENU.textMuted)
    del.setInteractive({ useHandCursor: true })
    if (!armed) {
      del.on('pointerover', () => del.setColor(`#${MENU.danger.toString(16).padStart(6, '0')}`))
      del.on('pointerout',  () => del.setColor(`#${MENU.textMuted.toString(16).padStart(6, '0')}`))
    }
    del.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation()
      if (this.confirmDeleteId === world.id) {
        deleteWorld(world.id)
        this.confirmDeleteId = null
        if (this.selectedWorldId === world.id) this.selectedWorldId = null
      } else {
        this.confirmDeleteId = world.id
      }
      this.renderCurrent()
    })
    c.add(del)

    g.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains)
    g.on('pointerup', () => {
      this.selectedWorldId = world.id
      this.confirmDeleteId = null
      this.draftSettings = resolveSettings(world.settings)
      this.draftName = world.name
      this.renderCurrent()
    })
    return c
  }

  private makeNewWorldRow(x: number, y: number, w: number, selected: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y)
    const h = 60
    const g = this.add.graphics()
    g.fillStyle(selected ? MENU.accent : MENU.panelLine, selected ? 0.35 : 0.5).fillRect(0, 0, w, h)
    g.lineStyle(2, selected ? MENU.accent : MENU.panelLine, 1).strokeRect(0, 0, w, h)
    c.add(g)
    c.add(this.makeText(12, 18, '+ New World', 22, MENU.text))
    g.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains)
    g.on('pointerup', () => {
      this.selectedWorldId = null
      this.draftSettings = resolveSettings()
      this.draftName = ''
      this.renderCurrent()
    })
    return c
  }

  // ───────────────────────────────── HTML input overlay helper ────
  private mountInput(x: number, y: number, w: number, h: number, opts: {
    placeholder?: string
    value?: string
    onChange: (v: string) => void
    onSubmit?: () => void
    center?: boolean
    big?: boolean
  }) {
    // The DOM layer is sized to viewport, but the game canvas may be scaled.
    // Convert game-coord position to the equivalent CSS pixel position on
    // the canvas's bounding box.
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const sx = rect.width / this.scale.width
    const sy = rect.height / this.scale.height

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = opts.placeholder ?? ''
    input.value = opts.value ?? ''
    input.style.cssText = [
      'position:absolute',
      `left:${Math.round(rect.left + x * sx)}px`,
      `top:${Math.round(rect.top + y * sy)}px`,
      `width:${Math.round(w * sx)}px`,
      `height:${Math.round(h * sy)}px`,
      'pointer-events:auto',
      'background:#4A3F30',
      'color:#F5F0E1',
      'border:2px solid #6A5F40',
      'outline:none',
      'padding:0 10px',
      `font-size:${Math.round((opts.big ? 24 : 18) * sy)}px`,
      'font-family:Polaris, sans-serif',
      opts.center ? 'text-align:center' : '',
      'box-sizing:border-box',
    ].filter(Boolean).join(';')
    input.addEventListener('input', () => opts.onChange(input.value))
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && opts.onSubmit) { e.preventDefault(); input.blur(); opts.onSubmit() }
    })
    input.addEventListener('keyup', (e) => e.stopPropagation())
    this.domRoot.appendChild(input)
  }
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
