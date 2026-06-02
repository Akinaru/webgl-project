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
import ChampignonInteraction from './Interactives/ChampignonInteraction.js'
import SceneRecyclageCeilingLights from './Interactives/CeilingLights.js'
import { setupSceneRecyclageWorldDebug } from './World.debug.js'
import * as SceneRecyclageWorldConstants from './World.constants.js'
import { pickCycledSceneMusic } from '../../../Audio/SceneMusicPicker.js'
import { SCENE_RECYCLAGE_VARIANTS } from '../SceneRecyclage.config.js'
import UnderwaterParticles from './UnderwaterParticles.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'
import { sceneSources } from '../../../Source/sources.js'

let recyclageWorldInstanceIndex = 0
const VALIDATION_BUTTON_NAME_TOKEN = 'button_right'
const VALIDATION_BUTTON_MAX_DISTANCE = 2.6
const CHAMPIGNON_END_DIALOGUE_KEY = 'recyclage_0_end'
const CHAMPIGNON_PLACE_OBJECTIVE_KEY = 'recyclage_place_champignons'
const CHAMPIGNON_LIGHT_OBJECTIVE_KEY = 'recyclage_light_champignons'
const CHAMPIGNON_LIGHT_OBJECTIVE_TEXT = 'Allume tous les champignons en meme temps.'
const BORNE_OBJECTIVE_KEY = 'recyclage_restart_nanobots'
const BORNE_OBJECTIVE_TEXT = "Cliquer sur l'ecran de la borne"
const NANOBOTS_INTRO_DIALOGUE_KEY = SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].arrivalDialogueKey
const NANOBOTS_VALIDATION_DIALOGUE_KEY = SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS].validationDialogueKey
const NANOBOTS_DOME_TRIGGER_DISTANCE = 2.8
const NANOBOTS_SCENE_FOV = 40
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
        this.hasEnabledBorneAfterNanobotsIntro = false
        this.nanobotsReturnState = null
        this.hasStartedChampignonInteraction = false
        this.isCompletingChampignonInteraction = false
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
        this.nanobotsDomeWorldPosition = new THREE.Vector3()
        this.playerToDomeOffset = new THREE.Vector3()

        this.onDialogueEnd = ({ key } = {}) =>
        {
            if(key === this.variantConfig.arrivalDialogueKey)
            {
                if(this.isUnifiedNanobotsFlow)
                {
                    if(this.hasStartedChampignonInteraction !== true)
                    {
                        this.startChampignonInteraction()
                        return
                    }

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

            if(this.isUnifiedNanobotsFlow && key === CHAMPIGNON_END_DIALOGUE_KEY)
            {
                this.unlockPrimaryBadge()
                this.borne?.setScreenAwake?.(true)
                this.openRecyclageDoor()
                return
            }

            if(this.isUnifiedNanobotsFlow && key === NANOBOTS_INTRO_DIALOGUE_KEY)
            {
                this.hasEnabledBorneAfterNanobotsIntro = true
                this.enableBorneInteraction()
                this.experience.objectiveManager?.showByKey?.(BORNE_OBJECTIVE_KEY, {
                    source: 'recyclageBorne',
                    customText: BORNE_OBJECTIVE_TEXT
                })
                return
            }

            if(this.isUnifiedNanobotsFlow && key === NANOBOTS_VALIDATION_DIALOGUE_KEY)
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
            resourceKey: this.variantConfig.modelResourceKey,
            debugParentFolder: this.debugFolder
        })
        this.findRecyclageDoor()
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
        this.applyChampignonLightPreset()
        if(this.variantConfig?.sceneKey === SceneEnum.NANOBOTS)
        {
            this.applyNanobotsLightPreset()
            this.experience.camera?.setFov?.(NANOBOTS_SCENE_FOV)
        }
        this.ceilingLights = new SceneRecyclageCeilingLights({
            recyclageModel: this.recyclageModel,
            debugParentFolder: this.debugFolder
        })
        this.underwaterParticles = new UnderwaterParticles({
            debugParentFolder: this.debugFolder
        })
        this.setUnderwaterDebug()

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
            this.champignonInteraction = new ChampignonInteraction({
                world: this,
                debugParentFolder: this.nanobotsDebugFolder,
                onPlacedAll: () => this.handleChampignonsPlacedAll(),
                onLightingProgress: ({ litCount = 0, totalCount = 0 } = {}) => this.updateChampignonLightingObjective(litCount, totalCount),
                onComplete: () => this.completeChampignonInteraction()
            })
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

    findRecyclageDoor()
    {
        this.recyclageDoorObject = null
        this.recyclageDoorInitialY = null
        this.recyclageDoorCurrentY = null
        this.recyclageDoorIsOpen = false

        this.recyclageModel?.model?.traverse((child) =>
        {
            if(this.recyclageDoorObject)
            {
                return
            }

            const name = String(child.name || '').trim().toLowerCase()
            if(name === SceneRecyclageWorldConstants.RECYCLAGE_DOOR_NAME)
            {
                this.recyclageDoorObject = child
                this.recyclageDoorInitialY = child.position.y
                this.recyclageDoorCurrentY = child.position.y
            }
        })
    }

    openRecyclageDoor()
    {
        if(!this.recyclageDoorObject || this.recyclageDoorIsOpen)
        {
            return
        }

        this.recyclageDoorIsOpen = true
        this.recyclageDoorTargetY = this.recyclageDoorInitialY + SceneRecyclageWorldConstants.RECYCLAGE_DOOR_OPEN_OFFSET
    }

    updateRecyclageDoor(deltaMs = 16.67)
    {
        if(!this.recyclageDoorObject || !this.recyclageDoorIsOpen || this.recyclageDoorTargetY === undefined)
        {
            return
        }

        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        this.recyclageDoorCurrentY = THREE.MathUtils.damp(
            this.recyclageDoorCurrentY,
            this.recyclageDoorTargetY,
            SceneRecyclageWorldConstants.RECYCLAGE_DOOR_ANIMATION_SPEED,
            deltaSeconds
        )
        this.recyclageDoorObject.position.y = this.recyclageDoorCurrentY
    }

    setUnderwaterDebug()
    {
        if(!this.experience?.debug?.isDebugEnabled || !this.debugFolder)
        {
            return
        }

        const debug = this.experience.debug

        const underwaterFolder = debug.addFolder('🌊 Sous-marin', {
            parent: this.debugFolder,
            expanded: false
        })

        // Environnement (fond + brouillard)
        const envFolder = debug.addFolder('Environnement', {
            parent: underwaterFolder,
            expanded: false
        })

        debug.addColorBinding(envFolder, this.environment, 'backgroundColor', {
            label: 'Couleur fond'
        })?.on?.('change', () =>
        {
            this.environment.scene.background = this.environment.backgroundColor
        })

        debug.addColorBinding(envFolder, this.environment, 'fogColor', {
            label: 'Couleur brouillard'
        })?.on?.('change', () =>
        {
            this.environment.applyFog()
        })

        debug.addBinding(envFolder, this.environment.state, 'fogNear', {
            label: 'Brouillard debut',
            min: 0,
            max: 50,
            step: 0.5
        })?.on?.('change', () =>
        {
            this.environment.applyFog()
        })

        debug.addBinding(envFolder, this.environment.state, 'fogFar', {
            label: 'Brouillard fin',
            min: 1,
            max: 100,
            step: 0.5
        })?.on?.('change', () =>
        {
            this.environment.applyFog()
        })

        // Lumières
        const lightFolder = debug.addFolder('Lumieres', {
            parent: underwaterFolder,
            expanded: false
        })

        const applyLight = () =>
        {
            this.light?.applyLightColorsAndIntensity?.()
        }

        debug.addBinding(lightFolder, this.light.state, 'ambientIntensity', {
            label: 'Intensite ambiante',
            min: 0,
            max: 2,
            step: 0.01
        })?.on?.('change', applyLight)

        debug.addBinding(lightFolder, this.light.state, 'hemiIntensity', {
            label: 'Intensite hemispherique',
            min: 0,
            max: 2,
            step: 0.01
        })?.on?.('change', applyLight)

        debug.addBinding(lightFolder, this.light.state, 'sunIntensity', {
            label: 'Intensite soleil',
            min: 0,
            max: 3,
            step: 0.01
        })?.on?.('change', applyLight)

        debug.addColorBinding(lightFolder, this.light, 'ambientColor', {
            label: 'Couleur ambiante'
        })?.on?.('change', applyLight)

        debug.addColorBinding(lightFolder, this.light, 'skyColor', {
            label: 'Couleur ciel'
        })?.on?.('change', applyLight)

        debug.addColorBinding(lightFolder, this.light, 'groundColor', {
            label: 'Couleur sol'
        })?.on?.('change', applyLight)

        debug.addColorBinding(lightFolder, this.light, 'sunColor', {
            label: 'Couleur soleil'
        })?.on?.('change', applyLight)
    }

    applyLightPreset(preset)
    {
        if(!this.light || !preset)
        {
            return
        }

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

    applyChampignonLightPreset()
    {
        if(!this.light || !this.environment)
        {
            return
        }

        this.applyLightPreset(SceneRecyclageWorldConstants.RECYCLAGE_CHAMPIGNON_LIGHT_PRESET)

        const envPreset = SceneRecyclageWorldConstants.RECYCLAGE_UNDERWATER_ENV
        this.environment.backgroundColor.set(envPreset.backgroundColor)
        this.environment.fogColor.set(envPreset.fogColor)
        this.environment.state.fogMode = envPreset.fogMode
        this.environment.state.fogNear = envPreset.fogNear
        this.environment.state.fogFar = envPreset.fogFar
        this.environment.setFog()
    }

    applyNanobotsLightPreset()
    {
        if(!this.light || !this.environment)
        {
            return
        }

        this.applyLightPreset(SceneRecyclageWorldConstants.RECYCLAGE_NANOBOTS_LIGHT_PRESET)

        const envPreset = SceneRecyclageWorldConstants.RECYCLAGE_NANOBOTS_ENV
        this.environment.backgroundColor.set(envPreset.backgroundColor)
        this.environment.fogColor.set(envPreset.fogColor)
        this.environment.state.fogMode = envPreset.fogMode
        this.environment.state.fogNear = envPreset.fogNear
        this.environment.state.fogFar = envPreset.fogFar
        this.environment.setFog()
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

    startChampignonInteraction()
    {
        if(this.hasStartedChampignonInteraction || !this.champignonInteraction)
        {
            return
        }

        this.hasStartedChampignonInteraction = true
        this.experience.dialogueManager?.pause?.()
        this.experience.objectiveManager?.showByKey?.(CHAMPIGNON_PLACE_OBJECTIVE_KEY, {
            source: 'recyclageChampignons'
        })
        this.champignonInteraction.start()
    }

    handleChampignonsPlacedAll()
    {
        this.experience.objectiveManager?.completeCurrentObjective?.({ clear: false })
        this.experience.objectiveManager?.showByKey?.(CHAMPIGNON_LIGHT_OBJECTIVE_KEY, {
            source: 'recyclageChampignons',
            customText: this.formatChampignonLightingObjectiveText(0, this.champignonInteraction?.champignons?.length ?? 0)
        })
    }

    formatChampignonLightingObjectiveText(litCount = 0, totalCount = 0)
    {
        return `${CHAMPIGNON_LIGHT_OBJECTIVE_TEXT} (${litCount}/${totalCount})`
    }

    updateChampignonLightingObjective(litCount = 0, totalCount = 0)
    {
        if(this.experience.objectiveManager?.state?.objectiveKey !== CHAMPIGNON_LIGHT_OBJECTIVE_KEY)
        {
            return
        }

        this.experience.objectiveManager?.updateCurrentContext?.({
            customText: this.formatChampignonLightingObjectiveText(litCount, totalCount)
        })
    }

    completeChampignonInteraction()
    {
        if(this.isCompletingChampignonInteraction)
        {
            return
        }

        this.isCompletingChampignonInteraction = true
        this.experience.objectiveManager?.completeCurrentObjective?.()
        this.experience.dialogueManager?.resume?.()
        this.experience.dialogueManager?.startByKey?.(CHAMPIGNON_END_DIALOGUE_KEY)
        this.isCompletingChampignonInteraction = false
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

    startNanobotsIntroDialogueIfNeeded()
    {
        if(
            this.isUnifiedNanobotsFlow !== true
            || this.hasStartedNanobotsDialogue === true
            || this.hasEnabledBorneAfterNanobotsIntro === true
            || this.isNanobotsRoomActive === true
            || this.isLoadingNanobotsRoom === true
            || this.hasUnlockedPrimaryBadge !== true
            || !this.player
            || !this.borne?.borneRoot
            || this.experience.dialogueManager?.isRunning?.() === true
        )
        {
            return
        }

        this.borne.borneRoot.getWorldPosition(this.nanobotsDomeWorldPosition)
        this.playerToDomeOffset.subVectors(this.player.position, this.nanobotsDomeWorldPosition)
        this.playerToDomeOffset.y = 0
        if(this.playerToDomeOffset.length() > NANOBOTS_DOME_TRIGGER_DISTANCE)
        {
            return
        }

        this.hasStartedNanobotsDialogue = true
        this.experience.dialogueManager?.startByKey?.(NANOBOTS_INTRO_DIALOGUE_KEY)
    }

    async openEmbeddedNanobotsRoom()
    {
        if(!this.isUnifiedNanobotsFlow || this.isLoadingNanobotsRoom || this.isNanobotsRoomActive)
        {
            return
        }

        this.isLoadingNanobotsRoom = true
        this.borne?.setEnabled?.(false)
        if(this.experience.objectiveManager?.state?.objectiveKey === BORNE_OBJECTIVE_KEY)
        {
            this.experience.objectiveManager.completeCurrentObjective()
        }
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

        this.startEmbeddedNanobotInspection()
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
            clearExistingRoots: false,
            debugParentFolder: this.debugFolder
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
        this.applyNanobotsLightPreset()
        this.experience.camera?.setFov?.(NANOBOTS_SCENE_FOV)

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
        if(this.isUnifiedNanobotsFlow !== true)
        {
            this.nanobotInspector?.open?.()
            return
        }

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
        this.applyChampignonLightPreset()
        this.experience.camera?.resetFov?.()

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
        this.startNanobotsIntroDialogueIfNeeded()
        this.cascadeTubes?.update?.(delta)
        this.slopeSplash?.update?.(delta)
        this.nanobotsCascadeTubes?.update?.(delta)
        this.nanobotsSlopeSplash?.update?.(delta)
        this.walls?.update?.(delta)
        this.nanobotsWalls?.update?.(delta)
        this.light?.update?.(delta)
        this.player?.update?.(delta)
        this.updateRecyclageDoor(delta)
        this.underwaterParticles?.update?.(delta)
        this.champignonInteraction?.update?.(delta)
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
        if(this.champignonStartTimeout)
        {
            window.clearTimeout(this.champignonStartTimeout)
            this.champignonStartTimeout = null
        }
        if(this.player)
        {
            this.player.destroy?.()
            this.player = null
        }

        this.underwaterParticles?.destroy?.()
        this.underwaterParticles = null
        this.ceilingLights?.destroy?.()
        this.ceilingLights = null
        this.recyclageDoorObject = null
        this.recyclageDoorIsOpen = false
        this.recyclageDoorCurrentY = null
        this.recyclageDoorInitialY = null
        this.recyclageDoorTargetY = undefined
        this.nanobotInspector?.destroy?.()
        this.nanobotInspector = null
        this.champignonInteraction?.destroy?.()
        this.champignonInteraction = null
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
