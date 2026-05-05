import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import MapLight from '../../Map/World/MapLight.js'
import SceneDistributionModel from './SceneDistributionModel.js'
import SceneDistributionValveController from './SceneDistributionValveController.js'
import SceneDistributionTubeWaterController from './SceneDistributionTubeWaterController.js'
import { setupSceneDistributionWorldDebug } from './SceneDistributionWorld.debug.js'

let distributionWorldInstanceIndex = 0

export default class SceneDistributionWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.distributionWorld${distributionWorldInstanceIndex++}`

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
    }

    setDebug()
    {
        setupSceneDistributionWorldDebug.call(this)
    }

    update(delta = this.experience.time.delta)
    {
        this.light?.update?.(delta)
        this.player?.update?.(delta)
        this.valveController?.update?.(delta)
        this.tubeWaterController?.update?.(delta)
    }

    destroy()
    {
        this.resources.off(this.readyEventName)
        this.valveController?.destroy?.()
        this.valveController = null
        this.tubeWaterController?.destroy?.()
        this.tubeWaterController = null

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

        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }
}
