export const DISPLAYED_CLASS = 'is-displayed'
export const VISIBLE_CLASS = 'is-visible'
export const SETTINGS_OPEN_CLASS = 'is-settings-open'
export const SELECTORS = Object.freeze({
    root: '#pauseMenu',
    resumeButton: '#pauseResumeButton',
    settingsButton: '#pauseSettingsButton',
    settingsModal: '#pauseSettingsModal',
    settingsCloseButton: '#pauseSettingsCloseButton',
    musicVolumeSlider: '#pauseMusicVolume',
    musicVolumeValue: '#pauseMusicVolumeValue',
    sfxVolumeSlider: '#pauseSfxVolume',
    sfxVolumeValue: '#pauseSfxVolumeValue',
    graphicsQualityButtons: '[data-gfx-quality]',
    keybindButtons: '[data-keybind-action]',
    resetAllButton: '#pauseSettingsResetAll'
})
export const SLIDER_GRADIENT_DARK_RGB = Object.freeze({ r: 36, g: 120, b: 186 })
export const SLIDER_GRADIENT_LIGHT_RGB = Object.freeze({ r: 123, g: 215, b: 255 })
export const SLIDER_GRADIENT_ALPHA = 0.95
export const VOLUME_PREVIEW_MIN_INTERVAL_MS = 90
export const VOLUME_PREVIEW_SOUND_BY_TYPE = Object.freeze({
    music: 'pauseMusicPreview',
    sfx: 'menuClick'
})
export const KEYBIND_CAPTURE_LABEL = 'Appuyer...'
export const KEYBIND_ERROR_FLASH_MS = 320
export const GRAPHICS_QUALITY = Object.freeze({
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
})
export const KEYBIND_CODE_LABELS = Object.freeze({
    Space: 'Espace',
    Escape: 'Echap',
    ArrowUp: 'Fleche haut',
    ArrowDown: 'Fleche bas',
    ArrowLeft: 'Fleche gauche',
    ArrowRight: 'Fleche droite',
    ShiftLeft: 'Maj gauche',
    ShiftRight: 'Maj droite',
    ControlLeft: 'Ctrl gauche',
    ControlRight: 'Ctrl droite',
    AltLeft: 'Alt gauche',
    AltRight: 'Alt droite'
})
