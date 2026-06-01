import audioSources from './sources.audio.js'
import modelSources from './sources.models.js'
import textureSources from './sources.textures.js'
import SceneEnum from '../Enum/SceneEnum.js'

// --- Sources communes (chargées dès le boot) ---
export const commonSources = [
    ...audioSources,
    // Bloom
    ...modelSources.filter(s => s.name === 'bloomModel'),
    ...textureSources.filter(s => s.name.startsWith('bloom')),
    // Autres utilitaires
    ...textureSources.filter(s => s.name === 'bushFoliageAlphaTexture')
]

// --- Sources spécifiques par scène ---
export const sceneSources = {
    [SceneEnum.MAP]: [
        ...modelSources.filter((s) => s.name === 'mapModel'
            || s.name.startsWith('building')
            || s.name.startsWith('mapObjects')
            || s.name.startsWith('mapMedieval')),
        ...textureSources.filter(s => s.name.startsWith('building'))
    ],
    [SceneEnum.RECUPERATION]: [
        ...modelSources.filter(s => s.name === 'recuperationModel'),
        ...textureSources.filter(s => s.name.startsWith('recuperation'))
    ],
    [SceneEnum.RECYCLAGE]: [
        ...modelSources.filter(s => s.name === 'recyclageModel'),
        ...textureSources.filter(s => s.name === 'recuperationWallSlabsTexture')
    ],
    [SceneEnum.NANOBOTS]: [
        ...modelSources.filter(s => s.name === 'nanobotsModel'),
        ...textureSources.filter(s => s.name === 'recuperationWallSlabsTexture')
    ],
    [SceneEnum.DISTRIBUTION]: [
        ...modelSources.filter(s => s.name === 'distributionModel'),
        // La distribution partage maintenant la texture des murs de récupération
        ...textureSources.filter(s => s.name === 'recuperationWallSlabsTexture'
            || s.name === 'distributionBackgroundResultTexture')
    ]
}

export const bootSources = commonSources

export default [
    ...commonSources,
    ...sceneSources[SceneEnum.MAP],
    ...sceneSources[SceneEnum.RECUPERATION],
    ...sceneSources[SceneEnum.RECYCLAGE],
    ...sceneSources[SceneEnum.NANOBOTS],
    ...sceneSources[SceneEnum.DISTRIBUTION]
]
