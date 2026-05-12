export const CANVAS_WIDTH = 1024
export const CANVAS_HEIGHT = 512
export const BACKGROUND_COLOR = '#07111c'
export const BORDER_COLOR = '#15324d'
export const TITLE_COLOR = '#6fbaff'
export const TEXT_COLOR = '#f3f8ff'
export const BODY_COLOR = '#99abc0'
export const TEST_BUTTON_COLOR = '#4c7fff'
export const VALIDATE_BUTTON_COLOR = '#34c26a'
export const DISABLED_BUTTON_COLOR = '#243444'
export const BUTTON_LOCKED_OFFSET_Y = -0.05
export const BUTTON_ENABLED_LIFT = 0.02
export const BUTTON_PRESS_DEPTH = 0.02
export const BUTTON_RELEASE_DURATION = 0.12

export const SCREEN_VISIBLE_EXACT_NAME_TOKENS = Object.freeze(['screen_visible-gris-foncé'])
export const SCREEN_VISIBLE_FALLBACK_NAME_TOKENS = Object.freeze(['screen_visible-gris'])
export const BUTTON_LEFT_EXACT_NAME_TOKENS = Object.freeze(['button_left'])
export const BUTTON_RIGHT_EXACT_NAME_TOKENS = Object.freeze(['button_right'])

export const BUTTON_TEXTURE_BY_KEY = Object.freeze({
    test: 'recuperationSimulationButtonTexture',
    validate: 'recuperationValidationButtonTexture'
})

export const BUTTON_NAME_TOKENS = Object.freeze({
    test: Object.freeze(['button_left-buttonsimulation', 'button_left', 'buttonsimulation']),
    validate: Object.freeze(['button_right-buttonvalidation', 'button_right', 'buttonvalidation'])
})
