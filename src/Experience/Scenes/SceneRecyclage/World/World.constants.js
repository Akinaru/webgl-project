export const RECYCLAGE_AMBIENT_CHANNEL = 'music'
export const RECYCLAGE_DISTRIBUTION_SWITCH_DELAY_MS = 1200

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

export const NANOBOTS_RECUPERATION_SUN_PRESET = Object.freeze({
    state: Object.freeze({
        useCycle: false,
        cycleSpeed: 0.035,
        distance: 52,
        phi: 0.383,
        theta: 0.068,
        phiAmplitude: 0.581,
        thetaAmplitude: 1.161,
        ambientIntensity: 0.42,
        hemiIntensity: 0.45,
        sunIntensity: 1.435,
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
        sky: '#55daff',
        ground: '#d6fdff',
        sun: '#fff3ac'
    })
})
