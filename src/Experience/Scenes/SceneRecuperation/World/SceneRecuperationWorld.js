import * as THREE from 'three'
import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import SceneEnum from '../../../Enum/SceneEnum.js'
import Player from '../../../Common/Player.js'
import MapLight from '../../Map/World/MapLight.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import SceneRecuperationModel from './SceneRecuperationModel.js'
import SceneRecuperationWater from './SceneRecuperationWater.js'
import Door from './Door.js'
import Materiau from './Materiau.js'
import Television from './Television.js'
import ShowerParticles from './ShowerParticles.js'
import SceneRecuperationWindTurbine from './SceneRecuperationWindTurbine.js'
import SceneRecuperationTubeWaterController from './SceneRecuperationTubeWaterController.js'
import { setupSceneRecuperationWorldDebug } from './SceneRecuperationWorld.debug.js'
import SceneRecuperationCollisionDebug from './SceneRecuperationCollisionDebug.js'
import SceneRecuperationCascadeTubes from './SceneRecuperationCascadeTubes.js'
import {
    EXIT_TELEPORT_INACTIVE_COLOR,
    FINAL_TUBE_MODULE_NAME
} from './SceneRecuperationWorld.constants.js'

let recuperationWorldInstanceIndex = 0

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
        this.environment = new MapEnvironment()
        this.recuperationModel = new SceneRecuperationModel({
            debugParentFolder: this.debugFolder
        })
        this.cascadeTubes = new SceneRecuperationCascadeTubes({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder
        })
        this.water = new SceneRecuperationWater({
            recuperationModel: this.recuperationModel,
            debugParentFolder: this.debugFolder
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
        this.showerParticles = new ShowerParticles({
            recuperationModel: this.recuperationModel
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
            debugParentFolder: this.debugFolder
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
            onSelectionChange: (selection) => this.handleMaterialSelection(selection)
        })

        this.television.setSelection(null)
        this.setRoom2FlowTrigger()
        this.setWallCrossTeleport()
        this.setExitTeleportActive(false)

        // Lancement du dialogue après un court délai
        setTimeout(() => {
            this.experience.dialogueManager?.startByKey?.('recuperation')
        }, 2500)
    }

    setDebug()
    {
        setupSceneRecuperationWorldDebug.call(this)
    }

    update(delta = this.experience.time.delta)
    {
        this.cascadeTubes?.update?.(delta)
        this.water?.update?.(delta)
        this.door?.update?.(delta)
        this.television?.update?.(delta)
        this.showerParticles?.update?.(delta)
        this.light?.update?.(delta)
        this.windTurbine?.update?.(delta)
        this.player?.update(delta)
        this.checkRoom2FlowTrigger()
        this.tubeWaterController?.update?.()
        this.collisionDebug?.update?.()
        this.materiau?.update(delta)
        this.updateMaterialTesting(delta)
        this.checkPuzzleCompletionReturn()
        this.updateWallCrossTeleportVisual()
        this.checkWallCrossTeleport()
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
    }

    stopMaterialTest()
    {
        this.isMaterialTestRunning = false
        this.materialTestElapsed = 0
        this.showerParticles?.stop?.()
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
        const result = this.buildMaterialTestResult(this.currentMaterialSelection)
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
    }

    setRoom2FlowTrigger()
    {
        const room2Bounds = this.recuperationModel?.getBoundsForNameTokens?.(['room2'], { exact: false })
            ?? this.recuperationModel?.getBoundsForNameTokens?.(['sol-room2'], { exact: false })
        if(!room2Bounds)
        {
            this.room2FlowTrigger = null
            this.hasStartedRoom2Flow = true
            return
        }

        this.room2FlowTrigger = room2Bounds.clone()
        this.hasStartedRoom2Flow = false
    }

    checkRoom2FlowTrigger()
    {
        if(this.hasStartedRoom2Flow || !this.room2FlowTrigger || !this.player?.position)
        {
            return
        }

        const position = this.player.position
        const margin = 0.05
        const isInsideRoom2 = (
            position.x >= (this.room2FlowTrigger.min.x - margin) &&
            position.x <= (this.room2FlowTrigger.max.x + margin) &&
            position.y >= (this.room2FlowTrigger.min.y - 2) &&
            position.y <= (this.room2FlowTrigger.max.y + 3) &&
            position.z >= (this.room2FlowTrigger.min.z - margin) &&
            position.z <= (this.room2FlowTrigger.max.z + margin)
        )
        if(!isInsideRoom2)
        {
            return
        }

        this.hasStartedRoom2Flow = true
        this.tubeWaterController?.startFlowAnimation?.()
    }

    checkPuzzleCompletionReturn()
    {
        if(this.isReturningToMap || !this.tubeWaterController)
        {
            return
        }

        const isComplete = this.tubeWaterController.isModuleFlowComplete?.(FINAL_TUBE_MODULE_NAME)
        if(!isComplete)
        {
            return
        }

        this.isReturningToMap = true
        this.experience.sceneManager?.switchTo?.(SceneEnum.MAP)
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
                color: EXIT_TELEPORT_INACTIVE_COLOR,
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
                color: EXIT_TELEPORT_INACTIVE_COLOR,
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
                color: EXIT_TELEPORT_INACTIVE_COLOR,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        )
        this.teleportVisualColumn.position.y = 0.95

        this.teleportVisualLight = new THREE.PointLight(EXIT_TELEPORT_INACTIVE_COLOR, 0.95, 7.5, 2)
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
        this.room2FlowTrigger = null
        this.hasStartedRoom2Flow = false
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
