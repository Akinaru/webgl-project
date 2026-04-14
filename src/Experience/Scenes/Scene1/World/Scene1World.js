import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import Scene1Model from './Scene1Model.js'

let scene1WorldInstanceIndex = 0

export default class Scene1World
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.scene1World${scene1WorldInstanceIndex++}`

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

        this.environment = new MapEnvironment()
        this.scene1Model = new Scene1Model()

        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.scene1Model.getBoundaryRadius?.() ?? 48,
            collisionBoxes: this.scene1Model.getCollisionBoxes?.() ?? [],
            collisionMeshes: this.scene1Model.getCollisionMeshes?.() ?? [],
            groundMeshes: this.scene1Model.getGroundMeshes?.() ?? [],
            spawnPosition: this.scene1Model.getSpawnPosition?.(),
            spawnYaw: 0
        })
    }

    update(delta = this.experience.time.delta)
    {
        this.player?.update(delta)
    }

    destroy()
    {
        this.resources.off(this.readyEventName)

        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        if(this.scene1Model)
        {
            this.scene1Model.destroy?.()
            this.scene1Model = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        this.isSetUp = false
    }
}
