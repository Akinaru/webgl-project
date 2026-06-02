import * as THREE from 'three'
import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Characters/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import MapLight from '../../Map/World/MapLight.js'
import SceneDistributionModel from './Model.js'
import SceneDistributionValveController from './ValveController.js'
import SceneDistributionTubeWaterController from './TubeWaterController.js'
import SceneDistributionGaugeDisplay from './GaugeDisplay.js'
import SceneDistributionBalanceMonitor from './BalanceMonitor.js'
import SceneDistributionDoorController from './DoorController.js'
import SceneDistributionResultTrigger from './ResultTrigger.js'
import SceneDistributionResultDisplay from './ResultDisplay.js'
import SceneDistributionResultEndPrompt from './ResultEndPrompt.js'
import SceneDistributionScoring from './DistributionScoring.js'
import SceneDistributionWalls from './Walls/Walls.js'
import ValidationButton from './ValidationButton.js'
import { setupSceneDistributionWorldDebug } from './World.debug.js'
import * as SceneDistributionResultEndPromptConstants from './ResultEndPrompt.constants.js'
import * as SceneDistributionWorldConstants from './World.constants.js'

let distributionWorldInstanceIndex = 0
const DISTRIBUTION_AMBIENT_SOUND_KEY = 'distributionMusicResult'
const DISTRIBUTION_AMBIENT_CHANNEL = 'distributionAmbience'
const DISTRIBUTION_DIALOGUE_KEY = 'distribution'
const RESULT_DIALOGUE_KEY = 'resultat'
const DISTRIBUTION_COMPLETED_NODE_KEY = 'distribution_005'
const DISTRIBUTION_BLOOM_ROOM_END_TOKEN = 'room_end_2'
const DISTRIBUTION_BLOOM_DOOR_EXIT_TOKEN = 'door_exit'
const DISTRIBUTION_BLOOM_PATH_SPEED_SCALE = 0.28
const DISTRIBUTION_BLOOM_PATH_ARRIVAL_DISTANCE = 0.7
const DISTRIBUTION_DIALOGUE_PHASES = Object.freeze({
    COMPLETED: 'completed'
})

export default class SceneDistributionWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.distributionWorld${distributionWorldInstanceIndex++}`
        this.hasStartedResultSequence = false
        this.hasValidatedDistribution = false
        this.hasRequestedBloomToRoomEnd = false
        this.bloomPathStage = 'idle'
        this.bloomPathPreviousSpeed = null
        this.bloomPathArrivalDistanceSq = DISTRIBUTION_BLOOM_PATH_ARRIVAL_DISTANCE * DISTRIBUTION_BLOOM_PATH_ARRIVAL_DISTANCE
        this.bloomDoorExitTarget = null
        this.bloomRoomEndTarget = null
        this.resultEndPromptTimer = null
        this.onDistributionDialogueState = ({ dialogueKey, nodeId } = {}) =>
        {
            if(dialogueKey !== DISTRIBUTION_DIALOGUE_KEY || nodeId !== DISTRIBUTION_COMPLETED_NODE_KEY)
            {
                return
            }

            this.startBloomPathToRoomEndViaDoor()
        }
        this.onCompletedDistributionDialogueEnd = ({ key } = {}) =>
        {
            if(key !== DISTRIBUTION_DIALOGUE_KEY)
            {
                return
            }

            this.experience.dialogueManager?.off?.('end.distributionCompleted', this.onCompletedDistributionDialogueEnd)
            this.startResultDialogue()
        }
        this.experience.dialogueManager?.on?.('state.distributionBloomRoomEnd', this.onDistributionDialogueState)

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

    resolveDistributionTargetCenter(token)
    {
        const bounds = this.distributionModel?.getBoundsForNameTokens?.([token], { exact: true })
            ?? this.distributionModel?.getBoundsForNameTokens?.([token], { exact: false })
        return bounds?.getCenter?.(new THREE.Vector3()) ?? null
    }

    startBloomPathToRoomEndViaDoor()
    {
        if(this.hasRequestedBloomToRoomEnd)
        {
            return
        }

        const bloom = this.experience?.bloom
        const bloomFollow = bloom?.follow
        if(!bloom || !bloomFollow)
        {
            return
        }

        const doorExitCenter = this.resolveDistributionTargetCenter(DISTRIBUTION_BLOOM_DOOR_EXIT_TOKEN)
        const roomEndCenter = this.resolveDistributionTargetCenter(DISTRIBUTION_BLOOM_ROOM_END_TOKEN)
        if(!doorExitCenter || !roomEndCenter)
        {
            return
        }

        if(!this.bloomDoorExitTarget)
        {
            this.bloomDoorExitTarget = {
                position: new THREE.Vector3()
            }
        }
        if(!this.bloomRoomEndTarget)
        {
            this.bloomRoomEndTarget = {
                position: new THREE.Vector3()
            }
        }
        this.bloomDoorExitTarget.position.copy(doorExitCenter)
        this.bloomRoomEndTarget.position.set(roomEndCenter.x, roomEndCenter.y, roomEndCenter.z)

        if(this.bloomPathPreviousSpeed === null)
        {
            this.bloomPathPreviousSpeed = bloom.rails?.settings?.speed ?? null
        }
        if(Number.isFinite(this.bloomPathPreviousSpeed) && bloom.rails?.settings)
        {
            bloom.rails.settings.speed = Math.max(0.2, this.bloomPathPreviousSpeed * DISTRIBUTION_BLOOM_PATH_SPEED_SCALE)
        }

        bloomFollow.target = this.bloomDoorExitTarget
        bloomFollow.enabled = true
        bloom.clearFollowOverride?.()
        this.bloomPathStage = 'toDoor'
        this.hasRequestedBloomToRoomEnd = true
    }

    updateBloomPathToRoomEndViaDoor()
    {
        if(this.bloomPathStage !== 'toDoor' && this.bloomPathStage !== 'toEnd')
        {
            return
        }

        const bloom = this.experience?.bloom
        const bloomModel = bloom?.model
        const bloomFollow = bloom?.follow
        if(!bloomModel || !bloomFollow)
        {
            return
        }

        if(this.bloomPathStage === 'toDoor')
        {
            const distanceSqToDoor = bloomModel.position.distanceToSquared(this.bloomDoorExitTarget?.position ?? new THREE.Vector3())
            if(distanceSqToDoor <= this.bloomPathArrivalDistanceSq)
            {
                bloomFollow.target = this.bloomRoomEndTarget
                this.bloomPathStage = 'toEnd'
            }
            return
        }

        const distanceSqToEnd = bloomModel.position.distanceToSquared(this.bloomRoomEndTarget?.position ?? new THREE.Vector3())
        if(distanceSqToEnd > this.bloomPathArrivalDistanceSq)
        {
            return
        }

        if(Number.isFinite(this.bloomPathPreviousSpeed) && bloom.rails?.settings)
        {
            bloom.rails.settings.speed = this.bloomPathPreviousSpeed
        }
        this.bloomPathPreviousSpeed = null
        this.bloomPathStage = 'done'
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
        this.distributionModel = new SceneDistributionModel({
            debugParentFolder: this.debugFolder
        })
        this.walls = new SceneDistributionWalls({
            distributionModel: this.distributionModel,
            debugParentFolder: this.debugFolder
        })
        this.exitDoors = new SceneDistributionDoorController({
            distributionModel: this.distributionModel,
            debugParentFolder: this.debugFolder
        })
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.distributionModel.getBoundaryRadius?.() ?? 48,
            boundaryBox: this.distributionModel.getBoundaryBox?.() ?? null,
            collisionBoxes: this.distributionModel.getCollisionBoxes?.() ?? [],
            useBoxCollisionResolution: false,
            useMeshCollisionRaycast: true,
            collisionMeshes: this.distributionModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.distributionModel.getGroundMeshes?.() ?? [],
            spawnPosition: SceneDistributionWorldConstants.DISTRIBUTION_SPAWN_POSITION,
            spawnYaw: THREE.MathUtils.degToRad(SceneDistributionWorldConstants.DISTRIBUTION_SPAWN_YAW_DEG),
            spawnPitch: THREE.MathUtils.degToRad(SceneDistributionWorldConstants.DISTRIBUTION_SPAWN_PITCH_DEG)
        })
        this.valveController = new SceneDistributionValveController({
            experience: this.experience,
            valveMeshes: this.distributionModel.getVanneMeshes?.() ?? [],
            debugParentFolder: this.debugFolder
        })
        this.tubeWaterController = new SceneDistributionTubeWaterController({
            tubeWaterMeshes: this.distributionModel.getTubeWaterMeshes?.() ?? [],
            getRightTurnAmountForValve: (valveToken) => this.valveController?.getAccumulatedRightTurnRadiansForValve?.(valveToken) ?? 0,
            debug: this.experience.debug,
            debugParentFolder: this.debugFolder
        })
        this.balanceMonitor = new SceneDistributionBalanceMonitor({
            tubeWaterController: this.tubeWaterController,
            onSolvedChange: (isSolved) =>
            {
                // La porte ne s'ouvre plus toute seule
                // this.exitDoors?.setOpen?.(isSolved)
            }
        })
        this.gaugeDisplay = new SceneDistributionGaugeDisplay({
            distributionModel: this.distributionModel,
            debugParentFolder: this.debugFolder
        })
        this.resultDisplay = new SceneDistributionResultDisplay({
            distributionModel: this.distributionModel,
            debugParentFolder: this.debugFolder
        })
        this.resultEndPrompt = new SceneDistributionResultEndPrompt({
            onFinish: () =>
            {
                this.experience.menu?.endMenu?.open?.()
            }
        })
        this.scoring = new SceneDistributionScoring()
        this.validationButton = new ValidationButton({
            buttonMeshes: this.distributionModel.getMeshesForNameTokens?.(['button-buttonsimulation_1'], { exact: true }) ?? [],
            onValidate: () => this.handleValidation(),
            debugParentFolder: this.debugFolder
        })
        this.valveController?.setRotationConstraintResolver?.((valveToken, direction) =>
        {
            // Vérification de la limite individuelle du tuyau
            const canRotateIndividual = this.tubeWaterController?.canRotateValveDirection?.(valveToken, direction) ?? true
            if(!canRotateIndividual)
            {
                return false
            }

            // Si on essaie d'augmenter le débit (direction > 0)
            if(direction > 0)
            {
                const state = this.balanceMonitor?.getState()
                if(state && state.totalUsageUnits >= state.capacityLimit - 0.001)
                {
                    return false
                }
            }

            return true
        })
        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null,
            debugParentFolder: this.debugFolder
        })

        if(this.experience.bloom)
        {
            this.experience.bloom.setSceneContext({
                scene: this.experience.scene,
                groundMeshes: this.distributionModel.getGroundMeshes?.() ?? [],
                collisionMeshes: this.distributionModel.getCollisionMeshes?.() ?? [],
                rails: [],
                target: this.player
            })
        }

        this.resultTrigger = new SceneDistributionResultTrigger({
            distributionModel: this.distributionModel,
            player: this.player,
            debugParentFolder: this.debugFolder,
            onEnter: () => this.startResultSequence()
        })

        // Lancement du dialogue après un court délai
        setTimeout(() => {
            if(this.experience?.isAutoFlowEnabled?.() === false)
            {
                return
            }

            this.experience.dialogueManager?.startByKey?.('distribution')
        }, 2500)
    }

    startResultDialogue()
    {
        this.onResultDialogueEnd = ({ key, interrupted } = {}) =>
        {
            if(key !== RESULT_DIALOGUE_KEY || interrupted === true)
            {
                return
            }

            this.resultEndPromptTimer = window.setTimeout(() => {
                this.resultEndPromptTimer = null
                this.resultEndPrompt?.show?.()
            }, SceneDistributionResultEndPromptConstants.RESULT_END_PROMPT_FINISH_DELAY_MS)
            
            this.experience.dialogueManager?.off?.('end.distributionResult', this.onResultDialogueEnd)
        }

        this.experience.dialogueManager?.on?.('end.distributionResult', this.onResultDialogueEnd)
        this.experience.dialogueManager?.startByKey?.(RESULT_DIALOGUE_KEY)
    }

    setDebug()
    {
        setupSceneDistributionWorldDebug.call(this)
    }

    update(delta = this.experience.time.delta)
    {
        this.syncAmbientSound()
        this.exitDoors?.update?.(delta)
        this.light?.update?.(delta)
        this.player?.update?.(delta)
        this.valveController?.update?.(delta)
        this.tubeWaterController?.update?.(delta)
        this.balanceMonitor?.update?.()
        this.gaugeDisplay?.setState?.(this.balanceMonitor?.getState?.() ?? null)
        this.resultDisplay?.update?.(delta)
        this.resultTrigger?.update?.(delta)
        this.updateBloomPathToRoomEndViaDoor()
    }

    syncAmbientSound()
    {
        if(this.experience.sound?.isSoundPlaying?.(DISTRIBUTION_AMBIENT_SOUND_KEY))
        {
            return
        }

        this.experience.sound?.stopChannel?.('music')
        this.experience.sound?.play?.(DISTRIBUTION_AMBIENT_SOUND_KEY, {
            channel: 'music'
        })
    }

    handleValidation()
    {
        const state = this.balanceMonitor?.getState()
        if(!state)
        {
            return
        }

        // On ouvre la porte
        this.exitDoors?.setOpen?.(true)
        this.hasValidatedDistribution = true

        // On enregistre les scores à ce moment précis pour la répartition finale
        this.scoring?.applyFinalScoring(state)
        this.startResultSequence()

        console.log('[SceneDistributionWorld] Distribution validée, porte ouverte.')
    }

    startResultSequence()
    {
        if(this.hasStartedResultSequence)
        {
            return
        }

        if(this.hasValidatedDistribution !== true)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        this.hasStartedResultSequence = true
        this.experience.badgeManager?.unlock?.('distribution')
        this.experience.dialogueManager?.on?.('end.distributionCompleted', this.onCompletedDistributionDialogueEnd)
        this.experience.dialogueManager?.startByKey?.(DISTRIBUTION_DIALOGUE_KEY, {
            phase: DISTRIBUTION_DIALOGUE_PHASES.COMPLETED
        })
    }

    destroy()
    {
        if(Number.isFinite(this.bloomPathPreviousSpeed) && this.experience?.bloom?.rails?.settings)
        {
            this.experience.bloom.rails.settings.speed = this.bloomPathPreviousSpeed
        }
        this.bloomPathPreviousSpeed = null
        this.resources.off(this.readyEventName)
        this.experience.dialogueManager?.off?.('state.distributionBloomRoomEnd')
        this.experience.dialogueManager?.off?.('end.distributionCompleted')
        this.experience.dialogueManager?.off?.('end.distributionResult')
        if(this.resultEndPromptTimer !== null)
        {
            window.clearTimeout(this.resultEndPromptTimer)
            this.resultEndPromptTimer = null
        }
        this.valveController?.destroy?.()
        this.valveController = null
        this.tubeWaterController?.destroy?.()
        this.tubeWaterController = null
        this.balanceMonitor?.destroy?.()
        this.balanceMonitor = null
        this.gaugeDisplay?.destroy?.()
        this.gaugeDisplay = null
        this.resultDisplay?.destroy?.()
        this.resultDisplay = null
        this.resultEndPrompt?.destroy?.()
        this.resultEndPrompt = null
        this.resultTrigger?.destroy?.()
        this.resultTrigger = null
        this.validationButton?.destroy?.()
        this.validationButton = null
        this.exitDoors?.destroy?.()
        this.exitDoors = null

        this.walls?.destroy?.()
        this.walls = null

        if(this.player)
        {
            this.player.destroy?.()
            this.player = null
        }

        if(this.distributionModel)
        {
            this.distributionModel.destroy?.()
            this.distributionModel = null
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

        this.experience.sound?.stopChannel?.(DISTRIBUTION_AMBIENT_CHANNEL)

        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }
}
