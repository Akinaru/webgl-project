import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Player.js'
import MapEnvironment from './MapEnvironment.js'
import MapModel from './MapModel.js'

let mapWorldInstanceIndex = 0

export default class MapWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.mapWorld${mapWorldInstanceIndex++}`

        this.resources.on(this.readyEventName, () =>
        {
            this.setUp()
        })

        if(this.resources.isReady)
        {
            this.setUp()
        }
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.environment = new MapEnvironment()
        this.mapModel = new MapModel()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: 120,
            spawnPosition: { x: 0, y: 2, z: 12 },
            spawnYaw: Math.PI
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

        if(this.mapModel)
        {
            this.mapModel.destroy?.()
            this.mapModel = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        this.isSetUp = false
    }
}
