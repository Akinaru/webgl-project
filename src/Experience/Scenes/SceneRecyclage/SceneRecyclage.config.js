import SceneEnum from '../../Enum/SceneEnum.js'

export const SCENE_RECYCLAGE_VARIANTS = Object.freeze({
    [SceneEnum.RECYCLAGE]: Object.freeze({
        sceneKey: SceneEnum.RECYCLAGE,
        sceneLabel: 'Champignons',
        debugLabel: 'Scene champignons',
        modelResourceKey: 'recyclageModel',
        arrivalDialogueKey: 'recyclage_0',
        validationDialogueKey: null,
        completionBadgeKey: 'recyclage_1',
        completionTargetScene: SceneEnum.DISTRIBUTION,
        musicStorageKey: 'scene-music.recyclage.champignons',
        ambientSoundKeys: Object.freeze(['recyclageMusic1']),
        spawnPosition: Object.freeze({
            x: -7.598,
            y: 0.8,
            z: 1.756
        }),
        spawnYawDeg: -450.001,
        spawnPitchDeg: 1.387
    }),
    [SceneEnum.NANOBOTS]: Object.freeze({
        sceneKey: SceneEnum.NANOBOTS,
        sceneLabel: 'Nanobots',
        debugLabel: 'Scene nanobots',
        modelResourceKey: 'nanobotsModel',
        arrivalDialogueKey: 'recyclage_1',
        validationDialogueKey: 'recyclage_1_validation',
        completionBadgeKey: 'recyclage_2',
        completionTargetScene: SceneEnum.DISTRIBUTION,
        musicStorageKey: 'scene-music.recyclage.nanobots',
        ambientSoundKeys: Object.freeze(['recyclageMusic2']),
        spawnPosition: Object.freeze({
            x: 0.380,
            y: 0.8,
            z: -0.037
        }),
        spawnYawDeg: -268.614,
        spawnPitchDeg: -1.225
    })
})
