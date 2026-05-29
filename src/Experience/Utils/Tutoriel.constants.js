export const TUTORIAL_STEP_IDS = Object.freeze({
    LOOK: 'look',
    MOVE_FORWARD: 'moveForward',
    MOVE_BACKWARD: 'moveBackward',
    MOVE_LEFT: 'moveLeft',
    MOVE_RIGHT: 'moveRight'
})

export const CODE_LABELS = Object.freeze({
    Space: 'Espace',
    Escape: 'Echap',
    ArrowUp: 'Fleche haut',
    ArrowDown: 'Fleche bas',
    ArrowLeft: 'Fleche gauche',
    ArrowRight: 'Fleche droite'
})

export const TUTORIAL_STATUS = {
    PENDING: 'pending',
    ACTIVE: 'active',
    FINISHED: 'finished'
}

export const TUTORIAL_TARGET_PROGRESS = Object.freeze({
    LOOK: 2200,
    MOVE_FORWARD: 1100,
    MOVE_BACKWARD: 1100,
    MOVE_LEFT: 1100,
    MOVE_RIGHT: 1100
})

export const TUTORIAL_MOUSE_PROGRESS_MULTIPLIER = 0.35
export const TUTORIAL_STEP_EXIT_ANIMATION_MS = 360
