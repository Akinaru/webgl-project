import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import EventEnum from '../../../../Enum/EventEnum.js'
import SceneEnum from '../../../../Enum/SceneEnum.js'
import Player from '../../../../Common/Characters/Player.js'
import MapLight from '../../../Map/World/MapLight.js'
import MapEnvironment from '../../../Map/World/MapEnvironment.js'
import SceneRecuperationModel from '../Model/Model.js'
import SceneRecuperationWater from '../Water/Water.js'
import Door from '../Interactives/Door.js'
import Materiau from '../Interactives/Materiau.js'
import Television from '../Interactives/Television.js'
import ShowerParticles from '../Water/ShowerParticles.js'
import SceneRecuperationWindTurbine from '../Interactives/WindTurbine.js'
import SceneRecuperationTubeWaterController from '../Water/TubeWaterController.js'
import SceneRecuperationRoom2Trigger from '../Progression/Room2Trigger.js'
import SceneRecuperationCollisionDebug from '../Debug/SceneRecuperationCollision.debug.js'
import SceneRecuperationCascadeTubes from '../Water/CascadeTubes.js'
import SlopeSplash from '../Water/SlopeSplash.js'
import SceneRecuperationScoring from '../Progression/Scoring.js'
import SceneRecuperationWalls from '../Walls/Walls.js'
import SceneRecuperationCeilingLights from '../Lights/CeilingLights.js'
import { setupSceneRecuperationWorldDebug } from './World.debug.js'
import * as SceneRecuperationWorldConstants from './World.constants.js'
import { pickCycledSceneMusic } from '../../../../Audio/SceneMusicPicker.js'
let recuperationWorldInstanceIndex = 0
const RECUPERATION_ARRIVAL_DIALOGUE_KEY = 'recuperation_0'
const RECUPERATION_VALIDATION_DIALOGUE_KEY = 'recuperation_1'
const RECUPERATION_TUBE_ROOM_DIALOGUE_KEY = 'recuperation_2'
const RECUPERATION_TEST_WATER_SOUND = 'recuperationTestWaterFalling'
const RECUPERATION_TEST_WATER_CHANNEL = 'recuperationTestWater'
const RECUPERATION_DIALOGUE_PHASES = Object.freeze({
    SELECTION: 'selection',
    TEST_RESULT: 'testResult',
    VALIDATED: 'validated',
    TUBE_ROOM: 'tubeRoom',
    COMPLETED: 'completed'
})
const RECUPERATION_DIALOGUE_KEYS = new Set([
    RECUPERATION_ARRIVAL_DIALOGUE_KEY,
    RECUPERATION_VALIDATION_DIALOGUE_KEY,
    RECUPERATION_TUBE_ROOM_DIALOGUE_KEY
])
const RECUPERATION_BLOOM_SOL1_DIALOGUE_NODES = new Set(SceneRecuperationWorldConstants.RECUPERATION_BLOOM_DIALOGUE_NODE_KEYS)

export default class SceneRecuperationWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.recuperationWorld${recuperationWorldInstanceIndex++}`

        this.isExitTeleportActive = false
        this.isReturningToMap = false
        this.returnToRecyclageTimeoutId = null
        this.testDurationSeconds = 5.5
        this.isMaterialTestRunning = false
        this.materialTestElapsed = 0
        this.currentMaterialSelection = null
        this.isMaterialChoiceValidated = false
        this.isMaterialSelectionDialogueLockActive = false
        this.hasStartedRecuperationDialogue = false
        this.hasStartedArrivalDialogue = false
        this.hasStartedValidationDialogue = false
        this.activeRecuperationDialogueCount = 0
        this.hasPlayedFirstTestResultDialogue = false
        this.onDialogueStart = ({ key } = {}) =>
        {
            if(!RECUPERATION_DIALOGUE_KEYS.has(key))
            {
                return
            }

            this.activeRecuperationDialogueCount += 1
            this.experience.sound?.setMusicRuntimeVolumeScale?.(SceneRecuperationWorldConstants.RECUPERATION_DIALOGUE_MUSIC_DUCK_SCALE)
        }
        this.onDialogueEndForMusicDuck = ({ key } = {}) =>
        {
            if(!RECUPERATION_DIALOGUE_KEYS.has(key))
            {
                return
            }

            this.activeRecuperationDialogueCount = Math.max(0, this.activeRecuperationDialogueCount - 1)
            if(this.activeRecuperationDialogueCount <= 0)
            {
                this.experience.sound?.setMusicRuntimeVolumeScale?.(1)
            }
        }
        this.onSelectionDialogueEnd = ({ key } = {}) =>
        {
            if(key !== RECUPERATION_VALIDATION_DIALOGUE_KEY || this.isMaterialSelectionDialogueLockActive !== true)
            {
                return
            }

            this.isMaterialSelectionDialogueLockActive = false
            this.television?.syncButtons?.()
        }
        this.pendingReturnToMapAfterDialogue = false
        this.hasSwitchedCeilingLightRooms = false
        this.bloomSol1HoldTimeoutId = null
        this.bloomPreviousFollowTarget = null
        this.bloomTemporaryTarget = null
        this.isBloomMovingToSol1 = false
        this.bloomSol1ArrivalDistanceSq = SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_ARRIVAL_DISTANCE * SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_ARRIVAL_DISTANCE
        this.bloomSol1LastDistanceSq = Infinity
        this.bloomSol1LastProgressAtMs = 0
        this.bloomSol1StartAtMs = 0
        this.bloomPreviousSpeed = null
        this.bloomPreviousCollisionMeshes = null
        this.hasBloomSol1CollisionBypass = false
        this.onDialogueStateForBloomSol1 = ({ dialogueKey, nodeId } = {}) =>
        {
            if(dialogueKey !== RECUPERATION_VALIDATION_DIALOGUE_KEY || !RECUPERATION_BLOOM_SOL1_DIALOGUE_NODES.has(nodeId))
            {
                return
            }

            this.startBloomSol1TemporaryMove()
        }
        this.onTubeCompletionDialogueEnd = ({ key } = {}) =>
        {
            if(key !== RECUPERATION_TUBE_ROOM_DIALOGUE_KEY || this.pendingReturnToMapAfterDialogue !== true)
            {
                return
            }

            this.pendingReturnToMapAfterDialogue = false
            this.experience.sceneManager?.switchTo?.(SceneEnum.RECYCLAGE)
        }
        this.hasPendingDoorOpenAfterDialogue = false
        this.onValidation013Shown = ({ dialogueKey, nodeId } = {}) =>
        {
            if(dialogueKey !== RECUPERATION_VALIDATION_DIALOGUE_KEY || nodeId !== 'recuperation_013')
            {
                return
            }
            this.hasPendingDoorOpenAfterDialogue = true
        }
        this.onValidation1EndForDoor = ({ key, interrupted } = {}) =>
        {
            if(key !== RECUPERATION_VALIDATION_DIALOGUE_KEY || interrupted || !this.hasPendingDoorOpenAfterDialogue || !this.isMaterialChoiceValidated)
            {
                return
            }
            this.hasPendingDoorOpenAfterDialogue = false
            this.door?.setOpen?.(true)
        }
        this.experience.dialogueManager?.on?.('start.recuperationMusicDuck', this.onDialogueStart)
        this.experience.dialogueManager?.on?.('end.recuperationMusicDuck', this.onDialogueEndForMusicDuck)
        this.experience.dialogueManager?.on?.('end.recuperationSelectionLock', this.onSelectionDialogueEnd)
        this.experience.dialogueManager?.on?.('state.recuperationBloomSol1', this.onDialogueStateForBloomSol1)
        this.experience.dialogueManager?.on?.('end.recuperationTubeCompletion', this.onTubeCompletionDialogueEnd)
        this.experience.dialogueManager?.on?.('state.recuperationValidation013', this.onValidation013Shown)
        this.experience.dialogueManager?.on?.('end.recuperationDoorOpen', this.onValidation1EndForDoor)

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

    startBloomSol1TemporaryMove()
    {
        const bloom = this.experience?.bloom
        const bloomFollow = bloom?.follow
        const bloomModel = bloom?.model
        if(!bloom || !bloomFollow || !bloomModel)
        {
            return
        }

        const sol1Bounds = this.recuperationModel?.getBoundsForNameTokens?.(
            [SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_MESH_TOKEN],
            { exact: true }
        )
        if(!sol1Bounds)
        {
            return
        }

        const sol1Center = sol1Bounds.getCenter(new THREE.Vector3())
        if(!this.bloomTemporaryTarget)
        {
            this.bloomTemporaryTarget = {
                position: new THREE.Vector3()
            }
        }
        this.bloomTemporaryTarget.position.set(sol1Center.x, sol1Center.y, sol1Center.z)

        if(!this.bloomPreviousFollowTarget)
        {
            this.bloomPreviousFollowTarget = bloomFollow.target ?? null
        }
        if(this.bloomPreviousSpeed === null)
        {
            this.bloomPreviousSpeed = bloom.rails?.settings?.speed ?? null
        }
        if(this.bloomPreviousCollisionMeshes === null)
        {
            this.bloomPreviousCollisionMeshes = Array.isArray(bloomFollow.collisionMeshes)
                ? [...bloomFollow.collisionMeshes]
                : []
        }

        bloomFollow.target = this.bloomTemporaryTarget
        bloomFollow.enabled = true
        bloom.clearFollowOverride?.()
        if(Number.isFinite(this.bloomPreviousSpeed) && bloom.rails?.settings)
        {
            bloom.rails.settings.speed = Math.max(0.4, this.bloomPreviousSpeed * SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_SPEED_SCALE)
        }

        const distanceToTargetSq = bloomModel.position.distanceToSquared(this.bloomTemporaryTarget.position)
        const nowMs = this.experience.time.elapsed ?? 0
        this.isBloomMovingToSol1 = true
        this.bloomSol1StartAtMs = nowMs
        this.bloomSol1LastProgressAtMs = nowMs
        this.bloomSol1LastDistanceSq = distanceToTargetSq
        this.hasBloomSol1CollisionBypass = false

        if(this.bloomSol1HoldTimeoutId !== null)
        {
            window.clearTimeout(this.bloomSol1HoldTimeoutId)
            this.bloomSol1HoldTimeoutId = null
        }
    }

    updateBloomSol1TemporaryMove()
    {
        if(!this.isBloomMovingToSol1)
        {
            return
        }

        const bloom = this.experience?.bloom
        const bloomModel = bloom?.model
        if(!bloom || !bloomModel || !this.bloomTemporaryTarget?.position)
        {
            this.finishBloomSol1TemporaryMove()
            return
        }

        const nowMs = this.experience.time.elapsed ?? 0
        const currentDistanceSq = bloomModel.position.distanceToSquared(this.bloomTemporaryTarget.position)
        if(currentDistanceSq <= this.bloomSol1ArrivalDistanceSq)
        {
            this.isBloomMovingToSol1 = false
            this.bloomSol1HoldTimeoutId = window.setTimeout(() =>
            {
                this.bloomSol1HoldTimeoutId = null
                this.finishBloomSol1TemporaryMove()
            }, SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_HOLD_MS)
            return
        }

        if(currentDistanceSq + 1e-5 < this.bloomSol1LastDistanceSq)
        {
            this.bloomSol1LastDistanceSq = currentDistanceSq
            this.bloomSol1LastProgressAtMs = nowMs
            return
        }

        const noProgressDurationMs = nowMs - this.bloomSol1LastProgressAtMs
        if(noProgressDurationMs < SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_STUCK_CHECK_DELAY_MS || this.hasBloomSol1CollisionBypass)
        {
            return
        }

        const progressSq = Math.max(0, this.bloomSol1LastDistanceSq - currentDistanceSq)
        const hasMeaningfulProgress = progressSq >= (SceneRecuperationWorldConstants.RECUPERATION_BLOOM_SOL1_STUCK_MIN_PROGRESS ** 2)
        if(hasMeaningfulProgress)
        {
            this.bloomSol1LastProgressAtMs = nowMs
            this.bloomSol1LastDistanceSq = currentDistanceSq
            return
        }

        if(bloom.follow)
        {
            bloom.follow.collisionMeshes = []
            this.hasBloomSol1CollisionBypass = true
            this.bloomSol1LastProgressAtMs = nowMs
            this.bloomSol1LastDistanceSq = currentDistanceSq
        }
    }

    finishBloomSol1TemporaryMove()
    {
        this.isBloomMovingToSol1 = false
        const bloom = this.experience?.bloom
        if(!bloom?.follow)
        {
            this.bloomPreviousFollowTarget = null
            this.bloomPreviousSpeed = null
            this.bloomPreviousCollisionMeshes = null
            this.hasBloomSol1CollisionBypass = false
            return
        }

        bloom.follow.target = this.bloomPreviousFollowTarget ?? this.player ?? null
        bloom.follow.enabled = Boolean(bloom.follow.target || bloom.follow.getTargetPosition)
        if(Number.isFinite(this.bloomPreviousSpeed) && bloom.rails?.settings)
        {
            bloom.rails.settings.speed = this.bloomPreviousSpeed
        }
        if(this.bloomPreviousCollisionMeshes)
        {
            bloom.follow.collisionMeshes = [...this.bloomPreviousCollisionMeshes]
        }

        this.bloomPreviousFollowTarget = null
        this.bloomPreviousSpeed = null
        this.bloomPreviousCollisionMeshes = null
        this.hasBloomSol1CollisionBypass = false
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.setDebug()
        this.sharedWaterColors = {
            baseColor: new THREE.Color('#1F9CD2'),
            deepFoamColor: new THREE.Color('#9AF6FE'),
            surfaceFoamColor: new THREE.Color('#FDFDF7')
        }
        this.environment = new MapEnvironment()
        this.recuperationModel = new SceneRecuperationModel({
            debugParentFolder: this.debugFolder
        })
        this.walls = new SceneRecuperationWalls({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder
        })
        this.cascadeTubes = new SceneRecuperationCascadeTubes({
            recuperationModel: this.recuperationModel,
            debugTubeFolder: this.waterTubesDebugFolder,
            debugSlopeFolder: this.waterSlopesDebugFolder,
            sharedWaterColors: this.sharedWaterColors
        })
        this.water = new SceneRecuperationWater({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.waterPlanDebugFolder,
            sharedWaterColors: this.sharedWaterColors
        })
        this.door = new Door({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder,
            onOpened: () => this.handleDoorOpened()
        })
        this.television = new Television({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder,
            isInteractionLocked: () => this.isRecuperationActionLocked(),
            onTestRequest: () => this.startMaterialTest(),
            onValidateRequest: () => this.validateMaterialChoice()
        })
        this.television.setButtonsUnlocked(false)
        this.showerParticles = new ShowerParticles({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.waterDebugFolder
        })
        this.slopeSplash = new SlopeSplash({
            debugParentFolder: this.waterDebugFolder
        })

        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.recuperationModel.getBoundaryRadius?.() ?? 48,
            collisionBoxes: [],
            collisionMeshes: this.recuperationModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.recuperationModel.getGroundMeshes?.() ?? [],
            spawnPosition: SceneRecuperationWorldConstants.RECUPERATION_SPAWN_POSITION,
            spawnYaw: THREE.MathUtils.degToRad(SceneRecuperationWorldConstants.RECUPERATION_SPAWN_YAW_DEG),
            spawnPitch: THREE.MathUtils.degToRad(SceneRecuperationWorldConstants.RECUPERATION_SPAWN_PITCH_DEG)
        })
        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null
        })
        this.windTurbine = new SceneRecuperationWindTurbine({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder
        })
        this.ceilingLights = new SceneRecuperationCeilingLights({
            recuperationModel: this.recuperationModel
        })
        this.ceilingLights.setZones({
            room1: true,
            room2: false
        })
        this.setLightDebugBindings()

        this.tubeWaterController = new SceneRecuperationTubeWaterController({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.waterTubesDebugFolder,
            sharedWaterColors: this.sharedWaterColors
        })
        this.setWaterDebugBindings()
        this.scoring = new SceneRecuperationScoring({
            getTubeWaterController: () => this.tubeWaterController
        })
        this.collisionDebug = new SceneRecuperationCollisionDebug({
            player: this.player,
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder
        })

        if(this.experience.bloom)
        {
            this.experience.bloom.setSceneContext({
                scene: this.experience.scene,
                groundMeshes: this.recuperationModel.getGroundMeshes?.() ?? [],
                collisionMeshes: this.recuperationModel.getCollisionMeshes?.() ?? [],
                rails: [],
                target: this.player
            })
        }

        this.materiau = new Materiau({
            recuperationModel: this.recuperationModel,
            isExternalHoverActive: () =>
                (this.tubeWaterController?.isHoveringTube?.() ?? false) ||
                (this.television?.isHoveringInteractive?.() ?? false),
            isInteractionLocked: () => this.isRecuperationActionLocked(),
            onSelectionChange: (selection) => this.handleMaterialSelection(selection)
        })
        this.materiau.setDebug({ parentFolder: this.lightDebugFolder })

        this.television.setSelection(null)
        this.setRoom2Trigger()
        this.setWallCrossTeleport()
        this.setExitTeleportActive(false)
        this.startArrivalDialogue()
    }

    setDebug()
    {
        setupSceneRecuperationWorldDebug.call(this)
    }

    setWaterDebugBindings()
    {
        if(!this.experience?.debug?.isDebugEnabled || !this.waterColorsDebugFolder || this.waterColorsBound)
        {
            return
        }

        this.waterColorsBound = true
        const syncSharedColors = () =>
        {
            this.water?.applySharedWaterColors?.()
            this.cascadeTubes?.applySharedWaterColors?.()
            this.tubeWaterController?.applySharedWaterColors?.()
        }

        this.experience.debug.addColorBinding(this.waterColorsDebugFolder, this.sharedWaterColors, 'baseColor', {
            label: 'Couleur eau'
        })?.on?.('change', syncSharedColors)

        this.experience.debug.addColorBinding(this.waterColorsDebugFolder, this.sharedWaterColors, 'deepFoamColor', {
            label: 'Mousse profonde'
        })?.on?.('change', syncSharedColors)

        this.experience.debug.addColorBinding(this.waterColorsDebugFolder, this.sharedWaterColors, 'surfaceFoamColor', {
            label: 'Mousse surface'
        })?.on?.('change', syncSharedColors)
    }

    update(delta = this.experience.time.delta)
    {
        this.syncAmbientSound()
        this.cascadeTubes?.update?.(delta)
        this.water?.update?.(delta)
        this.ceilingLights?.update?.(delta)
        this.door?.update?.(delta)
        this.television?.update?.(delta)
        this.showerParticles?.update?.(delta)
        this.slopeSplash?.update?.(delta)
        this.light?.update?.(delta)
        this.windTurbine?.update?.(delta)
        this.player?.update(delta)
        this.room2Trigger?.update?.()
        this.tubeWaterController?.update?.()
        this.collisionDebug?.update?.()
        this.materiau?.update(delta)
        this.updateMaterialTesting(delta)
        this.updateBloomSol1TemporaryMove()
        this.checkPuzzleCompletionReturn()
        this.updateWallCrossTeleportVisual()
        this.checkWallCrossTeleport()
    }

    syncAmbientSound()
    {
        this.syncAmbientMusic()
        this.syncAmbientWaterLoop()
    }

    syncAmbientMusic()
    {
        if(this.experience.sound?.isAnySoundPlaying?.(SceneRecuperationWorldConstants.RECUPERATION_AMBIENT_SOUND_KEYS))
        {
            return
        }

        const musicKey = pickCycledSceneMusic(
            SceneRecuperationWorldConstants.RECUPERATION_MUSIC_STORAGE_KEY,
            SceneRecuperationWorldConstants.RECUPERATION_AMBIENT_SOUND_KEYS
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

    syncAmbientWaterLoop()
    {
        if(this.experience.sound?.isChannelPlaying?.(SceneRecuperationWorldConstants.RECUPERATION_WATER_AMBIENT_CHANNEL))
        {
            return
        }

        this.experience.sound?.play?.(SceneRecuperationWorldConstants.RECUPERATION_WATER_AMBIENT_SOUND_KEY, {
            channel: SceneRecuperationWorldConstants.RECUPERATION_WATER_AMBIENT_CHANNEL
        })
    }

    handleMaterialSelection(selection)
    {
        const previousKey = this.currentMaterialSelection?.key ?? null
        const nextKey = selection?.key ?? null

        this.currentMaterialSelection = selection ? { ...selection } : null
        if(previousKey !== nextKey)
        {
            this.isMaterialChoiceValidated = false
            this.hasPendingDoorOpenAfterDialogue = false
            this.resetCeilingLightRooms()
            this.stopMaterialTest()
            this.television?.setTestResult?.(null)

            if(nextKey && this.experience?.isAutoFlowEnabled?.() !== false)
            {
                this.startSelectionDialogueOncePerMaterial(nextKey)
            }
        }

        if(!this.currentMaterialSelection)
        {
            this.isMaterialChoiceValidated = false
            this.resetCeilingLightRooms()
            this.stopMaterialTest()
        }

        this.door?.setOpen?.(this.isMaterialChoiceValidated)
        this.television?.setSelection?.(this.currentMaterialSelection)
        this.television?.setValidated?.(this.isMaterialChoiceValidated)
        this.setExitTeleportActive(false)
    }

    isRecuperationActionLocked()
    {
        return this.isMaterialTestRunning === true || this.isMaterialSelectionDialogueLockActive === true
    }

    startMaterialTest()
    {
        if(!this.currentMaterialSelection || this.isRecuperationActionLocked())
        {
            return
        }

        this.isMaterialChoiceValidated = false
        this.isMaterialTestRunning = true
        this.materialTestElapsed = 0
        this.resetCeilingLightRooms()
        this.door?.setOpen?.(false)
        this.television?.setTestingState?.(true)
        this.showerParticles?.start?.(this.testDurationSeconds)
        this.experience.sound?.play?.(RECUPERATION_TEST_WATER_SOUND, { volume: 1 })
    }

    stopMaterialTest()
    {
        this.isMaterialTestRunning = false
        this.materialTestElapsed = 0
        this.showerParticles?.stop?.()
        this.experience.sound?.stopChannel?.(RECUPERATION_TEST_WATER_CHANNEL)
        this.television?.setTestingState?.(false)
    }

    updateMaterialTesting(deltaMs = this.experience.time.delta)
    {
        if(!this.isMaterialTestRunning)
        {
            return
        }

        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        this.materialTestElapsed += deltaSeconds
        if(this.materialTestElapsed < this.testDurationSeconds)
        {
            return
        }

        this.isMaterialTestRunning = false
        this.materialTestElapsed = 0
        this.experience.sound?.stopChannel?.(RECUPERATION_TEST_WATER_CHANNEL)
        const result = this.buildMaterialTestResult(this.currentMaterialSelection)
        this.scoring?.markMaterialTest?.(this.currentMaterialSelection?.key ?? null)
        this.television?.setTestResult?.(result)

        if(this.currentMaterialSelection?.key && this.experience?.isAutoFlowEnabled?.() !== false)
        {
            this.startFirstTestResultDialogueOnce(this.currentMaterialSelection.key)
        }
    }

    startSelectionDialogueOncePerMaterial(materialKey)
    {
        const normalizedMaterialKey = String(materialKey || '').trim().toLowerCase()
        if(normalizedMaterialKey === '')
        {
            return
        }

        this.isMaterialSelectionDialogueLockActive = true
        this.television?.syncButtons?.()
        this.experience.dialogueManager?.startByKey?.(RECUPERATION_VALIDATION_DIALOGUE_KEY, {
            phase: RECUPERATION_DIALOGUE_PHASES.SELECTION,
            materialKey: normalizedMaterialKey
        })
    }

    startFirstTestResultDialogueOnce(materialKey)
    {
        if(this.hasPlayedFirstTestResultDialogue)
        {
            return
        }

        this.hasPlayedFirstTestResultDialogue = true
        this.experience.dialogueManager?.startByKey?.(RECUPERATION_VALIDATION_DIALOGUE_KEY, {
            phase: RECUPERATION_DIALOGUE_PHASES.TEST_RESULT,
            materialKey: String(materialKey || '').trim().toLowerCase()
        })
    }

    setLightDebugBindings()
    {
        if(!this.experience?.debug?.isDebugEnabled || !this.lightDebugFolder || !this.ceilingLights || this.lightDebugBound)
        {
            return
        }

        this.lightDebugBound = true
        const settings = this.ceilingLights.settings
        const applySettings = () => this.ceilingLights?.applySettings?.()

        this.experience.debug.addThreeColorBinding(this.lightDebugFolder, settings, 'emissiveColor', {
            label: 'emissive color'
        })?.on?.('change', applySettings)
        this.experience.debug.addBinding(this.lightDebugFolder, settings, 'emissiveIntensity', {
            label: 'emissive intensity',
            min: 0,
            max: 5,
            step: 0.01
        })?.on?.('change', applySettings)
        this.experience.debug.addThreeColorBinding(this.lightDebugFolder, settings, 'pointColor', {
            label: 'point color'
        })?.on?.('change', applySettings)
        this.experience.debug.addBinding(this.lightDebugFolder, settings, 'pointIntensity', {
            label: 'point intensity',
            min: 0,
            max: 10,
            step: 0.01
        })?.on?.('change', applySettings)
        this.experience.debug.addBinding(this.lightDebugFolder, settings, 'pointDistance', {
            label: 'point distance',
            min: 0,
            max: 20,
            step: 0.01
        })?.on?.('change', applySettings)
        this.experience.debug.addBinding(this.lightDebugFolder, settings, 'pointHeightOffset', {
            label: 'point height',
            min: -2,
            max: 2,
            step: 0.01
        })?.on?.('change', applySettings)
    }

    buildMaterialTestResult(selection)
    {
        const key = selection?.key ?? null
        if(key === 'materiau0')
        {
            return {
                summary: 'Resultat: la carapace forme une surface protectrice mais l eau reste visible en surface.'
            }
        }

        if(key === 'materiau1')
        {
            return {
                summary: 'Resultat: le verre laisse bien glisser l eau, mais il protege peu contre l humidite durable.'
            }
        }

        if(key === 'materiau2')
        {
            return {
                summary: 'Resultat: la vegetation absorbe mieux l eau et amortit plus naturellement l impact du ruissellement.'
            }
        }

        return {
            summary: 'Resultat indisponible pour ce materiau.'
        }
    }

    validateMaterialChoice()
    {
        if(!this.currentMaterialSelection || this.isRecuperationActionLocked())
        {
            return
        }

        this.isMaterialChoiceValidated = true
        this.hasSwitchedCeilingLightRooms = false
        this.experience.badgeManager?.unlock?.('materiau')
        this.television?.setValidated?.(true)
        this.startValidationDialogue()
        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            this.door?.setOpen?.(true)
        }
    }

    handleDoorOpened()
    {
        if(this.hasSwitchedCeilingLightRooms)
        {
            return
        }

        this.hasSwitchedCeilingLightRooms = true
        this.ceilingLights?.setZones?.({
            room1: false,
            room2: true
        })
    }

    resetCeilingLightRooms()
    {
        this.hasSwitchedCeilingLightRooms = false
        this.ceilingLights?.setZones?.({
            room1: true,
            room2: false
        })
    }

    setRoom2Trigger()
    {
        this.room2Trigger = new SceneRecuperationRoom2Trigger({
            recuperationModel: this.recuperationModel,
            player: this.player,
            debugParentFolder: this.debugFolder,
            onEnter: () => this.handleRoom2Enter()
        })
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
        this.onArrivalDialogueEnd = ({ key } = {}) =>
        {
            if(key !== RECUPERATION_ARRIVAL_DIALOGUE_KEY)
            {
                return
            }

            this.television?.setButtonsUnlocked?.(true)
            this.television?.setPowered?.(true)
        }
        this.experience.dialogueManager?.on?.('end.recuperationButtonsUnlock', this.onArrivalDialogueEnd)
        this.experience.dialogueManager?.startByKey?.(RECUPERATION_ARRIVAL_DIALOGUE_KEY)
    }

    startValidationDialogue()
    {
        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        this.experience.dialogueManager?.startByKey?.(RECUPERATION_VALIDATION_DIALOGUE_KEY, {
            phase: RECUPERATION_DIALOGUE_PHASES.VALIDATED,
            materialKey: this.currentMaterialSelection?.key ?? null
        })
    }

    handleRoom2Enter()
    {
        this.scoring?.markTubePuzzleStart?.()
        this.tubeWaterController?.startFlowAnimation?.()
        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        if(!this.hasStartedRecuperationDialogue)
        {
            this.hasStartedRecuperationDialogue = true
            this.experience.dialogueManager?.startByKey?.(RECUPERATION_TUBE_ROOM_DIALOGUE_KEY, {
                phase: RECUPERATION_DIALOGUE_PHASES.TUBE_ROOM
            })
        }
    }

    checkPuzzleCompletionReturn()
    {
        if(this.isReturningToMap || !this.tubeWaterController)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        const isComplete = this.tubeWaterController.isModuleFlowComplete?.(SceneRecuperationWorldConstants.FINAL_TUBE_MODULE_NAME)
        if(!isComplete)
        {
            return
        }

        this.experience.badgeManager?.unlock?.('tuyaux')
        this.scoring?.finalize?.()
        this.experience.sound?.play?.(SceneRecuperationWorldConstants.RECUPERATION_FINAL_TUBE_COMPLETE_SOUND_KEY)
        this.isReturningToMap = true
        this.returnToRecyclageTimeoutId = window.setTimeout(() =>
        {
            this.returnToRecyclageTimeoutId = null
            this.experience.sceneManager?.switchTo?.(SceneEnum.RECYCLAGE)
        }, SceneRecuperationWorldConstants.AUTO_SWITCH_TO_RECYCLAGE_DELAY_MS)
    }

    setWallCrossTeleport()
    {
        const exitBounds = this.recuperationModel?.getBoundsForNameTokens?.(['chemin-sortie'], { exact: true })
        if(!exitBounds)
        {
            this.wallCrossTeleport = null
            this.clearWallCrossTeleportVisual()
            return
        }

        const size = exitBounds.getSize(new THREE.Vector3())
        const center = exitBounds.getCenter(new THREE.Vector3())

        const mainAxis = size.x >= size.z ? 'x' : 'z'
        const sideAxis = mainAxis === 'x' ? 'z' : 'x'
        const mainHalf = Math.max(0.25, size[mainAxis] * 0.5)
        const sideHalf = Math.max(0.25, size[sideAxis] * 0.5)
        const edgeThreshold = Math.min(1.25, Math.max(0.45, mainHalf * 0.2))

        this.wallCrossTeleport = {
            mainAxis,
            sideAxis,
            mainMin: center[mainAxis] - mainHalf,
            mainMax: center[mainAxis] + mainHalf,
            sideCenter: center[sideAxis],
            sideReach: sideHalf + 0.8,
            minY: exitBounds.min.y - 0.8,
            maxY: exitBounds.max.y + 4,
            edgeThreshold,
            exitOffset: 1.05,
            cooldownMs: 420,
            visualCenter: center.clone(),
            visualRadius: THREE.MathUtils.clamp(Math.min(size.x, size.z) * 0.28, 0.34, 0.95),
            visualFloorY: exitBounds.min.y + 0.06
        }
        this.nextWallCrossTeleportAt = 0
        this.setWallCrossTeleportVisual()
    }

    setWallCrossTeleportVisual()
    {
        this.clearWallCrossTeleportVisual()

        if(!this.wallCrossTeleport)
        {
            return
        }

        const visualRadius = this.wallCrossTeleport.visualRadius
        const center = this.wallCrossTeleport.visualCenter

        this.teleportVisualGroup = new THREE.Group()
        this.teleportVisualGroup.name = '__recuperationExitTeleportVisual'
        this.teleportVisualGroup.position.set(center.x, this.wallCrossTeleport.visualFloorY, center.z)

        this.teleportVisualPad = new THREE.Mesh(
            new THREE.CylinderGeometry(visualRadius * 0.82, visualRadius * 0.82, 0.06, 40),
            new THREE.MeshStandardMaterial({
                color: SceneRecuperationWorldConstants.EXIT_TELEPORT_INACTIVE_COLOR,
                emissive: '#131d2b',
                emissiveIntensity: 0.25,
                roughness: 0.28,
                metalness: 0.18
            })
        )
        this.teleportVisualPad.position.y = 0.03

        this.teleportVisualRing = new THREE.Mesh(
            new THREE.TorusGeometry(visualRadius, 0.06, 12, 64),
            new THREE.MeshStandardMaterial({
                color: SceneRecuperationWorldConstants.EXIT_TELEPORT_INACTIVE_COLOR,
                emissive: '#17273f',
                emissiveIntensity: 0.35,
                roughness: 0.25,
                metalness: 0.08
            })
        )
        this.teleportVisualRing.rotation.x = Math.PI * 0.5
        this.teleportVisualRing.position.y = 0.08

        this.teleportVisualColumn = new THREE.Mesh(
            new THREE.CylinderGeometry(visualRadius * 0.3, visualRadius * 0.5, 1.8, 24, 1, true),
            new THREE.MeshBasicMaterial({
                color: SceneRecuperationWorldConstants.EXIT_TELEPORT_INACTIVE_COLOR,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        )
        this.teleportVisualColumn.position.y = 0.95

        this.teleportVisualLight = new THREE.PointLight(SceneRecuperationWorldConstants.EXIT_TELEPORT_INACTIVE_COLOR, 0.95, 7.5, 2)
        this.teleportVisualLight.position.y = 1

        this.teleportVisualGroup.add(this.teleportVisualPad)
        this.teleportVisualGroup.add(this.teleportVisualRing)
        this.teleportVisualGroup.add(this.teleportVisualColumn)
        this.teleportVisualGroup.add(this.teleportVisualLight)
        this.experience.scene.add(this.teleportVisualGroup)
    }

    setExitTeleportActive(isActive, colorHex = null)
    {
        this.isExitTeleportActive = Boolean(isActive)

        if(!this.teleportVisualGroup)
        {
            return
        }

        this.teleportVisualGroup.visible = this.isExitTeleportActive
        if(!this.isExitTeleportActive)
        {
            return
        }

        const activeColor = colorHex || '#4ea7ff'
        this.teleportVisualPad.material.color.set(activeColor)
        this.teleportVisualPad.material.emissive.set(activeColor)

        this.teleportVisualRing.material.color.set(activeColor)
        this.teleportVisualRing.material.emissive.set(activeColor)

        this.teleportVisualColumn.material.color.set(activeColor)
        this.teleportVisualLight.color.set(activeColor)
    }

    updateWallCrossTeleportVisual()
    {
        if(!this.teleportVisualGroup || !this.isExitTeleportActive)
        {
            return
        }

        const elapsed = this.experience.time.elapsed * 0.001
        const pulse = 0.76 + (Math.sin(elapsed * 5.2) * 0.2)

        this.teleportVisualPad.material.emissiveIntensity = 0.3 + (pulse * 0.5)
        this.teleportVisualRing.material.emissiveIntensity = pulse
        this.teleportVisualRing.rotation.z += 0.012

        this.teleportVisualColumn.material.opacity = 0.12 + (Math.sin(elapsed * 2.8) * 0.06)
        this.teleportVisualColumn.rotation.y -= 0.004

        this.teleportVisualLight.intensity = 1 + (Math.sin(elapsed * 4.7) * 0.42)
    }

    clearWallCrossTeleportVisual()
    {
        if(!this.teleportVisualGroup)
        {
            return
        }

        this.experience.scene.remove(this.teleportVisualGroup)

        this.teleportVisualPad?.geometry?.dispose?.()
        this.teleportVisualPad?.material?.dispose?.()
        this.teleportVisualRing?.geometry?.dispose?.()
        this.teleportVisualRing?.material?.dispose?.()
        this.teleportVisualColumn?.geometry?.dispose?.()
        this.teleportVisualColumn?.material?.dispose?.()

        this.teleportVisualPad = null
        this.teleportVisualRing = null
        this.teleportVisualColumn = null
        this.teleportVisualLight = null
        this.teleportVisualGroup = null
    }

    checkWallCrossTeleport()
    {
        if(!this.isExitTeleportActive || !this.wallCrossTeleport || !this.player?.position)
        {
            return
        }

        const now = this.experience.time.elapsed ?? 0
        if(now < (this.nextWallCrossTeleportAt || 0))
        {
            return
        }

        const config = this.wallCrossTeleport
        const position = this.player.position
        if(position.y < config.minY || position.y > config.maxY)
        {
            return
        }

        const sideValue = position[config.sideAxis]
        if(Math.abs(sideValue - config.sideCenter) > config.sideReach)
        {
            return
        }

        const mainValue = position[config.mainAxis]
        const toMin = Math.abs(mainValue - config.mainMin)
        const toMax = Math.abs(config.mainMax - mainValue)
        if(toMin > config.edgeThreshold && toMax > config.edgeThreshold)
        {
            return
        }

        const targetMain = toMin <= toMax
            ? config.mainMax + config.exitOffset
            : config.mainMin - config.exitOffset

        if(config.mainAxis === 'x')
        {
            this.player.position.x = targetMain
            this.player.previousPosition.x = targetMain
        }
        else
        {
            this.player.position.z = targetMain
            this.player.previousPosition.z = targetMain
        }

        this.player.velocity.x = 0
        this.player.velocity.z = 0
        this.nextWallCrossTeleportAt = now + config.cooldownMs
    }

    destroy()
    {
        this.experience.sound?.setMusicRuntimeVolumeScale?.(1)
        this.experience.dialogueManager?.off?.('start.recuperationMusicDuck')
        this.experience.dialogueManager?.off?.('end.recuperationMusicDuck')
        this.experience.dialogueManager?.off?.('end.recuperationSelectionLock')
        this.experience.dialogueManager?.off?.('state.recuperationBloomSol1')
        this.experience.dialogueManager?.off?.('end.recuperationTubeCompletion')
        this.experience.dialogueManager?.off?.('state.recuperationValidation013')
        this.experience.dialogueManager?.off?.('end.recuperationDoorOpen')
        this.onValidation013Shown = null
        this.onValidation1EndForDoor = null
        this.onSelectionDialogueEnd = null
        this.hasPendingDoorOpenAfterDialogue = false
        this.resources.off(this.readyEventName)
        this.experience.dialogueManager?.off?.('end.recuperationButtonsUnlock')
        this.experience.sound?.stopChannel?.(SceneRecuperationWorldConstants.RECUPERATION_AMBIENT_CHANNEL)
        this.experience.sound?.stopChannel?.(SceneRecuperationWorldConstants.RECUPERATION_WATER_AMBIENT_CHANNEL)
        if(this.returnToRecyclageTimeoutId !== null)
        {
            window.clearTimeout(this.returnToRecyclageTimeoutId)
            this.returnToRecyclageTimeoutId = null
        }
        if(this.bloomSol1HoldTimeoutId !== null)
        {
            window.clearTimeout(this.bloomSol1HoldTimeoutId)
            this.bloomSol1HoldTimeoutId = null
        }
        this.finishBloomSol1TemporaryMove()
        this.onArrivalDialogueEnd = null

        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        if(this.materiau)
        {
            this.materiau.destroy?.()
            this.materiau = null
        }

        if(this.scoring)
        {
            this.scoring.destroy?.()
            this.scoring = null
        }

        if(this.tubeWaterController)
        {
            this.tubeWaterController.destroy?.()
            this.tubeWaterController = null
        }

        if(this.collisionDebug)
        {
            this.collisionDebug.destroy?.()
            this.collisionDebug = null
        }

        if(this.room2Trigger)
        {
            this.room2Trigger.destroy?.()
            this.room2Trigger = null
        }

        if(this.windTurbine)
        {
            this.windTurbine.destroy?.()
            this.windTurbine = null
        }

        if(this.ceilingLights)
        {
            this.ceilingLights.destroy?.()
            this.ceilingLights = null
        }

        this.clearWallCrossTeleportVisual()

        if(this.water)
        {
            this.water.destroy?.()
            this.water = null
        }

        if(this.door)
        {
            this.door.destroy?.()
            this.door = null
        }

        if(this.television)
        {
            this.television.destroy?.()
            this.television = null
        }

        if(this.showerParticles)
        {
            this.showerParticles.destroy?.()
            this.showerParticles = null
        }

        if(this.slopeSplash)
        {
            this.slopeSplash.destroy?.()
            this.slopeSplash = null
        }

        if(this.cascadeTubes)
        {
            this.cascadeTubes.destroy?.()
            this.cascadeTubes = null
        }

        if(this.walls)
        {
            this.walls.destroy?.()
            this.walls = null
        }

        if(this.recuperationModel)
        {
            this.recuperationModel.destroy?.()
            this.recuperationModel = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        if(this.light)
        {
            this.light.destroy?.()
            this.light = null
        }

        this.wallCrossTeleport = null
        this.nextWallCrossTeleportAt = 0
        this.hasStartedRecuperationDialogue = false
        this.hasStartedValidationDialogue = false
        this.currentMaterialSelection = null
        this.isMaterialTestRunning = false
        this.materialTestElapsed = 0
        this.isMaterialChoiceValidated = false
        this.isMaterialSelectionDialogueLockActive = false
        this.isExitTeleportActive = false
        this.isReturningToMap = false
        this.returnToRecyclageTimeoutId = null
        this.hasPlayedFirstTestResultDialogue = false
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        this.isSetUp = false
    }
}
