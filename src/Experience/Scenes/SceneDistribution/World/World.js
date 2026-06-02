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
const DISTRIBUTION_HOLD_NODE_KEY = 'distribution_004'
const DISTRIBUTION_COMPLETED_NODE_KEY = 'distribution_005'
const DISTRIBUTION_BLOOM_DOOR_EXIT_TOKEN = 'door_exit'
const DISTRIBUTION_BLOOM_DOOR_END_TOKEN = 'door_end'
const DISTRIBUTION_BLOOM_PATH_SPEED_SCALE = 0.28
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
        this.bloomPathPreviousComfortDistance = null
        this.bloomPreviousGetTargetPosition = null
        this.bloomHoldPreviousRadius = null
        this.bloomHoldPreviousFollowEnabled = null
        this.bloomHoldStage = 'idle'
        this.bloomHoldArrivalDistanceSq = SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_HOLD_ARRIVAL_DISTANCE * SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_HOLD_ARRIVAL_DISTANCE
        this.bloomPathArrivalDistanceSq = SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_PATH_ARRIVAL_DISTANCE * SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_PATH_ARRIVAL_DISTANCE
        this.bloomHoldTarget = null
        this.bloomDoorExitTarget = null
        this.bloomRoomEndTarget = null
        this.resultEndPromptTimer = null
        this.isWaitingForResultDialogueAtDoorEnd = false
        this.distributionCompletedCameraFocusState = null
        this.hasPlayedDistributionCompletedCameraFocus = false
        this.onDistributionDialogueState = ({ dialogueKey, nodeId } = {}) =>
        {
            if(dialogueKey !== DISTRIBUTION_DIALOGUE_KEY)
            {
                return
            }

            if(nodeId === DISTRIBUTION_HOLD_NODE_KEY)
            {
                this.holdBloomForDistributionFinale()
                return
            }

            if(nodeId !== DISTRIBUTION_COMPLETED_NODE_KEY)
            {
                return
            }

            this.focusCameraTowardsDistributionDoorExit()
            this.startBloomPathToRoomEndViaDoor()
        }
        this.onCompletedDistributionDialogueEnd = ({ key } = {}) =>
        {
            if(key !== DISTRIBUTION_DIALOGUE_KEY)
            {
                return
            }

            this.experience.dialogueManager?.off?.('end.distributionCompleted', this.onCompletedDistributionDialogueEnd)
            this.isWaitingForResultDialogueAtDoorEnd = true
            this.tryStartResultDialogueAtDoorEnd()
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

    interpolateAngle(current, target, interpolation)
    {
        const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
        return current + (delta * interpolation)
    }

    setBloomAutomatedMovementTargetResolver(resolver)
    {
        const bloomFollow = this.experience?.bloom?.follow
        if(!bloomFollow)
        {
            return
        }

        if(this.bloomPreviousGetTargetPosition === null)
        {
            this.bloomPreviousGetTargetPosition = bloomFollow.getTargetPosition ?? null
        }

        bloomFollow.getTargetPosition = typeof resolver === 'function' ? resolver : null
    }

    restoreBloomAutomatedMovementTargetResolver()
    {
        const bloomFollow = this.experience?.bloom?.follow
        if(!bloomFollow)
        {
            this.bloomPreviousGetTargetPosition = null
            return
        }

        bloomFollow.getTargetPosition = this.bloomPreviousGetTargetPosition
        this.bloomPreviousGetTargetPosition = null
    }

    lockBloomInPlaceFacingPlayer()
    {
        const bloom = this.experience?.bloom
        const bloomFollow = bloom?.follow
        const bloomModel = bloom?.model ?? bloom?.fallback ?? null
        if(!bloomFollow || !bloomModel)
        {
            return
        }

        bloomFollow.target = this.player ?? bloomFollow.target
        bloomFollow.forceFacingTarget = true
        bloomFollow.enabled = true
        bloomFollow.getTargetPosition = () => bloomModel.position
    }

    isPlayerReadyForResultDialogue()
    {
        const playerPosition = this.player?.position
        if(!(playerPosition instanceof THREE.Vector3))
        {
            return false
        }
        return playerPosition.z > SceneDistributionWorldConstants.DISTRIBUTION_RESULT_PLAYER_MIN_Z
    }

    tryStartResultDialogueAtDoorEnd()
    {
        if(this.isWaitingForResultDialogueAtDoorEnd !== true)
        {
            return
        }

        if(!this.isPlayerReadyForResultDialogue())
        {
            return
        }

        this.isWaitingForResultDialogueAtDoorEnd = false
        this.startResultDialogue()
    }

    holdBloomForDistributionFinale()
    {
        const bloom = this.experience?.bloom
        if(!bloom)
        {
            return
        }

        if(this.bloomHoldPreviousRadius === null)
        {
            this.bloomHoldPreviousRadius = bloom.motion?.radius ?? null
        }
        if(this.bloomHoldPreviousFollowEnabled === null)
        {
            this.bloomHoldPreviousFollowEnabled = bloom.follow?.enabled ?? null
        }

        if(!this.bloomHoldTarget)
        {
            this.bloomHoldTarget = {
                position: new THREE.Vector3()
            }
        }
        this.bloomHoldTarget.position.set(
            SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_HOLD_POSITION.x,
            bloom.railAnchorPosition?.y ?? 0,
            SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_HOLD_POSITION.z
        )

        bloom.clearFollowOverride?.()
        if(bloom.motion)
        {
            bloom.motion.radius = 0
        }
        if(bloom.follow)
        {
            bloom.follow.comfortDistance = 0
            bloom.follow.forceFacingTarget = false
            bloom.follow.target = this.player ?? bloom.follow.target
            bloom.follow.enabled = true
        }
        this.setBloomAutomatedMovementTargetResolver(() => this.bloomHoldTarget?.position ?? null)
        this.bloomHoldStage = 'moving'
    }

    updateBloomHoldForDistributionFinale()
    {
        if(this.bloomHoldStage !== 'moving')
        {
            return
        }

        const bloom = this.experience?.bloom
        const bloomModel = bloom?.model ?? bloom?.fallback ?? null
        if(!bloom || !bloomModel)
        {
            return
        }

        const distanceSqToHold = bloomModel.position.distanceToSquared(this.bloomHoldTarget?.position ?? new THREE.Vector3())
        if(distanceSqToHold > this.bloomHoldArrivalDistanceSq)
        {
            return
        }

        if(bloom.follow)
        {
            this.restoreBloomAutomatedMovementTargetResolver()
            this.lockBloomInPlaceFacingPlayer()
        }
        this.bloomHoldStage = 'held'
    }

    focusCameraTowardsDistributionDoorExit()
    {
        if(this.hasPlayedDistributionCompletedCameraFocus)
        {
            return
        }

        const player = this.player
        const doorExitCenter = this.resolveDistributionTargetCenter(DISTRIBUTION_BLOOM_DOOR_EXIT_TOKEN)
        if(!player || !doorExitCenter)
        {
            return
        }

        const targetDirection = new THREE.Vector3().subVectors(doorExitCenter, player.position)
        const horizontalDistance = Math.hypot(targetDirection.x, targetDirection.z)
        if(horizontalDistance <= 1e-6 && Math.abs(targetDirection.y) <= 1e-6)
        {
            return
        }

        const targetYaw = Math.atan2(-targetDirection.x, -targetDirection.z)
        const unclampedPitch = -Math.atan2(targetDirection.y, Math.max(horizontalDistance, 1e-6))
        const targetPitch = THREE.MathUtils.clamp(
            unclampedPitch,
            player.settings?.minPitch ?? unclampedPitch,
            player.settings?.maxPitch ?? unclampedPitch
        )

        player.setLookEnabled?.(false)
        this.distributionCompletedCameraFocusState = {
            elapsedMs: 0,
            startYaw: player.yaw ?? 0,
            startPitch: player.pitch ?? 0,
            targetYaw,
            targetPitch
        }

        this.hasPlayedDistributionCompletedCameraFocus = true
    }

    updateDistributionCompletedCameraFocus(delta = this.experience.time.delta)
    {
        const focusState = this.distributionCompletedCameraFocusState
        const player = this.player
        if(!focusState || !player)
        {
            return
        }

        focusState.elapsedMs += Number.isFinite(delta) ? delta : 0

        const transitionDuration = Math.max(1, SceneDistributionWorldConstants.DISTRIBUTION_DOOR_EXIT_CAMERA_FOCUS_TRANSITION_MS)
        const transitionProgress = Math.min(1, focusState.elapsedMs / transitionDuration)
        const easedProgress = 1 - Math.pow(1 - transitionProgress, 3)

        const nextYaw = this.interpolateAngle(focusState.startYaw, focusState.targetYaw, easedProgress)
        const nextPitch = THREE.MathUtils.lerp(focusState.startPitch, focusState.targetPitch, easedProgress)

        player.yaw = nextYaw
        player.pitch = nextPitch
        player.cameraSmoothYaw = nextYaw
        player.cameraSmoothPitch = nextPitch
        player.camera.rotation.set(nextPitch, nextYaw, player.cameraSmoothRoll ?? 0)

        if(focusState.elapsedMs < SceneDistributionWorldConstants.DISTRIBUTION_DOOR_EXIT_CAMERA_FOCUS_DELAY_MS)
        {
            return
        }

        player.setLookEnabled?.(true)
        this.distributionCompletedCameraFocusState = null
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
        const doorEndCenter = this.resolveDistributionTargetCenter(DISTRIBUTION_BLOOM_DOOR_END_TOKEN)
        if(!doorExitCenter || !doorEndCenter)
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
        this.bloomRoomEndTarget.position.set(doorEndCenter.x, doorEndCenter.y, doorEndCenter.z)

        if(this.bloomPathPreviousSpeed === null)
        {
            this.bloomPathPreviousSpeed = bloom.rails?.settings?.speed ?? null
        }
        if(Number.isFinite(this.bloomPathPreviousSpeed) && bloom.rails?.settings)
        {
            bloom.rails.settings.speed = Math.max(0.2, this.bloomPathPreviousSpeed * DISTRIBUTION_BLOOM_PATH_SPEED_SCALE)
        }
        if(this.bloomPathPreviousComfortDistance === null)
        {
            this.bloomPathPreviousComfortDistance = bloom.follow?.comfortDistance ?? null
        }
        if(bloom.follow)
        {
            bloom.follow.comfortDistance = 0
            bloom.follow.target = this.player ?? bloom.follow.target
            bloom.follow.enabled = true
        }
        this.setBloomAutomatedMovementTargetResolver(() =>
        {
            if(this.bloomPathStage === 'toDoor')
            {
                return this.bloomDoorExitTarget?.position ?? null
            }

            if(this.bloomPathStage === 'toEnd')
            {
                return this.bloomRoomEndTarget?.position ?? null
            }

            return null
        })

        this.bloomHoldStage = 'done'
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
                bloomFollow.target = this.player ?? bloomFollow.target
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
        if(bloom.follow)
        {
            bloom.follow.comfortDistance = this.bloomPathPreviousComfortDistance ?? 1.8
        }
        this.restoreBloomAutomatedMovementTargetResolver()
        this.lockBloomInPlaceFacingPlayer()
        this.bloomPathPreviousComfortDistance = null
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
                collisionMeshes: this.distributionModel.getCollisionMeshesExcludingNameTokens?.(
                    SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_EXCLUDED_COLLISION_NAME_TOKENS
                ) ?? [],
                rails: [],
                target: this.player
            })
            this.experience.bloom.applyDebugTransform?.({
                positionX: SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_POSITION.x,
                positionY: SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_POSITION.y,
                positionZ: SceneDistributionWorldConstants.DISTRIBUTION_BLOOM_POSITION.z
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
        this.updateDistributionCompletedCameraFocus(delta)
        this.player?.update?.(delta)
        this.valveController?.update?.(delta)
        this.tubeWaterController?.update?.(delta)
        this.balanceMonitor?.update?.()
        this.gaugeDisplay?.setState?.(this.balanceMonitor?.getState?.() ?? null)
        this.resultDisplay?.update?.(delta)
        this.resultTrigger?.update?.(delta)
        this.updateBloomHoldForDistributionFinale()
        this.updateBloomPathToRoomEndViaDoor()
        this.tryStartResultDialogueAtDoorEnd()
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
        if(this.experience?.bloom?.follow)
        {
            this.restoreBloomAutomatedMovementTargetResolver()
            this.experience.bloom.follow.comfortDistance = this.bloomPathPreviousComfortDistance ?? this.experience.bloom.follow.comfortDistance
            this.experience.bloom.follow.forceFacingTarget = false
            this.experience.bloom.follow.target = this.player ?? this.experience.bloom.follow.target
            if(this.bloomHoldPreviousFollowEnabled !== null)
            {
                this.experience.bloom.follow.enabled = this.bloomHoldPreviousFollowEnabled
            }
        }
        this.bloomPathPreviousComfortDistance = null
        if(this.bloomHoldPreviousRadius !== null && this.experience?.bloom?.motion)
        {
            this.experience.bloom.motion.radius = this.bloomHoldPreviousRadius
        }
        this.bloomHoldPreviousRadius = null
        this.bloomHoldPreviousFollowEnabled = null
        this.bloomHoldStage = 'idle'
        this.resources.off(this.readyEventName)
        this.experience.dialogueManager?.off?.('state.distributionBloomRoomEnd')
        this.experience.dialogueManager?.off?.('end.distributionCompleted')
        this.experience.dialogueManager?.off?.('end.distributionResult')
        if(this.resultEndPromptTimer !== null)
        {
            window.clearTimeout(this.resultEndPromptTimer)
            this.resultEndPromptTimer = null
        }
        this.isWaitingForResultDialogueAtDoorEnd = false
        this.distributionCompletedCameraFocusState = null
        this.player?.setLookEnabled?.(true)
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
