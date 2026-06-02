import Experience from '../../../Experience.js'
import * as THREE from 'three'
import EventEnum from '../../../Enum/EventEnum.js'
import SceneEnum from '../../../Enum/SceneEnum.js'
import Player from '../../../Common/Characters/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import MapLight from '../../Map/World/MapLight.js'
import SceneRecyclageModel from './Model.js'
import SceneRecyclageWalls from './Walls/Walls.js'
import SceneRecuperationCascadeTubes from '../../SceneRecuperation/World/Water/CascadeTubes.js'
import SlopeSplash from '../../SceneRecuperation/World/Water/SlopeSplash.js'
import NanobotInspector from '../../SceneNanobots/NanobotInspector.js'
import Borne from './Interactives/Borne.js'
import { setupSceneRecyclageWorldDebug } from './World.debug.js'
import * as SceneRecyclageWorldConstants from './World.constants.js'
import { pickCycledSceneMusic } from '../../../Audio/SceneMusicPicker.js'
import { SCENE_RECYCLAGE_VARIANTS } from '../SceneRecyclage.config.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'
import { sceneSources } from '../../../Source/sources.js'

let recyclageWorldInstanceIndex = 0
const VALIDATION_BUTTON_NAME_TOKEN = 'button_right'
const VALIDATION_BUTTON_MAX_DISTANCE = 2.6
export default class SceneRecyclageWorld
{
    constructor(variantConfig = SCENE_RECYCLAGE_VARIANTS[SceneEnum.RECYCLAGE])
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.variantConfig = variantConfig
        this.readyEventName = `${EventEnum.READY}.recyclageWorld${recyclageWorldInstanceIndex++}`
        this.hasStartedArrivalDialogue = false
        this.hasCompletedScene = false
        this.isValidationInteractionEnabled = false
        this.hasTriggeredValidationDialogue = false
        this.validationButtonMeshes = []
        this.isUnifiedNanobotsFlow = this.variantConfig?.sceneKey === SceneEnum.RECYCLAGE
        this.isLoadingNanobotsRoom = false
        this.isNanobotsRoomActive = false
        this.hasUnlockedPrimaryBadge = false
        this.hasStartedNanobotsDialogue = false
        this.nanobotsReturnState = null
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })

        this.onDialogueEnd = ({ key } = {}) =>
        {
            if(key === this.variantConfig.arrivalDialogueKey)
            {
                if(this.isUnifiedNanobotsFlow)
                {
                    this.unlockPrimaryBadge()
                    this.enableBorneInteraction()
                    return
                }

                if(this.variantConfig.validationDialogueKey)
                {
                    this.isValidationInteractionEnabled = true
                    return
                }

                this.completeScene()
                return
            }

            if(this.variantConfig.validationDialogueKey && key === this.variantConfig.validationDialogueKey)
            {
                this.completeScene()
                return
            }

            if(this.isUnifiedNanobotsFlow && key === SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].arrivalDialogueKey)
            {
                this.startEmbeddedNanobotInspection()
                return
            }

            if(this.isUnifiedNanobotsFlow && key === SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].validationDialogueKey)
            {
                this.completeScene()
            }
        }

        if(this.resources.isReady)
        {
            this.setUp()
            return
        }

        this.resources.on(this.readyEventName, () =>
        {
            this.setUp()
        })
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.setDebug()
        this.setNanobotsDebugFolder()
        this.setWaterDebugFolders()
        this.environment = new MapEnvironment()
        this.recyclageModel = new SceneRecyclageModel({
            resourceKey: this.variantConfig.modelResourceKey
        })
        this.walls = new SceneRecyclageWalls({
            recyclageModel: this.recyclageModel,
            debugParentFolder: this.debugFolder
        })
        this.setWaterEffects()
        this.collectValidationButtonMeshes()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.recyclageModel.getBoundaryRadius?.() ?? 48,
            boundaryBox: this.recyclageModel.getBoundaryBox?.() ?? null,
            collisionBoxes: [],
            useBoxCollisionResolution: false,
            useMeshCollisionRaycast: true,
            collisionMeshes: this.recyclageModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.recyclageModel.getGroundMeshes?.() ?? [],
            spawnPosition: this.variantConfig.spawnPosition ?? this.recyclageModel.getSpawnPosition?.(),
            spawnYaw: THREE.MathUtils.degToRad(this.variantConfig.spawnYawDeg ?? 0),
            spawnPitch: THREE.MathUtils.degToRad(this.variantConfig.spawnPitchDeg ?? 0)
        })
        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null,
            debugParentFolder: this.debugFolder
        })
        this.applyNanobotsRecuperationSunPreset()

        if(this.experience.bloom)
        {
            this.experience.bloom.setSceneContext({
                scene: this.experience.scene,
                groundMeshes: this.recyclageModel.getGroundMeshes?.() ?? [],
                rails: [],
                target: this.player
            })
        }

        if(this.isUnifiedNanobotsFlow)
        {
            this.borne = new Borne({
                world: this,
                debugParentFolder: this.nanobotsDebugFolder,
                onActivate: () => this.openEmbeddedNanobotsRoom()
            })
        }

        this.startArrivalDialogue()
    }

    collectValidationButtonMeshes()
    {
        this.validationButtonMeshes = []

        const root = this.recyclageModel?.model
        if(!root)
        {
            return
        }

        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(normalizedName.includes(VALIDATION_BUTTON_NAME_TOKEN))
            {
                this.validationButtonMeshes.push(child)
            }
        })
    }

    setDebug()
    {
        setupSceneRecyclageWorldDebug.call(this)
    }

    setNanobotsDebugFolder()
    {
        if(!this.experience?.debug?.isDebugEnabled || !this.debugFolder || this.nanobotsDebugFolder)
        {
            return
        }

        this.nanobotsDebugFolder = this.experience.debug.addFolder('Scene nano bots', {
            parent: this.debugFolder,
            expanded: true
        })
    }

    setWaterDebugFolders()
    {
        if(!this.experience?.debug?.isDebugEnabled || this.variantConfig?.sceneKey !== SceneEnum.NANOBOTS || !this.debugFolder)
        {
            return
        }

        this.waterDebugFolder = this.experience.debug.addFolder('Eau', {
            parent: this.debugFolder,
            expanded: false
        })
        this.waterTubesDebugFolder = this.experience.debug.addFolder('Tuyaux', {
            parent: this.waterDebugFolder,
            expanded: false
        })
        this.waterSlopesDebugFolder = this.experience.debug.addFolder('Pentes', {
            parent: this.waterDebugFolder,
            expanded: false
        })
    }

    setWaterEffects()
    {
        if(this.variantConfig?.sceneKey !== SceneEnum.NANOBOTS)
        {
            return
        }

        this.sharedWaterColors = {
            baseColor: new THREE.Color('#1F9CD2'),
            deepFoamColor: new THREE.Color('#9AF6FE'),
            surfaceFoamColor: new THREE.Color('#FDFDF7')
        }

        this.cascadeTubes = new SceneRecuperationCascadeTubes({
            recuperationModel: this.recyclageModel,
            debugTubeFolder: this.waterTubesDebugFolder,
            debugSlopeFolder: this.waterSlopesDebugFolder,
            sharedWaterColors: this.sharedWaterColors,
            slopeFlowAngleOffsetByMeshName: this.createNanobotsSlopeFlowAngleOffsets()
        })

        this.slopeSplash = new SlopeSplash({
            debugParentFolder: this.waterDebugFolder,
            emitters: this.createNanobotsSlopeSplashEmitters()
        })
    }

    createNanobotsSlopeSplashEmitters()
    {
        return SceneRecyclageWorldConstants.NANOBOTS_SLOPE_SPLASH_EMITTERS.map((emitter) => ({ ...emitter }))
    }

    createNanobotsSlopeFlowAngleOffsets()
    {
        return SceneRecyclageWorldConstants.NANOBOTS_REVERSED_SLOPE_MESH_NAMES.reduce((offsets, meshName) =>
        {
            offsets[meshName.toLowerCase()] = Math.PI
            return offsets
        }, {})
    }

    applyNanobotsRecuperationSunPreset()
    {
        if(this.variantConfig?.sceneKey !== SceneEnum.NANOBOTS || !this.light)
        {
            return
        }

        const preset = SceneRecyclageWorldConstants.NANOBOTS_RECUPERATION_SUN_PRESET
        Object.assign(this.light.state, preset.state)
        this.light.ambientColor.set(preset.colors.ambient)
        this.light.skyColor.set(preset.colors.sky)
        this.light.groundColor.set(preset.colors.ground)
        this.light.sunColor.set(preset.colors.sun)
        this.light.applyLightColorsAndIntensity()
        this.light.sunLight.visible = this.light.state.sunIntensity > 0
        if(this.light.sunVisual)
        {
            this.light.sunVisual.visible = this.light.state.sunIntensity > 0
        }
        this.light.updateCoordinates()
        this.light.updateFocusPosition()
        this.light.sunLight.position.setFromSpherical(this.light.spherical).add(this.light.focusPosition)
        this.light.sunTarget.position.copy(this.light.focusPosition)
        this.light.updateSunVisual()
        this.light.updateShadow()
    }

    startArrivalDialogue()
    {
        if(this.hasStartedArrivalDialogue)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        this.hasStartedArrivalDialogue = true
        this.experience.dialogueManager?.on?.('end.recyclageWorld', this.onDialogueEnd)
        this.inputs = this.experience.inputs
        this.onInteractDown = () =>
        {
            this.handleValidationInteraction()
        }
        this.inputs?.on?.('sceneinteractdown.recyclageWorld', this.onInteractDown)
        if(this.variantConfig.arrivalDialogueKey === 'recyclage_0')
        {
            this.borne?.setScreenAwake?.(true)
        }
        this.experience.dialogueManager?.startByKey?.(this.variantConfig.arrivalDialogueKey)
    }

    unlockPrimaryBadge()
    {
        if(this.hasUnlockedPrimaryBadge || !this.variantConfig.completionBadgeKey)
        {
            return
        }

        this.hasUnlockedPrimaryBadge = true
        this.experience.badgeManager?.unlock?.(this.variantConfig.completionBadgeKey)
    }

    enableBorneInteraction()
    {
        this.borne?.setEnabled?.(true)
    }

    async openEmbeddedNanobotsRoom()
    {
        if(!this.isUnifiedNanobotsFlow || this.isLoadingNanobotsRoom || this.isNanobotsRoomActive)
        {
            return
        }

        this.isLoadingNanobotsRoom = true
        this.borne?.setEnabled?.(false)
        this.nanobotsReturnState = this.capturePlayerState()

        try
        {
            await this.experience.sceneManager?.runTaskTransition?.({
                label: 'Connexion a la borne',
                phrase: 'Preparation de la salle nanobots',
                variant: 'nanobots',
                task: async ({ setProgress }) =>
                {
                    setProgress(12)
                    await this.loadEmbeddedNanobotsResources(setProgress)
                    setProgress(74, { label: 'Teleportation vers les nanobots' })
                    this.activateEmbeddedNanobotsRoom()
                    setProgress(92, { label: 'Initialisation du nanobot' })
                }
            })
        }
        finally
        {
            this.isLoadingNanobotsRoom = false
        }

        this.experience.dialogueManager?.startByKey?.(SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].arrivalDialogueKey)
    }

    capturePlayerState()
    {
        if(!this.player)
        {
            return null
        }

        return {
            position: this.player.position.clone(),
            yaw: this.player.yaw,
            pitch: this.player.pitch
        }
    }

    async loadEmbeddedNanobotsResources(setProgress)
    {
        const nanobotsSources = sceneSources[SceneEnum.NANOBOTS] || []
        if(nanobotsSources.length > 0)
        {
            let loadedItems = 0
            const totalItems = nanobotsSources.filter((source) => !this.resources.items[source.name]).length
            const onItemLoaded = () =>
            {
                loadedItems++
                const progress = totalItems > 0 ? loadedItems / totalItems : 1
                setProgress?.(12 + (progress * 50))
            }

            this.resources.on('itemLoaded', onItemLoaded)
            await this.resources.loadGroup(nanobotsSources)
            this.resources.off('itemLoaded', onItemLoaded)
        }

        if(this.nanobotsModel)
        {
            return
        }

        const offset = SceneRecyclageWorldConstants.NANOBOTS_EMBEDDED_MODEL_OFFSET
        this.nanobotsModel = new SceneRecyclageModel({
            resourceKey: SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].modelResourceKey,
            position: offset,
            visible: false,
            clearExistingRoots: false
        })
        this.nanobotsWalls = new SceneRecyclageWalls({
            recyclageModel: this.nanobotsModel,
            debugParentFolder: this.debugFolder
        })

        this.sharedWaterColors = {
            baseColor: new THREE.Color('#1F9CD2'),
            deepFoamColor: new THREE.Color('#9AF6FE'),
            surfaceFoamColor: new THREE.Color('#FDFDF7')
        }
        this.nanobotsCascadeTubes = new SceneRecuperationCascadeTubes({
            recuperationModel: this.nanobotsModel,
            debugTubeFolder: this.waterTubesDebugFolder,
            debugSlopeFolder: this.waterSlopesDebugFolder,
            sharedWaterColors: this.sharedWaterColors,
            slopeFlowAngleOffsetByMeshName: this.createNanobotsSlopeFlowAngleOffsets()
        })
        this.nanobotsSlopeSplash = new SlopeSplash({
            debugParentFolder: this.waterDebugFolder,
            emitters: this.createNanobotsSlopeSplashEmitters()
        })
        this.nanobotInspector = new NanobotInspector({
            world: this,
            model: this.nanobotsModel,
            closeLabel: 'Valider',
            interactionGate: () => this.isNanobotsRoomActive === true,
            completionDialogueKey: SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].validationDialogueKey,
            onInspectionExit: () => this.handleEmbeddedNanobotInspectionExit()
        })
    }

    activateEmbeddedNanobotsRoom()
    {
        const nanobotsConfig = SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS]
        this.isNanobotsRoomActive = true
        this.recyclageModel?.setVisible?.(false)
        this.nanobotsModel?.setVisible?.(true)

        this.player?.setRuntimeEnvironment?.({
            boundaryRadius: this.nanobotsModel?.getBoundaryRadius?.() ?? 48,
            boundaryBox: this.nanobotsModel?.getBoundaryBox?.() ?? null,
            collisionBoxes: [],
            useBoxCollisionResolution: false,
            useMeshCollisionRaycast: true,
            collisionMeshes: this.nanobotsModel?.getCollisionMeshes?.() ?? [],
            groundMeshes: this.nanobotsModel?.getGroundMeshes?.() ?? []
        })
        this.player?.teleportTo?.({
            position: nanobotsConfig.spawnPosition ?? this.nanobotsModel?.getSpawnPosition?.(),
            yaw: THREE.MathUtils.degToRad(nanobotsConfig.spawnYawDeg ?? 0),
            pitch: THREE.MathUtils.degToRad(nanobotsConfig.spawnPitchDeg ?? 0)
        })

        if(this.experience.bloom)
        {
            this.experience.bloom.setSceneContext({
                scene: this.experience.scene,
                groundMeshes: this.nanobotsModel?.getGroundMeshes?.() ?? [],
                rails: [],
                target: this.player
            })
        }
    }

    startEmbeddedNanobotInspection()
    {
        if(this.isUnifiedNanobotsFlow !== true || this.hasStartedNanobotsDialogue !== false)
        {
            this.nanobotInspector?.open?.()
            return
        }

        this.hasStartedNanobotsDialogue = true
        this.nanobotInspector?.open?.()
    }

    handleEmbeddedNanobotInspectionExit()
    {
        if(!this.isUnifiedNanobotsFlow)
        {
            return
        }

        this.isNanobotsRoomActive = false
        this.nanobotsModel?.setVisible?.(false)
        this.recyclageModel?.setVisible?.(true)

        this.player?.setRuntimeEnvironment?.({
            boundaryRadius: this.recyclageModel?.getBoundaryRadius?.() ?? 48,
            boundaryBox: this.recyclageModel?.getBoundaryBox?.() ?? null,
            collisionBoxes: [],
            useBoxCollisionResolution: false,
            useMeshCollisionRaycast: true,
            collisionMeshes: this.recyclageModel?.getCollisionMeshes?.() ?? [],
            groundMeshes: this.recyclageModel?.getGroundMeshes?.() ?? []
        })

        if(this.nanobotsReturnState)
        {
            this.player?.teleportTo?.(this.nanobotsReturnState)
        }

        if(this.experience.bloom)
        {
            this.experience.bloom.setSceneContext({
                scene: this.experience.scene,
                groundMeshes: this.recyclageModel?.getGroundMeshes?.() ?? [],
                rails: [],
                target: this.player
            })
        }
    }

    handleValidationInteraction()
    {
        if(this.isValidationInteractionEnabled !== true || this.hasTriggeredValidationDialogue === true)
        {
            return
        }

        if(!Array.isArray(this.validationButtonMeshes) || this.validationButtonMeshes.length === 0)
        {
            return
        }

        const hit = this.centerRaycaster.intersectFirstHit(this.validationButtonMeshes, false)
        if(!hit?.object || !Number.isFinite(hit.distance) || hit.distance > VALIDATION_BUTTON_MAX_DISTANCE)
        {
            return
        }

        this.hasTriggeredValidationDialogue = true
        this.isValidationInteractionEnabled = false
        this.experience.dialogueManager?.startByKey?.(this.variantConfig.validationDialogueKey)
    }

    completeScene()
    {
        if(this.hasCompletedScene)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        if(this.variantConfig.completionBadgeKey && this.isUnifiedNanobotsFlow !== true)
        {
            this.experience.badgeManager?.unlock?.(this.variantConfig.completionBadgeKey)
        }
        if(this.isUnifiedNanobotsFlow)
        {
            this.experience.badgeManager?.unlock?.(SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].completionBadgeKey)
        }
        this.hasCompletedScene = true
        this.completeSceneTimeout = window.setTimeout(() =>
        {
            this.experience.sceneManager?.switchTo?.(this.variantConfig.completionTargetScene ?? SceneEnum.DISTRIBUTION)
        }, SceneRecyclageWorldConstants.RECYCLAGE_DISTRIBUTION_SWITCH_DELAY_MS)
    }

    syncAmbientSound()
    {
        const activeVariant = this.isUnifiedNanobotsFlow && this.isNanobotsRoomActive
            ? SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS]
            : this.variantConfig

        if(this.experience.sound?.isAnySoundPlaying?.(activeVariant.ambientSoundKeys))
        {
            return
        }

        const musicKey = pickCycledSceneMusic(
            activeVariant.musicStorageKey,
            activeVariant.ambientSoundKeys
        )

        if(!musicKey)
        {
            return
        }

        this.experience.sound?.stopChannel?.('music')
        this.experience.sound?.play?.(musicKey, {
            channel: 'music'
        })
    }

    update(delta = this.experience.time.delta)
    {
        this.syncAmbientSound()
        this.cascadeTubes?.update?.(delta)
        this.slopeSplash?.update?.(delta)
        this.nanobotsCascadeTubes?.update?.(delta)
        this.nanobotsSlopeSplash?.update?.(delta)
        this.light?.update?.(delta)
        this.player?.update?.(delta)
        this.borne?.update?.(delta)
        this.nanobotInspector?.update?.(delta)
    }

    destroy()
    {
        this.resources.off(this.readyEventName)
        this.experience.dialogueManager?.off?.('end.recyclageWorld')
        this.inputs?.off?.('sceneinteractdown.recyclageWorld')

        if(this.completeSceneTimeout)
        {
            window.clearTimeout(this.completeSceneTimeout)
            this.completeSceneTimeout = null
        }

        if(this.player)
        {
            this.player.destroy?.()
            this.player = null
        }

        this.nanobotInspector?.destroy?.()
        this.nanobotInspector = null
        this.borne?.destroy?.()
        this.borne = null

        if(this.recyclageModel)
        {
            this.recyclageModel.destroy?.()
            this.recyclageModel = null
        }

        if(this.nanobotsModel)
        {
            this.nanobotsModel.destroy?.()
            this.nanobotsModel = null
        }

        if(this.walls)
        {
            this.walls.destroy?.()
            this.walls = null
        }

        if(this.nanobotsWalls)
        {
            this.nanobotsWalls.destroy?.()
            this.nanobotsWalls = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        if(this.cascadeTubes)
        {
            this.cascadeTubes.destroy?.()
            this.cascadeTubes = null
        }

        if(this.slopeSplash)
        {
            this.slopeSplash.destroy?.()
            this.slopeSplash = null
        }

        if(this.nanobotsCascadeTubes)
        {
            this.nanobotsCascadeTubes.destroy?.()
            this.nanobotsCascadeTubes = null
        }

        if(this.nanobotsSlopeSplash)
        {
            this.nanobotsSlopeSplash.destroy?.()
            this.nanobotsSlopeSplash = null
        }

        this.experience.sound?.stopChannel?.(SceneRecyclageWorldConstants.RECYCLAGE_AMBIENT_CHANNEL)

        if(this.light)
        {
            this.light.destroy?.()
            this.light = null
        }

        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.nanobotsDebugFolder = null
    }
}
