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
import { setupSceneDistributionWorldDebug } from './World.debug.js'

let distributionWorldInstanceIndex = 0
const DISTRIBUTION_AMBIENT_SOUND_KEY = 'distributionMusicResult'
const DISTRIBUTION_AMBIENT_CHANNEL = 'distributionAmbience'

export default class SceneDistributionWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.distributionWorld${distributionWorldInstanceIndex++}`
        this.hasStartedResultSequence = false

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
        this.distributionModel = new SceneDistributionModel()
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
            spawnPosition: this.distributionModel.getSpawnPosition?.(),
            spawnYaw: 0
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
                this.exitDoors?.setOpen?.(isSolved)
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
        this.valveController?.setRotationConstraintResolver?.((valveToken, direction) =>
            this.tubeWaterController?.canRotateValveDirection?.(valveToken, direction) ?? true
        )
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
        this.resultTrigger?.update?.(delta)
    }

    syncAmbientSound()
    {
        if(this.experience.sound?.isChannelPlaying?.(DISTRIBUTION_AMBIENT_CHANNEL))
        {
            return
        }

        this.experience.sound?.play?.(DISTRIBUTION_AMBIENT_SOUND_KEY, {
            channel: DISTRIBUTION_AMBIENT_CHANNEL
        })
    }

    startResultSequence()
    {
        if(this.hasStartedResultSequence)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        this.hasStartedResultSequence = true
        this.experience.dialogueManager?.startByKey?.('resultat')
    }

    destroy()
    {
        this.resources.off(this.readyEventName)
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
        this.resultTrigger?.destroy?.()
        this.resultTrigger = null
        this.exitDoors?.destroy?.()
        this.exitDoors = null

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
