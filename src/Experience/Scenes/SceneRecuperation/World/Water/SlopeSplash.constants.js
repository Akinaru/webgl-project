export const EMITTER_LABELS = Object.freeze(['Pente A', 'Pente B', 'Pente C', 'Pente D'])

export const EMITTER_COLORS = Object.freeze(['#ff4444', '#44ee44', '#44aaff', '#ffee22'])

export const DEFAULT_EMITTERS = Object.freeze([
    { x1: 1.65, z1: 3.00, x2: 4.25, z2: 3.00, y: -0.30 }, // Pente A
    { x1: 1.65, z1: 4.40, x2: 4.25, z2: 4.40, y:  0.45 }, // Pente B
    { x1: 1.65, z1: 6.60, x2: 4.25, z2: 6.60, y: -0.30 }, // Pente C
    { x1: 1.65, z1: 5.25, x2: 4.40, z2: 5.25, y:  0.45 }  // Pente D
])

// --- Particules de brume ---
export const PARTICLE_COUNT          = 400
export const PARTICLE_EMIT_RATE      = 20      // par emetteur, par seconde
export const PARTICLE_LIFE_MIN       = 1.8
export const PARTICLE_LIFE_MAX       = 3.2
export const PARTICLE_SCALE_XZ_MIN   = 0.22
export const PARTICLE_SCALE_XZ_MAX   = 0.40
export const PARTICLE_SCALE_Y_RATIO  = 0.80
export const PARTICLE_RISE_MIN       = 0.10
export const PARTICLE_RISE_MAX       = 0.20
export const PARTICLE_DRIFT_MAX      = 0.07
export const PARTICLE_OPACITY        = 0.90
export const PARTICLE_SPAWN_Y_JITTER = 0.06

// Variations de teinte blanc (légèrement bleutée ou chaude)
export const PARTICLE_BRIGHTNESS_MIN = 0.82
export const PARTICLE_BRIGHTNESS_MAX = 1.00
export const PARTICLE_BLUE_SHIFT_MAX = 0.07

// --- Debug ---
export const DEBUG_COORD_MIN = -50
export const DEBUG_COORD_MAX = 50
export const DEBUG_Y_MIN     = -5
export const DEBUG_Y_MAX     = 20
export const DEBUG_STEP      = 0.05

export const ENDPOINT_SPHERE_RADIUS = 0.14
