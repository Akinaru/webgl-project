export const INPUT_ACTION = Object.freeze({
    MOVE_FORWARD: 'moveForward',
    MOVE_LEFT: 'moveLeft',
    JUMP: 'jump',
    MOVE_BACKWARD: 'moveBackward',
    MOVE_RIGHT: 'moveRight',
    PAUSE: 'pause'
})

export const INPUT_BINDING_STORAGE_KEY = 'bloom.input.bindings'

export const INPUT_ACTION_DEFAULT_BINDINGS = Object.freeze({
    [INPUT_ACTION.MOVE_FORWARD]: 'KeyW',
    [INPUT_ACTION.MOVE_LEFT]: 'KeyA',
    [INPUT_ACTION.JUMP]: 'Space',
    [INPUT_ACTION.MOVE_BACKWARD]: 'KeyS',
    [INPUT_ACTION.MOVE_RIGHT]: 'KeyD',
    [INPUT_ACTION.PAUSE]: 'Escape'
})

export const INPUT_ACTION_FALLBACK_CODES = Object.freeze({
    [INPUT_ACTION.MOVE_FORWARD]: ['KeyZ', 'ArrowUp'],
    [INPUT_ACTION.MOVE_LEFT]: ['KeyQ', 'ArrowLeft'],
    [INPUT_ACTION.JUMP]: [],
    [INPUT_ACTION.MOVE_BACKWARD]: ['ArrowDown'],
    [INPUT_ACTION.MOVE_RIGHT]: ['ArrowRight'],
    [INPUT_ACTION.PAUSE]: []
})
