import MetierEnum from '../../../Enum/MetierEnum.js'

export const RESULT_IMAGE_BY_METIER = Object.freeze({
    [MetierEnum.INVENTEUR]: '/images/result/Inventeur.png',
    [MetierEnum.MENEUR]: '/images/result/Meneur.png',
    [MetierEnum.TRAVAILLEUR]: '/images/result/Travailleur.png',
    [MetierEnum.BOTANISTE]: '/images/result/Botaniste.png'
})

export const RESULT_TEXT_IMAGE_BY_METIER = Object.freeze({
    [MetierEnum.INVENTEUR]: '/images/result/Inventeur_text.png',
    [MetierEnum.MENEUR]: '/images/result/Meneur_text.png',
    [MetierEnum.TRAVAILLEUR]: '/images/result/Travailleur_text.png',
    [MetierEnum.BOTANISTE]: '/images/result/Botaniste_text.png'
})

export const RESULT_SCREEN_DEFAULT_COLOR = '#ff0000'
export const RESULT_SCREEN_EMISSIVE_INTENSITY = 1.15
export const RESULT_ZONE_HELPER_COLOR = '#ffd166'
export const RESULT_ZONE_TRIGGERED_COLOR = '#4fd58a'
export const RESULT_CASINO_DURATION_MS = 8000
export const RESULT_CASINO_FRAME_DURATION_MS = 120
