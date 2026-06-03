export const RECYCLAGE_AMBIENT_CHANNEL = 'music'
export const RECYCLAGE_DOOR_NAME = 'porte'
export const RECYCLAGE_DOOR_OPEN_OFFSET = -2.0
export const RECYCLAGE_DOOR_ANIMATION_SPEED = 5.5
export const RECYCLAGE_DISTRIBUTION_SWITCH_DELAY_MS = 1200
export const NANOBOTS_EMBEDDED_MODEL_OFFSET = Object.freeze({
    x: 0,
    y: 0,
    z: 0
})

export const NANOBOTS_CASCADE_GROUP_NAMES = Object.freeze([
    'cascade_plantes',
    'cascade_plantes.1',
    'cascade_plantes.2'
])

export const NANOBOTS_REVERSED_SLOPE_MESH_NAMES = Object.freeze([
    'shad_pente',
    'shad_pente_2'
])

export const NANOBOTS_SLOPE_SPLASH_EMITTERS = Object.freeze([
    { x1: -2.51, z1: 2.63, x2: -2.45, z2: -2.87, y: 0.40 },
    { x1: -1.51, z1: 2.63, x2: -1.45, z2: -2.87, y: -0.10, scaleMultiplier: 0.65 }
])

export const RECYCLAGE_CHAMPIGNON_LIGHT_PRESET = Object.freeze({
    state: Object.freeze({
        useCycle: false,
        cycleSpeed: 0.035,
        distance: 52,
        phi: 1.15,
        theta: 0.5,
        phiAmplitude: 0.581,
        thetaAmplitude: 1.161,
        ambientIntensity: 1.08,
        hemiIntensity: 0.28,
        sunIntensity: 1.24,
        castShadow: true,
        shadowAmplitude: 28,
        shadowNear: 9.9,
        shadowDepth: 80,
        shadowBias: -0.0005,
        shadowNormalBias: 0.03,
        shadowRadius: 1.96,
        shadowMapSize: 1024
    }),
    colors: Object.freeze({
        ambient: '#e3ebf2',
        sky: '#53c0ef',
        ground: '#2b79b2',
        sun: '#76cbe8'
    })
})

export const RECYCLAGE_UNDERWATER_ENV = Object.freeze({
    backgroundColor: '#14507a',
    fogColor: '#14507a',
    fogMode: 'linear',
    fogNear: 18,
    fogFar: 92
})

export const UNDERWATER_PARTICLES_COUNT = 600
export const UNDERWATER_PARTICLES_AREA_HALF = 32
export const UNDERWATER_PARTICLES_HEIGHT = 8
export const UNDERWATER_PARTICLES_MIN_Y = -1
export const UNDERWATER_PARTICLES_SPEED = 0.03
export const UNDERWATER_PARTICLES_SIZE = 32

export const RECYCLAGE_NANOBOTS_LIGHT_PRESET = Object.freeze({
    state: Object.freeze({
        useCycle: false,
        cycleSpeed: 0.035,
        distance: 95.9,
        phi: 0.383,
        theta: 0.068,
        phiAmplitude: 0.581,
        thetaAmplitude: 1.161,
        ambientIntensity: 1.402,
        hemiIntensity: 1.630,
        sunIntensity: 1.72,
        castShadow: true,
        shadowAmplitude: 28,
        shadowNear: 9.9,
        shadowDepth: 80,
        shadowBias: -0.0005,
        shadowNormalBias: 0.03,
        shadowRadius: 1.96,
        shadowMapSize: 1024
    }),
    colors: Object.freeze({
        ambient: '#ffffff',
        sky: '#d8f5ff',
        ground: '#eefcff',
        sun: '#fff7cf'
    })
})

export const RECYCLAGE_NANOBOTS_ENV = Object.freeze({
    backgroundColor: '#d4f1ff',
    fogColor: '#e9f9ff',
    fogMode: 'linear',
    fogNear: 28,
    fogFar: 140
})
