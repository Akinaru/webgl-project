import MetierEnum from '../../../../Enum/MetierEnum.js'

export const RECUPERATION_SIMULATION_INVENTEUR_THRESHOLD = 2

export const RECUPERATION_TUBE_USAGE_GOOD_RANGE = Object.freeze({
    min: 6,
    max: 8
})

export const RECUPERATION_RESOLUTION_DURATION_GOOD_RANGE_SECONDS = Object.freeze({
    min: 0,
    max: 75
})

export const RECUPERATION_MATERIAL_TEST_EFFECTS_BY_KEY = Object.freeze({
    materiau0: Object.freeze([
        Object.freeze({
            metier: MetierEnum.INVENTEUR,
            amount: 4
        })
    ]),
    materiau1: Object.freeze([]),
    materiau2: Object.freeze([
        Object.freeze({
            metier: MetierEnum.BOTANISTE,
            amount: 4
        })
    ])
})

export const RECUPERATION_SIMULATION_EFFECTS = Object.freeze({
    zero: Object.freeze([
        Object.freeze({
            metier: MetierEnum.MENEUR,
            amount: 2
        })
    ]),
    aboveThreshold: Object.freeze([
        Object.freeze({
            metier: MetierEnum.INVENTEUR,
            amount: 4
        })
    ])
})

export const RECUPERATION_TUBE_USAGE_EFFECTS = Object.freeze({
    inRange: Object.freeze([
        Object.freeze({
            metier: MetierEnum.MENEUR,
            amount: 2
        })
    ]),
    outOfRange: Object.freeze([
        Object.freeze({
            metier: MetierEnum.TRAVAILLEUR,
            amount: -2
        })
    ])
})

export const RECUPERATION_RESOLUTION_DURATION_EFFECTS = Object.freeze({
    inRange: Object.freeze([
        Object.freeze({
            metier: MetierEnum.INVENTEUR,
            amount: 4
        }),
        Object.freeze({
            metier: MetierEnum.MENEUR,
            amount: 4
        })
    ]),
    outOfRange: Object.freeze([
        Object.freeze({
            metier: MetierEnum.INVENTEUR,
            amount: -2
        }),
        Object.freeze({
            metier: MetierEnum.MENEUR,
            amount: -2
        })
    ])
})
