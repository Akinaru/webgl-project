import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import MapLight from '../../Map/World/MapLight.js'
import SceneDistributionModel from './SceneDistributionModel.js'

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
            collisionBoxes: [],
            collisionMeshes: this.distributionModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.distributionModel.getGroundMeshes?.() ?? [],
            spawnPosition: this.distributionModel.getSpawnPosition?.(),
            spawnYaw: 0
        })
        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null,
            debugParentFolder: this.debugFolder
        })
    }

    setDebug()
    {
        if(!this.experience?.debug?.isDebugEnabled || this.debugFolder)
        {
            return
        }

        this.debugFolder = this.experience.debug.addFolder('📦 Distribution', { expanded: false })
    }

    update(delta = this.experience.time.delta)
    {
        this.light?.update?.(delta)
        this.player?.update?.(delta)
    }

    destroy()
    {
        this.resources.off(this.readyEventName)

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
