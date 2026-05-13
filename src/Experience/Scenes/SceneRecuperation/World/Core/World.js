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
import SceneRecuperationScoring from '../Progression/Scoring.js'
import { setupSceneRecuperationWorldDebug } from './World.debug.js'
import * as SceneRecuperationWorldConstants from './World.constants.js'
import { pickCycledSceneMusic } from '../../../../Audio/SceneMusicPicker.js'
let recuperationWorldInstanceIndex = 0
const RECUPERATION_ARRIVAL_DIALOGUE_KEY = 'recuperation_0'
const RECUPERATION_VALIDATION_DIALOGUE_KEY = 'recuperation_1'
const RECUPERATION_TUBE_ROOM_DIALOGUE_KEY = 'recuperation_2'
const RECUPERATION_TEST_WATER_SOUND = 'recuperationTestWaterFalling'
const RECUPERATION_TEST_WATER_CHANNEL = 'recuperationTestWater'

export default class SceneRecuperationWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.recuperationWorld${recuperationWorldInstanceIndex++}`

        this.isExitTeleportActive = false
        this.isReturningToMap = false
        this.testDurationSeconds = 5.5
        this.isMaterialTestRunning = false
        this.materialTestElapsed = 0
        this.currentMaterialSelection = null
        this.isMaterialChoiceValidated = false
        this.hasStartedRecuperationDialogue = false
        this.hasStartedArrivalDialogue = false
        this.hasStartedValidationDialogue = false

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
        this.sharedWaterColors = {
            baseColor: new THREE.Color('#1F9CD2'),
            deepFoamColor: new THREE.Color('#9AF6FE'),
            surfaceFoamColor: new THREE.Color('#FDFDF7')
        }
        this.environment = new MapEnvironment()
        this.recuperationModel = new SceneRecuperationModel({
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
            debugParentFolder: this.debugFolder
        })
        this.television = new Television({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder,
            onTestRequest: () => this.startMaterialTest(),
            onValidateRequest: () => this.validateMaterialChoice()
        })
        this.television.setButtonsUnlocked(false)
        this.showerParticles = new ShowerParticles({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.waterDebugFolder
        })

        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.recuperationModel.getBoundaryRadius?.() ?? 48,
            collisionBoxes: [],
            collisionMeshes: this.recuperationModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.recuperationModel.getGroundMeshes?.() ?? [],
            spawnPosition: this.recuperationModel.getSpawnPosition?.(),
            spawnYaw: 0
        })
        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null
        })
        this.windTurbine = new SceneRecuperationWindTurbine({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder
        })

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
                rails: [],
                target: this.player
            })
        }

        this.materiau = new Materiau({
            recuperationModel: this.recuperationModel,
            isExternalHoverActive: () =>
                (this.tubeWaterController?.isHoveringTube?.() ?? false) ||
                (this.television?.isHoveringInteractive?.() ?? false),
            isInteractionLocked: () => this.isMaterialTestRunning,
            onSelectionChange: (selection) => this.handleMaterialSelection(selection)
        })

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
        this.door?.update?.(delta)
        this.television?.update?.(delta)
        this.showerParticles?.update?.(delta)
        this.light?.update?.(delta)
        this.windTurbine?.update?.(delta)
        this.player?.update(delta)
        this.room2Trigger?.update?.()
        this.tubeWaterController?.update?.()
        this.collisionDebug?.update?.()
        this.materiau?.update(delta)
        this.updateMaterialTesting(delta)
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
        if(this.experience.sound?.isChannelPlaying?.(SceneRecuperationWorldConstants.RECUPERATION_AMBIENT_CHANNEL))
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

        this.experience.sound?.play?.(musicKey, {
            channel: SceneRecuperationWorldConstants.RECUPERATION_AMBIENT_CHANNEL
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
            this.stopMaterialTest()
            this.television?.setTestResult?.(null)
        }

        if(!this.currentMaterialSelection)
        {
            this.isMaterialChoiceValidated = false
            this.stopMaterialTest()
        }

        this.door?.setOpen?.(this.isMaterialChoiceValidated)
        this.television?.setSelection?.(this.currentMaterialSelection)
        this.television?.setValidated?.(this.isMaterialChoiceValidated)
        this.setExitTeleportActive(false)
    }

    startMaterialTest()
    {
        if(!this.currentMaterialSelection || this.isMaterialTestRunning)
        {
            return
        }

        this.isMaterialChoiceValidated = false
        this.isMaterialTestRunning = true
        this.materialTestElapsed = 0
        this.door?.setOpen?.(false)
        this.television?.setTestingState?.(true)
        this.showerParticles?.start?.(this.testDurationSeconds)
        this.experience.sound?.play?.(RECUPERATION_TEST_WATER_SOUND, {
            force: true,
            volume: 1
        })
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
        if(!this.currentMaterialSelection || this.isMaterialTestRunning)
        {
            return
        }

        this.isMaterialChoiceValidated = true
        this.door?.setOpen?.(true)
        this.television?.setValidated?.(true)
        this.startValidationDialogue()
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
        }
        this.experience.dialogueManager?.on?.('end.recuperationButtonsUnlock', this.onArrivalDialogueEnd)
        this.experience.dialogueManager?.startByKey?.(RECUPERATION_ARRIVAL_DIALOGUE_KEY)
    }

    startValidationDialogue()
    {
        if(this.hasStartedValidationDialogue)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        this.hasStartedValidationDialogue = true
        this.experience.dialogueManager?.startByKey?.(RECUPERATION_VALIDATION_DIALOGUE_KEY)
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
            this.experience.dialogueManager?.startByKey?.(RECUPERATION_TUBE_ROOM_DIALOGUE_KEY)
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

        this.scoring?.finalize?.()
        this.isReturningToMap = true
        this.experience.sceneManager?.switchTo?.(SceneEnum.RECYCLAGE)
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
        this.resources.off(this.readyEventName)
        this.experience.dialogueManager?.off?.('end.recuperationButtonsUnlock')
        this.experience.sound?.stopChannel?.(SceneRecuperationWorldConstants.RECUPERATION_AMBIENT_CHANNEL)
        this.experience.sound?.stopChannel?.(SceneRecuperationWorldConstants.RECUPERATION_WATER_AMBIENT_CHANNEL)
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

        if(this.cascadeTubes)
        {
            this.cascadeTubes.destroy?.()
            this.cascadeTubes = null
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
        this.isExitTeleportActive = false
        this.isReturningToMap = false
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        this.isSetUp = false
    }
}
